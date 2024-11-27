#!/bin/bash

set -e

# Determine current npm version and calculate next patch version
current=$(node -p -e "require('./package.json').version")
next=$(npx semver $current -i patch)

# Create a new branch, update the version, and create a new tag
git checkout -b v$next-pre
npm version --git-tag-version=false $next
git tag $next-pre
git push --tags

# Publish a pre-release version of the extension to the Marketplace
npx vsce publish --pre-release
