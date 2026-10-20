#!/bin/bash

# This script generates a CycloneDX 1.6 JSON SBOM for the extension at
# `releases/vscode-deephaven-<version>.cdx.json`.
#
# A `.vsix` has no `node_modules`; esbuild bundles the production dependency
# tree into `out/`, so the SBOM lists `dependencies` from `package.json` plus
# their transitive deps as resolved by `package-lock.json`. devDependencies are
# omitted.
#
# The source is the given release / pre-release tag, or the working tree if no
# tag is given (`publish.sh` uses this before the tag exists). Its production
# dependency tree is installed into a temp directory with `npm ci --omit dev`,
# and `cyclonedx-npm` runs against that.
#
# Usage:
#   ./scripts/sbom.sh v1.0.20-release   # releases/vscode-deephaven-1.0.20.cdx.json
#   ./scripts/sbom.sh                   # working tree

set -e

# Keep in sync with the `@cyclonedx/cyclonedx-npm` devDependency
CYCLONEDX_NPM_VERSION=6.0.1

REPO_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
TAG="$1"

WORK_DIR=$(mktemp -d)
trap 'rm -rf "$WORK_DIR"' EXIT

for file in package.json package-lock.json; do
  if [[ -n "$TAG" ]]; then
    git -C "$REPO_ROOT" show "refs/tags/$TAG:$file" > "$WORK_DIR/$file"
  else
    cp "$REPO_ROOT/$file" "$WORK_DIR/$file"
  fi
done

VERSION=$(node -p "require('$WORK_DIR/package.json').version")
OUTPUT="$REPO_ROOT/releases/vscode-deephaven-$VERSION.cdx.json"

# Nothing is run from the installed tree, so the local Node version doesn't
# need to satisfy package engines (older tags may pin a different Node).
(cd "$WORK_DIR" && npm ci --omit dev --ignore-scripts --engine-strict=false --no-audit --no-fund --loglevel error)

# Running npx from the repo resolves the pinned devDependency if it is
# installed.
(cd "$REPO_ROOT" && npx --yes "@cyclonedx/cyclonedx-npm@$CYCLONEDX_NPM_VERSION" \
  --omit dev \
  --spec-version 1.6 \
  --output-format JSON \
  --mc-type application \
  --output-reproducible \
  --validate \
  --output-file "$OUTPUT" \
  "$WORK_DIR/package.json")

echo "SBOM: $OUTPUT"
