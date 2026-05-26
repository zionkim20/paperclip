#!/usr/bin/env bash
# HUM-126 — Install the locally-built @paperclipai/server bundle into the
# running npx-cache instance and restart the daemon.
#
# UI was already swapped live in the agent heartbeat that created this script
# (the static UI is served from disk per request, no restart needed). This
# script handles the server bundle — which needs a process restart to take
# effect — so Zion can fire it himself rather than the agent dropping its
# own wake mid-flight.
#
# Run from anywhere. Idempotent: safe to re-run after a fresh build.
set -euo pipefail

FORK_ROOT="$HOME/hum-eng/forks/paperclip"
INSTALLED_PKG="$HOME/.npm/_npx/0aa74679bec75e15/node_modules/@paperclipai/server"
NPX_CACHE="$HOME/.npm/_npx/0aa74679bec75e15"
STAMP="$(date +%Y%m%d-%H%M%S)"

if [ ! -d "$FORK_ROOT/server/dist" ]; then
  echo "ERROR: server/dist not found at $FORK_ROOT/server/dist" >&2
  echo "Build it first:  pnpm --filter @paperclipai/server build" >&2
  exit 1
fi

if [ ! -d "$INSTALLED_PKG" ]; then
  echo "ERROR: installed server package not found at $INSTALLED_PKG" >&2
  exit 1
fi

echo "==> HUM-126 server install"
echo "    Source:    $FORK_ROOT/server/dist"
echo "    Target:    $INSTALLED_PKG/dist"

BAK="$INSTALLED_PKG/dist.bak-pre-hum126-${STAMP}"
echo "==> Backing up current dist -> $(basename "$BAK")"
cp -R "$INSTALLED_PKG/dist" "$BAK"

echo "==> Swapping in new server bundle"
rm -rf "$INSTALLED_PKG/dist"
cp -R "$FORK_ROOT/server/dist" "$INSTALLED_PKG/dist"

PID="$(pgrep -f "node $NPX_CACHE/node_modules/.bin/paperclipai run" || true)"
if [ -n "$PID" ]; then
  echo "==> Stopping running daemon (pid $PID)"
  kill "$PID"
  # Wait up to 10s for graceful shutdown
  for _ in $(seq 1 20); do
    if ! kill -0 "$PID" 2>/dev/null; then break; fi
    sleep 0.5
  done
  if kill -0 "$PID" 2>/dev/null; then
    echo "    daemon still alive after 10s, sending SIGKILL"
    kill -9 "$PID" || true
  fi
else
  echo "==> No running daemon found; new bundle is in place for next start"
fi

echo "==> Starting daemon fresh"
# Use the cached binary directly instead of `npx paperclipai@latest` so the
# version-check/install path can't overwrite the freshly-swapped bundle.
CACHED_BIN="$NPX_CACHE/node_modules/.bin/paperclipai"
if [ ! -x "$CACHED_BIN" ]; then
  echo "ERROR: cached paperclipai binary not found at $CACHED_BIN" >&2
  echo "Falling back to npx (may freshen the install)" >&2
  CACHED_BIN_CMD="npx paperclipai@latest"
else
  CACHED_BIN_CMD="node $CACHED_BIN"
fi
LOG_DIR="$HOME/.paperclip/instances/default/logs"
mkdir -p "$LOG_DIR"
nohup $CACHED_BIN_CMD run >"$LOG_DIR/daemon-hum126-${STAMP}.log" 2>&1 &
NEW_PID=$!
disown
echo "    started pid $NEW_PID (log: ~/.paperclip/instances/default/logs/daemon-hum126-${STAMP}.log)"

echo ""
echo "==> Done. Verify in the board:"
echo "    - Reload the page (cmd-shift-r). The UI loaded from the swapped ui-dist."
echo "    - Open an issue with blockers. The 'Blocked' inbox tab sorts by"
echo "      'What unblocks most' and rows with shared blockers show a"
echo "      'Blocks N issues' chip."
echo "    - Server-side: comments on blocked issues that don't @-mention the"
echo "      assignee log {wakeSkippedReason: 'issue_blocked_no_mention'} and"
echo "      no longer churn the agent."
echo ""
echo "==> To roll back:"
echo "    rm -rf $INSTALLED_PKG/dist"
echo "    mv $BAK $INSTALLED_PKG/dist"
echo "    # and similarly for ui-dist if you also want to roll the UI back"
echo "    # ls $INSTALLED_PKG/ui-dist.bak-pre-hum126-*  # most recent"
