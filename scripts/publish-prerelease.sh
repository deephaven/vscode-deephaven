#!/bin/bash

set -e

# Determine current npm version and calculate next patch version
current=$(node -p -e "require('./package.json').version")
next=$(npx semver $current -i patch)
tag="v$next-pre"

# Create a new branch
git checkout -b $tag

# Update version
npm version --git-tag-version=false $next

# Commit and tag the new version
git add package.json
git add package-lock.json
git commit -m "$tag"
git tag $tag
git push --tags

# Publish a pre-release version of the extension to the Marketplace
npx vsce publish --pre-release
