import type { dh as DhcType } from '@deephaven/jsapi-types';
import type { VariableDefintion, VariableID } from '../types';

/**
 * Assert that a given value is not `null` or `undefined`.
 * @param dependency The value to assert.
 * @param name The name of the value to include in the error message if the assertion fails.
 */
export function assertDefined<T>(
  dependency: T | null | undefined,
  name: string
): asserts dependency is T {
  if (dependency == null) {
    throw new Error(`'${name}' is required`);
  }
}

/**
 * Assertion for a value that should never be reached. Useful for exhaustive switch
 * checks.
 * @param shouldBeNever The value that should never be reached.
 * @param name The name of the value to include in the error message if the assertion fails.
 */
export function assertNever(shouldBeNever: never, name?: string): never {
  const label = name == null ? 'value' : `'${name}'`;
  throw new Error(`Unexpected ${label}: ${shouldBeNever}`);
}

/**
 * Assert that given variable is a `VariableID`.
 * @param maybeVariableId
 */
export function assertIsVariableID(
  maybeVariableId: string | null | undefined,
  name: string
): asserts maybeVariableId is VariableID {
  if (typeof maybeVariableId !== 'string') {
    throw new Error(`'${name}' is not a valid VariableID`);
  }
}

/**
 * Assert that given object is a VariableDefinition. This is mostly a type guard
 * to help the type system infer stricter types for `id` and `type` props than
 * specified by the Dh types.
 * @param maybeVariableDefinition
 */
export function assertIsVariableDefintion(
  maybeVariableDefinition: DhcType.ide.VariableDefinition
): asserts maybeVariableDefinition is VariableDefintion {
  const { name, description, id, type, title, applicationId, applicationName } =
    maybeVariableDefinition;

  if (
    [name, description, id, type, title, applicationId, applicationName].some(
      v => typeof v !== 'string'
    )
  ) {
    throw new Error('Invalid VariableDefinition');
  }
}
