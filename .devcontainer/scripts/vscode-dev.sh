#!/usr/bin/env bash
# Runs a real VS Code desktop with this repo's extension (dev build) on a
# headless Xvfb display, with a Chrome DevTools Protocol port an agent can
# attach to (e.g. chrome-devtools-mcp --browserUrl http://127.0.0.1:9222).
#
#   .devcontainer/scripts/vscode-dev.sh start [WORKSPACE_PATH]   # default e2e-testing/test-ws
#   .devcontainer/scripts/vscode-dev.sh restart [WORKSPACE_PATH] # after code changes
#   .devcontainer/scripts/vscode-dev.sh stop
#   .devcontainer/scripts/vscode-dev.sh status                   # JSON on stdout
#   .devcontainer/scripts/vscode-dev.sh screenshot [OUT.png]     # path on stdout
#
# Env (all optional):
#   VSCODE_DEV_HOME  state dir (VS Code install, profile, logs). Default ~/.dh-vscode-dev
#   VSCODE_CDP_PORT  remote debugging port. Default 9222
#   DH_SERVER_URL    written to deephaven.coreServers, e.g. http://host.docker.internal:10000/
#
# stdout carries only the command's result; diagnostics go to stderr.
set -euo pipefail

info() { echo "INFO $*" >&2; }
die() {
  echo "ERR $*" >&2
  exit 1
}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$SCRIPT_DIR/../.." && pwd)"

VSCODE_DEV_HOME="${VSCODE_DEV_HOME:-$HOME/.dh-vscode-dev}"
VSCODE_CDP_PORT="${VSCODE_CDP_PORT:-9222}"

PID_FILE="$VSCODE_DEV_HOME/vscode.pid"
DISPLAY_FILE="$VSCODE_DEV_HOME/display"
LOG_FILE="$VSCODE_DEV_HOME/vscode.log"
USER_DATA="$VSCODE_DEV_HOME/user-data"
EXTENSIONS="$VSCODE_DEV_HOME/extensions"
VSCODE_STORAGE="$VSCODE_DEV_HOME/vscode"
CDP_URL="http://127.0.0.1:$VSCODE_CDP_PORT"
MCP_SERVER_NAME="Deephaven VS Code MCP Server"

case "$(uname -m)" in
  aarch64 | arm64) VSCODE_ARCH=arm64 ;;
  x86_64 | amd64) VSCODE_ARCH=x64 ;;
  *) die "unsupported architecture: $(uname -m)" ;;
esac
VSCODE_DIR="$VSCODE_STORAGE/VSCode-linux-$VSCODE_ARCH"
VSCODE_BIN="$VSCODE_DIR/code"
VSCODE_CLI="$VSCODE_DIR/bin/code"

# --- state --------------------------------------------------------------------

running_pid() {
  local pid
  [ -r "$PID_FILE" ] || return 1
  pid="$(tr -dc '0-9' <"$PID_FILE")"
  [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null || return 1
  echo "$pid"
}

cdp_up() {
  curl -sf --max-time 2 "$CDP_URL/json/version" >/dev/null 2>&1
}

# The pid and all of its descendants, space separated.
process_tree() {
  local all="$1" queue="$1" next p
  while [ -n "$queue" ]; do
    next=""
    for p in $queue; do
      next="$next $(pgrep -P "$p" || true)"
    done
    queue="$(echo $next)"
    [ -n "$queue" ] && all="$all $queue"
  done
  echo "$all"
}

mcp_initialize() {
  curl -s --max-time 3 -X POST "http://localhost:$1/mcp" \
    -H 'Content-Type: application/json' \
    -H 'Accept: application/json, text/event-stream' \
    -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"vscode-dev.sh","version":"0"}}}' \
    2>/dev/null || true
}

# The extension's MCP server listens on a per-workspace port owned by the
# extension host (a descendant of the main pid). Find it by asking each
# listener in the process tree who it is.
find_mcp_url() {
  local pid="$1" pids pattern port
  pids="$(process_tree "$pid")"
  pattern="pid=($(echo "$pids" | tr ' ' '|')),"
  for port in $(ss -ltnpH 2>/dev/null | grep -E "$pattern" | awk '{print $4}' | sed 's/.*://' | sort -un); do
    [ "$port" = "$VSCODE_CDP_PORT" ] && continue
    if mcp_initialize "$port" | grep -q "\"name\":\"$MCP_SERVER_NAME\""; then
      echo "http://localhost:$port/mcp"
      return 0
    fi
  done
  return 1
}

json_str() {
  if [ -n "$1" ]; then printf '"%s"' "$1"; else printf 'null'; fi
}

print_status() {
  local pid="" display="" cdp="" mcp="" running=false
  if pid="$(running_pid)"; then
    running=true
    display="$(cat "$DISPLAY_FILE" 2>/dev/null || true)"
    cdp_up && cdp="$CDP_URL"
    mcp="$(find_mcp_url "$pid" || true)"
  else
    pid=""
  fi
  printf '{"running":%s,"pid":%s,"display":%s,"cdpEndpoint":%s,"mcpUrl":%s,"log":"%s"}\n' \
    "$running" "${pid:-null}" "$(json_str "$display")" "$(json_str "$cdp")" \
    "$(json_str "$mcp")" "$LOG_FILE"
}

# --- setup --------------------------------------------------------------------

ensure_vscode() {
  if [ ! -x "$VSCODE_BIN" ]; then
    info "downloading VS Code stable ($VSCODE_ARCH) into $VSCODE_STORAGE..."
    (cd "$REPO" && npx --no-install extest get-vscode --storage "$VSCODE_STORAGE") >&2 ||
      die "VS Code download failed."
    [ -x "$VSCODE_BIN" ] || die "VS Code download finished but $VSCODE_BIN is missing."
  fi
  rm -f "$VSCODE_STORAGE"/*.tar.gz
}

# A fresh --extensions-dir lacks the extension's extensionDependencies, and VS
# Code then refuses to activate it ("Cannot activate ... depends on ...").
ensure_extension_dependencies() {
  local deps installed id
  deps="$(node -p "(require('$REPO/package.json').extensionDependencies || []).join('\n')")"
  [ -n "$deps" ] || return 0
  installed="$("$VSCODE_CLI" --user-data-dir="$USER_DATA" --extensions-dir="$EXTENSIONS" \
    --list-extensions 2>/dev/null | tr '[:upper:]' '[:lower:]')"
  for id in $deps; do
    if grep -qxF "$(echo "$id" | tr '[:upper:]' '[:lower:]')" <<<"$installed"; then
      continue
    fi
    info "installing extension dependency $id..."
    "$VSCODE_CLI" --user-data-dir="$USER_DATA" --extensions-dir="$EXTENSIONS" \
      --install-extension "$id" >&2 2>/dev/null || die "failed to install $id."
  done
}

# Seeds user settings on first run; DH_SERVER_URL (when set) is merged every run.
ensure_settings() {
  local settings="$USER_DATA/User/settings.json"
  mkdir -p "$(dirname "$settings")"
  SETTINGS_PATH="$settings" node -e '
    const fs = require("fs");
    const p = process.env.SETTINGS_PATH;
    let s;
    if (fs.existsSync(p)) {
      s = JSON.parse(fs.readFileSync(p, "utf8"));
    } else {
      s = {
        // Keep dialogs and the title bar in the DOM so CDP can see them.
        "window.titleBarStyle": "custom",
        "window.dialogStyle": "custom",
        "workbench.startupEditor": "none",
        "update.mode": "none",
        "telemetry.telemetryLevel": "off",
        "extensions.autoUpdate": false,
        // The default workspace lives inside this repo; skip the "open parent repo?" toast.
        "git.openRepositoryInParentFolders": "never",
        "deephaven.mcp.enabled": true,
      };
    }
    if (process.env.DH_SERVER_URL) {
      s["deephaven.coreServers"] = [process.env.DH_SERVER_URL];
    }
    fs.writeFileSync(p, JSON.stringify(s, null, 2) + "\n");
  '
}

# Bare Xvfb has no window manager, so "maximized" is a no-op; size it by hand.
fill_display() {
  local win
  win="$(timeout 20 xdotool search --sync --onlyvisible --name 'Visual Studio Code' 2>/dev/null | head -1 || true)"
  if [ -z "$win" ]; then
    info "could not find the VS Code window to resize; leaving it as-is."
    return 0
  fi
  xdotool windowmove "$win" 0 0 windowsize "$win" 1920 1080
}

# --- commands -----------------------------------------------------------------

cmd_start() {
  local workspace="${1:-$REPO/e2e-testing/test-ws}" pid _

  if running_pid >/dev/null; then
    info "VS Code already running."
    print_status
    return 0
  fi
  [ -e "$workspace" ] || die "workspace not found: $workspace"
  workspace="$(cd "$workspace" && pwd)"
  cdp_up && die "port $VSCODE_CDP_PORT is already serving CDP for another process; set VSCODE_CDP_PORT."

  mkdir -p "$VSCODE_DEV_HOME" "$USER_DATA" "$EXTENSIONS"

  eval "$("$SCRIPT_DIR/ensure-headless-env.sh")"
  echo "$DISPLAY" >"$DISPLAY_FILE"

  # node_modules is a volume mount, so the directory exists even when empty.
  # npm writes .package-lock.json on every install; missing or older than
  # package-lock.json means deps are absent or stale.
  if [ ! "$REPO/node_modules/.package-lock.json" -nt "$REPO/package-lock.json" ]; then
    info "installing npm dependencies..."
    (cd "$REPO" && npm i) >&2 || die "npm i failed."
  fi

  info "compiling extension..."
  (cd "$REPO" && npm run compile) >&2 || die "npm run compile failed."

  ensure_vscode
  ensure_extension_dependencies
  ensure_settings

  info "launching VS Code on $DISPLAY (workspace $workspace, log $LOG_FILE)..."
  # --password-store=basic: no keyring in the container; without it VS Code
  # blocks on an "OS keyring couldn't be identified" dialog and SecretStorage fails.
  nohup "$VSCODE_BIN" \
    --extensionDevelopmentPath="$REPO" \
    --user-data-dir="$USER_DATA" \
    --extensions-dir="$EXTENSIONS" \
    --remote-debugging-port="$VSCODE_CDP_PORT" \
    --no-sandbox --disable-dev-shm-usage --disable-gpu \
    --password-store=basic --disable-workspace-trust \
    --disable-updates --disable-telemetry --skip-welcome --skip-release-notes \
    --new-window "$workspace" >"$LOG_FILE" 2>&1 &
  pid=$!
  echo "$pid" >"$PID_FILE"
  disown

  for _ in $(seq 60); do
    cdp_up && break
    kill -0 "$pid" 2>/dev/null || break
    sleep 1
  done
  if ! cdp_up; then
    tail -20 "$LOG_FILE" >&2 || true
    die "VS Code did not expose CDP on $CDP_URL within 60s (log above)."
  fi

  fill_display

  # The extension's MCP server comes up after activation, a few seconds after CDP.
  for _ in $(seq 30); do
    find_mcp_url "$pid" >/dev/null && break
    sleep 1
  done
  find_mcp_url "$pid" >/dev/null ||
    info "extension MCP server not found after 30s (is deephaven.mcp.enabled off, or did activation fail? see $LOG_FILE)."

  print_status
}

cmd_stop() {
  local pid _
  if ! pid="$(running_pid)"; then
    info "VS Code is not running."
    rm -f "$PID_FILE"
    return 0
  fi
  kill "$pid" 2>/dev/null || true
  for _ in $(seq 10); do
    kill -0 "$pid" 2>/dev/null || break
    sleep 0.5
  done
  if kill -0 "$pid" 2>/dev/null; then
    info "VS Code (pid $pid) ignored TERM; sending KILL."
    kill -9 "$pid" 2>/dev/null || true
  fi
  rm -f "$PID_FILE"
  info "stopped VS Code (pid $pid)."
}

cmd_screenshot() {
  local out="${1:-}" display
  display="$(cat "$DISPLAY_FILE" 2>/dev/null || true)"
  [ -n "$display" ] || die "no display recorded; run start first."
  xdpyinfo -display "$display" >/dev/null 2>&1 || die "display $display is not live; run start."
  if [ -z "$out" ]; then
    mkdir -p "$VSCODE_DEV_HOME/screenshots"
    out="$VSCODE_DEV_HOME/screenshots/$(date -u +%Y%m%d-%H%M%S).png"
  fi
  import -window root -display "$display" "$out"
  realpath "$out"
}

case "${1:-}" in
  start) shift && cmd_start "$@" ;;
  stop) cmd_stop ;;
  restart) shift && cmd_stop && cmd_start "$@" ;;
  status) print_status ;;
  screenshot) shift && cmd_screenshot "$@" ;;
  *) die "usage: $0 start|restart [WORKSPACE_PATH] | stop | status | screenshot [OUT.png]" ;;
esac
