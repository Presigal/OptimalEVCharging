# Madrid EV Charging Site Optimization

Geospatial demand modeling and site-selection analysis for public EV charging infrastructure in Madrid, framed as a siting recommendation for a charge-point operator (CPO).

## Business Problem

Europe's EV charging shortage, at the national level, is largely solved: under the EU's Alternative Fuels Infrastructure Regulation (AFIR), 26 of 27 member states now exceed their fleet-based public charging capacity targets, with EU-wide capacity 180% above the mandatory minimum (Transport & Environment, July 2026). The remaining problem isn't *how many* chargers exist — it's *where* they are. Charging density is highly uneven within countries and cities, and national-level compliance figures mask serious local under- or over-provision.

This project answers a narrower, more useful question: **given a fixed capital budget for N new charging stations in Madrid, which neighborhoods maximize expected utilization?** This is the question a charge-point operator (e.g. Wenea, Ionity, Iberdrola) or an investor evaluating a CPO actually needs answered before deploying capital.

## Approach

1. **Spatial demand modeling** — estimate expected charging demand at the barrio (neighborhood) level using EV ownership, housing type, population density, and points-of-interest as predictors.
2. **Regression** — Poisson / negative binomial regression on session-count or proxy-demand targets, since charging usage is non-negative count-like data poorly suited to OLS.
3. **Geographically Weighted Regression (GWR)** — test whether predictor effects (e.g. "lack of private parking → demand") vary spatially across central vs. outer Madrid, rather than assuming one global coefficient.
4. **Suitability overlay** — combine predicted demand with existing charger coverage (competition/cannibalization) and land-use constraints in a weighted GIS overlay to rank candidate sites.
5. **Dashboard** — present ranked sites and coverage gaps as an interactive Power BI/Tableau dashboard, alongside static choropleth maps for the writeup.

## Data Sources

| Layer | Source | Notes |
|---|---|---|
| Existing charger locations, power output, connector type | [OpenChargeMap API](https://openchargemap.org/) | Cross-check against Ayuntamiento data for completeness |
| Municipal charger installations | [datos.madrid.es](https://datos.madrid.es) | Madrid open data portal |
| EV registrations | DGT / Ayuntamiento vehicle census | District or barrio level if available; province level as fallback |
| Income, dwelling type, household size | [INE](https://www.ine.es) (census-tract level) | % of dwellings without private garage is a key predictor |
| Population density, daytime population | INE | |
| POI density (retail, offices, transit) | OpenStreetMap (via `osmnx`) | |
| Traffic flow, parking zones (SER) | EMT Madrid / Ayuntamiento open data | |
| Grid substation capacity | *Not public* | See Limitations |
| Spatial boundaries | Ayuntamiento de Madrid (barrio/distrito shapefiles) | ~131 barrios, 21 distritos |

## Tech Stack

- **Data pipeline / storage:** Python, Snowflake
- **Feature engineering & regression:** `pandas`, `geopandas`, `statsmodels` (Poisson/NB), `mgwr` (GWR)
- **Spatial analysis / suitability overlay:** QGIS or ArcGIS Online
- **Visualization:** `folium` / `kepler.gl` for static/interactive maps, Power BI or Tableau for the candidate-site dashboard
- **Version control:** GitHub

## Repository Structure (planned)

```
madrid-ev-siting/
├── data/
│   ├── raw/                # untouched pulls from OpenChargeMap, INE, OSM, etc.
│   └── processed/          # barrio-level feature table
├── notebooks/
│   ├── 01_data_collection.ipynb
│   ├── 02_feature_engineering.ipynb
│   ├── 03_regression_poisson_nb.ipynb
│   ├── 04_gwr_analysis.ipynb
│   └── 05_suitability_overlay.ipynb
├── dashboard/               # Power BI / Tableau workbook
├── maps/                    # exported choropleths, candidate-site maps
├── report/                  # writeup / memo to a hypothetical CPO
└── README.md
```

## Deliverables

- [ ] Barrio-level feature dataset (EV density, housing type, income, POI density, existing chargers)
- [ ] Poisson/negative binomial regression model + diagnostics
- [ ] GWR coefficient maps showing spatial variation in demand drivers
- [ ] Weighted suitability overlay producing a demand-vs-supply gap map
- [ ] Ranked top-20 candidate sites with rationale
- [ ] Interactive dashboard (Power BI or Tableau)
- [ ] Short memo-style writeup framed as a recommendation to a CPO

## Limitations

- **Grid capacity** is not publicly available at the substation level in Madrid; existing high-power infrastructure (industrial zones, metro stations, large parking structures) is used as a rough proxy, and this is flagged as a gap a real deployment would need to close with DSO partnership.
- **Session-level usage data** is not fully public; demand is modeled primarily from proxy features (EV density × parking scarcity × POI traffic), validated where possible against any partial usage data that can be sourced.

## Author

Alejandro Céspedes Fernández — M.S. Statistics for Data Science, Universidad Carlos III de Madrid
