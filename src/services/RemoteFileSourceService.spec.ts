/* eslint-disable @typescript-eslint/naming-convention */
import * as vscode from 'vscode';
import { beforeEach, describe, it, expect, vi } from 'vitest';
import { RemoteFileSourceService } from './RemoteFileSourceService';
import type { FilteredWorkspace } from './FilteredWorkspace';
import type { PythonControllerImportScanner } from './PythonControllerImportScanner';
import type { GroovyPackageName, PythonModuleFullname } from '../types';

vi.mock('vscode');

// ── helpers ──────────────────────────────────────────────────────────────────

type MockGroovyWorkspace = {
  onDidUpdate: ReturnType<typeof vi.fn>;
};

type MockPythonWorkspace = {
  onDidUpdate: ReturnType<typeof vi.fn>;
  getTopLevelMarkedFolders: ReturnType<typeof vi.fn>;
  triggerUpdate: () => void;
};

type MockScanner = {
  onDidUpdatePrefix: ReturnType<typeof vi.fn>;
  getControllerPrefix: ReturnType<typeof vi.fn>;
  triggerPrefixUpdate: (prefix: string | null) => void;
};

function createMockGroovyWorkspace(): MockGroovyWorkspace {
  return {
    onDidUpdate: vi.fn().mockReturnValue({ dispose: vi.fn() }),
  };
}

function createMockPythonWorkspace(
  topLevelFolders: { uri: vscode.Uri }[] = []
): MockPythonWorkspace {
  let updateListener: (() => void) | null = null;
  return {
    onDidUpdate: vi.fn().mockImplementation((listener: () => void) => {
      updateListener = listener;
      return { dispose: vi.fn() };
    }),
    getTopLevelMarkedFolders: vi.fn().mockReturnValue(topLevelFolders),
    triggerUpdate: () => updateListener?.(),
  };
}

function createMockScanner(prefix: string | null = null): MockScanner {
  let prefixListener: ((p: string | null) => void) | null = null;
  return {
    onDidUpdatePrefix: vi.fn().mockImplementation(
      (listener: (p: string | null) => void) => {
        prefixListener = listener;
        return { dispose: vi.fn() };
      }
    ),
    getControllerPrefix: vi.fn().mockReturnValue(prefix),
    triggerPrefixUpdate: (newPrefix: string | null) =>
      prefixListener?.(newPrefix),
  };
}

function asGroovyWorkspace(
  mock: MockGroovyWorkspace
): FilteredWorkspace<GroovyPackageName> {
  return mock as unknown as FilteredWorkspace<GroovyPackageName>;
}

function asPythonWorkspace(
  mock: MockPythonWorkspace
): FilteredWorkspace<PythonModuleFullname> {
  return mock as unknown as FilteredWorkspace<PythonModuleFullname>;
}

function asScanner(mock: MockScanner): PythonControllerImportScanner {
  return mock as unknown as PythonControllerImportScanner;
}

function createService(
  groovyWorkspace: MockGroovyWorkspace,
  pythonWorkspace: MockPythonWorkspace,
  scanner: MockScanner
): RemoteFileSourceService {
  return new RemoteFileSourceService(
    asGroovyWorkspace(groovyWorkspace),
    asPythonWorkspace(pythonWorkspace),
    asScanner(scanner)
  );
}

// ── setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

// ── tests ────────────────────────────────────────────────────────────────────

describe('RemoteFileSourceService', () => {
  describe('constructor', () => {
    it('should create an instance', () => {
      const groovyWorkspace = createMockGroovyWorkspace();
      const pythonWorkspace = createMockPythonWorkspace();
      const scanner = createMockScanner();
      const service = createService(groovyWorkspace, pythonWorkspace, scanner);
      expect(service).toBeInstanceOf(RemoteFileSourceService);
    });

    it('should subscribe to groovy workspace onDidUpdate', () => {
      const groovyWorkspace = createMockGroovyWorkspace();
      const pythonWorkspace = createMockPythonWorkspace();
      const scanner = createMockScanner();
      createService(groovyWorkspace, pythonWorkspace, scanner);
      expect(groovyWorkspace.onDidUpdate).toHaveBeenCalled();
    });

    it('should subscribe to python workspace onDidUpdate', () => {
      const groovyWorkspace = createMockGroovyWorkspace();
      const pythonWorkspace = createMockPythonWorkspace();
      const scanner = createMockScanner();
      createService(groovyWorkspace, pythonWorkspace, scanner);
      expect(pythonWorkspace.onDidUpdate).toHaveBeenCalled();
    });

    it('should subscribe to scanner onDidUpdatePrefix', () => {
      const groovyWorkspace = createMockGroovyWorkspace();
      const pythonWorkspace = createMockPythonWorkspace();
      const scanner = createMockScanner();
      createService(groovyWorkspace, pythonWorkspace, scanner);
      expect(scanner.onDidUpdatePrefix).toHaveBeenCalled();
    });
  });

  describe('getPythonTopLevelModuleNames', () => {
    it('returns only unprefixed names when scanner returns null', () => {
      const folders = [
        { uri: vscode.Uri.parse('file:///path/to/mymodule') },
        { uri: vscode.Uri.parse('file:///path/to/othermodule') },
      ];
      const groovyWorkspace = createMockGroovyWorkspace();
      const pythonWorkspace = createMockPythonWorkspace(folders);
      const scanner = createMockScanner(null);
      const service = createService(groovyWorkspace, pythonWorkspace, scanner);

      const result = service.getPythonTopLevelModuleNames();

      expect(result).toEqual(
        new Set<PythonModuleFullname>(['mymodule', 'othermodule'])
      );
    });

    it('returns both unprefixed and prefixed names with default "controller" prefix', () => {
      const folders = [
        { uri: vscode.Uri.parse('file:///path/to/mymodule') },
        { uri: vscode.Uri.parse('file:///path/to/othermodule') },
      ];
      const groovyWorkspace = createMockGroovyWorkspace();
      const pythonWorkspace = createMockPythonWorkspace(folders);
      const scanner = createMockScanner('controller');
      const service = createService(groovyWorkspace, pythonWorkspace, scanner);

      const result = service.getPythonTopLevelModuleNames();

      expect(result).toEqual(
        new Set<PythonModuleFullname>([
          'mymodule',
          'controller.mymodule',
          'othermodule',
          'controller.othermodule',
        ])
      );
    });

    it('returns both unprefixed and prefixed names with custom prefix', () => {
      const folders = [{ uri: vscode.Uri.parse('file:///path/to/mymodule') }];
      const groovyWorkspace = createMockGroovyWorkspace();
      const pythonWorkspace = createMockPythonWorkspace(folders);
      const scanner = createMockScanner('custom');
      const service = createService(groovyWorkspace, pythonWorkspace, scanner);

      const result = service.getPythonTopLevelModuleNames();

      expect(result).toEqual(
        new Set<PythonModuleFullname>(['mymodule', 'custom.mymodule'])
      );
    });

    it('returns empty set when no folders are marked', () => {
      const groovyWorkspace = createMockGroovyWorkspace();
      const pythonWorkspace = createMockPythonWorkspace([]);
      const scanner = createMockScanner('controller');
      const service = createService(groovyWorkspace, pythonWorkspace, scanner);

      const result = service.getPythonTopLevelModuleNames();

      expect(result).toEqual(new Set());
    });

    it('returns only unprefixed names when prefix is null with multiple folders', () => {
      const folders = [
        { uri: vscode.Uri.parse('file:///ws/alpha') },
        { uri: vscode.Uri.parse('file:///ws/beta') },
        { uri: vscode.Uri.parse('file:///ws/gamma') },
      ];
      const groovyWorkspace = createMockGroovyWorkspace();
      const pythonWorkspace = createMockPythonWorkspace(folders);
      const scanner = createMockScanner(null);
      const service = createService(groovyWorkspace, pythonWorkspace, scanner);

      const result = service.getPythonTopLevelModuleNames();

      expect(result).toEqual(
        new Set<PythonModuleFullname>(['alpha', 'beta', 'gamma'])
      );
    });
  });

  describe('onDidUpdatePythonModuleMeta event', () => {
    it('fires event when scanner prefix changes', () => {
      const groovyWorkspace = createMockGroovyWorkspace();
      const pythonWorkspace = createMockPythonWorkspace();
      const scanner = createMockScanner(null);
      const service = createService(groovyWorkspace, pythonWorkspace, scanner);

      const emitter = (service as any)._onDidUpdatePythonModuleMeta;
      emitter.fire.mockClear();

      scanner.triggerPrefixUpdate('controller');

      expect(emitter.fire).toHaveBeenCalled();
    });

    it('fires event when python workspace updates', () => {
      const groovyWorkspace = createMockGroovyWorkspace();
      const pythonWorkspace = createMockPythonWorkspace();
      const scanner = createMockScanner(null);
      const service = createService(groovyWorkspace, pythonWorkspace, scanner);

      const emitter = (service as any)._onDidUpdatePythonModuleMeta;
      emitter.fire.mockClear();

      pythonWorkspace.triggerUpdate();

      expect(emitter.fire).toHaveBeenCalled();
    });

    it('fires event when scanner prefix changes to null', () => {
      const groovyWorkspace = createMockGroovyWorkspace();
      const pythonWorkspace = createMockPythonWorkspace();
      const scanner = createMockScanner('controller');
      const service = createService(groovyWorkspace, pythonWorkspace, scanner);

      const emitter = (service as any)._onDidUpdatePythonModuleMeta;
      emitter.fire.mockClear();

      scanner.triggerPrefixUpdate(null);

      expect(emitter.fire).toHaveBeenCalled();
    });

    it('does not fire event for groovy workspace updates via _onDidUpdatePythonModuleMeta', () => {
      let groovyListener: (() => void) | null = null;
      const groovyWorkspace = {
        onDidUpdate: vi.fn().mockImplementation((listener: () => void) => {
          groovyListener = listener;
          return { dispose: vi.fn() };
        }),
      };
      const pythonWorkspace = createMockPythonWorkspace();
      const scanner = createMockScanner(null);
      const service = createService(groovyWorkspace, pythonWorkspace, scanner);

      const emitter = (service as any)._onDidUpdatePythonModuleMeta;
      emitter.fire.mockClear();

      // Trigger groovy workspace update
      groovyListener?.();

      // Python meta event should NOT fire for groovy updates
      expect(emitter.fire).not.toHaveBeenCalled();
    });
  });
});
