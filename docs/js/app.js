/* EV charging gaps · Comunidad de Madrid
 * Static site: all data comes from docs/data/*, written by scripts/export_web.py.
 * The opportunity score is recomputed in the browser with the same method as
 * notebook 04 (weighted geometric mean of percentiles, rescaled 0–100).
 */
(() => {
  "use strict";

  // Set to your repository URL to show a "Code on GitHub" link in the About tab.
  const REPO_URL = "";

  // ---------------------------------------------------------------- helpers
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const nf0 = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 0 });
  const nf1 = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 1 });
  const nf2 = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 2 });
  const fmtN = (v) => (v == null ? "—" : Math.abs(v) >= 100 ? nf0.format(v) : Math.abs(v) >= 10 ? nf1.format(v) : nf2.format(v));
  const fmtPct = (v) => (v == null ? "—" : nf0.format(v * 100) + "%");
  const fmtEur = (v) => (v == null ? "—" : "€" + nf0.format(v));
  const fmtX = (v) => (v == null ? "—" : nf2.format(v) + "×");
  const norm = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { /* ignore */ } },
  };

  // ---------------------------------------------------------------- theme
  const root = document.documentElement;
  const savedTheme = store.get("theme");
  if (savedTheme) root.dataset.theme = savedTheme;
  const isDark = () => root.dataset.theme ? root.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;

  const PALETTE = {
    light: {
      seq: ["#cde2fb", "#9ec5f4", "#6da7ec", "#3987e5", "#256abf", "#184f95", "#0d366b"],
      div: ["#9e2a28", "#d4483f", "#ef9c8f", "#e6e4df", "#9ec5f4", "#3987e5", "#184f95"],
      na: "#dddbd5", line: "#ffffff", sel: "#0b0b0b",
      access: ["#eb6834", "#1baf7a", "#8f8e86", "#b5b3ad"], ring: "#ffffff",
    },
    dark: {
      seq: ["#123a6e", "#184f95", "#1c5cab", "#2a78d6", "#5598e7", "#86b6ef", "#b7d3f6"],
      div: ["#f28b82", "#c9453e", "#7d2b28", "#3a3a37", "#24518a", "#3987e5", "#9ec5f4"],
      na: "#2c2c29", line: "#121211", sel: "#f0efec",
      access: ["#ff8a57", "#2fcf95", "#8f8e86", "#5c5b56"], ring: "#121211",
    },
  };
  const pal = () => PALETTE[isDark() ? "dark" : "light"];

  // ---------------------------------------------------------------- score
  const COMPONENTS = [
    { k: "pct_scarcity", label: "Scarcity", sub: "Resident EVs per public point", group: "Undersupply", w: 0.25 },
    { k: "pct_missing", label: "Missing points", sub: "Shortfall vs. model, in points", group: "Undersupply", w: 0.20 },
    { k: "pct_model", label: "Model gap", sub: "Observed ÷ expected points", group: "Undersupply", w: 0.15 },
    { k: "pct_market", label: "Market size", sub: "Resident EVs (fleet-corrected)", group: "Demand", w: 0.20 },
    { k: "pct_home_gap", label: "Home-charging gap", sub: "Population density proxy", group: "Demand", w: 0.10 },
    { k: "pct_sites", label: "Sites", sub: "Fuel stations to convert", group: "Feasibility", w: 0.10 },
  ];
  const PRESETS = {
    default: Object.fromEntries(COMPONENTS.map((c) => [c.k, c.w])),
    equal: Object.fromEntries(COMPONENTS.map((c) => [c.k, 1 / 6])),
  };

  function computeScores(props, weights) {
    const elig = props.filter((p) => p.eligible);
    const wsum = COMPONENTS.reduce((s, c) => s + weights[c.k], 0);
    const out = new Map();
    if (wsum <= 0) return out;
    const g = elig.map((p) => {
      let acc = 0;
      for (const c of COMPONENTS) if (weights[c.k] > 0) acc += weights[c.k] * Math.log(p[c.k]);
      return Math.exp(acc / wsum);
    });
    const lo = Math.min(...g), hi = Math.max(...g);
    const scores = g.map((v) => (hi > lo ? (100 * (v - lo)) / (hi - lo) : 0));
    const order = scores.map((s, i) => [s, i]).sort((a, b) => b[0] - a[0]);
    order.forEach(([s, i], r) => out.set(elig[i].ine_code, { score: s, rank: r + 1 }));
    return out;
  }

  // ---------------------------------------------------------------- layers
  const LAYERS = [
    { id: "score", group: "Opportunity", label: "Opportunity score (0–100)", kind: "seq", fixed: [15, 30, 45, 60, 75, 90], domain: [0, 100],
      desc: "Where a new public station is most needed: demand and undersupply combined. Recomputed live from the weights in the Ranking tab.",
      get: (p) => state.scores.get(p.ine_code)?.score ?? null, fmt: (v) => nf0.format(v), na: "Not scored (< 5,000 residents)", axis: ["Lower priority", "Higher priority"] },
    { id: "pts_per_10k", group: "Supply", label: "Public charging points per 10,000 residents", kind: "seq", quantile: true,
      desc: "Charger density: public (incl. membership) points per 10,000 residents.",
      get: (p) => p.pts_per_10k, fmt: fmtN, axis: ["Fewer", "More"] },
    { id: "evs_per_pt", group: "Supply", label: "Resident EVs per public point", kind: "seq", quantile: true, zeroNA: "public_points",
      desc: "Scarcity: how many resident EVs share each public point. Higher means more pressure on public supply.",
      get: (p) => (p.public_points > 0 ? p.evs_per_pt : null), fmt: fmtN, na: "No public points", axis: ["Less pressure", "More pressure"] },
    { id: "dist_km", group: "Supply", label: "Distance to nearest public charger (km)", kind: "seq", quantile: true,
      desc: "Straight-line distance to the nearest public charging site.",
      get: (p) => p.dist_km, fmt: fmtN, axis: ["Closer", "Farther"] },
    { id: "ratio", group: "Model", label: "Observed ÷ model-expected points", kind: "div", fixed: [0.25, 0.5, 0.8, 1.25, 2, 4],
      desc: "Supply relative to what similar municipalities have (negative binomial peer benchmark). Red is below expectation.",
      get: (p) => p.ratio, fmt: fmtX, axis: ["Below expected", "Above expected"] },
    { id: "missing", group: "Model", label: "Missing points vs. model", kind: "div", reverse: true, fixed: [-100, -20, -3, 3, 20, 100],
      desc: "Expected minus observed public points. Positive (red) means fewer points than the model expects; negative (blue) means a surplus.",
      get: (p) => p.missing, fmt: (v) => (v > 0 ? "+" : "") + fmtN(v), axis: ["Surplus", "Shortfall"] },
    { id: "p_shortfall", group: "Model", label: "Probability of a shortfall", kind: "div", reverse: true, fixed: [0.2, 0.35, 0.45, 0.55, 0.65, 0.8],
      desc: "Model probability that a municipality like this would have more points than observed. No single shortfall is statistically certain.",
      get: (p) => p.p_shortfall, fmt: fmtPct, axis: ["Likely surplus", "Likely shortfall"] },
    { id: "evs_per_1k", group: "Demand", label: "Resident EVs per 1,000 residents", kind: "seq", quantile: true,
      desc: "Zero-emission (CERO label) vehicles per 1,000 residents, with fleet registrations corrected.",
      get: (p) => p.evs_per_1k, fmt: fmtN, axis: ["Fewer", "More"] },
    { id: "evs_res", group: "Demand", label: "Resident EVs (estimated)", kind: "seq", quantile: true,
      desc: "Estimated resident EVs (fleet-corrected). Market size component of the score.",
      get: (p) => p.evs_res, fmt: fmtN, axis: ["Fewer", "More"] },
    { id: "density", group: "Demand", label: "Population density (per km²)", kind: "seq", quantile: true,
      desc: "Residents per km², a proxy for homes without a private garage.",
      get: (p) => p.density, fmt: fmtN, axis: ["Sparse", "Dense"] },
    { id: "income_pp", group: "Demand", label: "Net income per person (€)", kind: "seq", quantile: true,
      desc: "INE Atlas de Distribución de Renta, 2023.",
      get: (p) => p.income_pp, fmt: fmtEur, axis: ["Lower", "Higher"] },
    { id: "fuel_stations", group: "Demand", label: "Fuel stations", kind: "seq", quantile: true,
      desc: "OpenStreetMap fuel stations: the strongest predictor of public charging supply, and candidate conversion sites.",
      get: (p) => p.fuel_stations, fmt: fmtN, axis: ["Fewer", "More"] },
    { id: "none", group: "Other", label: "Boundaries only", kind: "none", desc: "Municipal boundaries without shading. Useful with charging sites switched on.", get: () => null },
  ];
  const layerById = Object.fromEntries(LAYERS.map((l) => [l.id, l]));

  function quantileBreaks(values, k = 7) {
    const v = values.filter((x) => x != null && isFinite(x)).sort((a, b) => a - b);
    const zeros = v.filter((x) => x === 0).length;
    const pos = zeros > v.length * 0.1 ? v.filter((x) => x > 0) : v;
    const classes = zeros > v.length * 0.1 ? k - 1 : k;
    const br = [];
    if (pos !== v) br.push(1e-9);
    for (let i = 1; i < classes; i++) {
      const q = pos[Math.min(pos.length - 1, Math.floor((i / classes) * pos.length))];
      if (!br.length || q > br[br.length - 1]) br.push(q);
    }
    return { breaks: br, hasZero: pos !== v, min: v[0], max: v[v.length - 1] };
  }

  function buildScale(layer) {
    if (layer.kind === "none") return null;
    const values = state.props.map(layer.get);
    let breaks, hasZero = false, min, max;
    if (layer.fixed) {
      breaks = layer.fixed;
      const v = values.filter((x) => x != null);
      min = layer.domain ? layer.domain[0] : Math.min(...v);
      max = layer.domain ? layer.domain[1] : Math.max(...v);
    } else ({ breaks, hasZero, min, max } = quantileBreaks(values));
    const ramp = layer.kind === "div" ? pal().div : pal().seq;
    let colors;
    if (layer.kind === "div") colors = layer.reverse ? [...ramp].reverse() : ramp;
    else {
      const n = breaks.length + 1;
      colors = n >= ramp.length ? ramp : ramp.slice(ramp.length - n);
    }
    const color = (v) => {
      if (v == null || !isFinite(v)) return null;
      let i = 0;
      while (i < breaks.length && v >= breaks[i]) i++;
      return colors[Math.min(i, colors.length - 1)];
    };
    return { breaks, colors, color, hasZero, min, max };
  }

  // ---------------------------------------------------------------- state
  const state = {
    props: [], byCode: new Map(), polys: new Map(),
    weights: { ...PRESETS.default }, scores: new Map(), defaultRanks: new Map(),
    layer: "score", scale: null, selected: null,
    chargers: null, showChargers: false, access: new Set([0, 1, 2, 3]), minKw: 0,
  };

  // ---------------------------------------------------------------- map
  const map = L.map("map", { zoomControl: true, preferCanvas: false, minZoom: 8, maxZoom: 16, zoomSnap: 0.25 });
  map.attributionControl.setPrefix(false);
  map.createPane("labels").style.zIndex = 450;
  map.getPane("labels").style.pointerEvents = "none";
  map.createPane("chargers").style.zIndex = 460;
  const chargerRenderer = L.canvas({ pane: "chargers", padding: 0.3 });

  const CARTO = "https://{s}.basemaps.cartocdn.com/{style}/{z}/{x}/{y}{r}.png";
  const cartoAttr = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a> · <a href="https://openchargemap.org">OpenChargeMap</a> · INE · DGT';
  let base, labels;
  function setBasemap() {
    const d = isDark();
    if (base) map.removeLayer(base);
    if (labels) map.removeLayer(labels);
    base = L.tileLayer(CARTO, { style: d ? "dark_nolabels" : "light_nolabels", subdomains: "abcd", attribution: cartoAttr, maxZoom: 19 }).addTo(map);
    labels = L.tileLayer(CARTO, { style: d ? "dark_only_labels" : "light_only_labels", subdomains: "abcd", pane: "labels", maxZoom: 19 }).addTo(map);
  }

  const tip = $("#map-tip");
  function showTip(e, html) {
    tip.innerHTML = html;
    tip.hidden = false;
    const pt = e.containerPoint, w = tip.offsetWidth, h = tip.offsetHeight, size = map.getSize();
    let x = pt.x + 14, y = pt.y + 14;
    if (x + w > size.x - 8) x = pt.x - w - 14;
    if (y + h > size.y - 8) y = pt.y - h - 14;
    tip.style.left = x + "px";
    tip.style.top = y + "px";
  }
  const hideTip = () => (tip.hidden = true);

  function polyStyle(p) {
    const P = pal();
    const layer = layerById[state.layer];
    const sel = state.selected === p.ine_code;
    let fill = null;
    if (state.scale) fill = state.scale.color(layer.get(p));
    const fillOpacity = layer.kind === "none" ? 0 : state.showChargers ? 0.5 : 0.8;
    return {
      color: sel ? P.sel : P.line, weight: sel ? 2.5 : 0.7, opacity: 1,
      fillColor: fill || P.na, fillOpacity: layer.kind === "none" ? 0.02 : fill ? fillOpacity : fillOpacity * 0.7,
    };
  }
  function restyle() {
    state.scale = buildScale(layerById[state.layer]);
    for (const [code, lyr] of state.polys) lyr.setStyle(polyStyle(state.byCode.get(code)));
    const s = state.polys.get(state.selected);
    if (s) s.bringToFront();
    renderLegend();
  }

  // ---------------------------------------------------------------- legend
  function renderLegend() {
    const layer = layerById[state.layer];
    $("#layer-desc").textContent = layer.desc;
    const el = $("#legend");
    if (!state.scale) { el.innerHTML = ""; return; }
    const { breaks, colors, hasZero, min, max } = state.scale;
    const f = layer.fmt;
    const open = layer.fixed && !layer.domain; // open-ended fixed classes: label inner edges only
    const labels = [hasZero ? "0" : open ? "" : f(min), ...breaks.map((b) => (b < 1e-6 ? "" : f(b))), open ? "" : f(max)];
    const bins = colors.map((c, i) => `<i style="background:${c}" title="${esc(binLabel(i))}"></i>`).join("");
    function binLabel(i) {
      if (hasZero && i === 0) return "0";
      const lo = i === 0 ? min : breaks[i - 1], hi = i === breaks.length ? max : breaks[i];
      return `${f(hasZero && i === 1 ? Math.max(lo, 0) : lo)} – ${f(hi)}`;
    }
    const nNA = state.props.filter((p) => layer.get(p) == null).length;
    el.innerHTML = `
      <div class="legend-bins">${bins}</div>
      <div class="legend-labels">${labels.map((l) => `<span>${esc(l)}</span>`).join("")}</div>
      ${layer.axis ? `<div class="legend-axis"><span>${esc(layer.axis[0])}</span><span>${esc(layer.axis[1])}</span></div>` : ""}
      ${nNA ? `<div class="legend-extra"><span><i class="sw" style="background:${pal().na}"></i>${esc(layer.na || "No data")} (${nNA})</span></div>` : ""}
      ${layer.quantile ? `<p class="hint" style="margin:6px 0 0">Classes are quantiles of the 179 municipalities.</p>` : ""}`;
  }

  // ---------------------------------------------------------------- chargers
  let chargerLayer = null;
  function chargerRadius(points) { return 3 + Math.min(5, Math.sqrt(points) * 1.1); }
  function renderChargers() {
    if (chargerLayer) { map.removeLayer(chargerLayer); chargerLayer = null; }
    const C = state.chargers;
    if (!state.showChargers || !C) { $("#charger-count").textContent = ""; return; }
    const P = pal();
    const g = L.layerGroup();
    let nSites = 0, nPts = 0;
    for (const r of C.rows) {
      const [lat, lon, access, points, kw, op, title, operator] = r;
      if (!state.access.has(access)) continue;
      if (state.minKw && !(kw >= state.minKw)) continue;
      nSites++; nPts += points;
      const m = L.circleMarker([lat, lon], {
        renderer: chargerRenderer, radius: chargerRadius(points),
        color: P.ring, weight: 1, fillColor: P.access[access], fillOpacity: op === false ? 0.35 : 0.95,
      });
      m.bindPopup(() => `
        <b>${esc(title || "Charging site")}</b><br>
        <span class="muted">${esc(operator || "Unknown operator")}</span><br>
        ${esc(C.access_labels[access])}<br>
        ${points} point${points === 1 ? "" : "s"}${kw ? ` · up to ${nf0.format(kw)} kW` : ""}
        ${op === false ? '<br><span class="muted">Listed as not operational</span>' : ""}`);
      g.addLayer(m);
    }
    chargerLayer = g.addTo(map);
    $("#charger-count").textContent = `${nf0.format(nSites)} sites · ${nf0.format(nPts)} points shown. Faded dots are listed as not operational.`;
  }
  function renderAccessChips() {
    const C = state.chargers, P = pal();
    const counts = [0, 0, 0, 0];
    C.rows.forEach((r) => counts[r[2]]++);
    $("#access-chips").innerHTML = C.access_labels.map((lab, i) => counts[i] ? `
      <button type="button" class="chip ${state.access.has(i) ? "" : "off"}" data-a="${i}" aria-pressed="${state.access.has(i)}">
        <span class="dot" style="background:${P.access[i]}"></span>${esc(lab)} <b>${nf0.format(counts[i])}</b>
      </button>` : "").join("");
  }

  // ---------------------------------------------------------------- ranking
  function renderWeights() {
    let html = "", lastGroup = "";
    for (const c of COMPONENTS) {
      if (c.group !== lastGroup) { html += `<div class="wgroup">${c.group}</div>`; lastGroup = c.group; }
      html += `<div class="wrow">
        <label for="w-${c.k}">${c.label}<small>${c.sub}</small></label>
        <input type="range" id="w-${c.k}" data-k="${c.k}" min="0" max="0.5" step="0.01" value="${state.weights[c.k]}">
        <output id="o-${c.k}">${state.weights[c.k].toFixed(2)}</output></div>`;
    }
    $("#weights").innerHTML = html;
  }
  function syncWeightInputs() {
    for (const c of COMPONENTS) {
      $(`#w-${c.k}`).value = state.weights[c.k];
      $(`#o-${c.k}`).textContent = state.weights[c.k].toFixed(2);
    }
    const isDefault = isDefaultWeights();
    const isEqual = COMPONENTS.every((c) => Math.abs(state.weights[c.k] - PRESETS.equal[c.k]) < 1e-9);
    $$(".presets button").forEach((b) => b.classList.toggle("on", (b.dataset.preset === "default" && isDefault) || (b.dataset.preset === "equal" && isEqual)));
    $("#rank-note").textContent = isDefault ? "· project weights" : "· custom weights, change vs. project";
  }
  function isDefaultWeights() {
    return COMPONENTS.every((c) => Math.abs(state.weights[c.k] - PRESETS.default[c.k]) < 1e-9);
  }
  function recompute() {
    state.scores = computeScores(state.props, state.weights);
    renderRanking();
    if (state.layer === "score") restyle();
    if (state.selected) renderPlace();
  }
  function renderRanking() {
    const top = [...state.scores.entries()].sort((a, b) => a[1].rank - b[1].rank).slice(0, 20);
    const isDefault = isDefaultWeights();
    $("#ranking").innerHTML = top.map(([code, s]) => {
      const p = state.byCode.get(code);
      const d0 = state.defaultRanks.get(code);
      let delta = "";
      if (!isDefault) {
        if (d0 > 20) delta = `<span class="d new" title="Not in the top 20 with project weights">new</span>`;
        else if (d0 > s.rank) delta = `<span class="d up" title="Up from #${d0}">▲${d0 - s.rank}</span>`;
        else if (d0 < s.rank) delta = `<span class="d down" title="Down from #${d0}">▼${s.rank - d0}</span>`;
        else delta = `<span class="d same">–</span>`;
      }
      return `<li tabindex="0" data-code="${code}" class="${state.selected === code ? "sel" : ""}">
        <span class="n">${s.rank}</span>
        <span><span class="nm">${esc(p.name)}</span><span class="barw"><i style="width:${s.score}%"></i></span></span>
        <span class="sc">${nf0.format(s.score)}</span>${delta || "<span></span>"}</li>`;
    }).join("");
  }

  // ---------------------------------------------------------------- place
  function renderPlace() {
    const p = state.byCode.get(state.selected);
    const el = $("#place");
    if (!p) { el.innerHTML = `<p class="empty">Click a municipality on the map, pick one from the ranking, or search above.</p>`; return; }
    const s = state.scores.get(p.ine_code);
    const badges = [];
    if (!p.eligible) badges.push(`<span class="badge">Not scored: under 5,000 residents</span>`);
    if (p.fleet_flag) badges.push(`<span class="badge warn" title="DGT registers vehicles at the owner's tax address; resident EVs were re-estimated">Fleet registrations: EVs re-estimated</span>`);

    let scoreHtml = "";
    if (s) {
      const custom = !isDefaultWeights();
      scoreHtml = `<div class="score-card"><span class="big">${nf0.format(s.score)}<small>/100</small></span>
        <span class="rk">Rank <b>${s.rank}</b> of ${state.scores.size}${custom ? ` <br><span class="hint">#${state.defaultRanks.get(p.ine_code)} with project weights</span>` : ""}</span></div>
        <p class="hint" style="margin-top:0">Across the five weightings tested in the notebook: rank ${p.rank_best}–${p.rank_worst}, in the top 20 in ${p.top20_n} of 5.</p>`;
    }

    const maxV = Math.max(p.public_points, p.expected) * 1.15 || 1;
    const obsExp = `
      <h3 class="sub">Supply vs. peer benchmark</h3>
      <div class="obs-exp">
        <div class="track"><div class="line"></div>
          <div class="mk o" style="left:${(p.public_points / maxV) * 100}%"></div>
          <div class="mk e" style="left:${(p.expected / maxV) * 100}%"></div></div>
        <div class="lbls"><span class="o">Observed ${nf0.format(p.public_points)}</span><span class="e">Expected ${fmtN(p.expected)}</span></div>
      </div>
      <p class="hint">${fmtX(p.ratio)} the points similar municipalities have. Probability of a shortfall: ${fmtPct(p.p_shortfall)}.</p>`;

    const comps = p.eligible ? `<h3 class="sub">Score components <span>(percentile among scored municipalities)</span></h3>` +
      COMPONENTS.map((c) => `<div class="comp"><span>${c.label}</span><span class="barw"><i style="width:${p[c.k] * 100}%"></i></span><b>${nf0.format(p[c.k] * 100)}</b></div>`).join("") : "";

    const madrid = p.ine_code === 28079 ? `<p class="note">Madrid city has the largest absolute shortfall (~890 points) but only a moderate relative one. Locating it needs district-level analysis.</p>` : "";

    el.innerHTML = `
      <div class="place-head"><h2>${esc(p.name)}</h2>
        <p>INE ${p.ine_code} · ${nf0.format(p.population)} residents · ${nf1.format(p.area_km2)} km²</p>${badges.join("")}</div>
      ${scoreHtml}
      <div class="kv">
        <div><b>${nf0.format(p.public_points)}</b><span>Public points (${nf0.format(p.public_sites)} sites)</span></div>
        <div><b>${nf0.format(p.public_fast_sites)}</b><span>Fast public sites</span></div>
        <div><b>${fmtN(p.pts_per_10k)}</b><span>Points per 10k residents</span></div>
        <div><b>${p.public_points ? fmtN(p.evs_per_pt) : "—"}</b><span>Resident EVs per point</span></div>
        <div><b>${nf0.format(p.evs_res)}</b><span>Resident EVs (est.)</span></div>
        <div><b>${nf0.format(p.private_sites)}</b><span>Private / customer-only sites</span></div>
        <div><b>${nf0.format(p.fuel_stations)}</b><span>Fuel stations</span></div>
        <div><b>${fmtEur(p.income_pp)}</b><span>Net income per person</span></div>
        <div><b>${fmtN(p.density)}</b><span>Residents per km²</span></div>
        <div><b>${fmtN(p.dist_km)} km</b><span>To nearest public charger</span></div>
      </div>
      ${obsExp}${comps}${madrid}`;
  }

  function select(code, { zoom = false, tab = true } = {}) {
    const prev = state.selected;
    state.selected = code;
    if (prev && state.polys.has(prev)) state.polys.get(prev).setStyle(polyStyle(state.byCode.get(prev)));
    const lyr = state.polys.get(code);
    if (lyr) { lyr.setStyle(polyStyle(state.byCode.get(code))); lyr.bringToFront(); }
    if (zoom && lyr) map.flyToBounds(lyr.getBounds(), { padding: [40, 40], maxZoom: 12, duration: 0.6 });
    renderPlace();
    $$("#ranking li").forEach((li) => li.classList.toggle("sel", +li.dataset.code === code));
    if (tab) setTab("place");
    writeHash();
  }

  // ---------------------------------------------------------------- model
  const TERM_LABELS = { income: "Net income per person", density: "Population density", evs: "Resident EVs", retail: "Retail POIs", office: "Office POIs", transit: "Rail stations", fuel: "Fuel stations" };
  let modelKind = "nb";
  function renderForest() {
    const terms = state.model.terms.filter((t) => t.term !== "alpha");
    const key = modelKind === "nb" ? ["IRR", "ci_low", "ci_high", "p_value"] : ["IRR_poisson", "ci_low_poisson", "ci_high_poisson", "p_value_poisson"];
    const rows = terms.map((t) => ({ name: TERM_LABELS[t.term] || t.term, irr: t[key[0]], lo: t[key[1]], hi: t[key[2]], p: t[key[3]], vif: t.VIF }))
      .sort((a, b) => b.irr - a.irr);
    const W = 360, L0 = 128, R0 = 312, rowH = 30, top = 8, H = top + rows.length * rowH + 26;
    const dom = [0.6, 2.2], lx = (v) => L0 + ((Math.log(v) - Math.log(dom[0])) / (Math.log(dom[1]) - Math.log(dom[0]))) * (R0 - L0);
    const ticks = [0.75, 1, 1.5, 2];
    let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Incidence-rate ratios with 95% confidence intervals">`;
    ticks.forEach((t) => { svg += `<line class="${t === 1 ? "ref" : "grid"}" x1="${lx(t)}" x2="${lx(t)}" y1="${top}" y2="${H - 22}"/><text class="num" x="${lx(t)}" y="${H - 6}" text-anchor="middle">${t}</text>`; });
    rows.forEach((r, i) => {
      const y = top + i * rowH + rowH / 2, sig = r.p < 0.05;
      svg += `<g class="row ${sig ? "" : "ns"}" data-i="${i}">
        <rect class="hitbg" x="0" y="${y - rowH / 2}" width="${W}" height="${rowH}" rx="4"/>
        <text x="0" y="${y + 4}">${esc(r.name)}</text>
        <line class="ci" x1="${lx(Math.max(r.lo, dom[0]))}" x2="${lx(Math.min(r.hi, dom[1]))}" y1="${y}" y2="${y}"/>
        <circle class="pt" cx="${lx(r.irr)}" cy="${y}" r="5"/>
        <text class="num" x="${W}" y="${y + 4}" text-anchor="end">${r.irr.toFixed(2)}</text></g>`;
    });
    svg += `</svg><div class="legend-extra"><span><i class="sw" style="background:var(--bar)"></i>p &lt; 0.05</span><span><i class="sw" style="background:var(--text-3)"></i>not significant</span><span style="color:var(--text-3)">95% CI · log scale</span></div>`;
    const el = $("#forest");
    el.innerHTML = svg;
    el.style.position = "relative";
    const t = document.createElement("div");
    t.className = "map-tip"; t.hidden = true; el.appendChild(t);
    $$(".row", el).forEach((g) => {
      g.addEventListener("mousemove", (e) => {
        const r = rows[+g.dataset.i], box = el.getBoundingClientRect();
        t.innerHTML = `<b>${esc(r.name)}</b><span class="v">IRR ${r.irr.toFixed(2)} (${r.lo.toFixed(2)}–${r.hi.toFixed(2)})</span><span class="v">p = ${r.p < 0.001 ? "< 0.001" : r.p.toFixed(3)} · VIF ${r.vif}</span>`;
        t.hidden = false;
        const x = Math.min(e.clientX - box.left + 12, box.width - t.offsetWidth);
        t.style.left = Math.max(0, x) + "px"; t.style.top = e.clientY - box.top + 14 + "px";
      });
      g.addEventListener("mouseleave", () => (t.hidden = true));
    });
  }

  // ---------------------------------------------------------------- tabs / hash
  function setTab(id) {
    $$(".tabs button").forEach((b) => { const on = b.dataset.tab === id; b.classList.toggle("on", on); b.setAttribute("aria-selected", on); });
    $$(".tab-pane").forEach((p) => p.classList.toggle("on", p.id === "tab-" + id));
  }
  function writeHash() {
    const h = new URLSearchParams();
    if (state.layer !== "score") h.set("layer", state.layer);
    if (state.selected) h.set("m", state.selected);
    if (state.showChargers) h.set("chargers", "1");
    const s = h.toString();
    history.replaceState(null, "", s ? "#" + s : location.pathname + location.search);
  }
  function readHash() {
    const h = new URLSearchParams(location.hash.slice(1));
    if (h.get("layer") && layerById[h.get("layer")]) state.layer = h.get("layer");
    if (h.get("chargers") === "1") state.showChargers = true;
    return h.get("m") ? +h.get("m") : null;
  }

  // ---------------------------------------------------------------- wiring
  function wire() {
    const sel = $("#layer");
    let html = "", group = "";
    for (const l of LAYERS) {
      if (l.group !== group) { if (group) html += "</optgroup>"; html += `<optgroup label="${l.group}">`; group = l.group; }
      html += `<option value="${l.id}">${esc(l.label)}</option>`;
    }
    sel.innerHTML = html + "</optgroup>";
    sel.value = state.layer;
    sel.addEventListener("change", () => { state.layer = sel.value; restyle(); writeHash(); });

    $("#muni-list").innerHTML = [...state.props].sort((a, b) => a.name.localeCompare(b.name, "es")).map((p) => `<option value="${esc(p.name)}">`).join("");
    const search = $("#search");
    const go = () => {
      const q = norm(search.value);
      if (!q) return;
      const hit = state.props.find((p) => norm(p.name) === q) || state.props.find((p) => norm(p.name).startsWith(q)) || state.props.find((p) => norm(p.name).includes(q));
      if (hit) { select(hit.ine_code, { zoom: true }); search.blur(); }
    };
    search.addEventListener("change", go);
    search.addEventListener("keydown", (e) => { if (e.key === "Enter") go(); });

    $$(".tabs button").forEach((b) => b.addEventListener("click", () => setTab(b.dataset.tab)));

    renderWeights();
    $("#weights").addEventListener("input", (e) => {
      const k = e.target.dataset.k; if (!k) return;
      state.weights[k] = +e.target.value;
      syncWeightInputs(); recompute();
    });
    $$(".presets button").forEach((b) => b.addEventListener("click", () => {
      state.weights = { ...PRESETS[b.dataset.preset] };
      syncWeightInputs(); recompute();
    }));
    const rk = $("#ranking");
    rk.addEventListener("click", (e) => { const li = e.target.closest("li"); if (li) select(+li.dataset.code, { zoom: true }); });
    rk.addEventListener("keydown", (e) => { const li = e.target.closest("li"); if (li && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); select(+li.dataset.code, { zoom: true }); } });

    const showC = $("#show-chargers");
    showC.checked = state.showChargers;
    $("#charger-filters").hidden = !state.showChargers;
    showC.addEventListener("change", () => {
      state.showChargers = showC.checked;
      $("#charger-filters").hidden = !showC.checked;
      renderChargers(); restyle(); writeHash();
    });
    $("#access-chips").addEventListener("click", (e) => {
      const b = e.target.closest(".chip"); if (!b) return;
      const a = +b.dataset.a;
      state.access.has(a) ? state.access.delete(a) : state.access.add(a);
      renderAccessChips(); renderChargers();
    });
    $$("#charger-filters .seg button").forEach((b) => b.addEventListener("click", () => {
      state.minKw = +b.dataset.kw;
      $$("#charger-filters .seg button").forEach((x) => x.classList.toggle("on", x === b));
      renderChargers();
    }));
    $$("#model-toggle button").forEach((b) => b.addEventListener("click", () => {
      modelKind = b.dataset.m;
      $$("#model-toggle button").forEach((x) => x.classList.toggle("on", x === b));
      renderForest();
    }));

    const applyTheme = () => { setBasemap(); restyle(); renderAccessChips(); renderChargers(); };
    $("#theme-btn").addEventListener("click", () => {
      root.dataset.theme = isDark() ? "light" : "dark";
      store.set("theme", root.dataset.theme);
      applyTheme();
    });
    matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => { if (!root.dataset.theme) applyTheme(); });

    if (REPO_URL) $("#repo-link").innerHTML = ` · <a href="${esc(REPO_URL)}" rel="noopener">Code on GitHub</a>`;
  }

  function renderStats() {
    const C = state.chargers.rows;
    const restricted = C.filter((r) => r[2] === 2).length;
    const pts = state.props.reduce((s, p) => s + p.public_points, 0);
    $("#stats").innerHTML = `
      <div class="stat"><b>${nf0.format(C.length)}</b><span>listed charging sites</span></div>
      <div class="stat"><b>${nf0.format((restricted / C.length) * 100)}%</b><span>closed to the public</span></div>
      <div class="stat"><b>${nf0.format(pts)}</b><span>public charging points</span></div>`;
  }

  // ---------------------------------------------------------------- boot
  Promise.all([
    fetch("data/municipalities.geojson").then((r) => r.json()),
    fetch("data/chargers.json").then((r) => r.json()),
    fetch("data/model.json").then((r) => r.json()),
  ]).then(([geo, chargers, model]) => {
    state.props = geo.features.map((f) => f.properties);
    state.props.forEach((p) => state.byCode.set(p.ine_code, p));
    state.chargers = chargers;
    state.model = model;
    state.scores = computeScores(state.props, state.weights);
    state.scores.forEach((s, code) => state.defaultRanks.set(code, s.rank));

    const initialSel = readHash();
    setBasemap();
    const gj = L.geoJSON(geo, {
      style: (f) => polyStyle(f.properties),
      onEachFeature: (f, lyr) => {
        const p = f.properties;
        state.polys.set(p.ine_code, lyr);
        lyr.on("mousemove", (e) => {
          const l = layerById[state.layer];
          const v = l.kind === "none" ? null : l.get(p);
          const val = l.kind === "none" ? "" : `<span class="v">${esc(l.label)}: ${v == null ? esc(l.na || "no data") : esc(l.fmt(v))}</span>`;
          showTip(e, `<b>${esc(p.name)}</b>${val}`);
          if (state.selected !== p.ine_code) lyr.setStyle({ weight: 2, color: pal().sel });
        });
        lyr.on("mouseout", () => { hideTip(); if (state.selected !== p.ine_code) lyr.setStyle(polyStyle(p)); });
        lyr.on("click", () => select(p.ine_code));
      },
    }).addTo(map);
    map.fitBounds(gj.getBounds(), { padding: [10, 10] });
    map.on("movestart", hideTip);

    wire();
    renderStats();
    renderAccessChips();
    syncWeightInputs();
    renderRanking();
    renderForest();
    restyle();
    renderChargers();
    if (initialSel && state.byCode.has(initialSel)) select(initialSel, { zoom: true });
  }).catch((err) => {
    console.error(err);
    $("#map").innerHTML = `<p style="padding:24px">Could not load the data. If you opened this file directly, serve the folder over HTTP (e.g. <code>python -m http.server</code> in <code>docs/</code>).</p>`;
  });
})();
