import { ExTester, ReleaseQuality } from 'vscode-extension-tester';
import path from 'node:path';

const args = process.argv.slice(2);
const isDebug = args.includes('--debug');
const isSetup = args.includes('--setup');

// eslint-disable-next-line @typescript-eslint/naming-convention
const __dirname = import.meta.dirname;
const e2eTestingPath = path.resolve(__dirname, '..');

const storagePath = path.join(e2eTestingPath, '.resources');
const extensionsPath = path.join(e2eTestingPath, '.test-extensions');
const testFilesPattern = path.join(e2eTestingPath, 'out', '**', '*.spec.js');
const mochaConfigDebug = path.join(e2eTestingPath, '.mocharc-debug.js');

const exTester = new ExTester(
  storagePath,
  ReleaseQuality.Stable,
  extensionsPath
);

if (isSetup) {
  // eslint-disable-next-line no-console
  console.log('Setting up requirements...');
  await exTester.setupRequirements();
}

const runOptions: Parameters<ExTester['runTests']>[1] = {
  resources: [],
};

if (isDebug) {
  // eslint-disable-next-line no-console
  console.log('Running in debug mode.');
  runOptions.config = mochaConfigDebug;
}

await exTester.runTests(testFilesPattern, runOptions);
