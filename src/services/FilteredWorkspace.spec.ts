/* eslint-disable @typescript-eslint/naming-convention */
import * as vscode from 'vscode';
import { beforeEach, describe, it, expect, vi } from 'vitest';
import { FilteredWorkspace, PYTHON_FILE_PATTERN } from './FilteredWorkspace';
import { getWorkspaceFileUriMap, URIMap, URISet } from '../util';
import type { MarkableWsTreeNode } from '../types';

vi.mock('vscode');

vi.mock('../util/remoteFileSourceUtils');

const mock = {
  folder1: {
    root: vscode.Uri.parse('file:///path/to/ws1'),
    file0_1: vscode.Uri.parse('file:///path/to/ws1/file1.py'),

    sub1: vscode.Uri.parse('file:///path/to/ws1/sub1'),
    sub1_file1: vscode.Uri.parse('file:///path/to/ws1/sub1/file1.py'),
    sub1_file2: vscode.Uri.parse('file:///path/to/ws1/sub1/file2.py'),

    sub1_a: vscode.Uri.parse('file:///path/to/ws1/sub1/a'),
    sub1_a_file1: vscode.Uri.parse('file:///path/to/ws1/sub1/a/file1.py'),

    sub1_b: vscode.Uri.parse('file:///path/to/ws1/sub1/b'),
    sub1_b_file1: vscode.Uri.parse('file:///path/to/ws1/sub1/b/file1.py'),

    sub2: vscode.Uri.parse('file:///path/to/ws1/sub2'),
    sub2_file1: vscode.Uri.parse('file:///path/to/ws1/sub2/file1.py'),
  },
  folder2: {
    root: vscode.Uri.parse('file:///path/to/ws2'),

    sub1: vscode.Uri.parse('file:///path/to/ws2/sub1'),
    sub1_file1: vscode.Uri.parse('file:///path/to/ws2/sub1/file1.py'),
    sub1_file2: vscode.Uri.parse('file:///path/to/ws2/sub1/file2.py'),
  },
};

const fileNode = node.bind(null, true);
const folderNode = node.bind(null, false);
function node(
  isFile: boolean,
  uri: vscode.Uri,
  overrides: Partial<MarkableWsTreeNode> = {}
): MarkableWsTreeNode {
  return {
    uri,
    name: uri.path.split('/').pop() ?? '',
    isFile,
    status: 'unmarked',
    ...overrides,
  };
}

const mockEmptyWs = new URIMap<URISet>();

const mock2RootWs = new URIMap([
  [
    mock.folder1.root,
    new URISet([
      mock.folder1.file0_1,
      mock.folder1.sub1_file1,
      mock.folder1.sub1_file2,
      mock.folder1.sub2_file1,
      mock.folder1.sub1_a_file1,
      mock.folder1.sub1_b_file1,
    ]),
  ],
  [
    mock.folder2.root,
    new URISet([mock.folder2.sub1_file1, mock.folder2.sub1_file2]),
  ],
]);

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getWorkspaceFileUriMap).mockResolvedValue(mockEmptyWs);
  vi.mocked(vscode.workspace.asRelativePath).mockImplementation(uri => {
    const path = typeof uri === 'string' ? uri : uri.path;

    for (const prefix of [mock.folder1.root.path, mock.folder2.root.path]) {
      if (path.startsWith(prefix)) {
        return path.substring(prefix.length + 1);
      }
    }

    return path;
  });
  vi.mocked(vscode.workspace.getWorkspaceFolder).mockImplementation(uri => {
    if (
      uri.path !== mock.folder1.root.path &&
      uri.path !== mock.folder2.root.path
    ) {
      return undefined;
    }

    const index = uri.path === mock.folder1.root.path ? 0 : 1;

    return {
      uri,
      name: `Workspace${index + 1}`,
      index,
    };
  });
});

describe('constructor', () => {
  it('should create an instance', () => {
    const workspace = new FilteredWorkspace(PYTHON_FILE_PATTERN);
    expect(workspace).toBeInstanceOf(FilteredWorkspace);
  });
});

describe('refresh', () => {
  it('should refresh the workspace file URI map', async () => {
    const workspace = new FilteredWorkspace(PYTHON_FILE_PATTERN);

    vi.mocked(getWorkspaceFileUriMap).mockResolvedValue(mock2RootWs);

    await workspace.refresh();

    const map = workspace.getWsFileUriMap();
    expect(map).toBe(mock2RootWs);

    const folder1Children = Array.from(
      workspace.iterateNodeTree(mock.folder1.root)
    );
    expect(folder1Children).toEqual([
      folderNode(mock.folder1.root, { name: 'Workspace1' }),
      // mock.folder1.file0_1 is in the root, so should be ignored

      folderNode(mock.folder1.sub1),
      folderNode(mock.folder1.sub2),

      fileNode(mock.folder1.sub1_file1),
      fileNode(mock.folder1.sub1_file2),

      folderNode(mock.folder1.sub1_a),
      folderNode(mock.folder1.sub1_b),

      fileNode(mock.folder1.sub2_file1),

      fileNode(mock.folder1.sub1_a_file1),
      fileNode(mock.folder1.sub1_b_file1),
    ]);

    const folder2Children = Array.from(
      workspace.iterateNodeTree(mock.folder2.root)
    );
    expect(folder2Children).toEqual([
      folderNode(mock.folder2.root, { name: 'Workspace2' }),

      folderNode(mock.folder2.sub1),

      fileNode(mock.folder2.sub1_file1),
      fileNode(mock.folder2.sub1_file2),
    ]);
  });
});
