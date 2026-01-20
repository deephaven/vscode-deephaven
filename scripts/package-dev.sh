#!/bin/bash

# This script packages a development version of the VS Code extension.
#
# 1. Determines the next release version using nextreleasetag.sh
# 2. Checks if the current package.json version matches the pattern 
#    <next>-<preid>.<build_num> and increments the build number if so
# 3. Creates a version in the format: <next>-<preid>.<build_num>
#    - next: The next release version (e.g., 1.0.10)
#    - preid: Optional prerelease identifier (defaults to "dev")
#    - build_num: Incremental build number (starts at 0)
# 4. Updates package.json with the new version (without git commit)
# 5. Packages the extension as a .vsix file in the releases/ directory
#
# Usage:
#   ./scripts/package-dev.sh          # Creates 1.0.10-dev.0
#   ./scripts/package-dev.sh alpha    # Creates 1.0.10-alpha.0
#   ./scripts/package-dev.sh beta     # Creates 1.0.10-beta.0
#
# If run multiple times with the same preid, the build number increments:
#   1.0.10-dev.0 -> 1.0.10-dev.1 -> 1.0.10-dev.2

NEXT=$(scripts/nextreleasetag.sh "-release" false)
CURRENT_VERSION=$(node -p "require('./package.json').version")
PREID="${1:-dev}"

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
DHC_ALLOW_LOCAL_ALIAS=1 vsce package -o releases/vscode-deephaven-$PACKAGE_VERSION.vsix