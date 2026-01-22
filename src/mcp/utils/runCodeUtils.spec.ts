import * as vscode from 'vscode';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { dh as DhcType } from '@deephaven/jsapi-types';
import {
  createConnectionNotFoundHint,
  createPythonModuleImportErrorHint,
  extractVariables,
  formatDiagnosticError,
  getDiagnosticsErrors,
  type DiagnosticsError,
} from './runCodeUtils';
import type {
  ConnectionState,
  IServerManager,
  RemoteImportSourceTreeFileElement,
  RemoteImportSourceTreeFolderElement,
} from '../../types';
import type {
  FilteredWorkspace,
  FilteredWorkspaceNode,
  FilteredWorkspaceRootNode,
} from '../../services';
import { getConnectionsForConsoleType } from '../../services/consoleTypeUtils';
import { isInstanceOf, URIMap } from '../../util';

vi.mock('vscode');
vi.mock('../../services/consoleTypeUtils', () => ({
  getConnectionsForConsoleType: vi.fn(),
}));
vi.mock('../../util/isInstanceOf', async () => {
  const actual = await vi.importActual('../../util/isInstanceOf');
  return {
    ...actual,
    isInstanceOf: vi.fn(),
  };
});

const MOCK_URI_STRING = 'file:///path/to/file.py';
const MOCK_CONNECTION_URL = 'http://localhost:10000';

const DIAGNOSTIC_ERRORS_WITHOUT_MODULE_IMPORT: DiagnosticsError[] = [
  {
    uri: MOCK_URI_STRING,
    message: "name 'x' is not defined",
    range: new vscode.Range(0, 0, 0, 1),
  },
];

const DIAGNOSTIC_ERRORS_WITH_MODULE_IMPORT: DiagnosticsError[] = [
  {
    uri: MOCK_URI_STRING,
    message: "name 'undefined_var' is not defined",
    range: new vscode.Range(5, 0, 5, 13),
  },
  {
    uri: MOCK_URI_STRING,
    message: "No module named 'pandas'",
    range: new vscode.Range(1, 0, 1, 13),
  },
];

const DIAGNOSTIC_ERRORS_WITH_MULTIPLE_MODULE_IMPORTS: DiagnosticsError[] = [
  {
    uri: MOCK_URI_STRING,
    message: "No module named 'pandas'",
    range: new vscode.Range(1, 0, 1, 13),
  },
  {
    uri: MOCK_URI_STRING,
    message: "No module named 'numpy'",
    range: new vscode.Range(2, 0, 2, 13),
  },
];

function createDiagnosticCollection(
  name: string,
  entries: ReadonlyArray<[vscode.Uri, readonly vscode.Diagnostic[]]>
): vscode.DiagnosticCollection {
  const collection = vscode.languages.createDiagnosticCollection(name);
  collection.set(entries);
  return collection;
}

/**
 * Creates a mock FilteredWorkspace for testing with support for multiple root nodes.
 * Each workspace argument represents a root node and its children.
 *
 * @param workspaces - Rest parameter where each array contains [root, ...children].
 *   The first element is the root node, remaining elements are its children.
 * @returns A mocked FilteredWorkspace with:
 *   - getChildNodes: Returns roots when parentUri is null, empty array otherwise
 *   - iterateNodeTree: Returns children for the matching root, empty array if not found
 */
function createPythonWorkspace(
  ...workspaces: Array<(FilteredWorkspaceRootNode | FilteredWorkspaceNode)[]>
): FilteredWorkspace {
  const roots = workspaces.map(nodes => nodes[0] as FilteredWorkspaceRootNode);

  const nodeMap = new URIMap(
    workspaces.map(([root, ...nodes]) => [root.uri, nodes])
  );

  const workspace: FilteredWorkspace = {
    getChildNodes: vi.fn(),
    iterateNodeTree: vi.fn(),
  } as unknown as FilteredWorkspace;

  vi.mocked(workspace.getChildNodes).mockImplementation(
    (parentUri: vscode.Uri | null) => (parentUri == null ? roots : [])
  );
  vi.mocked(workspace.iterateNodeTree).mockImplementation(
    (rootUri: vscode.Uri) => nodeMap.get(rootUri) ?? []
  );

  return workspace;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('getDiagnosticsErrors', () => {
  const uri = vscode.Uri.file('/test.py');
  const uri1 = vscode.Uri.file('/file1.py');
  const uri2 = vscode.Uri.file('/file2.py');

  const DIAGNOSTICS_WITH_MIXED_SEVERITIES = createDiagnosticCollection('test', [
    [
      uri,
      [
        new vscode.Diagnostic(
          new vscode.Range(0, 0, 0, 10),
          'Error message',
          vscode.DiagnosticSeverity.Error
        ),
        new vscode.Diagnostic(
          new vscode.Range(1, 0, 1, 10),
          'Warning message',
          vscode.DiagnosticSeverity.Warning
        ),
        new vscode.Diagnostic(
          new vscode.Range(2, 0, 2, 10),
          'Info message',
          vscode.DiagnosticSeverity.Information
        ),
        new vscode.Diagnostic(
          new vscode.Range(3, 0, 3, 10),
          'Another error',
          vscode.DiagnosticSeverity.Error
        ),
      ],
    ],
  ]);

  const DIAGNOSTICS_WITH_ONLY_WARNINGS = createDiagnosticCollection('test', [
    [
      uri,
      [
        new vscode.Diagnostic(
          new vscode.Range(0, 0, 0, 10),
          'Warning',
          vscode.DiagnosticSeverity.Warning
        ),
      ],
    ],
  ]);

  const DIAGNOSTICS_WITH_MULTIPLE_FILES = createDiagnosticCollection('test', [
    [
      uri1,
      [
        new vscode.Diagnostic(
          new vscode.Range(0, 0, 0, 10),
          'Error in file1',
          vscode.DiagnosticSeverity.Error
        ),
      ],
    ],
    [
      uri2,
      [
        new vscode.Diagnostic(
          new vscode.Range(5, 0, 5, 10),
          'Error in file2',
          vscode.DiagnosticSeverity.Error
        ),
      ],
    ],
  ]);

  it.each([
    {
      name: 'extract error-level diagnostics only',
      collection: DIAGNOSTICS_WITH_MIXED_SEVERITIES,
      expected: [
        {
          uri: uri.toString(),
          message: 'Error message',
          range: new vscode.Range(0, 0, 0, 10),
        },
        {
          uri: uri.toString(),
          message: 'Another error',
          range: new vscode.Range(3, 0, 3, 10),
        },
      ],
    },
    {
      name: 'return empty array when no errors exist',
      collection: DIAGNOSTICS_WITH_ONLY_WARNINGS,
      expected: [],
    },
    {
      name: 'handle multiple files with diagnostics',
      collection: DIAGNOSTICS_WITH_MULTIPLE_FILES,
      expected: [
        {
          uri: uri1.toString(),
          message: 'Error in file1',
          range: new vscode.Range(0, 0, 0, 10),
        },
        {
          uri: uri2.toString(),
          message: 'Error in file2',
          range: new vscode.Range(5, 0, 5, 10),
        },
      ],
    },
  ])('should $name', ({ collection, expected }) => {
    const errors = getDiagnosticsErrors(collection);

    expect(errors).toEqual(expected);
  });
});

describe('formatDiagnosticError', () => {
  it('should format diagnostic error with URI, message, and range', () => {
    const error: DiagnosticsError = {
      uri: MOCK_URI_STRING,
      message: "name 'x' is not defined",
      range: new vscode.Range(10, 5, 10, 18),
    };

    const formatted = formatDiagnosticError(error);

    expect(formatted).toBe(
      `${MOCK_URI_STRING}: name 'x' is not defined [10:5]`
    );
  });
});

describe('extractVariables', () => {
  it.each([
    {
      name: 'extract created variables with isNew=true',
      changes: {
        created: [
          { id: 'x', title: 'x', type: 'int' },
          { id: 'y', title: 'Y Variable', type: 'str' },
        ],
        updated: [],
      },
      expected: [
        { id: 'x', title: 'x', type: 'int', isNew: true },
        { id: 'y', title: 'Y Variable', type: 'str', isNew: true },
      ],
    },
    {
      name: 'extract updated variables with isNew=false',
      changes: {
        created: [],
        updated: [
          { id: 'x', title: 'x', type: 'int' },
          { id: 'y', title: null, type: 'str' },
        ],
      },
      expected: [
        { id: 'x', title: 'x', type: 'int', isNew: false },
        { id: 'y', title: 'y', type: 'str', isNew: false },
      ],
    },
    {
      name: 'use id as title when title is null',
      changes: {
        created: [{ id: 'my_var', title: null, type: 'float' }],
        updated: [],
      },
      expected: [{ id: 'my_var', title: 'my_var', type: 'float', isNew: true }],
    },
    {
      name: 'combine created and updated variables',
      changes: {
        created: [{ id: 'a', title: 'a', type: 'int' }],
        updated: [{ id: 'b', title: 'b', type: 'str' }],
      },
      expected: [
        { id: 'a', title: 'a', type: 'int', isNew: true },
        { id: 'b', title: 'b', type: 'str', isNew: false },
      ],
    },
    {
      name: 'return empty array when result is null',
      changes: null,
      expected: [],
    },
    {
      name: 'return empty array when result is undefined',
      changes: undefined,
      expected: [],
    },
    {
      name: 'return empty array when no variables changed',
      changes: {
        created: [],
        updated: [],
      },
      expected: [],
    },
  ])('should $name', ({ changes, expected }) => {
    const cmdResult =
      changes == null
        ? undefined
        : ({ changes } as unknown as DhcType.ide.CommandResult);

    const variables = extractVariables(cmdResult);

    expect(variables).toEqual(expected);
  });
});

describe('createConnectionNotFoundHint', () => {
  const serverManager = {
    getConnections: vi.fn(),
  } as unknown as IServerManager;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    {
      name: 'suggest available connections when they exist',
      availableConnections: [
        { serverUrl: new URL('http://localhost:10000') },
        { serverUrl: new URL('http://localhost:10001') },
      ] as ConnectionState[],
      expected: `Connection for URL ${MOCK_CONNECTION_URL} not found. Did you mean to use one of these connections?\n- http://localhost:10000/\n- http://localhost:10001/`,
    },
    {
      name: 'indicate no available connections when none exist',
      availableConnections: [],
      expected: 'No available connections supporting languageId python.',
    },
  ])('should $name', async ({ availableConnections, expected }) => {
    vi.mocked(getConnectionsForConsoleType).mockResolvedValue(
      availableConnections
    );

    const hint = await createConnectionNotFoundHint(
      serverManager,
      MOCK_CONNECTION_URL,
      'python'
    );

    expect(hint).toBe(expected);
  });
});

describe('createPythonModuleImportErrorHint', () => {
  const wkspRoot: RemoteImportSourceTreeFolderElement = {
    uri: vscode.Uri.file('/workspace'),
    name: 'workspace',
    type: 'folder',
    isMarked: false,
  };

  const pandasFolder: RemoteImportSourceTreeFolderElement = {
    uri: vscode.Uri.file('/workspace/pandas'),
    name: 'pandas',
    type: 'folder',
    isMarked: false,
  };

  const pandasFile: RemoteImportSourceTreeFileElement = {
    uri: vscode.Uri.file('/workspace/pandas.py'),
    name: 'pandas',
    type: 'file',
    isMarked: false,
  };

  const numpyFolder: RemoteImportSourceTreeFolderElement = {
    uri: vscode.Uri.file('/workspace/numpy'),
    name: 'numpy',
    type: 'folder',
    isMarked: false,
  };

  const wksp2Root: RemoteImportSourceTreeFolderElement = {
    uri: vscode.Uri.file('/workspace2'),
    name: 'workspace2',
    type: 'folder',
    isMarked: false,
  };

  const scipyFolder: RemoteImportSourceTreeFolderElement = {
    uri: vscode.Uri.file('/workspace2/scipy'),
    name: 'scipy',
    type: 'folder',
    isMarked: false,
  };

  it.each([
    {
      name: 'return undefined when no import errors exist',
      errors: DIAGNOSTIC_ERRORS_WITHOUT_MODULE_IMPORT,
      hasPlugin: false,
      workspaces: [[wkspRoot, pandasFolder]],
      expected: undefined,
    },
    {
      name: 'return undefined when no import errors exist even with plugin',
      errors: DIAGNOSTIC_ERRORS_WITHOUT_MODULE_IMPORT,
      hasPlugin: true,
      workspaces: [[wkspRoot, pandasFolder]],
      expected: undefined,
    },
    {
      name: 'suggest installing plugin when not installed',
      errors: DIAGNOSTIC_ERRORS_WITH_MODULE_IMPORT,
      hasPlugin: false,
      workspaces: [[wkspRoot, pandasFolder]],
      expected: `The Python remote file source plugin is not installed. Install it with 'pip install deephaven-plugin-python-remote-file-source' to enable importing workspace packages.`,
    },
    {
      name: 'suggest workspace folders when plugin is installed and folders exist',
      errors: DIAGNOSTIC_ERRORS_WITH_MODULE_IMPORT,
      hasPlugin: true,
      workspaces: [[wkspRoot, pandasFolder]],
      expected: `If this is a package in your workspace, try adding its folder as a remote file source.\n- ${vscode.Uri.file('/workspace/pandas').toString()}`,
    },
    {
      name: 'handle multiple import errors and find matching folders',
      errors: DIAGNOSTIC_ERRORS_WITH_MULTIPLE_MODULE_IMPORTS,
      hasPlugin: true,
      workspaces: [[wkspRoot, pandasFolder, numpyFolder]],
      expected: `If this is a package in your workspace, try adding its folder as a remote file source.\n- ${pandasFolder.uri.toString()}\n- ${numpyFolder.uri.toString()}`,
    },
    {
      name: 'not include file nodes, only folders',
      errors: DIAGNOSTIC_ERRORS_WITH_MODULE_IMPORT,
      hasPlugin: true,
      workspaces: [[wkspRoot, pandasFile]],
      expected:
        'If this is a package in your workspace, try adding its folder as a remote file source.',
    },
    {
      name: 'handle multiple root nodes with matching folders',
      errors: DIAGNOSTIC_ERRORS_WITH_MULTIPLE_MODULE_IMPORTS,
      hasPlugin: true,
      workspaces: [
        [wkspRoot, pandasFolder],
        [wksp2Root, scipyFolder],
      ],
      expected: `If this is a package in your workspace, try adding its folder as a remote file source.\n- ${pandasFolder.uri.toString()}\n- ${scipyFolder.uri.toString()}`,
    },
  ])('should $name', async ({ errors, hasPlugin, workspaces, expected }) => {
    const pythonWorkspace = createPythonWorkspace(...workspaces);

    vi.mocked(isInstanceOf).mockReturnValue(hasPlugin);

    const connection = {} as ConnectionState;
    const hint = createPythonModuleImportErrorHint(
      errors,
      connection,
      pythonWorkspace
    );

    expect(hint).toBe(expected);
  });
});
