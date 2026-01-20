import { MochaOptions } from 'vscode-extension-tester';

const options: MochaOptions = {
  timeout: 30000,
  slow: 20000,
  reporter: 'mocha-multi-reporters',
  reporterOptions: {
    reporterEnabled: 'spec, mocha-ctrf-json-reporter',
    mochaCtrfJsonReporterReporterOptions: {
      outputDir: 'test-reports',
    },
  },
};

module.exports = options;
