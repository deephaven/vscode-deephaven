import * as vscode from 'vscode';
import * as fs from 'node:fs';
import type { dh as DhcType } from '@deephaven/jsapi-types';

const LOG_TAG = 'VSCODE-REQUIREMENTS-TXT' as const;
const EXTRACT_REQUIREMENT_REGEX = new RegExp(`^\\[${LOG_TAG}](.*)`);
const FINALIZE_LOGS_TAG = `[${LOG_TAG}-END]\n`;

/**
 * Query installed Python package names + versions. Each package is prefixed with
 * a tag to identify it in the log messages. After all packages have been printed,
 * a finalizing log message is sent to indicate the end of the list.
 */
const REQUIREMENTS_QUERY_TXT = `from importlib.metadata import packages_distributions, version
installed = {pkg for pkgs in packages_distributions().values() for pkg in pkgs}
req_str ="\\n".join(f"[${LOG_TAG}]{pkg}=={version(pkg)}" for pkg in installed)
print(req_str)
print('[${LOG_TAG}-END]')
`;

/**
 * Generates a `requirements.txt` file based on packages installed on a DH server.
 * This works by running a query on a DH session that prints package names and
 * versions with a leading identifier. Log events are subscribed to, filtered by
 * the identifier, and the package names and versions are extracted and then used
 * to generate the `requirements.txt` file and save it to the workspace.
 */
export class RequirementsTxtGenerator {
  constructor(session: DhcType.IdeSession) {
    this._session = session;
  }

  private readonly _session: DhcType.IdeSession;
  private readonly _requirements: Map<string, string> = new Map();
  private _trackingLogs: PromiseWithResolvers<void> | null = null;

  /**
   * Handle session log messages and extract package names and versions from
   * any entries containing the leading identifier.
   * @param logItem The log item to process.
   */
  onLogMessage = (logItem: DhcType.ide.LogItem): void => {
    // onLogMessage will get called on the entire log history when subscribed,
    // so we ignore messages until tracking has been enabled and after tracking
    // has been finalized.
    if (this._trackingLogs == null) {
      return;
    }

    // Finalize tracking when we see our finalization tag
    if (logItem.message === FINALIZE_LOGS_TAG) {
      this._trackingLogs.resolve();
      this._trackingLogs = null;
      return;
    }

    const [, requirementPair] =
      EXTRACT_REQUIREMENT_REGEX.exec(logItem.message) ?? [];

    if (requirementPair == null) {
      return;
    }

    const [packageName, version] = requirementPair.split('==');

    this._requirements.set(packageName, version);
  };

  /**
   * Run the requirements generation process.
   */
  run = async (): Promise<void> => {
    const unsubscribe = this._session.onLogMessage(this.onLogMessage);

    // Start tracking logs. Pre-existing logs passed to `onLogMessage` on subscribe
    // should have already been ignored by this point.
    this._trackingLogs = Promise.withResolvers();

    await this._session.runCode(REQUIREMENTS_QUERY_TXT);

    await this._trackingLogs.promise;

    unsubscribe();

    await this.save();
  };

  /**
   * Save the generated requirements to a file. Prompts the user with default
   * save location and file name.
   */
  save = async (): Promise<void> => {
    const activeUri = vscode.window.activeTextEditor?.document.uri;

    // For multi-root workspaces, attempt to derive the workspace folder based
    // on active editor
    let wkspFolder =
      activeUri == null
        ? null
        : vscode.workspace.workspaceFolders?.find(path =>
            activeUri?.fsPath.startsWith(path.uri.fsPath)
          );

    // Fallback to first workspace folder
    if (wkspFolder == null) {
      wkspFolder = vscode.workspace.workspaceFolders?.[0];
    }

    const defaultUri =
      wkspFolder == null
        ? vscode.Uri.file('requirements.txt')
        : vscode.Uri.joinPath(wkspFolder.uri, 'requirements.txt');

    const uri = await vscode.window.showSaveDialog({
      defaultUri,
      // eslint-disable-next-line @typescript-eslint/naming-convention
      filters: { Requirements: ['txt'] },
    });

    if (uri == null) {
      return;
    }

    const sorted = [
      ...this._requirements
        .entries()
        .map(([packageName, version]) => `${packageName}==${version}`),
    ].sort((a, b) => a.localeCompare(b));

    fs.writeFileSync(uri.fsPath, sorted.join('\n'));

    vscode.window.showTextDocument(uri);
  };
}
