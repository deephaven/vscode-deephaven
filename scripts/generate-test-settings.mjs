#!/usr/bin/env node
/* eslint-disable no-console */

/**
 * Generate VS Code settings.json for e2e test workspace
 *
 * Usage:
 *   node scripts/generate-test-settings.mjs --core http://localhost:10000/
 *   node scripts/generate-test-settings.mjs --coreplus https://example.com:8000/
 *   node scripts/generate-test-settings.mjs --core http://localhost:10000/ --coreplus https://example.com:8000/
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// eslint-disable-next-line @typescript-eslint/naming-convention
const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Parse a URL string and return the URL instance.
 * @param {string} arg - Argument name for error messages
 * @param {string} urlString - URL string to parse
 * @returns {URL} - URL instance
 */
function parseUrlValue(arg, urlString) {
  try {
    return new URL(urlString);
  } catch {
    console.error(`Error: Invalid URL for ${arg}`);
    process.exit(1);
  }
}

// Parse command line arguments
const args = process.argv.slice(2);
const coreServers = [];
const enterpriseServers = [];

while (args.length > 0) {
  const arg = args.shift();

  if (arg === '--help') {
    console.log(`
Usage: node scripts/generate-test-settings.mjs [options]

Options:
  --core <url>         Add a Deephaven Core server URL
  --coreplus <url>     Add a Deephaven Core+ (Enterprise) server URL
  --help               Show this help message

Examples:
  node scripts/generate-test-settings.mjs --core http://localhost:10000/
  node scripts/generate-test-settings.mjs --coreplus https://example.com:8000/
  node scripts/generate-test-settings.mjs --core http://localhost:10000/ --coreplus https://example.com:8000/
`);
    process.exit(0);
  }

  if (arg !== '--core' && arg !== '--coreplus') {
    console.error(`Error: Unknown argument '${arg}'`);
    console.error('Use --help for usage information');
    process.exit(1);
  }

  if (args.length === 0) {
    console.error(`Error: ${arg} requires a URL argument`);
    process.exit(1);
  }

  const url = parseUrlValue(arg, args.shift());

  if (arg === '--core') {
    coreServers.push(url.href);
  } else {
    enterpriseServers.push({
      url: url.href,
      experimentalWorkerConfig: {
        heapSize: 0.5,
      },
    });
  }
}

// Validate that at least one server was provided
if (coreServers.length === 0 && enterpriseServers.length === 0) {
  console.error(
    'Error: At least one server URL must be provided (--core or --coreplus)'
  );
  console.error('Use --help for usage information');
  process.exit(1);
}

// Create settings object
/* eslint-disable @typescript-eslint/naming-convention */
const settings = {
  'deephaven.coreServers': coreServers,
  'deephaven.enterpriseServers': enterpriseServers,
  'extensions.ignoreRecommendations': true,
  'git.openRepositoryInParentFolders': 'never',
  // Suppress the onboarding overlay (.onboarding-a-overlay, "Welcome to Visual
  // Studio Code") that newer VS Code shows on first run. ExTester wipes the
  // user-data-dir each run, so every run looks like a first run and the overlay
  // reappears, intercepting clicks and blocking the quick-input widget.
  // VS Code's tryShowOnboarding() only calls show() when this setting is truthy
  // (see workbench.desktop.main.js), so false short-circuits it entirely.
  'workbench.welcomePage.experimentalOnboarding': false,
};
/* eslint-enable @typescript-eslint/naming-convention */

// Output path
const outputPath = `${__dirname}/../e2e-testing/test-ws/.vscode/settings.json`;
const outputDir = dirname(outputPath);

// Create directory if it doesn't exist
mkdirSync(outputDir, { recursive: true });

// Write settings file
writeFileSync(outputPath, JSON.stringify(settings, null, 2) + '\n');

console.log(`✓ Generated settings file: ${outputPath}`);
console.log(
  `  - Core servers: ${coreServers.length > 0 ? coreServers.join(', ') : 'none'}`
);
console.log(
  `  - Enterprise servers: ${enterpriseServers.length > 0 ? enterpriseServers.map(({ url }) => url).join(', ') : 'none'}`
);
