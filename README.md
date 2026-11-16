# Stat Analysis

Build sports stat models in the browser. Tap stats (tags, grouped by Offense / Defense / Special teams), pick filters and a chart type, and the chart redraws instantly. Covers **NFL, NBA and MLB**; built so more sports can be added.

**Chart types**
- **Trend line**: time on the x-axis (by game or by season, optional rolling average). Several stats draw as stacked panels that share the same teams/players. Team logos label the line ends, with an optional league-average line.
- **Stat vs stat**: one stat on each axis. Each team or player is a point, drawn with its team logo. Includes a linear fit (equation, R², r), average lines, and name labels.
- **Rankings**: a sorted bar chart.

**Every stat can be shown as**
- a total,
- per game, or
- per any other stat, e.g. yards per play, sacks per pressure, targets per team target (target share), receiving yards per snap. Ratios are pooled over the window: sum(stat) ÷ sum(divisor), not an average of weekly ratios. Tick "as %" to show rates as percentages.

**Filters**: seasons, week range (NFL) or months (NBA/MLB), regular season and/or playoffs, teams (filter or highlight), opponents, players, positions, minimum games, and a qualifier (e.g. 100+ carries) so small samples don't swamp per-stat charts.

Models can be shared as links (the whole state lives in the URL), saved by name in the browser, or exported to CSV.

## Data

| Sport | Script | Source | Seasons | Rows |
|---|---|---|---|---|
| NFL | `scripts/refresh-nfl.mjs` | [nflverse](https://github.com/nflverse/nflverse-data): box scores + EPA, PFR pressures/blitzes/coverage, snap counts, schedules | 2018– | team-week, player-week |
| NBA | `scripts/refresh-nba.mjs` | [sportsdataverse](https://github.com/sportsdataverse/sportsdataverse-data) ESPN box scores | 2018-19– | team-game, player-game |
| MLB | `scripts/refresh-mlb.mjs` | official MLB Stats API (`statsapi.mlb.com`, per-day batting + pitching) | 2018– | team-day, player-day |

All free, no API keys. Team rows carry the opponent's line as `opp_*` (NFL, NBA) so "allowed" stats work like your own; in MLB, pitching stats are the defensive side. Derived stats (possessions, true shooting attempts, OBP and wOBA building blocks, innings, and so on) are computed in the browser from the stored columns.

**Known gaps:** routes run aren't available for free (NFL "per route" uses snaps). NBA possessions are estimated. MLB wOBA uses fixed linear weights, and doubleheaders are combined into one day.

## Run locally

```
node scripts/refresh-nfl.mjs --all   # first time: builds 2018 to now (~30s)
node scripts/refresh-nfl.mjs         # later: rebuilds only the current season
npx http-server public -p 8765 -c-1  # or: py -m http.server 8765 -d public
```
Then open http://localhost:8765.

## Hosting and data refresh

- **Site:** GitHub Pages serves `public/`. `.github/workflows/deploy-site.yml` redeploys only when `public/` changes. Live at https://kimblejennings97.github.io/stat-analysis/
- **Data:** each sport has its own workflow (`data-nfl.yml`, `data-nba.yml`, `data-mlb.yml`). It restores the already-published seasons, rebuilds the current season, and `scripts/publish-data.sh` pushes the JSON to the `data` branch as one squashed commit (no history growth; skipped if only the timestamp changed). The site reads it from `raw.githubusercontent.com/.../data/<sport>/`, so data refreshes never redeploy the site.
- **Schedules (UTC):** NFL daily Sep–Feb, NBA daily Oct–Jun, MLB daily Mar–Nov; weekly (Tuesdays) in each offseason. Any can be run by hand from the Actions tab (with a "rebuild every season" option for NBA/MLB).
- Locally, the site uses `public/data/` if built, otherwise the remote copy (`?data=remote` / `?data=local` to force; see `public/js/config.js`).

## Adding a sport

1. Write `scripts/refresh-<sport>.mjs` (helpers in `scripts/lib.mjs`) that outputs `public/data/<sport>/meta.json`, `teams_<season>.json` and `players_<season>.json` in the same columnar shape (`cols` + `rows`; the first columns are `team, opp, <week|date>, stype` / `pid, team, opp, <week|date>, stype`, plus `people` for players; dates are YYYYMMDD numbers).
2. Add `public/js/sports/<sport>.js` using `makeSport` from `common.js` (labels, groups, sides, volume stats, derived stats, presets, `time: "week"|"date"`). See `nba.js` / `mlb.js`.
3. Register it in `SPORTS` in `public/js/app.js` and enable its button in `index.html`.
4. Copy `.github/workflows/data-nfl.yml` to `data-<sport>.yml` with that sport's script and its own cron (e.g. several times a day for daily sports). All data workflows share one concurrency group, so they never clash on the `data` branch.
