/**
 * This script generates an icon font + manifest from a directory of SVG files.
 * Usage:
 *
 * npm run icon:gen -- <path-to-icons-directory>
 */

/* eslint-disable no-console */
import fs from 'node:fs';
import path from 'node:path';
import { generateFonts } from 'fantasticon';

// eslint-disable-next-line @typescript-eslint/naming-convention
const __dirname = import.meta.dirname;

const prefix = process.argv[2];
const inputDir = process.argv[3];

if (prefix == null) {
  console.error('No icon prefix specified');
  process.exit(1);
}

if (inputDir == null) {
  console.error(`No icon directory specified for '${prefix}' prefix`);
  process.exit(1);
}

if (!fs.existsSync(inputDir)) {
  console.error(`Icon directory '${inputDir}' does not exist`);
  process.exit(1);
}

const outputDir = path.join(__dirname, 'dist', prefix);
const assetsDir = path.join(__dirname, '..', 'assets');

// Remove and recreate the output directory
if (fs.existsSync(outputDir)) {
  fs.rmSync(outputDir, { recursive: true });
}
fs.mkdirSync(outputDir, { recursive: true });

console.log(`Generating icons from '${inputDir}'`);

// Using 1000 > than starting character of `vscode-codicons` in case we ever want
// to bundle them in the same font file.
// https://github.com/microsoft/vscode-codicons/blob/main/src/template/mapping.json
const startingCharacter = 61000;

// Map icon file names (without extension) to font character codepoints.
// Note: We could technically configure `fantasticon` to just read the input
// directory and generate the mapping for us, but this seems to have inconsistent
// ordering of the files. Reading explicilty gives us more control over the order
// of the icons.
const codepoints = fs
  .readdirSync(inputDir)
  .map(name => name.toLowerCase())
  .filter(name => name.endsWith('.svg'))
  .reduce((memo, name, i) => {
    memo[name.slice(0, -4)] = startingCharacter + i;
    return memo;
  }, {});

// Generate json that can be used in package.json "contributes/icons" section
// in vscode extension.
const contributesIcons = Object.entries(codepoints).reduce(
  (memo, [name, codepoint]) => {
    memo[`${prefix}-${name}`] = {
      description: `Deephaven ${prefix}-${name} icon`,
      default: {
        fontPath: `assets/${prefix}-icons.woff2`,
        fontCharacter: `\\${codepoint.toString(16)}`,
      },
    };
    return memo;
  },
  {}
);

fs.writeFileSync(
  path.join(outputDir, `${prefix}-contributes-icons.json`),
  JSON.stringify(contributesIcons, null, 2)
);

await generateFonts({
  name: `${prefix}-icons`,
  prefix: 'dh',
  normalize: true,
  inputDir,
  outputDir,
  codepoints,
});

fs.copyFileSync(
  path.join(outputDir, `${prefix}-icons.woff2`),
  path.join(assetsDir, `${prefix}-icons.woff2`)
);
