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

# Use the cached binary directly instead of `npx paperclipai@latest` so the
# version-check/install path can't overwrite the freshly-swapped bundle.
CACHED_BIN="$NPX_CACHE/node_modules/.bin/paperclipai"
if [ ! -x "$CACHED_BIN" ]; then
  echo "ERROR: cached paperclipai binary not found at $CACHED_BIN" >&2
  exit 1
fi
LOG_DIR="$HOME/.paperclip/instances/default/logs"
mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/daemon-hum126-${STAMP}.log"

# Build a self-contained restart helper that we'll spawn fully detached. We do
# this because if a Paperclip agent run is running THIS script, its own process
# tree is a child of the daemon — killing the daemon can take the agent down
# before the foreground here finishes spawning the new daemon. The helper runs
# under setsid so it survives the daemon's death.
HELPER="$(mktemp -t hum126-restart-helper.XXXXXX.sh)"
cat > "$HELPER" <<HELPER_EOF
#!/usr/bin/env bash
set -u
PID="${PID:-}"
if [ -n "\$PID" ]; then
  echo "[helper] stopping daemon pid \$PID" >>"$LOG_FILE"
  kill "\$PID" 2>/dev/null || true
  for _ in \$(seq 1 20); do
    if ! kill -0 "\$PID" 2>/dev/null; then break; fi
    sleep 0.5
  done
  if kill -0 "\$PID" 2>/dev/null; then
    echo "[helper] daemon still alive after 10s, SIGKILL" >>"$LOG_FILE"
    kill -9 "\$PID" 2>/dev/null || true
  fi
fi
# Wait for port 3100 to free up
for _ in \$(seq 1 30); do
  if ! lsof -i :3100 -sTCP:LISTEN >/dev/null 2>&1; then break; fi
  sleep 0.5
done
echo "[helper] starting fresh daemon" >>"$LOG_FILE"
exec node "$CACHED_BIN" run >>"$LOG_FILE" 2>&1
HELPER_EOF
chmod +x "$HELPER"

echo "==> Spawning detached restart helper (will kill old daemon + start new)"
echo "    log: $LOG_FILE"
echo "    helper: $HELPER"
# nohup + setsid + & + disown — fully detach from this script's process group
# so the daemon-kill can't take the helper down with it.
if command -v setsid >/dev/null 2>&1; then
  setsid nohup "$HELPER" </dev/null >>"$LOG_FILE" 2>&1 &
else
  nohup "$HELPER" </dev/null >>"$LOG_FILE" 2>&1 &
fi
disown
echo "==> Helper spawned. This script exits now; the helper will restart the daemon."

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
