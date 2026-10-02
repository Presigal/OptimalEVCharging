"""
OpenChargeMap extraction for Madrid.

Pulls every charging POI inside a bounding box by tiling the area and
recursively splitting any tile that hits the result cap, then dedupes,
flattens, and tags each POI as public / restricted / unknown.

Setup:
    pip install requests pandas geopandas shapely
    export OCM_API_KEY="your-key"   # free: sign in at openchargemap.org -> My Profile -> API keys

Outputs (data/raw/ocm/):
    referencedata.json      lookup tables (usage types, status types, operators, connectors)
    ocm_raw.json            deduped raw POIs, untouched
    ocm_chargers.csv        one row per site, flattened, with access_class
"""

import json
import os
import time
from pathlib import Path

import pandas as pd
import requests

API = "https://api.openchargemap.io/v3"
KEY = os.environ["OCM_API_KEY"]
HEADERS = {"X-API-Key": KEY, "User-Agent": "OptimalEVCharging (academic project)"}
OUT = Path("data/raw/ocm")
OUT.mkdir(parents=True, exist_ok=True)

# (min_lat, min_lon, max_lat, max_lon)
BBOX_COMUNIDAD = (39.88, -4.58, 41.17, -3.05)   # whole Comunidad de Madrid
BBOX_CITY = (40.31, -3.89, 40.64, -3.52)        # Madrid municipality only

MAX_RESULTS = 1000   # per request; tiles that return this many get split
MIN_TILE_DEG = 0.01  # stop splitting below ~1 km
PAUSE_S = 1.0        # be polite: OCM is a volunteer-run service


def get(path, **params):
    r = requests.get(f"{API}/{path}/", headers=HEADERS,
                     params={"output": "json", **params}, timeout=60)
    r.raise_for_status()
    return r.json()


def fetch_tile(bbox):
    min_lat, min_lon, max_lat, max_lon = bbox
    time.sleep(PAUSE_S)
    return get("poi",
               boundingbox=f"({min_lat},{min_lon}),({max_lat},{max_lon})",
               maxresults=MAX_RESULTS, compact="true", verbose="false")


def fetch_recursive(bbox, depth=0):
    """Fetch a tile; if it is saturated, split into 4 and recurse."""
    pois = fetch_tile(bbox)
    min_lat, min_lon, max_lat, max_lon = bbox
    print(f"{'  ' * depth}{bbox} -> {len(pois)}")
    if len(pois) < MAX_RESULTS or (max_lat - min_lat) < MIN_TILE_DEG:
        return pois
    mid_lat, mid_lon = (min_lat + max_lat) / 2, (min_lon + max_lon) / 2
    out = []
    for sub in [(min_lat, min_lon, mid_lat, mid_lon), (min_lat, mid_lon, mid_lat, max_lon),
                (mid_lat, min_lon, max_lat, mid_lon), (mid_lat, mid_lon, max_lat, max_lon)]:
        out += fetch_recursive(sub, depth + 1)
    return out


def grid(bbox, step=0.1):
    min_lat, min_lon, max_lat, max_lon = bbox
    lat = min_lat
    while lat < max_lat:
        lon = min_lon
        while lon < max_lon:
            yield (round(lat, 4), round(lon, 4),
                   round(min(lat + step, max_lat), 4), round(min(lon + step, max_lon), 4))
            lon += step
        lat += step


def flatten(poi, usage, status):
    addr = poi.get("AddressInfo") or {}
    conns = poi.get("Connections") or []
    powers = [c.get("PowerKW") for c in conns if c.get("PowerKW")]
    uid = poi.get("UsageTypeID")
    sid = poi.get("StatusTypeID")
    return {
        "ocm_id": poi.get("ID"),
        "uuid": poi.get("UUID"),
        "lat": addr.get("Latitude"),
        "lon": addr.get("Longitude"),
        "title": addr.get("Title"),
        "town": addr.get("Town"),
        "postcode": addr.get("Postcode"),
        "operator_id": poi.get("OperatorID"),
        "usage_type_id": uid,
        "usage_type": usage.get(uid, {}).get("Title"),
        "is_membership_required": usage.get(uid, {}).get("IsMembershipRequired"),
        "status_type_id": sid,
        "is_operational": status.get(sid, {}).get("IsOperational"),
        "n_points": poi.get("NumberOfPoints"),
        "n_connections": len(conns),
        "max_power_kw": max(powers) if powers else None,
        "connection_type_ids": ",".join(str(c.get("ConnectionTypeID")) for c in conns),
        "data_provider_id": poi.get("DataProviderID"),
        "date_last_verified": poi.get("DateLastVerified"),
        "date_last_status_update": poi.get("DateLastStatusUpdate"),
    }


def access_class(row):
    """Coarse access label. Check the usage-type titles in referencedata.json
    before trusting this mapping; OCM's list can change."""
    title = (row["usage_type"] or "").lower()
    if not title or "unknown" in title:
        return "unknown"
    if title.startswith("private") or "staff" in title or "customers" in title:
        return "restricted"
    if row["is_membership_required"]:
        return "public_membership"
    return "public"


if __name__ == "__main__":
    bbox = BBOX_COMUNIDAD   # switch to BBOX_CITY for Madrid municipality only

    ref = get("referencedata")
    (OUT / "referencedata.json").write_text(json.dumps(ref, ensure_ascii=False, indent=1))
    usage = {u["ID"]: u for u in ref["UsageTypes"]}
    status = {s["ID"]: s for s in ref["StatusTypes"]}
    print("Usage types:", {k: v["Title"] for k, v in usage.items()})

    pois = []
    for tile in grid(bbox):
        pois += fetch_recursive(tile)

    deduped = {p["ID"]: p for p in pois}   # tiles share edges, so duplicates are expected
    print(f"{len(pois)} fetched, {len(deduped)} unique")
    (OUT / "ocm_raw.json").write_text(json.dumps(list(deduped.values()), ensure_ascii=False))

    df = pd.DataFrame(flatten(p, usage, status) for p in deduped.values())
    df["access_class"] = df.apply(access_class, axis=1)
    df.to_csv(OUT / "ocm_chargers.csv", index=False)

    print(df["access_class"].value_counts(dropna=False))
    print(df["is_operational"].value_counts(dropna=False))

    # Next step (02_feature_engineering): spatial-join to municipality polygons, e.g.
    #   import geopandas as gpd
    #   pts = gpd.GeoDataFrame(df, geometry=gpd.points_from_xy(df.lon, df.lat), crs=4326)
    #   munis = gpd.read_file("data/raw/boundaries/municipios.shp").to_crs(4326)
    #   pts = gpd.sjoin(pts, munis, predicate="within", how="inner")
