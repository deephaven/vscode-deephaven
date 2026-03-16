/* eslint-disable @typescript-eslint/naming-convention */
import * as vscode from 'vscode';
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { PythonControllerImportScanner } from './PythonControllerImportScanner';
import type { FilteredWorkspace } from './FilteredWorkspace';
import type { PythonModuleFullname } from '../types';

vi.mock('vscode');

// Add findFiles to the workspace mock since it is not in the base vscode mock
const mockFindFiles = vi.fn<[], Promise<vscode.Uri[]>>();
(vscode.workspace as any).findFiles = mockFindFiles;

// ── helpers ──────────────────────────────────────────────────────────────────

type MockWorkspace = {
  onDidUpdate: ReturnType<typeof vi.fn>;
  triggerUpdate: () => void;
};

function createMockWorkspace(): MockWorkspace {
  let updateListener: (() => void) | null = null;
  return {
    onDidUpdate: vi.fn().mockImplementation((listener: () => void) => {
      updateListener = listener;
      return { dispose: vi.fn() };
    }),
    triggerUpdate: () => updateListener?.(),
  };
}

function asWorkspace(
  mock: MockWorkspace
): FilteredWorkspace<PythonModuleFullname> {
  return mock as unknown as FilteredWorkspace<PythonModuleFullname>;
}

function setupFiles(files: Record<string, string>): void {
  const uris = Object.keys(files).map(path =>
    vscode.Uri.parse(`file://${path}`)
  );
  mockFindFiles.mockResolvedValue(uris);
  vi.mocked(vscode.workspace.fs.readFile).mockImplementation(async uri => {
    const content = files[(uri as vscode.Uri).path];
    if (content === undefined) {
      throw new Error(`File not found: ${(uri as vscode.Uri).path}`);
    }
    return Buffer.from(content);
  });
}

async function createScanner(
  mock: MockWorkspace
): Promise<PythonControllerImportScanner> {
  const scanner = new PythonControllerImportScanner(asWorkspace(mock));
  await vi.runAllTimersAsync();
  return scanner;
}

// ── setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  mockFindFiles.mockResolvedValue([]);
});

afterEach(() => {
  vi.useRealTimers();
});

// ── tests ────────────────────────────────────────────────────────────────────

describe('PythonControllerImportScanner', () => {
  describe('constructor', () => {
    it('should create an instance', async () => {
      const mock = createMockWorkspace();
      const scanner = await createScanner(mock);
      expect(scanner).toBeInstanceOf(PythonControllerImportScanner);
    });

    it('should subscribe to workspace onDidUpdate', async () => {
      const mock = createMockWorkspace();
      await createScanner(mock);
      expect(mock.onDidUpdate).toHaveBeenCalled();
    });
  });

  describe('getControllerPrefix – no configuration', () => {
    it('returns null when workspace has no Python files', async () => {
      const mock = createMockWorkspace();
      const scanner = await createScanner(mock);
      expect(scanner.getControllerPrefix()).toBeNull();
    });

    it('returns null when Python files have no meta_import usage', async () => {
      setupFiles({ '/file.py': 'import os\nprint("hello")' });
      const mock = createMockWorkspace();
      const scanner = await createScanner(mock);
      expect(scanner.getControllerPrefix()).toBeNull();
    });

    it('handles invalid / malformed Python gracefully and returns null', async () => {
      setupFiles({ '/file.py': '!!!invalid python code @#$%^&*()' });
      const mock = createMockWorkspace();
      const scanner = await createScanner(mock);
      expect(scanner.getControllerPrefix()).toBeNull();
    });

    it('handles file read errors gracefully and returns null', async () => {
      const uri = vscode.Uri.parse('file:///file.py');
      mockFindFiles.mockResolvedValue([uri]);
      vi.mocked(vscode.workspace.fs.readFile).mockRejectedValue(
        new Error('Permission denied')
      );
      const mock = createMockWorkspace();
      const scanner = await createScanner(mock);
      expect(scanner.getControllerPrefix()).toBeNull();
    });
  });

  describe('pattern 1: deephaven_enterprise.controller_import.meta_import()', () => {
    it('returns default prefix "controller" for bare meta_import()', async () => {
      setupFiles({
        '/file.py':
          'deephaven_enterprise.controller_import.meta_import()',
      });
      const mock = createMockWorkspace();
      const scanner = await createScanner(mock);
      expect(scanner.getControllerPrefix()).toBe('controller');
    });

    it.each([
      ['meta_import("myprefix")', 'myprefix'],
      ["meta_import('myprefix')", 'myprefix'],
      ['meta_import()', 'controller'],
    ])(
      'extracts prefix from %s',
      async (call, expectedPrefix) => {
        setupFiles({
          '/file.py': `deephaven_enterprise.controller_import.${call}`,
        });
        const mock = createMockWorkspace();
        const scanner = await createScanner(mock);
        expect(scanner.getControllerPrefix()).toBe(expectedPrefix);
      }
    );

    it('works when import statement is also present', async () => {
      setupFiles({
        '/file.py': [
          'import deephaven_enterprise.controller_import',
          'deephaven_enterprise.controller_import.meta_import("prod")',
        ].join('\n'),
      });
      const mock = createMockWorkspace();
      const scanner = await createScanner(mock);
      expect(scanner.getControllerPrefix()).toBe('prod');
    });
  });

  describe('pattern 2: from deephaven_enterprise.controller_import import meta_import', () => {
    it('returns default prefix "controller" for bare meta_import()', async () => {
      setupFiles({
        '/file.py': [
          'from deephaven_enterprise.controller_import import meta_import',
          'meta_import()',
        ].join('\n'),
      });
      const mock = createMockWorkspace();
      const scanner = await createScanner(mock);
      expect(scanner.getControllerPrefix()).toBe('controller');
    });

    it.each([
      ['meta_import("myprefix")', 'myprefix'],
      ["meta_import('myprefix')", 'myprefix'],
      ['meta_import()', 'controller'],
    ])(
      'extracts prefix from %s',
      async (call, expectedPrefix) => {
        setupFiles({
          '/file.py': [
            'from deephaven_enterprise.controller_import import meta_import',
            call,
          ].join('\n'),
        });
        const mock = createMockWorkspace();
        const scanner = await createScanner(mock);
        expect(scanner.getControllerPrefix()).toBe(expectedPrefix);
      }
    );

    it('does not match bare meta_import() without the from-import line', async () => {
      setupFiles({ '/file.py': 'meta_import()' });
      const mock = createMockWorkspace();
      const scanner = await createScanner(mock);
      expect(scanner.getControllerPrefix()).toBeNull();
    });
  });

  describe('first-match-wins', () => {
    it('uses prefix from the first file that matches', async () => {
      const file1 = vscode.Uri.parse('file:///a.py');
      const file2 = vscode.Uri.parse('file:///b.py');
      mockFindFiles.mockResolvedValue([file1, file2]);
      vi.mocked(vscode.workspace.fs.readFile).mockImplementation(
        async uri => {
          if ((uri as vscode.Uri).path === file1.path) {
            return Buffer.from(
              'deephaven_enterprise.controller_import.meta_import("first")'
            );
          }
          return Buffer.from(
            'deephaven_enterprise.controller_import.meta_import("second")'
          );
        }
      );

      const mock = createMockWorkspace();
      const scanner = await createScanner(mock);
      expect(scanner.getControllerPrefix()).toBe('first');
    });

    it('skips files with no match and stops at the first match', async () => {
      const fileNoMatch = vscode.Uri.parse('file:///no_match.py');
      const fileMatch = vscode.Uri.parse('file:///match.py');
      mockFindFiles.mockResolvedValue([fileNoMatch, fileMatch]);
      vi.mocked(vscode.workspace.fs.readFile).mockImplementation(
        async uri => {
          if ((uri as vscode.Uri).path === fileNoMatch.path) {
            return Buffer.from('import os');
          }
          return Buffer.from(
            'deephaven_enterprise.controller_import.meta_import("found")'
          );
        }
      );

      const mock = createMockWorkspace();
      const scanner = await createScanner(mock);
      expect(scanner.getControllerPrefix()).toBe('found');
    });
  });

  describe('onDidUpdatePrefix event', () => {
    it('fires event with the detected prefix when configuration is found', async () => {
      setupFiles({
        '/file.py':
          'deephaven_enterprise.controller_import.meta_import("mypfx")',
      });
      const mock = createMockWorkspace();
      const scanner = await createScanner(mock);

      const emitter = (scanner as any)._onDidUpdatePrefix;
      expect(emitter.fire).toHaveBeenCalledWith('mypfx');
    });

    it('does not fire event when prefix is unchanged after re-scan', async () => {
      setupFiles({
        '/file.py':
          'deephaven_enterprise.controller_import.meta_import("stable")',
      });
      const mock = createMockWorkspace();
      const scanner = await createScanner(mock);

      const emitter = (scanner as any)._onDidUpdatePrefix;
      const callCountAfterFirst = emitter.fire.mock.calls.length;

      // Trigger another scan with the same files
      mock.triggerUpdate();
      await vi.runAllTimersAsync();

      expect(emitter.fire.mock.calls.length).toBe(callCountAfterFirst);
    });

    it('fires event with null when prefix is removed', async () => {
      setupFiles({
        '/file.py':
          'deephaven_enterprise.controller_import.meta_import("gone")',
      });
      const mock = createMockWorkspace();
      const scanner = await createScanner(mock);

      // Remove the configuration
      mockFindFiles.mockResolvedValue([]);

      mock.triggerUpdate();
      await vi.runAllTimersAsync();

      const emitter = (scanner as any)._onDidUpdatePrefix;
      expect(emitter.fire).toHaveBeenCalledWith(null);
      expect(scanner.getControllerPrefix()).toBeNull();
    });

    it('fires event with new prefix when prefix changes', async () => {
      setupFiles({
        '/file.py':
          'deephaven_enterprise.controller_import.meta_import("old")',
      });
      const mock = createMockWorkspace();
      const scanner = await createScanner(mock);

      // Change the file content to a different prefix
      setupFiles({
        '/file.py':
          'deephaven_enterprise.controller_import.meta_import("new")',
      });

      mock.triggerUpdate();
      await vi.runAllTimersAsync();

      const emitter = (scanner as any)._onDidUpdatePrefix;
      expect(emitter.fire).toHaveBeenCalledWith('new');
      expect(scanner.getControllerPrefix()).toBe('new');
    });
  });

  describe('debouncing', () => {
    it('debounces multiple rapid workspace updates into a single scan', async () => {
      setupFiles({
        '/file.py': 'deephaven_enterprise.controller_import.meta_import()',
      });
      const mock = createMockWorkspace();
      await createScanner(mock);

      // Clear state so we only track calls from the rapid updates below
      mockFindFiles.mockClear();

      // Trigger several rapid updates
      mock.triggerUpdate();
      mock.triggerUpdate();
      mock.triggerUpdate();

      // Advance less than debounce window (500 ms) – no scan yet
      await vi.advanceTimersByTimeAsync(400);
      expect(mockFindFiles).not.toHaveBeenCalled();

      // Advance past the debounce window – exactly one scan
      await vi.advanceTimersByTimeAsync(200);
      expect(mockFindFiles).toHaveBeenCalledTimes(1);
    });

    it('resets debounce timer on each new workspace update', async () => {
      setupFiles({
        '/file.py': 'deephaven_enterprise.controller_import.meta_import()',
      });
      const mock = createMockWorkspace();
      await createScanner(mock);

      mockFindFiles.mockClear();

      // First update
      mock.triggerUpdate();
      await vi.advanceTimersByTimeAsync(300);

      // Second update resets the timer before first fires
      mock.triggerUpdate();
      await vi.advanceTimersByTimeAsync(300);

      // Still not scanned – debounce window not elapsed since last update
      expect(mockFindFiles).not.toHaveBeenCalled();

      // Now let the debounce expire
      await vi.advanceTimersByTimeAsync(300);
      expect(mockFindFiles).toHaveBeenCalledTimes(1);
    });
  });
});
