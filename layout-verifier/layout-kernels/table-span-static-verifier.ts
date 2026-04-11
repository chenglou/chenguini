import {
  buildStaticLayoutReport,
  check,
  concreteArray,
  concreteNumber,
  concreteObject,
  expectArray,
  expectConcreteNumber,
  expectRangeArray,
  expectRangeNumber,
  getRangeProp,
  type InternalLawSummary,
  joinRangeCases,
  LoweredProgramAnalyzer,
  rangeArray,
  rangeNumber,
  rangeObject,
  type StaticLayoutVerificationReport,
} from '../core'

export function runTableSpanStaticVerification(sourceText: string): StaticLayoutVerificationReport {
  const analyzer = new LoweredProgramAnalyzer(sourceText, {})
  const laws = new Map<string, InternalLawSummary>()

  verifyTableSpanConcrete(analyzer, laws)
  verifyTableSpanRange(analyzer, laws)

  return buildStaticLayoutReport(
    'table-span-static-layout',
    'demos/layout-kernels/table-span-columns.ts',
    laws,
  )
}

function verifyTableSpanConcrete(
  analyzer: LoweredProgramAnalyzer,
  laws: Map<string, InternalLawSummary>,
) {
  const colWidths = expectArray(analyzer.evaluateFunction('measureTableColumnWidths', [
    concreteArray([
      concreteObject({
        cells: concreteArray([
          concreteObject({startColumn: concreteNumber(0), span: concreteNumber(2), measuredWidth: concreteNumber(90)}),
          concreteObject({startColumn: concreteNumber(2), span: concreteNumber(1), measuredWidth: concreteNumber(40)}),
        ]),
      }),
      concreteObject({
        cells: concreteArray([
          concreteObject({startColumn: concreteNumber(0), span: concreteNumber(1), measuredWidth: concreteNumber(60)}),
          concreteObject({startColumn: concreteNumber(1), span: concreteNumber(1), measuredWidth: concreteNumber(80)}),
        ]),
      }),
      concreteObject({
        cells: concreteArray([
          concreteObject({startColumn: concreteNumber(0), span: concreteNumber(3), measuredWidth: concreteNumber(150)}),
        ]),
      }),
    ]),
    concreteNumber(3),
  ], 'concrete')[0]!.value)

  check(laws, 'table-span negotiation keeps mixed single-column and spanning constraints exact in concrete cases', colWidths.items.length === 3
    && expectConcreteNumber(colWidths.items[0]!) === 60
    && expectConcreteNumber(colWidths.items[1]!) === 80
    && expectConcreteNumber(colWidths.items[2]!) === 50, () => ({
      widths: colWidths.items.map(width => expectConcreteNumber(width)).join(','),
    }), 'concrete')

  const tableWidth = expectConcreteNumber(analyzer.evaluateFunction('measureTableWidth', [
    colWidths,
    concreteNumber(6),
  ], 'concrete')[0]!.value)
  check(laws, 'table-span negotiation derives total table width from the negotiated vector plus cell padding', tableWidth === 226, () => ({
    tableWidth,
  }), 'concrete')
}

function verifyTableSpanRange(
  analyzer: LoweredProgramAnalyzer,
  laws: Map<string, InternalLawSummary>,
) {
  const colWidths = expectRangeArray(joinRangeCases(analyzer.evaluateFunctionRange('measureTableColumnWidths', [
    rangeArray([
      rangeObject({
        cells: rangeArray([
          rangeObject({
            startColumn: rangeNumber(0, 0, true),
            span: rangeNumber(2, 2, true),
            measuredWidth: rangeNumber(60, 100, true),
          }),
          rangeObject({
            startColumn: rangeNumber(2, 2, true),
            span: rangeNumber(1, 1, true),
            measuredWidth: rangeNumber(40, 60, true),
          }),
        ]),
      }),
      rangeObject({
        cells: rangeArray([
          rangeObject({
            startColumn: rangeNumber(1, 1, true),
            span: rangeNumber(1, 1, true),
            measuredWidth: rangeNumber(70, 90, true),
          }),
        ]),
      }),
    ]),
    rangeNumber(3, 3, true),
  ])))

  check(laws, 'table-span negotiation keeps the per-column lower-bound vector exact over intervals', colWidths.lengthMin === 3
    && colWidths.lengthMax === 3
    && rangesEqual(expectRangeNumber(colWidths.items![0]!), rangeNumber(30, 50, false))
    && rangesEqual(expectRangeNumber(colWidths.items![1]!), rangeNumber(70, 90, false))
    && rangesEqual(expectRangeNumber(colWidths.items![2]!), rangeNumber(40, 60, false)), () => ({
      col0: describeRange(expectRangeNumber(colWidths.items![0]!)),
      col1: describeRange(expectRangeNumber(colWidths.items![1]!)),
      col2: describeRange(expectRangeNumber(colWidths.items![2]!)),
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
