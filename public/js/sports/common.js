// Shared sport machinery. A sport file supplies data (labels, groups, sides, presets…) and makeSport
// turns it into the interface the app uses: label, perLabel, group, side, phase, pickable, divisors, etc.
//
// Sides: O = offense (batting), D = defense (pitching), ST = special teams, N = neutral (games, results).
// Team rows can carry opp_<stat> copies of the opponent's line; those flip side (opp. offense = your defense).

const lc = (s) => (/^[A-Z]{2}/.test(s) ? s : s.charAt(0).toLowerCase() + s.slice(1));
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function makeSport(cfg) {
  const { LABELS = {}, PER_LABELS = {}, GROUPS, SIDE_RE = [], PHASES = [], VOLUME_RE, MIRRORS = {}, NOT_DIVISORS = [] } = cfg;

  function label(key) {
    if (key.startsWith("opp_")) return "Opp. " + lc(label(key.slice(4)));
    if (LABELS[key]) return LABELS[key];
    return key.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
  }
  function perLabel(key) {
    if (PER_LABELS[key]) return PER_LABELS[key];
    if (key.startsWith("opp_") && PER_LABELS[key.slice(4)]) return "opponent " + PER_LABELS[key.slice(4)];
    const l = lc(label(key)).replace(/\s*\(.*\)$/, "");
    return l.replace(/(\w+)$/, (w) => (/ies$/.test(w) ? w.slice(0, -3) + "y" : /[^s]s$/.test(w) ? w.slice(0, -1) : w));
  }
  function group(key) {
    if (key.startsWith("opp_")) return "Allowed: " + group(key.slice(4));
    return (GROUPS.find(([, re]) => re.test(key)) || ["Misc"])[0];
  }
  function side(key) {
    if (key.startsWith("opp_")) {
      const b = side(key.slice(4));
      return b === "O" ? "D" : b === "D" ? "O" : b;
    }
    return (SIDE_RE.find(([, re]) => re.test(key)) || ["O"])[0];
  }
  function phase(key) {
    const k = key.replace(/^opp_/, "");
    return (PHASES.find(([, re]) => re.test(k)) || ["all"])[0];
  }
  const isVolume = (key) => VOLUME_RE.test(key.replace(/^opp_/, ""));
  // Main-stat candidates: team context and opp_ copies of non-offense stats are divisor-only.
  function pickable(key) {
    if (key.startsWith("tm_") || (cfg.NOT_PICKABLE || []).includes(key)) return false;
    if (key.startsWith("opp_") && side(key.slice(4)) !== "O") return false;
    return true;
  }
  // Divisors, best first: suggested = opportunity counts on the same side (same phase first),
  // related = other same-side stats, rest = the other side (behind "show all").
  function divisors(stat, list) {
    const s = side(stat), p = phase(stat);
    const sameSide = (k) => s === "N" || side(k) === s || side(k) === "N";
    const mirror = MIRRORS[stat] || Object.keys(MIRRORS).find((k) => MIRRORS[k] === stat);
    const cands = list.filter((k) => k !== stat && k !== mirror && !NOT_DIVISORS.includes(k) && !(k.startsWith("opp_") && side(k.slice(4)) === "N"));
    const suggested = cands.filter((k) => k === "games" || (sameSide(k) && isVolume(k)))
      .sort((a, b) => (a === "games" ? -1 : b === "games" ? 1 : 0) || (phase(b) === p) - (phase(a) === p));
    const sug = new Set(suggested);
    const related = cands.filter((k) => !sug.has(k) && sameSide(k));
    const rel = new Set(related);
    return { suggested, related, rest: cands.filter((k) => !sug.has(k) && !rel.has(k)) };
  }

  // ---- time
  const time = cfg.time || "week";
  // sortable key for a row (season-relative): week number or YYYYMMDD
  const tval = (row, I) => (time === "week" ? row[I.week] : row[I.date]);
  const monthOf = (d) => Math.floor(d / 100) % 100;
  const dateLabel = (d) => `${MONTHS[monthOf(d) - 1]} ${d % 100}`;
  const gameLabel = time === "week"
    ? (t, stype, season) => (stype === "P" ? cfg.playoffLabels(t, season) : `W${t}`)
    : (t) => dateLabel(t);

  return {
    ...cfg,
    time,
    label, perLabel, group, side, phase, pickable, divisors,
    tval, monthOf, dateLabel, gameLabel,
    monthName: (m) => MONTHS[m - 1],
    sides: cfg.sides || [["O", "Offense"], ["D", "Defense"], ["all", "All"]],
    seasonLabel: (meta, s) => meta.seasons.find((x) => x.season === s)?.label || String(s),
    logo: (team, meta) => meta.teams[team]?.logo || "",
    hiddenTeams: new Set(cfg.hiddenTeams || []),
  };
}
