#!/bin/bash

# This script automates the process of publishing a new version of a VS Code 
# extension.
#
# 1. Find the latest version tag for the release / pre-release version. This is
#    determined by whether the optional `--pre-release` flag is passed to the script.
#    Pre-release versions are tagged as `v1.1.X-pre` and release versions are 
#    tagged as `v1.0.X-release`.
# 2. Increment the patch version and use it to create a tag name
# 3. Checkout a new branch named with the tag name
# 4. Update the npm version in `package.json` and `package-lock.json`
# 5. Commit the changes and push the branch
# 6. Tag the commit with the new version tag and push the tag
#
# Note: We are following the recommended convention of pre-release versions 
# using an odd minor version and release versions using an even minor version. 
# VS Code will automatically update to the latest version regardless of whether 
# it is a pre-release or a release version, so we always want to keep a 
# pre-release version that is higher than the latest release version, so that 
# early adopters continue to get pre-release versions.

set -e

# Get pattern for git version tags
if [[ "$1" == "--pre-release" ]]; then
  label="pre-release"
  tagsuffix="-pre"
else
  label="release"
  tagsuffix="-release"
fi

# Calculate the next version using nextreleasetag.sh
next=$(scripts/nextreleasetag.sh "$tagsuffix" false)
tag="v$next$tagsuffix"

# Prompt user to confirm the publish
echo "Publishing $label version: $tag"
read -p "Continue? (y/n)" -n 1 -r
echo # move to a new line
if [[ ! $REPLY =~ ^[Yy]$ ]]
then
    echo "Aborted."
    [[ "$0" = "$BASH_SOURCE" ]] && exit 1 || return 1 # handle exits from shell or function but don't exit interactive shell
fi
echo "Publishing..."

# Create a new branch
git checkout -b $tag

# Update version
npm version --git-tag-version=false $next

# Commit and tag the new version
git add package.json
git add package-lock.json
git commit -m "$tag"
git push -u origin HEAD
git tag $tag
git push --tags

# Publish the extension to the Marketplace
if [[ "$1" == "--pre-release" ]]; then
  npx vsce publish --pre-release
else
  npx vsce publish
fi
