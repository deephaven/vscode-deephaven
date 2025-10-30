/* eslint-disable @typescript-eslint/naming-convention */
import * as vscode from 'vscode';
import { beforeEach, describe, it, expect, vi } from 'vitest';
import { FilteredWorkspace, PYTHON_FILE_PATTERN } from './FilteredWorkspace';
import { getWorkspaceFileUriMap, Toaster, URIMap, URISet } from '../util';
import type {
  RemoteImportSourceTreeElement,
  RemoteImportSourceTreeFileElement,
  RemoteImportSourceTreeFolderElement,
} from '../types';

vi.mock('vscode');

vi.mock('../util/remoteFileSourceUtils', async () => {
  const actual = await vi.importActual('../util/remoteFileSourceUtils');
  return {
    ...actual,
    getWorkspaceFileUriMap: vi.fn(),
  };
});

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

    sub2_a: vscode.Uri.parse('file:///path/to/ws1/sub2/a'),
    sub2_a_file1: vscode.Uri.parse('file:///path/to/ws1/sub2/a/file1.py'),
  },
  folder2: {
    root: vscode.Uri.parse('file:///path/to/ws2'),

    sub1: vscode.Uri.parse('file:///path/to/ws2/sub1'),
    sub1_file1: vscode.Uri.parse('file:///path/to/ws2/sub1/file1.py'),
    sub1_file2: vscode.Uri.parse('file:///path/to/ws2/sub1/file2.py'),
  },
};

type FsElement =
  | RemoteImportSourceTreeFileElement
  | RemoteImportSourceTreeFolderElement;

// Utils for creating node data
const fileElement = element.bind(null, 'file');
const folderElement = element.bind(null, 'folder');
const wkspFolderElement = element.bind(null, 'workspaceRootFolder');
const topLevelMarkedFolderElement = element.bind(null, 'topLevelMarkedFolder');

function element(
  type: RemoteImportSourceTreeElement['type'],
  uri: vscode.Uri,
  overrides: Partial<FsElement> = {}
): RemoteImportSourceTreeElement {
  const name = uri.path.split('/').pop() ?? '';

  if (type === 'root') {
    return {
      name,
      type: 'root',
    };
  }

  if (type === 'topLevelMarkedFolder') {
    return {
      name,
      type: 'topLevelMarkedFolder',
      uri,
      isMarked: true,
    };
  }

  if (type === 'workspaceRootFolder') {
    return {
      name: overrides.name ?? name,
      type: 'workspaceRootFolder',
      uri,
    };
  }

  return {
    uri,
    name,
    type,
    isMarked: false,
    ...overrides,
  };
}

/** Sort an array of nodes */
function sortNodes(
  nodes: RemoteImportSourceTreeElement[]
): RemoteImportSourceTreeElement[] {
  return [...nodes].sort(
    (
      a: RemoteImportSourceTreeElement,
      b: RemoteImportSourceTreeElement
    ): number => {
      const pathA = 'uri' in a ? a.uri.path : '';
      const pathB = 'uri' in b ? b.uri.path : '';
      return pathA.localeCompare(pathB);
    }
  );
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
      mock.folder1.sub2_a_file1,
      mock.folder1.sub1_a_file1,
      mock.folder1.sub1_b_file1,
    ]),
  ],
  [
    mock.folder2.root,
    new URISet([mock.folder2.sub1_file1, mock.folder2.sub1_file2]),
  ],
]);

const mockToaster = { error: vi.fn(), info: vi.fn() } as Toaster;

const expected = {
  folder1: {
    allMarked: sortNodes([
      wkspFolderElement(mock.folder1.root, { name: 'Workspace1' }),

      folderElement(mock.folder1.sub1, { isMarked: true }),
      folderElement(mock.folder1.sub2, { isMarked: true }),

      fileElement(mock.folder1.sub1_file1, { isMarked: true }),
      fileElement(mock.folder1.sub1_file2, { isMarked: true }),

      folderElement(mock.folder1.sub1_a, { isMarked: true }),
      folderElement(mock.folder1.sub1_b, { isMarked: true }),

      fileElement(mock.folder1.sub2_file1, { isMarked: true }),
      folderElement(mock.folder1.sub2_a, { isMarked: true }),
      fileElement(mock.folder1.sub2_a_file1, { isMarked: true }),

      fileElement(mock.folder1.sub1_a_file1, { isMarked: true }),
      fileElement(mock.folder1.sub1_b_file1, { isMarked: true }),
    ]),
    allUnmarked: sortNodes([
      wkspFolderElement(mock.folder1.root, { name: 'Workspace1' }),

      folderElement(mock.folder1.sub1),
      folderElement(mock.folder1.sub2),

      fileElement(mock.folder1.sub1_file1),
      fileElement(mock.folder1.sub1_file2),

      folderElement(mock.folder1.sub1_a),
      folderElement(mock.folder1.sub1_b),

      fileElement(mock.folder1.sub2_file1),
      folderElement(mock.folder1.sub2_a),
      fileElement(mock.folder1.sub2_a_file1),

      fileElement(mock.folder1.sub1_a_file1),
      fileElement(mock.folder1.sub1_b_file1),
    ]),
    sub1Marked: sortNodes([
      wkspFolderElement(mock.folder1.root, { name: 'Workspace1' }),

      folderElement(mock.folder1.sub1, { isMarked: true }),
      fileElement(mock.folder1.sub1_file1, { isMarked: true }),
      fileElement(mock.folder1.sub1_file2, { isMarked: true }),
      folderElement(mock.folder1.sub1_a, { isMarked: true }),
      folderElement(mock.folder1.sub1_b, { isMarked: true }),
      fileElement(mock.folder1.sub1_a_file1, { isMarked: true }),
      fileElement(mock.folder1.sub1_b_file1, { isMarked: true }),

      folderElement(mock.folder1.sub2),
      fileElement(mock.folder1.sub2_file1),
      folderElement(mock.folder1.sub2_a),
      fileElement(mock.folder1.sub2_a_file1),
    ]),
    sub1aMarked: sortNodes([
      wkspFolderElement(mock.folder1.root, { name: 'Workspace1' }),

      folderElement(mock.folder1.sub1),
      fileElement(mock.folder1.sub1_file1),
      fileElement(mock.folder1.sub1_file2),

      folderElement(mock.folder1.sub1_a, { isMarked: true }),
      fileElement(mock.folder1.sub1_a_file1, { isMarked: true }),

      folderElement(mock.folder1.sub1_b),
      fileElement(mock.folder1.sub1_b_file1),

      folderElement(mock.folder1.sub2),
      fileElement(mock.folder1.sub2_file1),
      folderElement(mock.folder1.sub2_a),
      fileElement(mock.folder1.sub2_a_file1),
    ]),
    sub2aMarked: sortNodes([
      wkspFolderElement(mock.folder1.root, { name: 'Workspace1' }),

      folderElement(mock.folder1.sub1),
      fileElement(mock.folder1.sub1_file1),
      fileElement(mock.folder1.sub1_file2),

      folderElement(mock.folder1.sub1_a),
      fileElement(mock.folder1.sub1_a_file1),

      folderElement(mock.folder1.sub1_b),
      fileElement(mock.folder1.sub1_b_file1),

      folderElement(mock.folder1.sub2),
      fileElement(mock.folder1.sub2_file1),
      folderElement(mock.folder1.sub2_a, { isMarked: true }),
      fileElement(mock.folder1.sub2_a_file1, { isMarked: true }),
    ]),
  },
  folder2: {
    allUnmarked: sortNodes([
      wkspFolderElement(mock.folder2.root, { name: 'Workspace2' }),

      folderElement(mock.folder2.sub1),

      fileElement(mock.folder2.sub1_file1),
      fileElement(mock.folder2.sub1_file2),
    ]),
  },
} as const;

/**
 * Create a FilteredWorkspace instance with the given workspace map and a helper
 * `expectResult` function to check the current state of the workspace nodes.
 */
async function initWorkspace(wsMap: URIMap<URISet>): Promise<{
  expectResult(
    rootUri: vscode.Uri,
    expectedNodes: RemoteImportSourceTreeElement[],
    message?: string
  ): void;
  workspace: FilteredWorkspace;
}> {
  vi.mocked(getWorkspaceFileUriMap).mockResolvedValue(wsMap);

  // await since there is an async init step inside of the constructor. This
  // ensures if any errors are thrown they are caught by the test framework.
  const workspace = await new FilteredWorkspace(
    PYTHON_FILE_PATTERN,
    mockToaster
  );

  return {
    workspace,
    // Helper to check the current state of the workspace against expected nodes
    expectResult(
      rootUri: vscode.Uri,
      expectedNodes: FsElement[],
      message?: string
    ): void {
      const descendants = Array.from(workspace.iterateNodeTree(rootUri));
      expect(sortNodes(descendants), message).toEqual(sortNodes(expectedNodes));
    },
  };
}

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
  it('should create an instance', async () => {
    const { workspace } = await initWorkspace(mockEmptyWs);
    expect(workspace).toBeInstanceOf(FilteredWorkspace);
  });
});

describe('getTopLevelMarkedFolders', () => {
  it('should return an empty Set when workspace is empty', async () => {
    const { workspace } = await initWorkspace(mockEmptyWs);
    expect(workspace.getTopLevelMarkedFolders().length).toEqual(0);
  });

  it('should return an empty Set when no folders are marked', async () => {
    const { workspace } = await initWorkspace(mock2RootWs);
    expect(workspace.getTopLevelMarkedFolders().length).toEqual(0);
  });

  it.each([
    [mock.folder1.sub1_a, [topLevelMarkedFolderElement(mock.folder1.sub1_a)]],
    [mock.folder1.sub1, [topLevelMarkedFolderElement(mock.folder1.sub1)]],
  ])(
    'should return only top-level marked folder URIs: %s',
    async (markUri, expected) => {
      const { workspace } = await initWorkspace(mock2RootWs);

      workspace.markFolder(markUri);

      const topLevel = workspace.getTopLevelMarkedFolders();
      expect(topLevel).toEqual(expected);
    }
  );
});

describe('mark / unmark', () => {
  it.each([
    [mock.folder1.root, expected.folder1.allMarked],
    [mock.folder1.sub1, expected.folder1.sub1Marked],
    [mock.folder1.sub1_a, expected.folder1.sub1aMarked],
  ])(
    'should mark a folder and its children: %s',
    async (markRoot, expected) => {
      const { workspace, expectResult } = await initWorkspace(mock2RootWs);

      workspace.markFolder(markRoot);

      expectResult(mock.folder1.root, expected);
    }
  );

  it('should replace folder with conflicting module name', async () => {
    const { workspace, expectResult } = await initWorkspace(mock2RootWs);

    const moduleA = mock.folder1.sub1_a;
    const conflictingModuleA = mock.folder1.sub2_a;

    workspace.markFolder(moduleA);

    expectResult(
      mock.folder1.root,
      expected.folder1.sub1aMarked,
      'mark module a'
    );

    workspace.markFolder(moduleA);
    expect(mockToaster.error).not.toHaveBeenCalled();
    expectResult(
      mock.folder1.root,
      expected.folder1.sub1aMarked,
      'mark same module a again'
    );

    workspace.markFolder(conflictingModuleA);
    expect(mockToaster.info).toHaveBeenCalledWith(
      `Updated 'a' import source to 'sub2/a'.`
    );
    expectResult(
      mock.folder1.root,
      expected.folder1.sub2aMarked,
      'unmark conflicting module a'
    );
  });

  it('should mark parent folders based on children status', async () => {
    const { workspace, expectResult } = await initWorkspace(mock2RootWs);

    // Start with everything marked
    workspace.markFolder(mock.folder1.root);
    expectResult(
      mock.folder1.root,
      expected.folder1.allMarked,
      'everything marked'
    );

    // Unmarking sub2 should result in only sub1 being marked and root being mixed
    workspace.unmarkFolder(mock.folder1.sub2);
    expectResult(mock.folder1.root, expected.folder1.sub1Marked, 'unmark sub2');

    // Re-marking sub2 should result in everything being marked again
    workspace.markFolder(mock.folder1.sub2);
    expectResult(mock.folder1.root, expected.folder1.allMarked, 're-mark sub2');

    // Unmark all
    workspace.unmarkFolder(mock.folder1.root);
    expectResult(mock.folder1.root, expected.folder1.allUnmarked, 'unmark all');

    // Marking sub1_a should result in sub1 being mixed and root being mixed
    workspace.markFolder(mock.folder1.sub1_a);
    expectResult(
      mock.folder1.root,
      expected.folder1.sub1aMarked,
      'mark sub1_a'
    );
  });
});

describe('unmarkFolder', () => {
  it('should unmark a folder and its children', async () => {
    const { workspace, expectResult } = await initWorkspace(mock2RootWs);
    workspace.markFolder(mock.folder1.root);

    workspace.unmarkFolder(mock.folder1.sub2);

    // Unmarking sub2 should result in only sub1 being marked
    expectResult(mock.folder1.root, expected.folder1.sub1Marked);
  });
});

describe('unmarkConflictingTopLevelFolder', () => {
  it('should unmark conflicting top-level marked folders', async () => {
    const { workspace, expectResult } = await initWorkspace(mock2RootWs);

    const moduleA = mock.folder1.sub1_a;
    const conflictingModuleA = mock.folder1.sub2_a;

    workspace.markFolder(moduleA);

    expectResult(
      mock.folder1.root,
      expected.folder1.sub1aMarked,
      'mark module a'
    );

    workspace.unmarkConflictingTopLevelFolder(moduleA);
    expect(mockToaster.error).not.toHaveBeenCalled();
    expectResult(
      mock.folder1.root,
      expected.folder1.sub1aMarked,
      'unmark non-conclicting module a'
    );

    workspace.unmarkConflictingTopLevelFolder(conflictingModuleA);
    expect(mockToaster.info).toHaveBeenCalledWith(
      `Updated 'a' import source to 'sub2/a'.`
    );
    expectResult(
      mock.folder1.root,
      expected.folder1.allUnmarked,
      'unmark conflicting module a'
    );
  });
});

describe('refresh', () => {
  it('should refresh the workspace file URI map', async () => {
    const { workspace, expectResult } = await initWorkspace(mockEmptyWs);

    vi.mocked(getWorkspaceFileUriMap).mockResolvedValue(mock2RootWs);

    await workspace.refresh();

    const map = workspace.getWsFileUriMap();
    expect(map).toBe(mock2RootWs);

    expectResult(mock.folder1.root, expected.folder1.allUnmarked);
    expectResult(mock.folder2.root, expected.folder2.allUnmarked);
  });
});
