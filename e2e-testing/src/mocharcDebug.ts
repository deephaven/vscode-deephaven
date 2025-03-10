import { MochaOptions } from 'vscode-extension-tester';

const options: MochaOptions = {
  // When debugging tests in VS Code, we want to be able to set breakpoints and
  // inspect DOM, so we increase Mocha tests timeout. An arbitrary 3 minutes
  // seems sufficient for most cases but can be tweaked as necessary.
  timeout: 60000 * 3,
};

module.exports = options;
