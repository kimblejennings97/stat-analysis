# Stat Analysis

Build sports stat models in the browser. Pick stats, filters and a chart type, and the chart redraws instantly. NFL for now; built to add more sports.

**Chart types**
- **Trend line**: time on the x-axis (by game or by season, optional rolling average). Several stats draw as stacked panels that share the same teams/players. Team logos label the line ends, with an optional league-average line.
- **Stat vs stat**: one stat on each axis. Each team or player is a point, drawn with its team logo. Includes a linear fit (equation, R², r), average lines, and name labels.
- **Rankings**: a sorted bar chart.

**Every stat can be shown as**
- a total,
- per game, or
- per any other stat, e.g. yards per play, sacks per pressure, targets per team target (target share), receiving yards per snap. Ratios are pooled over the window: sum(stat) ÷ sum(divisor), not an average of weekly ratios. Tick "as %" to show rates as percentages.

**Filters**: seasons (2018 onward), week range, regular season and/or playoffs, teams (filter or highlight), opponents, players, positions, minimum games, and a qualifier (e.g. 100+ carries) so small samples don't swamp per-stat charts.

Models can be shared as links (the whole state lives in the URL), saved by name in the browser, or exported to CSV.

## Data

`scripts/refresh-nfl.mjs` pulls free [nflverse](https://github.com/nflverse/nflverse-data) releases and writes compact JSON to `public/data/nfl/`:

| Source | What it adds |
|---|---|
| `stats_player`, `stats_team` | weekly box-score + EPA stats |
| `pfr_advstats` | pressures, hurries, blitzes, drops, bad throws, broken tackles, yards before/after contact, coverage stats |
| `snap_counts` | offensive/defensive/ST snaps per player; team play counts |
| `schedules/games.csv` | scores, W/L, Vegas spread and total |
| `players` | gsis ↔ PFR id crosswalk |
| `teams_colors_logos` | names, colors, ESPN logo URLs |

Team rows also carry every stat from the opponent's side of the game (`opp_*`, labeled "Opp."), so "allowed" stats work the same way as your own.

**Known gap:** routes run isn't in any free source, so "per route" stats use offensive snaps as a stand-in.

## Run locally

```
node scripts/refresh-nfl.mjs --all   # first time: builds 2018 to now (~30s)
node scripts/refresh-nfl.mjs         # later: rebuilds only the current season
npx http-server public -p 8765 -c-1  # or: py -m http.server 8765 -d public
```
Then open http://localhost:8765.

## Deploy / weekly refresh

`.github/workflows/refresh-and-deploy.yml` rebuilds the data from nflverse and publishes `public/` to GitHub Pages:
- on every push to `main`,
- every Tuesday 15:00 UTC (after Monday Night Football) and Thursday 12:00 UTC (late PFR corrections),
- on demand from the Actions tab ("Run workflow").

The data JSON is generated and never committed.

## Adding a sport

1. Write `scripts/refresh-<sport>.mjs` that outputs `public/data/<sport>/meta.json`, `teams_<season>.json` and `players_<season>.json` in the same columnar shape (`cols` + `rows`; the first columns are `team, opp, week, stype` / `pid, team, opp, week, stype`, plus `people` for players).
2. Add `public/js/sports/<sport>.js` (labels, groups, derived stats, presets), modeled on `nfl.js`.
3. Register it in `SPORTS` in `public/js/app.js`, enable its button in `index.html`, and add the script to the workflow.
