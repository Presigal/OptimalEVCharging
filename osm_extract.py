"""
OpenStreetMap extraction for Madrid with osmnx (>= 2.0).

Pulls the POI layers the demand model needs, reduces every feature to a
point, and saves one GeoPackage with a layer per theme.

Setup:
    pip install osmnx geopandas

Outputs (data/raw/osm/):
    osm_pois.gpkg    layers: charging, fuel, retail, office, food, transit, parking
    boundary.gpkg    the study-area polygon osmnx resolved
"""

from pathlib import Path

import geopandas as gpd
import osmnx as ox
import pandas as pd

OUT = Path("data/raw/osm")
OUT.mkdir(parents=True, exist_ok=True)

ox.settings.use_cache = True          # re-runs hit the local cache, not Overpass
ox.settings.log_console = True
ox.settings.requests_timeout = 600

PLACE = "Comunidad de Madrid, España"   # or "Madrid, Comunidad de Madrid, España" for the city
CRS_METRIC = 25830                      # ETRS89 / UTM 30N, the standard projected CRS for Madrid

# One entry per layer. Keep tags narrow: broad queries on a region this size are slow.
LAYERS = {
    "charging": {"amenity": "charging_station"},     # cross-check against OCM; has access=* tags
    "fuel":     {"amenity": "fuel"},                 # gas station comparison layer
    "retail":   {"shop": ["supermarket", "mall", "department_store", "convenience", "doityourself"]},
    "office":   {"office": True},
    "food":     {"amenity": ["restaurant", "cafe", "fast_food"]},
    "transit":  {"railway": ["station", "halt"], "public_transport": "station"},
    "parking":  {"amenity": "parking"},
}

KEEP_COLS = ["name", "amenity", "shop", "office", "railway", "public_transport",
             "access", "operator", "brand", "capacity", "parking", "socket:type2",
             "socket:ccs", "capacity:charging"]


def to_points(gdf):
    """Polygons -> representative points, computed in a metric CRS."""
    gdf = gdf.to_crs(CRS_METRIC)
    gdf["geometry"] = gdf.geometry.representative_point()
    return gdf


if __name__ == "__main__":
    boundary = ox.geocode_to_gdf(PLACE)
    boundary.to_file(OUT / "boundary.gpkg")
    polygon = boundary.geometry.iloc[0]

    for layer, tags in LAYERS.items():
        print(f"Fetching {layer} {tags}")
        try:
            gdf = ox.features_from_polygon(polygon, tags)
        except ox._errors.InsufficientResponseError:
            print(f"  no features for {layer}")
            continue
        gdf = gdf.reset_index()   # index is (element, id); keep both for dedup/traceability
        cols = ["element", "id"] + [c for c in KEEP_COLS if c in gdf.columns] + ["geometry"]
        gdf = to_points(gdf[cols])
        gdf.to_file(OUT / "osm_pois.gpkg", layer=layer)
        print(f"  saved {len(gdf)} features")

    # Quick look at how OSM tags charger access (useful for the 'actually public' chart)
    chg = gpd.read_file(OUT / "osm_pois.gpkg", layer="charging")
    if "access" in chg.columns:
        print(chg["access"].value_counts(dropna=False))
