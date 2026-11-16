import nfl from "./sports/nfl.js";
import { loadMeta, loadTable, statList, metricLabel, filterRows, aggregate, timeSeries, leagueAverage, linearFit } from "./data.js";
import { renderTrend, renderScatter, renderBar, seriesColor, formatter, hideTip } from "./charts.js";

const SPORTS = { nfl };
const $ = (id) => document.getElementById(id);
const MAX_SERIES = 8;
const MAX_METRICS = 4;

let sport = nfl;
let meta = null;
let state = null;
let statOptions = { team: [], player: [] };
let current = { tables: [], tableRows: [], csv: null };
let renderToken = 0;

// ------------------------------------------------------------------ state
function defaultState() {
  return {
    sport: sport.id,
    chart: sport.defaults.chart,
    entity: sport.defaults.entity,
    metrics: structuredClone(sport.defaults.metrics),
    seasons: [meta.latestSeason],
    weekFrom: 1, weekTo: 18, stype: "R",
    bucket: "week", rolling: 0,
    teams: [], opps: [], players: [], positions: [],
    selMode: "filter",
    topN: "auto", minGames: 0, qualStat: "auto", qualMin: "",
    fit: true, labels: true, avg: true,
  };
}
const playerDefaults = () => [
  { stat: "targets", per: "tm_targets", pct: true },
  { stat: "receiving_yards", per: "games" },
];

function readHash() {
  try {
    const h = location.hash.slice(1);
    if (!h) return null;
    return JSON.parse(decodeURIComponent(h));
  } catch { return null; }
}
function writeHash() {
  history.replaceState(null, "", "#" + encodeURIComponent(JSON.stringify(state)));
}
function sanitize(s) {
  const d = defaultState();
  const out = { ...d, ...(s || {}) };
  const avail = new Set(meta.seasons.map((x) => x.season));
  out.seasons = (out.seasons || []).filter((x) => avail.has(x));
  if (!out.seasons.length) out.seasons = [meta.latestSeason];
  if (!Array.isArray(out.metrics) || !out.metrics.length) out.metrics = d.metrics;
  for (const k of ["teams", "opps", "players", "positions"]) if (!Array.isArray(out[k])) out[k] = [];
  return out;
}

// ------------------------------------------------------------------ boot
async function boot() {
  meta = await loadMeta(sport);
  const latest = meta.seasons.find((s) => s.season === meta.latestSeason);
  const upd = new Date(meta.updated);
  $("updated").textContent = `Data through ${meta.latestSeason} ${sport.weekLabel(latest.maxWeek, latest.maxWeek > 18 ? "P" : "R", meta.latestSeason)} · refreshed ${upd.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;
  state = sanitize(readHash());
  // Stat lists come from the latest season's columns.
  const [tt, pt] = await Promise.all([loadTable(sport, meta, "team", meta.latestSeason), loadTable(sport, meta, "player", meta.latestSeason)]);
  statOptions.team = statList(sport, tt, "team");
  statOptions.player = statList(sport, pt, "player");
  buildStaticControls();
  syncControls();
  render();
}

// ------------------------------------------------------------------ controls
function seg(id, key, after) {
  const el = $(id);
  el.addEventListener("click", (e) => {
    const b = e.target.closest("button[data-v]");
    if (!b) return;
    const v = b.dataset.v;
    if (state[key] === v) return;
    state[key] = v;
    after?.(v);
    update();
  });
}

function buildStaticControls() {
  seg("chartSeg", "chart", (v) => {
    if (v === "scatter" && state.metrics.length < 2) state.metrics.push(defaultSecond());
  });
  seg("entitySeg", "entity", () => {
    // Keep metrics that exist for the new entity; otherwise switch to its defaults.
    const ok = state.metrics.filter((m) => valid(m));
    state.metrics = ok.length ? ok : state.entity === "player" ? playerDefaults() : structuredClone(sport.defaults.metrics);
    if (state.chart === "scatter" && state.metrics.length < 2) state.metrics.push(defaultSecond());
    state.qualStat = "auto"; state.qualMin = "";
  });
  seg("stypeSeg", "stype");
  seg("selModeSeg", "selMode");

  const sideSeg = $("sideSeg");
  for (const [v, txt] of sport.sides) {
    const b = document.createElement("button");
    b.type = "button"; b.dataset.v = v; b.textContent = txt;
    sideSeg.appendChild(b);
  }
  setupPicker();

  // seasons
  const sEl = $("seasons");
  for (const s of meta.seasons) {
    const b = document.createElement("button");
    b.className = "chip"; b.dataset.v = s.season; b.textContent = s.season;
    b.onclick = () => {
      const set = new Set(state.seasons);
      if (set.has(s.season)) { if (set.size > 1) set.delete(s.season); } else set.add(s.season);
      state.seasons = [...set].sort();
      update();
    };
    sEl.appendChild(b);
  }
  for (const id of ["weekFrom", "weekTo"]) {
    const sel = $(id);
    for (let w = 1; w <= 18; w++) sel.add(new Option(`Week ${w}`, w));
    sel.onchange = () => {
      state[id] = Number(sel.value);
      if (state.weekFrom > state.weekTo) { if (id === "weekFrom") state.weekTo = state.weekFrom; else state.weekFrom = state.weekTo; }
      update();
    };
  }
  $("bucket").onchange = (e) => { state.bucket = e.target.value; update(); };
  $("rolling").onchange = (e) => { state.rolling = Number(e.target.value); update(); };

  // team + opponent logo grids, ordered by conference/division
  const teams = Object.entries(meta.teams)
    .sort((a, b) => (a[1].div || "").localeCompare(b[1].div || "") || a[0].localeCompare(b[0]));
  const activeTeams = new Set(teamsInData());
  for (const [gridId, key] of [["teams", "teams"], ["opps", "opps"]]) {
    const g = $(gridId);
    for (const [abbr, t] of teams) {
      if (!activeTeams.has(abbr)) continue;
      const b = document.createElement("button");
      b.className = "logo-btn"; b.dataset.v = abbr; b.title = t.name;
      b.setAttribute("aria-label", t.name);
      const img = document.createElement("img");
      img.src = t.logo; img.alt = abbr; img.loading = "lazy";
      b.appendChild(img);
      b.onclick = () => {
        const set = new Set(state[key]);
        set.has(abbr) ? set.delete(abbr) : set.add(abbr);
        state[key] = [...set];
        update();
      };
      g.appendChild(b);
    }
  }

  // positions
  const pEl = $("positions");
  for (const p of sport.positions) {
    const b = document.createElement("button");
    b.className = "chip"; b.dataset.v = p; b.textContent = p;
    b.onclick = () => {
      const set = new Set(state.positions);
      set.has(p) ? set.delete(p) : set.add(p);
      state.positions = [...set];
      update();
    };
    pEl.appendChild(b);
  }

  setupPlayerSearch();

  $("topN").onchange = (e) => { state.topN = e.target.value; update(); };
  $("minGames").onchange = (e) => { state.minGames = Math.max(0, Number(e.target.value) || 0); update(); };
  $("qualStat").onchange = (e) => { state.qualStat = e.target.value || "auto"; state.qualMin = ""; update(); };
  $("qualMin").onchange = (e) => { state.qualMin = e.target.value === "" ? "" : Math.max(0, Number(e.target.value)); update(); };
  for (const k of ["fit", "labels", "avg"]) $(k).onchange = (e) => { state[k] = e.target.checked; update(); };

  $("copyLink").onclick = async () => {
    writeHash();
    try { await navigator.clipboard.writeText(location.href); toast("Link copied"); } catch { toast("Copy the address bar to share"); }
  };
  $("saveModel").onclick = () => {
    const name = prompt("Name this model", $("title").textContent.slice(0, 60));
    if (!name) return;
    const list = savedModels();
    list.unshift({ name, state: structuredClone(state), at: Date.now() });
    saveModels(list.slice(0, 50));
    renderSaved();
    $("savedWrap").open = true;
    toast("Saved");
  };
  $("reset").onclick = () => { state = defaultState(); update(); };
  $("csv").onclick = downloadCsv;
  $("jump").onclick = (e) => { e.preventDefault(); $("builder").scrollIntoView({ behavior: "smooth" }); };
  $("themeBtn").onclick = () => {
    const dark = getComputedStyle(document.documentElement).colorScheme === "dark";
    document.documentElement.dataset.theme = dark ? "light" : "dark";
    try { localStorage.setItem("sa.theme", document.documentElement.dataset.theme); } catch {}
    render();
  };
  renderSaved();

  let rt;
  new ResizeObserver(() => { clearTimeout(rt); rt = setTimeout(() => current.draw?.(), 120); }).observe($("chart"));
  window.addEventListener("hashchange", () => { const s = readHash(); if (s) { state = sanitize(s); syncControls(); render(); } });
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => current.draw?.());
}

function teamsInData() {
  return [...new Set(Object.keys(meta.teams))].filter((abbr) => {
    // Only teams that exist in the loaded seasons (drops OAK/SD/STL duplicates where relocated).
    return !["OAK", "SD", "STL", "LAR"].includes(abbr);
  });
}

const valid = (m) => {
  const opts = new Set(statOptions[state.entity]);
  return opts.has(m.stat) && (!m.per || opts.has(m.per));
};
function defaultSecond() {
  const used = new Set(state.metrics.map((m) => m.stat));
  const pool = sport.presets[state.entity];
  return { ...pick(pool.find((p) => !used.has(p.stat)) || pool[0]) };
}
const pick = (p) => ({ stat: p.stat, per: p.per || null, pct: !!p.pct });

function statSelect(value, opts = {}) {
  return fillStatSelect(document.createElement("select"), value, opts);
}
function fillStatSelect(sel, value, { allowNone = false, noneLabel = "" } = {}) {
  sel.replaceChildren();
  if (allowNone) sel.add(new Option(noneLabel, ""));
  const groups = new Map();
  for (const c of statOptions[state.entity]) {
    const g = sport.group(c);
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(c);
  }
  for (const g of sport.groupOrder) {
    if (!groups.has(g)) continue;
    const og = document.createElement("optgroup");
    og.label = g;
    for (const c of groups.get(g).sort((a, b) => sport.label(a).localeCompare(sport.label(b)))) og.appendChild(new Option(sport.label(c), c));
    sel.appendChild(og);
  }
  sel.value = value ?? "";
  return sel;
}

function metricRoleNames() {
  if (state.chart === "scatter") return ["Y axis", "X axis"];
  if (state.chart === "bar") return ["Rank by"];
  return state.metrics.map((_, i) => `Stat ${i + 1}`);
}

// ---- tag-style stat builder (UI-only state lives here, not in the URL)
const ui = { slot: 0, side: "all", query: "", divOpen: -1, divQuery: "", divAll: false };

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}
function tagChip(text, { on = false, badge = null, title = "", onClick, cls = "" } = {}) {
  const b = el("button", `tag-chip ${on ? "on" : ""} ${cls}`.trim());
  b.type = "button";
  b.setAttribute("aria-pressed", on);
  if (title) b.title = title;
  b.appendChild(document.createTextNode(text));
  if (badge != null) b.appendChild(el("span", "tag-badge", badge));
  if (onClick) b.onclick = onClick;
  return b;
}
const groupBy = (keys) => {
  const g = new Map();
  for (const k of keys) {
    const name = sport.group(k);
    if (!g.has(name)) g.set(name, []);
    g.get(name).push(k);
  }
  return sport.groupOrder.filter((n) => g.has(n)).map((n) => [n, g.get(n).sort((a, b) => sport.label(a).localeCompare(sport.label(b)))])
    .concat([...g.keys()].filter((n) => !sport.groupOrder.includes(n)).map((n) => [n, g.get(n)]));
};
const matchQ = (k, q) => !q || sport.label(k).toLowerCase().includes(q) || k.includes(q);

function slotCount() { return state.chart === "trend" ? state.metrics.length : state.chart === "scatter" ? 2 : 1; }

// A stat chip was tapped in the main picker.
function chooseStat(key) {
  const fresh = { stat: key, per: null, pct: false };
  if (state.chart === "trend") {
    const i = state.metrics.findIndex((m) => m.stat === key);
    if (i >= 0) { if (state.metrics.length > 1) { state.metrics.splice(i, 1); ui.slot = 0; } }
    else if (state.metrics.length < MAX_METRICS) { state.metrics.push(fresh); ui.slot = state.metrics.length - 1; }
    else { toast(`Up to ${MAX_METRICS} stats. Remove one first.`); return; }
  } else {
    const m = state.metrics[ui.slot] || (state.metrics[ui.slot] = fresh);
    m.stat = key;
    // keep the "per" choice only if that divisor still makes sense for the new stat
    if (m.per && m.per !== "games") {
      const d = sport.divisors(key, statOptions[state.entity]);
      if (!d.suggested.includes(m.per) && !d.related.includes(m.per)) { m.per = null; m.pct = false; }
    }
  }
  update();
}
function choosePreset(p) {
  const m = pick(p);
  if (state.chart === "trend") {
    const i = state.metrics.findIndex((x) => x.stat === m.stat && x.per === m.per);
    if (i >= 0) { if (state.metrics.length > 1) state.metrics.splice(i, 1); }
    else if (state.metrics.length < MAX_METRICS) state.metrics.push(m);
    else state.metrics[ui.slot] = m;
  } else state.metrics[ui.slot] = m;
  update();
}

function renderMetricRows() {
  const roles = metricRoleNames();
  const n = slotCount();
  if (ui.slot >= n) ui.slot = 0;
  $("metricsTitle").textContent = state.chart === "scatter" ? "Axes" : state.chart === "bar" ? "Stat" : "Stats";
  const box = $("metrics");
  box.replaceChildren();
  const shown = state.metrics.slice(0, n);
  const multiSlot = state.chart !== "trend" && n > 1;

  shown.forEach((m, i) => {
    const card = el("div", `metric ${multiSlot && ui.slot === i ? "active" : ""}`);
    if (multiSlot) {
      card.onclick = (e) => { if (e.target === card || e.target.closest(".metric-head")) { ui.slot = i; renderMetricRows(); } };
    }
    const head = el("div", "metric-head");
    const tag = el("span", "metric-tag", roles[i]);
    if (multiSlot && ui.slot === i) tag.appendChild(el("span", "editing", "· tap a stat below to change"));
    head.appendChild(tag);
    if (state.chart === "trend" && state.metrics.length > 1) {
      const rm = el("button", "remove", "×");
      rm.title = "Remove"; rm.setAttribute("aria-label", `Remove ${sport.label(m.stat)}`);
      rm.onclick = () => { state.metrics.splice(i, 1); ui.slot = 0; ui.divOpen = -1; update(); };
      head.appendChild(rm);
    }
    card.appendChild(head);

    // the stat itself, as a filled tag; tapping it targets this slot
    const statLine = el("div", "metric-line");
    statLine.appendChild(tagChip(sport.label(m.stat), {
      on: true, cls: "big", title: multiSlot ? "Tap a stat in the list below to replace" : "",
      onClick: () => { ui.slot = i; renderMetricRows(); $("statSearch").focus({ preventScroll: true }); },
    }));
    card.appendChild(statLine);

    // Total | Per game | Per stat
    const mode = !m.per ? "total" : m.per === "games" ? "games" : "per";
    const segEl = el("div", "seg small mode-seg");
    segEl.setAttribute("role", "group");
    segEl.setAttribute("aria-label", "Show as");
    for (const [v, txt] of [["total", "Total"], ["games", "Per game"], ["per", "Per stat ÷"]]) {
      const b = el("button", v === mode ? "on" : "", txt);
      b.type = "button";
      b.setAttribute("aria-pressed", v === mode);
      b.onclick = () => {
        if (v === mode) return;
        if (v === "total") { m.per = null; m.pct = false; }
        else if (v === "games") { m.per = "games"; m.pct = false; }
        else {
          const d = sport.divisors(m.stat, statOptions[state.entity]);
          m.per = d.suggested.find((k) => k !== "games") || d.suggested[0] || "games";
          ui.divOpen = i; ui.divQuery = ""; ui.divAll = false;
        }
        update();
      };
      segEl.appendChild(b);
    }
    card.appendChild(segEl);

    if (m.per && m.per !== "games") {
      const perLine = el("div", "metric-line per-line");
      perLine.appendChild(el("span", "divide", "÷"));
      perLine.appendChild(tagChip(sport.label(m.per), {
        on: true, cls: "divisor", badge: ui.divOpen === i ? "▴" : "▾", title: "Change what it's divided by",
        onClick: () => { ui.divOpen = ui.divOpen === i ? -1 : i; ui.divQuery = ""; ui.divAll = false; renderMetricRows(); },
      }));
      const pct = el("label", "pct");
      const cb = document.createElement("input");
      cb.type = "checkbox"; cb.checked = !!m.pct;
      cb.onchange = () => { m.pct = cb.checked; update(); };
      pct.append(cb, document.createTextNode("as %"));
      perLine.appendChild(pct);
      card.appendChild(perLine);
      if (ui.divOpen === i) card.appendChild(divisorPicker(m));
    }
    box.appendChild(card);
  });
  renderPicker();
}

// Divisor picker: opportunity counts on the same side of the ball first, then other same-side stats.
function divisorPicker(m) {
  const wrap = el("div", "div-picker");
  const input = document.createElement("input");
  input.type = "search"; input.placeholder = "Search divisors"; input.value = ui.divQuery;
  input.setAttribute("aria-label", "Search divisors");
  const list = el("div", "tag-groups compact");
  const draw = () => {
    list.replaceChildren();
    const q = ui.divQuery.trim().toLowerCase();
    const d = sport.divisors(m.stat, statOptions[state.entity]);
    const sideName = { O: "offense", D: "defense", ST: "special teams", N: "" }[sport.side(m.stat)];
    const sections = [[`Best fit${sideName ? ` (${sideName} opportunities)` : ""}`, d.suggested.filter((k) => matchQ(k, q))]];
    if (q || ui.divAll) for (const [g, ks] of groupBy(d.related.filter((k) => matchQ(k, q)))) sections.push([g, ks]);
    else if (d.related.length) sections.push([`More ${sideName || "related"} stats`, null]);
    if (ui.divAll) for (const [g, ks] of groupBy(d.rest.filter((k) => matchQ(k, q)))) sections.push([`Other side: ${g}`, ks]);
    for (const [name, keys] of sections) {
      if (keys && !keys.length) continue;
      const grp = el("div", "tag-group");
      grp.appendChild(el("div", "tag-group-name", name));
      const chips = el("div", "tag-chips");
      if (!keys) {
        chips.appendChild(tagChip(`Show ${d.related.length} more`, { cls: "ghost", onClick: () => { ui.divAll = true; draw(); } }));
      } else {
        for (const k of keys) chips.appendChild(tagChip(sport.label(k), { on: k === m.per, onClick: () => { m.per = k; ui.divOpen = -1; update(); } }));
      }
      grp.appendChild(chips);
      list.appendChild(grp);
    }
    if (ui.divAll && !q) {
      const less = tagChip("Show fewer", { cls: "ghost", onClick: () => { ui.divAll = false; draw(); } });
      list.appendChild(less);
    } else if (!ui.divAll && d.rest.length) {
      const all = el("button", "link-btn small", "Show all stats, including the other side of the ball");
      all.type = "button";
      all.onclick = () => { ui.divAll = true; draw(); };
      list.appendChild(all);
    }
    if (!list.children.length) list.appendChild(el("p", "hint", "No stats match."));
  };
  input.oninput = () => { ui.divQuery = input.value; draw(); };
  draw();
  wrap.append(input, list);
  return wrap;
}

// Main stat picker: quick picks + searchable, grouped tags.
function renderPicker() {
  const used = new Map(); // stat -> badge
  const n = slotCount();
  state.metrics.slice(0, n).forEach((m, i) => {
    used.set(m.stat, state.chart === "scatter" ? ["Y", "X"][i] : state.chart === "trend" && n > 1 ? String(i + 1) : "");
  });

  const hint = $("pickHint");
  hint.textContent = state.chart === "trend"
    ? `Tap stats to add or remove them (up to ${MAX_METRICS}). Each one gets its own panel.`
    : state.chart === "scatter" ? `Tapping a stat sets the ${metricRoleNames()[ui.slot]}. Tap the other axis card to switch.`
    : "Tap a stat to rank by it.";

  const pre = $("presets");
  pre.replaceChildren();
  for (const p of sport.presets[state.entity]) {
    const on = state.metrics.slice(0, n).some((m) => m.stat === p.stat && (m.per || null) === (p.per || null));
    pre.appendChild(tagChip(p.name, { on, cls: "preset", title: p.note || "", onClick: () => choosePreset(p) }));
  }

  for (const b of $("sideSeg").children) {
    b.classList.toggle("on", b.dataset.v === ui.side);
    b.setAttribute("aria-pressed", b.dataset.v === ui.side);
  }
  const q = ui.query.trim().toLowerCase();
  const keys = statOptions[state.entity].filter((k) => sport.pickable(k) && matchQ(k, q) &&
    (ui.side === "all" || q || sport.side(k) === ui.side || sport.side(k) === "N"));
  const box = $("statGroups");
  box.replaceChildren();
  for (const [g, ks] of groupBy(keys)) {
    const grp = el("div", "tag-group");
    grp.appendChild(el("div", "tag-group-name", g));
    const chips = el("div", "tag-chips");
    for (const k of ks) {
      const on = used.has(k);
      chips.appendChild(tagChip(sport.label(k), { on, badge: on && used.get(k) ? used.get(k) : null, onClick: () => chooseStat(k) }));
    }
    grp.appendChild(chips);
    box.appendChild(grp);
  }
  if (!keys.length) box.appendChild(el("p", "hint", "No stats match."));
}

function setupPicker() {
  const s = $("statSearch");
  s.oninput = () => { ui.query = s.value; renderPicker(); };
  $("sideSeg").onclick = (e) => {
    const b = e.target.closest("button[data-v]");
    if (!b) return;
    ui.side = b.dataset.v;
    renderPicker();
  };
}

function syncControls() {
  document.body.className = `c-${state.chart} e-${state.entity}`;
  for (const [id, key] of [["chartSeg", "chart"], ["entitySeg", "entity"], ["stypeSeg", "stype"], ["selModeSeg", "selMode"]]) {
    for (const b of $(id).querySelectorAll("button")) {
      const on = b.dataset.v === state[key];
      b.classList.toggle("on", on);
      b.setAttribute("aria-pressed", on);
    }
  }
  if (state.chart === "scatter" && state.metrics.length < 2) state.metrics.push(defaultSecond());
  renderMetricRows();
  for (const b of $("seasons").children) b.classList.toggle("on", state.seasons.includes(Number(b.dataset.v)));
  $("weekFrom").value = state.weekFrom;
  $("weekTo").value = state.weekTo;
  $("bucket").value = state.bucket;
  $("rolling").value = state.rolling;
  $("rolling").disabled = state.bucket !== "week";
  for (const [gridId, key] of [["teams", "teams"], ["opps", "opps"]]) {
    const set = new Set(state[key]);
    for (const b of $(gridId).children) b.classList.toggle("on", set.has(b.dataset.v));
    $(gridId).classList.toggle("none-selected", set.size === 0);
  }
  $("oppCount").textContent = state.opps.length ? `(${state.opps.length})` : "";
  $("teamsTitle").textContent = state.entity === "team" ? "Teams" : "Player's team";
  $("teamsHint").textContent = state.chart === "trend" && state.entity === "team"
    ? "Pick up to 8 teams to draw. None picked = top teams by the stat."
    : "Tap logos to filter. None picked = all teams.";
  for (const b of $("positions").children) b.classList.toggle("on", state.positions.includes(b.dataset.v));
  renderPlayerChips();

  const top = $("topN");
  top.replaceChildren();
  const opts = state.chart === "trend" ? [3, 5, 8] : state.chart === "bar" ? [10, 15, 25, 32, 50] : [20, 30, 40, 60, 100];
  top.add(new Option("Auto", "auto"));
  for (const n of opts) top.add(new Option(n, n));
  if (state.entity === "team" && state.chart !== "trend") top.add(new Option("All", "all"));
  top.value = [...top.options].some((o) => o.value === String(state.topN)) ? String(state.topN) : "auto";
  $("minGames").value = state.minGames;

  fillStatSelect($("qualStat"), state.qualStat === "auto" ? "" : state.qualStat, { allowNone: true, noneLabel: "Auto" });
  $("qualMin").value = state.qualMin;
  $("fit").checked = state.fit;
  $("labels").checked = state.labels;
  $("avg").checked = state.avg;
}

// player search over people in the selected seasons
let peopleIndex = [];
function setupPlayerSearch() {
  const input = $("playerSearch"), box = $("suggest");
  let active = -1, results = [];
  const close = () => { box.classList.remove("open"); active = -1; };
  const choose = (p) => {
    if (!state.players.includes(p.id)) state.players.push(p.id);
    input.value = ""; close();
    update();
  };
  input.addEventListener("input", () => {
    const q = input.value.trim().toLowerCase();
    box.replaceChildren();
    if (q.length < 2) return close();
    results = peopleIndex.filter((p) => p.lname.includes(q)).slice(0, 12);
    results.forEach((p, i) => {
      const b = document.createElement("button");
      b.type = "button"; b.setAttribute("role", "option");
      const img = document.createElement("img"); img.src = sport.logo(p.team, meta); img.alt = "";
      const n = document.createElement("span"); n.textContent = p.name;
      const mt = document.createElement("span"); mt.className = "meta"; mt.textContent = `${p.pos} · ${p.team}`;
      b.append(img, n, mt);
      b.onmousedown = (e) => { e.preventDefault(); choose(p); };
      if (i === active) b.classList.add("active");
      box.appendChild(b);
    });
    box.classList.toggle("open", results.length > 0);
  });
  input.addEventListener("keydown", (e) => {
    if (!box.classList.contains("open")) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      active = (active + (e.key === "ArrowDown" ? 1 : -1) + results.length) % results.length;
      [...box.children].forEach((c, i) => c.classList.toggle("active", i === active));
    } else if (e.key === "Enter" && results[Math.max(0, active)]) { e.preventDefault(); choose(results[Math.max(0, active)]); }
    else if (e.key === "Escape") close();
  });
  input.addEventListener("blur", () => setTimeout(close, 100));
}
function buildPeopleIndex(tables) {
  const map = new Map();
  for (const t of tables) {
    if (t.kind !== "player") continue;
    const I = t.idx, last = new Map();
    for (const r of t.rows) last.set(r[I.pid], r[I.team]);
    for (const [id, p] of Object.entries(t.people)) {
      const prev = map.get(id);
      if (!prev || prev.season <= t.season) map.set(id, { id, name: p[0], lname: p[0].toLowerCase(), pos: p[1], team: last.get(id) || prev?.team || "", season: t.season });
    }
  }
  peopleIndex = [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
}
function renderPlayerChips() {
  const el = $("playerChips");
  el.replaceChildren();
  for (const id of state.players) {
    const p = peopleIndex.find((x) => x.id === id);
    const b = document.createElement("button");
    b.className = "chip on";
    if (p) { const img = document.createElement("img"); img.src = sport.logo(p.team, meta); img.alt = ""; img.width = 14; img.height = 14; b.appendChild(img); }
    b.appendChild(document.createTextNode(p ? p.name : id));
    const x = document.createElement("span"); x.className = "x"; x.textContent = "×"; b.appendChild(x);
    b.title = "Remove";
    b.onclick = () => { state.players = state.players.filter((v) => v !== id); update(); };
    el.appendChild(b);
  }
}

// ------------------------------------------------------------------ render
function update() {
  hideTip();
  syncControls();
  writeHash();
  render();
}

async function render() {
  const token = ++renderToken;
  const chartEl = $("chart");
  chartEl.classList.add("loading");
  let tables;
  try {
    tables = await Promise.all(state.seasons.map((s) => loadTable(sport, meta, state.entity, s)));
  } catch (e) {
    chartEl.classList.remove("loading");
    $("note").textContent = `Could not load data: ${e.message}`;
    return;
  }
  if (token !== renderToken) return;
  if (state.entity === "player") { buildPeopleIndex(tables); renderPlayerChips(); }
  chartEl.classList.remove("loading");
  const metrics = (state.chart === "trend" ? state.metrics : state.metrics.slice(0, state.chart === "scatter" ? 2 : 1)).filter(valid);
  if (!metrics.length) { $("note").textContent = "Pick a stat to get started."; return; }

  const highlightMode = state.chart !== "trend" && state.selMode === "highlight";
  const filterState = { ...state, teams: highlightMode ? [] : state.teams, players: highlightMode ? [] : state.players };
  const rows = filterRows(tables, filterState);
  const ctx = { tables, rows, metrics, highlightMode };
  current.draw = () => {
    $("legend").replaceChildren();
    $("note").textContent = "";
    $("model").hidden = true;
    if (state.chart === "trend") drawTrend(ctx);
    else if (state.chart === "scatter") drawScatter(ctx);
    else drawBar(ctx);
  };
  current.draw();
}

function windowText() {
  const s = state.seasons;
  const seasons = s.length === 1 ? `${s[0]}` : s.length === s[s.length - 1] - s[0] + 1 ? `${s[0]}–${s[s.length - 1]}` : s.join(", ");
  const weeks = state.stype === "P" ? "playoffs" : state.weekFrom === 1 && state.weekTo === 18 ? (state.stype === "RP" ? "regular season + playoffs" : "regular season") : `weeks ${state.weekFrom}–${state.weekTo}${state.stype === "RP" ? " + playoffs" : ""}`;
  const parts = [`${seasons} ${weeks}`];
  if (state.opps.length) parts.push(`vs ${state.opps.join(", ")}`);
  if (state.positions.length && state.entity === "player") parts.push(state.positions.join("/"));
  if (state.teams.length && !(state.chart === "trend") && state.selMode === "filter") parts.push(state.teams.join(", "));
  return parts.join(" · ");
}

// Qualifier: players only. Returns {stat, min}.
function qualifier(metrics, ents) {
  if (state.entity !== "player") return null;
  const m = metrics[0];
  let stat = state.qualStat !== "auto" && state.qualStat ? state.qualStat : !m.per || m.per === "games" || m.per.startsWith("tm_") ? m.stat : m.per;
  let min = state.qualMin;
  if (min === "" || min == null) {
    const top = Math.max(0, ...ents.map((e) => e.qual));
    min = Math.round(top * 0.3);
  }
  return { stat, min };
}

function rankEntities(rows, metrics, { sortBy = "value", defaultN }) {
  // first pass to compute the qualifier stat
  const m0 = metrics[0];
  const probeStat = state.entity === "player"
    ? (state.qualStat !== "auto" && state.qualStat ? state.qualStat : !m0.per || m0.per === "games" || m0.per.startsWith("tm_") ? m0.stat : m0.per)
    : null;
  let ents = aggregate(rows, metrics, probeStat);
  const q = qualifier(metrics, ents);
  const pinned = new Set(state.entity === "team" ? state.teams : state.players);
  ents = ents.filter((e) => e.games >= state.minGames && (!q || e.qual >= q.min || pinned.has(e.id)));
  ents = ents.filter((e) => e.vals.every((v) => v.value != null));
  if (sortBy === "value") ents.sort((a, b) => b.vals[0].value - a.vals[0].value);
  else ents.sort((a, b) => b.qual - a.qual || b.vals[0].value - a.vals[0].value);
  const n = state.topN === "all" ? Infinity : state.topN === "auto" ? defaultN : Number(state.topN);
  return { ents, n, q };
}

function entityLabel(e) {
  if (state.entity === "team") return { label: meta.teams[e.id]?.name || e.id, short: e.id };
  const parts = (e.name || e.id).split(" ");
  return { label: e.name || e.id, short: parts.length > 1 ? `${parts[0][0]}. ${parts.slice(1).join(" ")}` : e.name };
}

function drawTrend({ tables, rows, metrics }) {
  const opts = { bucket: state.bucket, rolling: state.rolling };
  // Which entities to draw: explicit picks, else top N by the first metric over the window.
  let ids = state.entity === "team" ? state.teams.slice(0, MAX_SERIES) : state.players.slice(0, MAX_SERIES);
  let auto = false;
  let q = null;
  if (!ids.length) {
    const r = rankEntities(rows, metrics.slice(0, 1), { defaultN: 5 });
    q = r.q;
    ids = r.ents.slice(0, Math.min(MAX_SERIES, r.n)).map((e) => e.id);
    auto = true;
  }
  const idSet = new Set(ids);
  const keyOf = (r) => (r.t.kind === "team" ? r.row[r.t.idx.team] : r.row[r.t.idx.pid]);
  const sel = rows.filter((r) => idSet.has(keyOf(r)));
  // League average uses every team (ignores the team picks), same time window.
  const lgRows = state.entity === "team" && state.avg ? filterRows(tables, { ...state, teams: [], players: [] }) : null;

  let buckets = null;
  const panels = metrics.map((m) => {
    const ts = timeSeries(sel, m, opts, sport);
    const avg = lgRows ? leagueAverage(lgRows, m, opts) : null;
    if (!buckets || ts.buckets.length > buckets.length) buckets = ts.buckets;
    const series = ids.map((id, i) => {
      const e = ts.series.get(id);
      const lab = state.entity === "team" ? { label: meta.teams[id]?.name || id, short: id } : entityLabel({ id, name: e?.name });
      return {
        id, label: lab.label, short: lab.short, color: seriesColor(i),
        logo: sport.logo(e?.team || id, meta), points: e?.points || new Map(),
      };
    });
    return { title: metricLabel(sport, m), pct: !!m.pct, series, avg };
  });
  // union of buckets across panels (sorted)
  const allB = new Map();
  for (const m of metrics) for (const b of timeSeries(sel, m, opts, sport).buckets) allB.set(b.key, b);
  if (lgRows) for (const b of timeSeries(lgRows, metrics[0], opts, sport).buckets) allB.set(b.key, b);
  buckets = [...allB.values()].sort((a, b) => (a.key < b.key ? -1 : 1));

  $("title").textContent = metrics.map((m) => metricLabel(sport, m)).join(" · ");
  $("subtitle").textContent = `${windowText()}${state.rolling > 1 && state.bucket === "week" ? ` · ${state.rolling}-game rolling` : ""}`;
  // legend (always present for ≥2 series)
  const lg = $("legend");
  if (panels[0].series.length > 1 || panels[0].avg) {
    for (const s of panels[0].series) {
      const sp = document.createElement("span");
      const k = document.createElement("i"); k.className = "key"; k.style.background = s.color;
      sp.appendChild(k);
      if (s.logo) { const img = document.createElement("img"); img.src = s.logo; img.alt = ""; sp.appendChild(img); }
      sp.appendChild(document.createTextNode(s.label));
      lg.appendChild(sp);
    }
    if (panels[0].avg) {
      const sp = document.createElement("span");
      const k = document.createElement("i"); k.className = "key dash";
      sp.append(k, document.createTextNode("League average"));
      lg.appendChild(sp);
    }
  }
  renderTrend($("chart"), { buckets, panels });
  const notes = [];
  if (auto) notes.push(`Showing the top ${ids.length} by ${metricLabel(sport, metrics[0]).toLowerCase()} — pick ${state.entity === "team" ? "teams" : "players"} to compare specific ones.`);
  if (q) notes.push(`Qualified: ${q.min}+ ${sport.label(q.stat).toLowerCase()}.`);
  if ((state.entity === "team" ? state.teams : state.players).length > MAX_SERIES) notes.push(`Only the first ${MAX_SERIES} picks are drawn.`);
  $("note").textContent = notes.join(" ");

  // table: entity × bucket for first metric
  const cols = ["Rank", state.entity === "team" ? "Team" : "Player", "Team", ...buckets.map((b) => b.label)];
  const fmt = formatter([...panels[0].series.flatMap((s) => [...s.points.values()])], panels[0].pct);
  const trows = panels[0].series.map((s, i) => ({
    cells: [i + 1, s.label, state.entity === "team" ? s.short : "", ...buckets.map((b) => s.points.get(b.key) ?? null)],
    logo: s.logo,
  }));
  if (panels[0].avg) trows.push({ cells: ["", "League average", "", ...buckets.map((b) => panels[0].avg.get(b.key) ?? null)] });
  renderTable(cols, trows, fmt, `${panels[0].title}`);
}

function drawScatter({ rows, metrics, highlightMode }) {
  const [my, mx] = metrics.length >= 2 ? metrics : [metrics[0], metrics[0]];
  const isTeam = state.entity === "team";
  const { ents, n, q } = rankEntities(rows, [my, mx], { sortBy: isTeam ? "value" : "volume", defaultN: isTeam ? Infinity : 40 });
  const pinned = new Set(isTeam ? state.teams : state.players);
  const pinTeams = new Set(isTeam ? [] : state.teams);
  const isPinned = (e) => pinned.has(e.id) || pinTeams.has(e.team);
  let shown = ents.slice(0, n);
  if (highlightMode) for (const e of ents) if (isPinned(e) && !shown.includes(e)) shown.push(e);
  const fy = formatter(shown.map((e) => e.vals[0].value), my.pct), fx = formatter(shown.map((e) => e.vals[1].value), mx.pct);
  const points = shown.map((e) => {
    const lab = entityLabel(e);
    return {
      id: e.id, label: lab.label, short: lab.short, x: e.vals[1].value, y: e.vals[0].value,
      logo: sport.logo(e.team, meta), highlight: highlightMode && isPinned(e),
      sub: isTeam ? `${e.games} games` : `${e.pos} · ${e.team} · ${e.games} g`,
      extra: extraRows(e, [my, mx]),
    };
  });
  const fit = state.fit ? linearFit(points.map((p) => [p.x, p.y])) : null;
  const yl = metricLabel(sport, my), xl = metricLabel(sport, mx);
  $("title").textContent = `${yl} vs ${xl}`;
  $("subtitle").textContent = windowText();
  renderScatter($("chart"), { xLabel: xl, yLabel: yl, xPct: !!mx.pct, yPct: !!my.pct, points, fit, showLabels: state.labels, isTeam });

  const model = $("model");
  model.replaceChildren();
  if (fit) {
    const add = (k, v) => { const s = document.createElement("span"); s.append(document.createTextNode(k + " "), Object.assign(document.createElement("strong"), { textContent: v })); model.appendChild(s); };
    const sign = fit.a >= 0 ? "+" : "−";
    add("Model:", `y = ${d3.format(".4~g")(fit.b)}·x ${sign} ${d3.format(".4~g")(Math.abs(fit.a))}`);
    add("R²", d3.format(".3f")(fit.r2));
    add("r", d3.format("+.3f")(fit.r));
    add("n", String(fit.n));
    const strength = fit.r2 >= 0.5 ? "strong" : fit.r2 >= 0.25 ? "moderate" : fit.r2 >= 0.1 ? "weak" : "little to no";
    const s = document.createElement("span");
    s.textContent = `${strength} ${fit.r >= 0 ? "positive" : "negative"} linear relationship`;
    model.appendChild(s);
    model.hidden = false;
  }
  const notes = [];
  if (!isTeam && Number.isFinite(n)) notes.push(`Top ${Math.min(n, ents.length)} by ${sport.label(q.stat).toLowerCase()}.`);
  if (q) notes.push(`Qualified: ${q.min}+ ${sport.label(q.stat).toLowerCase()}.`);
  notes.push("Dashed lines mark the average of the plotted points.");
  $("note").textContent = notes.join(" ");

  const cols = ["Rank", isTeam ? "Team" : "Player", "Team", "Games", yl, xl, ...numDenCols([my, mx])];
  const trows = shown.map((e, i) => ({ cells: [i + 1, entityLabel(e).label, e.team, e.games, e.vals[0].value, e.vals[1].value, ...numDenVals(e, [my, mx])], logo: sport.logo(e.team, meta) }));
  renderTable(cols, trows, (v, ci) => (ci === 4 ? fy(v) : ci === 5 ? fx(v) : fmtPlain(v)), `${yl} vs ${xl}`);
}

function drawBar({ rows, metrics, highlightMode }) {
  const m = metrics[0];
  const isTeam = state.entity === "team";
  const { ents, n, q } = rankEntities(rows, [m], { defaultN: isTeam ? Infinity : 25 });
  const pinned = new Set(isTeam ? state.teams : state.players);
  const pinTeams = new Set(isTeam ? [] : state.teams);
  const isPinned = (e) => pinned.has(e.id) || pinTeams.has(e.team);
  let shown = ents.slice(0, n);
  if (highlightMode) shown = ents.filter((e, i) => i < n || isPinned(e));
  const label = metricLabel(sport, m);
  const items = shown.map((e) => {
    const lab = entityLabel(e);
    return { id: e.id, label: isTeam ? lab.label.split(" ").pop() : lab.label, value: e.vals[0].value, logo: sport.logo(e.team, meta), highlight: highlightMode && isPinned(e),
      sub: isTeam ? `${e.games} games` : `${e.pos} · ${e.team}`, extra: extraRows(e, [m]) };
  });
  $("title").textContent = label;
  $("subtitle").textContent = windowText();
  renderBar($("chart"), { label, pct: !!m.pct, items });
  const notes = [];
  if (q) notes.push(`Qualified: ${q.min}+ ${sport.label(q.stat).toLowerCase()}.`);
  $("note").textContent = notes.join(" ");
  const fmt = formatter(items.map((d) => d.value), m.pct);
  const cols = ["Rank", isTeam ? "Team" : "Player", "Team", "Games", label, ...numDenCols([m])];
  const trows = shown.map((e, i) => ({ cells: [i + 1, entityLabel(e).label, e.team, e.games, e.vals[0].value, ...numDenVals(e, [m])], logo: sport.logo(e.team, meta) }));
  renderTable(cols, trows, (v, ci) => (ci === 4 ? fmt(v) : fmtPlain(v)), label);
}

const fmtPlain = (v) => (typeof v === "number" ? (Number.isInteger(v) ? d3.format(",")(v) : d3.format(",.2f")(v)) : v ?? "");
function numDenCols(ms) {
  const out = [];
  for (const m of ms) {
    if (!m.per) continue;
    out.push(sport.label(m.stat), sport.label(m.per));
  }
  return [...new Set(out)];
}
function numDenVals(e, ms) {
  const seen = new Set(), out = [];
  ms.forEach((m, i) => {
    if (!m.per) return;
    if (!seen.has(m.stat)) { seen.add(m.stat); out.push(e.vals[i].num); }
    if (!seen.has(m.per)) { seen.add(m.per); out.push(e.vals[i].den); }
  });
  return out;
}
function extraRows(e, ms) {
  const rows = [];
  const seen = new Set();
  ms.forEach((m, i) => {
    if (!m.per) return;
    for (const [k, v] of [[m.stat, e.vals[i].num], [m.per, e.vals[i].den]]) {
      if (seen.has(k)) continue;
      seen.add(k);
      rows.push({ value: fmtPlain(v), label: sport.label(k) });
    }
  });
  return rows;
}

// ------------------------------------------------------------------ table + csv
function renderTable(cols, rows, fmt, name) {
  current.csv = { cols, rows, name };
  const table = $("table");
  table.replaceChildren();
  const thead = table.createTHead().insertRow();
  let sortCol = -1, asc = false;
  const body = table.createTBody();
  const draw = () => {
    body.replaceChildren();
    const sorted = sortCol < 0 ? rows : [...rows].sort((a, b) => {
      const x = a.cells[sortCol], y = b.cells[sortCol];
      const c = typeof x === "number" && typeof y === "number" ? x - y : String(x ?? "").localeCompare(String(y ?? ""));
      return asc ? c : -c;
    });
    for (const r of sorted) {
      const tr = body.insertRow();
      r.cells.forEach((v, ci) => {
        const td = tr.insertCell();
        if (ci === 1 && r.logo) { const img = document.createElement("img"); img.src = r.logo; img.alt = ""; td.appendChild(img); }
        td.appendChild(document.createTextNode(ci < 4 && typeof v !== "number" ? v ?? "" : typeof v === "number" && ci > 3 ? fmt(v, ci) : fmtPlain(v)));
      });
    }
  };
  cols.forEach((c, ci) => {
    const th = document.createElement("th");
    th.textContent = c;
    th.onclick = () => {
      if (sortCol === ci) asc = !asc; else { sortCol = ci; asc = ci < 3; }
      [...thead.children].forEach((h, i) => { h.classList.toggle("sorted", i === sortCol); h.classList.toggle("asc", i === sortCol && asc); });
      draw();
    };
    thead.appendChild(th);
  });
  draw();
}

function downloadCsv() {
  if (!current.csv) return;
  const esc = (v) => { const s = v == null ? "" : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const lines = [current.csv.cols.map(esc).join(","), ...current.csv.rows.map((r) => r.cells.map((v) => esc(typeof v === "number" ? Math.round(v * 10000) / 10000 : v)).join(","))];
  const blob = new Blob([lines.join("\n")], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${current.csv.name.replace(/[^\w]+/g, "-").toLowerCase().slice(0, 60)}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// ------------------------------------------------------------------ saved models
function savedModels() { try { return JSON.parse(localStorage.getItem("sa.models") || "[]"); } catch { return []; } }
function saveModels(list) { try { localStorage.setItem("sa.models", JSON.stringify(list)); } catch { toast("Could not save in this browser"); } }
function renderSaved() {
  const list = savedModels();
  $("savedCount").textContent = list.length ? `(${list.length})` : "";
  const ul = $("saved");
  ul.replaceChildren();
  if (!list.length) { const li = document.createElement("li"); li.className = "hint"; li.textContent = "Nothing saved yet. Saved models live in this browser."; ul.appendChild(li); }
  list.forEach((m, i) => {
    const li = document.createElement("li");
    const open = document.createElement("button"); open.textContent = m.name;
    open.onclick = () => { state = sanitize(m.state); update(); };
    const del = document.createElement("button"); del.textContent = "×"; del.title = "Delete"; del.setAttribute("aria-label", `Delete ${m.name}`);
    del.onclick = () => { const l = savedModels(); l.splice(i, 1); saveModels(l); renderSaved(); };
    li.append(open, del);
    ul.appendChild(li);
  });
}

function toast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toast.t);
  toast.t = setTimeout(() => t.classList.remove("show"), 1800);
}

boot().catch((e) => {
  $("title").textContent = "Could not load data";
  $("subtitle").textContent = e.message;
  console.error(e);
});
