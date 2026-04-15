// Runnable checker pattern specimen. `bun run verify:layout` must run this file.
//
// Queued patterns:
// - clamp / min / max cap proofs that need path-sensitive narrowing
// - running `y` loops
// - append-only arrays
// - `sameLength`
// - `contiguousY`
// - `monotone`
// - `lastBottom`
// - half-open hit rects
// - `rectInside`
// - `rectEquals`
// - `nonOverlapX` / `nonOverlapY`
// - `life-calendar` numeric sizing: `**`, `Math.sqrt`, `Math.ceil`, positive-domain facts, integer facts after `ceil`
// - track/vector reasoning: tables, grids, flex-like negotiation, spanning constraints
// - Pretext text facts: line width fits, fragments are ordered, fragments cover ranges, selection rects reuse paint fragments
// - scroll-anchor stability as a userland geometry relation

const patternGap = 4

/** @layout
 * requires width: int[320, 1600]
 * ensures result: int[320, 1600]
 */
export function constantBoundedInput(width: number) {
  return width
}

/** @layout
 * requires value: int[0, 10]
 * ensures result: int[5, 15]
 */
export function outputRangeFact(value: number) {
  const shifted = value + 5
  return shifted
}

/** @layout
 * requires value: number[0, 5]
 * ensures result.high > result.low
 * ensures result.low < result.high
 */
export function scalarComparisons(value: number) {
  const low = value
  const high = value + 10
  return {low, high}
}

/** @layout
 * requires value: int[0, 5]
 * ensures result.square: int[0, 25]
 * ensures result.half: number[0, 2.5]
 */
export function straightLineArithmetic(value: number) {
  const square = value ** 2
  const half = value / 2
  return {square, half}
}

/** @layout
 * requires value: number[10, 20]
 * ensures result.width: number[14, 24]
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
 * requires value: number[0, 10]
 * ensures result: number[4, 14]
 */
export function sameFilePureHelperCall(value: number) {
  return addPatternGap(value)
}

/** @layout
 * requires value: int[0, 10]
 * ensures result: int[3, 7]
 */
export function ternaryBranchJoin(value: number) {
  return value > 5 ? 7 : 3
}

/** @layout
 * requires value: number[2, 8]
 * ensures result.floorValue: int[1, 4]
 * ensures result.ceilValue: int[1, 4]
 * ensures result.sqrtValue: number[1, 3]
 * ensures result.minValue <= 4
 * ensures result.maxValue >= 4
 */
export function mathSubset(value: number) {
  const half = value / 2
  return {
    floorValue: Math.floor(half),
    ceilValue: Math.ceil(half),
    sqrtValue: Math.sqrt(value),
    minValue: Math.min(value, 4),
    maxValue: Math.max(value, 4),
  }
}

/** @layout
 * requires containee: number[0, 10000]
 * requires container: number[0, 10000]
 * ensures result == (container - containee) / 2
 */
export function exactExpressionIdentity(containee: number, container: number) {
  return (container - containee) / 2
}

/** @layout
 * requires containee: number[0, 1000]
 * requires container: number[0, 1000]
 * requires container >= containee
 * ensures result >= 0
 */
export function centeredOffset(containee: number, container: number) {
  return (container - containee) / 2
}

/** @layout
 * requires containee: number[0, 1000]
 * requires container: number[0, 1000]
 * requires container >= containee
 * ensures result >= 0
 */
export function centeredOffsetThroughHelper(containee: number, container: number) {
  return centeredOffset(containee, container)
}

/** @layout
 * requires value: number[4, 14]
 * ensures result: number[5, 15]
 */
function trackedInnerRequires(value: number) {
  return value + 1
}

/** @layout
 * requires value: number[0, 10]
 * ensures result: number[5, 15]
 */
function trackedMiddleRequires(value: number) {
  return trackedInnerRequires(value + patternGap)
}

/** @layout
 * requires value: number[0, 10]
 * ensures result: number[5, 15]
 */
export function transitiveRequiresTracking(value: number) {
  return trackedMiddleRequires(value)
}
