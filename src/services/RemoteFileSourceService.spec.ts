/* eslint-disable @typescript-eslint/naming-convention */
import * as vscode from 'vscode';
import { beforeEach, describe, it, expect, vi } from 'vitest';
import { RemoteFileSourceService } from './RemoteFileSourceService';
import type { FilteredWorkspace } from './FilteredWorkspace';
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

function createService(
  groovyWorkspace: MockGroovyWorkspace,
  pythonWorkspace: MockPythonWorkspace
): RemoteFileSourceService {
  return new RemoteFileSourceService(
    asGroovyWorkspace(groovyWorkspace),
    asPythonWorkspace(pythonWorkspace)
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
      const service = createService(groovyWorkspace, pythonWorkspace);
      expect(service).toBeInstanceOf(RemoteFileSourceService);
    });

    it('should subscribe to groovy workspace onDidUpdate', () => {
      const groovyWorkspace = createMockGroovyWorkspace();
      const pythonWorkspace = createMockPythonWorkspace();
      createService(groovyWorkspace, pythonWorkspace);
      expect(groovyWorkspace.onDidUpdate).toHaveBeenCalled();
    });

    it('should subscribe to python workspace onDidUpdate', () => {
      const groovyWorkspace = createMockGroovyWorkspace();
      const pythonWorkspace = createMockPythonWorkspace();
      createService(groovyWorkspace, pythonWorkspace);
      expect(pythonWorkspace.onDidUpdate).toHaveBeenCalled();
    });
  });

  describe('updateControllerPrefixesFromCode', () => {
    it('replaces prefixes when replace=true and code has meta_import', () => {
      const folders = [{ uri: vscode.Uri.parse('file:///path/to/mymodule') }];
      const groovyWorkspace = createMockGroovyWorkspace();
      const pythonWorkspace = createMockPythonWorkspace(folders);
      const service = createService(groovyWorkspace, pythonWorkspace);

      const code = `
import deephaven_enterprise.controller_import
deephaven_enterprise.controller_import.meta_import("custom")
`;

      service.updateControllerPrefixesFromCode(code, true);

      const result = service.getPythonTopLevelModuleNames();
      expect(result).toEqual(
        new Set<PythonModuleFullname>(['mymodule', 'custom.mymodule'])
      );
    });

    it('clears prefixes when replace=true and no meta_import found', () => {
      const folders = [{ uri: vscode.Uri.parse('file:///path/to/mymodule') }];
      const groovyWorkspace = createMockGroovyWorkspace();
      const pythonWorkspace = createMockPythonWorkspace(folders);
      const service = createService(groovyWorkspace, pythonWorkspace);

      // Set initial prefix
      service.updateControllerPrefixesFromCode(
        'import deephaven_enterprise.controller_import\ndeephaven_enterprise.controller_import.meta_import()',
        true
      );

      // Run code without meta_import
      service.updateControllerPrefixesFromCode('print("hello")', true);

      const result = service.getPythonTopLevelModuleNames();
      expect(result).toEqual(new Set<PythonModuleFullname>(['mymodule']));
    });

    it('keeps existing prefixes when replace=false and no meta_import found', () => {
      const folders = [{ uri: vscode.Uri.parse('file:///path/to/mymodule') }];
      const groovyWorkspace = createMockGroovyWorkspace();
      const pythonWorkspace = createMockPythonWorkspace(folders);
      const service = createService(groovyWorkspace, pythonWorkspace);

      // Set initial prefix
      service.updateControllerPrefixesFromCode(
        'import deephaven_enterprise.controller_import\ndeephaven_enterprise.controller_import.meta_import()',
        true
      );

      // Run code snippet without meta_import (replace=false)
      service.updateControllerPrefixesFromCode('print("hello")', false);

      const result = service.getPythonTopLevelModuleNames();
      expect(result).toEqual(
        new Set<PythonModuleFullname>(['mymodule', 'controller.mymodule'])
      );
    });

    it('updates prefixes when replace=false and meta_import found', () => {
      const folders = [{ uri: vscode.Uri.parse('file:///path/to/mymodule') }];
      const groovyWorkspace = createMockGroovyWorkspace();
      const pythonWorkspace = createMockPythonWorkspace(folders);
      const service = createService(groovyWorkspace, pythonWorkspace);

      // Set initial prefix
      service.updateControllerPrefixesFromCode(
        'import deephaven_enterprise.controller_import\ndeephaven_enterprise.controller_import.meta_import()',
        true
      );

      // Run code snippet with different prefix (replace=false)
      service.updateControllerPrefixesFromCode(
        'import deephaven_enterprise.controller_import\ndeephaven_enterprise.controller_import.meta_import("new")',
        false
      );

      const result = service.getPythonTopLevelModuleNames();
      expect(result).toEqual(
        new Set<PythonModuleFullname>(['mymodule', 'new.mymodule'])
      );
    });

    it('fires event when prefixes are replaced', () => {
      const folders = [{ uri: vscode.Uri.parse('file:///path/to/mymodule') }];
      const groovyWorkspace = createMockGroovyWorkspace();
      const pythonWorkspace = createMockPythonWorkspace(folders);
      const service = createService(groovyWorkspace, pythonWorkspace);

      const emitter = (service as any)._onDidUpdatePythonModuleMeta;
      const fireSpy = vi.spyOn(emitter, 'fire');

      service.updateControllerPrefixesFromCode(
        'import deephaven_enterprise.controller_import\ndeephaven_enterprise.controller_import.meta_import()',
        true
      );

      expect(fireSpy).toHaveBeenCalled();
    });

    it('fires event when replace=true even with empty prefixes', () => {
      const folders = [{ uri: vscode.Uri.parse('file:///path/to/mymodule') }];
      const groovyWorkspace = createMockGroovyWorkspace();
      const pythonWorkspace = createMockPythonWorkspace(folders);
      const service = createService(groovyWorkspace, pythonWorkspace);

      const emitter = (service as any)._onDidUpdatePythonModuleMeta;
      const fireSpy = vi.spyOn(emitter, 'fire');

      service.updateControllerPrefixesFromCode('print("hello")', true);

      expect(fireSpy).toHaveBeenCalled();
    });

    it('does not fire event when replace=false and no prefixes found', () => {
      const folders = [{ uri: vscode.Uri.parse('file:///path/to/mymodule') }];
      const groovyWorkspace = createMockGroovyWorkspace();
      const pythonWorkspace = createMockPythonWorkspace(folders);
      const service = createService(groovyWorkspace, pythonWorkspace);

      const emitter = (service as any)._onDidUpdatePythonModuleMeta;
      const fireSpy = vi.spyOn(emitter, 'fire');

      service.updateControllerPrefixesFromCode('print("hello")', false);

      expect(fireSpy).not.toHaveBeenCalled();
    });
  });

  describe('getPythonTopLevelModuleNames', () => {
    it('returns only unprefixed names when no prefixes configured', () => {
      const folders = [
        { uri: vscode.Uri.parse('file:///path/to/mymodule') },
        { uri: vscode.Uri.parse('file:///path/to/othermodule') },
      ];
      const groovyWorkspace = createMockGroovyWorkspace();
      const pythonWorkspace = createMockPythonWorkspace(folders);
      const service = createService(groovyWorkspace, pythonWorkspace);

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
      const service = createService(groovyWorkspace, pythonWorkspace);

      service.updateControllerPrefixesFromCode(
        'import deephaven_enterprise.controller_import\ndeephaven_enterprise.controller_import.meta_import()',
        true
      );

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
      const service = createService(groovyWorkspace, pythonWorkspace);

      service.updateControllerPrefixesFromCode(
        'from deephaven_enterprise.controller_import import meta_import\nmeta_import("custom")',
        true
      );

      const result = service.getPythonTopLevelModuleNames();

      expect(result).toEqual(
        new Set<PythonModuleFullname>(['mymodule', 'custom.mymodule'])
      );
    });

    it('returns empty set when no folders are marked', () => {
      const groovyWorkspace = createMockGroovyWorkspace();
      const pythonWorkspace = createMockPythonWorkspace([]);
      const service = createService(groovyWorkspace, pythonWorkspace);

      service.updateControllerPrefixesFromCode(
        'import deephaven_enterprise.controller_import\ndeephaven_enterprise.controller_import.meta_import()',
        true
      );

      const result = service.getPythonTopLevelModuleNames();

      expect(result).toEqual(new Set());
    });
  });

  describe('onDidUpdatePythonModuleMeta event', () => {
    it('fires event when python workspace updates', () => {
      const groovyWorkspace = createMockGroovyWorkspace();
      const pythonWorkspace = createMockPythonWorkspace();
      const service = createService(groovyWorkspace, pythonWorkspace);

      const emitter = (service as any)._onDidUpdatePythonModuleMeta;
      const fireSpy = vi.spyOn(emitter, 'fire');

      pythonWorkspace.triggerUpdate();

      expect(fireSpy).toHaveBeenCalled();
    });
  });
});
