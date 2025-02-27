/* eslint-disable no-console */
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
const mochaConfig = path.join(
  e2eTestingPath,
  isDebug ? '.mocharc-debug.js' : '.mocharc.js'
);

const exTester = new ExTester(
  storagePath,
  ReleaseQuality.Stable,
  extensionsPath
);

const vscodeVersion = '1.94.2';

if (isSetup) {
  console.log('Downloading VS Code...');
  await exTester.downloadCode(vscodeVersion);

  console.log('\nDownloading ChromeDriver...');
  await exTester.downloadChromeDriver(vscodeVersion);

  console.log('\nInstalling VSIX...');
  await exTester.installVsix();
}

const runOptions: Parameters<ExTester['runTests']>[1] = {
  resources: [],
  config: mochaConfig,
  vscodeVersion,
};

console.log('\nRunning tests...');
await exTester.runTests(testFilesPattern, runOptions);
