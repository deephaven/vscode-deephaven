import * as vscode from 'vscode';

declare global {
  namespace WebdriverIO {
    interface Browser {
      /** Extend default types for better type safety of callback args.  */
      executeWorkbench: <
        TArgs extends unknown[],
        TResult extends unknown,
        TCallback extends (
          vs: typeof vscode,
          ...args: TArgs
        ) => Promise<TResult>,
      >(
        callback: TCallback,
        ...args: TArgs
      ) => Promise<TResult>;
    }
  }
}
