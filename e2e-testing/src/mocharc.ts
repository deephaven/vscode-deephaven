import { MochaOptions } from 'vscode-extension-tester';

const options: MochaOptions = {
  timeout: 30000,
  reporter: 'mocha-ctrf-json-reporter',
  reporterOptions: {
    outputDir: 'test-reports',
  },
};

module.exports = options;
