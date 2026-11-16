// Where the stats JSON lives.
//
// The data is NOT part of the site deploy. GitHub Actions rebuilds it on a schedule and force-pushes it
// to the `data` branch of the repo; the site reads it from GitHub's raw CDN (CORS-enabled, gzip, ~5 min cache).
// So data refreshes never trigger a Netlify deploy: only code changes do.
//
// Locally (localhost / 127.0.0.1) the site prefers ./data (built with `node scripts/refresh-nfl.mjs`) and
// falls back to the remote copy if there's no local build. Add ?data=remote or ?data=local to force one.

export const REMOTE_DATA = "https://raw.githubusercontent.com/kimblejennings97/stat-analysis/data";
export const LOCAL_DATA = "data";

export function dataBases() {
  const forced = new URLSearchParams(location.search).get("data");
  if (forced === "remote") return [REMOTE_DATA];
  if (forced === "local") return [LOCAL_DATA];
  const local = ["localhost", "127.0.0.1", ""].includes(location.hostname);
  return local ? [LOCAL_DATA, REMOTE_DATA] : [REMOTE_DATA];
}
