import * as vscode from 'vscode';
import type { CodeBlock, SerializedPoint, SerializedRange } from '../types';

const CODE_BLOCK_STARTS = /^```(py|python|groovy)(\s|$)/;
const CODE_BLOCK_END = '```';

/**
 * Determine if given object is a SerializedPoint.
 * @param maybePoint The object to check
 * @returns True if point is a SerializedPoint
 */
export function isSerializedPoint(maybePoint: {
  line?: number;
  character?: number;
}): maybePoint is SerializedPoint {
  return (
    typeof maybePoint.line === 'number' &&
    typeof maybePoint.character === 'number'
  );
}

/**
 * Determine if given object is a SerializedRange.
 * @param maybeRange The object to check
 * @returns True if range is a SerializedRange
 */
export function isSerializedRange(
  maybeRange: unknown
): maybeRange is SerializedRange {
  return (
    Array.isArray(maybeRange) &&
    maybeRange.length === 2 &&
    maybeRange.every(isSerializedPoint)
  );
}

/**
 * Parse code blocks from a Markdown document that can be run by Deephaven.
 * @param document The document to parse code blocks from.
 * @returns Code blocks that can be run by Deephaven.
 */
export function parseMarkdownCodeblocks(
  document: vscode.TextDocument
): CodeBlock[] {
  const lines = document.getText().split('\n');

  const codeBlocks: CodeBlock[] = [];
  let startPos: vscode.Position | null = null;
  let languageId = '';

  // Create ranges for each code block in the document
  for (let i = 0; i < lines.length; ++i) {
    const trimmedLine = lines[i].trim();

    // Start of Deephaven supported code block
    const parsedLanguageId = CODE_BLOCK_STARTS.exec(trimmedLine)?.[1] ?? '';
    if (parsedLanguageId !== '') {
      languageId = normalizeLanguageId(parsedLanguageId);
      startPos = new vscode.Position(i + 1, 0);
    }
    // End of Deephaven code block
    else if (trimmedLine === CODE_BLOCK_END && startPos) {
      codeBlocks.push({
        languageId,
        range: new vscode.Range(
          startPos,
          new vscode.Position(i - 1, lines[i - 1].length)
        ),
      });
      startPos = null;
    }
  }

  return codeBlocks;
}

/**
 * Deephaven supports 'python' and 'groovy', but Markdown supports some aliases
 * such as `py` for `python`. Normalize the language ID to a DH supported one.
 * @param languageId Language ID to normalize
 * @returns Normalized language ID
 */
export function normalizeLanguageId(languageId: string): string {
  if (languageId === 'py') {
    return 'python';
  }

  return languageId;
}

/**
 * Deserialize a given `SerializedRange` object to a `vscode.Range`
 * @param serializedRange `SerializedRange` object to deserialize
 * @returns Deserialized `vscode.Range`
 */
export function deserializeRange(
  serializedRange: SerializedRange
): vscode.Range {
  return new vscode.Range(
    serializedRange[0].line,
    serializedRange[0].character,
    serializedRange[1].line,
    serializedRange[1].character
  );
}

/**
 * Serialize a given `vscode.Range` to a `SerializedRange` object.
 * @param range Range to serialize
 * @returns `SerializedRange` object
 */
export function serializeRange(range: vscode.Range): SerializedRange {
  return [
    { line: range.start.line, character: range.start.character },
    { line: range.end.line, character: range.end.character },
  ];
}
