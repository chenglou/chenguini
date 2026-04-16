// Runnable checker pattern specimen. `bun run verify:layout` must run this file.
//
// Queued patterns:
// - `contiguousY`
// - `monotone`
// - `lastBottom`
// - `rectInside`
// - `rectEquals`
// - `nonOverlapX` / `nonOverlapY`
// - `life-calendar` numeric sizing: `**`, `Math.sqrt`, `Math.ceil`, positive-domain facts, integer facts after `ceil`
// - column/row width reasoning: tables, grids, flex-like negotiation, cells that cover multiple columns
// - Pretext text facts: line width fits, fragments are ordered, fragments cover ranges, selection rects reuse paint fragments
// - scroll-anchor stability as a userland geometry relation

const patternGap = 4

/** @layout
 * given width: int[320, 1600]
 * result: int[320, 1600]
 */
export function constantBoundedInput(width: number) {
  return width
}

/** @layout
 * given value: int[0, 10]
 * result: int[5, 15]
 */
export function outputRangeFact(value: number) {
  const shifted = value + 5
  return shifted
}

/** @layout
 * given value: number[0, 5]
 * result.high > result.low
 * result.low < result.high
 */
export function scalarComparisons(value: number) {
  const low = value
  const high = value + 10
  return {low, high}
}

/** @layout
 * given value: int[0, 5]
 * result.square: int[0, 25]
 * result.half: number[0, 2.5]
 */
export function straightLineArithmetic(value: number) {
  const square = value ** 2
  const half = value / 2
  return {square, half}
}

/** @layout
 * given value: number[10, 20]
 * result.width: number[14, 24]
 */
export function objectReturnPropertyAccess(value: number) {
  const width = value + patternGap
  const height = value * 2
  return {width, height}
}

function addPatternGap(value: number) {
  return value + patternGap
}

/** @layout
 * given value: number[0, 10]
 * result: number[4, 14]
 */
export function sameFilePureHelperCall(value: number) {
  return addPatternGap(value)
}

/** @layout
 * given value: int[0, 10]
 * result: int[3, 7]
 */
export function ternaryBranchJoin(value: number) {
  return value > 5 ? 7 : 3
}

/** @layout
 * given value: number[2, 8]
 * result.floorValue: int[1, 4]
 * result.ceilValue: int[1, 4]
 * result.floorValue <= value / 2
 * value / 2 >= result.floorValue
 * result.ceilValue >= value / 2
 * value / 2 <= result.ceilValue
 * result.roundValue: int[1, 4]
 * result.truncValue: int[1, 4]
 * result.sqrtValue: number[1, 3]
 * result.absValue: number[0, 3]
 * result.minValue: number[2, 4]
 * result.minValue <= 4
 * result.maxValue: number[4, 8]
 * result.maxValue >= 4
 */
export function mathSubset(value: number) {
  const half = value / 2
  const shifted = value - 5
  return {
    floorValue: Math.floor(half),
    ceilValue: Math.ceil(half),
    roundValue: Math.round(half),
    truncValue: Math.trunc(half),
    sqrtValue: Math.sqrt(value),
    absValue: Math.abs(shifted),
    minValue: Math.min(value, 4),
    maxValue: Math.max(value, 4),
  }
}

/** @layout
 * given total: int[0, 6000]
 * given count: int[1, 200]
 * result >= total
 */
export function ceilDivisionCoversTotal(total: number, count: number) {
  return Math.ceil(total / count) * count
}

/** @layout
 * given pointer: number[0, 100000]
 * given cellSize: int[1, 1000]
 * given count: int[1, 1000]
 * given pointer < count * cellSize
 * result >= 0
 * result < count
 */
export function floorHitIndexInsideCount(pointer: number, cellSize: number, count: number) {
  const maxPointer = count * cellSize
  return pointer < maxPointer ? Math.floor(pointer / cellSize) : Math.floor(pointer / cellSize)
}

/** @layout
 * given content: number[0, 1000]
 * given available: number[0, 1000]
 * given scale: number[0, 8]
 * given content <= available
 * result.scaled <= result.limit
 * result.swapped <= result.limit
 */
export function positiveScaleKeepsOrder(content: number, available: number, scale: number) {
  return {
    scaled: content * scale,
    swapped: scale * content,
    limit: available * scale,
  }
}

/** @layout
 * given content: number[0, 1000]
 * given available: number[0, 1000]
 * given columns: int[1, 12]
 * given content <= available
 * result.cell <= result.maxCell
 */
export function positiveDivisionKeepsOrder(content: number, available: number, columns: number) {
  return {
    cell: content / columns,
    maxCell: available / columns,
  }
}

/** @layout
 * given index: int[0, 10000]
 * given count: int[1, 1000]
 * result: int[0, 999]
 * result < count
 */
export function moduloWrapsInsideCount(index: number, count: number) {
  return index % count
}

/** @layout
 * given width: number[0, 1000]
 * given minWidth: number[0, 1000]
 * result >= minWidth
 */
export function guardReturnKeepsMinimum(width: number, minWidth: number) {
  if (width < minWidth) return minWidth
  return width
}

/** @layout
 * given items.length: int[0, 50]
 * given top: number[0, 1000]
 * given step: number[0, 40]
 * given gap: number[0, 10]
 * result.rows.length == items.length
 * result.bottom: number[0, 3500]
 * result.bottom >= top
 */
export function runningSumLoop(items: number[], top: number, step: number, gap: number) {
  const rows = []
  let y = top
  for (const item of items) {
    rows.push({top: y, source: item})
    y += step + gap
  }
  return {rows, bottom: y}
}

/** @layout
 * given width: number[0, 1000]
 * result.capped: number[0, 320]
 * result.overflow >= 0
 */
export function pathSensitiveMinOverflow(width: number) {
  const capped = Math.min(width, 320)
  const overflow = width - capped
  return {capped, overflow}
}

/** @layout
 * given width: number[0, 1000]
 * given padding: number[0, 120]
 * result.content: number[0, 1000]
 * result.leftover >= 0
 */
export function pathSensitiveMaxLeftover(width: number, padding: number) {
  const content = Math.max(width - padding, 0)
  const leftover = width - content
  return {content, leftover}
}

/** @layout
 * given value: number[-1000, 1000]
 * given min: number[-1000, 1000]
 * given max: number[-1000, 1000]
 * given max >= min
 * result >= min
 * result <= max
 */
function clampLayoutValue(value: number, min: number, max: number) {
  return Math.max(min, Math.min(value, max))
}

/** @layout
 * given value: number[-1000, 1000]
 * result: number[0, 320]
 */
export function userlandClamp(value: number) {
  return clampLayoutValue(value, 0, 320)
}

/** @layout
 * given items.length: int[0, 100]
 * result: int[0, 100]
 */
export function arrayLengthRange(items: number[]) {
  return items.length
}

/** @layout
 * result: int[3, 3]
 */
export function arrayLiteralLength() {
  const values = [10, 20, 30]
  return values.length
}

/** @layout
 * given index: int[0, 2]
 * result: int[10, 30]
 */
export function arrayLiteralIndex(index: number) {
  return [10, 20, 30][index]
}

/** @layout
 * given items.length: int[0, 100]
 * given index: int[0, 100]
 * given index < items.length
 * result.index >= 0
 * result.index < items.length
 * result.length == items.length
 */
export function halfOpenArrayIndex(items: number[], index: number) {
  return {index, length: items.length}
}

/** @layout
 * given items.length: int[0, 20]
 * result.length: int[1, 21]
 * result.length == items.length + 1
 */
export function spreadAppendLength(items: number[], value: number) {
  return [...items, value]
}

/** @layout
 * given items.length: int[0, 10]
 * result: int[0, 10]
 */
function shortArrayLength(items: number[]) {
  return items.length
}

/** @layout
 * given items.length: int[0, 10]
 * result: int[0, 10]
 */
export function arrayLengthGivenThroughHelper(items: number[]) {
  return shortArrayLength(items)
}

/** @layout
 * given containee: number[0, 10000]
 * given container: number[0, 10000]
 * result == (container - containee) / 2
 */
export function exactExpressionIdentity(containee: number, container: number) {
  return (container - containee) / 2
}

/** @layout
 * given containee: number[0, 1000]
 * given container: number[0, 1000]
 * given container >= containee
 * result >= 0
 */
export function centeredOffset(containee: number, container: number) {
  return (container - containee) / 2
}

/** @layout
 * given containee: number[0, 1000]
 * given container: number[0, 1000]
 * given container >= containee
 * result >= 0
 */
export function centeredOffsetThroughHelper(containee: number, container: number) {
  return centeredOffset(containee, container)
}

/** @layout
 * given containee: number[0, 1000]
 * given padding: number[0, 100]
 * given container: number[0, 1200]
 * given container >= containee + padding
 * result.offset >= 0
 */
export function centeredOffsetWithPaddingSlack(containee: number, padding: number, container: number) {
  return {offset: (container - containee) / 2, padding}
}

/** @layout
 * given value: number[4, 14]
 * result: number[5, 15]
 */
function trackedInnerGiven(value: number) {
  return value + 1
}

/** @layout
 * given value: number[0, 10]
 * result: number[5, 15]
 */
function trackedMiddleGiven(value: number) {
  return trackedInnerGiven(value + patternGap)
}

/** @layout
 * given value: number[0, 10]
 * result: number[5, 15]
 */
export function transitiveGivenTracking(value: number) {
  return trackedMiddleGiven(value)
}
