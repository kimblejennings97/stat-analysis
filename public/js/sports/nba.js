import { makeSport } from "./common.js";

// NBA: ESPN box scores via sportsdataverse. Seasons are named by the year they end (2027 = 2026-27).

const LABELS = {
  games: "Games", minutes: "Minutes", points: "Points", fgm: "Field goals made", fga: "Field goal attempts",
  fg3m: "3-pointers made", fg3a: "3-point attempts", fg2m: "2-pointers made", fg2a: "2-point attempts",
  ftm: "Free throws made", fta: "Free throw attempts", oreb: "Offensive rebounds", dreb: "Defensive rebounds",
  reb: "Rebounds", ast: "Assists", stl: "Steals", blk: "Blocks", tov: "Turnovers", fouls: "Fouls",
  plus_minus: "Plus-minus", starts: "Starts", fast_break_points: "Fast break points", paint_points: "Points in the paint",
  points_off_turnovers: "Points off turnovers", largest_lead: "Largest lead", wins: "Wins", losses: "Losses",
  home_games: "Home games", point_diff: "Point differential", possessions: "Possessions",
  poss100: "Possessions ÷ 100", games48: "48-minute games", min36: "Minutes ÷ 36", tsa2: "True shooting attempts × 2",
  efg_makes: "Effective FG makes", stocks: "Stocks (steals + blocks)", pra: "Points + rebounds + assists",
  oreb_chances: "Offensive rebound chances",
  tm_minutes: "Team minutes", tm_points: "Team points", tm_fga: "Team FGA", tm_fta: "Team FTA", tm_fg3a: "Team 3PA",
  tm_tov: "Team turnovers", tm_reb: "Team rebounds", tm_oreb: "Team offensive rebounds", tm_dreb: "Team defensive rebounds",
  tm_ast: "Team assists", tm_stl: "Team steals", tm_blk: "Team blocks",
};
const PER_LABELS = {
  games: "game", minutes: "minute", possessions: "possession", poss100: "100 possessions", games48: "48 minutes",
  min36: "36 minutes", fga: "field goal attempt", fg3a: "3-point attempt", fg2a: "2-point attempt",
  fta: "free throw attempt", tsa2: "true shooting attempt (×2)", starts: "start", oreb_chances: "offensive rebound chance",
  tm_fga: "team FGA", tm_fta: "team FTA", tm_fg3a: "team 3PA", tm_points: "team point", tm_reb: "team rebound",
  tm_ast: "team assist", tm_tov: "team turnover", tm_minutes: "team minute",
};

const GROUPS = [
  ["Results", /^(wins|losses|home_games|point_diff|plus_minus|largest_lead)$/],
  ["Scoring", /^(points|paint_points|fast_break_points|points_off_turnovers|pra)$/],
  ["Shooting", /^(fg|ft|tsa|efg)/],
  ["Rebounding", /^(oreb|dreb|reb)/],
  ["Playmaking", /^(ast|tov)$/],
  ["Defense", /^(stl|blk|stocks|fouls)$/],
  ["Pace & minutes", /^(possessions|poss100|games48|min36|minutes|starts|games)$/],
  ["Team share context", /^tm_/],
];
const BASE = GROUPS.map((g) => g[0]);
const GROUP_ORDER = [...BASE.slice(0, 7), ...["Scoring", "Shooting", "Rebounding", "Playmaking", "Pace & minutes"].map((g) => "Allowed: " + g), ...BASE.slice(7)];

const SIDE_RE = [
  ["N", /^(games|minutes|wins|losses|home_games|point_diff|plus_minus|largest_lead|starts|games48|min36|reb|tm_minutes|tm_reb|fouls)$/],
  ["D", /^(stl|blk|stocks|dreb|tm_stl|tm_blk|tm_dreb)$/],
];
const VOLUME_RE = /^(games|minutes|possessions|poss100|games48|min36|fga|fta|fg3a|fg2a|tsa2|starts|oreb_chances)$|^tm_/;

const DERIVED = {
  fg2m: (g) => g("fgm") - g("fg3m"),
  fg2a: (g) => g("fga") - g("fg3a"),
  possessions: (g) => g("fga") - g("oreb") + g("tov") + 0.44 * g("fta"),
  poss100: (g) => (g("fga") - g("oreb") + g("tov") + 0.44 * g("fta")) / 100,
  games48: (g) => g("minutes") / 240,
  min36: (g) => g("minutes") / 36,
  tsa2: (g) => 2 * (g("fga") + 0.44 * g("fta")),
  efg_makes: (g) => g("fgm") + 0.5 * g("fg3m"),
  stocks: (g) => g("stl") + g("blk"),
  pra: (g) => g("points") + g("reb") + g("ast"),
  point_diff: (g) => g("points") - g("opp_points"),
  oreb_chances: (g) => g("oreb") + g("opp_dreb"),
};

const PRESETS = {
  team: [
    { name: "Offensive rating", stat: "points", per: "poss100" },
    { name: "Defensive rating", stat: "opp_points", per: "opp_poss100", low: true },
    { name: "Net rating", stat: "point_diff", per: "poss100" },
    { name: "Pace", stat: "possessions", per: "games48" },
    { name: "Points per game", stat: "points", per: "games" },
    { name: "eFG%", stat: "efg_makes", per: "fga", pct: true },
    { name: "Opp. eFG%", stat: "opp_efg_makes", per: "opp_fga", pct: true, low: true },
    { name: "True shooting %", stat: "points", per: "tsa2", pct: true },
    { name: "3-point attempt rate", stat: "fg3a", per: "fga", pct: true },
    { name: "3-point %", stat: "fg3m", per: "fg3a", pct: true },
    { name: "Turnover rate", stat: "tov", per: "possessions", pct: true, low: true },
    { name: "Offensive rebound %", stat: "oreb", per: "oreb_chances", pct: true },
    { name: "Free throw rate", stat: "fta", per: "fga" },
  ],
  player: [
    { name: "Points per game", stat: "points", per: "games" },
    { name: "Points per 36", stat: "points", per: "min36" },
    { name: "Rebounds per 36", stat: "reb", per: "min36" },
    { name: "Assists per 36", stat: "ast", per: "min36" },
    { name: "PRA per game", stat: "pra", per: "games" },
    { name: "True shooting %", stat: "points", per: "tsa2", pct: true },
    { name: "eFG%", stat: "efg_makes", per: "fga", pct: true },
    { name: "3-point %", stat: "fg3m", per: "fg3a", pct: true },
    { name: "Free throw %", stat: "ftm", per: "fta", pct: true },
    { name: "Shot share", stat: "fga", per: "tm_fga", pct: true },
    { name: "Assist share", stat: "ast", per: "tm_ast", pct: true },
    { name: "Minutes per game", stat: "minutes", per: "games" },
    { name: "Plus-minus per 36", stat: "plus_minus", per: "min36" },
  ],
};

export default makeSport({
  id: "nba",
  name: "NBA",
  time: "date",
  LABELS, PER_LABELS, GROUPS, SIDE_RE, VOLUME_RE,
  NOT_PICKABLE: ["poss100", "games48", "min36", "tsa2", "oreb_chances"],
  groupOrder: GROUP_ORDER,
  derived: DERIVED,
  teamOnly: new Set(["point_diff", "wins", "losses", "home_games", "largest_lead", "fast_break_points", "paint_points", "points_off_turnovers", "games48", "oreb_chances"]),
  presets: PRESETS,
  positions: ["G", "F", "C"],
  sides: [["O", "Offense"], ["D", "Defense"], ["all", "All"]],
  credit: ["Data: ESPN box scores via ", { text: "sportsdataverse", href: "https://github.com/sportsdataverse/sportsdataverse-data" }, ". Updated daily in season. Possessions are estimated (FGA − OREB + TOV + 0.44 × FTA)."],
  qualAlias: { poss100: "possessions", min36: "minutes", tsa2: "fga", games48: "games", oreb_chances: "oreb" },
  seasonMonths: [10, 11, 12, 1, 2, 3, 4, 5, 6],
  defaults: {
    entity: "team", chart: "scatter",
    metrics: [{ stat: "points", per: "poss100" }, { stat: "opp_points", per: "opp_poss100" }],
    player: [{ stat: "points", per: "tsa2", pct: true }, { stat: "points", per: "games" }],
  },
});
