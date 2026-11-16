#!/usr/bin/env bash
# Publish public/data/<sport>/ to the `data` branch as a single squashed commit (no history growth).
# Other sports' folders already on the branch are kept. Skips the push when only meta.json's
# timestamp changed. Used by the GitHub Actions data workflows.
#   usage: scripts/publish-data.sh <sport>
set -euo pipefail
SPORT="$1"
REPO_URL="${DATA_REMOTE:-https://x-access-token:${GITHUB_TOKEN}@github.com/${GITHUB_REPOSITORY}.git}"
OUT="$(mktemp -d)"

if git ls-remote --exit-code --heads "$REPO_URL" data >/dev/null 2>&1; then
  git clone --quiet --depth 1 --branch data "$REPO_URL" "$OUT"
else
  git init --quiet -b data "$OUT"
  git -C "$OUT" remote add origin "$REPO_URL"
fi

NEW_SPORT=1; [ -d "$OUT/$SPORT" ] && NEW_SPORT=0
rm -rf "${OUT:?}/${SPORT}"
mkdir -p "$OUT/$SPORT"
cp public/data/"$SPORT"/*.json "$OUT/$SPORT/"
cat > "$OUT/README.md" <<'EOF'
Generated stats data for the Stat Analysis site. Rebuilt by GitHub Actions; do not edit by hand.
The site reads these files from raw.githubusercontent.com, so refreshing data never redeploys the site.
EOF

cd "$OUT"
git add -A
if [ "$NEW_SPORT" = 0 ] && git rev-parse --verify --quiet HEAD >/dev/null && git diff --cached --quiet -- . ":(exclude)*/meta.json"; then
  echo "No stat changes for $SPORT; not publishing."
  exit 0
fi

git config user.name "github-actions[bot]"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
git checkout --quiet --orphan publish
git commit --quiet -m "Data refresh: $SPORT $(date -u +%Y-%m-%dT%H:%MZ)"
git push --quiet --force origin publish:data
echo "Published $SPORT data."
