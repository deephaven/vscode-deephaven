#!/bin/bash
set -e
"$(dirname "$0")/scripts/ensure-headless-env.sh" --install

# Register the UI driver for Claude Code in local scope: keyed to this project
# path and stored in the bind-mounted ~/.claude, so it survives rebuilds without
# a committed .mcp.json. Replaced on every create, so a stale entry from an
# earlier rebuild (old version pin, other browser URL) never sticks.
cd "$(dirname "$0")/.."
if ! command -v claude >/dev/null 2>&1; then
  echo "WARN claude not on PATH; skipping chrome-devtools MCP registration." >&2
else
  claude mcp remove --scope local chrome-devtools >/dev/null 2>&1 || true
  claude mcp add --scope local chrome-devtools -- \
    npx -y chrome-devtools-mcp@1.10.1 --browserUrl http://127.0.0.1:9222 \
    --no-usage-statistics --no-performance-crux
fi
