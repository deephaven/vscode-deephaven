'use strict';
/**
 * Licensed to the Apache Software Foundation (ASF) under one or more
 * contributor license agreements.  See the NOTICE file distributed with
 * this work for additional information regarding copyright ownership.
 * The ASF licenses this file to You under the Apache License, Version 2.0
 * (the "License", destination); you may not use this file except in compliance with
 * the License.  You may obtain a copy of the License at
 *
 *      https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
var __createBinding =
  (this && this.__createBinding) ||
  (Object.create
    ? function (o, m, k, k2) {
        if (k2 === undefined) k2 = k;
        var desc = Object.getOwnPropertyDescriptor(m, k);
        if (
          !desc ||
          ('get' in desc ? !m.__esModule : desc.writable || desc.configurable)
        ) {
          desc = {
            enumerable: true,
            get: function () {
              return m[k];
            },
          };
        }
        Object.defineProperty(o, k2, desc);
      }
    : function (o, m, k, k2) {
        if (k2 === undefined) k2 = k;
        o[k2] = m[k];
      });
var __setModuleDefault =
  (this && this.__setModuleDefault) ||
  (Object.create
    ? function (o, v) {
        Object.defineProperty(o, 'default', { enumerable: true, value: v });
      }
    : function (o, v) {
        o['default'] = v;
      });
var __importStar =
  (this && this.__importStar) ||
  (function () {
    var ownKeys = function (o) {
      ownKeys =
        Object.getOwnPropertyNames ||
        function (o) {
          var ar = [];
          for (var k in o)
            if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
          return ar;
        };
      return ownKeys(o);
    };
    return function (mod) {
      if (mod && mod.__esModule) return mod;
      var result = {};
      if (mod != null)
        for (var k = ownKeys(mod), i = 0; i < k.length; i++)
          if (k[i] !== 'default') __createBinding(result, mod, k[i]);
      __setModuleDefault(result, mod);
      return result;
    };
  })();
Object.defineProperty(exports, '__esModule', { value: true });
exports.VSBrowser = void 0;
const path = __importStar(require('path'));
const fs = __importStar(require('fs-extra'));
const compare_versions_1 = require('compare-versions');
const page_objects_1 = require('@redhat-developer/page-objects');
const chrome_1 = require('selenium-webdriver/chrome');
const locators_1 = require('@redhat-developer/locators');
const codeUtil_1 = require('./util/codeUtil');
const extester_1 = require('./extester');
const driverUtil_1 = require('./util/driverUtil');
class VSBrowser {
  static baseVersion = '1.37.0';
  static browserName = 'vscode';
  storagePath;
  extensionsFolder;
  customSettings;
  _driver;
  codeVersion;
  releaseType;
  logLevel;
  static _instance;
  constructor(
    codeVersion,
    releaseType,
    customSettings = {},
    logLevel = page_objects_1.logging.Level.INFO
  ) {
    this.storagePath = process.env.TEST_RESOURCES
      ? process.env.TEST_RESOURCES
      : path.resolve(extester_1.DEFAULT_STORAGE_FOLDER);
    this.extensionsFolder = process.env.EXTENSIONS_FOLDER
      ? process.env.EXTENSIONS_FOLDER
      : undefined;
    this.customSettings = customSettings;
    this.codeVersion = codeVersion;
    this.releaseType = releaseType;
    this.logLevel = logLevel;
    VSBrowser._instance = this;
  }
  /**
   * Starts the vscode browser from a given path
   * @param codePath path to code binary
   */
  async start(codePath) {
    const userSettings = path.join(this.storagePath, 'settings', 'User');
    if (fs.existsSync(userSettings)) {
      fs.removeSync(path.join(this.storagePath, 'settings'));
    }
    let defaultSettings = {
      'workbench.editor.enablePreview': false,
      'workbench.startupEditor': 'none',
      'window.titleBarStyle': 'custom',
      'window.commandCenter': false,
      'window.dialogStyle': 'custom',
      'window.restoreFullscreen': true,
      'window.newWindowDimensions': 'maximized',
      'security.workspace.trust.enabled': false,
      'files.simpleDialog.enable': true,
      'terminal.integrated.copyOnSelection': true,
    };
    if (Object.keys(this.customSettings).length > 0) {
      console.log('Detected user defined code settings');
      defaultSettings = { ...defaultSettings, ...this.customSettings };
    }
    fs.mkdirpSync(path.join(userSettings, 'globalStorage'));
    await fs.remove(path.join(this.storagePath, 'screenshots'));
    fs.writeJSONSync(path.join(userSettings, 'settings.json'), defaultSettings);
    console.log(
      `Writing code settings to ${path.join(userSettings, 'settings.json')}`
    );
    const args = [
      // '--whitelisted-ips=""', // PATCH:
      // '--headless', // PATCH:
      // '--disable-dev-shm-usage',
      '--no-sandbox',
      '--disable-gpu',
      '--remote-debugging-pipe',
      `--user-data-dir=${path.join(this.storagePath, 'settings')}`,
    ];
    if (this.extensionsFolder) {
      args.push(`--extensions-dir=${this.extensionsFolder}`);
    }
    if ((0, compare_versions_1.satisfies)(this.codeVersion, '<1.39.0')) {
      if (process.platform === 'win32') {
        fs.copyFileSync(
          path.resolve(__dirname, '..', '..', 'resources', 'state.vscdb'),
          path.join(userSettings, 'globalStorage', 'state.vscdb')
        );
      }
      args.push(`--extensionDevelopmentPath=${process.cwd()}`);
    } else if (process.env.EXTENSION_DEV_PATH) {
      args.push(`--extensionDevelopmentPath=${process.env.EXTENSION_DEV_PATH}`);
    }
    let options = new chrome_1.Options()
      .setChromeBinaryPath(codePath)
      .addArguments(...args);
    options['options_'].windowTypes = ['webview'];
    options = options;
    const prefs = new page_objects_1.logging.Preferences();
    prefs.setLevel(page_objects_1.logging.Type.DRIVER, this.logLevel);
    options.setLoggingPrefs(prefs);
    const driverBinary =
      process.platform === 'win32' ? 'chromedriver.exe' : 'chromedriver';
    let chromeDriverBinaryPath = path.join(this.storagePath, driverBinary);
    if ((0, compare_versions_1.satisfies)(this.codeVersion, '>=1.86.0')) {
      chromeDriverBinaryPath = path.join(
        this.storagePath,
        `chromedriver-${driverUtil_1.DriverUtil.getChromeDriverPlatform()}`,
        driverBinary
      );
    }
    console.log('Launching browser...');
    console.log('Patching ServiceBuilder...');
    // PATCH:
    const serviceBuilder = new chrome_1.ServiceBuilder(chromeDriverBinaryPath);
    serviceBuilder.setStdio('inherit');
    // serviceBuilder.enableVerboseLogging();
    this._driver = await new page_objects_1.Builder()
      .setChromeService(serviceBuilder)
      .forBrowser(page_objects_1.Browser.CHROME)
      .setChromeOptions(options)
      .build();
    VSBrowser._instance = this;
    (0, page_objects_1.initPageObjects)(
      this.codeVersion,
      VSBrowser.baseVersion,
      (0, locators_1.getLocatorsPath)(),
      this._driver,
      VSBrowser.browserName
    );
    return this;
  }
  /**
   * Returns a reference to the underlying instance of Webdriver
   */
  get driver() {
    return this._driver;
  }
  /**
   * Returns the vscode version as string
   */
  get version() {
    return this.codeVersion;
  }
  /**
   * Returns an instance of VSBrowser
   */
  static get instance() {
    return VSBrowser._instance;
  }
  /**
   * Waits until parts of the workbench are loaded
   */
  async waitForWorkbench(timeout = 30000) {
    // Workaround/patch for https://github.com/redhat-developer/vscode-extension-tester/issues/466
    try {
      await this._driver.wait(
        page_objects_1.until.elementLocated(
          page_objects_1.By.className('monaco-workbench')
        ),
        timeout,
        `Workbench was not loaded properly after ${timeout} ms.`
      );
    } catch (err) {
      if (err.name === 'WebDriverError') {
        await new Promise(res => setTimeout(res, 3000));
      } else {
        throw err;
      }
    }
  }
  /**
   * Terminates the webdriver/browser
   */
  async quit() {
    const entries = await this._driver
      .manage()
      .logs()
      .get(page_objects_1.logging.Type.DRIVER);
    const logFile = path.join(this.storagePath, 'test.log');
    const stream = fs.createWriteStream(logFile, { flags: 'w' });
    entries.forEach(entry => {
      stream.write(
        `[${new Date(entry.timestamp).toLocaleTimeString()}][${entry.level.name}] ${entry.message}`
      );
    });
    stream.end();
    console.log('Shutting down the browser');
    await this._driver.quit();
  }
  /**
   * Take a screenshot of the browser
   * @param name file name of the screenshot without extension
   */
  async takeScreenshot(name) {
    const data = await this._driver.takeScreenshot();
    const dir = path.join(this.storagePath, 'screenshots');
    fs.mkdirpSync(dir);
    fs.writeFileSync(path.join(dir, `${name}.png`), data, 'base64');
  }
  /**
   * Get a screenshots folder path
   * @returns string path to the screenshots folder
   */
  getScreenshotsDir() {
    return path.join(this.storagePath, 'screenshots');
  }
  /**
   * Open folder(s) or file(s) in the current instance of vscode.
   *
   * @param paths path(s) of folder(s)/files(s) to open as varargs
   * @returns Promise resolving when all selected resources are opened and the workbench reloads
   */
  async openResources(...paths) {
    if (paths.length === 0) {
      return;
    }
    const code = new codeUtil_1.CodeUtil(
      this.storagePath,
      this.releaseType,
      this.extensionsFolder
    );
    code.open(...paths);
    await new Promise(res => setTimeout(res, 3000));
    await this.waitForWorkbench();
  }
}
exports.VSBrowser = VSBrowser;
//# sourceMappingURL=browser.js.map
