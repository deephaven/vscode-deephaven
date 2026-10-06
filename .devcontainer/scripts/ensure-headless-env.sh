#!/usr/bin/env bash
# Ensures this container can run a headless VS Code: installs Xvfb + Electron's
# runtime libs, and (unless --install) starts or reuses an Xvfb display.
#
#   .devcontainer/scripts/ensure-headless-env.sh --install   # packages only (post-create)
#   eval "$(.devcontainer/scripts/ensure-headless-env.sh)"    # packages + display
#
# stdout is reserved for a single `export DISPLAY=":N"` line so the output can
# be eval'd; every diagnostic (including apt's) goes to stderr.
#
# Idempotent — safe to run every time.
set -euo pipefail

info() { echo "INFO $*" >&2; }
die() {
  echo "ERR $*" >&2
  exit 1
}

# Ubuntu 24.04 (noble) package names — the t64 suffixes are required there.
PACKAGES=(
  xvfb x11-utils imagemagick xdotool
  libgtk-3-0t64 libnss3 libasound2t64 libgbm1 libxss1 libxkbfile1
  libsecret-1-0 libxshmfence1 libdrm2 libatk-bridge2.0-0t64 libcups2t64
  fonts-dejavu-core
)

DISPLAYS=(99 100 101 102 103 104)
SCREEN="1920x1080x24"

# --- packages -----------------------------------------------------------------

is_installed() {
  dpkg-query -W -f='${Status}' "$1" 2>/dev/null | grep -q 'install ok installed'
}

ensure_packages() {
  local missing=() pkg
  for pkg in "${PACKAGES[@]}"; do
    is_installed "$pkg" || missing+=("$pkg")
  done
  if [ ${#missing[@]} -eq 0 ]; then
    info "headless packages already installed."
    return 0
  fi

  command -v apt-get >/dev/null 2>&1 ||
    die "missing packages (${missing[*]}) and apt-get is not available."

  local sudo=""
  if [ "$(id -u)" -ne 0 ]; then
    command -v sudo >/dev/null 2>&1 || die "need root or sudo to install: ${missing[*]}"
    sudo="sudo"
  fi

  info "installing: ${missing[*]}"
  $sudo apt-get update -qq >&2
  $sudo env DEBIAN_FRONTEND=noninteractive apt-get install -y -qq "${missing[@]}" >&2 ||
    die "apt-get install failed (see output above)."
}

# --- display ------------------------------------------------------------------

display_works() {
  xdpyinfo -display "$1" >/dev/null 2>&1
}

# A lock with no live server behind it is debris: Xvfb refuses to start on a
# display whose lock exists. Only called after display_works has failed.
clear_stale_lock() {
  local n="$1" lock="/tmp/.X$1-lock"
  [ -e "$lock" ] || return 0
  if rm -f "$lock" "/tmp/.X11-unix/X$n" 2>/dev/null; then
    info "removed stale X lock $lock (no live server behind it)."
    return 0
  fi
  info "stale X lock $lock is not removable (another user?) — skipping :$n."
  return 1
}

start_xvfb() {
  local n="$1" _
  nohup Xvfb ":$n" -screen 0 "$SCREEN" -nolisten tcp >"/tmp/xvfb-$n.log" 2>&1 &
  echo $! >"/tmp/xvfb-$n.pid"
  disown
  for _ in $(seq 25); do
    display_works ":$n" && return 0
    sleep 0.2
  done
  return 1
}

ensure_display() {
  local n

  if [ -n "${DISPLAY:-}" ] && display_works "$DISPLAY"; then
    info "DISPLAY=$DISPLAY is live; reusing it."
    echo "export DISPLAY=\"$DISPLAY\""
    return 0
  fi

  for n in "${DISPLAYS[@]}"; do
    if display_works ":$n"; then
      info "reusing live X server on :$n."
      echo "export DISPLAY=\":$n\""
      return 0
    fi
  done

  for n in "${DISPLAYS[@]}"; do
    clear_stale_lock "$n" || continue
    if start_xvfb "$n"; then
      info "started Xvfb on :$n ($SCREEN, log /tmp/xvfb-$n.log)."
      echo "export DISPLAY=\":$n\""
      return 0
    fi
    info "Xvfb failed to come up on :$n (see /tmp/xvfb-$n.log)."
  done

  die "could not start Xvfb on any of :${DISPLAYS[*]}."
}

# --- main ---------------------------------------------------------------------

case "${1:-}" in
  --install)
    ensure_packages
    ;;
  "")
    ensure_packages
    ensure_display
    ;;
  *)
    die "usage: $0 [--install]"
    ;;
esac
