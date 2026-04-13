import {
  buildStaticLayoutReport,
  check,
  concreteArray,
  concreteNumber,
  concreteObject,
  epsilon,
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
  type StaticLayoutVerificationReport,
  type Value,
} from '../core'

export function runTableColumnNegotiationStaticVerification(sourceText: string): StaticLayoutVerificationReport {
  const analyzer = new LoweredProgramAnalyzer(sourceText, {})
  const laws = new Map<string, InternalLawSummary>()

  verifyNegotiatedVector(analyzer, laws)
  verifyTotalWidth(analyzer, laws)
  verifyLaterSingleColumnDominates(analyzer, laws)
  verifyRangeLowerBounds(analyzer, laws)

  return buildStaticLayoutReport(
    'layout-kernels-table-column-negotiation-static-layout',
    'demos/layout-kernels/table-column-negotiation.ts',
    laws,
  )
}

function verifyNegotiatedVector(analyzer: LoweredProgramAnalyzer, laws: Map<string, InternalLawSummary>) {
  const result = concreteNegotiation(analyzer)
  const widths = expectArray(getProp(result, 'widths'))
  const expected = [54, 129, 70]

  for (let i = 0; i < expected.length; i++) {
    const actual = expectConcreteNumber(widths.items[i]!)
    check(laws, 'negotiateTableColumns returns the expected negotiated width vector', Math.abs(actual - expected[i]!) <= epsilon, () => ({
      column: i,
      actual,
      expected: expected[i]!,
    }), {kind: 'concrete-fixture', targets: ['negotiateTableColumns.widths']})
  }
}

function verifyTotalWidth(analyzer: LoweredProgramAnalyzer, laws: Map<string, InternalLawSummary>) {
  const result = concreteNegotiation(analyzer)
  const widths = expectArray(getProp(result, 'widths'))
  const totalWidth = expectConcreteNumber(getProp(result, 'totalWidth'))
  const columnGap = 12
  let expected = 0
  for (let i = 0; i < widths.items.length; i++) {
    if (i > 0) expected += columnGap
    expected += expectConcreteNumber(widths.items[i]!)
  }

  check(laws, 'negotiateTableColumns derives total width from the negotiated vector and gaps', Math.abs(totalWidth - expected) <= epsilon, () => ({
    totalWidth,
    expected,
  }), {kind: 'concrete-fixture', targets: [
    'negotiateTableColumns.widths',
    'negotiateTableColumns.totalWidth',
  ]})
}

function verifyLaterSingleColumnDominates(analyzer: LoweredProgramAnalyzer, laws: Map<string, InternalLawSummary>) {
  const returns = analyzer.evaluateFunction('negotiateTableColumns', [
    concreteNumber(2),
    concreteArray([
      concreteCell(0, 2, 200),
      concreteCell(0, 1, 130),
    ]),
    concreteNumber(8),
  ], 'concrete')
  if (returns.length !== 1) throw new Error(`negotiateTableColumns expected one concrete return, got ${returns.length}`)

  const result = expectObject(returns[0]!.value)
  const widths = expectArray(getProp(result, 'widths'))

  check(laws, 'negotiateTableColumns lets a later single-column constraint dominate after a span', (
    widths.items.length === 2 &&
    Math.abs(expectConcreteNumber(widths.items[0]!) - 130) <= epsilon &&
    Math.abs(expectConcreteNumber(widths.items[1]!) - 96) <= epsilon
  ), () => ({
    firstColumn: expectConcreteNumber(widths.items[0]!),
    secondColumn: expectConcreteNumber(widths.items[1]!),
  }), {kind: 'concrete-fixture', targets: ['negotiateTableColumns.widths']})
}

function verifyRangeLowerBounds(analyzer: LoweredProgramAnalyzer, laws: Map<string, InternalLawSummary>) {
  const result = expectRangeObject(joinRangeCases(analyzer.evaluateFunctionRange('negotiateTableColumns', [
    rangeNumber(3, 3, true),
    rangeArray([
      rangeObject({
        start: rangeNumber(0, 0, true),
        span: rangeNumber(1, 1, true),
        minWidth: rangeNumber(50, 50, true),
      }),
      rangeObject({
        start: rangeNumber(0, 0, true),
        span: rangeNumber(3, 3, true),
        minWidth: rangeNumber(150, 210, true),
      }),
      rangeObject({
        start: rangeNumber(1, 1, true),
        span: rangeNumber(1, 1, true),
        minWidth: rangeNumber(80, 80, true),
      }),
    ]),
    rangeNumber(10, 10, true),
  ])))
  const widths = expectRangeArray(getRangeProp(result, 'widths'))

  if (widths.items == null) {
    check(laws, 'negotiateTableColumns keeps lower bounds stable over min-width intervals', false, () => ({
      reason: 'width vector was not exact',
    }), {kind: 'range', targets: ['negotiateTableColumns.widths']})
    return
  }

  const first = expectRangeNumber(widths.items[0]!)
  const second = expectRangeNumber(widths.items[1]!)
  const third = expectRangeNumber(widths.items[2]!)
  const totalWidth = expectRangeNumber(getRangeProp(result, 'totalWidth'))
  const expectedThirdMin = (150 - 50 - 2 * 10) / 3
  const expectedFirstMin = 50 + expectedThirdMin
  const expectedTotalMin = expectedFirstMin + 80 + expectedThirdMin + 2 * 10

  check(laws, 'negotiateTableColumns keeps lower bounds stable over min-width intervals', first.min >= expectedFirstMin - epsilon, () => ({
    column: 0,
    min: first.min,
    expectedMin: expectedFirstMin,
  }), {kind: 'range', targets: ['negotiateTableColumns.widths']})
  check(laws, 'negotiateTableColumns keeps lower bounds stable over min-width intervals', second.min >= 80 - epsilon, () => ({
    column: 1,
    min: second.min,
    expectedMin: 80,
  }), {kind: 'range', targets: ['negotiateTableColumns.widths']})
  check(laws, 'negotiateTableColumns keeps lower bounds stable over min-width intervals', third.min >= expectedThirdMin - epsilon, () => ({
    column: 2,
    min: third.min,
    expectedMin: expectedThirdMin,
  }), {kind: 'range', targets: ['negotiateTableColumns.widths']})
  check(laws, 'negotiateTableColumns keeps lower bounds stable over min-width intervals', totalWidth.min >= expectedTotalMin - epsilon, () => ({
    totalMin: totalWidth.min,
    expectedMin: expectedTotalMin,
  }), {kind: 'range', targets: ['negotiateTableColumns.totalWidth']})
}

function concreteNegotiation(analyzer: LoweredProgramAnalyzer) {
  const returns = analyzer.evaluateFunction('negotiateTableColumns', [
    concreteNumber(3),
    concreteArray([
      concreteCell(0, 2, 120),
      concreteCell(1, 1, 90),
      concreteCell(1, 2, 180),
      concreteCell(2, 1, 70),
    ]),
    concreteNumber(12),
  ], 'concrete')
  if (returns.length !== 1) throw new Error(`negotiateTableColumns expected one concrete return, got ${returns.length}`)
  return expectObject(returns[0]!.value)
}

function concreteCell(start: number, span: number, minWidth: number): Value {
  return concreteObject({
    start: concreteNumber(start),
    span: concreteNumber(span),
    minWidth: concreteNumber(minWidth),
  })
}
