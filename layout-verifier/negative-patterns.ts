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
 * given width: number[0, 1000]
 * result.overflow < 0
 */
export function negativePathSensitiveMinOverflow(width: number) {
  const capped = Math.min(width, 320)
  const overflow = width - capped
  return {capped, overflow}
}

/** @layout
 * given items.length: int[0, 10]
 * given index: int[0, 10]
 * result < items.length
 */
export function negativeArrayIndexNeedsUpperBound(items: number[], index: number) {
  const length = items.length
  return length >= 0 ? index : index
}

/** @layout
 * given items.length: int[0, 10]
 * result: int[0, 10]
 */
function negativeNeedsShortArray(items: number[]) {
  return items.length
}

/** @layout
 * given items.length: int[0, 20]
 * result: int[0, 20]
 */
export function negativeArrayLengthCallGiven(items: number[]) {
  return negativeNeedsShortArray(items)
}

/** @layout
 * given total: int[0, 6000]
 * given count: int[1, 200]
 * result >= total
 */
export function negativeFloorDivisionDoesNotCoverTotal(total: number, count: number) {
  return Math.floor(total / count) * count
}

/** @layout
 * given pointer: number[0, 1000]
 * given cellSize: int[1, 100]
 * given count: int[1, 10]
 * result < count
 */
export function negativeFloorHitIndexNeedsUpperBound(pointer: number, cellSize: number, count: number) {
  const maxPointer = count * cellSize
  return pointer < maxPointer ? Math.floor(pointer / cellSize) : Math.floor(pointer / cellSize)
}

/** @layout
 * given content: number[0, 1000]
 * given available: number[0, 1000]
 * given scale: number[-2, 2]
 * given content <= available
 * result.scaled <= result.limit
 */
export function negativeScaleNeedsNonNegativeFactor(content: number, available: number, scale: number) {
  return {
    scaled: content * scale,
    limit: available * scale,
  }
}

/** @layout
 * given index: int[0, 10000]
 * given count: int[0, 1000]
 * result < count
 */
export function negativeModuloNeedsPositiveCount(index: number, count: number) {
  return index % count
}

/** @layout
 * given width: number[0, 1000]
 * given minWidth: number[0, 1000]
 * result >= minWidth
 */
export function negativeGuardNeedsReturnOnSmallSide(width: number, minWidth: number) {
  if (width > minWidth) return width
  return width
}

/** @layout
 * given items.length: int[0, 50]
 * given top: number[0, 1000]
 * given step: number[-40, 40]
 * result.bottom >= top
 * monotone(result.rows.top)
 */
export function negativeRunningSumNeedsNonNegativeStep(items: number[], top: number, step: number) {
  const rows = []
  let y = top
  for (const item of items) {
    rows.push({top: y, height: step, source: item})
    y += step
  }
  return {rows, bottom: y}
}

/** @layout
 * given items.length: int[1, 50]
 * given top: number[0, 1000]
 * given step: number[0, 40]
 * given gap: number[0, 10]
 * given otherGap: number[20, 30]
 * contiguousY(result.rows, otherGap)
 */
export function negativeContiguousYNeedsMatchingGap(items: number[], top: number, step: number, gap: number, otherGap: number) {
  const rows = []
  let y = top
  for (const item of items) {
    rows.push({top: y, height: step, source: item})
    y += step + gap
  }
  return {rows, bottom: y - gap, otherGap}
}

/** @layout
 * given items.length: int[1, 50]
 * given top: number[0, 1000]
 * given step: number[0, 40]
 * lastBottom(result.rows) == result.bottom
 */
export function negativeLastBottomNeedsHeightInRows(items: number[], top: number, step: number) {
  const rows = []
  let y = top
  for (const item of items) {
    rows.push({top: y, source: item})
    y += step
  }
  return {rows, bottom: y}
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
