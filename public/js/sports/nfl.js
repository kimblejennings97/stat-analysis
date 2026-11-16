// NFL sport definition: stat labels/groups, derived stats, quick presets.
// Adding a sport = another file shaped like this one + a refresh script that writes public/data/<sport>/.

const LABELS = {
  games: "Games", completions: "Completions", attempts: "Pass attempts", passing_yards: "Passing yards",
  passing_tds: "Passing TDs", passing_interceptions: "Interceptions thrown", sacks_suffered: "Sacks taken",
  sack_yards_lost: "Sack yards lost", sack_fumbles: "Sack fumbles", sack_fumbles_lost: "Sack fumbles lost",
  passing_air_yards: "Passing air yards", passing_yards_after_catch: "Passing YAC", passing_first_downs: "Passing 1st downs",
  passing_epa: "Passing EPA", passing_2pt_conversions: "Passing 2-pt conv.", cpoe_x_att: "CPOE × attempts (use per attempts)",
  passing_10: "Completions 10+ yds", passing_16: "Completions 16+ yds", passing_20: "Completions 20+ yds", passing_40: "Completions 40+ yds",
  carries: "Carries", rushing_yards: "Rushing yards", rushing_tds: "Rushing TDs", rushing_fumbles: "Rushing fumbles",
  rushing_fumbles_lost: "Rushing fumbles lost", rushing_first_downs: "Rushing 1st downs", rushing_epa: "Rushing EPA",
  rushing_2pt_conversions: "Rushing 2-pt conv.", rushing_10: "Runs 10+ yds", rushing_12: "Runs 12+ yds", rushing_20: "Runs 20+ yds", rushing_40: "Runs 40+ yds",
  receptions: "Receptions", targets: "Targets", receiving_yards: "Receiving yards", receiving_tds: "Receiving TDs",
  receiving_fumbles: "Receiving fumbles", receiving_fumbles_lost: "Receiving fumbles lost", receiving_air_yards: "Receiving air yards",
  receiving_yards_after_catch: "Receiving YAC", receiving_first_downs: "Receiving 1st downs", receiving_epa: "Receiving EPA",
  receiving_2pt_conversions: "Receiving 2-pt conv.", receiving_10: "Catches 10+ yds", receiving_16: "Catches 16+ yds", receiving_20: "Catches 20+ yds", receiving_40: "Catches 40+ yds",
  special_teams_tds: "Special teams TDs", def_tackles_solo: "Solo tackles", def_tackles_with_assist: "Tackles with assist",
  def_tackle_assists: "Tackle assists", def_tackles_for_loss: "Tackles for loss", def_tackles_for_loss_yards: "TFL yards",
  def_fumbles_forced: "Forced fumbles", def_sacks: "Sacks", def_sack_yards: "Sack yards", def_qb_hits: "QB hits",
  def_interceptions: "Interceptions", def_interception_yards: "INT return yards", def_pass_defended: "Passes defended",
  def_tds: "Defensive TDs", def_fumbles: "Defensive fumbles", def_safeties: "Safeties", def_punt_blocks: "Punt blocks",
  def_pat_blocks: "PAT blocks", def_fg_blocks: "FG blocks", misc_yards: "Misc yards", fumble_recovery_own: "Own fumbles recovered",
  fumble_recovery_opp: "Opp. fumbles recovered", fumble_recovery_tds: "Fumble recovery TDs", penalties: "Penalties",
  penalty_yards: "Penalty yards", fumbles_total: "Fumbles", fumbles_lost_total: "Fumbles lost", punt_returns: "Punt returns",
  punt_return_yards: "Punt return yards", kickoff_returns: "Kickoff returns", kickoff_return_yards: "Kickoff return yards",
  fg_made: "FG made", fg_att: "FG attempts", fg_missed: "FG missed", fg_blocked: "FG blocked", pat_made: "PAT made",
  pat_att: "PAT attempts", pat_missed: "PAT missed", pt_att: "Punts", pt_yards: "Punt yards", pt_net_yards: "Net punt yards",
  pt_inside_20: "Punts inside 20", pt_touchback: "Punt touchbacks", fantasy_points: "Fantasy pts (std)", fantasy_points_ppr: "Fantasy pts (PPR)",
  points_for: "Points scored", points_against: "Points allowed", wins: "Wins", losses: "Losses", ties: "Ties",
  home_games: "Home games", spread_line: "Vegas spread (+ = favored)", total_line: "Vegas total",
  off_plays: "Offensive plays", def_plays: "Defensive plays", st_plays: "Special teams plays",
  offense_snaps: "Offensive snaps", defense_snaps: "Defensive snaps", st_snaps: "Special teams snaps",
  pressures_faced: "Pressures faced (QB)", hurries_faced: "Hurries faced", hits_faced: "Hits faced", blitzes_faced: "Blitzes faced",
  bad_throws: "Bad throws", drops_by_receivers: "Drops by receivers", rush_ybc: "Rush yds before contact",
  rush_yac: "Rush yds after contact", rush_broken_tackles: "Broken tackles (rushing)", drops: "Drops",
  rec_broken_tackles: "Broken tackles (receiving)", def_pressures: "Pressures", def_hurries: "Hurries",
  def_qb_hits_pfr: "QB knockdowns (PFR)", def_blitzes: "Blitzes", cov_targets: "Targets allowed (coverage)",
  cov_completions: "Completions allowed", cov_yards: "Yards allowed (coverage)", cov_tds: "TDs allowed (coverage)",
  cov_air_yards: "Air yards allowed", cov_yac: "YAC allowed", missed_tackles: "Missed tackles", tackles_combined: "Combined tackles",
  tm_pass_attempts: "Team pass attempts", tm_targets: "Team targets", tm_air_yards: "Team air yards", tm_carries: "Team carries",
  tm_off_plays: "Team offensive plays", tm_def_plays: "Team defensive plays",
  // derived
  total_yards: "Total yards", total_tds: "Total TDs", total_epa: "Total EPA", dropbacks: "Dropbacks",
  turnovers: "Turnovers", scrimmage_yards: "Scrimmage yards", touches: "Touches", point_diff: "Point differential",
  net_pass_yards: "Net passing yards", tackles: "Tackles",
};

const GROUPS = [
  ["Results", /^(points_|point_diff|wins|losses|ties|home_games|spread_line|total_line)/],
  ["Overall", /^(total_|turnovers|scrimmage_yards|touches|games$|fantasy)/],
  ["Passing", /^(completions|attempts|passing_|sacks_suffered|sack_|cpoe|dropbacks|net_pass|bad_throws|drops_by)/],
  ["Pressure (QB)", /^(pressures_faced|hurries_faced|hits_faced|blitzes_faced)/],
  ["Rushing", /^(carries|rushing_|rush_)/],
  ["Receiving", /^(receptions|targets|receiving_|drops$|rec_broken)/],
  ["Pass rush", /^(def_sacks|def_sack_yards|def_qb_hits|def_pressures|def_hurries|def_blitzes)/],
  ["Coverage", /^(cov_|def_interceptions|def_interception_yards|def_pass_defended)/],
  ["Defense", /^(def_|tackles|missed_tackles|fumble_recovery)/],
  ["Snaps & plays", /(_snaps|_plays)$/],
  ["Team share context", /^tm_/],
  ["Kicking", /^(fg_|pat_|gwfg_)/],
  ["Punting", /^pt_/],
  ["Returns", /^(punt_return|kickoff_return|special_teams)/],
  ["Misc", /./],
];

// Derived columns: computed in the browser from stored columns. `opp_` versions are made for teams.
const DERIVED = {
  total_yards: (g) => g("passing_yards") + g("rushing_yards"),
  net_pass_yards: (g) => g("passing_yards") - g("sack_yards_lost"),
  total_tds: (g) => g("passing_tds") + g("rushing_tds") + g("receiving_tds") + g("special_teams_tds") + g("def_tds"),
  total_epa: (g) => g("passing_epa") + g("rushing_epa"),
  dropbacks: (g) => g("attempts") + g("sacks_suffered"),
  turnovers: (g) => g("passing_interceptions") + g("fumbles_lost_total"),
  scrimmage_yards: (g) => g("rushing_yards") + g("receiving_yards"),
  touches: (g) => g("carries") + g("receptions"),
  point_diff: (g) => g("points_for") - g("points_against"),
  tackles: (g) => g("def_tackles_solo") + g("def_tackle_assists"),
};
const TEAM_ONLY = new Set(["point_diff", "points_for", "points_against", "wins", "losses", "ties", "home_games", "spread_line", "total_line", "off_plays", "def_plays", "st_plays"]);

// How a stat reads after "per": singular, lower case.
const PER_LABELS = {
  games: "game", off_plays: "offensive play", def_plays: "defensive play", st_plays: "special teams play",
  dropbacks: "dropback", opp_dropbacks: "opponent dropback", pressures_faced: "pressure", def_pressures: "pressure",
  carries: "carry", targets: "target", attempts: "attempt", receptions: "reception", completions: "completion",
  touches: "touch", offense_snaps: "offensive snap", defense_snaps: "defensive snap", st_snaps: "special teams snap",
  blitzes_faced: "blitz", def_blitzes: "blitz", cov_targets: "target in coverage", tm_targets: "team target",
  tm_air_yards: "team air yard", tm_carries: "team carry", tm_pass_attempts: "team pass attempt",
  tm_off_plays: "team offensive play", tm_def_plays: "team defensive play",
};
function perLabel(key) {
  if (PER_LABELS[key]) return PER_LABELS[key];
  const l = lc(label(key)).replace(/\s*\(.*\)$/, "");
  return l.replace(/(\w+)$/,(w) => (/ies$/.test(w) ? w.slice(0, -3) + "y" : /[^s]s$/.test(w) ? w.slice(0, -1) : w));
}

function label(key) {
  if (key.startsWith("opp_")) return "Opp. " + lc(label(key.slice(4)));
  if (LABELS[key]) return LABELS[key];
  return key.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}
const lc = (s) => (/^[A-Z]{2}/.test(s) ? s : s.charAt(0).toLowerCase() + s.slice(1));

function group(key) {
  if (key.startsWith("opp_")) return "Allowed: " + group(key.slice(4));
  return GROUPS.find(([, re]) => re.test(key))[0];
}
const BASE_GROUPS = GROUPS.map((g) => g[0]);
const GROUP_ORDER = [
  ...BASE_GROUPS.slice(0, BASE_GROUPS.indexOf("Defense") + 1),
  ...["Overall", "Passing", "Pressure (QB)", "Rushing", "Receiving", "Snaps & plays"].map((g) => "Allowed: " + g),
  ...BASE_GROUPS.slice(BASE_GROUPS.indexOf("Defense") + 1),
];

// ---- side of the ball / phase: drives the stat filter and which divisors are offered
// O = offense, D = defense, ST = special teams, N = neutral (results, games, fantasy).
const SIDE_RE = [
  ["N", /^(games|wins|losses|ties|home_games|spread_line|total_line|point_diff|penalt|fantasy|misc_yards)/],
  ["ST", /^(fg_|pat_|gwfg_|pt_|punt_return|kickoff_return|special_teams|st_)/],
  ["D", /^(def_|cov_|missed_tackles|tackles|defense_snaps|tm_def_plays|points_against|fumble_recovery_opp)/],
];
function side(key) {
  if (key.startsWith("opp_")) {
    const b = side(key.slice(4));
    return b === "O" ? "D" : b === "D" ? "O" : b;
  }
  return (SIDE_RE.find(([, re]) => re.test(key)) || ["O"])[0];
}
const PASS_RE = /^(completions|attempts|passing_|sack|cpoe|dropbacks|net_pass|bad_throws|drops|pressures_faced|hurries_faced|hits_faced|blitzes_faced|receiv|receptions|targets|tm_targets|tm_air|tm_pass|rec_|def_sack|def_qb|def_pressures|def_hurries|def_blitzes|cov_|def_interception|def_pass_def)/;
const RUSH_RE = /^(carries|rushing_|rush_|tm_carries)/;
function phase(key) {
  const k = key.replace(/^opp_/, "");
  return PASS_RE.test(k) ? "pass" : RUSH_RE.test(k) ? "rush" : "all";
}
// Opportunity counts: the natural things to divide by.
const VOLUME_RE = /^(games|attempts|completions|dropbacks|carries|targets|receptions|touches|off_plays|def_plays|st_plays|offense_snaps|defense_snaps|st_snaps|pressures_faced|hurries_faced|hits_faced|blitzes_faced|sacks_suffered|def_pressures|def_blitzes|def_hurries|def_sacks|cov_targets|cov_completions|tackles_combined|pt_att|fg_att|pat_att|punt_returns|kickoff_returns|tm_|passing_first_downs|rushing_first_downs|receiving_first_downs)$|^tm_/;
const isVolume = (key) => VOLUME_RE.test(key.replace(/^opp_/, ""));

// Can this be picked as the main stat? (Team context, mirrored defensive opp_ stats and helper columns are divisor-only.)
function pickable(key) {
  if (key.startsWith("tm_")) return false;
  if (key.startsWith("opp_") && side(key.slice(4)) !== "O") return false;
  return true;
}

// The same event counted from the other team's box score (dividing by it gives ~1).
const MIRRORS = {
  def_sacks: "opp_sacks_suffered", def_interceptions: "opp_passing_interceptions", def_pressures: "opp_pressures_faced",
  def_qb_hits: "opp_hits_faced", def_blitzes: "opp_blitzes_faced", sacks_suffered: "opp_def_sacks",
  pressures_faced: "opp_def_pressures", passing_interceptions: "opp_def_interceptions", blitzes_faced: "opp_def_blitzes",
  points_for: "opp_points_for", def_plays: "opp_off_plays", off_plays: "opp_def_plays",
};

// Divisors for a stat, best first: { suggested, related, rest }.
// suggested = opportunity counts on the same side of the ball (same phase first);
// related = any other stat on that side (e.g. sacks per opp. rushing yards);
// rest = everything else (hidden behind "show all").
function divisors(stat, list) {
  const s = side(stat), p = phase(stat);
  const sameSide = (k) => s === "N" || side(k) === s || side(k) === "N";
  const mirror = MIRRORS[stat] || MIRRORS[Object.keys(MIRRORS).find((k) => MIRRORS[k] === stat)];
  const cands = list.filter((k) => k !== stat && k !== mirror && k !== "cpoe_x_att" &&!(k.startsWith("opp_") && side(k.slice(4)) === "N"));
  const suggested = cands.filter((k) => k === "games" || (sameSide(k) && isVolume(k)))
    .sort((a, b) => (a === "games" ? -1 : b === "games" ? 1 : 0) || (phase(b) === p) - (phase(a) === p));
  const sug = new Set(suggested);
  const related = cands.filter((k) => !sug.has(k) && sameSide(k));
  const rel = new Set(related);
  const rest = cands.filter((k) => !sug.has(k) && !rel.has(k));
  return { suggested, related, rest };
}

// Preset metrics. `per` = denominator stat; `pct` shows as a percentage.
const PRESETS = {
  team: [
    { name: "Points per game", stat: "points_for", per: "games" },
    { name: "Yards per play", stat: "total_yards", per: "off_plays" },
    { name: "Yards allowed per play", stat: "opp_total_yards", per: "def_plays" },
    { name: "EPA per play", stat: "total_epa", per: "off_plays" },
    { name: "EPA per dropback", stat: "passing_epa", per: "dropbacks" },
    { name: "Pressure rate (defense)", stat: "def_pressures", per: "opp_dropbacks", pct: true },
    { name: "Sacks per pressure", stat: "def_sacks", per: "def_pressures", pct: true },
    { name: "Pressure rate allowed", stat: "pressures_faced", per: "dropbacks", pct: true },
    { name: "Blitz rate", stat: "def_blitzes", per: "opp_dropbacks", pct: true },
    { name: "Turnover margin / game", stat: "opp_turnovers", per: "games", note: "takeaways" },
    { name: "Point differential / game", stat: "point_diff", per: "games" },
  ],
  player: [
    { name: "Yards per game (scrimmage)", stat: "scrimmage_yards", per: "games" },
    { name: "Target share", stat: "targets", per: "tm_targets", pct: true },
    { name: "Air yards share", stat: "receiving_air_yards", per: "tm_air_yards", pct: true },
    { name: "Targets per snap", stat: "targets", per: "offense_snaps", pct: true },
    { name: "Receiving yards per snap", stat: "receiving_yards", per: "offense_snaps", note: "route proxy" },
    { name: "Yards per carry", stat: "rushing_yards", per: "carries" },
    { name: "Yards after contact / att", stat: "rush_yac", per: "carries" },
    { name: "EPA per dropback (QB)", stat: "passing_epa", per: "dropbacks" },
    { name: "CPOE", stat: "cpoe_x_att", per: "attempts" },
    { name: "Sacks per pressure (QB)", stat: "sacks_suffered", per: "pressures_faced", pct: true },
    { name: "Sacks per pressure (rusher)", stat: "def_sacks", per: "def_pressures", pct: true },
    { name: "Pressures per game", stat: "def_pressures", per: "games" },
    { name: "Snap share (offense)", stat: "offense_snaps", per: "tm_off_plays", pct: true },
    { name: "PPR points per game", stat: "fantasy_points_ppr", per: "games" },
  ],
};

export default {
  id: "nfl",
  name: "NFL",
  label,
  perLabel,
  group,
  groupOrder: GROUP_ORDER,
  side,
  phase,
  pickable,
  divisors,
  sides: [["O", "Offense"], ["D", "Defense"], ["ST", "Special teams"], ["all", "All"]],
  derived: DERIVED,
  teamOnly: TEAM_ONLY,
  presets: PRESETS,
  positions: ["QB", "RB", "WR", "TE", "OL", "DL", "LB", "DB", "SPEC"],
  // Playoff weeks: 19-22 since the 17-game schedule (2021), 18-21 before.
  weekLabel: (w, stype, season) =>
    stype === "P" ? ["WC", "DIV", "CONF", "SB"][w - (season >= 2021 ? 19 : 18)] || `W${w}` : `W${w}`,
  logo: (team, meta) => meta.teams[team]?.logo || "",
  defaults: {
    entity: "team", chart: "scatter",
    metrics: [
      { stat: "total_yards", per: "off_plays" },
      { stat: "opp_total_yards", per: "def_plays" },
    ],
  },
};
