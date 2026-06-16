/**
 * Ambient module declarations for packages that are referenced by the type
 * declarations of our dependencies but are not installed in this project.
 *
 * IMPORTANT: This file must stay a global *script* — do NOT add any top-level
 * `import` or `export`. A `.d.ts` with a top-level import/export becomes a
 * *module*, and inside a module `declare module 'x'` is treated as
 * *augmentation* of an already-existing module. These modules are not
 * installed, so there is nothing to augment; only a script-file *ambient module
 * declaration* actually creates the module and lets the import resolve.
 */

// `@deephaven-enterprise/query-utils@2026.x` ships a `.d.ts` (QueryUtils.d.ts)
// that does `import type { UriVariableDescriptor } from '@deephaven/jsapi-bootstrap'`,
// but does not declare `@deephaven/jsapi-bootstrap` as a dependency and it is
// not installed. Declare a minimal stub so the type import resolves (TS2307).
declare module '@deephaven/jsapi-bootstrap' {
  type UriVariableDescriptor = string;
}
