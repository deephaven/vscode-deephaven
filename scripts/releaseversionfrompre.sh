#!/bin/bash

###############################################################################
# Script: releaseversionfrompre.sh
# Description: Derives the release version for the pre-release tag at a given ref.
#              Releases are always published from a pre-release tag, and the
#              release version mirrors it with the minor version decremented
#              (odd pre-release minor -> even release minor).
#              Outputs the bare version only; the caller owns the tag suffix.
# Usage: ./releaseversionfrompre.sh [ref]
# Arguments:
#   ref: Optional. Commit-ish that must be exactly at a pre-release tag.
#        Default: HEAD
# Examples:
#   HEAD at v1.1.7-pre
#   ./releaseversionfrompre.sh                      # Output: 1.0.7
#   ./releaseversionfrompre.sh v1.1.22-pre          # Output: 1.0.22
# Exits with a non-zero status if the ref is not at a pre-release tag or the
# tag does not have an odd minor version.
###############################################################################

ref="${1:-HEAD}"

if ! fetch_output=$(git fetch --tags 2>&1); then
  echo "Failed to fetch tags. Refusing to derive a release from unverified tags:" >&2
  echo "$fetch_output" >&2
  exit 1
fi

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

echo "$major.$((minor - 1)).$patch"
