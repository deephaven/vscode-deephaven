#!/bin/bash

# This script packages a development version of the VS Code extension.
#
# 1. Determines the next pre-release version using nextprereleaseversion.sh
# 2. Checks if the current package.json version matches the pattern 
#    <next>-<preid>.<build_num> and increments the build number if so
# 3. Creates a version in the format: <next>-<preid>.<build_num>
#    - next: The next pre-release version (e.g., 1.1.10)
#    - preid: Optional prerelease identifier (defaults to "dev")
#    - build_num: Incremental build number (starts at 0)
# 4. Updates package.json with the new version (without git commit)
# 5. Packages the extension as a .vsix file in the releases/ directory
# 6. Optionally installs the .vsix via `code --install-extension` (--install)
#
# Usage:
#   ./scripts/package-dev.sh                  # Creates 1.1.10-dev.0
#   ./scripts/package-dev.sh alpha            # Creates 1.1.10-alpha.0
#   ./scripts/package-dev.sh beta             # Creates 1.1.10-beta.0
#   ./scripts/package-dev.sh --install        # Creates 1.1.10-dev.0 and installs it
#   ./scripts/package-dev.sh alpha --install  # Creates 1.1.10-alpha.0 and installs it
#
# If run multiple times with the same preid, the build number increments:
#   1.1.10-dev.0 -> 1.1.10-dev.1 -> 1.1.10-dev.2

set -e

NEXT=$(scripts/nextprereleaseversion.sh)
CURRENT_VERSION=$(node -p "require('./package.json').version")

INSTALL=0
PREID=""
for arg in "$@"; do
  case "$arg" in
    --install)
      INSTALL=1
      ;;
    -*)
      echo "Unknown option: $arg" >&2
      exit 1
      ;;
    *)
      if [[ -n "$PREID" ]]; then
        echo "Unexpected argument: $arg" >&2
        exit 1
      fi
      PREID="$arg"
      ;;
  esac
done
PREID="${PREID:-dev}"

# Default build number to 0
BUILD_NUM=0

# Check if current version matches next-preid.X pattern and increment
if [[ "$CURRENT_VERSION" =~ ^$NEXT-$PREID\.([0-9]+)$ ]]; then
  BUILD_NUM=${BASH_REMATCH[1]}
  BUILD_NUM=$((BUILD_NUM + 1))
fi

# Update the version without committing
npm version --no-git-tag-version $NEXT-$PREID.$BUILD_NUM

# Package the extension using the updated version
PACKAGE_VERSION=$(node -p "require('./package.json').version")
VSIX_PATH=releases/vscode-deephaven-$PACKAGE_VERSION.vsix
DHC_ALLOW_LOCAL_ALIAS=1 vsce package -o "$VSIX_PATH"

if [[ "$INSTALL" == 1 ]]; then
  code --install-extension "$VSIX_PATH" --force
fi