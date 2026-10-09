# OptimalEVCharging: (Greater) Madrid

Geospatial demand modeling and site-selection analysis for public EV charging infrastructure in the Comunidad de Madrid, framed as a siting recommendation for a charge-point operator (CPO). Each municipality receives a 0-100 opportunity score and, in the profit layer (Tier 2), an estimated annual margin range (€) under stated assumptions.

**Status:** Tier 1 analysis complete (data, model, scores, top-20, maps). Tier 2 profit layer complete (scenario model, Monte Carlo ranges, break-even test, tornado and value-of-information analysis). Power BI dashboard data is exported; the dashboard itself is in progress.

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

## Key Findings (Tier 2: profit layer)

Unit: one new public charger in a zone, steady state, EUR excluding VAT. "Margin" is the annual equivalent of NPV after the cost of capital, so a positive margin means the charger earns back its investment at the required return.

1. **In the base case, no zone clears break-even for any charger type.** A DC 150 kW charger needs about **12% utilization** (≈ 3 hours of charging a day) to earn its cost of capital; the best-scored zone, San Fernando de Henares, is expected to reach 10.5%, and the median scored zone 5.7%. This matches the ~15% network utilization often cited as the viability threshold, against 2-8% typically observed in Europe.
2. **The best zones are close, not far.** For San Fernando de Henares, any one of these alone flips the base case to break-even: utilization +14% (10.5% → 12.0%), selling price +10% (€0.59 → €0.65/kWh), capex −21% (€110k → €87k), a 21% capex subsidy, or electricity cost −33%.
3. **With assumptions varying independently (Monte Carlo), the top three zones have a 30-39% chance of clearing their cost of capital** (San Fernando de Henares 39%, Boadilla del Monte 35%, Pozuelo de Alarcón 30%). No zone reaches 50%. Madrid city sits at 19%: large demand, but a moderate relative shortfall.
4. **Charger type should follow zone size.** In 34 of 83 scored zones a DC 150 kW charger would sell more than local resident EVs can buy; there a DC 50 kW unit has the better odds (best type: DC 50 kW in 44 zones, DC 150 kW in 33, AC in 6). AC posts lose less in absolute euros only because they cost less; per euro invested they are the weakest option.
5. **Utilization is the decisive unknown.** It produces the widest tornado bar (−€13k to +€10k a year around a −€3.4k base) and about half of the Monte Carlo variance. Knowing the session-related inputs exactly would cut the P10-P90 margin range by **47%**; selling price and fees by 7%, site and hardware quotes by 5%, the energy contract by 2%. The ordering is the same for a 20-charger portfolio across the top-20 zones (rank correlation 0.97).
6. **Implication for an operator partner:** the opportunity score ranks zones consistently (Spearman 0.81 between score and probability of profit), but whether the best zones are investable is a question about utilization, which only session logs from comparable sites can answer. Without them, a subsidy or a sub-€90k installed cost is what turns the top three zones positive.

## Scope

- **Geography:** Comunidad de Madrid (179 municipalities), municipality-level unit of analysis
- **Perspective:** Memo to a charge-point operator deciding where to deploy new stations
- **Timeline:** About one month, solo

## Approach

1. **Data collection and cleaning** (`01`): gather chargers, boundaries, demographics, vehicle registrations and POIs. Dedupe chargers and classify access (public / membership / restricted).
2. **Feature engineering** (`02`): one row per municipality, joined on the 5-digit INE code, including the fleet-domicile correction of EV counts.
3. **Count regression** (`03`): Poisson and negative binomial (NB2) models of public charging points per municipality, with log(population) as offset. Includes the overdispersion test, incidence-rate ratios, VIF, residual diagnostics, Moran's I on residuals, and six robustness refits. The model gives each municipality an **expected** number of points: a peer benchmark of what similar municipalities have.
4. **Zone score** (`04`): a 0-100 opportunity score per municipality from six components (see Scoring Method), a ranked top-20 with rationale, a demand-vs-supply gap map, and a ranking stress test under five weightings.
5. **Profit scenario model** (`05`, Tier 2): map each zone's score to an estimated utilization, then compute revenue minus electricity, fees, fixed power charge, opex and capital cost under low / base / high scenarios and a Monte Carlo, for three charger types. Includes the break-even utilization test and payback.
6. **Sensitivity analysis** (`06`, Tier 2): tornado chart, Monte Carlo variance shares, value of information by data source, and the change in each lever that flips the base case.
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

## Profit Model (Tier 2)

All logic is in `profit_model.py`; notebooks `05` and `06` call it.

```
utilization  = base_util[type] × (1 + e·(score − 50)/50)            e = 0.5 in the base case
energy (yr1) = min(8760 × utilization × avg_kW,                       what the charger can sell
                   capture × resident EVs × kWh/EV × public share)    what local residents can buy
cash flow_t  = energy_t × [price/1.21 × (1 − fees) − electricity/(1 − losses)] − kW × power charge − opex
energy_t     = energy_1 × (1 + demand growth)^(t−1)
NPV          = −capex × (1 − subsidy) + Σ cash flow_t / (1 + r)^t   over the asset life
margin       = NPV × annuity factor (annual-equivalent, after cost of capital)
```

| Assumption | Low | Base | High | Basis | Source |
|---|---|---|---|---|---|
| Utilization, DC (share of hours charging, at score 50) | 4% | 7% | 11% | derived | EU public chargers 2-8% of hours ([motorpasion](https://www.motorpasion.com/coches-electricos/problema-fantasma-cargadores-publicos-no-faltan-puntos-carga-faltan-coches-electricos-que-usen-dicen-estos-expertos/amp)); ~15% viability threshold ([CWIEME](https://berlin.cwiemeevents.com/articles/revolutionising-public-charging-in-europe-the)) |
| Utilization, AC (share of hours plugged in) | 8% | 12% | 18% | judgement | Long kerbside sessions; not comparable with the DC benchmark |
| Average delivered power, DC 150 / DC 50 / AC | 55 / 30 / 5 kW | 70 / 36 / 6.5 | 85 / 42 / 8 | judgement | Charging-curve taper, idle time |
| Selling price incl. VAT, DC 150 / DC 50 / AC | 0.52 / 0.45 / 0.39 | 0.59 / 0.52 / 0.45 | 0.69 / 0.59 / 0.52 €/kWh | cited | Spain 2026 public prices ([electromovilidad24](https://www.electromovilidad24.com/articulos/cargar-casa-vs-supercargadores-coste-real-2026.html), [motor16](https://www.motor16.com/las-ultimas-noticias/ionity-subida-precios-2026/)) |
| Capex per charger, DC 150 / DC 50 / AC | 150k / 60k / 14k | 110k / 45k / 10k | 80k / 32k / 7k € | derived | [ICCT 2019](https://theicct.org/wp-content/uploads/2021/06/ICCT_EV_Charging_Cost_20190813.pdf), single-charger US site, 2019 USD: ~$123k (150 kW), ~$74k (50 kW), ~$6-7k (AC). DC 50 base assumes a shared multi-charger site and is likely optimistic |
| Opex per charger per year, DC 150 / DC 50 / AC | 8k / 4.5k / 1.5k | 6k / 3.5k / 1k | 4.5k / 2.5k / 0.7k € | judgement | Maintenance, software, SIM, insurance, site |
| Electricity cost, variable all-in | 0.16 | 0.13 | 0.10 €/kWh | derived | Wholesale €65.5/MWh in 2025, ~€55 futures for 2026 ([energias-renovables](https://www.energias-renovables.com/panorama/el-precio-de-la-electricidad-en-espa-20260107)), plus tolls, charges, tax and supplier margin (not sourced) |
| Fixed power charge | 45 | 30 | 15 €/kW/yr | judgement | 3.0TD / 6.1TD power term; **not yet checked against CNMC tolls** |
| Payment / roaming fees | 12% | 8% | 4% | judgement | Share of revenue |
| Capex subsidy | 0% | 0% | 30% | judgement | 2026 support for CPO public chargers unconfirmed ([Mapfre, Plan MOVES 2026](https://www.motor.mapfre.es/coches/noticias-coches/plan-moves/)) |
| Discount rate / lifetime | 10% / 8 yr | 8% / 10 yr | 6% / 12 yr | judgement | Infrastructure WACC, depreciation life |
| Net demand growth per charger | 0% | 4% | 8% per yr | derived | Spain public points +37% in 2025 to 53,072 (ANFAC barometer via [hibridosyelectricos](https://www.hibridosyelectricos.com/coches/37-mas-en-ano-espana-ya-cuenta-con-53072-puntos-recarga-coches-electricos_84515_102.html); primary report not reviewed), so new supply absorbs much of fleet growth |
| Score → utilization slope (e) | 0.25 | 0.50 | 0.75 | judgement | Not estimated; tested in `06` |
| Demand cap: kWh per EV, public share, capture | 2,200, 20%, 10% | 2,500, 25%, 20% | 2,800, 35%, 30% | judgement | Binds only in small municipalities |

**Basis:** *cited* = read directly from the linked source; *derived* = computed or adjusted from a cited figure; *judgement* = no source yet, an analyst estimate to replace with operator data. Of 26 assumption rows, 3 are cited, 7 derived and 16 judgement. Most judgement inputs sit near the bottom of the tornado chart. The two important inputs to replace first are **capex** (the second-largest driver, sourced only to a 2019 US study) and the **fixed power charge** (unverified against current CNMC tolls).

The full table, with `basis`, `source` and `source_url` for every row, is defined in `profit_model.py` and written to `data/processed/profit_assumptions.csv`. Low / base / high move every assumption together and are bounds, not likely outcomes; the Monte Carlo (triangular draws, 4,000 per charger type, common random numbers across zones) gives the ranges used in the findings. The selection of "best charger type" per zone uses the probability of profit, not absolute margin, so a small asset is not preferred just for losing fewer euros.

## Data Sources

| Layer | Source | Vintage | Notes |
|---|---|---|---|
| Charger locations, power, connectors, usage type | [OpenChargeMap API](https://openchargemap.org/) | pulled Sep 2026 | Tiled bounding-box queries with recursive splitting; deduped by ID; access classified from usage type |
| Municipal boundaries | OpenStreetMap, [Geofabrik Madrid extract](https://download.geofabrik.de/europe/spain/madrid.html) (`admin_level=8`) | 30 Sep 2026 | One boundary missing from the extract (Santa María de la Alameda) fetched from Nominatim |
| Population | [INE padrón, table 2881](https://www.ine.es/jaxiT3/Tabla.htm?t=2881) | 2025 | Master list of 179 municipalities |
| Income | [INE Atlas de Distribución de Renta, table 31097](https://www.ine.es/jaxiT3/Tabla.htm?t=31097) | 2023 | Net income per person and per household; median per consumption unit suppressed for 6 small municipalities |
| Vehicles by environmental label, driver census | [DGT Datos municipales](https://www.dgt.es/menusecundario/dgt-en-cifras/dgt-en-cifras-resultados/dgt-en-cifras-detalle/Datos-municipales-informacion-general-2025/) | 2025 | EV = "Distintivo 0" (CERO) label; total = sum of all five label columns |
| POIs: retail, offices, food, rail stations, parking, fuel stations | OpenStreetMap (Geofabrik extract, read with `osmium`) | 30 Sep 2026 | Reduced to points; counted per municipality |
| Public charging prices | [electromovilidad24 (2026)](https://www.electromovilidad24.com/articulos/cargar-casa-vs-supercargadores-coste-real-2026.html), [Ionity July 2026 prices (motor16)](https://www.motor16.com/las-ultimas-noticias/ionity-subida-precios-2026/) | 2026 | AC €0.30-0.50, DC €0.45-0.65, ultra-fast €0.55-0.79 per kWh |
| Electricity prices | [OMIE 2025 average and 2026 futures (energias-renovables)](https://www.energias-renovables.com/panorama/el-precio-de-la-electricidad-en-espa-20260107) | Jan 2026 | €65.52/MWh in 2025; ~€55/MWh expected for 2026 |
| Utilization benchmark | [motorpasion (industry figures)](https://www.motorpasion.com/coches-electricos/problema-fantasma-cargadores-publicos-no-faltan-puntos-carga-faltan-coches-electricos-que-usen-dicen-estos-expertos/amp), [CWIEME (15% viability threshold)](https://berlin.cwiemeevents.com/articles/revolutionising-public-charging-in-europe-the) | 2025-2026 | 2-8% of hours across Europe |
| Hardware and installation costs | [ICCT, *Estimating electric vehicle charging infrastructure costs* (2019)](https://theicct.org/wp-content/uploads/2021/06/ICCT_EV_Charging_Cost_20190813.pdf) | 2019 USD, US | Per-charger hardware + single-site installation: ~$123k (150 kW), ~$74k (50 kW), ~$6-7k (Level 2). **Weakest-sourced important input; replace with Spanish operator quotes** |
| Public charging network growth | ANFAC Barómetro de Electromovilidad, via [hibridosyelectricos / Europa Press](https://www.hibridosyelectricos.com/coches/37-mas-en-ano-espana-ya-cuenta-con-53072-puntos-recarga-coches-electricos_84515_102.html) | Q4 2025 | 53,072 public points (+37% on 2024); primary report not reviewed |
| Charging subsidies | [Mapfre, Plan MOVES 2026](https://www.motor.mapfre.es/coches/noticias-coches/plan-moves/) | 2026 | Describes aid for private charging points; support for CPO public chargers unconfirmed |
| Grid access tolls (power term) | CNMC tolls (3.0TD / 6.1TD, EV-specific 3.0TDVE / 6.1TDVE) | — | **Not yet checked; the fixed power charge is an unverified assumption** |
| Grid substation capacity | *Not public* | — | See Limitations |

## Data Notes

- **Fleet-domicile correction.** Municipalities with more than 2× the median vehicles per resident (cutoff ≈ 1,661 per 1,000) are flagged (`fleet_domicile_flag`). Driver counts there are normal, confirming the cars belong to fleets, not residents. For flagged municipalities, resident EVs (`ev_resident_est`) are predicted from a population-weighted model fitted on the rest: log(EV/pop) = −26.38 + 2.42·log(income) − 0.14·log(density). Models are re-run without these municipalities as a robustness check.
- **Public access.** "Public" includes membership networks (Iberdrola, Endesa, Repsol, EDP, etc.): anyone can sign up, so they count toward usable supply. Sites with no point count are counted as one point.
- **Parking proxy.** INE does not publish "% of dwellings without a private garage" for all municipalities (Census 2021 garage data covers only those above 50,000 residents), so population density is used as a proxy.
- **Transit.** OSM rail stations replace CRTM data; MITECO fuel stations are replaced by OSM `amenity=fuel` (the planned fallback).
- **Manual downloads.** INE, DGT and Geofabrik files are downloaded in a browser and placed in `data/raw/` (see Reproducing). Raw files are not committed.
- **Tier 2 inputs.** Notebooks `05` and `06` read only `data/processed/zone_scores.csv` and `features_municipal.gpkg` (for the map). They do not need the raw INE income file or the OSM `.pbf`.

## Tech Stack

- **Data pipeline:** Python (`pandas`, `geopandas`, `osmium`, `osmnx`, `requests`, `python-dotenv`)
- **Regression and statistics:** `statsmodels` (Poisson / NB2), `scipy`, `libpysal` / `esda` (Moran's I), `mgwr` (GWR, stretch goal)
- **Profit model:** `numpy` (vectorised NPV and Monte Carlo), `scipy` (rank correlations)
- **Mapping:** `matplotlib`, `folium`; `topojson` for Power BI shapes
- **Dashboards and interactive app:** Power BI, plus Streamlit or Folium on GitHub Pages
- **Version control:** GitHub

## Repository Structure

```
OptimalEVCharging/
├── data/
│   ├── raw/                     # downloads: OCM, OSM .pbf, INE, DGT (not committed)
│   └── processed/               # features_municipal.csv/.gpkg, model_predictions.csv,
│                                #   model_coefficients.csv, zone_scores.csv,
│                                #   profit_assumptions.csv, profit_scenarios_long.csv,
│                                #   profit_zones.csv, sensitivity_*.csv
├── notebooks/
│   ├── 01_data_collection.ipynb
│   ├── 02_feature_engineering.ipynb
│   ├── 03_regression_poisson_nb.ipynb
│   ├── 04_zone_scoring.ipynb
│   ├── figures.ipynb            # descriptive charts for the report
│   ├── 05_profit_scenarios.ipynb       (Tier 2)
│   └── 06_sensitivity_analysis.ipynb   (Tier 2)
├── profit_model.py              # assumptions table + vectorised NPV / break-even / Monte Carlo
├── ocm_extract.py               # OpenChargeMap tiled download helpers
├── osm_extract.py               # OSM layer definitions and helpers
├── dashboard/
│   └── data/                    # Power BI tables: municipalities, chargers, scenario ranks, TopoJSON
├── app/                         # interactive web map (Tier 3)
├── maps/                        # exported charts and maps (incl. tornado, margin ranges, break-even)
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
4. **Run the notebooks in order** (`01` → `04`, then `figures`, then `05` → `06`). Each reads only the files written by the previous ones. `05` writes `profit_mc_draws.pkl`, which `06` reads.

## Deliverables and Priorities

**Tier 1: core**
- [x] Municipality-level feature dataset (EV density, housing proxy, income, POI density, existing public chargers)
- [x] Chart: share of listed OpenChargeMap locations that are actually public
- [x] Poisson / negative binomial model with dispersion check and diagnostics
- [x] Zone opportunity scores (0-100) and a demand-vs-supply gap map
- [x] Ranked top-20 candidate zones with short rationale
- [ ] Power BI dashboard (ranked zones, one map, one or two charts): data export done, report in progress

**Tier 2: profit layer**
- [x] Profit scenario model with low / base / high margin ranges per zone (plus Monte Carlo P10/P50/P90 and probability of profit)
- [x] Sensitivity analysis (tornado chart, variance shares, value of information)
- [x] Break-even utilization and payback per zone and charger type

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
- **Candidate sites:** existing stations already have land, permits, traffic, and often a strong electrical connection. Fuel stations enter the opportunity score as the "sites" component; flagging individual stations in high-score zones as conversion candidates is a next step. Tier 2 adds a reason to: a sub-€90k installed cost is one of the levers that turns the top zones positive, and existing grid connections are the most likely way to get there.
- **Residual analysis:** charger and gas station density correlate positively because both follow roads and commerce. The more informative output is the residual: municipalities where charger supply falls well below what gas station density predicts.

### 2. Break-even utilization analysis (done in `05` / `06`)
Implemented: break-even utilization and sessions per day per charger type, payback, and the comparison against each zone's expected utilization (`maps/breakeven_vs_utilization.png`). Result: expected utilization sits below break-even in every zone in the base case; the top zones are within 1.5 percentage points. Open extension: through-traffic demand for motorway-adjacent sites, which the resident-based demand cap ignores.

## Limitations

- **No session data.** Public sources do not expose per-charger usage, so demand is modeled from proxy features and utilization is a scenario assumption. Access to an operator's session logs would replace the largest assumption in the model and tighten the profit ranges. The sensitivity analysis shows how much: about half of the margin range for a top zone.
- **Score → utilization link is assumed, not estimated.** The opportunity score is a percentile ranking; the slope that converts it into utilization is a judgement call, tested from 0.25 to 0.75. Session data would let it be estimated.
- **Independent Monte Carlo draws.** Selling price and electricity cost are drawn independently; in practice operators partly pass energy costs through, so the true margin range is somewhat narrower than shown.
- **Peer benchmark, not true demand.** The model's "expected" points describe what similar municipalities in the Comunidad have. A region-wide shortage would be invisible to it.
- **Low explanatory power.** Fundamentals explain little of where public chargers are (NB pseudo-R² ≈ 0.03), and no single municipality's shortfall is statistically certain. Scores are a screening tool, and the top-20 is reported with its robustness across weightings.
- **Fleet-domicile distortion.** DGT vehicle counts follow tax addresses. The correction handles the 19 most extreme municipalities, but large corporate hubs below the cutoff, including Madrid city, may still carry some fleet vehicles.
- **Coverage of OpenChargeMap.** OCM is crowdsourced; recently opened sites may be missing. Cross-checking against the national access point (NAP, [nap.dgt.es](https://nap.dgt.es)) is a planned validation.
- **No substation capacity.** Grid connection capacity and upgrade costs are not public. Proximity to high-power infrastructure (industrial zones, metro stations, large car parks) or gas stations serves as a rough proxy, and grid cost is part of the capex range.
- **Municipality-level resolution.** Large municipalities, including Madrid city itself, contain very different neighborhoods. Results are a screening tool for where to look first, not a substitute for site-level surveys.
- **Estimates, not forecasts.** Profit figures are scenario ranges under stated assumptions, not predictions.

## Author

Alejandro Céspedes Fernández, M.S. Statistics for Data Science, Universidad Carlos III de Madrid
