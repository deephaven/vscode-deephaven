import { describe, it, expect, vi } from 'vitest';
import * as vscode from 'vscode';
import {
  expandRangeToFullLines,
  getCombinedRangeLinesText,
  trimIndentation,
} from './selectionUtils';

vi.mock('vscode');

describe('expandRangeToFullLines', () => {
  const mockDocument = (lines: string[]): vscode.TextDocument => {
    return {
      lineAt: (line: number) => ({ text: lines[line] }),
    } as unknown as vscode.TextDocument;
  };

  it.each([
    {
      description:
        'should expand a range that starts and ends in the middle of lines',
      lines: ['line 1', 'line 2', 'line 3'],
      range: new vscode.Range(0, 2, 1, 3),
      expected: new vscode.Range(0, 0, 1, 6),
    },
    {
      description: 'should expand a range that already includes full lines',
      lines: ['line 1', 'line 2', 'line 3'],
      range: new vscode.Range(0, 0, 1, 6),
      expected: new vscode.Range(0, 0, 1, 6),
    },
    {
      description: 'should expand a single-line range to include the full line',
      lines: ['line 1', 'line 2', 'line 3'],
      range: new vscode.Range(1, 2, 1, 4),
      expected: new vscode.Range(1, 0, 1, 6),
    },
    {
      description: 'should handle a range that spans multiple lines',
      lines: ['line 1', 'line 2', 'line 3', 'line 4'],
      range: new vscode.Range(1, 2, 3, 4),
      expected: new vscode.Range(1, 0, 3, 6),
    },
    {
      description: 'should handle an empty range',
      lines: ['line 1', 'line 2', 'line 3'],
      range: new vscode.Range(1, 0, 1, 0),
      expected: new vscode.Range(1, 0, 1, 6),
    },
    {
      description:
        'should handle a range that starts and ends on the same line',
      lines: ['line 1', 'line 2', 'line 3'],
      range: new vscode.Range(2, 1, 2, 3),
      expected: new vscode.Range(2, 0, 2, 6),
    },
  ])('$description', ({ lines, range, expected }) => {
    const document = mockDocument(lines);
    const expandRange = expandRangeToFullLines(document);
    const result = expandRange(range);
    expect(result).toEqual(expected);
  });
});

describe('getCombinedRangeLinesText', () => {
  const mockDocument = (lines: string[]): vscode.TextDocument => {
    return {
      lineAt: (line: number) => ({ text: lines[line] }),
      getText: (range: vscode.Range) => {
        const startLine = range.start.line;
        const endLine = range.end.line;
        return lines.slice(startLine, endLine + 1).join('\n');
      },
    } as unknown as vscode.TextDocument;
  };

  it.each([
    {
      description: 'should return combined text from a single range',
      lines: ['line 1', 'line 2', 'line 3'],
      ranges: [new vscode.Range(0, 0, 1, 5)],
      expected: 'line 1\nline 2',
    },
    {
      description: 'should normalize leading whitespace',
      lines: ['    line 1', '    line 2', '    line 3'],
      ranges: [new vscode.Range(0, 0, 2, 5)],
      expected: 'line 1\nline 2\nline 3',
    },
    {
      description: 'should handle multiple ranges',
      lines: ['line 1', 'line 2', 'line 3', 'line 4'],
      ranges: [new vscode.Range(0, 0, 0, 5), new vscode.Range(2, 0, 3, 5)],
      expected: 'line 1\nline 3\nline 4',
    },
    {
      description: 'should normalize leading whitespace for multiple ranges',
      lines: ['  line 1', '  line 2', '    line 3', '    line 4'],
      ranges: [new vscode.Range(0, 0, 0, 5), new vscode.Range(2, 0, 3, 5)],
      expected: 'line 1\nline 3\nline 4',
    },
    {
      description: 'should handle ranges with no leading whitespace',
      lines: ['line 1', 'line 2', 'line 3'],
      ranges: [new vscode.Range(0, 0, 2, 5)],
      expected: 'line 1\nline 2\nline 3',
    },
    {
      description: 'should handle empty ranges',
      lines: ['line 1', 'line 2', 'line 3'],
      ranges: [],
      expected: '',
    },
    {
      description: 'should expand to full lines',
      lines: ['line 1', 'line 2', 'line 3'],
      ranges: [new vscode.Range(0, 2, 1, 2)],
      expected: 'line 1\nline 2',
    },
    {
      description: 'should only replace exact whitespace',
      lines: ['    line 1', '\tline 2', '  line 3'],
      ranges: [new vscode.Range(0, 0, 2, 5)],
      expected: 'line 1\n\tline 2\n  line 3',
    },
  ])('$description', ({ lines, ranges, expected }) => {
    const document = mockDocument(lines);
    const result = getCombinedRangeLinesText(document, ranges);
    expect(result).toBe(expected);
  });
});

describe('trimIndentation', () => {
  it.each([
    {
      description: 'should remove leading spaces based on the first line',
      input: ['    line 1', '    line 2', '    line 3'].join('\n'),
      expected: ['line 1', 'line 2', 'line 3'].join('\n'),
    },
    {
      description: 'should remove leading tabs based on the first line',
      input: ['\tline 1', '\t\tline 2', '\t\tline 3'].join('\n'),
      expected: ['line 1', '\tline 2', '\tline 3'].join('\n'),
    },
    {
      description: 'should handle text with no leading indentation',
      input: ['line 1', 'line 2', 'line 3'].join('\n'),
      expected: ['line 1', 'line 2', 'line 3'].join('\n'),
    },
    {
      description: 'should only replace exact indentation',
      input: ['    line 1', '  line 2', '      line 3'].join('\n'),
      expected: ['line 1', '  line 2', '      line 3'].join('\n'),
    },
    {
      description: 'should handle single-line text',
      input: ['    line 1'].join('\n'),
      expected: ['line 1'].join('\n'),
    },
    {
      description: 'should handle empty input',
      input: [''].join('\n'),
      expected: [''].join('\n'),
    },
    {
      description: 'should handle text with only whitespace',
      input: ['    '].join('\n'),
      expected: [''].join('\n'),
    },
    {
      description: 'should handle text with leading and trailing whitespace',
      input: ['    line 1    ', '    line 2    ', '    line 3    '].join('\n'),
      expected: ['line 1    ', 'line 2    ', 'line 3    '].join('\n'),
    },
  ])('$description', ({ input, expected }) => {
    expect(trimIndentation(input)).toBe(expected);
  });
});
