"""
Profit layer for OptimalEVCharging (Tier 2).

Unit of analysis: ONE new public charger of a given type placed in a municipality,
evaluated at steady state (year 3+, after ramp-up). All money in EUR, excluding VAT.

Pipeline per zone x charger type x parameter set:
    utilization = base_util[type] * m(score)            # score -> utilization
    m(score)    = 1 + elasticity * (score - 50) / 50      # =1 at score 50
    energy      = min(8760 * utilization * avg_kw,         # what the charger could sell
                      capture * zone_public_demand_kwh)    # what local residents can buy
    revenue     = energy * price_gross / (1 + VAT)
    EBITDA      = revenue - payment/roaming fees - energy cost - fixed power charge - opex
    demand grows each year at `demand_growth` (capped at 90% occupancy and by local demand)
    NPV         = -capex*(1-subsidy) + sum_t EBITDA_t / (1+r)^t   over the asset life
    margin      = NPV * annuity factor  (annual-equivalent economic margin)

`margin` > 0 means the charger earns back its capital at the required return. Low / base / high are pessimistic / central / optimistic for
the operator, so "low" can mean a HIGHER cost value.
"""
from __future__ import annotations

import numpy as np
import pandas as pd

HOURS_PER_YEAR = 8760
VAT = 0.21

CHARGER_TYPES = {
    "AC22": {"label": "AC 22 kW post (2 sockets)", "kw": 22, "loss": 0.02},
    "DC50": {"label": "DC 50 kW", "kw": 50, "loss": 0.05},
    "DC150": {"label": "DC 150 kW", "kw": 150, "loss": 0.05},
}

# ---------------------------------------------------------------------------
# Assumptions. charger = "all" applies to every type.
# low / base / high are ordered pessimistic -> optimistic for the operator.
# ---------------------------------------------------------------------------
_A = [
    # name, charger, low, base, high, unit, label, source/rationale
    ("util", "AC22", 0.08, 0.12, 0.18, "share of hours plugged in", "Utilization (time plugged in)",
     "EU public chargers typically 2-8% of hours; AC kerbside sessions are long, so plugged-in share is higher. Scenario assumption: no session data."),
    ("util", "DC50", 0.04, 0.07, 0.11, "share of hours charging", "Utilization (time charging)",
     "2-8% EU range (motorpasion.com summarising industry data); ~15% often cited as viability threshold."),
    ("util", "DC150", 0.04, 0.07, 0.11, "share of hours charging", "Utilization (time charging)",
     "As DC50. Same occupancy assumed; ultra-fast sells more kWh per hour."),
    ("avg_kw", "AC22", 5.0, 6.5, 8.0, "kW", "Average power while plugged in",
     "Most cars draw 7.4-11 kW on AC; idle time after full charge lowers the average."),
    ("avg_kw", "DC50", 30, 36, 42, "kW", "Average delivered power",
     "Charging curve taper; 50 kW units deliver ~35-40 kW on average."),
    ("avg_kw", "DC150", 55, 70, 85, "kW", "Average delivered power",
     "Many cars peak below 150 kW and taper above ~60% SoC."),
    ("price", "AC22", 0.39, 0.45, 0.52, "EUR/kWh incl. VAT", "Selling price",
     "Spain 2026 public AC 0.30-0.50 EUR/kWh (electromovilidad24, 2026)."),
    ("price", "DC50", 0.45, 0.52, 0.59, "EUR/kWh incl. VAT", "Selling price",
     "Spain 2026 DC 50-150 kW 0.45-0.65 EUR/kWh (electromovilidad24, 2026)."),
    ("price", "DC150", 0.52, 0.59, 0.69, "EUR/kWh incl. VAT", "Selling price",
     "Spain 2026 ultra-fast 0.55-0.79 EUR/kWh; Ionity ad-hoc up to 0.76 from Jul 2026 (motor16)."),
    ("capex", "AC22", 14_000, 10_000, 7_000, "EUR per charger", "Capex (hardware + install + grid)",
     "ICCT 2019: networked Level 2 hardware $3.1k + single-site install $2.8-4.1k (2019 USD, US). Base adds a share of civil works and grid connection for a 2-socket post. Replace with operator quotes."),
    ("capex", "DC50", 60_000, 45_000, 32_000, "EUR per charger", "Capex (hardware + install + grid)",
     "ICCT 2019: hardware $28k + single-charger-site install $46k = ~$74k (2019 USD, US). Base EUR 45k assumes a multi-charger site sharing installation plus post-2019 hardware declines; likely optimistic. Replace with Spanish quotes."),
    ("capex", "DC150", 150_000, 110_000, 80_000, "EUR per charger", "Capex (hardware + install + grid)",
     "ICCT 2019: hardware $75k + single-charger-site install $48k = ~$123k (2019 USD, US). Base EUR 110k; grid connection is the widest unknown (no substation data). Replace with Spanish quotes."),
    ("opex", "AC22", 1_500, 1_000, 700, "EUR per year", "Opex (maintenance, software, SIM, insurance, site)",
     "Industry ranges."),
    ("opex", "DC50", 4_500, 3_500, 2_500, "EUR per year", "Opex (maintenance, software, SIM, insurance, site)",
     "Industry ranges; DC maintenance contracts ~4-6% of hardware per year."),
    ("opex", "DC150", 8_000, 6_000, 4_500, "EUR per year", "Opex (maintenance, software, SIM, insurance, site)",
     "Industry ranges."),
    ("energy_cost", "all", 0.16, 0.13, 0.10, "EUR/kWh", "Electricity cost (variable, all-in)",
     "Wholesale 65.5 EUR/MWh in 2025, futures ~55 for 2026 (energias-renovables, Jan 2026) + adjustment services, energy tolls/charges, electricity tax, supplier margin."),
    ("power_charge", "all", 45, 30, 15, "EUR per contracted kW per year", "Fixed power charge (termino de potencia)",
     "3.0TD/6.1TD power term; the EV-specific 3.0TDVE/6.1TDVE tolls shift cost from power to energy (low end). Verify against current CNMC tolls."),
    ("fee_share", "all", 0.12, 0.08, 0.04, "share of revenue", "Payment / roaming / app fees",
     "Roaming hubs and card processing; lower for direct app users."),
    ("subsidy", "all", 0.0, 0.0, 0.30, "share of capex", "Capex subsidy",
     "Base assumes none: coverage of 2026 MOVES support for CPO public chargers unconfirmed (available summaries describe private-charger aid only). High case = a MOVES-III-style grant."),
    ("discount_rate", "all", 0.10, 0.08, 0.06, "per year", "Discount rate (WACC)", "Typical infrastructure WACC range."),
    ("lifetime", "all", 8, 10, 12, "years", "Asset lifetime", "Typical charger depreciation life."),
    ("elasticity", "all", 0.25, 0.50, 0.75, "-", "Score -> utilization slope",
     "m(score)=1+e*(score-50)/50: score 100 gets 1+e times the base utilization, score 0 gets 1-e. Judgement call, not estimated."),
    ("kwh_per_ev", "all", 2_200, 2_500, 2_800, "kWh per EV per year", "Annual consumption per resident EV",
     "~14-16k km/yr at ~0.17 kWh/km."),
    ("public_share", "all", 0.20, 0.25, 0.35, "share", "Share of EV energy bought at public chargers",
     "Lower where home charging is common; Madrid has many flats without garages."),
    ("demand_growth", "all", 0.00, 0.04, 0.08, "per year", "Net demand growth per charger",
     "EV fleet growth minus growth in competing public points. Spain's public points grew 37% in 2025 to 53,072 (ANFAC Barometro de Electromovilidad, as reported by Europa Press; primary report not reviewed), so much of fleet growth is absorbed by new supply."),
    ("capture", "all", 0.10, 0.20, 0.30, "share", "Max share of zone public demand one new charger can win",
     "Caps sales in small municipalities; ignores through-traffic (conservative for corridor sites)."),
]

# ---------------------------------------------------------------------------
# Provenance of each assumption.
#   basis = "cited"     value read directly from the linked source
#           "derived"   computed or adjusted from a cited figure (adjustment explained in `source`)
#           "judgement" no source; analyst's estimate, to be replaced with operator data
# Inputs to replace first with primary sources: capex (2nd-largest driver) and power_charge.
# ---------------------------------------------------------------------------
URL = {
    "motorpasion": "https://www.motorpasion.com/coches-electricos/problema-fantasma-cargadores-publicos-no-faltan-puntos-carga-faltan-coches-electricos-que-usen-dicen-estos-expertos/amp",
    "cwieme": "https://berlin.cwiemeevents.com/articles/revolutionising-public-charging-in-europe-the",
    "electromovilidad24": "https://www.electromovilidad24.com/articulos/cargar-casa-vs-supercargadores-coste-real-2026.html",
    "motor16": "https://www.motor16.com/las-ultimas-noticias/ionity-subida-precios-2026/",
    "icct2019": "https://theicct.org/wp-content/uploads/2021/06/ICCT_EV_Charging_Cost_20190813.pdf",
    "energias_renovables": "https://www.energias-renovables.com/panorama/el-precio-de-la-electricidad-en-espa-20260107",
    "mapfre_moves": "https://www.motor.mapfre.es/coches/noticias-coches/plan-moves/",
    "anfac_2025": "https://www.hibridosyelectricos.com/coches/37-mas-en-ano-espana-ya-cuenta-con-53072-puntos-recarga-coches-electricos_84515_102.html",
}

# (param, charger) -> (basis, [url keys]); charger "*" matches every row of that param.
_PROVENANCE = {
    ("util", "AC22"): ("judgement", ["motorpasion"]),
    ("util", "DC50"): ("derived", ["motorpasion", "cwieme"]),
    ("util", "DC150"): ("derived", ["motorpasion", "cwieme"]),
    ("avg_kw", "*"): ("judgement", []),
    ("price", "AC22"): ("cited", ["electromovilidad24"]),
    ("price", "DC50"): ("cited", ["electromovilidad24"]),
    ("price", "DC150"): ("cited", ["electromovilidad24", "motor16"]),
    ("capex", "*"): ("derived", ["icct2019"]),
    ("opex", "*"): ("judgement", []),
    ("energy_cost", "*"): ("derived", ["energias_renovables"]),
    ("power_charge", "*"): ("judgement", []),
    ("fee_share", "*"): ("judgement", []),
    ("subsidy", "*"): ("judgement", ["mapfre_moves"]),
    ("discount_rate", "*"): ("judgement", []),
    ("lifetime", "*"): ("judgement", []),
    ("elasticity", "*"): ("judgement", []),
    ("kwh_per_ev", "*"): ("judgement", []),
    ("public_share", "*"): ("judgement", []),
    ("demand_growth", "*"): ("derived", ["anfac_2025"]),
    ("capture", "*"): ("judgement", []),
}


def _provenance(param, charger):
    basis, keys = _PROVENANCE.get((param, charger)) or _PROVENANCE[(param, "*")]
    return basis, " | ".join(URL[k] for k in keys)


ASSUMPTIONS = pd.DataFrame(
    _A, columns=["param", "charger", "low", "base", "high", "unit", "label", "source"]
)
ASSUMPTIONS[["basis", "source_url"]] = [
    _provenance(p, c) for p, c in zip(ASSUMPTIONS.param, ASSUMPTIONS.charger)
]


def params_for(charger: str, case: str = "base", overrides: dict | None = None) -> dict:
    """Resolve one parameter dict for a charger type at a scenario case."""
    a = ASSUMPTIONS[(ASSUMPTIONS.charger == charger) | (ASSUMPTIONS.charger == "all")]
    p = dict(zip(a.param, a[case]))
    if overrides:
        p.update(overrides)
    return p


def annuity_factor(r, n):
    r = np.asarray(r, dtype=float)
    n = np.asarray(n, dtype=float)
    return np.where(r > 0, r / (1 - (1 + r) ** (-n)), 1 / n)


def evaluate(score, ev_resident, charger: str, p: dict) -> pd.DataFrame:
    """Vectorised evaluation over the asset life.

    score / ev_resident: arrays (one per zone) or scalars. Each value in p may be a
    scalar or an array broadcastable against them (used for Monte Carlo).
    Year-1 = steady state after ramp-up; demand then grows at `demand_growth`.
    Reported flows (revenue, EBITDA, ...) are year-1; `margin` is the annual
    equivalent of NPV (> 0 means the charger earns its cost of capital).
    """
    spec = CHARGER_TYPES[charger]
    score = np.asarray(score, dtype=float)
    ev = np.asarray(ev_resident, dtype=float)
    P = {k: np.asarray(v, dtype=float) for k, v in p.items()}

    m = 1 + P["elasticity"] * (score - 50) / 50
    util0 = np.clip(P["util"] * m, 0, 0.9)
    pot0 = HOURS_PER_YEAR * util0 * P["avg_kw"]                 # kWh the charger could sell
    cap0 = P["capture"] * ev * P["kwh_per_ev"] * P["public_share"]  # kWh local residents can give it

    price_net = P["price"] / (1 + VAT)
    unit_margin = price_net * (1 - P["fee_share"]) - P["energy_cost"] / (1 - spec["loss"])
    power_cost = spec["kw"] * P["power_charge"]
    fixed = power_cost + P["opex"]
    capex_net = P["capex"] * (1 - P["subsidy"])
    r, g, L = P["discount_rate"], P["demand_growth"], P["lifetime"]

    shape = np.broadcast(score, ev, *P.values()).shape
    npv = -np.broadcast_to(capex_net, shape).astype(float)
    pv_fixed = np.zeros(shape)   # PV of 1 EUR/yr fixed cost over life
    pv_growth = np.zeros(shape)  # PV of 1 kWh/yr growing at g (for break-even)
    cum = -np.broadcast_to(capex_net, shape).astype(float)
    payback = np.full(shape, np.inf)
    for t in range(1, int(np.max(L)) + 1):
        alive = t <= L
        grow = (1 + g) ** (t - 1)
        hours_cap = HOURS_PER_YEAR * 0.9 * P["avg_kw"]
        e_t = np.minimum(np.minimum(pot0 * grow, hours_cap), cap0 * grow)
        cf = e_t * unit_margin - fixed
        d = (1 + r) ** (-t)
        npv = npv + np.where(alive, cf * d, 0)
        pv_fixed = pv_fixed + np.where(alive, d, 0)
        pv_growth = pv_growth + np.where(alive, grow * d, 0)
        prev = cum.copy()
        cum = cum + np.where(alive, cf, 0)
        newly = (prev < 0) & (cum >= 0) & np.isinf(payback)
        frac = np.where(cf > 0, -prev / np.where(cf > 0, cf, 1), 0)
        payback = np.where(newly, t - 1 + frac, payback)

    af = annuity_factor(r, L)
    margin = npv * af

    energy1 = np.minimum(pot0, cap0)
    revenue = energy1 * price_net
    ebitda = energy1 * unit_margin - fixed

    # Break-even year-1 energy (uncapped, i.e. if demand is there): NPV = 0
    be_energy = np.where(unit_margin > 0,
                         (capex_net + fixed * pv_fixed) / (unit_margin * pv_growth), np.inf)
    be_util = be_energy / (HOURS_PER_YEAR * P["avg_kw"])
    kwh_session = 12 if charger == "AC22" else 25

    b = lambda x: np.broadcast_to(x, shape)
    return pd.DataFrame({
        "utilization": b(energy1 / (HOURS_PER_YEAR * P["avg_kw"])).ravel(),
        "util_potential": b(util0).ravel(),
        "demand_capped": b(pot0 > cap0).ravel(),
        "energy_mwh": b(energy1 / 1000).ravel(),
        "revenue": b(revenue).ravel(),
        "energy_cost": b(energy1 / (1 - spec["loss"]) * P["energy_cost"]).ravel(),
        "fees": b(revenue * P["fee_share"]).ravel(),
        "power_cost": b(power_cost).ravel(),
        "opex": b(P["opex"]).ravel(),
        "ebitda": b(ebitda).ravel(),
        "capex_net": b(capex_net).ravel(),
        "npv": npv.ravel(),
        "margin": margin.ravel(),
        "payback_years": payback.ravel(),
        "breakeven_util": b(be_util).ravel(),
        "breakeven_sessions_day": b(be_energy / 365 / kwh_session).ravel(),
    })


def sample_params(charger: str, n: int, rng: np.random.Generator) -> dict:
    """Independent triangular draws between the low/high values with mode at base."""
    a = ASSUMPTIONS[(ASSUMPTIONS.charger == charger) | (ASSUMPTIONS.charger == "all")]
    out = {}
    for _, r in a.iterrows():
        lo, hi = sorted([r.low, r.high])
        out[r.param] = rng.triangular(lo, r.base, hi, size=n) if hi > lo else np.full(n, r.base)
    return out
