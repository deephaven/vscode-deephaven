/* eslint-disable no-console */
import { ExTester, ReleaseQuality } from 'vscode-extension-tester';
import path from 'node:path';

const args = process.argv.slice(2);
const isDebug = args.includes('--debug');
const isSetup = args.includes('--setup');

// eslint-disable-next-line @typescript-eslint/naming-convention
const __dirname = import.meta.dirname;
const e2eTestingPath = path.resolve(__dirname, '..');

const storagePath =
  process.env.TEST_RESOURCES ?? path.join(e2eTestingPath, '.resources');

// Warn about Unix socket path length constraints
// Electron/VS Code creates an IPC socket under storagePath/settings/<version>-main.sock
// Unix platforms (macOS, Linux) have varying socket path length limits.
// Storage path length > 70 is conservative to avoid constraints on different OSs.
if (process.platform !== 'win32' && storagePath.length > 70) {
  console.warn(
    `\nWARNING: Storage path length (${storagePath.length} chars) may hit socket path length ` +
      `constraints on some OSs.\n` +
      `  Path: ${storagePath}\n` +
      `If e2e tests fail with connection errors, try setting a shorter TEST_RESOURCES path.\n`
  );
}
const extensionsPath = path.join(e2eTestingPath, '.test-extensions');
const testFilesPattern = path.join(e2eTestingPath, 'out', '**', '*.spec.js');
const mochaConfig = path.join(
  e2eTestingPath,
  'out',
  isDebug ? 'mocharcDebug.js' : 'mocharc.js'
);
const settingsPath = path.join(
  e2eTestingPath,
  'test-ws',
  '.vscode',
  'settings.json'
);

const exTester = new ExTester(
  storagePath,
  ReleaseQuality.Stable,
  extensionsPath
);

const vscodeVersion = '1.114.0';

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
  settings: settingsPath,
};

console.log('\nRunning tests with options:', JSON.stringify(runOptions));
await exTester.runTests(testFilesPattern, runOptions);
