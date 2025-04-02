import * as vscode from 'vscode';
import { describe, it, expect, vi } from 'vitest';
import {
  deserializeRange,
  normalizeLanguageId,
  parseMarkdownCodeblocks,
  serializeRange,
} from './documentUtils';
import { mockDocument } from './testUtils';
import type { SerializedRange } from '../types';

vi.mock('vscode');

const markdownDocContent = [
  '```py',
  'from deephaven import time_table',
  '',
  'simple_ticking = time_table("PT2S")',
  '```',
  '',
  '```python',
  'from deephaven import time_table',
  '',
  'simple_ticking = time_table("PT2S")',
  '```',
  '',
  '## Groovy Example',
  '',
  '```groovy',
  'simple_ticking = timeTable("PT2S")',
  '```',
].join('\n');

describe('parseMarkdownCodeblocks', () => {
  it('should parse Deephaven code blocks from a Markdown document', () => {
    const codeBlocks = parseMarkdownCodeblocks(
      mockDocument('test.md', 1, markdownDocContent)
    );

    expect(codeBlocks).toMatchSnapshot();
  });
});

describe('normalizeLanguageId', () => {
  it.each([
    ['python', 'python'],
    ['py', 'python'],
    ['groovy', 'groovy'],
    ['other', 'other'],
  ])('should normalize languageId: %s->%s', (given, expected) => {
    const normalized = normalizeLanguageId(given);
    expect(normalized).toBe(expected);
  });
});

describe('deserializeRange', () => {
  it('should deserialize a SerializedRange object to a vscode.Range', () => {
    const serializedRange: SerializedRange = [
      { line: 1, character: 4 },
      { line: 3, character: 9 },
    ];

    const actual = deserializeRange(serializedRange);

    expect(actual).toEqual(
      new vscode.Range(
        serializedRange[0].line,
        serializedRange[0].character,
        serializedRange[1].line,
        serializedRange[1].character
      )
    );
  });
});

describe('serializeRange', () => {
  it('should serialize a vscode.Range object to a SerializedRange', () => {
    const range = new vscode.Range(1, 4, 3, 9);
    const actual = serializeRange(range);

    expect(actual).toEqual([
      { line: range.start.line, character: range.start.character },
      { line: range.end.line, character: range.end.character },
    ]);
  });
});
