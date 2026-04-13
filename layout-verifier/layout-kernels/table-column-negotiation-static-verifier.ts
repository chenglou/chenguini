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
  type RangeNumberValue,
  type StaticLayoutVerificationReport,
  type Value,
} from '../core'

export function runTableColumnNegotiationStaticVerification(sourceText: string): StaticLayoutVerificationReport {
  const analyzer = new LoweredProgramAnalyzer(sourceText, {})
  const laws = new Map<string, InternalLawSummary>()

  verifyNegotiatedVector(analyzer, laws)
  verifyTotalWidth(analyzer, laws)
  verifyLaterSingleColumnDominates(analyzer, laws)
  verifyRangeExactBounds(analyzer, laws)

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

function verifyRangeExactBounds(analyzer: LoweredProgramAnalyzer, laws: Map<string, InternalLawSummary>) {
  const result = expectRangeObject(joinRangeCases(analyzer.evaluateFunctionRange('negotiateTableColumns', [
    rangeNumber(3, 3, true),
    rangeArray([
      rangeObject({
        start: rangeNumber(0, 0, true),
        span: rangeNumber(2, 2, true),
        minWidth: rangeNumber(212, 252, true),
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

  if (widths.items == null || widths.items.length !== 3) {
    check(laws, 'negotiateTableColumns keeps exact per-column lower bounds over structured span inputs', false, () => ({
      gotItems: widths.items?.length ?? null,
    }), {kind: 'range', targets: ['negotiateTableColumns.widths']})
    return
  }

  check(laws, 'negotiateTableColumns keeps exact per-column lower bounds over structured span inputs', (
    rangesEqual(expectRangeNumber(widths.items[0]!), rangeNumber(101, 121, false)) &&
    rangesEqual(expectRangeNumber(widths.items[1]!), rangeNumber(101, 121, false)) &&
    rangesEqual(expectRangeNumber(widths.items[2]!), rangeNumber(0, 0, true)) &&
    rangesEqual(expectRangeNumber(getRangeProp(result, 'totalWidth')), rangeNumber(222, 262, false))
  ), () => ({
    firstColumn: describeRange(expectRangeNumber(widths.items![0]!)),
    secondColumn: describeRange(expectRangeNumber(widths.items![1]!)),
    thirdColumn: describeRange(expectRangeNumber(widths.items![2]!)),
    totalWidth: describeRange(expectRangeNumber(getRangeProp(result, 'totalWidth'))),
  }), {kind: 'range', targets: [
    'negotiateTableColumns.widths',
    'negotiateTableColumns.totalWidth',
  ]})
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

function rangesEqual(left: RangeNumberValue, right: RangeNumberValue) {
  return left.min === right.min && left.max === right.max && left.isInteger === right.isInteger
}

function describeRange(value: RangeNumberValue) {
  return `[${value.min},${value.max}]${value.isInteger ? ':int' : ''}`
}
