// Builds the NFL data files the site reads (public/data/nfl/*.json) from nflverse.
//
//   node scripts/refresh-nfl.mjs          rebuild the latest season + any season whose file is missing
//   node scripts/refresh-nfl.mjs --all    rebuild every season from FIRST_SEASON
//
// Sources (all free, no key, updated by nflverse during the season):
//   stats_player / stats_team   weekly box-score stats (nflverse)
//   pfr_advstats                pressures, blitzes, drops, broken tackles, coverage (Pro Football Reference)
//   snap_counts                 offense/defense/special-teams snaps (PFR)
//   players                     id crosswalk (gsis <-> pfr), names, positions, headshots
//   schedules/games.csv         final scores
//   teams_colors_logos          team names, colors, logo URLs

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const FIRST_SEASON = 2018; // PFR advanced stats start in 2018
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "public", "data", "nfl");
const REL = "https://github.com/nflverse/nflverse-data/releases/download";
const ALL = process.argv.includes("--all");

// ------------------------------------------------------------------ helpers
async function getText(url, optional = false) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const r = await fetch(url, { redirect: "follow" });
    if (r.status === 404 && optional) return null;
    if (r.ok) return r.text();
    if (attempt === 3) throw new Error(`${r.status} ${url}`);
    await new Promise((res) => setTimeout(res, 2000 * attempt));
  }
}

function parseCsv(text) {
  const rows = [];
  let row = [], field = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; }
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  const head = rows.shift();
  return rows.map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ""])));
}

async function csv(url, optional = false) {
  const t = await getText(url, optional);
  return t == null ? null : parseCsv(t);
}

const num = (v) => {
  if (v === "" || v == null || v === "NA") return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const round = (n) => (Number.isInteger(n) ? n : Math.round(n * 1000) / 1000);
const key3 = (s, w, t) => `${s}|${w}|${t}`;

// Columns in the nflverse weekly files that are not summable counts.
const SKIP = new Set([
  "pacr", "racr", "wopr", "target_share", "air_yards_share", "fg_pct", "pat_pct", "fg_long", "pt_long",
  "fg_made_list", "fg_missed_list", "fg_blocked_list", "fg_made_distance", "fg_missed_distance",
  "fg_blocked_distance", "gwfg_distance", "passing_cpoe", "timeouts",
]);
const ID_COLS = new Set([
  "player_id", "player_name", "player_display_name", "position", "position_group", "headshot_url",
  "season", "week", "season_type", "game_id", "team", "opponent_team",
]);

// PFR advanced columns we keep, renamed into one namespace.
const PFR_PASS = {
  times_pressured: "pressures_faced", times_hurried: "hurries_faced", times_hit: "hits_faced",
  times_blitzed: "blitzes_faced", passing_bad_throws: "bad_throws", passing_drops: "drops_by_receivers",
};
const PFR_RUSH = {
  rushing_yards_before_contact: "rush_ybc", rushing_yards_after_contact: "rush_yac",
  rushing_broken_tackles: "rush_broken_tackles",
};
const PFR_REC = { receiving_drop: "drops", receiving_broken_tackles: "rec_broken_tackles" };
const PFR_DEF = {
  def_pressures: "def_pressures", def_times_hurried: "def_hurries", def_times_hitqb: "def_qb_hits_pfr",
  def_times_blitzed: "def_blitzes", def_targets: "cov_targets", def_completions_allowed: "cov_completions",
  def_yards_allowed: "cov_yards", def_receiving_td_allowed: "cov_tds", def_air_yards_completed: "cov_air_yards",
  def_yards_after_catch: "cov_yac", def_missed_tackles: "missed_tackles", def_tackles_combined: "tackles_combined",
};

// ------------------------------------------------------------------ shared lookups
async function loadShared() {
  console.log("players / teams / schedule ...");
  const [players, teams, games] = await Promise.all([
    csv(`${REL}/players/players.csv`),
    csv(`${REL}/teams/teams_colors_logos.csv`),
    csv(`${REL}/schedules/games.csv`),
  ]);
  const pfrToGsis = new Map();
  for (const p of players) if (p.pfr_id && p.gsis_id) pfrToGsis.set(p.pfr_id, p.gsis_id);
  return { players, pfrToGsis, teams, games };
}

// ------------------------------------------------------------------ one season
async function buildSeason(season, shared) {
  const f = (tag, name) => `${REL}/${tag}/${name}`;
  const playerWeek = await csv(f("stats_player", `stats_player_week_${season}.csv`), true);
  if (!playerWeek) return null;
  console.log(`season ${season} ...`);
  const [teamWeek, advPass, advRush, advRec, advDef, snaps] = await Promise.all([
    csv(f("stats_team", `stats_team_week_${season}.csv`)),
    csv(f("pfr_advstats", `advstats_week_pass_${season}.csv`), true),
    csv(f("pfr_advstats", `advstats_week_rush_${season}.csv`), true),
    csv(f("pfr_advstats", `advstats_week_rec_${season}.csv`), true),
    csv(f("pfr_advstats", `advstats_week_def_${season}.csv`), true),
    csv(f("snap_counts", `snap_counts_${season}.csv`), true),
  ]);

  // --- player-week extras keyed by gsis|week
  const extra = new Map(); // `${gsis}|${week}` -> {col: value}
  const teamExtra = new Map(); // season|week|team -> {col: value}
  const addTo = (map, k, col, v) => {
    let o = map.get(k);
    if (!o) map.set(k, (o = {}));
    o[col] = (o[col] || 0) + v;
  };
  const maxTo = (map, k, col, v) => {
    let o = map.get(k);
    if (!o) map.set(k, (o = {}));
    o[col] = Math.max(o[col] || 0, v);
  };
  const mergeAdv = (rows, mapping, teamCols) => {
    for (const r of rows || []) {
      const g = shared.pfrToGsis.get(r.pfr_player_id);
      for (const [src, dst] of Object.entries(mapping)) {
        const v = num(r[src]);
        if (g) addTo(extra, `${g}|${r.week}`, dst, v);
        if (teamCols.includes(dst)) addTo(teamExtra, key3(season, r.week, r.team), dst, v);
      }
    }
  };
  mergeAdv(advPass, PFR_PASS, ["pressures_faced", "hurries_faced", "hits_faced", "blitzes_faced", "bad_throws", "drops_by_receivers"]);
  mergeAdv(advRush, PFR_RUSH, ["rush_ybc", "rush_yac", "rush_broken_tackles"]);
  mergeAdv(advRec, PFR_REC, ["rec_broken_tackles"]);
  mergeAdv(advDef, PFR_DEF, ["def_pressures", "def_hurries", "def_blitzes", "missed_tackles"]);

  for (const r of snaps || []) {
    const g = shared.pfrToGsis.get(r.pfr_player_id);
    const o = num(r.offense_snaps), d = num(r.defense_snaps), s = num(r.st_snaps);
    if (g) {
      addTo(extra, `${g}|${r.week}`, "offense_snaps", o);
      addTo(extra, `${g}|${r.week}`, "defense_snaps", d);
      addTo(extra, `${g}|${r.week}`, "st_snaps", s);
    }
    // A team's play count = the most snaps any one of its players logged.
    const tk = key3(season, r.week, r.team);
    maxTo(teamExtra, tk, "off_plays", o);
    maxTo(teamExtra, tk, "def_plays", d);
    maxTo(teamExtra, tk, "st_plays", s);
  }

  // --- scores
  for (const gm of shared.games) {
    if (Number(gm.season) !== season || gm.away_score === "" || gm.away_score === "NA") continue;
    const as = num(gm.away_score), hs = num(gm.home_score);
    const put = (team, pf, pa, home) => {
      const tk = key3(season, gm.week, team);
      const o = teamExtra.get(tk) || {};
      Object.assign(o, {
        points_for: pf, points_against: pa, wins: pf > pa ? 1 : 0, losses: pf < pa ? 1 : 0,
        ties: pf === pa ? 1 : 0, home_games: home ? 1 : 0, spread_line: home ? num(gm.spread_line) : -num(gm.spread_line),
        total_line: num(gm.total_line),
      });
      teamExtra.set(tk, o);
    };
    put(gm.home_team, hs, as, true);
    put(gm.away_team, as, hs, false);
  }

  // --- team table
  const teamStatCols = Object.keys(teamWeek[0]).filter((c) => !ID_COLS.has(c) && !SKIP.has(c));
  const teamExtraCols = [
    "points_for", "points_against", "wins", "losses", "ties", "home_games", "spread_line", "total_line",
    "off_plays", "def_plays", "st_plays", "pressures_faced", "hurries_faced", "hits_faced", "blitzes_faced",
    "bad_throws", "drops_by_receivers", "rush_ybc", "rush_yac", "rush_broken_tackles", "rec_broken_tackles",
    "def_pressures", "def_hurries", "def_blitzes", "missed_tackles", "cpoe_x_att",
  ];
  const teamBase = [...teamStatCols, ...teamExtraCols, "games"];
  const teamRowsByKey = new Map();
  for (const r of teamWeek) {
    if (r.season_type !== "REG" && r.season_type !== "POST") continue;
    const ex = teamExtra.get(key3(season, r.week, r.team)) || {};
    const vals = {};
    for (const c of teamStatCols) vals[c] = num(r[c]);
    for (const c of teamExtraCols) vals[c] = ex[c] || 0;
    vals.cpoe_x_att = num(r.passing_cpoe) * num(r.attempts);
    vals.games = 1;
    teamRowsByKey.set(key3(season, r.week, r.team), { r, vals });
  }
  // Opponent ("allowed") columns: every team stat, from the other side of the game.
  const oppCols = teamBase.filter((c) => !["games", "wins", "losses", "ties", "home_games", "spread_line", "total_line", "points_for", "points_against"].includes(c));
  const teamCols = ["team", "opp", "week", "stype", ...teamBase, ...oppCols.map((c) => "opp_" + c)];
  const teamRows = [];
  for (const { r, vals } of teamRowsByKey.values()) {
    const o = teamRowsByKey.get(key3(season, r.week, r.opponent_team));
    teamRows.push([
      r.team, r.opponent_team, Number(r.week), r.season_type === "POST" ? "P" : "R",
      ...teamBase.map((c) => round(vals[c])),
      ...oppCols.map((c) => round(o ? o.vals[c] : 0)),
    ]);
  }

  // Team context for share stats on player rows.
  const ctx = (week, team) => teamRowsByKey.get(key3(season, week, team))?.vals || {};

  // --- player table
  const playerStatCols = Object.keys(playerWeek[0]).filter((c) => !ID_COLS.has(c) && !SKIP.has(c));
  const playerExtraCols = [
    "offense_snaps", "defense_snaps", "st_snaps", "pressures_faced", "hurries_faced", "hits_faced", "blitzes_faced",
    "bad_throws", "drops_by_receivers", "rush_ybc", "rush_yac", "rush_broken_tackles", "drops", "rec_broken_tackles",
    ...Object.values(PFR_DEF),
  ];
  const playerCtxCols = ["tm_pass_attempts", "tm_targets", "tm_air_yards", "tm_carries", "tm_off_plays", "tm_def_plays"];
  const playerBase = [...playerStatCols, ...playerExtraCols, "cpoe_x_att", ...playerCtxCols, "games"];
  const playerCols = ["pid", "team", "opp", "week", "stype", ...playerBase];
  const people = {};
  const playerRows = [];
  for (const r of playerWeek) {
    if (r.season_type !== "REG" && r.season_type !== "POST") continue;
    const ex = extra.get(`${r.player_id}|${r.week}`) || {};
    const tc = ctx(r.week, r.team);
    const vals = {};
    for (const c of playerStatCols) vals[c] = num(r[c]);
    for (const c of playerExtraCols) vals[c] = ex[c] || 0;
    vals.cpoe_x_att = num(r.passing_cpoe) * num(r.attempts);
    Object.assign(vals, {
      tm_pass_attempts: tc.attempts || 0, tm_targets: tc.targets || 0, tm_air_yards: tc.receiving_air_yards || 0,
      tm_carries: tc.carries || 0, tm_off_plays: tc.off_plays || 0, tm_def_plays: tc.def_plays || 0, games: 1,
    });
    people[r.player_id] = [r.player_display_name || r.player_name, r.position || "", r.position_group || "", r.headshot_url || ""];
    playerRows.push([r.player_id, r.team, r.opponent_team, Number(r.week), r.season_type === "POST" ? "P" : "R", ...playerBase.map((c) => round(vals[c]))]);
  }

  const maxWeek = Math.max(...teamRows.map((r) => r[2]));
  return {
    season, maxWeek, rows: playerRows.length,
    team: { season, cols: teamCols, rows: teamRows },
    player: { season, cols: playerCols, people, rows: playerRows },
  };
}

// ------------------------------------------------------------------ main
const shared = await loadShared();
fs.mkdirSync(OUT, { recursive: true });
const metaPath = path.join(OUT, "meta.json");
const oldMeta = fs.existsSync(metaPath) ? JSON.parse(fs.readFileSync(metaPath, "utf8")) : { seasons: [] };
const seasonsInfo = Object.fromEntries((oldMeta.seasons || []).map((s) => [s.season, s]));

const thisYear = new Date().getUTCFullYear();
let latest = null;
for (let s = thisYear; s >= thisYear - 1 && latest == null; s--) {
  const r = await fetch(`${REL}/stats_player/stats_player_week_${s}.csv`, { method: "HEAD", redirect: "follow" });
  if (r.ok) latest = s;
}
if (latest == null) throw new Error("Could not find a current-season player stats file");

for (let s = FIRST_SEASON; s <= latest; s++) {
  const have = fs.existsSync(path.join(OUT, `players_${s}.json`)) && fs.existsSync(path.join(OUT, `teams_${s}.json`));
  if (have && !ALL && s !== latest) continue;
  const built = await buildSeason(s, shared);
  if (!built) continue;
  fs.writeFileSync(path.join(OUT, `teams_${s}.json`), JSON.stringify(built.team));
  fs.writeFileSync(path.join(OUT, `players_${s}.json`), JSON.stringify(built.player));
  seasonsInfo[s] = { season: s, maxWeek: built.maxWeek, playerRows: built.rows };
  console.log(`  ${s}: through week ${built.maxWeek}, ${built.rows} player-games`);
}

const teams = {};
for (const t of shared.teams) {
  teams[t.team_abbr] = {
    name: t.team_name, nick: t.team_nick, conf: t.team_conf, div: t.team_division,
    color: t.team_color, color2: t.team_color2, logo: t.team_logo_espn,
  };
}
const meta = {
  sport: "nfl",
  updated: new Date().toISOString(),
  latestSeason: latest,
  seasons: Object.values(seasonsInfo).sort((a, b) => a.season - b.season),
  teams,
};
fs.writeFileSync(metaPath, JSON.stringify(meta, null, 1));
console.log(`done: latest season ${latest}, updated ${meta.updated}`);
