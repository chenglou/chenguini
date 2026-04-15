// Intentionally bad checker patterns. `bun run verify:layout` compares their
// normalized diagnostics against negative-patterns.expected.txt.

/** @layout
 * requires value: int[0, 10]
 * ensures result: int[0, 4]
 */
export function negativeOutputRange(value: number) {
  return value + 5
}

/** @layout
 * requires value: number[0, 5]
 * ensures result.high < result.low
 */
export function negativeComparison(value: number) {
  const low = value
  const high = value + 10
  return {low, high}
}

/** @layout
 * requires value: number[0, 10]
 * ensures result: number[0, 10]
 */
function negativeNeedsSmallValue(value: number) {
  return value
}

/** @layout
 * requires value: number[0, 20]
 * ensures result: number[0, 20]
 */
export function negativeCallRequires(value: number) {
  return negativeNeedsSmallValue(value)
}

/** @layout
 * requires containee: number[0, 1000]
 * requires container: number[0, 1000]
 * requires container >= containee
 * ensures result >= 0
 */
function negativeNeedsContainerFit(containee: number, container: number) {
  return (container - containee) / 2
}

/** @layout
 * requires containee: number[100, 200]
 * requires container: number[0, 50]
 * ensures result: number[-100, 0]
 */
export function negativeRelationalCallRequires(containee: number, container: number) {
  return negativeNeedsContainerFit(containee, container)
}
