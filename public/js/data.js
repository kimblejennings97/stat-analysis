// Data loading + aggregation. All ratio metrics are computed as sum(numerator) / sum(denominator)
// over the window, never as an average of per-game ratios.

import { dataBases } from "./config.js";

const cache = new Map(); // `${sport}/${kind}_${season}` -> Promise<table>
let base = null; // resolved data location (see config.js)

// meta.json is tiny and always re-fetched (a time-stamped query skips browser + CDN caches),
// so a data refresh shows up without redeploying the site.
export async function loadMeta(sport) {
  let lastErr;
  for (const b of dataBases()) {
    try {
      const r = await fetch(`${b}/${sport.id}/meta.json?t=${Date.now()}`, { cache: "no-store" });
      if (!r.ok) throw new Error(`meta.json ${r.status} from ${b}`);
      const meta = await r.json();
      base = b;
      return meta;
    } catch (e) { lastErr = e; }
  }
  throw lastErr;
}

// table = { kind, season, cols, idx: {col: i}, rows, people? }
export function loadTable(sport, meta, kind, season) {
  const key = `${sport.id}/${kind}_${season}`;
  if (!cache.has(key)) {
    const v = meta.updated ? `?v=${encodeURIComponent(meta.updated)}` : "";
    // Season files are immutable per refresh: `?v=<updated>` busts caches only when the data changes.
    const p = fetch(`${base}/${sport.id}/${kind === "team" ? "teams" : "players"}_${season}.json${v}`)
      .then((r) => {
        if (!r.ok) throw new Error(`${kind} ${season}: ${r.status}`);
        return r.json();
      })
      .then((t) => addDerived(sport, kind, t))
      .catch((e) => { cache.delete(key); throw e; });
    cache.set(key, p);
  }
  return cache.get(key);
}

function addDerived(sport, kind, t) {
  const idx = Object.fromEntries(t.cols.map((c, i) => [c, i]));
  const add = [];
  for (const [name, fn] of Object.entries(sport.derived)) {
    add.push([name, (row) => fn((k) => (k in idx ? row[idx[k]] : 0))]);
    if (kind === "team") add.push(["opp_" + name, (row) => fn((k) => (("opp_" + k) in idx ? row[idx["opp_" + k]] : 0))]);
  }
  const usable = add.filter(([name]) => !(name in idx));
  for (const row of t.rows) for (const [, f] of usable) row.push(f(row));
  for (const [name] of usable) { idx[name] = t.cols.length; t.cols.push(name); }
  t.idx = idx;
  t.kind = kind;
  return t;
}

// Stats a user can pick for an entity type (numeric columns only).
export function statList(sport, table, kind) {
  return table.cols
    .slice(kind === "team" ? 4 : 5)
    .filter((c) => kind === "team" || !sport.teamOnly.has(c))
    .filter((c) => kind === "player" || !c.startsWith("tm_"));
}

export function metricLabel(sport, m) {
  const preset = Object.values(sport.presets).flat().find((p) => p.stat === m.stat && (p.per || null) === (m.per || null) && !!p.pct === !!m.pct);
  if (preset && m.per && m.per !== "games") return preset.name;
  const base = sport.label(m.stat);
  if (!m.per) return base;
  return `${base} per ${sport.perLabel(m.per)}${m.pct ? " (%)" : ""}`;
}

export function metricValue(m, num, den) {
  if (!m.per) return num;
  if (!den) return null;
  return (num / den) * (m.pct ? 100 : 1);
}

// Filter rows from the loaded tables according to state.
// Returns an array of { season, row, table } for the selected entity kind.
export function filterRows(tables, state, sport) {
  const byWeek = sport.time === "week";
  const monthSet = new Set(state.months || []);
  const out = [];
  const teamSet = new Set(state.teams);
  const oppSet = new Set(state.opps);
  const playerSet = new Set(state.players);
  const posSet = new Set(state.positions);
  for (const t of tables) {
    const I = t.idx;
    const pidI = I.pid, teamI = I.team, oppI = I.opp, weekI = I.week, dateI = I.date, stI = I.stype;
    for (const row of t.rows) {
      const st = row[stI];
      if (state.stype !== "RP" && st !== state.stype) continue;
      if (byWeek) {
        const w = row[weekI];
        if (st === "R" && (w < state.weekFrom || w > state.weekTo)) continue;
      } else if (monthSet.size && !monthSet.has(Math.floor(row[dateI] / 100) % 100)) continue;
      if (teamSet.size && !teamSet.has(row[teamI])) continue;
      if (oppSet.size && !oppSet.has(row[oppI])) continue;
      if (t.kind === "player") {
        if (playerSet.size && !playerSet.has(row[pidI])) continue;
        if (posSet.size && !posSet.has(t.people[row[pidI]]?.[2])) continue;
      }
      out.push({ season: t.season, row, t });
    }
  }
  return out;
}

const entityKey = (r) => (r.t.kind === "team" ? r.row[r.t.idx.team] : r.row[r.t.idx.pid]);

// Aggregate filtered rows per entity over the whole window.
// Returns [{ id, team, name, pos, games, vals: [{num, den, value}] per metric, qual }]
export function aggregate(rows, metrics, qualStat, sport) {
  const by = new Map();
  for (const r of rows) {
    const id = entityKey(r);
    let e = by.get(id);
    if (!e) {
      e = { id, team: null, lastKey: -1, games: 0, sums: metrics.map(() => [0, 0]), qual: 0 };
      by.set(id, e);
    }
    const I = r.t.idx;
    const k = r.season * 1e8 + sport.tval(r.row, I);
    if (k > e.lastKey) { e.lastKey = k; e.team = r.row[I.team]; }
    e.games += 1;
    metrics.forEach((m, i) => {
      e.sums[i][0] += r.row[I[m.stat]] ?? 0;
      if (m.per) e.sums[i][1] += r.row[I[m.per]] ?? 0;
    });
    if (qualStat) e.qual += r.row[I[qualStat]] ?? 0;
    if (r.t.kind === "player" && !e.name) {
      const p = r.t.people[id] || [];
      e.name = p[0] || id; e.pos = p[1] || ""; e.posGroup = p[2] || ""; e.headshot = p[3] || "";
    }
  }
  return [...by.values()].map((e) => ({
    ...e,
    vals: metrics.map((m, i) => ({ num: e.sums[i][0], den: e.sums[i][1], value: metricValue(m, e.sums[i][0], e.sums[i][1]) })),
  }));
}

// Time bucket for a row. bucket = "game" (each game / week), "month" (date sports) or "season".
export function bucketOf(r, opts, sport) {
  const I = r.t.idx;
  const yy = "'" + String(r.season).slice(2);
  const slabel = opts.seasonLabel ? opts.seasonLabel(r.season) : String(r.season);
  if (opts.bucket === "season") return { key: String(r.season), season: r.season, label: opts.seasonLabel ? opts.seasonLabel(r.season) : String(r.season) };
  const t = sport.tval(r.row, I);
  if (opts.bucket === "month" && sport.time === "date") {
    const ym = Math.floor(t / 100);
    return { key: `${r.season}-${ym}`, season: r.season, slabel, month: ym % 100, label: `${sport.monthName(ym % 100)} ${"'" + String(Math.floor(ym / 100)).slice(2)}` };
  }
  const st = r.row[I.stype];
  return { key: `${r.season}-${String(t).padStart(8, "0")}`, season: r.season, slabel, week: t, stype: st,
    label: sport.time === "week" ? `${yy} ${sport.gameLabel(t, st, r.season)}` : `${sport.dateLabel(t)} ${"'" + String(Math.floor(t / 10000)).slice(2)}` };
}

// Time series per entity. bucket = "game", "month" or "season".
// rolling (weeks only): value over the entity's last N games.
// Returns { buckets: [{key, season, week, stype, label}], series: Map(id -> {team, name, points: Map(bucketKey -> value)}) }
export function timeSeries(rows, metric, opts, sport) {
  const buckets = new Map();
  const ents = new Map();
  for (const r of rows) {
    const b = bucketOf(r, opts, sport);
    buckets.set(b.key, b);
    const id = entityKey(r);
    let e = ents.get(id);
    if (!e) {
      e = { id, team: r.row[r.t.idx.team], per: new Map() };
      if (r.t.kind === "player") e.name = r.t.people[id]?.[0] || id;
      ents.set(id, e);
    }
    e.team = r.row[r.t.idx.team];
    const I = r.t.idx;
    const acc = e.per.get(b.key) || [0, 0, 0];
    acc[0] += r.row[I[metric.stat]] ?? 0;
    if (metric.per) acc[1] += r.row[I[metric.per]] ?? 0;
    acc[2] += 1;
    e.per.set(b.key, acc);
  }
  const ordered = [...buckets.values()].sort((a, b) => (a.key < b.key ? -1 : 1));
  for (const e of ents.values()) {
    e.points = new Map();
    const keys = ordered.map((b) => b.key).filter((k) => e.per.has(k));
    keys.forEach((k, i) => {
      let num = 0, den = 0;
      const n = opts.bucket === "game" && opts.rolling > 1 ? opts.rolling : 1;
      for (let j = Math.max(0, i - n + 1); j <= i; j++) {
        const a = e.per.get(keys[j]);
        num += a[0]; den += a[1];
      }
      const v = metricValue(metric, num, den);
      if (v != null) e.points.set(k, v);
    });
  }
  return { buckets: ordered, series: ents };
}

// League average per bucket: ratios -> pooled sum(num)/sum(den);
// totals -> mean per entity-game (weeks) or mean per entity (seasons).
export function leagueAverage(rows, metric, opts, sport) {
  const sums = new Map();
  for (const r of rows) {
    const I = r.t.idx;
    const key = bucketOf(r, opts, sport).key;
    let a = sums.get(key);
    if (!a) sums.set(key, (a = { num: 0, den: 0, n: 0, ents: new Set() }));
    a.num += r.row[I[metric.stat]] ?? 0;
    if (metric.per) a.den += r.row[I[metric.per]] ?? 0;
    a.n += 1;
    a.ents.add(entityKey(r));
  }
  const pts = new Map();
  for (const [k, a] of sums) {
    const v = metric.per ? metricValue(metric, a.num, a.den) : a.num / (opts.bucket === "game" ? a.n : a.ents.size);
    if (v != null) pts.set(k, v);
  }
  return pts;
}

// Ordinary least squares y = a + b x, with r².
export function linearFit(points) {
  const n = points.length;
  if (n < 3) return null;
  let sx = 0, sy = 0, sxx = 0, sxy = 0, syy = 0;
  for (const [x, y] of points) { sx += x; sy += y; sxx += x * x; sxy += x * y; syy += y * y; }
  const vx = sxx - (sx * sx) / n, vy = syy - (sy * sy) / n, cov = sxy - (sx * sy) / n;
  if (!vx || !vy) return null;
  const b = cov / vx, a = (sy - b * sx) / n;
  return { a, b, r: cov / Math.sqrt(vx * vy), r2: (cov * cov) / (vx * vy), n };
}
