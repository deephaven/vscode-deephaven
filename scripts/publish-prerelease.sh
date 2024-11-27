#!/bin/bash

# Check if VSCE_PAT environment variable is set
if [ -z "$VSCE_PAT" ]; then
  echo "VSCE_PAT environment variable is not set"
  exit 1
fi

set -e

# Determine current npm version and calculate next patch version
current=$(node -p -e "require('./package.json').version")
next=$(npx semver $current -i patch)

# Create a new branch, update the version, and create a new tag
git checkout -b v$next-pre
npm version --git-tag-version=false $next
git tag $next-pre

npx vsce publish --pre-release

git push --tags