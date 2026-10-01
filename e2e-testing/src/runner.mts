/* eslint-disable no-console */
import { ExTester, ReleaseQuality } from 'vscode-extension-tester';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
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

const vscodeVersion = 'latest';

// ExTester only ever looks for the driver here on Linux, regardless of arch.
const chromeDriverDir = path.join(storagePath, 'chromedriver-linux64');
const chromeDriverPath = path.join(chromeDriverDir, 'chromedriver');

/** Returns the driver's `-v` output, or null if it can't run on this machine. */
function probeChromeDriver(): string | null {
  try {
    return execFileSync(chromeDriverPath, ['-v'], {
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 15_000,
    })
      .toString()
      .trim();
  } catch {
    return null;
  }
}

/**
 * ExTester downloads Chrome for Testing's `linux64` (x86-64) ChromeDriver on
 * every Linux arch, and Chrome for Testing publishes no linux-arm64 build.
 * Electron publishes a ChromeDriver per release for each Linux arch, so swap in
 * the one matching the Electron version of the downloaded VS Code.
 */
async function installElectronChromeDriver(): Promise<void> {
  const vscodeArchs: Record<string, string> = {
    arm64: 'arm64',
    x64: 'x64',
    arm: 'armhf',
  };
  const electronArchs: Record<string, string> = {
    arm64: 'arm64',
    x64: 'x64',
    arm: 'armv7l',
  };
  const vscodeArch = vscodeArchs[process.arch];
  const electronArch = electronArchs[process.arch];
  if (vscodeArch == null || electronArch == null) {
    throw new Error(`No Electron ChromeDriver fallback for ${process.arch}`);
  }

  const codeBin = path.join(storagePath, `VSCode-linux-${vscodeArch}`, 'code');
  const electronVersion = execFileSync(
    codeBin,
    ['-e', 'console.log(process.versions.electron)'],
    // eslint-disable-next-line @typescript-eslint/naming-convention
    { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, timeout: 30_000 }
  )
    .toString()
    .trim();
  if (!/^\d+\.\d+\.\d+$/.test(electronVersion)) {
    throw new Error(
      `Unexpected Electron version from ${codeBin}: '${electronVersion}'`
    );
  }

  const zipName = `chromedriver-v${electronVersion}-linux-${electronArch}.zip`;
  const zipPath = path.join(storagePath, zipName);
  if (fs.existsSync(zipPath)) {
    console.log(`Electron ChromeDriver ${zipName} exists in storage folder`);
  } else {
    const url = `https://github.com/electron/electron/releases/download/v${electronVersion}/${zipName}`;
    console.log(`Downloading Electron ChromeDriver from ${url}`);
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to download ${url}: ${response.status}`);
    }
    fs.writeFileSync(zipPath, Buffer.from(await response.arrayBuffer()));
  }

  // The Electron zip has `chromedriver` at its root.
  fs.mkdirSync(chromeDriverDir, { recursive: true });
  execFileSync('unzip', ['-qo', zipPath, '-d', chromeDriverDir]);
  fs.chmodSync(chromeDriverPath, 0o755);
}

if (isSetup) {
  console.log('Downloading VS Code...');
  await exTester.downloadCode(vscodeVersion);

  console.log('\nDownloading ChromeDriver...');
  await exTester.downloadChromeDriver(vscodeVersion);

  if (process.platform === 'linux' && probeChromeDriver() == null) {
    console.log(
      `\nChromeDriver from ExTester cannot run on linux-${process.arch}; ` +
        'falling back to the Electron build'
    );
    await installElectronChromeDriver();
    const version = probeChromeDriver();
    if (version == null) {
      throw new Error(`Electron ChromeDriver at ${chromeDriverPath} won't run`);
    }
    console.log(`Using ${version}`);
  }

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
