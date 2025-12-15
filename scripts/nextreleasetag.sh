#!/bin/bash

###############################################################################
# Script: nextreleasetag.sh
# Description: Calculates the next release tag based on the latest git tag
#              matching the provided suffix pattern. Increments the patch
#              version using semantic versioning.
# Usage: ./nextreleasetag.sh [tag-suffix] [include-suffix]
# Arguments:
#   tag-suffix: Optional. The suffix to match in existing tags (e.g., -pre or -release)
#               Default: -release
#   include-suffix: Optional. Whether to include suffix in output (true/false)
#                   Default: true
# Examples:
#   Latest tag: v1.0.3-release
#   ./nextreleasetag.sh                   # Output: 1.0.4-release
#   ./nextreleasetag.sh -release          # Output: 1.0.4-release
#   ./nextreleasetag.sh -release false    # Output: 1.0.4
#
#   Latest tag: v1.1.10-pre
#   ./nextreleasetag.sh -pre              # Output: 1.1.11-pre
#   ./nextreleasetag.sh -pre true         # Output: 1.1.11-pre
#   ./nextreleasetag.sh -pre false        # Output: 1.1.11
###############################################################################

tagsuffix="${1:--release}"
include_suffix="${2:-true}"

# Determine current npm version based on latest git tag
git fetch --tags
current=$(git tag -l "v*.*.*$tagsuffix" | sort -V | tail -n 1 | sed -E 's/^v([0-9]+\.[0-9]+\.[0-9]+).*$/\1/')
if [ -z "$current" ]; then
  echo "No version tags found for suffix $tagsuffix. Please create a version tag first."
  exit 1
fi

# Calculate the next version
next=$(npx semver $current -i patch)

# Output with or without suffix based on second argument
if [ "$include_suffix" = "false" ]; then
  echo "${next}"
else
  echo "${next}${tagsuffix}"
fi