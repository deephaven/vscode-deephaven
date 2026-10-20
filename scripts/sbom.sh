#!/bin/bash

# This script generates a CycloneDX 1.6 JSON SBOM for a published VS Code
# extension `.vsix`. It works on any `.vsix` published from this repo,
# including older versions.
#
# A `.vsix` has no `node_modules`; esbuild bundles the production dependency
# tree into `out/`, so the SBOM lists `dependencies` from `package.json` plus
# their transitive deps as resolved by `package-lock.json`. devDependencies are
# omitted.
#
# 1. Determines the source:
#    - `<vsix>`: the `v<version>-release` or `v<version>-pre` tag for the
#      version in the `.vsix`. Fails if there is no such tag, so untagged builds
#      (e.g. `package:dev`) are not supported.
#    - `--tag <tag>`: that tag.
#    - Neither: the working tree. `publish.sh` uses this before the release tag
#      exists.
# 2. Installs the source's production dependency tree into a temp directory
#    with `npm ci --omit dev`.
# 3. Runs `cyclonedx-npm` against the temp directory and writes the SBOM next
#    to the `.vsix` as `<vsix name>.cdx.json`, or to
#    `releases/<name>-<version>.cdx.json` when no `.vsix` is given. `--output`
#    overrides either.
#
# Usage:
#   ./scripts/sbom.sh path/to/vscode-deephaven-1.0.20.vsix  # v1.0.20-release tag
#   ./scripts/sbom.sh --tag v1.0.20-release
#   ./scripts/sbom.sh                                      # working tree
#   ./scripts/sbom.sh --output /tmp/sbom.json --tag v1.1.26-pre

set -e

abort() {
  echo "$1" >&2
  exit 1
}

# Keep in sync with the `@cyclonedx/cyclonedx-npm` devDependency
CYCLONEDX_NPM_VERSION=6.0.1

REPO_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)

TAG=""
OUTPUT=""
VSIX=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --tag)
      [[ -n "$2" ]] || abort "--tag requires a value"
      TAG="${2#refs/tags/}"
      shift 2
      ;;
    -o|--output)
      [[ -n "$2" ]] || abort "$1 requires a value"
      OUTPUT="$2"
      shift 2
      ;;
    -h|--help)
      sed -n '3,/^$/p' "${BASH_SOURCE[0]}" | sed -E 's/^# ?//'
      exit 0
      ;;
    -*)
      abort "Unknown option: $1"
      ;;
    *)
      [[ -z "$VSIX" ]] || abort "Unexpected argument: $1"
      VSIX="$1"
      shift
      ;;
  esac
done

[[ -z "$VSIX" || -z "$TAG" ]] || abort "Pass a .vsix or --tag, not both."

WORK_DIR=$(mktemp -d)
trap 'rm -rf "$WORK_DIR"' EXIT

# Prints a field from a package.json file
pkg_field() {
  node -p "require(process.argv[1])[process.argv[2]] ?? ''" "$1" "$2"
}

tag_exists() {
  git -C "$REPO_ROOT" rev-parse -q --verify "refs/tags/$1^{commit}" > /dev/null
}

# Writes a file from the source (tag or working tree) to stdout
source_file() {
  if [[ -n "$TAG" ]]; then
    git -C "$REPO_ROOT" show "refs/tags/$TAG:$1"
  else
    cat "$REPO_ROOT/$1"
  fi
}

# 1. Source
if [[ -n "$VSIX" ]]; then
  [[ -f "$VSIX" ]] || abort "No such file: $VSIX"
  VSIX_VERSION=$(unzip -p "$VSIX" extension/package.json | node -p "JSON.parse(require('fs').readFileSync(0)).version") \
    || abort "$VSIX does not contain extension/package.json"
  for tag in "v$VSIX_VERSION-release" "v$VSIX_VERSION-pre"; do
    if tag_exists "$tag"; then
      TAG="$tag"
      break
    fi
  done
  [[ -n "$TAG" ]] \
    || abort "No v$VSIX_VERSION-release or v$VSIX_VERSION-pre tag. Only published versions are supported (try \`git fetch --tags\`)."
elif [[ -n "$TAG" ]]; then
  tag_exists "$TAG" || abort "Unknown tag: $TAG"
fi

source_file package.json > "$WORK_DIR/package.json"
source_file package-lock.json > "$WORK_DIR/package-lock.json"
source_file .npmrc > "$WORK_DIR/.npmrc" 2> /dev/null || rm -f "$WORK_DIR/.npmrc"

NAME=$(pkg_field "$WORK_DIR/package.json" name)
VERSION=$(pkg_field "$WORK_DIR/package.json" version)

if [[ -n "$VSIX" && "$VERSION" != "$VSIX_VERSION" ]]; then
  abort "$TAG has version $VERSION, but $VSIX has version $VSIX_VERSION."
fi

if [[ -z "$OUTPUT" ]]; then
  if [[ -n "$VSIX" ]]; then
    OUTPUT="${VSIX%.vsix}.cdx.json"
  else
    OUTPUT="$REPO_ROOT/releases/$NAME-$VERSION.cdx.json"
  fi
fi
mkdir -p "$(dirname "$OUTPUT")"
OUTPUT="$(cd "$(dirname "$OUTPUT")" && pwd)/$(basename "$OUTPUT")"

echo "Generating SBOM for $NAME@$VERSION from ${TAG:-working tree}"

# 2. Production dependency tree. Nothing is run from it, so the `.npmrc`
# `engine-strict` check against the local Node version doesn't apply.
(cd "$WORK_DIR" && npm ci --omit dev --ignore-scripts --engine-strict=false --no-audit --no-fund --loglevel error) \
  || abort "npm ci failed."

# 3. SBOM. Running npx from the repo resolves the pinned devDependency if it is
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
