import {
  buildStaticLayoutReport,
  check,
  concreteArray,
  concreteNumber,
  concreteObject,
  concreteString,
  epsilon,
  expectArray,
  expectConcreteNumber,
  expectObject,
  expectRangeNumber,
  expectRangeObject,
  getProp,
  getRangeProp,
  type InternalLawSummary,
  joinRangeCases,
  LoweredProgramAnalyzer,
  rangeArray,
  rangeNumber,
  type StaticLayoutVerificationReport,
  type WitnessValue,
} from '../core'

export function runPageBreakStaticVerification(sourceText: string): StaticLayoutVerificationReport {
  const analyzer = new LoweredProgramAnalyzer(sourceText, {})
  const laws = new Map<string, InternalLawSummary>()

  verifyPageBreakConcrete(analyzer, laws)
  verifyBudgetCoherence(analyzer, laws)
  verifyPromotionSweep(analyzer, laws)
  verifyPromotedBundleRange(analyzer, laws)

  return buildStaticLayoutReport(
    'page-break-static-layout',
    'demos/layout-kernels/page-break-bundles.ts',
    laws,
  )
}

function verifyPageBreakConcrete(
  analyzer: LoweredProgramAnalyzer,
  laws: Map<string, InternalLawSummary>,
) {
  const layout = concretePagination(analyzer, [
    flowBlock(0, 'body', 70, 0),
    flowBlock(1, 'heading', 20, 0),
    flowBlock(2, 'topFloat', 25, 0),
    flowBlock(3, 'topFloat', 15, 0),
    flowBlock(4, 'body', 10, 0),
  ], 80)

  const placements = expectArray(getProp(layout, 'placements'))
  const pages = expectArray(getProp(layout, 'pages'))
  const promotions = expectArray(getProp(layout, 'promotions'))

  check(laws, 'page-break flow reorders promoted top floats ahead of their heading', placements.items.length === 5
    && orderFor(placements) === '0,2,3,1,4'
    && placementPage(placements, 2) === 1
    && placementTop(placements, 2) === 0
    && placementPage(placements, 3) === 1
    && placementTop(placements, 3) === 25
    && placementPage(placements, 1) === 1
    && placementTop(placements, 1) === 40
    && placementTop(placements, 4) === 60
    && promotions.items.length === 1, () => ({
      order: orderFor(placements),
      floatPage: placementPage(placements, 2),
      floatTop: placementTop(placements, 2),
      headingPage: placementPage(placements, 1),
      headingTop: placementTop(placements, 1),
      promotionCount: promotions.items.length,
    }), {kind: 'concrete-fixture', targets: [
      'paginateBlockFlow.placements[].sourceIndex',
      'paginateBlockFlow.placements[].pageIndex',
      'paginateBlockFlow.placements[].top',
      'paginateBlockFlow.promotions',
    ]})

  check(laws, 'page-break flow keeps every concrete page within budget', pages.items.length === 2
    && expectConcreteNumber(getProp(expectObject(pages.items[0]!), 'usedHeight')) === 70
    && expectConcreteNumber(getProp(expectObject(pages.items[0]!), 'remainingHeight')) === 10
    && expectConcreteNumber(getProp(expectObject(pages.items[1]!), 'usedHeight')) === 70
    && expectConcreteNumber(getProp(expectObject(pages.items[1]!), 'remainingHeight')) === 10, () => ({
      page0UsedHeight: pages.items.length > 0 ? expectConcreteNumber(getProp(expectObject(pages.items[0]!), 'usedHeight')) : -1,
      page0RemainingHeight: pages.items.length > 0 ? expectConcreteNumber(getProp(expectObject(pages.items[0]!), 'remainingHeight')) : -1,
      page1UsedHeight: pages.items.length > 1 ? expectConcreteNumber(getProp(expectObject(pages.items[1]!), 'usedHeight')) : -1,
      page1RemainingHeight: pages.items.length > 1 ? expectConcreteNumber(getProp(expectObject(pages.items[1]!), 'remainingHeight')) : -1,
    }), {kind: 'concrete-fixture', targets: [
      'paginateBlockFlow.pages[].usedHeight',
      'paginateBlockFlow.pages[].remainingHeight',
    ]})

  const keepLayout = concretePagination(analyzer, [
    flowBlock(0, 'body', 50, 0),
    flowBlock(1, 'body', 20, 1),
    flowBlock(2, 'body', 15, 0),
  ], 70)
  const keepPlacements = expectArray(getProp(keepLayout, 'placements'))
  check(laws, 'page-break flow honors keep-with-next pairs when the pair only fits on the next page', keepPlacements.items.length === 3
    && placementPage(keepPlacements, 1) === 1
    && placementTop(keepPlacements, 1) === 0
    && placementPage(keepPlacements, 2) === 1
    && placementTop(keepPlacements, 2) === 20, () => ({
      keptPage: placementPage(keepPlacements, 1),
      keptTop: placementTop(keepPlacements, 1),
      nextPage: placementPage(keepPlacements, 2),
      nextTop: placementTop(keepPlacements, 2),
    }), {kind: 'concrete-fixture', targets: [
      'paginateBlockFlow.placements[].sourceIndex',
      'paginateBlockFlow.placements[].pageIndex',
      'paginateBlockFlow.placements[].top',
    ]})
}

function verifyBudgetCoherence(
  analyzer: LoweredProgramAnalyzer,
  laws: Map<string, InternalLawSummary>,
) {
  const pageHeight = 80
  const layout = concretePagination(analyzer, [
    flowBlock(0, 'body', 70, 0),
    flowBlock(1, 'heading', 20, 0),
    flowBlock(2, 'topFloat', 25, 0),
    flowBlock(3, 'topFloat', 15, 0),
    flowBlock(4, 'body', 10, 0),
  ], pageHeight)

  const pages = expectArray(getProp(layout, 'pages'))
  const placements = expectArray(getProp(layout, 'placements'))
  let coherent = true
  let failure: Record<string, WitnessValue> | null = null

  for (let pageIndex = 0; pageIndex < pages.items.length; pageIndex++) {
    const page = expectObject(pages.items[pageIndex]!)
    const usedHeight = expectConcreteNumber(getProp(page, 'usedHeight'))
    const remainingHeight = expectConcreteNumber(getProp(page, 'remainingHeight'))
    if (Math.abs(usedHeight + remainingHeight - pageHeight) > epsilon) {
      coherent = false
      failure ??= {pageIndex, usedHeight, remainingHeight, pageHeight}
    }

    const blocks = expectArray(getProp(page, 'blocks'))
    let summedHeight = 0
    for (let blockIndex = 0; blockIndex < blocks.items.length; blockIndex++) {
      summedHeight += expectConcreteNumber(getProp(expectObject(blocks.items[blockIndex]!), 'totalHeight'))
    }
    if (Math.abs(summedHeight - usedHeight) > epsilon) {
      coherent = false
      failure ??= {pageIndex, summedHeight, usedHeight}
    }
  }

  for (let placementIndex = 0; placementIndex < placements.items.length; placementIndex++) {
    const placement = expectObject(placements.items[placementIndex]!)
    const pageIndex = expectConcreteNumber(getProp(placement, 'pageIndex'))
    const top = expectConcreteNumber(getProp(placement, 'top'))
    const bottom = expectConcreteNumber(getProp(placement, 'bottom'))
    if (top < -epsilon || bottom > pageHeight + epsilon || bottom < top - epsilon) {
      coherent = false
      failure ??= {pageIndex, top, bottom, pageHeight}
    }
  }

  check(laws, 'page-break flow keeps page budgets coherent for every placed block', coherent, () => failure ?? {}, {kind: 'concrete-fixture', targets: [
    'paginateBlockFlow.pages[].usedHeight',
    'paginateBlockFlow.pages[].remainingHeight',
    'paginateBlockFlow.placements[].top',
    'paginateBlockFlow.placements[].bottom',
  ]})
}

function verifyPromotionSweep(
  analyzer: LoweredProgramAnalyzer,
  laws: Map<string, InternalLawSummary>,
) {
  for (let leadHeight = 0; leadHeight <= 50; leadHeight += 5) {
    const layout = concretePagination(analyzer, [
      flowBlock(0, 'body', leadHeight, 0),
      flowBlock(1, 'heading', 20, 0),
      flowBlock(2, 'topFloat', 24, 0),
      flowBlock(3, 'topFloat', 16, 0),
      flowBlock(4, 'body', 8, 0),
    ], 80)
    const placements = expectArray(getProp(layout, 'placements'))
    const promotions = expectArray(getProp(layout, 'promotions'))
    const expectedPromoted = leadHeight > 20
    const headingPage = placementPage(placements, 1)
    const headingTop = placementTop(placements, 1)
    const firstFloatPage = placementPage(placements, 2)
    const firstFloatTop = placementTop(placements, 2)
    const secondFloatTop = placementTop(placements, 3)
    const order = orderFor(placements)
    const passed = expectedPromoted
      ? promotions.items.length === 1
        && order === '0,2,3,1,4'
        && firstFloatPage === 1
        && firstFloatTop === 0
        && secondFloatTop === 24
        && headingPage === 1
        && headingTop === 40
      : promotions.items.length === 0
        && order === '0,1,2,3,4'
        && headingPage === 0
        && headingTop === leadHeight
        && firstFloatPage === 0
        && firstFloatTop === leadHeight + 20

    check(laws, 'page-break flow promotion sweep flips once remaining budget drops below the bundle height', passed, () => ({
      leadHeight,
      expectedPromoted: expectedPromoted ? 1 : 0,
      promotionCount: promotions.items.length,
      order,
      headingPage,
      headingTop,
      firstFloatPage,
      firstFloatTop,
      secondFloatTop,
    }), {kind: 'concrete-sweep', targets: [
      'paginateBlockFlow.placements[].sourceIndex',
      'paginateBlockFlow.placements[].pageIndex',
      'paginateBlockFlow.placements[].top',
      'paginateBlockFlow.promotions',
    ]})
  }
}

function verifyPromotedBundleRange(
  analyzer: LoweredProgramAnalyzer,
  laws: Map<string, InternalLawSummary>,
) {
  const bundle = expectRangeObject(joinRangeCases(analyzer.evaluateFunctionRange('summarizePromotedBundle', [
    rangeNumber(12, 18, true),
    rangeArray([
      rangeNumber(20, 24, true),
      rangeNumber(16, 20, true),
    ]),
    rangeNumber(80, 80, true),
  ])))

  check(laws, 'page-break bundle keeps float count, fit, and total height exact over intervals', rangesEqual(
    expectRangeNumber(getRangeProp(bundle, 'floatCount')),
    rangeNumber(2, 2, true),
  )
    && rangesEqual(expectRangeNumber(getRangeProp(bundle, 'nextIndex')), rangeNumber(3, 3, true))
    && rangesEqual(expectRangeNumber(getRangeProp(bundle, 'totalHeight')), rangeNumber(48, 62, true))
    && rangesEqual(expectRangeNumber(getRangeProp(bundle, 'fitsOnFreshPage')), rangeNumber(1, 1, true)), () => ({
      floatCount: describeRange(expectRangeNumber(getRangeProp(bundle, 'floatCount'))),
      nextIndex: describeRange(expectRangeNumber(getRangeProp(bundle, 'nextIndex'))),
      totalHeight: describeRange(expectRangeNumber(getRangeProp(bundle, 'totalHeight'))),
      fitsOnFreshPage: describeRange(expectRangeNumber(getRangeProp(bundle, 'fitsOnFreshPage'))),
    }), {kind: 'range', targets: [
      'summarizePromotedBundle.floatCount',
      'summarizePromotedBundle.nextIndex',
      'summarizePromotedBundle.totalHeight',
      'summarizePromotedBundle.fitsOnFreshPage',
    ]})
}

function concretePagination(
  analyzer: LoweredProgramAnalyzer,
  blocks: Array<ReturnType<typeof flowBlock>>,
  pageHeight: number,
) {
  const returns = analyzer.evaluateFunction('paginateBlockFlow', [
    concreteArray(blocks.map(block => concreteObject({
      sourceIndex: concreteNumber(block.sourceIndex),
      kind: concreteString(block.kind),
      totalHeight: concreteNumber(block.totalHeight),
      keepWithNext: concreteNumber(block.keepWithNext),
    }))),
    concreteNumber(pageHeight),
  ], 'concrete')
  if (returns.length !== 1) throw new Error(`paginateBlockFlow expected one concrete return, got ${returns.length}`)
  return expectObject(returns[0]!.value)
}

function flowBlock(sourceIndex: number, kind: 'heading' | 'topFloat' | 'body', totalHeight: number, keepWithNext: 0 | 1) {
  return {sourceIndex, kind, totalHeight, keepWithNext}
}

function orderFor(placements: ReturnType<typeof expectArray>) {
  return placements.items.map(placement => expectConcreteNumber(getProp(expectObject(placement), 'sourceIndex'))).join(',')
}

function placementPage(placements: ReturnType<typeof expectArray>, sourceIndex: number) {
  for (let placementIndex = 0; placementIndex < placements.items.length; placementIndex++) {
    const placement = expectObject(placements.items[placementIndex]!)
    if (expectConcreteNumber(getProp(placement, 'sourceIndex')) !== sourceIndex) continue
    return expectConcreteNumber(getProp(placement, 'pageIndex'))
  }
  return -1
}

function placementTop(placements: ReturnType<typeof expectArray>, sourceIndex: number) {
  for (let placementIndex = 0; placementIndex < placements.items.length; placementIndex++) {
    const placement = expectObject(placements.items[placementIndex]!)
    if (expectConcreteNumber(getProp(placement, 'sourceIndex')) !== sourceIndex) continue
    return expectConcreteNumber(getProp(placement, 'top'))
  }
  return -1
}

function rangesEqual(
  left: ReturnType<typeof expectRangeNumber>,
  right: ReturnType<typeof expectRangeNumber>,
) {
  return left.min === right.min && left.max === right.max && left.isInteger === right.isInteger
}

function describeRange(value: ReturnType<typeof expectRangeNumber>) {
  return `[${value.min},${value.max}]${value.isInteger ? ':int' : ''}`
}
