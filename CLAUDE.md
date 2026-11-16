# Stat Analysis

Real-time sports stat model builder. A static site (vanilla JS ES modules + D3 7.9 from cdnjs, no build step) that reads JSON generated from nflverse. NFL only for now; built so more sports can be added (see README "Adding a sport").

- Deploy: GitHub Actions (`.github/workflows/refresh-and-deploy.yml`) rebuilds the data and publishes `public/` to GitHub Pages on every push to `main`, plus Tue/Thu cron. **A push to `main` is a production deploy**, so commit/push only when asked.
- Data JSON (`public/data/*/*.json`) is generated and git-ignored. Locally: `node scripts/refresh-nfl.mjs --all`, then serve `public/` (e.g. `py -m http.server 8765 -d public`).

## File map
```
scripts/refresh-nfl.mjs   nflverse -> public/data/nfl/{meta,teams_<yr>,players_<yr>}.json (FIRST_SEASON = 2018)
public/index.html         layout: model builder sidebar + chart stage
public/css/app.css        tokens (light/dark, validated 8-color categorical palette), layout, chart marks
public/js/app.js          state (mirrored in the URL hash), controls, chart drawing glue, table/CSV, saved models
public/js/data.js         table loading/cache, derived columns, filtering, aggregation, time series, league avg, OLS fit
public/js/charts.js       D3 renderers: renderTrend (small multiples), renderScatter (logos, fit), renderBar
public/js/sports/nfl.js   stat labels, groups, "per" labels, derived stats, presets, positions
```

## Rules that matter
- Ratios are always pooled: sum(numerator) / sum(denominator) over the window. Never average per-game ratios.
- Every row carries `games = 1`, so "per game" is just "per games".
- Team rows include `opp_*` copies of the opponent's row (allowed stats). Derived stats get `opp_` versions automatically.
- Player rows carry team context (`tm_targets`, `tm_off_plays`, ...) for share stats.
- PFR advanced stats join to players through the players.csv pfr_id -> gsis_id crosswalk. They start in 2018.
- Routes run isn't available from free sources; "per route" presets use offensive snaps and say so.
- Chart conventions: one y-axis per chart (several stats become stacked panels), series colors assigned by pick order (max 8), legend for 2+ series, tooltips on every chart, team logos as identity.
- Untrusted names go into the DOM via textContent only.
