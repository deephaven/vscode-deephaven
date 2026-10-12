#!/bin/bash

# This script automates the process of publishing a new version of a VS Code
# extension.
#
# 1. Determine the version to publish. This is determined by whether the
#    optional `--pre-release` flag is passed to the script. Pre-release versions
#    are tagged as `v1.1.X-pre` and release versions are tagged as
#    `v1.0.X-release`.
#    - Pre-release: increment the patch version of the latest pre-release tag.
#    - Release: HEAD must be exactly at a pre-release tag. The release version
#      mirrors it with the minor version decremented (`v1.1.X-pre` ->
#      `v1.0.X-release`), so every release is a tested pre-release. See
#      `releasetagfrompre.sh`.
# 2. Fail if the tag or branch for the version already exists locally or on
#    origin. Releasing a version lower than the latest release requires an extra
#    confirmation, since VS Code will not auto-update users to it.
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

abort() {
  echo "$1" >&2
  exit 1
}

# Get pattern for git version tags
if [[ "$1" == "--pre-release" ]]; then
  label="pre-release"
  tagsuffix="-pre"
else
  label="release"
  tagsuffix="-release"
fi

if [[ "$1" == "--pre-release" ]]; then
  # Calculate the next version using nextreleasetag.sh
  next=$(scripts/nextreleasetag.sh "$tagsuffix" false)
else
  # Derive the release version from the pre-release tag at HEAD
  next=$(scripts/releasetagfrompre.sh HEAD false)
fi

tag="v$next$tagsuffix"

# Fail if the tag or branch already exists locally or on origin
if git rev-parse -q --verify "refs/tags/$tag" > /dev/null \
  || git rev-parse -q --verify "refs/heads/$tag" > /dev/null; then
  abort "$tag already exists as a tag or branch."
fi

# `git ls-remote --exit-code` exits 2 when no ref matches. Any other nonzero
# status means the remote check itself failed (e.g. auth or network).
remote_status=0
git ls-remote --exit-code origin "refs/tags/$tag" "refs/heads/$tag" > /dev/null || remote_status=$?
if [[ $remote_status -eq 0 ]]; then
  abort "$tag already exists as a tag or branch on origin."
elif [[ $remote_status -ne 2 ]]; then
  abort "Failed to check origin for $tag (git ls-remote exit $remote_status)."
fi

# Releasing a lower version than the latest release is allowed but requires
# confirmation since VS Code will not auto-update users to it
if [[ "$1" != "--pre-release" ]]; then
  latest=$(git tag -l "v*.*.*$tagsuffix" | sort -V | tail -n 1 | sed -E 's/^v([0-9]+\.[0-9]+\.[0-9]+).*$/\1/')
  if [[ -n "$latest" ]] && ! npx semver -r ">$latest" "$next" > /dev/null; then
    echo "WARNING: $next is lower than the latest release $latest. VS Code users will not auto-update to it."
    read -p "Release anyway? (y/n)" -n 1 -r
    echo # move to a new line
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
      abort "Aborted."
    fi
  fi
fi

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
