"""Export processed outputs to small JSON files for the static site in docs/.

Reads only data/processed/* and data/raw/ocm/ocm_chargers.csv.
Run from the repo root:  python scripts/export_web.py
"""
import json
import sys
from pathlib import Path

import geopandas as gpd
import numpy as np
import pandas as pd

ROOT = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(".")
PROC = ROOT / "data/processed"
OUT = Path(sys.argv[2]) if len(sys.argv) > 2 else ROOT / "docs/data"
OUT.mkdir(parents=True, exist_ok=True)

gdf = gpd.read_file(PROC / "features_municipal.gpkg")
zs = pd.read_csv(PROC / "zone_scores.csv")
pr = pd.read_csv(PROC / "model_predictions.csv")
for d in (gdf, zs, pr):
    d["ine_code"] = d["ine_code"].astype(int)

# ---- municipalities ---------------------------------------------------------
keep_feat = ["ine_code", "name", "area_km2", "population", "income_net_pp",
             "pop_density_km2", "ev_resident_est", "evs_per_1k_pop_adj",
             "public_sites", "public_points", "public_fast_sites", "private_sites",
             "public_points_per_10k_pop", "fuel_stations", "dist_nearest_public_km",
             "fleet_domicile_flag", "ev_cero", "geometry"]
keep_zs = ["ine_code", "eligible", "score", "rank", "rank_best", "rank_worst",
           "top20_in_scenarios", "evs_per_public_point",
           "pct_scarcity", "pct_missing", "pct_model", "pct_market",
           "pct_home_gap", "pct_sites"]
keep_pr = ["ine_code", "expected", "ratio_obs_exp", "p_shortfall", "gap_points", "group"]

m = (gdf[keep_feat].merge(zs[keep_zs], on="ine_code", how="left")
     .merge(pr[keep_pr], on="ine_code", how="left"))

# simplify in metres (EPSG:25830), then to WGS84
m["geometry"] = m.geometry.simplify(60, preserve_topology=True)
m = m.to_crs(4326)

rename = {"public_points_per_10k_pop": "pts_per_10k", "income_net_pp": "income_pp",
          "pop_density_km2": "density", "ev_resident_est": "evs_res",
          "evs_per_1k_pop_adj": "evs_per_1k", "dist_nearest_public_km": "dist_km",
          "fleet_domicile_flag": "fleet_flag", "evs_per_public_point": "evs_per_pt",
          "ratio_obs_exp": "ratio", "gap_points": "missing", "top20_in_scenarios": "top20_n"}
m = m.rename(columns=rename)


def clean(v):
    if isinstance(v, (bool, np.bool_)):
        return bool(v)
    if isinstance(v, (int, np.integer)):
        return int(v)
    if isinstance(v, (float, np.floating)):
        return None if np.isnan(v) else round(float(v), 4)
    return v


def round_coords(geom):
    def r(c):
        return [[round(x, 5), round(y, 5)] for x, y in c]
    gj = geom.__geo_interface__
    if gj["type"] == "Polygon":
        return {"type": "Polygon", "coordinates": [r(ring) for ring in gj["coordinates"]]}
    return {"type": "MultiPolygon",
            "coordinates": [[r(ring) for ring in poly] for poly in gj["coordinates"]]}


features = []
for _, row in m.iterrows():
    props = {k: clean(row[k]) for k in m.columns if k != "geometry"}
    features.append({"type": "Feature", "properties": props,
                     "geometry": round_coords(row.geometry)})
(OUT / "municipalities.geojson").write_text(
    json.dumps({"type": "FeatureCollection", "features": features},
               ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

# ---- chargers (clipped to the Comunidad) ------------------------------------
c = pd.read_csv(ROOT / "data/raw/ocm/ocm_chargers.csv")
cg = gpd.GeoDataFrame(c, geometry=gpd.points_from_xy(c.lon, c.lat), crs=4326)
cg = gpd.sjoin(cg, m[["ine_code", "geometry"]], predicate="within")
access_code = {"public": 0, "public_membership": 1, "restricted": 2}
rows = []
for _, r in cg.iterrows():
    rows.append([
        round(r.lat, 5), round(r.lon, 5),
        access_code.get(r.access_class, 3),
        int(r.n_points) if pd.notna(r.n_points) and r.n_points >= 1 else 1,
        None if pd.isna(r.max_power_kw) else round(float(r.max_power_kw), 1),
        None if pd.isna(r.is_operational) else bool(r.is_operational),
        (r.title or "")[:80] if isinstance(r.title, str) else "",
        r.operator if isinstance(r.operator, str) else "",
    ])
(OUT / "chargers.json").write_text(json.dumps({
    "fields": ["lat", "lon", "access", "points", "kw", "operational", "title", "operator"],
    "access_labels": ["Public, no membership", "Public, membership/app", "Private / customers only", "Unknown"],
    "rows": rows}, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

# ---- model coefficients -----------------------------------------------------
coef = pd.read_csv(PROC / "model_coefficients.csv").rename(columns={"Unnamed: 0": "term"})
coef = coef.rename(columns={coef.columns[0]: "term"})
(OUT / "model.json").write_text(json.dumps({
    "terms": [{k: clean(v) for k, v in rec.items()} for rec in coef.to_dict("records")],
}, separators=(",", ":")), encoding="utf-8")

print(f"municipalities: {len(features)}  chargers: {len(rows)}")
for f in OUT.iterdir():
    print(f"  {f.name}: {f.stat().st_size/1024:.0f} KB")
