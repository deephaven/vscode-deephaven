import * as vscode from 'vscode';

/**
 * Ensures a file exists and returns its content. If the file doesn't exist,
 * creates it with the provided default content.
 * @param fileUri The URI of the file
 * @param defaultContent The default content to write if the file doesn't exist
 * @returns The content of the file as a string
 */
export async function getEnsuredContent(
  fileUri: vscode.Uri,
  defaultContent: string
): Promise<string> {
  try {
    await vscode.workspace.fs.stat(fileUri);
  } catch {
    // Create it with default content
    const dir = vscode.Uri.joinPath(fileUri, '..');
    await vscode.workspace.fs.createDirectory(dir);
    await vscode.workspace.fs.writeFile(fileUri, Buffer.from(defaultContent));
  }

  const content = await vscode.workspace.fs.readFile(fileUri);
  return content.toString();
}
