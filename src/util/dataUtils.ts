/**
 * Create a sort comparator function that compares a stringified property on
 * 2 objects.
 * @param propName Prop to compare
 */
export function sortByStringProp<TPropName extends string>(
  propName: TPropName
) {
  return <TValue extends { [P in TPropName]: unknown }>(
    a: TValue,
    b: TValue
  ): number => {
    return String(a[propName]).localeCompare(String(b[propName]));
  };
}
