/* eslint-disable @typescript-eslint/naming-convention */
import * as vscode from 'vscode';
import { beforeEach, describe, it, expect, vi } from 'vitest';
import { RemoteFileSourceService } from './RemoteFileSourceService';
import type {
  FilteredWorkspace,
  FilteredWorkspaceTopLevelMarkedNode,
} from './FilteredWorkspace';
import type { GroovyPackageName, PythonModuleFullname } from '../types';

vi.mock('vscode');

// ── setup ────────────────────────────────────────────────────────────────────

const groovyWorkspace = {
  onDidUpdate: vi.fn().mockReturnValue({ dispose: vi.fn() }),
} as unknown as FilteredWorkspace<GroovyPackageName>;

const pythonWorkspace = {
  onDidUpdate: vi.fn().mockReturnValue({ dispose: vi.fn() }),
  getTopLevelMarkedFolders: vi.fn().mockReturnValue([]),
  hasFolder: vi.fn(),
  hasFile: vi.fn(),
} as unknown as FilteredWorkspace<PythonModuleFullname>;

const controllerPrefix = 'controller';
const customPrefix = 'custom';

const myModuleName = 'mymodule' as PythonModuleFullname;
const otherModuleName = 'othermodule' as PythonModuleFullname;
const myModuleFolder = topLevelMarkedFolder(myModuleName);
const otherModuleFolder = topLevelMarkedFolder(otherModuleName);

function topLevelMarkedFolder(
  name: PythonModuleFullname
): FilteredWorkspaceTopLevelMarkedNode {
  return {
    name,
    type: 'topLevelMarkedFolder',
    languageId: 'python',
    isMarked: true,
    uri: vscode.Uri.parse(`file:///path/to/${name}`),
  } as const;
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ── tests ────────────────────────────────────────────────────────────────────

describe('RemoteFileSourceService', () => {
  it('constructor subscribes to workspace updates', () => {
    const service = new RemoteFileSourceService(
      groovyWorkspace,
      pythonWorkspace
    );
    expect(service).toBeInstanceOf(RemoteFileSourceService);
    expect(vi.mocked(groovyWorkspace.onDidUpdate)).toHaveBeenCalled();
    expect(vi.mocked(pythonWorkspace.onDidUpdate)).toHaveBeenCalled();
  });

  describe('setControllerImportPrefixes', () => {
    it('fires onDidUpdatePythonModuleMeta event', () => {
      const service = new RemoteFileSourceService(
        groovyWorkspace,
        pythonWorkspace
      );

      const listener = vi.fn();
      service.onDidUpdatePythonModuleMeta(listener);

      service.setControllerImportPrefixes(new Set([controllerPrefix]));

      expect(listener).toHaveBeenCalled();
    });
  });

  describe('getPythonTopLevelModuleNames', () => {
    it.each([
      {
        label: 'no prefixes configured',
        folders: [myModuleFolder, otherModuleFolder],
        prefixes: [],
      },
      {
        label: 'default "controller" prefix',
        folders: [myModuleFolder, otherModuleFolder],
        prefixes: [controllerPrefix],
      },
      {
        label: 'custom prefix',
        folders: [myModuleFolder],
        prefixes: [customPrefix],
      },
      {
        label: 'multiple prefixes',
        folders: [myModuleFolder],
        prefixes: [controllerPrefix, customPrefix],
      },
      {
        label: 'no folders marked',
        folders: [],
        prefixes: [controllerPrefix],
      },
    ])('returns $label', ({ folders, prefixes }) => {
      vi.mocked(pythonWorkspace.getTopLevelMarkedFolders).mockReturnValue(
        folders
      );

      const service = new RemoteFileSourceService(
        groovyWorkspace,
        pythonWorkspace
      );

      service.setControllerImportPrefixes(new Set(prefixes));

      const result = service.getPythonTopLevelModuleNames();

      const expected = new Set([
        ...folders.map(folder => folder.name),
        ...prefixes.flatMap(prefix =>
          folders.map(folder => `${prefix}.${folder.name}`)
        ),
      ]);

      expect(result).toEqual(expected);
    });
  });

  describe('getPythonModuleSpecData', () => {
    it.each([
      {
        label: 'regular module found',
        moduleFullname: 'mymodule.submodule',
        modulePath: 'submodule',
        hasFileResult: true,
      },
      {
        label: 'nested module found',
        moduleFullname: 'mymodule.sub.nested',
        modulePath: 'sub/nested',
        hasFileResult: true,
      },
      {
        label: 'regular package found',
        moduleFullname: 'mymodule.subpackage',
        modulePath: 'subpackage',
        hasFolderResult: true,
        hasFileResult: true, // __init__.py exists
      },
      {
        label: 'namespace package found',
        moduleFullname: 'mymodule.namespace',
        modulePath: 'namespace',
        hasFolderResult: true,
      },
      {
        label: 'module with controller prefix stripped',
        moduleFullname: 'controller.mymodule.test',
        modulePath: 'test',
        prefixes: [controllerPrefix],
        hasFileResult: true,
      },
      {
        label: 'bare prefix with no module after (not found)',
        moduleFullname: controllerPrefix,
        prefixes: [controllerPrefix],
      },
      {
        label: 'top-level package',
        moduleFullname: myModuleName,
        modulePath: '',
        hasFolderResult: true,
        hasFileResult: true,
      },
      {
        label: 'top-level package with same name as prefix',
        moduleFullname: myModuleName,
        modulePath: '',
        prefixes: [myModuleName],
        hasFolderResult: true,
        hasFileResult: true,
      },
      {
        label: 'top-level folder not found',
        moduleFullname: 'notfound.module',
      },
      {
        label: 'module not found',
        moduleFullname: 'mymodule.notfound',
      },
    ])(
      'returns $label',
      ({
        moduleFullname,
        modulePath,
        prefixes = [],
        hasFolderResult = false,
        hasFileResult = false,
      }) => {
        vi.mocked(pythonWorkspace.getTopLevelMarkedFolders).mockReturnValue([
          myModuleFolder,
        ]);
        vi.mocked(pythonWorkspace.hasFolder).mockReturnValue(hasFolderResult);
        vi.mocked(pythonWorkspace.hasFile).mockReturnValue(hasFileResult);

        const service = new RemoteFileSourceService(
          groovyWorkspace,
          pythonWorkspace
        );

        if (prefixes.length > 0) {
          service.setControllerImportPrefixes(new Set(prefixes));
        }

        const result = service.getPythonModuleSpecData(
          moduleFullname as PythonModuleFullname
        );

        // Derive expected result from inputs
        let expected = null;
        if (hasFolderResult || hasFileResult) {
          const folderPath = myModuleFolder.uri.fsPath;

          if (!hasFolderResult && hasFileResult) {
            // Regular module
            expected = {
              name: moduleFullname,
              isPackage: false,
              origin: `${folderPath}/${modulePath}.py`,
            };
          } else if (hasFolderResult && hasFileResult) {
            // Regular package (with __init__.py)
            const packagePath =
              modulePath === '' ? folderPath : `${folderPath}/${modulePath}`;
            expected = {
              name: moduleFullname,
              isPackage: true,
              origin: `${packagePath}/__init__.py`,
              subModuleSearchLocations: [packagePath],
            };
          } else if (hasFolderResult && !hasFileResult) {
            // Namespace package (without __init__.py)
            const packagePath =
              modulePath === '' ? folderPath : `${folderPath}/${modulePath}`;
            expected = {
              name: moduleFullname,
              isPackage: true,
              origin: undefined,
              subModuleSearchLocations: [packagePath],
            };
          }
        }

        expect(result).toEqual(expected);
      }
    );
  });

  it('fires onDidUpdatePythonModuleMeta event when python workspace updates', () => {
    const service = new RemoteFileSourceService(
      groovyWorkspace,
      pythonWorkspace
    );

    const listener = vi.fn();
    service.onDidUpdatePythonModuleMeta(listener);

    const updateListener = vi.mocked(pythonWorkspace.onDidUpdate).mock
      .calls[0][0];
    updateListener();

    expect(listener).toHaveBeenCalled();
  });
});
