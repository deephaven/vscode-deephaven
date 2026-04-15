import * as vscode from 'vscode';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { dh as DhcType } from '@deephaven/jsapi-types';
import {
  createConnectionNotFoundHint,
  createGroovyImportErrorHint,
  createPythonModuleImportErrorHint,
  extractVariables,
  formatDiagnosticError,
  getDiagnosticsErrors,
  type DiagnosticsError,
} from './runCodeUtils';
import type {
  ConnectionState,
  GroovyPackageName,
  IServerManager,
  PythonModuleFullname,
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
/**
 * Creates a mock FilteredWorkspace<GroovyPackageName> for testing.
 * Each workspace argument represents a root node and its descendants.
 *
 * @param workspaces - Rest parameter where each element is:
 *   - nodes: Array of [root, ...allDescendants] for iterateNodeTree
 *   - nodeChildren: Optional map of folder URI strings to their direct children
 *     (used for getChildNodes(uri) calls during subpackage verification)
 * @returns A mocked FilteredWorkspace with:
 *   - getChildNodes: Returns roots when parentUri is null, returns nodeChildren
 *     entries when parentUri matches a key, otherwise empty array
 *   - iterateNodeTree: Returns all nodes for the matching root
 */
function mockFilteredWorkspace<
  TModuleName extends PythonModuleFullname | GroovyPackageName,
>(
  ...workspaces: Array<{
    nodes: (FilteredWorkspaceRootNode | FilteredWorkspaceNode)[];
    nodeChildren?: [vscode.Uri, FilteredWorkspaceNode[]][];
  }>
): FilteredWorkspace<TModuleName> {
  const roots = workspaces.map(ws => ws.nodes[0] as FilteredWorkspaceRootNode);

  const nodeMap = new URIMap(workspaces.map(ws => [ws.nodes[0].uri, ws.nodes]));

  const childMap = new URIMap(workspaces.flatMap(ws => ws.nodeChildren ?? []));

  const workspace: FilteredWorkspace<TModuleName> = {
    getChildNodes: vi.fn(),
    iterateNodeTree: vi.fn(),
  } as unknown as FilteredWorkspace<TModuleName>;

  vi.mocked(workspace.getChildNodes).mockImplementation(
    (parentUri: vscode.Uri | null) => {
      if (parentUri == null) {
        return roots;
      }
      return childMap.get(parentUri) ?? [];
    }
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
  const uri = vscode.Uri.parse('file:///test.py');
  const uri1 = vscode.Uri.parse('file:///file1.py');
  const uri2 = vscode.Uri.parse('file:///file2.py');

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
        { id: 'x', name: undefined, title: 'x', type: 'int', isNew: true },
        {
          id: 'y',
          name: undefined,
          title: 'Y Variable',
          type: 'str',
          isNew: true,
        },
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
        { id: 'x', name: undefined, title: 'x', type: 'int', isNew: false },
        { id: 'y', name: undefined, title: null, type: 'str', isNew: false },
      ],
    },
    {
      name: 'use id as title when title is null',
      changes: {
        created: [{ id: 'my_var', title: null, type: 'float' }],
        updated: [],
      },
      expected: [
        {
          id: 'my_var',
          name: undefined,
          title: null,
          type: 'float',
          isNew: true,
        },
      ],
    },
    {
      name: 'combine created and updated variables',
      changes: {
        created: [{ id: 'a', title: 'a', type: 'int' }],
        updated: [{ id: 'b', title: 'b', type: 'str' }],
      },
      expected: [
        { id: 'a', name: undefined, title: 'a', type: 'int', isNew: true },
        { id: 'b', name: undefined, title: 'b', type: 'str', isNew: false },
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
    {
      name: 'extract variables with name field populated',
      changes: {
        created: [{ id: 'x', name: 'x_var', title: 'X Variable', type: 'int' }],
        updated: [{ id: 'y', name: 'y_var', title: 'Y Variable', type: 'str' }],
      },
      expected: [
        {
          id: 'x',
          name: 'x_var',
          title: 'X Variable',
          type: 'int',
          isNew: true,
        },
        {
          id: 'y',
          name: 'y_var',
          title: 'Y Variable',
          type: 'str',
          isNew: false,
        },
      ],
    },
    {
      name: 'handle mix of variables with and without name field',
      changes: {
        created: [
          { id: 'a', name: 'a_name', title: 'A', type: 'int' },
          { id: 'b', title: 'B', type: 'float' },
        ],
        updated: [],
      },
      expected: [
        { id: 'a', name: 'a_name', title: 'A', type: 'int', isNew: true },
        { id: 'b', name: undefined, title: 'B', type: 'float', isNew: true },
      ],
    },
    {
      name: 'preserve all fields when name, title, and id differ',
      changes: {
        created: [
          {
            id: 'var_id_123',
            name: 'my_variable',
            title: 'My Custom Variable',
            type: 'Table',
          },
        ],
        updated: [],
      },
      expected: [
        {
          id: 'var_id_123',
          name: 'my_variable',
          title: 'My Custom Variable',
          type: 'Table',
          isNew: true,
        },
      ],
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
    uri: vscode.Uri.parse('file:///workspace'),
    name: 'workspace',
    languageId: 'python',
    type: 'folder',
    isMarked: false,
  };

  const pandasFolder: RemoteImportSourceTreeFolderElement = {
    uri: vscode.Uri.parse('file:///workspace/pandas'),
    name: 'pandas',
    languageId: 'python',
    type: 'folder',
    isMarked: false,
  };

  const pandasFile: RemoteImportSourceTreeFileElement = {
    uri: vscode.Uri.parse('file:///workspace/pandas.py'),
    name: 'pandas',
    languageId: 'python',
    type: 'file',
    isMarked: false,
  };

  const numpyFolder: RemoteImportSourceTreeFolderElement = {
    uri: vscode.Uri.parse('file:///workspace/numpy'),
    name: 'numpy',
    languageId: 'python',
    type: 'folder',
    isMarked: false,
  };

  const wksp2Root: RemoteImportSourceTreeFolderElement = {
    uri: vscode.Uri.parse('file:///workspace2'),
    name: 'workspace2',
    languageId: 'python',
    type: 'folder',
    isMarked: false,
  };

  const wksp2NumpyFolder: RemoteImportSourceTreeFolderElement = {
    uri: vscode.Uri.parse('file:///workspace2/numpy'),
    name: 'numpy',
    languageId: 'python',
    type: 'folder',
    isMarked: false,
  };

  it.each([
    {
      name: 'return undefined when no import errors exist',
      errors: DIAGNOSTIC_ERRORS_WITHOUT_MODULE_IMPORT,
      hasPlugin: false,
      workspaces: [{ nodes: [wkspRoot, pandasFolder] }],
      expected: undefined,
    },
    {
      name: 'return undefined when no import errors exist even with plugin',
      errors: DIAGNOSTIC_ERRORS_WITHOUT_MODULE_IMPORT,
      hasPlugin: true,
      workspaces: [{ nodes: [wkspRoot, pandasFolder] }],
      expected: undefined,
    },
    {
      name: 'suggest installing plugin when not installed',
      errors: DIAGNOSTIC_ERRORS_WITH_MODULE_IMPORT,
      hasPlugin: false,
      workspaces: [{ nodes: [wkspRoot, pandasFolder] }],
      expected: {
        hint: `The Python remote file source plugin is not installed. Install it with 'pip install deephaven-plugin-python-remote-file-source' to enable importing workspace packages.`,
        foundMatchingFolderUris: [],
      },
    },
    {
      name: 'suggest workspace folders when plugin is installed and folders exist',
      errors: DIAGNOSTIC_ERRORS_WITH_MODULE_IMPORT,
      hasPlugin: true,
      workspaces: [{ nodes: [wkspRoot, pandasFolder] }],
      expected: {
        hint: `If this is a package in your workspace, add its folder as a remote file source using addRemoteFileSources. DO NOT guess folder URIs - use the exact URIs provided in details.foundMatchingFolderUris. DO NOT create __init__.py files without first attempting to configure remote file sources.`,
        foundMatchingFolderUris: [pandasFolder.uri.toString()],
      },
    },
    {
      name: 'handle multiple import errors and find matching folders',
      errors: DIAGNOSTIC_ERRORS_WITH_MULTIPLE_MODULE_IMPORTS,
      hasPlugin: true,
      workspaces: [{ nodes: [wkspRoot, pandasFolder, numpyFolder] }],
      expected: {
        hint: `If this is a package in your workspace, add its folder as a remote file source using addRemoteFileSources. DO NOT guess folder URIs - use the exact URIs provided in details.foundMatchingFolderUris. DO NOT create __init__.py files without first attempting to configure remote file sources.`,
        foundMatchingFolderUris: [
          pandasFolder.uri.toString(),
          numpyFolder.uri.toString(),
        ],
      },
    },
    {
      name: 'not include file nodes, only folders',
      errors: DIAGNOSTIC_ERRORS_WITH_MODULE_IMPORT,
      hasPlugin: true,
      workspaces: [{ nodes: [wkspRoot, pandasFile] }],
      expected: {
        hint: `If this is a package in your workspace, add its folder as a remote file source using addRemoteFileSources. DO NOT guess folder URIs - use the exact URIs provided in details.foundMatchingFolderUris. DO NOT create __init__.py files without first attempting to configure remote file sources.`,
        foundMatchingFolderUris: [],
      },
    },
    {
      name: 'handle multiple root nodes with matching folders',
      errors: DIAGNOSTIC_ERRORS_WITH_MULTIPLE_MODULE_IMPORTS,
      hasPlugin: true,
      workspaces: [
        { nodes: [wkspRoot, pandasFolder] },
        { nodes: [wksp2Root, wksp2NumpyFolder] },
      ],
      expected: {
        hint: `If this is a package in your workspace, add its folder as a remote file source using addRemoteFileSources. DO NOT guess folder URIs - use the exact URIs provided in details.foundMatchingFolderUris. DO NOT create __init__.py files without first attempting to configure remote file sources.`,
        foundMatchingFolderUris: [
          pandasFolder.uri.toString(),
          wksp2NumpyFolder.uri.toString(),
        ],
      },
    },
  ])('should $name', async ({ errors, hasPlugin, workspaces, expected }) => {
    const pythonWorkspace = mockFilteredWorkspace<PythonModuleFullname>(
      ...workspaces
    );

    vi.mocked(isInstanceOf).mockReturnValue(hasPlugin);

    const connection = {
      hasRemoteFileSourcePlugin: vi.fn().mockReturnValue(hasPlugin),
      hasPythonRemoteFileSourcePlugin: vi.fn().mockReturnValue(hasPlugin),
    } as unknown as ConnectionState;
    const hint = createPythonModuleImportErrorHint(
      errors,
      connection,
      pythonWorkspace
    );

    expect(hint).toEqual(expected);
  });

  it('should parse raw error message when diagnostics are empty', () => {
    const pythonWorkspace = mockFilteredWorkspace<PythonModuleFullname>({
      nodes: [wkspRoot, pandasFolder],
    });

    vi.mocked(isInstanceOf).mockReturnValue(true);

    const connection = {
      hasRemoteFileSourcePlugin: vi.fn().mockReturnValue(true),
      hasPythonRemoteFileSourcePlugin: vi.fn().mockReturnValue(true),
    } as unknown as ConnectionState;

    const rawErrorMessage = "ModuleNotFoundError: No module named 'pandas'";

    const hint = createPythonModuleImportErrorHint(
      [], // empty diagnostics
      connection,
      pythonWorkspace,
      rawErrorMessage
    );

    expect(hint).toEqual({
      hint: 'If this is a package in your workspace, add its folder as a remote file source using addRemoteFileSources. DO NOT guess folder URIs - use the exact URIs provided in details.foundMatchingFolderUris. DO NOT create __init__.py files without first attempting to configure remote file sources.',
      foundMatchingFolderUris: [pandasFolder.uri.toString()],
    });
  });
});

describe('createGroovyImportErrorHint', () => {
  const wkspRoot: FilteredWorkspaceRootNode = {
    uri: vscode.Uri.parse('file:///workspace'),
    name: 'workspace',
    languageId: 'groovy',
    type: 'workspaceRootFolder',
  };

  const package3Folder: RemoteImportSourceTreeFolderElement = {
    uri: vscode.Uri.parse('file:///workspace/package3'),
    name: 'package3',
    languageId: 'groovy',
    type: 'folder',
    isMarked: false,
  };

  const subpackage1Folder: RemoteImportSourceTreeFolderElement = {
    uri: vscode.Uri.parse('file:///workspace/package3/subpackage1'),
    name: 'subpackage1',
    languageId: 'groovy',
    type: 'folder',
    isMarked: false,
  };

  const numpyFolder: RemoteImportSourceTreeFolderElement = {
    uri: vscode.Uri.parse('file:///workspace/numpy'),
    name: 'numpy',
    languageId: 'groovy',
    type: 'folder',
    isMarked: false,
  };

  const wksp2Root: FilteredWorkspaceRootNode = {
    uri: vscode.Uri.parse('file:///workspace2'),
    name: 'workspace2',
    languageId: 'groovy',
    type: 'workspaceRootFolder',
  };

  const wksp2NumpyFolder: RemoteImportSourceTreeFolderElement = {
    uri: vscode.Uri.parse('file:///workspace2/numpy'),
    name: 'numpy',
    languageId: 'groovy',
    type: 'folder',
    isMarked: false,
  };

  const GROOVY_IMPORT_ERROR_WITH_SUBPACKAGE: DiagnosticsError[] = [
    {
      uri: MOCK_URI_STRING,
      message:
        'Attempting to import a path that does not exist: import package3.subpackage1.MultiClassTest;\nRuntimeException: Attempting to import a path that does not exist: import package3.subpackage1.MultiClassTest;',
      range: new vscode.Range(0, 0, 0, 0),
    },
  ];

  const GROOVY_IMPORT_ERROR_WITHOUT_SUBPACKAGE: DiagnosticsError[] = [
    {
      uri: MOCK_URI_STRING,
      message:
        'Attempting to import a path that does not exist: import package3.MyClass;\nRuntimeException: Attempting to import a path that does not exist: import package3.MyClass;',
      range: new vscode.Range(0, 0, 0, 0),
    },
  ];

  const GROOVY_IMPORT_ERRORS_MULTIPLE: DiagnosticsError[] = [
    {
      uri: MOCK_URI_STRING,
      message:
        'Attempting to import a path that does not exist: import package3.subpackage1.MultiClassTest;\nRuntimeException: Attempting to import a path that does not exist: import package3.subpackage1.MultiClassTest;',
      range: new vscode.Range(0, 0, 0, 0),
    },
    {
      uri: MOCK_URI_STRING,
      message:
        'Attempting to import a path that does not exist: import numpy.SomeClass;\nRuntimeException: Attempting to import a path that does not exist: import numpy.SomeClass;',
      range: new vscode.Range(0, 0, 0, 0),
    },
  ];

  const NON_GROOVY_IMPORT_ERROR: DiagnosticsError[] = [
    {
      uri: MOCK_URI_STRING,
      message: 'Some unrelated Groovy error',
      range: new vscode.Range(0, 0, 0, 0),
    },
  ];

  const GROOVY_UNABLE_TO_RESOLVE_CLASS_ERROR: DiagnosticsError[] = [
    {
      uri: MOCK_URI_STRING,
      message:
        'unable to resolve class package3.subpackage1.MultiClassTest\n @ line 42, column 1.\n   import package3.subpackage1.MultiClassTest',
      range: new vscode.Range(0, 0, 0, 0),
    },
  ];

  it.each([
    {
      name: 'return undefined when no import errors exist',
      errors: NON_GROOVY_IMPORT_ERROR,
      hasPlugin: false,
      workspace: {
        nodes: [wkspRoot, package3Folder],
        nodeChildren: [] as [vscode.Uri, FilteredWorkspaceNode[]][],
      },
      expected: undefined,
    },
    {
      name: 'return undefined when no import errors exist even with plugin',
      errors: NON_GROOVY_IMPORT_ERROR,
      hasPlugin: true,
      workspace: {
        nodes: [wkspRoot, package3Folder],
        nodeChildren: [] as [vscode.Uri, FilteredWorkspaceNode[]][],
      },
      expected: undefined,
    },
    {
      name: 'suggest installing plugin when not installed',
      errors: GROOVY_IMPORT_ERROR_WITH_SUBPACKAGE,
      hasPlugin: false,
      workspace: {
        nodes: [wkspRoot, package3Folder, subpackage1Folder],
        nodeChildren: [[package3Folder.uri, [subpackage1Folder]]] as [
          vscode.Uri,
          FilteredWorkspaceNode[],
        ][],
      },
      expected: {
        hint: `The Groovy remote file source plugin is not installed. Install it to enable importing workspace packages.`,
        foundMatchingFolderUris: [],
      },
    },
    {
      name: 'return matching folder when plugin installed and subpackage folder exists',
      errors: GROOVY_IMPORT_ERROR_WITH_SUBPACKAGE,
      hasPlugin: true,
      workspace: {
        nodes: [wkspRoot, package3Folder, subpackage1Folder],
        nodeChildren: [[package3Folder.uri, [subpackage1Folder]]] as [
          vscode.Uri,
          FilteredWorkspaceNode[],
        ][],
      },
      expected: {
        hint: 'If this is a package in your workspace, add its folder as a remote file source using addRemoteFileSources with languageId "groovy". DO NOT guess folder URIs - use the exact URIs provided in details.foundMatchingFolderUris.',
        foundMatchingFolderUris: [package3Folder.uri.toString()],
      },
    },
    {
      name: 'not include folder when subpackage folder does not exist',
      errors: GROOVY_IMPORT_ERROR_WITH_SUBPACKAGE,
      hasPlugin: true,
      workspace: {
        nodes: [wkspRoot, package3Folder],
        nodeChildren: [[package3Folder.uri, []]] as [
          vscode.Uri,
          FilteredWorkspaceNode[],
        ][],
      },
      expected: {
        hint: 'If this is a package in your workspace, add its folder as a remote file source using addRemoteFileSources with languageId "groovy". DO NOT guess folder URIs - use the exact URIs provided in details.foundMatchingFolderUris.',
        foundMatchingFolderUris: [],
      },
    },
    {
      name: 'include folder when import has only 2 parts (no subpackage verification needed)',
      errors: GROOVY_IMPORT_ERROR_WITHOUT_SUBPACKAGE,
      hasPlugin: true,
      workspace: {
        nodes: [wkspRoot, package3Folder],
        nodeChildren: [] as [vscode.Uri, FilteredWorkspaceNode[]][],
      },
      expected: {
        hint: 'If this is a package in your workspace, add its folder as a remote file source using addRemoteFileSources with languageId "groovy". DO NOT guess folder URIs - use the exact URIs provided in details.foundMatchingFolderUris.',
        foundMatchingFolderUris: [package3Folder.uri.toString()],
      },
    },
    {
      name: 'return empty foundMatchingFolderUris when no matching folder exists in workspace',
      errors: GROOVY_IMPORT_ERROR_WITH_SUBPACKAGE,
      hasPlugin: true,
      workspace: {
        nodes: [wkspRoot, numpyFolder],
        nodeChildren: [] as [vscode.Uri, FilteredWorkspaceNode[]][],
      },
      expected: {
        hint: 'If this is a package in your workspace, add its folder as a remote file source using addRemoteFileSources with languageId "groovy". DO NOT guess folder URIs - use the exact URIs provided in details.foundMatchingFolderUris.',
        foundMatchingFolderUris: [],
      },
    },
    {
      name: 'handle "unable to resolve class" error format',
      errors: GROOVY_UNABLE_TO_RESOLVE_CLASS_ERROR,
      hasPlugin: true,
      workspace: {
        nodes: [wkspRoot, package3Folder, subpackage1Folder],
        nodeChildren: [[package3Folder.uri, [subpackage1Folder]]] as [
          vscode.Uri,
          FilteredWorkspaceNode[],
        ][],
      },
      expected: {
        hint: 'If this is a package in your workspace, add its folder as a remote file source using addRemoteFileSources with languageId "groovy". DO NOT guess folder URIs - use the exact URIs provided in details.foundMatchingFolderUris.',
        foundMatchingFolderUris: [package3Folder.uri.toString()],
      },
    },
  ])('should $name', ({ errors, hasPlugin, workspace, expected }) => {
    const groovyWorkspace = mockFilteredWorkspace<GroovyPackageName>(workspace);

    vi.mocked(isInstanceOf).mockReturnValue(hasPlugin);

    const connection = {
      hasGroovyRemoteFileSourcePlugin: vi.fn().mockReturnValue(hasPlugin),
    } as unknown as ConnectionState;

    const hint = createGroovyImportErrorHint(
      errors,
      connection,
      groovyWorkspace
    );

    expect(hint).toEqual(expected);
  });

  it('should handle multiple workspace roots with matching folders', () => {
    const groovyWorkspace = mockFilteredWorkspace<GroovyPackageName>(
      {
        nodes: [wkspRoot, package3Folder, subpackage1Folder],
        nodeChildren: [[package3Folder.uri, [subpackage1Folder]]],
      },
      {
        nodes: [wksp2Root, wksp2NumpyFolder],
        nodeChildren: [],
      }
    );

    vi.mocked(isInstanceOf).mockReturnValue(true);

    const connection = {
      hasGroovyRemoteFileSourcePlugin: vi.fn().mockReturnValue(true),
    } as unknown as ConnectionState;

    const hint = createGroovyImportErrorHint(
      GROOVY_IMPORT_ERRORS_MULTIPLE,
      connection,
      groovyWorkspace
    );

    expect(hint).toEqual({
      hint: 'If this is a package in your workspace, add its folder as a remote file source using addRemoteFileSources with languageId "groovy". DO NOT guess folder URIs - use the exact URIs provided in details.foundMatchingFolderUris.',
      foundMatchingFolderUris: [
        package3Folder.uri.toString(),
        wksp2NumpyFolder.uri.toString(),
      ],
    });
  });

  it('should parse raw error message when diagnostics are empty', () => {
    const groovyWorkspace = mockFilteredWorkspace<GroovyPackageName>({
      nodes: [wkspRoot, package3Folder, subpackage1Folder],
      nodeChildren: [[package3Folder.uri, [subpackage1Folder]]],
    });

    vi.mocked(isInstanceOf).mockReturnValue(true);

    const connection = {
      hasGroovyRemoteFileSourcePlugin: vi.fn().mockReturnValue(true),
    } as unknown as ConnectionState;

    const rawErrorMessage =
      'RuntimeException: Attempting to import a path that does not exist: import package3.subpackage1.MultiClassTest;';

    const hint = createGroovyImportErrorHint(
      [], // empty diagnostics
      connection,
      groovyWorkspace,
      rawErrorMessage
    );

    expect(hint).toEqual({
      hint: 'If this is a package in your workspace, add its folder as a remote file source using addRemoteFileSources with languageId "groovy". DO NOT guess folder URIs - use the exact URIs provided in details.foundMatchingFolderUris.',
      foundMatchingFolderUris: [package3Folder.uri.toString()],
    });
  });

  it('should parse "unable to resolve class" raw error message when diagnostics are empty', () => {
    const groovyWorkspace = mockFilteredWorkspace<GroovyPackageName>({
      nodes: [wkspRoot, package3Folder, subpackage1Folder],
      nodeChildren: [[package3Folder.uri, [subpackage1Folder]]],
    });

    vi.mocked(isInstanceOf).mockReturnValue(true);

    const connection = {
      hasGroovyRemoteFileSourcePlugin: vi.fn().mockReturnValue(true),
    } as unknown as ConnectionState;

    const rawErrorMessage =
      'GroovyExceptionWrapper: startup failed:\nScript_1: 42: unable to resolve class package3.subpackage1.MultiClassTest\n @ line 42, column 1.\n   import package3.subpackage1.MultiClassTest';

    const hint = createGroovyImportErrorHint(
      [], // empty diagnostics
      connection,
      groovyWorkspace,
      rawErrorMessage
    );

    expect(hint).toEqual({
      hint: 'If this is a package in your workspace, add its folder as a remote file source using addRemoteFileSources with languageId "groovy". DO NOT guess folder URIs - use the exact URIs provided in details.foundMatchingFolderUris.',
      foundMatchingFolderUris: [package3Folder.uri.toString()],
    });
  });
});
