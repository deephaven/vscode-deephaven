#!/bin/bash

# This script generates a CycloneDX 1.6 JSON SBOM for a VS Code extension
# `.vsix`. It works on any `.vsix` built from this repo, including ones built
# from older commits.
#
# A `.vsix` has no `node_modules`; esbuild bundles the production dependency
# tree into `out/`, so the SBOM lists `dependencies` from `package.json` plus
# their transitive deps as resolved by `package-lock.json`. devDependencies are
# omitted.
#
# 1. Reads `extension/package.json` from the `.vsix`. This is the SBOM's root
#    component, so its name and version match the `.vsix`.
# 2. Determines which source commit's `package-lock.json` to use:
#    - `--ref <git-ref>` if given
#    - else the `v<version>-release` or `v<version>-pre` tag if one exists
#    - else the working tree, if its `package.json` version matches the `.vsix`
# 3. Installs the production dependency tree into a temp directory with
#    `npm ci --omit dev`. `npm ci` fails if the `.vsix` dependencies don't match
#    the lockfile, so a wrong `--ref` is caught.
# 4. Runs `cyclonedx-npm` against the temp directory and writes the SBOM next
#    to the `.vsix` as `<vsix name>.cdx.json` (or to `--output`).
#
# If no `.vsix` is given, the root component comes from `package.json` at
# `--ref` (or the working tree), and the SBOM is written to
# `releases/<name>-<version>.cdx.json`.
#
# Usage:
#   ./scripts/sbom.sh releases/vscode-deephaven-1.1.10-dev.0.vsix
#   ./scripts/sbom.sh vscode-deephaven-1.0.20.vsix          # uses v1.0.20-release tag
#   ./scripts/sbom.sh --ref 1a2b3c4 some-dev-build.vsix     # untagged build
#   ./scripts/sbom.sh --output /tmp/sbom.json my.vsix
#   ./scripts/sbom.sh                                       # working tree, no .vsix
#   ./scripts/sbom.sh --ref v1.0.20-release                 # tag, no .vsix

set -e

abort() {
  echo "$1" >&2
  exit 1
}

# Keep in sync with the `@cyclonedx/cyclonedx-npm` devDependency
CYCLONEDX_NPM_VERSION=6.0.1

REPO_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)

REF=""
OUTPUT=""
VSIX=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --ref)
      [[ -n "$2" ]] || abort "--ref requires a value"
      REF="$2"
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

WORK_DIR=$(mktemp -d)
trap 'rm -rf "$WORK_DIR"' EXIT

# Prints a field from a package.json file
pkg_field() {
  node -p "require(process.argv[1])[process.argv[2]] ?? ''" "$1" "$2"
}

# Writes a file from the source (git ref or working tree) to stdout
source_file() {
  if [[ -n "$REF" ]]; then
    git -C "$REPO_ROOT" show "$REF:$1"
  else
    cat "$REPO_ROOT/$1"
  fi
}

# 1. Root component manifest
if [[ -n "$VSIX" ]]; then
  [[ -f "$VSIX" ]] || abort "No such file: $VSIX"
  unzip -p "$VSIX" extension/package.json > "$WORK_DIR/package.json" \
    || abort "$VSIX does not contain extension/package.json"
  VERSION=$(pkg_field "$WORK_DIR/package.json" version)
fi

# 2. Source commit for the lockfile
if [[ -n "$REF" ]]; then
  git -C "$REPO_ROOT" rev-parse -q --verify "$REF^{commit}" > /dev/null \
    || abort "Unknown git ref: $REF"
elif [[ -n "$VSIX" ]]; then
  for tag in "v$VERSION-release" "v$VERSION-pre"; do
    if git -C "$REPO_ROOT" rev-parse -q --verify "refs/tags/$tag^{commit}" > /dev/null; then
      REF="refs/tags/$tag"
      break
    fi
  done
  if [[ -z "$REF" && "$(pkg_field "$REPO_ROOT/package.json" version)" != "$VERSION" ]]; then
    abort "No v$VERSION-release or v$VERSION-pre tag, and the working tree is not version $VERSION. Pass --ref <commit> for the commit $VSIX was built from."
  fi
fi

if [[ -z "$VSIX" ]]; then
  source_file package.json > "$WORK_DIR/package.json"
fi
source_file package-lock.json > "$WORK_DIR/package-lock.json"
source_file .npmrc > "$WORK_DIR/.npmrc" 2> /dev/null || rm -f "$WORK_DIR/.npmrc"

NAME=$(pkg_field "$WORK_DIR/package.json" name)
VERSION=$(pkg_field "$WORK_DIR/package.json" version)

if [[ -z "$OUTPUT" ]]; then
  if [[ -n "$VSIX" ]]; then
    OUTPUT="${VSIX%.vsix}.cdx.json"
  else
    OUTPUT="$REPO_ROOT/releases/$NAME-$VERSION.cdx.json"
  fi
fi
mkdir -p "$(dirname "$OUTPUT")"
OUTPUT="$(cd "$(dirname "$OUTPUT")" && pwd)/$(basename "$OUTPUT")"

echo "Generating SBOM for $NAME@$VERSION from ${REF:-working tree}"

# 3. Production dependency tree
(cd "$WORK_DIR" && npm ci --omit dev --ignore-scripts --no-audit --no-fund --loglevel error) \
  || abort "npm ci failed. If the .vsix dependencies don't match the lockfile, pass --ref <commit> for the commit it was built from."

# 4. SBOM. Running npx from the repo resolves the pinned devDependency if it is
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
