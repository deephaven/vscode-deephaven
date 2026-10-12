#!/bin/bash

###############################################################################
# Script: releasetagfrompre.sh
# Description: Derives the release tag for the pre-release tag at a given ref.
#              Releases are always published from a pre-release tag, and the
#              release version mirrors it with the minor version decremented
#              (odd pre-release minor -> even release minor).
# Usage: ./releasetagfrompre.sh [ref] [include-suffix]
# Arguments:
#   ref: Optional. Commit-ish that must be exactly at a pre-release tag.
#        Default: HEAD
#   include-suffix: Optional. Whether to include suffix in output (true/false)
#                   Default: true
# Examples:
#   HEAD at v1.1.7-pre
#   ./releasetagfrompre.sh                      # Output: 1.0.7-release
#   ./releasetagfrompre.sh HEAD false           # Output: 1.0.7
#   ./releasetagfrompre.sh v1.1.22-pre          # Output: 1.0.22-release
# Exits with a non-zero status if the ref is not at a pre-release tag or the
# tag does not have an odd minor version.
###############################################################################

ref="${1:-HEAD}"
include_suffix="${2:-true}"

git fetch --tags > /dev/null 2>&1

commit=$(git rev-parse --verify -q "$ref^{commit}" 2> /dev/null)
if [ -z "$commit" ]; then
  echo "Could not resolve ref: $ref" >&2
  exit 1
fi

pretag=$(git tag --points-at "$commit" | grep -E '^v[0-9]+\.[0-9]+\.[0-9]+-pre$' | sort -V | tail -n 1)
if [ -z "$pretag" ]; then
  echo "$ref is not at a pre-release tag. Checkout the pre-release to promote first, e.g. 'git checkout refs/tags/v1.1.X-pre'." >&2
  exit 1
fi

if [[ ! "$pretag" =~ ^v([0-9]+)\.([0-9]+)\.([0-9]+)-pre$ ]]; then
  echo "Could not parse pre-release tag: $pretag" >&2
  exit 1
fi
major="${BASH_REMATCH[1]}"
minor="${BASH_REMATCH[2]}"
patch="${BASH_REMATCH[3]}"
if (( minor % 2 == 0 )); then
  echo "Pre-release tag $pretag does not have an odd minor version." >&2
  exit 1
fi

next="$major.$((minor - 1)).$patch"

# Output with or without suffix based on second argument
if [ "$include_suffix" = "false" ]; then
  echo "${next}"
else
  echo "${next}-release"
fi
