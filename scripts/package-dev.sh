#!/bin/bash

# Update the version without committing
npm version prerelease --no-git-tag-version --preid=dev

# Package the extension using the updated version
PACKAGE_VERSION=$(node -p "require('./package.json').version")
vsce package -o releases/vscode-deephaven-$PACKAGE_VERSION.vsix