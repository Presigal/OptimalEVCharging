# OptimalEVCharging: (Greater) Madrid

Geospatial demand modeling and site-selection analysis for public EV charging infrastructure in the Comunidad de Madrid, framed as a siting recommendation for a charge-point operator (CPO). Each municipality receives a 0-100 opportunity score and, in the profit layer (Tier 2), an estimated annual margin range (€) under stated assumptions.

**Status:** Tier 1 analysis complete (data, model, scores, top-20, maps). Power BI dashboard data is exported; the dashboard itself is in progress. Tier 2 (profit layer) is next.

## Business Problem

Europe's national-level charging shortage is largely solved. Under the EU's Alternative Fuels Infrastructure Regulation (AFIR), nearly every member state now exceeds its fleet-based public charging capacity target. The remaining problem is not how many chargers exist but where they are. National compliance figures mask local under- and over-provision, and a large share of the "charging locations" listed in open databases are private, customer-only, or membership-gated rather than usable by a driver who lives in an apartment with no private parking.

This project answers a narrower question: **given a fixed capital budget for N new public charging stations in Greater Madrid, which zones offer the best expected return, and how uncertain is that estimate?**

An early visual comparison of raw OpenChargeMap results against the public-only filter suggested supply is clustered in the affluent north-west corridor (Pozuelo, Majadahonda, Las Rozas) and thin in dense southern municipalities (Leganés, Getafe, Fuenlabrada, Alcorcón, Móstoles). Testing whether that pattern is statistically real, and what it means in euros, is the core of the project.

## Key Findings (Tier 1)

1. **1 in 4 listed charging locations is closed to the public.** Of 2,232 OpenChargeMap sites in the Comunidad, 25% are private or customer-only (554). Of the 75% usable by any driver, most require an operator app or card (1,413 sites, 63%); only 12% (264) are open with no membership.
2. **Raw DGT vehicle data badly misplaces EV demand.** DGT counts vehicles at the owner's tax address, so rental and leasing fleets registered in low road-tax villages and corporate hubs (e.g. Rozas de Puerto Real: 579 residents, 59,029 vehicles) distort the picture. 19 municipalities above 2× the median vehicles per resident hold **45% of all zero-emission-label vehicles** in the region. Resident EVs were re-estimated for them (see Data Notes).
3. **Charger counts are strongly overdispersed.** Pearson dispersion under Poisson is 12.4; the negative binomial model is clearly preferred (α ≈ 0.80, likelihood-ratio and AIC tests).
4. **Fuel-station density is the only robust predictor of public charging supply** (+48% points per resident per 1 SD, significant in every robustness variant). Income is borderline (+29%, p ≈ 0.06); income and EVs share the same "affluence" effect. Overall, fundamentals explain little of where chargers are: supply looks driven by operator decisions more than by local demand.
5. **The north-west vs south hypothesis is not supported at municipality level.** Relative to what similar municipalities have, the north-west corridor has 1.13× and the named southern municipalities 1.15× their expected public points. The real gaps are specific places, not "the south" as a block: Móstoles (0.70×), Parla (0.60×), San Fernando de Henares (0.28×), while Leganés (1.56×) and Alcorcón (1.51×) are above expectation.
6. **Madrid city has the largest absolute shortfall** (~3,660 public points vs ~4,560 expected, about 890 missing) but only a moderate relative one (0.80×). Locating that gap needs district-level analysis.

## Scope

- **Geography:** Comunidad de Madrid (179 municipalities), municipality-level unit of analysis
- **Perspective:** Memo to a charge-point operator deciding where to deploy new stations
- **Timeline:** About one month, solo

## Approach

1. **Data collection and cleaning** (`01`): gather chargers, boundaries, demographics, vehicle registrations and POIs. Dedupe chargers and classify access (public / membership / restricted).
2. **Feature engineering** (`02`): one row per municipality, joined on the 5-digit INE code, including the fleet-domicile correction of EV counts.
3. **Count regression** (`03`): Poisson and negative binomial (NB2) models of public charging points per municipality, with log(population) as offset. Includes the overdispersion test, incidence-rate ratios, VIF, residual diagnostics, Moran's I on residuals, and six robustness refits. The model gives each municipality an **expected** number of points: a peer benchmark of what similar municipalities have.
4. **Zone score** (`04`): a 0-100 opportunity score per municipality from six components (see Scoring Method), a ranked top-20 with rationale, a demand-vs-supply gap map, and a ranking stress test under five weightings.
5. **Profit scenario model** (`05`, Tier 2): map each zone's score to an estimated utilization, then compute revenue minus electricity, amortized installation, and operating costs under low / base / high scenarios.
6. **Sensitivity analysis** (`06`, Tier 2): show which assumptions drive the margin range most (tornado chart), which identifies the data an operator partner would most need to provide.
7. **Delivery:** static maps, a Power BI dashboard, and an interactive web map.

## Scoring Method

Each component is converted to a percentile among municipalities with at least 5,000 residents, then combined with a **weighted geometric mean** and rescaled to 0-100.

| Group | Component | Weight | Measures |
|---|---|---|---|
| Undersupply (0.60) | Scarcity | 0.25 | Resident EVs per public charging point |
| | Missing points | 0.20 | Absolute shortfall vs. the model's expectation |
| | Model gap | 0.15 | Observed / expected points (relative shortfall) |
| Demand (0.30) | Market size | 0.20 | Resident EVs (fleet-corrected) |
| | Home-charging gap | 0.10 | Population density (proxy for no private garage) |
| Feasibility (0.10) | Sites | 0.10 | Fuel stations as conversion candidates |

A plain weighted average was tried first and mostly reproduced population density (Spearman ρ = 0.76). The geometric mean requires a municipality to combine demand **and** undersupply, so size alone cannot make up for already being well served. Weights are judgement calls; the ranking is recomputed under equal, demand-heavy, gap-heavy and no-model weightings, and each top-20 candidate reports in how many of the five it stays in the top 20.

## Data Sources

| Layer | Source | Vintage | Notes |
|---|---|---|---|
| Charger locations, power, connectors, usage type | [OpenChargeMap API](https://openchargemap.org/) | pulled Sep 2026 | Tiled bounding-box queries with recursive splitting; deduped by ID; access classified from usage type |
| Municipal boundaries | OpenStreetMap, [Geofabrik Madrid extract](https://download.geofabrik.de/europe/spain/madrid.html) (`admin_level=8`) | 30 Sep 2026 | One boundary missing from the extract (Santa María de la Alameda) fetched from Nominatim |
| Population | [INE padrón, table 2881](https://www.ine.es/jaxiT3/Tabla.htm?t=2881) | 2025 | Master list of 179 municipalities |
| Income | [INE Atlas de Distribución de Renta, table 31097](https://www.ine.es/jaxiT3/Tabla.htm?t=31097) | 2023 | Net income per person and per household; median per consumption unit suppressed for 6 small municipalities |
| Vehicles by environmental label, driver census | [DGT Datos municipales](https://www.dgt.es/menusecundario/dgt-en-cifras/dgt-en-cifras-resultados/dgt-en-cifras-detalle/Datos-municipales-informacion-general-2025/) | 2025 | EV = "Distintivo 0" (CERO) label; total = sum of all five label columns |
| POIs: retail, offices, food, rail stations, parking, fuel stations | OpenStreetMap (Geofabrik extract, read with `osmium`) | 30 Sep 2026 | Reduced to points; counted per municipality |
| Electricity prices | Red Eléctrica REData / OMIE | — | Tier 2 |
| Hardware and installation costs | Public industry reports, subsidy program documents | — | Tier 2; ranges by charger type (AC, 50 kW, 150 kW DC) |
| Grid substation capacity | *Not public* | — | See Limitations |

## Data Notes

- **Fleet-domicile correction.** Municipalities with more than 2× the median vehicles per resident (cutoff ≈ 1,661 per 1,000) are flagged (`fleet_domicile_flag`). Driver counts there are normal, confirming the cars belong to fleets, not residents. For flagged municipalities, resident EVs (`ev_resident_est`) are predicted from a population-weighted model fitted on the rest: log(EV/pop) = −26.38 + 2.42·log(income) − 0.14·log(density). Models are re-run without these municipalities as a robustness check.
- **Public access.** "Public" includes membership networks (Iberdrola, Endesa, Repsol, EDP, etc.): anyone can sign up, so they count toward usable supply. Sites with no point count are counted as one point.
- **Parking proxy.** INE does not publish "% of dwellings without a private garage" for all municipalities (Census 2021 garage data covers only those above 50,000 residents), so population density is used as a proxy.
- **Transit.** OSM rail stations replace CRTM data; MITECO fuel stations are replaced by OSM `amenity=fuel` (the planned fallback).
- **Manual downloads.** INE, DGT and Geofabrik files are downloaded in a browser and placed in `data/raw/` (see Reproducing). Raw files are not committed.

## Tech Stack

- **Data pipeline:** Python (`pandas`, `geopandas`, `osmium`, `osmnx`, `requests`, `python-dotenv`)
- **Regression and statistics:** `statsmodels` (Poisson / NB2), `scipy`, `libpysal` / `esda` (Moran's I), `mgwr` (GWR, stretch goal)
- **Mapping:** `matplotlib`, `folium`; `topojson` for Power BI shapes
- **Dashboards and interactive app:** Power BI, plus Streamlit or Folium on GitHub Pages
- **Version control:** GitHub

## Repository Structure

```
OptimalEVCharging/
├── data/
│   ├── raw/                     # downloads: OCM, OSM .pbf, INE, DGT (not committed)
│   └── processed/               # features_municipal.csv/.gpkg, model_predictions.csv,
│                                #   model_coefficients.csv, zone_scores.csv
├── notebooks/
│   ├── 01_data_collection.ipynb
│   ├── 02_feature_engineering.ipynb
│   ├── 03_regression_poisson_nb.ipynb
│   ├── 04_zone_scoring.ipynb
│   ├── figures.ipynb            # descriptive charts for the report
│   ├── 05_profit_scenarios.ipynb       (Tier 2)
│   └── 06_sensitivity_analysis.ipynb   (Tier 2)
├── ocm_extract.py               # OpenChargeMap tiled download helpers
├── osm_extract.py               # OSM layer definitions and helpers
├── dashboard/
│   └── data/                    # Power BI tables: municipalities, chargers, scenario ranks, TopoJSON
├── app/                         # interactive web map (Tier 3)
├── maps/                        # exported charts and maps
├── report/                      # top-20 candidates (.md / .xlsx), memo-style writeup
├── .env.example                 # OCM_API_KEY=
└── README.md
```

## Reproducing

1. **Environment:** `pip install pandas geopandas osmnx osmium statsmodels scipy matplotlib folium mapclassify python-dotenv openpyxl topojson libpysal esda`
2. **API key:** create a free OpenChargeMap key and save it in `.env` as `OCM_API_KEY=...` (see `.env.example`; `.env` is git-ignored).
3. **Manual downloads** into `data/raw/`:
   - `osm/madrid-<date>.osm.pbf` from [Geofabrik](https://download.geofabrik.de/europe/spain/madrid-latest.osm.pbf)
   - `ine/ine_population_2881.csv` from [INE 2881](https://www.ine.es/jaxiT3/files/t/es/csv_bdsc/2881.csv?nocab=1)
   - `ine/ine_adrh_renta_31097.csv` from [INE 31097](https://www.ine.es/jaxiT3/files/t/es/csv_bdsc/31097.csv?nocab=1)
   - `dgt/DatosMunicipalesGeneral_2025.xlsx` from [DGT](https://www.dgt.es/export/sites/web-DGT/.galleries/downloads/dgt-en-cifras/informacion_municipal/Datos-municipales-general/DatosMunicipalesGeneral_2025.xlsx)
4. **Run the notebooks in order** (`01` → `04`, then `figures`). Each reads only the files written by the previous ones.

## Deliverables and Priorities

**Tier 1: core**
- [x] Municipality-level feature dataset (EV density, housing proxy, income, POI density, existing public chargers)
- [x] Chart: share of listed OpenChargeMap locations that are actually public
- [x] Poisson / negative binomial model with dispersion check and diagnostics
- [x] Zone opportunity scores (0-100) and a demand-vs-supply gap map
- [x] Ranked top-20 candidate zones with short rationale
- [ ] Power BI dashboard (ranked zones, one map, one or two charts): data export done, report in progress

**Tier 2: profit layer**
- [ ] Profit scenario model with low / base / high margin ranges per zone
- [ ] Sensitivity analysis (tornado chart)

**Tier 3: stretch**
- [ ] Interactive web map with sliders for electricity price and utilization
- [ ] Geographically Weighted Regression (GWR) coefficient maps
- [ ] Road-network distance to nearest charger (`osmnx` / `networkx`)
- [ ] Back-test the score weights against where operators actually built in 2025-2026 (OCM creation dates)

**Cut first if behind schedule:** GWR, road-network distance, interactive sliders.

## Additional Plans to Consider

### 1. Gas station comparison layer
Gas stations are a mature, demand-driven network, which makes them a useful benchmark and a source of candidate sites.
- **Benchmark ratio:** gas stations per 1,000 drivers (`fuel_per_1k_drivers`, which avoids the fleet distortion in vehicle counts) and public chargers per 1,000 resident EVs per municipality. Large gaps between the two ratios are a first-pass underservice signal. This is a comparison point, not a target, since EV drivers also charge at home and at work.
- **Regression predictor:** confirmed. Gas station density is the strongest and most robust predictor of public charging supply in `03`, consistent with it proxying traffic exposure, commercial zoning, available land and grid connections.
- **Candidate sites:** existing stations already have land, permits, traffic, and often a strong electrical connection. Fuel stations enter the opportunity score as the "sites" component; flagging individual stations in high-score zones as conversion candidates is a next step.
- **Residual analysis:** charger and gas station density correlate positively because both follow roads and commerce. The more informative output is the residual: municipalities where charger supply falls well below what gas station density predicts.

### 2. Break-even utilization analysis
For each zone and charger type, estimate how much use a station needs before it earns back its cost.
- **Break-even utilization:** the share of hours a charger must be in use, or equivalently the number of charging sessions per day, at which annual revenue covers electricity, operating costs, and amortized hardware and installation.
- **Payback period:** years to recover the investment at the zone's estimated utilization under low / base / high scenarios.
- **Comparison to estimated demand:** for each zone, compare break-even utilization against the model's predicted utilization. Zones where predicted utilization clears break-even under the base scenario are strong candidates. Zones that clear it only under the high scenario are risky, and the map should show that distinction.
- **Sensitivity:** vary the selling price per kWh, electricity cost, charger power, and installation cost to see how sensitive break-even is to each.
- **Framing:** this analysis is a test of the investment case, not an assumed conclusion. If break-even utilization is far above what the model predicts in most zones, that is a finding too, and it points to where subsidies or lower-cost hardware would change the answer.

## Limitations

- **No session data.** Public sources do not expose per-charger usage, so demand is modeled from proxy features and utilization is a scenario assumption. Access to an operator's session logs would replace the largest assumption in the model and tighten the profit ranges. The sensitivity analysis is designed to show exactly how much.
- **Peer benchmark, not true demand.** The model's "expected" points describe what similar municipalities in the Comunidad have. A region-wide shortage would be invisible to it.
- **Low explanatory power.** Fundamentals explain little of where public chargers are (NB pseudo-R² ≈ 0.03), and no single municipality's shortfall is statistically certain. Scores are a screening tool, and the top-20 is reported with its robustness across weightings.
- **Fleet-domicile distortion.** DGT vehicle counts follow tax addresses. The correction handles the 19 most extreme municipalities, but large corporate hubs below the cutoff, including Madrid city, may still carry some fleet vehicles.
- **Coverage of OpenChargeMap.** OCM is crowdsourced; recently opened sites may be missing. Cross-checking against the national access point (NAP, [nap.dgt.es](https://nap.dgt.es)) is a planned validation.
- **No substation capacity.** Grid connection capacity and upgrade costs are not public. Proximity to high-power infrastructure (industrial zones, metro stations, large car parks) or gas stations serves as a rough proxy, and grid cost is treated as an adjustable assumption.
- **Municipality-level resolution.** Large municipalities, including Madrid city itself, contain very different neighborhoods. Results are a screening tool for where to look first, not a substitute for site-level surveys.
- **Estimates, not forecasts.** Profit figures are scenario ranges under stated assumptions, not predictions.

## Author

Alejandro Céspedes Fernández, M.S. Statistics for Data Science, Universidad Carlos III de Madrid
