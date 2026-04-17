const DEFAULT_META_IMPORT_PREFIX = 'controller' as const;

/**
 * Extract controller prefixes from Python source code that uses
 * `deephaven_enterprise.controller_import.meta_import()`.
 *
 * Supported patterns:
 * 1. `import deephaven_enterprise.controller_import` + `deephaven_enterprise.controller_import.meta_import()` call
 * 2. `from deephaven_enterprise import controller_import` + `controller_import.meta_import()` call
 * 3. `from deephaven_enterprise.controller_import import meta_import` + `meta_import()` call
 *
 * Limitations:
 * - Import aliases are not detected
 * - Multiline calls are not detected
 *
 * @param pythonCode The Python source code to scan.
 * @returns A set of controller import prefixes found in the code.
 */
export function extractControllerImportPrefixes(
  pythonCode: string
): Set<string> {
  const prefixes = new Set<string>();

  // Pattern 1: deephaven_enterprise.controller_import.meta_import() direct call
  const directCallPattern =
    /deephaven_enterprise\.controller_import\.meta_import\(\s*(?:["'](\w+)["'])?\s*\)/g;
  let match: RegExpExecArray | null;

  while ((match = directCallPattern.exec(pythonCode)) !== null) {
    prefixes.add(match[1] ?? DEFAULT_META_IMPORT_PREFIX);
  }

  // Pattern 2: from deephaven_enterprise import controller_import
  //            followed by controller_import.meta_import() call
  const fromModulePattern =
    /from\s+deephaven_enterprise\s+import\s+controller_import/;
  if (fromModulePattern.test(pythonCode)) {
    const callPattern =
      /controller_import\.meta_import\(\s*(?:["'](\w+)["'])?\s*\)/g;

    while ((match = callPattern.exec(pythonCode)) !== null) {
      prefixes.add(match[1] ?? DEFAULT_META_IMPORT_PREFIX);
    }
  }

  // Pattern 3: from deephaven_enterprise.controller_import import meta_import
  //            followed by meta_import() call
  const fromImportPattern =
    /from\s+deephaven_enterprise\.controller_import\s+import\s+meta_import/;
  if (fromImportPattern.test(pythonCode)) {
    const callPattern = /\bmeta_import\(\s*(?:["'](\w+)["'])?\s*\)/g;

    while ((match = callPattern.exec(pythonCode)) !== null) {
      prefixes.add(match[1] ?? DEFAULT_META_IMPORT_PREFIX);
    }
  }

  return prefixes;
}
