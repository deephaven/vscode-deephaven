import * as vscode from 'vscode';
import { expandRangeToFullLines } from './selectionUtils';
import {
  ICON_ID,
  RUN_MARKDOWN_CODEBLOCK_CMD,
  RUN_SELECTION_COMMAND,
  type RunMarkdownCodeblockCmdArgs,
  type RunSelectionCmdArgs,
} from '../common';
import type { CodeBlock } from '../types';
import { serializeRange } from './documentUtils';

/**
 * Get markdown string for running a Deephaven code block in a Markdown file.
 * @param uri Editor uri containing the code block
 * @param codeBlock Code block to run
 * @returns Markdown string
 */
export function getRunMarkdownCodeBlockMarkdown(
  uri: vscode.Uri,
  codeBlock: CodeBlock
): vscode.MarkdownString {
  const { languageId, range } = codeBlock;

  const args: RunMarkdownCodeblockCmdArgs = [
    uri,
    languageId,
    serializeRange(range),
  ];

  const argsEncoded = encodeURIComponent(JSON.stringify(args));

  const mdValue = `[$(${ICON_ID.runSelection}) Run Deephaven Block](command:${RUN_MARKDOWN_CODEBLOCK_CMD}?${argsEncoded})`;

  const mdString = new vscode.MarkdownString(mdValue, true);

  mdString.isTrusted = {
    enabledCommands: [RUN_MARKDOWN_CODEBLOCK_CMD],
  };

  return mdString;
}

/**
 * Get markdown string for running selected lines in a Deephaven file if a
 * given position overlaps the current selection.
 * @param position Position to check
 * @param languageId Language ID of the file
 * @returns Markdown string
 */
export function getRunSelectedLinesMarkdown(
  position: vscode.Position,
  languageId: string
): vscode.MarkdownString | undefined {
  const editor = vscode.window.activeTextEditor;

  if (editor == null) {
    return;
  }

  // Determine if hover is over a selected line
  const isOverSelection = editor.selections.some(selection =>
    expandRangeToFullLines(editor.document)(selection).contains(position)
  );

  if (!isOverSelection) {
    return;
  }

  const args: RunSelectionCmdArgs = [
    editor.document.uri,
    undefined,
    languageId,
  ];
  const argsEncoded = encodeURIComponent(JSON.stringify(args));

  const mdValue = `[$(${ICON_ID.runSelection}) Run Deephaven selected lines](command:${RUN_SELECTION_COMMAND}?${argsEncoded})`;

  const mdString = new vscode.MarkdownString(mdValue, true);

  mdString.isTrusted = {
    enabledCommands: [RUN_SELECTION_COMMAND],
  };

  return mdString;
}
