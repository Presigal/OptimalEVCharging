# OptimalEVCharging: (Greater) Madrid

Geospatial demand modeling and site-selection analysis for public EV charging infrastructure in the Comunidad de Madrid, framed as a siting recommendation for a charge-point operator (CPO). Each zone receives a 0-100 opportunity score and an estimated annual margin range (€) under stated assumptions.

## Business Problem

Europe's national-level charging shortage is largely solved. Under the EU's Alternative Fuels Infrastructure Regulation (AFIR), nearly every member state now exceeds its fleet-based public charging capacity target. The remaining problem is not how many chargers exist but where they are. National compliance figures mask local under- and over-provision, and a large share of the "charging locations" listed in open databases are private, customer-only, or membership-gated rather than usable by a driver who lives in an apartment with no private parking.

This project answers a narrower question: **given a fixed capital budget for N new public charging stations in Greater Madrid, which zones offer the best expected return, and how uncertain is that estimate?**

An early visual comparison of raw OpenChargeMap results against the public-only filter suggests supply is clustered in the affluent north-west corridor (Pozuelo, Majadahonda, Las Rozas) and thin in dense southern municipalities (Leganés, Getafe, Fuenlabrada, Alcorcón, Móstoles). Testing whether that pattern is statistically real, and what it means in euros, is the core of the project.

## Scope

- **Geography:** Comunidad de Madrid (179 municipalities), municipality-level unit of analysis
- **Perspective:** Memo to a charge-point operator deciding where to deploy new stations
- **Timeline:** About one month, solo

## Approach

1. **Data collection and cleaning:** gather chargers, boundaries, demographics, vehicle registrations, POIs, and transit data. Dedupe chargers and filter to public/unrestricted access.
2. **Demand modeling:** Poisson / negative binomial regression on a municipality-level feature table. Fit both and check for overdispersion, since usage-like count data rarely satisfies Poisson's variance = mean assumption.
3. **Accessibility features:** distance to the nearest public charger. Straight-line first; road-network distance via `osmnx` / `networkx` as an optional upgrade.
4. **Zone score:** predicted demand minus existing public supply, scaled to 0-100.
5. **Profit scenario model:** map each zone's score to an estimated utilization, then compute revenue minus electricity, amortized installation, and operating costs under low / base / high scenarios.
6. **Sensitivity analysis:** show which assumptions drive the margin range most (tornado chart), which identifies the data an operator partner would most need to provide.
7. **Delivery:** static maps, a Power BI dashboard, and an interactive web map.

## Data Sources

| Layer | Source | Notes |
|---|---|---|
| Existing charger locations, power, connector type, usage type | [OpenChargeMap API](https://openchargemap.org/) | Result cap per query; grid the region and paginate. Dedupe and filter to public access |
| Municipal boundaries | Comunidad de Madrid open data portal | Shapefiles for all municipalities |
| Income, dwelling type, household size, population | [INE](https://www.ine.es) | Municipality level. % of dwellings without private parking is a key predictor |
| Vehicle registrations by fuel type | DGT | Municipality level where available |
| POI density (retail, offices, transit hubs) | OpenStreetMap via `osmnx` | |
| Regional transit | Consorcio Regional de Transportes de Madrid (CRTM) | Covers Cercanías and interurban buses |
| Gas stations | MITECO fuel price service (OpenStreetMap `amenity=fuel` as fallback) | Comparison layer; see Additional Plans |
| Electricity prices | Red Eléctrica REData / OMIE | Wholesale price inputs for the cost model |
| Hardware and installation costs | Public industry reports, subsidy program documents | Ranges by charger type (AC, 50 kW, 150 kW DC); verify current figures |
| Grid substation capacity | *Not public* | See Limitations |

## Tech Stack

- **Data pipeline / storage:** Python, Snowflake (optional staging)
- **Feature engineering and regression:** `pandas`, `geopandas`, `statsmodels` (Poisson / NB), `mgwr` (GWR, stretch goal)
- **Network analysis (optional):** `osmnx`, `networkx`
- **Mapping:** `folium` / `kepler.gl`, QGIS or ArcGIS Online
- **Dashboards and interactive app:** Power BI, plus Streamlit or Folium on GitHub Pages
- **Version control:** GitHub

## Repository Structure (planned)

```
OptimalEVCharging/
├── data/
│   ├── raw/                # untouched pulls from OpenChargeMap, INE, OSM, MITECO, etc.
│   └── processed/          # municipality-level feature table
├── notebooks/
│   ├── 01_data_collection.ipynb
│   ├── 02_feature_engineering.ipynb
│   ├── 03_regression_poisson_nb.ipynb
│   ├── 04_zone_scoring.ipynb
│   ├── 05_profit_scenarios.ipynb
│   └── 06_sensitivity_analysis.ipynb
├── dashboard/               # Power BI workbook
├── app/                     # interactive web map (Streamlit / Folium)
├── maps/                    # exported choropleths and candidate-site maps
├── report/                  # memo-style writeup for a hypothetical CPO
└── README.md
```

## Deliverables and Priorities

**Tier 1: core**
- [ ] Municipality-level feature dataset (EV density, housing type, income, POI density, existing public chargers)
- [ ] Chart: share of listed OpenChargeMap locations that are actually public
- [ ] Poisson / negative binomial model with dispersion check and diagnostics
- [ ] Zone opportunity scores (0-100) and a demand-vs-supply gap map
- [ ] Ranked top-20 candidate zones with short rationale
- [ ] Power BI dashboard (ranked zones, one map, one or two charts)

**Tier 2: profit layer**
- [ ] Profit scenario model with low / base / high margin ranges per zone
- [ ] Sensitivity analysis (tornado chart)

**Tier 3: stretch**
- [ ] Interactive web map with sliders for electricity price and utilization
- [ ] Geographically Weighted Regression (GWR) coefficient maps
- [ ] Road-network distance to nearest charger (`osmnx` / `networkx`)

**Cut first if behind schedule:** GWR, road-network distance, interactive sliders.

## Additional Plans to Consider

### 1. Gas station comparison layer
Gas stations are a mature, demand-driven network, which makes them a useful benchmark and a source of candidate sites.
- **Benchmark ratio:** compute gas stations per 1,000 combustion vehicles and public chargers per 1,000 EVs per municipality. Large gaps between the two ratios are a first-pass underservice signal. This is a comparison point, not a target, since EV drivers also charge at home and at work.
- **Regression predictor:** gas station density is a proxy for traffic exposure, commercial zoning, and available land, and may partly stand in for missing grid capacity data.
- **Candidate sites:** existing stations already have land, permits, traffic, and often a strong electrical connection. Flag stations in high-score, low-supply zones as concrete conversion candidates.
- **Residual analysis:** charger and gas station density will likely correlate positively because both follow roads and commerce. The more informative output is the residual: municipalities where charger supply falls well below what gas station density predicts.

### 2. Break-even utilization analysis
For each zone and charger type, estimate how much use a station needs before it earns back its cost.
- **Break-even utilization:** the share of hours a charger must be in use, or equivalently the number of charging sessions per day, at which annual revenue covers electricity, operating costs, and amortized hardware and installation.
- **Payback period:** years to recover the investment at the zone's estimated utilization under low / base / high scenarios.
- **Comparison to estimated demand:** for each zone, compare break-even utilization against the model's predicted utilization. Zones where predicted utilization clears break-even under the base scenario are strong candidates. Zones that clear it only under the high scenario are risky, and the map should show that distinction.
- **Sensitivity:** vary the selling price per kWh, electricity cost, charger power, and installation cost to see how sensitive break-even is to each.
- **Framing:** this analysis is a test of the investment case, not an assumed conclusion. If break-even utilization is far above what the model predicts in most zones, that is a finding too, and it points to where subsidies or lower-cost hardware would change the answer.

## Limitations

- **No session data.** Public sources do not expose per-charger usage, so demand is modeled from proxy features and utilization is a scenario assumption. Access to an operator's session logs would replace the largest assumption in the model and tighten the profit ranges. The sensitivity analysis is designed to show exactly how much.
- **No substation capacity.** Grid connection capacity and upgrade costs are not public. Proximity to high-power infrastructure (industrial zones, metro stations, large car parks) or gas stations serves as a rough proxy, and grid cost is treated as an adjustable assumption.
- **Municipality-level resolution.** Large municipalities, including Madrid city itself, contain very different neighborhoods. Results are a screening tool for where to look first, not a substitute for site-level surveys.
- **Estimates, not forecasts.** Profit figures are scenario ranges under stated assumptions, not predictions.

## Author

Alejandro Céspedes Fernández, M.S. Statistics for Data Science, Universidad Carlos III de Madrid
