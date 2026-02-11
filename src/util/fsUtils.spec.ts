import * as vscode from 'vscode';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getEnsuredContent } from './fsUtils';

// See __mocks__/vscode.ts for the mock implementation
vi.mock('vscode');

beforeEach(() => {
  vi.clearAllMocks();
});

describe('getEnsuredContent', () => {
  const mockUri = vscode.Uri.file('/mock/path/to/file.txt');
  const mockDirUri = vscode.Uri.file('/mock/path/to');
  const existingContent = 'existing file content';
  const defaultContent = 'default content';

  it('should return existing content if file exists', async () => {
    vi.mocked(vscode.workspace.fs.stat).mockResolvedValue(
      {} as vscode.FileStat
    );
    vi.mocked(vscode.workspace.fs.readFile).mockResolvedValue(
      Buffer.from(existingContent)
    );

    const result = await getEnsuredContent(mockUri, defaultContent);

    expect(result).toBe(existingContent);
    expect(vscode.workspace.fs.stat).toHaveBeenCalledWith(mockUri);
    expect(vscode.workspace.fs.readFile).toHaveBeenCalledWith(mockUri);
    expect(vscode.workspace.fs.createDirectory).not.toHaveBeenCalled();
    expect(vscode.workspace.fs.writeFile).not.toHaveBeenCalled();
  });

  it.each([
    {
      description:
        'should create file with default content if file does not exist',
      content: defaultContent,
    },
    {
      description: 'should handle empty default content',
      content: '',
    },
    {
      description: 'should handle multiline content',
      content: 'line1\nline2\nline3',
    },
  ])('$description', async ({ content }) => {
    vi.mocked(vscode.workspace.fs.stat).mockRejectedValue(
      new Error('File not found')
    );
    vi.mocked(vscode.workspace.fs.readFile).mockResolvedValue(
      Buffer.from(content)
    );
    vi.mocked(vscode.Uri.joinPath).mockReturnValue(mockDirUri);

    const result = await getEnsuredContent(mockUri, content);

    expect(result).toBe(content);
    expect(vscode.workspace.fs.stat).toHaveBeenCalledWith(mockUri);
    expect(vscode.Uri.joinPath).toHaveBeenCalledWith(mockUri, '..');
    expect(vscode.workspace.fs.createDirectory).toHaveBeenCalledWith(
      mockDirUri
    );
    expect(vscode.workspace.fs.writeFile).toHaveBeenCalledWith(
      mockUri,
      Buffer.from(content)
    );
    expect(vscode.workspace.fs.readFile).toHaveBeenCalledWith(mockUri);
  });
});
