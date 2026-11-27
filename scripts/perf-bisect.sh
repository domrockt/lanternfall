#!/usr/bin/env bash
# M10-Perf-Recovery: git bisect der FPS-Regression.
# Kriterium: `npm run perf` bei 640x360, Phase minute25 (Default) oder burst.
# Laeuft in einem temporaeren git-worktree, NICHT im Lane-Worktree.
#
# Nutzung:
#   bash scripts/perf-bisect.sh [GOOD] [BAD]
#   BISECT_CRITERION=burst bash scripts/perf-bisect.sh 0b42ffe HEAD
#
# Default: GOOD=0b42ffe (QA 26.11. 10:51, 59,3 FPS), BAD=HEAD.
set -uo pipefail

REPO="$(git rev-parse --show-toplevel)"
GOOD="${1:-0b42ffe}"
BAD="${2:-HEAD}"
CRITERION="${BISECT_CRITERION:-minute25}"
STAMP="$(date +%Y%m%d-%H%M%S)"
WT="${BISECT_WORKTREE:-$HOME/tmp/m10-perf-bisect-$STAMP}"
LOGDIR="$HOME/tmp/m10-perf-recovery"
mkdir -p "$LOGDIR"
LOG="$LOGDIR/bisect-$CRITERION-$STAMP.log"

echo "== perf-bisect ==" | tee "$LOG"
echo "repo=$REPO good=$GOOD bad=$BAD criterion=$CRITERION worktree=$WT" | tee -a "$LOG"

git -C "$REPO" worktree add --detach "$WT" "$BAD" 2>&1 | tee -a "$LOG" || exit 1
# node_modules aus der Lane teilen, damit jeder Bisect-Schritt bauen kann.
if [ ! -e "$WT/node_modules" ]; then
  ln -s "$REPO/node_modules" "$WT/node_modules"
fi

cd "$WT" || exit 1
git bisect start "$BAD" "$GOOD" 2>&1 | tee -a "$LOG"

LANE_PERF="$REPO/scripts/perf.mjs" \
BISECT_CRITERION="$CRITERION" \
  git bisect run node "$REPO/scripts/perf-bisect-check.mjs" 2>&1 | tee -a "$LOG"

# Ergebnis sichern, bevor der Worktree abgebaut wird.
git bisect log > "$LOGDIR/bisect-$CRITERION-$STAMP-bisectlog.txt" 2>&1 || true
git bisect reset > /dev/null 2>&1 || true
cd "$REPO" || exit 1
git worktree remove --force "$WT" > /dev/null 2>&1 || true

echo "-- Ergebnis (letzte Zeilen) --" | tee -a "$LOG"
grep -E "first bad commit|is the first bad commit|BISECT|bisect run success|bisect found" "$LOG" | tail -20 || true
echo "Log: $LOG"
echo "Bisect-Log: $LOGDIR/bisect-$CRITERION-$STAMP-bisectlog.txt"
