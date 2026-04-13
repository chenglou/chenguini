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

export function runGeneratedListStaticVerification(sourceText: string): StaticLayoutVerificationReport {
  const analyzer = new LoweredProgramAnalyzer(sourceText, {})
  const laws = new Map<string, InternalLawSummary>()

  verifyGeneratedListConcrete(analyzer, laws)
  verifyGeneratedListRange(analyzer, laws)

  return buildStaticLayoutReport(
    'layout-kernels-generated-list-static-layout',
    'demos/layout-kernels/generated-list-geometry.ts',
    laws,
  )
}

function verifyGeneratedListConcrete(
  analyzer: LoweredProgramAnalyzer,
  laws: Map<string, InternalLawSummary>,
) {
  const returns = analyzer.evaluateFunction('layoutGeneratedList', [concreteArray([
    concreteObject({
      level: concreteString('section'),
      documentClass: concreteString('article'),
      lineWidths: concreteArray([concreteNumber(140)]),
      numberWidth: concreteNumber(18),
      pageNumberWidth: concreteNumber(10),
    }),
    concreteObject({
      level: concreteString('subsection'),
      documentClass: concreteString('report'),
      lineWidths: concreteArray([concreteNumber(120), concreteNumber(70)]),
      numberWidth: concreteNumber(22),
      pageNumberWidth: concreteNumber(12),
    }),
    concreteObject({
      level: concreteString('caption'),
      documentClass: concreteString('article'),
      lineWidths: concreteArray([concreteNumber(180)]),
      numberWidth: concreteNumber(-1),
      pageNumberWidth: concreteNumber(9),
    }),
  ])], 'concrete')

  check(laws, 'generated-list layout stays branch-free per concrete specimen', returns.length === 1, () => ({
    cases: returns.length,
  }), 'concrete-fixture')
  if (returns.length !== 1) return

  const layout = expectObject(returns[0]!.value)
  const entries = expectArray(getProp(layout, 'entries'))
  check(laws, 'generated-list layout preserves entry count', entries.items.length === 3, () => ({
    entryCount: entries.items.length,
  }), 'concrete-fixture')
  if (entries.items.length !== 3) return

  const firstEntry = expectObject(entries.items[0]!)
  const secondEntry = expectObject(entries.items[1]!)
  const thirdEntry = expectObject(entries.items[2]!)
  const firstLine = expectObject(expectArray(getProp(firstEntry, 'lines')).items[0]!)
  const secondLines = expectArray(getProp(secondEntry, 'lines'))
  const secondFirstLine = expectObject(secondLines.items[0]!)
  const secondLastLine = expectObject(secondLines.items[1]!)
  const thirdLine = expectObject(expectArray(getProp(thirdEntry, 'lines')).items[0]!)

  check(laws, 'generated-list layout keeps level-specific indents exact in concrete cases', (
    expectConcreteNumber(getProp(firstLine, 'textX')) === 39 &&
    expectConcreteNumber(getProp(firstLine, 'numberX')) === 24 &&
    expectConcreteNumber(getProp(secondFirstLine, 'textX')) === 94 &&
    expectConcreteNumber(getProp(secondFirstLine, 'numberX')) === 62 &&
    expectConcreteNumber(getProp(thirdLine, 'numberX')) === -1
  ), () => ({
    firstTextX: expectConcreteNumber(getProp(firstLine, 'textX')),
    firstNumberX: expectConcreteNumber(getProp(firstLine, 'numberX')),
    secondTextX: expectConcreteNumber(getProp(secondFirstLine, 'textX')),
    secondNumberX: expectConcreteNumber(getProp(secondFirstLine, 'numberX')),
    thirdNumberX: expectConcreteNumber(getProp(thirdLine, 'numberX')),
  }), {kind: 'concrete-fixture', targets: [
    'layoutGeneratedList.entries[].lines[].textX',
    'layoutGeneratedList.entries[].lines[].numberX',
  ]})

  check(laws, 'generated-list layout keeps leaders and page numbers on the terminal wrapped line only', (
    expectConcreteNumber(getProp(secondFirstLine, 'isTerminal')) === 0 &&
    expectConcreteNumber(getProp(secondFirstLine, 'leaderFrom')) === -1 &&
    expectConcreteNumber(getProp(secondFirstLine, 'pageNumberX')) === -1 &&
    expectConcreteNumber(getProp(secondLastLine, 'isTerminal')) === 1 &&
    expectConcreteNumber(getProp(secondLastLine, 'leaderFrom')) === 164 &&
    expectConcreteNumber(getProp(secondLastLine, 'leaderTo')) === 416 &&
    expectConcreteNumber(getProp(secondLastLine, 'pageNumberX')) + expectConcreteNumber(getProp(secondLastLine, 'pageNumberWidth')) === 444
  ), () => ({
    secondFirstTerminal: expectConcreteNumber(getProp(secondFirstLine, 'isTerminal')),
    secondFirstLeaderFrom: expectConcreteNumber(getProp(secondFirstLine, 'leaderFrom')),
    secondLastLeaderFrom: expectConcreteNumber(getProp(secondLastLine, 'leaderFrom')),
    secondLastLeaderTo: expectConcreteNumber(getProp(secondLastLine, 'leaderTo')),
    secondLastPageRight: expectConcreteNumber(getProp(secondLastLine, 'pageNumberX')) + expectConcreteNumber(getProp(secondLastLine, 'pageNumberWidth')),
  }), {kind: 'concrete-fixture', targets: [
    'layoutGeneratedList.entries[].lines[].isTerminal',
    'layoutGeneratedList.entries[].lines[].leaderFrom',
    'layoutGeneratedList.entries[].lines[].pageNumberX',
  ]})

  check(laws, 'generated-list layout keeps entry tops contiguous across spacing and wrapped-line counts', (
    Math.abs(expectConcreteNumber(getProp(firstEntry, 'top')) - 10) <= epsilon &&
    Math.abs(expectConcreteNumber(getProp(firstEntry, 'bottom')) - 28) <= epsilon &&
    Math.abs(expectConcreteNumber(getProp(secondEntry, 'top')) - 28) <= epsilon &&
    Math.abs(expectConcreteNumber(getProp(secondEntry, 'bottom')) - 64) <= epsilon &&
    Math.abs(expectConcreteNumber(getProp(thirdEntry, 'top')) - 64) <= epsilon &&
    Math.abs(expectConcreteNumber(getProp(layout, 'contentHeight')) - 82) <= epsilon
  ), () => ({
    firstTop: expectConcreteNumber(getProp(firstEntry, 'top')),
    firstBottom: expectConcreteNumber(getProp(firstEntry, 'bottom')),
    secondTop: expectConcreteNumber(getProp(secondEntry, 'top')),
    secondBottom: expectConcreteNumber(getProp(secondEntry, 'bottom')),
    thirdTop: expectConcreteNumber(getProp(thirdEntry, 'top')),
    contentHeight: expectConcreteNumber(getProp(layout, 'contentHeight')),
  }), {kind: 'concrete-fixture', targets: [
    'layoutGeneratedList.entries[].top',
    'layoutGeneratedList.entries[].bottom',
    'layoutGeneratedList.contentHeight',
  ]})

  const absentPageSlotReturns = analyzer.evaluateFunction('layoutGeneratedList', [concreteArray([
    concreteObject({
      level: concreteString('section'),
      documentClass: concreteString('article'),
      lineWidths: concreteArray([concreteNumber(50)]),
      numberWidth: concreteNumber(10),
      pageNumberWidth: concreteNumber(-1),
    }),
  ])], 'concrete')
  if (absentPageSlotReturns.length !== 1) {
    check(laws, 'generated-list layout suppresses leader and page-number slots when no page number exists', false, () => ({
      cases: absentPageSlotReturns.length,
    }), 'concrete-fixture')
    return
  }
  const absentPageSlotLayout = expectObject(absentPageSlotReturns[0]!.value)
  const absentPageSlotEntries = expectArray(getProp(absentPageSlotLayout, 'entries'))
  const absentPageSlotLine = expectObject(expectArray(getProp(expectObject(absentPageSlotEntries.items[0]!), 'lines')).items[0]!)

  check(laws, 'generated-list layout suppresses leader and page-number slots when no page number exists', (
    expectConcreteNumber(getProp(absentPageSlotLine, 'leaderFrom')) === -1 &&
    expectConcreteNumber(getProp(absentPageSlotLine, 'leaderTo')) === -1 &&
    expectConcreteNumber(getProp(absentPageSlotLine, 'pageNumberX')) === -1 &&
    expectConcreteNumber(getProp(absentPageSlotLine, 'pageNumberWidth')) === -1
  ), () => ({
    leaderFrom: expectConcreteNumber(getProp(absentPageSlotLine, 'leaderFrom')),
    leaderTo: expectConcreteNumber(getProp(absentPageSlotLine, 'leaderTo')),
    pageNumberX: expectConcreteNumber(getProp(absentPageSlotLine, 'pageNumberX')),
    pageNumberWidth: expectConcreteNumber(getProp(absentPageSlotLine, 'pageNumberWidth')),
  }), {kind: 'concrete-fixture', targets: [
    'layoutGeneratedList.entries[].lines[].leaderFrom',
    'layoutGeneratedList.entries[].lines[].pageNumberX',
    'layoutGeneratedList.entries[].lines[].pageNumberWidth',
  ]})
}

function verifyGeneratedListRange(
  analyzer: LoweredProgramAnalyzer,
  laws: Map<string, InternalLawSummary>,
) {
  const layout = expectRangeObject(joinRangeCases(analyzer.evaluateFunctionRange('layoutGeneratedList', [rangeArray([
    rangeObject({
      level: rangeString('subsection'),
      documentClass: rangeString('report'),
      lineWidths: rangeArray([
        rangeNumber(80, 120, true),
        rangeNumber(30, 90, true),
      ]),
      numberWidth: rangeNumber(20, 28, true),
      pageNumberWidth: rangeNumber(8, 16, true),
    }),
  ])])))

  const entries = expectRangeArray(getRangeProp(layout, 'entries'))
  check(laws, 'generated-list layout keeps the report/subsection metric ladder exact over intervals', entries.lengthMin === 1 && entries.lengthMax === 1, () => ({
    entryCountMin: entries.lengthMin,
    entryCountMax: entries.lengthMax,
  }), {kind: 'range', targets: ['layoutGeneratedList.entries']})
  if (entries.items == null || entries.items.length !== 1) return

  const entry = expectRangeObject(entries.items[0]!)
  const lines = expectRangeArray(getRangeProp(entry, 'lines'))
  if (lines.items == null || lines.items.length !== 2) return

  const firstLine = expectRangeObject(lines.items[0]!)
  const secondLine = expectRangeObject(lines.items[1]!)
  check(laws, 'generated-list layout keeps terminal-line leader and page slot geometry exact over intervals', rangesEqual(
    expectRangeNumber(getRangeProp(firstLine, 'textX')),
    rangeNumber(94, 94, true),
  ) && rangesEqual(
    expectRangeNumber(getRangeProp(firstLine, 'numberX')),
    rangeNumber(62, 62, false),
  ) && rangesEqual(
    expectRangeNumber(getRangeProp(entry, 'textMaxWidth')),
    rangeNumber(310, 310, true),
  ) && rangesEqual(
    expectRangeNumber(getRangeProp(secondLine, 'leaderFrom')),
    rangeNumber(124, 184, true),
  ) && rangesEqual(
    expectRangeNumber(getRangeProp(secondLine, 'leaderTo')),
    rangeNumber(416, 416, true),
  ) && rangesEqual(
    expectRangeNumber(getRangeProp(secondLine, 'pageNumberX')),
    rangeNumber(428, 436, true),
  ), () => ({
    textX: describeRange(expectRangeNumber(getRangeProp(firstLine, 'textX'))),
    numberX: describeRange(expectRangeNumber(getRangeProp(firstLine, 'numberX'))),
    textMaxWidth: describeRange(expectRangeNumber(getRangeProp(entry, 'textMaxWidth'))),
    leaderFrom: describeRange(expectRangeNumber(getRangeProp(secondLine, 'leaderFrom'))),
    leaderTo: describeRange(expectRangeNumber(getRangeProp(secondLine, 'leaderTo'))),
    pageNumberX: describeRange(expectRangeNumber(getRangeProp(secondLine, 'pageNumberX'))),
  }), {kind: 'range', targets: [
    'layoutGeneratedList.entries[].lines[].textX',
    'layoutGeneratedList.entries[].lines[].leaderFrom',
    'layoutGeneratedList.entries[].lines[].pageNumberX',
  ]})
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
