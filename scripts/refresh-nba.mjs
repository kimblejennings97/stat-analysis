// Builds NBA data (public/data/nba/*.json) from sportsdataverse's ESPN box-score releases.
//
//   node scripts/refresh-nba.mjs          rebuild the latest season + any season whose file is missing
//   node scripts/refresh-nba.mjs --all    rebuild every season from FIRST_SEASON
//
// Seasons are named by the year they end in (2027 = 2026-27), like ESPN does.
// Rows are one per team-game / player-game, keyed by date (YYYYMMDD).

import fs from "node:fs";
import path from "node:path";
import { outDir, csv, num, round, ymd, readMeta, haveSeason, writeSeason, writeMeta } from "./lib.mjs";

const FIRST_SEASON = 2019; // 2018-19
const REL = "https://github.com/sportsdataverse/sportsdataverse-data/releases/download";
const ALL = process.argv.includes("--all");
const OUT = outDir("nba");

// ESPN season_type: 2 regular season, 3 playoffs, 5 play-in. (1 = preseason, skipped.)
const STYPE = { 2: "R", 3: "P", 5: "P" };

const TEAM_MAP = {
  points: "team_score", fgm: "field_goals_made", fga: "field_goals_attempted",
  fg3m: "three_point_field_goals_made", fg3a: "three_point_field_goals_attempted",
  ftm: "free_throws_made", fta: "free_throws_attempted", oreb: "offensive_rebounds", dreb: "defensive_rebounds",
  reb: "total_rebounds", ast: "assists", stl: "steals", blk: "blocks", tov: "total_turnovers", fouls: "fouls",
  fast_break_points: "fast_break_points", paint_points: "points_in_paint", points_off_turnovers: "turnover_points",
  largest_lead: "largest_lead",
};
const PLAYER_MAP = {
  minutes: "minutes", points: "points", fgm: "field_goals_made", fga: "field_goals_attempted",
  fg3m: "three_point_field_goals_made", fg3a: "three_point_field_goals_attempted",
  ftm: "free_throws_made", fta: "free_throws_attempted", oreb: "offensive_rebounds", dreb: "defensive_rebounds",
  reb: "rebounds", ast: "assists", stl: "steals", blk: "blocks", tov: "turnovers", fouls: "fouls", plus_minus: "plus_minus",
};
const CTX = ["minutes", "points", "fga", "fta", "fg3a", "tov", "reb", "oreb", "dreb", "ast", "stl", "blk"];

const posGroup = (abbr) => {
  const a = (abbr || "").toUpperCase();
  if (a.includes("C")) return "C";
  if (a.includes("F")) return "F";
  if (a.includes("G")) return "G";
  return "";
};

async function buildSeason(season, teams) {
  const [pb, tb] = await Promise.all([
    csv(`${REL}/espn_nba_player_boxscores/player_box_${season}.csv`, true),
    csv(`${REL}/espn_nba_team_boxscores/team_box_${season}.csv`, true),
  ]);
  if (!pb || !tb) return null;
  console.log(`season ${season} ...`);

  // team minutes (for pace) = sum of player minutes in the game
  const teamMin = new Map();
  for (const r of pb) if (STYPE[r.season_type]) {
    const k = `${r.game_id}|${r.team_abbreviation}`;
    teamMin.set(k, (teamMin.get(k) || 0) + num(r.minutes));
  }

  // Real franchises only: All-Star / exhibition "teams" (EAST, LEB, USA...) play a game or two.
  const gp = new Map();
  for (const r of tb) if (STYPE[r.season_type]) gp.set(r.team_abbreviation, (gp.get(r.team_abbreviation) || 0) + 1);
  const real = (abbr) => (gp.get(abbr) || 0) >= 10;

  const teamStatCols = [...Object.keys(TEAM_MAP), "minutes", "wins", "losses", "home_games", "games"];
  const byGameTeam = new Map();
  for (const r of tb) {
    const st = STYPE[r.season_type];
    if (!st || r.team_score === "" || !real(r.team_abbreviation) || !real(r.opponent_team_abbreviation)) continue;
    const vals = {};
    for (const [k, src] of Object.entries(TEAM_MAP)) vals[k] = num(r[src]);
    const won = r.team_winner === "true" || r.team_winner === "TRUE";
    Object.assign(vals, {
      minutes: teamMin.get(`${r.game_id}|${r.team_abbreviation}`) || 240,
      wins: won ? 1 : 0, losses: won ? 0 : 1, home_games: r.team_home_away === "home" ? 1 : 0, games: 1,
    });
    byGameTeam.set(`${r.game_id}|${r.team_abbreviation}`, { r, st, vals });
    teams[r.team_abbreviation] = {
      name: r.team_display_name, nick: r.team_name, logo: r.team_logo, color: "#" + r.team_color, color2: "#" + r.team_alternate_color,
    };
  }
  const oppCols = teamStatCols.filter((c) => !["wins", "losses", "home_games", "games", "minutes"].includes(c));
  const teamCols = ["team", "opp", "date", "stype", ...teamStatCols, ...oppCols.map((c) => "opp_" + c)];
  const teamRows = [];
  for (const { r, st, vals } of byGameTeam.values()) {
    const o = byGameTeam.get(`${r.game_id}|${r.opponent_team_abbreviation}`);
    teamRows.push([r.team_abbreviation, r.opponent_team_abbreviation, ymd(r.game_date), st,
      ...teamStatCols.map((c) => round(vals[c])), ...oppCols.map((c) => round(o ? o.vals[c] : 0))]);
  }

  const playerStatCols = [...Object.keys(PLAYER_MAP), "starts", "games"];
  const playerCols = ["pid", "team", "opp", "date", "stype", ...playerStatCols, ...CTX.map((c) => "tm_" + c)];
  const people = {};
  const playerRows = [];
  for (const r of pb) {
    const st = STYPE[r.season_type];
    if (!st || !real(r.team_abbreviation) || !real(r.opponent_team_abbreviation) || r.did_not_play === "true" || r.did_not_play === "TRUE" || r.minutes === "" || num(r.minutes) <= 0) continue;
    const vals = {};
    for (const [k, src] of Object.entries(PLAYER_MAP)) vals[k] = num(r[src]);
    vals.starts = r.starter === "true" || r.starter === "TRUE" ? 1 : 0;
    vals.games = 1;
    const tm = byGameTeam.get(`${r.game_id}|${r.team_abbreviation}`)?.vals || {};
    people[r.athlete_id] = [r.athlete_display_name, r.athlete_position_abbreviation || "", posGroup(r.athlete_position_abbreviation), r.athlete_headshot_href || ""];
    playerRows.push([r.athlete_id, r.team_abbreviation, r.opponent_team_abbreviation, ymd(r.game_date), st,
      ...playerStatCols.map((c) => round(vals[c])), ...CTX.map((c) => round(tm[c] || 0))]);
  }
  const maxDate = Math.max(...teamRows.map((r) => r[2]));
  return {
    info: { season, label: `${season - 1}-${String(season).slice(2)}`, maxDate, playerRows: playerRows.length },
    team: { season, cols: teamCols, rows: teamRows },
    player: { season, cols: playerCols, people, rows: playerRows },
  };
}

const require_ = (kind, s) => fs.readFileSync(path.join(OUT, `${kind}_${s}.json`), "utf8");
const old = readMeta(OUT) || { seasons: [], teams: {} };
const info = Object.fromEntries((old.seasons || []).map((s) => [s.season, s]));
const teams = {};

const y = new Date().getUTCFullYear();
let latest = null;
for (const s of [y + 1, y]) {
  const r = await fetch(`${REL}/espn_nba_player_boxscores/player_box_${s}.csv`, { method: "HEAD", redirect: "follow" });
  if (r.ok) { latest = s; break; }
}
if (!latest) throw new Error("No current NBA season file found");

for (let s = FIRST_SEASON; s <= latest; s++) {
  if (haveSeason(OUT, s) && !ALL && s !== latest) {
    // keep team info from files we didn't rebuild
    for (const r of JSON.parse(require_("teams", s)).rows) if (!teams[r[0]] && old.teams?.[r[0]]) teams[r[0]] = old.teams[r[0]];
    continue;
  }
  const b = await buildSeason(s, teams);
  if (!b) continue;
  writeSeason(OUT, s, b.team, b.player);
  info[s] = b.info;
  console.log(`  ${b.info.label}: through ${b.info.maxDate}, ${b.info.playerRows} player-games`);
}
writeMeta(OUT, { sport: "nba", time: "date", latestSeason: latest, seasons: Object.values(info).sort((a, b) => a.season - b.season), teams });
console.log("done");
