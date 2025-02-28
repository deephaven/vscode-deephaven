#!/bin/bash
# Start D-Bus daemon
dbus-daemon --system --fork
# Start Xvfb
xvfb-run --auto-servernum --server-args="-screen 0 1920x1080x24" "$@"