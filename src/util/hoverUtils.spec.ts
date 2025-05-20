import * as vscode from 'vscode';
import { beforeEach, describe, it, expect, vi } from 'vitest';
import {
  getRunMarkdownCodeBlockMarkdown,
  getRunSelectedLinesMarkdown,
} from './hoverUtils';
import { mockDocument, mockT, mockUri } from '../crossModule/testUtils';
import type { CodeBlock } from '../types';
import { RUN_MARKDOWN_CODEBLOCK_CMD, RUN_SELECTION_COMMAND } from '../common';

vi.mock('vscode');

beforeEach(() => {
  vscode.window.activeTextEditor = undefined;
});

describe('getRunMarkdownCodeBlockMarkdown', () => {
  it('should return a MarkdownString with the correct command and arguments', () => {
    const uri = mockUri('file://testUri');

    const codeBlock: CodeBlock = {
      languageId: 'testLanguage',
      range: new vscode.Range(0, 0, 1, 10),
    };

    const expectedArgs = [
      uri,
      'testLanguage',
      [
        { line: 0, character: 0 },
        { line: 1, character: 10 },
      ],
    ];

    const expectedCmd = RUN_MARKDOWN_CODEBLOCK_CMD;
    const expectedQuery = encodeURIComponent(JSON.stringify(expectedArgs));
    const expected = `[$(run) Run Deephaven Block](command:${expectedCmd}?${expectedQuery})`;

    const actual = getRunMarkdownCodeBlockMarkdown(uri, codeBlock);

    expect(actual.value).toBe(expected);
  });
});

describe('getRunSelectedLinesMarkdown', () => {
  it('should return undefined if there is no active text editor', () => {
    const position = new vscode.Position(0, 0);
    const languageId = 'testLanguage';

    const actual = getRunSelectedLinesMarkdown(position, languageId);

    expect(actual).toBeUndefined();
  });

  it('should return undefined if position is not contained in the selection', () => {
    vscode.window.activeTextEditor = mockT<vscode.TextEditor>({
      document: mockDocument('testUri', 1, 'line1\nline2\nline3'),
      selections: [
        new vscode.Selection(
          new vscode.Position(2, 0),
          new vscode.Position(3, 0)
        ),
      ],
    });

    const position = new vscode.Position(0, 0);
    const languageId = 'testLanguage';

    const actual = getRunSelectedLinesMarkdown(position, languageId);

    expect(actual).toBeUndefined();
  });

  it('should return a MarkdownString with the correct command and arguments if position is contained in the selection', () => {
    const document = mockDocument('testUri', 1, 'line1\nline2\nline3');

    vscode.window.activeTextEditor = mockT<vscode.TextEditor>({
      document,
      selections: [
        new vscode.Selection(
          new vscode.Position(1, 0),
          new vscode.Position(2, 0)
        ),
      ],
    });

    const position = new vscode.Position(1, 0);
    const languageId = 'testLanguage';

    const expectedArgs = [document.uri, undefined, 'testLanguage'];
    const expectedCmd = RUN_SELECTION_COMMAND;
    const expectedQuery = encodeURIComponent(JSON.stringify(expectedArgs));
    const expected = `[$(run) Run Deephaven selected lines](command:${expectedCmd}?${expectedQuery})`;

    const actual = getRunSelectedLinesMarkdown(position, languageId);

    expect(actual?.value).toBe(expected);
  });
});
