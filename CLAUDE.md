# Stat Analysis

Real-time sports stat model builder. A static site (vanilla JS ES modules + D3 7.9 from cdnjs, no build step) that reads JSON generated from nflverse. NFL only for now; built so more sports can be added (see README "Adding a sport").

- Hosting: Netlify serves `public/` (netlify.toml, no build step). **A push to `main` that touches `public/` is a production deploy (and costs Netlify credits)**, so commit/push only when asked, and batch changes.
- Data is NOT deployed with the site: `.github/workflows/data-<sport>.yml` builds it and `scripts/publish-data.sh` force-pushes it to the `data` branch; the site reads it from raw.githubusercontent.com (`public/js/config.js`). Never commit data JSON to `main`.
- Local: `node scripts/refresh-nfl.mjs --all`, then serve `public/` (e.g. `py -m http.server 8765 -d public`). Localhost prefers local data, falls back to remote.

## File map
```
scripts/refresh-nfl.mjs   nflverse -> public/data/nfl/{meta,teams_<yr>,players_<yr>}.json (FIRST_SEASON = 2018)
public/index.html         layout: model builder sidebar + chart stage
public/css/app.css        tokens (light/dark, validated 8-color categorical palette), layout, chart marks
public/js/config.js       where data is loaded from (remote data branch vs local)
public/js/app.js          state (mirrored in the URL hash), controls, chart drawing glue, table/CSV, saved models
public/js/data.js         table loading/cache, derived columns, filtering, aggregation, time series, league avg, OLS fit
public/js/charts.js       D3 renderers: renderTrend (small multiples), renderScatter (logos, fit), renderBar
public/js/sports/nfl.js   stat labels, groups, "per" labels, derived stats, presets, positions,
                          side()/phase()/divisors(): which divisors are offered for a stat (same side of the ball first)
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
- Stat selection is tag-based (recipe-box style pills). Divisors are filtered by side of the ball: opportunity counts on the same side are "best fit", other same-side stats come next, and the other side sits behind "show all". Mirror stats (def_sacks vs opp_sacks_suffered) are excluded.
