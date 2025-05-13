import * as vscode from 'vscode';

const MS_PYTHON_EXTENSION_ID = 'ms-python.python';

/** Microsoft Python extension api */
interface MsPythonExtensionApi {
  environments: {
    getActiveEnvironmentPath: () => Promise<{ path: string }>;
  };
}

/** Get Microsoft Python extension api */
export function getMsPythonExtensionApi():
  | vscode.Extension<MsPythonExtensionApi>
  | undefined {
  return vscode.extensions.getExtension<MsPythonExtensionApi>(
    MS_PYTHON_EXTENSION_ID
  );
}
