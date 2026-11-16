import { makeSport } from "./common.js";

// MLB: official MLB Stats API, one row per team-day / player-day. Batting = offense ("O"), pitching = defense ("D").

const LABELS = {
  games: "Games", pa: "Plate appearances", ab: "At bats", h: "Hits", singles: "Singles", doubles: "Doubles",
  triples: "Triples", hr: "Home runs", xbh: "Extra-base hits", r: "Runs", rbi: "RBI", bb: "Walks",
  ibb: "Intentional walks", so: "Strikeouts", hbp: "Hit by pitch", sb: "Stolen bases", cs: "Caught stealing",
  gidp: "Double plays grounded into", tb: "Total bases", sf: "Sac flies", sh: "Sac bunts", lob: "Left on base",
  pitches_seen: "Pitches seen", go: "Ground outs", ao: "Fly outs",
  on_base: "Times on base", obp_den: "OBP denominator", iso_num: "Isolated power bases", babip_num: "Hits on balls in play",
  babip_den: "Balls in play", woba_num: "wOBA value (approx.)", woba_den: "wOBA denominator",
  p_games: "Pitching appearances", p_gs: "Games started (P)", p_outs: "Outs recorded", innings: "Innings pitched",
  p_nine: "Nine-inning units", p_bf: "Batters faced", p_h: "Hits allowed", p_r: "Runs allowed (pitcher)",
  p_er: "Earned runs", p_bb: "Walks allowed", p_ibb: "Intentional walks issued", p_so: "Strikeouts (pitching)",
  p_hr: "Home runs allowed", p_hbp: "Hit batters", p_pitches: "Pitches thrown", p_strikes: "Strikes thrown",
  p_w: "Wins (pitcher)", p_l: "Losses (pitcher)", p_sv: "Saves", p_svo: "Save opportunities", p_hld: "Holds",
  p_bs: "Blown saves", p_cg: "Complete games", p_sho: "Shutouts", p_go: "Ground outs (pitching)",
  p_ao: "Fly outs (pitching)", p_ir: "Inherited runners", p_irs: "Inherited runners scored", p_wp: "Wild pitches",
  p_whip_num: "Walks + hits allowed", p_bip: "Balls in play (pitching)",
  runs_for: "Runs scored", runs_against: "Runs allowed", run_diff: "Run differential", wins: "Wins",
  losses: "Losses", home_games: "Home games",
};
const PER_LABELS = {
  games: "game", pa: "plate appearance", ab: "at bat", obp_den: "OBP opportunity", babip_den: "ball in play",
  woba_den: "wOBA plate appearance", p_nine: "9 innings", innings: "inning", p_bf: "batter faced",
  p_gs: "start", p_games: "appearance", p_pitches: "pitch", pitches_seen: "pitch seen", p_svo: "save opportunity",
  p_ir: "inherited runner", p_bip: "ball in play", h: "hit",
};

const GROUPS = [
  ["Results", /^(wins|losses|home_games|run_diff|runs_for|runs_against|games)$/],
  ["Batting", /^(pa|ab|h|singles|doubles|triples|hr|xbh|r|rbi|tb|lob)$/],
  ["Plate discipline", /^(bb|ibb|so|hbp|pitches_seen|go|ao|sf|sh|gidp)$/],
  ["Baserunning", /^(sb|cs)$/],
  ["Rate building blocks", /^(on_base|obp_den|iso_num|babip_num|babip_den|woba_num|woba_den)$/],
  ["Pitching", /^(p_games|p_gs|p_outs|innings|p_bf|p_h|p_r|p_er|p_bb|p_ibb|p_so|p_hr|p_hbp|p_w|p_l|p_cg|p_sho|p_wp|p_go|p_ao|p_whip_num|p_bip)$/],
  ["Pitch counts", /^(p_pitches|p_strikes|p_nine)$/],
  ["Bullpen", /^(p_sv|p_svo|p_hld|p_bs|p_ir|p_irs)$/],
];

const SIDE_RE = [
  ["N", /^(games|wins|losses|home_games|run_diff)$/],
  ["D", /^(p_|innings|runs_against)/],
];
const VOLUME_RE = /^(games|pa|ab|obp_den|babip_den|woba_den|h|pitches_seen|p_games|p_gs|p_outs|innings|p_nine|p_bf|p_pitches|p_svo|p_ir|p_bip)$/;

const DERIVED = {
  singles: (g) => g("h") - g("doubles") - g("triples") - g("hr"),
  xbh: (g) => g("doubles") + g("triples") + g("hr"),
  on_base: (g) => g("h") + g("bb") + g("hbp"),
  obp_den: (g) => g("ab") + g("bb") + g("hbp") + g("sf"),
  iso_num: (g) => g("tb") - g("h"),
  babip_num: (g) => g("h") - g("hr"),
  babip_den: (g) => g("ab") - g("so") - g("hr") + g("sf"),
  // wOBA with fixed recent-era linear weights (approximation; FanGraphs varies them by year)
  woba_num: (g) => 0.69 * (g("bb") - g("ibb")) + 0.72 * g("hbp") + 0.89 * (g("h") - g("doubles") - g("triples") - g("hr")) + 1.27 * g("doubles") + 1.62 * g("triples") + 2.1 * g("hr"),
  woba_den: (g) => g("ab") + g("bb") - g("ibb") + g("sf") + g("hbp"),
  innings: (g) => g("p_outs") / 3,
  p_nine: (g) => g("p_outs") / 27,
  p_whip_num: (g) => g("p_h") + g("p_bb"),
  p_bip: (g) => g("p_bf") - g("p_so") - g("p_bb") - g("p_hbp") - g("p_hr"),
  run_diff: (g) => g("runs_for") - g("runs_against"),
};

const PRESETS = {
  team: [
    { name: "Runs per game", stat: "runs_for", per: "games" },
    { name: "Runs allowed per game", stat: "runs_against", per: "games", low: true },
    { name: "Run differential / game", stat: "run_diff", per: "games" },
    { name: "Batting average", stat: "h", per: "ab" },
    { name: "OBP", stat: "on_base", per: "obp_den" },
    { name: "Slugging", stat: "tb", per: "ab" },
    { name: "ISO", stat: "iso_num", per: "ab" },
    { name: "wOBA (approx.)", stat: "woba_num", per: "woba_den" },
    { name: "Strikeout % (batting)", stat: "so", per: "pa", pct: true },
    { name: "Walk % (batting)", stat: "bb", per: "pa", pct: true },
    { name: "ERA", stat: "p_er", per: "p_nine", low: true },
    { name: "WHIP", stat: "p_whip_num", per: "innings", low: true },
    { name: "Strikeout % (pitching)", stat: "p_so", per: "p_bf", pct: true },
    { name: "K per 9", stat: "p_so", per: "p_nine" },
    { name: "HR allowed per 9", stat: "p_hr", per: "p_nine", low: true },
  ],
  player: [
    { name: "Batting average", stat: "h", per: "ab" },
    { name: "OBP", stat: "on_base", per: "obp_den" },
    { name: "Slugging", stat: "tb", per: "ab" },
    { name: "ISO", stat: "iso_num", per: "ab" },
    { name: "wOBA (approx.)", stat: "woba_num", per: "woba_den" },
    { name: "BABIP", stat: "babip_num", per: "babip_den" },
    { name: "Home run %", stat: "hr", per: "pa", pct: true },
    { name: "Strikeout % (batting)", stat: "so", per: "pa", pct: true },
    { name: "Walk % (batting)", stat: "bb", per: "pa", pct: true },
    { name: "ERA", stat: "p_er", per: "p_nine", low: true },
    { name: "WHIP", stat: "p_whip_num", per: "innings", low: true },
    { name: "Strikeout % (pitching)", stat: "p_so", per: "p_bf", pct: true },
    { name: "Walk % (pitching)", stat: "p_bb", per: "p_bf", pct: true },
    { name: "K per 9", stat: "p_so", per: "p_nine" },
    { name: "Innings per start", stat: "innings", per: "p_gs" },
    { name: "Pitches per inning", stat: "p_pitches", per: "innings" },
  ],
};

export default makeSport({
  id: "mlb",
  name: "MLB",
  time: "date",
  LABELS, PER_LABELS, GROUPS, SIDE_RE, VOLUME_RE,
  NOT_PICKABLE: ["p_nine", "obp_den", "babip_den", "woba_den"],
  groupOrder: GROUPS.map((g) => g[0]),
  derived: DERIVED,
  teamOnly: new Set(["runs_for", "runs_against", "run_diff", "wins", "losses", "home_games"]),
  presets: PRESETS,
  positions: ["C", "1B", "2B", "3B", "SS", "OF", "DH", "TWP", "SP", "RP"],
  sides: [["O", "Batting"], ["D", "Pitching"], ["all", "All"]],
  credit: ["Data: the official ", { text: "MLB Stats API", href: "https://statsapi.mlb.com" }, " (one row per player per day; doubleheaders combined). Updated daily in season. wOBA uses fixed linear weights (approx.)."],
  qualAlias: { p_nine: "innings", obp_den: "pa", woba_den: "pa", babip_den: "pa" },
  seasonMonths: [3, 4, 5, 6, 7, 8, 9, 10, 11],
  defaults: {
    entity: "team", chart: "scatter",
    metrics: [{ stat: "runs_for", per: "games" }, { stat: "runs_against", per: "games" }],
    player: [{ stat: "woba_num", per: "woba_den" }, { stat: "iso_num", per: "ab" }],
  },
});
