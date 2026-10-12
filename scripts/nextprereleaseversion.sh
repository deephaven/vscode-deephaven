#!/bin/bash

###############################################################################
# Script: nextprereleaseversion.sh
# Description: Calculates the next pre-release version by incrementing the
#              patch version of the latest `-pre` git tag. Outputs the bare
#              version only; the caller owns the tag suffix.
# Usage: ./nextprereleaseversion.sh
# Example:
#   Latest tag: v1.1.10-pre
#   ./nextprereleaseversion.sh    # Output: 1.1.11
###############################################################################

# Determine current npm version based on latest git tag
git fetch --tags || exit 1
current=$(git tag -l "v*.*.*-pre" | sort -V | tail -n 1 | sed -E 's/^v([0-9]+\.[0-9]+\.[0-9]+).*$/\1/')
if [ -z "$current" ]; then
  echo "No pre-release tags found. Please create a version tag first." >&2
  exit 1
fi

# Calculate the next version
npx semver $current -i patch
