import {
  buildStaticLayoutReport,
  check,
  concreteArray,
  concreteNull,
  concreteNumber,
  concreteObject,
  concreteString,
  epsilon,
  expectArray,
  expectConcreteNumber,
  expectObject,
  expectString,
  getProp,
  type InternalLawSummary,
  LoweredProgramAnalyzer,
  type StaticLayoutVerificationReport,
  type Value,
} from '../core'

export function runScrollAnchorStaticVerification(sourceText: string): StaticLayoutVerificationReport {
  const analyzer = new LoweredProgramAnalyzer(sourceText, {})
  const laws = new Map<string, InternalLawSummary>()

  verifyLayoutShape(analyzer, laws)
  verifyAnchorPreservation(analyzer, laws)
  verifyHeightGrowsWithItems(analyzer, laws)

  return buildStaticLayoutReport('scroll-anchor-static-layout', 'demos/scroll-anchor/anchor-layout.ts', laws)
}

function verifyLayoutShape(analyzer: LoweredProgramAnalyzer, laws: Map<string, InternalLawSummary>) {
  const items = concreteItems([
    ['A', 'Today'],
    ['B', 'Today'],
    ['C', 'Today'],
    ['D', 'Yesterday'],
    ['E', 'Yesterday'],
  ])
  const returns = evaluateAnchorLayout(analyzer, items, 0, null, null, 0, true)
  check(laws, 'computeAnchorLayout stays branch-free per concrete scenario', returns.length === 1, () => ({
    cases: returns.length,
  }), 'concrete-fixture')
  if (returns.length !== 1) return

  const result = expectObject(returns[0]!.value)
  const totalHeight = expectConcreteNumber(getProp(result, 'totalHeight'))
  const itemPositions = expectArray(getProp(result, 'itemPositions'))
  const headerPositions = expectArray(getProp(result, 'headerPositions'))
  const expectedHeight =
    analyzer.getGlobalNumber('headerGapFirst') +
    analyzer.getGlobalNumber('headerHeight') +
    analyzer.getGlobalNumber('headerGapBottom') +
    3 * analyzer.getGlobalNumber('itemHeight') +
    2 * analyzer.getGlobalNumber('itemGap') +
    analyzer.getGlobalNumber('headerGapRest') +
    analyzer.getGlobalNumber('headerHeight') +
    analyzer.getGlobalNumber('headerGapBottom') +
    2 * analyzer.getGlobalNumber('itemHeight') +
    analyzer.getGlobalNumber('itemGap')

  check(laws, 'computeAnchorLayout total height matches grouped item geometry', Math.abs(totalHeight - expectedHeight) <= epsilon, () => ({
    totalHeight,
    expectedHeight,
  }), {kind: 'concrete-fixture', targets: ['computeAnchorLayout.totalHeight']})
  check(laws, 'computeAnchorLayout returns one positioned output per input item', itemPositions.items.length === 5, () => ({
    itemPositions: itemPositions.items.length,
  }), {kind: 'concrete-fixture', targets: ['computeAnchorLayout.itemPositions']})
  check(laws, 'computeAnchorLayout returns one header per day group', headerPositions.items.length === 2, () => ({
    headerPositions: headerPositions.items.length,
  }), {kind: 'concrete-fixture', targets: ['computeAnchorLayout.headerPositions']})
}

function verifyAnchorPreservation(analyzer: LoweredProgramAnalyzer, laws: Map<string, InternalLawSummary>) {
  const originalItems = concreteItems([
    ['A', 'Today'],
    ['B', 'Today'],
    ['C', 'Today'],
    ['D', 'Yesterday'],
    ['E', 'Yesterday'],
  ])
  const scrollTop = 200
  const beforeReturns = evaluateAnchorLayout(analyzer, originalItems, scrollTop, null, null, 0, true)
  if (beforeReturns.length !== 1) return
  const before = expectObject(beforeReturns[0]!.value)
  const anchor = getProp(before, 'newAnchor')
  if (anchor.kind === 'null') return
  const anchorObject = expectObject(anchor)
  const anchorId = expectString(getProp(anchorObject, 'id')).value
  const anchorPrevY = expectConcreteNumber(getProp(anchorObject, 'prevY'))
  const beforeScreenY = anchorPrevY - scrollTop

  const prependedItems = concreteItems([
    ['X1', 'Today'],
    ['X2', 'Today'],
    ['X3', 'Today'],
    ['A', 'Today'],
    ['B', 'Today'],
    ['C', 'Today'],
    ['D', 'Yesterday'],
    ['E', 'Yesterday'],
  ])
  const afterReturns = evaluateAnchorLayout(analyzer, prependedItems, scrollTop, null, anchorId, anchorPrevY, false)
  if (afterReturns.length !== 1) return
  const after = expectObject(afterReturns[0]!.value)
  const adjustedScrollTop = expectConcreteNumber(getProp(after, 'adjustedScrollTop'))
  const itemPositions = expectArray(getProp(after, 'itemPositions'))
  const anchorY = getItemY(itemPositions.items, anchorId)
  if (anchorY == null) return

  const afterScreenY = anchorY - adjustedScrollTop
  check(laws, 'prepending items preserves the anchored item screen y', Math.abs(afterScreenY - beforeScreenY) <= epsilon, () => ({
    anchorId,
    beforeScreenY,
    afterScreenY,
    adjustedScrollTop,
    anchorY,
  }), {kind: 'concrete-fixture', targets: ['computeAnchorLayout.adjustedScrollTop', 'computeAnchorLayout.itemPositions']})
}

function verifyHeightGrowsWithItems(analyzer: LoweredProgramAnalyzer, laws: Map<string, InternalLawSummary>) {
  let previousHeight = 0
  const counts = [1, 3, 5, 8]
  for (const count of counts) {
    const items: Array<[string, string]> = []
    for (let i = 0; i < count; i++) items.push([`A${i}`, 'Today'])
    const returns = evaluateAnchorLayout(analyzer, concreteItems(items), 0, null, null, 0, true)
    if (returns.length !== 1) continue
    const result = expectObject(returns[0]!.value)
    const totalHeight = expectConcreteNumber(getProp(result, 'totalHeight'))
    check(laws, 'computeAnchorLayout total height grows with item count', totalHeight > previousHeight, () => ({
      count,
      totalHeight,
      previousHeight,
    }), {kind: 'concrete-fixture', targets: ['computeAnchorLayout.totalHeight']})
    previousHeight = totalHeight
  }
}

function evaluateAnchorLayout(
  analyzer: LoweredProgramAnalyzer,
  items: ReturnType<typeof concreteArray>,
  currentScrollTop: number,
  requestedScrollTop: number | null,
  anchorId: string | null,
  anchorPrevY: number,
  userScrolled: boolean,
) {
  return analyzer.evaluateFunction('computeAnchorLayout', [
    items,
    concreteNumber(currentScrollTop),
    requestedScrollTop == null ? concreteNull('concrete') : concreteNumber(requestedScrollTop),
    anchorId == null ? concreteNull('concrete') : concreteString(anchorId),
    concreteNumber(anchorPrevY),
    {kind: 'boolean', mode: 'concrete', value: userScrolled} as const,
  ], 'concrete')
}

function concreteItems(items: Array<[string, string]>) {
  return concreteArray(items.map(([id, day]) => concreteObject({
    id: concreteString(id),
    day: concreteString(day),
  })))
}

function getItemY(items: Value[], id: string) {
  for (const itemValue of items) {
    const item = expectObject(itemValue)
    if (expectString(getProp(item, 'id')).value === id) return expectConcreteNumber(getProp(item, 'y'))
  }
  return null
}
