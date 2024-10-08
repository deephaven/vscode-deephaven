export const bitValues = [0, 1] as const;
export const boolValues = [true, false] as const;

/**
 * Generate a 2 dimensional array of all possible combinations of the given value
 * lists.
 *
 * e.g.
 * matrix([1, 2], ['a', 'b']) => [[1, 'a'], [1, 'b'], [2, 'a'], [2, 'b']]
 *
 * matrix([1, 2], ['a', 'b', 'c']) => [
 *  [1, 'a'], [1, 'b'], [1, 'c'],
 *  [2, 'a'], [2, 'b'], [2, 'c'],
 * ]
 *
 * @param args Value lists
 * @returns 2D array of all possible combinations
 */
export function matrix<
  TArgs extends (unknown[] | readonly unknown[])[],
  TReturn extends { [P in keyof TArgs]: TArgs[P][number] },
>(...args: TArgs): TReturn[] {
  const [first, ...rest] = args;

  if (rest.length === 0) {
    return first.map(value => [value] as TReturn);
  }

  // recursively call matrix
  const restMatrix = matrix(...rest);

  return first.flatMap(value =>
    restMatrix.map(values => [value, ...values] as TReturn)
  );
}
