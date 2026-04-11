import {
  buildStaticLayoutReport,
  check,
  concreteArray,
  concreteNumber,
  concreteObject,
  concreteString,
  expectArray,
  expectConcreteNumber,
  expectObject,
  expectRangeArray,
  expectRangeNumber,
  expectRangeObject,
  getProp,
  getRangeProp,
  type InternalLawSummary,
  joinRangeCases,
  LoweredProgramAnalyzer,
  rangeArray,
  rangeNumber,
  rangeObject,
  rangeString,
  type StaticLayoutVerificationReport,
} from '../core'

export function runPageBreakStaticVerification(sourceText: string): StaticLayoutVerificationReport {
  const analyzer = new LoweredProgramAnalyzer(sourceText, {})
  const laws = new Map<string, InternalLawSummary>()

  verifyPageBreakConcrete(analyzer, laws)
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
  const pages = expectArray(analyzer.evaluateFunction('paginateBlockFlow', [
    concreteArray([
      concreteObject({sourceIndex: concreteNumber(0), kind: concreteString('body'), totalHeight: concreteNumber(70), keepWithNext: concreteNumber(0)}),
      concreteObject({sourceIndex: concreteNumber(1), kind: concreteString('heading'), totalHeight: concreteNumber(20), keepWithNext: concreteNumber(0)}),
      concreteObject({sourceIndex: concreteNumber(2), kind: concreteString('topFloat'), totalHeight: concreteNumber(25), keepWithNext: concreteNumber(0)}),
      concreteObject({sourceIndex: concreteNumber(3), kind: concreteString('topFloat'), totalHeight: concreteNumber(15), keepWithNext: concreteNumber(0)}),
      concreteObject({sourceIndex: concreteNumber(4), kind: concreteString('body'), totalHeight: concreteNumber(10), keepWithNext: concreteNumber(0)}),
    ]),
    concreteNumber(80),
  ], 'concrete')[0]!.value)

  check(laws, 'page-break flow keeps the promoted heading-and-floats bundle together on a fresh page', pages.items.length === 2, () => ({
    pageCount: pages.items.length,
  }), 'concrete')
  if (pages.items.length !== 2) return

  const firstPage = expectObject(pages.items[0]!)
  const secondPage = expectObject(pages.items[1]!)
  const secondBlocks = expectArray(getProp(secondPage, 'blocks'))
  check(laws, 'page-break flow reorders promoted top floats ahead of their heading', secondBlocks.items.length === 4
    && expectConcreteNumber(getProp(expectObject(secondBlocks.items[0]!), 'sourceIndex')) === 2
    && expectConcreteNumber(getProp(expectObject(secondBlocks.items[1]!), 'sourceIndex')) === 3
    && expectConcreteNumber(getProp(expectObject(secondBlocks.items[2]!), 'sourceIndex')) === 1
    && expectConcreteNumber(getProp(expectObject(secondBlocks.items[3]!), 'sourceIndex')) === 4, () => ({
      secondPageOrder: secondBlocks.items.map(block => expectConcreteNumber(getProp(expectObject(block), 'sourceIndex'))).join(','),
    }), 'concrete')

  check(laws, 'page-break flow keeps every concrete page within budget', expectConcreteNumber(getProp(firstPage, 'usedHeight')) === 70
    && expectConcreteNumber(getProp(secondPage, 'usedHeight')) === 70
    && expectConcreteNumber(getProp(firstPage, 'remainingHeight')) === 10
    && expectConcreteNumber(getProp(secondPage, 'remainingHeight')) === 10, () => ({
      firstUsedHeight: expectConcreteNumber(getProp(firstPage, 'usedHeight')),
      secondUsedHeight: expectConcreteNumber(getProp(secondPage, 'usedHeight')),
      firstRemainingHeight: expectConcreteNumber(getProp(firstPage, 'remainingHeight')),
      secondRemainingHeight: expectConcreteNumber(getProp(secondPage, 'remainingHeight')),
    }), 'concrete')

  const keepPages = expectArray(analyzer.evaluateFunction('paginateBlockFlow', [
    concreteArray([
      concreteObject({sourceIndex: concreteNumber(0), kind: concreteString('body'), totalHeight: concreteNumber(50), keepWithNext: concreteNumber(0)}),
      concreteObject({sourceIndex: concreteNumber(1), kind: concreteString('body'), totalHeight: concreteNumber(20), keepWithNext: concreteNumber(1)}),
      concreteObject({sourceIndex: concreteNumber(2), kind: concreteString('body'), totalHeight: concreteNumber(15), keepWithNext: concreteNumber(0)}),
    ]),
    concreteNumber(70),
  ], 'concrete')[0]!.value)
  if (keepPages.items.length !== 2) return
  const keepSecondPage = expectObject(keepPages.items[1]!)
  const keepSecondBlocks = expectArray(getProp(keepSecondPage, 'blocks'))
  check(laws, 'page-break flow honors keep-with-next pairs when the pair only fits on the next page', keepSecondBlocks.items.length === 2
    && expectConcreteNumber(getProp(expectObject(keepSecondBlocks.items[0]!), 'sourceIndex')) === 1
    && expectConcreteNumber(getProp(expectObject(keepSecondBlocks.items[1]!), 'sourceIndex')) === 2, () => ({
      keepSecondPageOrder: keepSecondBlocks.items.map(block => expectConcreteNumber(getProp(expectObject(block), 'sourceIndex'))).join(','),
    }), 'concrete')
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
    }), 'range')
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
