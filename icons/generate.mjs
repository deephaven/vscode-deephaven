/* eslint-disable no-console */
import fs from 'node:fs';
import path from 'node:path';
import { generateFonts } from 'fantasticon';

// eslint-disable-next-line @typescript-eslint/naming-convention
const __dirname = import.meta.dirname;

const inputDir = process.argv[2];
const outputDir = path.join(__dirname, 'dist');

if (inputDir == null) {
  console.error('No icon directory specified');
  process.exit(1);
}

if (!fs.existsSync(inputDir)) {
  console.error(`Icon directory '${inputDir}' does not exist`);
  process.exit(1);
}

// Remove and recreate the output directory
if (fs.existsSync(outputDir)) {
  fs.rmSync(outputDir, { recursive: true });
}
fs.mkdirSync(outputDir);

console.log(`Generating icons from '${inputDir}'`);

// Picking an arbitrary high starting character to avoid conflicts with other
// fonts, although I don't think this is actually necessary.
const startingCharacter = 70000;

// fantasticon will generate a JSON file with the codepoints for each icon in
// decimal format
const codepoints = fs
  .readdirSync(inputDir)
  .filter(name => name.endsWith('.svg'))
  .reduce((memo, name, i) => {
    memo[name.replace('.svg', '')] = startingCharacter + i;
    return memo;
  }, {});

// Generate a code point mapping in hex format (useful for vscode extension icons)
const codepointsHex = Object.entries(codepoints).reduce(
  (memo, [name, codepoint]) => {
    memo[name] = `\\${codepoint.toString(16)}`;
    return memo;
  },
  {}
);

fs.writeFileSync(
  path.join(outputDir, 'dh-icons.json'),
  JSON.stringify(codepointsHex, null, 2)
);

generateFonts({
  name: 'dh-icons',
  prefix: 'dh',
  inputDir,
  outputDir,
  codepoints,
});
