#!/usr/bin/env bash
# Build and publish dist/ to the gh-pages branch of github.com/zizai-onkyo/vr-rokuondojo (served by GitHub Pages at
# https://zizai-onkyo.github.io/vr-rokuondojo/). The site is pushed as several small commits (app first, then the audio in
# batches under ~4.5 MB) because one 36 MB pack kept hitting GitHub's HTTP 408 upload timeout on a slow link.
# Usage: scripts/deploy_pages.sh            (runs npm run build first; needs `gh auth login` done once)
set -euo pipefail
cd "$(dirname "$0")/.."
REMOTE=https://github.com/zizai-onkyo/vr-rokuondojo.git
npm run build >/dev/null
cd dist && rm -rf .git && touch .nojekyll
git init -q -b gh-pages
git config user.name "o_hori"; git config user.email "304683950+zizai-onkyo@users.noreply.github.com"
git config http.postBuffer 524288000
git remote add origin "$REMOTE"
push() { local n=0; until git push -q -f origin gh-pages 2>/tmp/deploy_pages_err.txt; do n=$((n+1)); echo "push failed ($n): $(tail -1 /tmp/deploy_pages_err.txt)"; [ $n -ge 5 ] && return 1; sleep 5; done; echo "pushed $(git rev-parse --short HEAD)"; }
git add -A -- . ':!audio' && git commit -q -m "deploy: app $(date +%Y-%m-%d)" && echo "app: $(git ls-files | wc -l | tr -d ' ') files" && push
batch=(); size=0; i=0
for f in $(ls audio/* | sort); do
  s=$(stat -f %z "$f"); batch+=("$f"); size=$((size+s))
  if [ $size -ge 4500000 ]; then i=$((i+1)); git add "${batch[@]}"; git commit -q -m "deploy: audio $i"; echo "audio batch $i: ${#batch[@]} files, $((size/1024)) KiB"; push; batch=(); size=0; fi
done
if [ ${#batch[@]} -gt 0 ]; then i=$((i+1)); git add "${batch[@]}"; git commit -q -m "deploy: audio $i"; echo "audio batch $i: ${#batch[@]} files, $((size/1024)) KiB"; push; fi
rm -rf .git
echo "done → https://zizai-onkyo.github.io/vr-rokuondojo/ (Pages rebuilds in about a minute)"
