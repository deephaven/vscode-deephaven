#!/bin/bash

###############################################################################
# Script: nextreleaseversion.sh
# Description: Calculates the next version based on the latest git tag
#              matching the provided suffix pattern. Increments the patch
#              version using semantic versioning. Outputs the bare version
#              only; the caller owns the tag suffix.
# Usage: ./nextreleaseversion.sh [tag-suffix]
# Arguments:
#   tag-suffix: Optional. The suffix to match in existing tags (e.g., -pre or -release)
#               Default: -release
# Examples:
#   Latest tag: v1.0.3-release
#   ./nextreleaseversion.sh                   # Output: 1.0.4
#   ./nextreleaseversion.sh -release          # Output: 1.0.4
#
#   Latest tag: v1.1.10-pre
#   ./nextreleaseversion.sh -pre              # Output: 1.1.11
###############################################################################

tagsuffix="${1:--release}"

# Determine current npm version based on latest git tag
git fetch --tags
current=$(git tag -l "v*.*.*$tagsuffix" | sort -V | tail -n 1 | sed -E 's/^v([0-9]+\.[0-9]+\.[0-9]+).*$/\1/')
if [ -z "$current" ]; then
  echo "No version tags found for suffix $tagsuffix. Please create a version tag first."
  exit 1
fi

# Calculate the next version
npx semver $current -i patch
