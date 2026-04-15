// Intentionally bad checker patterns. `bun run verify:layout` compares their
// stable messages against negative-patterns.expected.txt.

/** @layout
 * given value: int[0, 10]
 * result: int[0, 4]
 */
export function negativeOutputRange(value: number) {
  return value + 5
}

/** @layout
 * given value: number[0, 5]
 * result.high < result.low
 */
export function negativeComparison(value: number) {
  const low = value
  const high = value + 10
  return {low, high}
}

/** @layout
 * given value: number[0, 10]
 * result: number[0, 10]
 */
function negativeNeedsSmallValue(value: number) {
  return value
}

/** @layout
 * given value: number[0, 20]
 * result: number[0, 20]
 */
export function negativeCallGiven(value: number) {
  return negativeNeedsSmallValue(value)
}

/** @layout
 * given containee: number[0, 1000]
 * given container: number[0, 1000]
 * given container >= containee
 * result >= 0
 */
function negativeNeedsContainerFit(containee: number, container: number) {
  return (container - containee) / 2
}

/** @layout
 * given containee: number[100, 200]
 * given container: number[0, 50]
 * result: number[-100, 0]
 */
export function negativeRelationalCallGiven(containee: number, container: number) {
  return negativeNeedsContainerFit(containee, container)
}

/** @layout
 * given containee: number[0, 1000]
 * given padding: number[-100, 100]
 * given container: number[0, 1200]
 * given container >= containee + padding
 * result.offset >= 0
 */
export function negativeLinearReductionNeedsNonNegativePadding(containee: number, padding: number, container: number) {
  return {offset: (container - containee) / 2, padding}
}
