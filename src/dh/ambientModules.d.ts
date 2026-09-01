/**
 * Ambient module declarations for packages that are referenced by the type
 * declarations of our dependencies but are not installed in this project.
 *
 * IMPORTANT: this file must stay a global *script* — do NOT add a top-level
 * `import` or `export`. That would make it a module, where `declare module 'x'`
 * means *augmenting* an existing module; these modules are not installed, so
 * there would be nothing to augment. Only a script-file ambient declaration
 * creates the module and lets the import resolve.
 */

// `@deephaven-enterprise/query-utils@2026.x` ships a `.d.ts` (QueryUtils.d.ts)
// that does `import type { UriVariableDescriptor } from '@deephaven/jsapi-bootstrap'`,
// but does not declare `@deephaven/jsapi-bootstrap` as a dependency and it is
// not installed. Declare a minimal stub so the type import resolves (TS2307).
declare module '@deephaven/jsapi-bootstrap' {
  type UriVariableDescriptor = string;
}
