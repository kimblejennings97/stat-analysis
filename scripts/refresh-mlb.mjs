// Builds MLB data (public/data/mlb/*.json) from the official MLB Stats API (statsapi.mlb.com, free, no key).
//
//   node scripts/refresh-mlb.mjs          rebuild the current season (while it's in progress) + missing seasons
//   node scripts/refresh-mlb.mjs --all    rebuild every season from FIRST_SEASON
//
// For each game day it pulls every player's batting and pitching line for that day ("byDateRange"),
// so rows are one per player-day (a doubleheader is combined) and one per team-day.
// Team batting/pitching = sum of its players; scores, W/L and opponents come from the schedule.

import { outDir, getJson, num, round, ymd, pool, readMeta, haveSeason, writeSeason, writeMeta } from "./lib.mjs";

const FIRST_SEASON = 2018;
const API = "https://statsapi.mlb.com/api/v1";
const ALL = process.argv.includes("--all");
const OUT = outDir("mlb");
const POST = new Set(["F", "D", "L", "W"]); // wild card, division series, LCS, World Series

const BAT = {
  games: "gamesPlayed", pa: "plateAppearances", ab: "atBats", h: "hits", doubles: "doubles", triples: "triples",
  hr: "homeRuns", r: "runs", rbi: "rbi", bb: "baseOnBalls", ibb: "intentionalWalks", so: "strikeOuts",
  hbp: "hitByPitch", sb: "stolenBases", cs: "caughtStealing", gidp: "groundIntoDoublePlay", tb: "totalBases",
  sf: "sacFlies", sh: "sacBunts", lob: "leftOnBase", pitches_seen: "numberOfPitches", go: "groundOuts", ao: "airOuts",
};
const PIT = {
  p_games: "gamesPitched", p_gs: "gamesStarted", p_outs: "outs", p_bf: "battersFaced", p_h: "hits", p_r: "runs",
  p_er: "earnedRuns", p_bb: "baseOnBalls", p_ibb: "intentionalWalks", p_so: "strikeOuts", p_hr: "homeRuns",
  p_hbp: "hitBatsmen", p_pitches: "numberOfPitches", p_strikes: "strikes", p_w: "wins", p_l: "losses",
  p_sv: "saves", p_svo: "saveOpportunities", p_hld: "holds", p_bs: "blownSaves", p_cg: "completeGames",
  p_sho: "shutouts", p_go: "groundOuts", p_ao: "airOuts", p_ir: "inheritedRunners", p_irs: "inheritedRunnersScored",
  p_wp: "wildPitches",
};
const STAT_COLS = [...Object.keys(BAT), ...Object.keys(PIT)];
const OF = new Set(["LF", "CF", "RF", "OF"]);

async function seasonInfo(season) {
  const j = await getJson(`${API}/seasons/${season}?sportId=1`);
  return j.seasons?.[0] || null;
}

async function buildSeason(season, teamsMeta) {
  console.log(`season ${season} ...`);
  const tj = await getJson(`${API}/teams?sportId=1&season=${season}`);
  const abbr = {};
  for (const t of tj.teams) {
    abbr[t.id] = t.abbreviation;
    teamsMeta[t.abbreviation] = {
      name: t.name, nick: t.teamName, league: t.league?.name, div: t.division?.name,
      logo: `https://www.mlbstatic.com/team-logos/${t.id}.svg`,
    };
  }

  // schedule -> per day: game types, and per team-day: opponent, games, W/L, runs
  const sched = await getJson(`${API}/schedule?sportId=1&season=${season}&gameType=R,F,D,L,W`);
  const days = new Map(); // date -> Set(gameType)
  const teamDay = new Map(); // `${date}|${abbr}` -> info
  for (const d of sched.dates || []) {
    for (const g of d.games) {
      if (g.status?.abstractGameState !== "Final" || g.status?.detailedState === "Postponed") continue;
      const a = g.teams.away, h = g.teams.home;
      if (a.score == null || h.score == null) continue;
      const date = g.officialDate;
      if (!days.has(date)) days.set(date, new Set());
      days.get(date).add(g.gameType);
      for (const [me, op, home] of [[a, h, 0], [h, a, 1]]) {
        const k = `${date}|${abbr[me.team.id]}`;
        const t = teamDay.get(k) || { opp: abbr[op.team.id], stype: POST.has(g.gameType) ? "P" : "R", games: 0, wins: 0, losses: 0, runs_for: 0, runs_against: 0, home_games: 0 };
        t.games += 1; t.home_games += home;
        t.runs_for += me.score; t.runs_against += op.score;
        if (me.score > op.score) t.wins += 1; else if (me.score < op.score) t.losses += 1;
        teamDay.set(k, t);
      }
    }
  }
  if (!days.size) return null;

  // per day, per game type, both stat groups
  const jobs = [];
  for (const [date, types] of days) for (const gt of types) for (const group of ["hitting", "pitching"]) jobs.push({ date, gt, group });
  let done = 0;
  const results = await pool(jobs, 8, async (j) => {
    const r = await getJson(`${API}/stats?stats=byDateRange&group=${j.group}&startDate=${j.date}&endDate=${j.date}&sportId=1&playerPool=ALL&limit=3000&gameType=${j.gt}`);
    if (++done % 100 === 0) process.stdout.write(`  ${done}/${jobs.length}\r`);
    return { ...j, splits: r.stats?.[0]?.splits || [] };
  });

  const rows = new Map(); // `${date}|${pid}` -> {pid, team, date, stype, vals}
  const people = {};
  const posCount = {}; // pid -> {pos: games}
  for (const res of results) {
    const map = res.group === "hitting" ? BAT : PIT;
    for (const sp of res.splits) {
      const pid = String(sp.player?.id || "");
      const team = abbr[sp.team?.id];
      if (!pid || !team) continue;
      const k = `${res.date}|${pid}`;
      let row = rows.get(k);
      if (!row) {
        row = { pid, team, date: res.date, stype: POST.has(res.gt) ? "P" : "R", vals: Object.fromEntries(STAT_COLS.map((c) => [c, 0])) };
        rows.set(k, row);
      }
      for (const [col, src] of Object.entries(map)) row.vals[col] += num(sp.stat?.[src]);
      if (!people[pid]) people[pid] = [sp.player.fullName, "", "", `https://img.mlbstatic.com/mlb-photos/image/upload/w_120,q_auto:best/v1/people/${pid}/headshot/67/current`];
      if (res.group === "hitting" && sp.position?.abbreviation) {
        const pc = (posCount[pid] ||= {});
        pc[sp.position.abbreviation] = (pc[sp.position.abbreviation] || 0) + 1;
      }
    }
  }

  // positions: pitchers by starts share; hitters by most common position
  const tot = {};
  for (const r of rows.values()) {
    const t = (tot[r.pid] ||= { g: 0, pg: 0, gs: 0 });
    t.g += r.vals.games; t.pg += r.vals.p_games; t.gs += r.vals.p_gs;
  }
  for (const [pid, p] of Object.entries(people)) {
    const t = tot[pid] || { g: 0, pg: 0, gs: 0 };
    if (t.pg > 0 && t.pg >= t.g * 0.5) {
      const pos = t.gs / t.pg >= 0.5 ? "SP" : "RP";
      p[1] = pos; p[2] = pos;
    } else {
      const pc = posCount[pid] || {};
      const pos = Object.entries(pc).sort((a, b) => b[1] - a[1])[0]?.[0] || "";
      p[1] = pos; p[2] = OF.has(pos) ? "OF" : pos === "P" ? "RP" : pos;
    }
  }

  // team rows = sum of player rows + schedule info
  const teamVals = new Map();
  for (const r of rows.values()) {
    const k = `${r.date}|${r.team}`;
    const v = teamVals.get(k) || Object.fromEntries(STAT_COLS.map((c) => [c, 0]));
    for (const c of STAT_COLS) v[c] += r.vals[c];
    teamVals.set(k, v);
  }
  const extra = ["runs_for", "runs_against", "wins", "losses", "home_games"];
  const teamStatCols = [...STAT_COLS.filter((c) => c !== "games" && c !== "p_games"), ...extra, "games"];
  const teamCols = ["team", "opp", "date", "stype", ...teamStatCols];
  const teamRows = [];
  for (const [k, info] of teamDay) {
    const [date, team] = k.split("|");
    const v = teamVals.get(k) || {};
    teamRows.push([team, info.opp, ymd(date), info.stype, ...teamStatCols.map((c) => round(c in info ? info[c] : v[c] || 0))]);
  }

  const playerCols = ["pid", "team", "opp", "date", "stype", ...STAT_COLS.filter((c) => c !== "games"), "games"];
  const playerRows = [];
  for (const r of rows.values()) {
    const opp = teamDay.get(`${r.date}|${r.team}`)?.opp || "";
    const g = Math.max(r.vals.games, r.vals.p_games);
    playerRows.push([r.pid, r.team, opp, ymd(r.date), r.stype, ...STAT_COLS.filter((c) => c !== "games").map((c) => round(r.vals[c])), g]);
  }
  const maxDate = Math.max(...teamRows.map((r) => r[2]));
  console.log(`  ${season}: ${days.size} game days, ${playerRows.length} player-days, through ${maxDate}`);
  return {
    info: { season, label: String(season), maxDate, playerRows: playerRows.length },
    team: { season, cols: teamCols, rows: teamRows },
    player: { season, cols: playerCols, people, rows: playerRows },
  };
}

const old = readMeta(OUT) || { seasons: [], teams: {} };
const info = Object.fromEntries((old.seasons || []).map((s) => [s.season, s]));
const teamsMeta = { ...(old.teams || {}) };

const today = new Date().toISOString().slice(0, 10);
const y = Number(today.slice(0, 4));
let latest = y, cur = await seasonInfo(y);
if (!cur || cur.regularSeasonStartDate > today) { latest = y - 1; cur = await seasonInfo(latest); }
// The latest season still changes until a few days after its last postseason game.
const endPlus = new Date(Date.parse(cur.postSeasonEndDate || cur.seasonEndDate) + 4 * 864e5).toISOString().slice(0, 10);
const latestActive = today <= endPlus;

for (let s = FIRST_SEASON; s <= latest; s++) {
  const need = ALL || !haveSeason(OUT, s) || (s === latest && latestActive);
  if (!need) continue;
  const b = await buildSeason(s, teamsMeta);
  if (!b) continue;
  writeSeason(OUT, s, b.team, b.player);
  info[s] = b.info;
}
writeMeta(OUT, { sport: "mlb", time: "date", latestSeason: latest, seasons: Object.values(info).sort((a, b) => a.season - b.season), teams: teamsMeta });
console.log("done");
