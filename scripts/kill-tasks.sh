#!/bin/bash
echo "Killing esbuild and tsc processes..."
pkill -f esbuild.*--watch || true
pkill -f tsc.*--build || true
echo "Done."