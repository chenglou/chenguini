import {expect, test} from 'bun:test'
import {
  buildStaticLayoutReport,
  check,
  checkFact,
  checkFacts,
  concreteArray,
  concreteNull,
  concreteNumber,
  concreteObject,
  constExpr,
  expectArray,
  expectConcreteNumber,
  expectObject,
  expectRangeArray,
  expectRangeNumber,
  expectRangeObject,
  expectSymbolicNumber,
  getProp,
  getRangeProp,
  invokeConcreteFunctionValue,
  joinRangeCases,
  LoweredProgramAnalyzer,
  mulExpr,
  powExpr,
  rangeArray,
  rangeNumber,
  rangeObject,
  rangeString,
  staticLayoutFact,
  type StaticLayoutFunctionSummary,
  type StaticLayoutLawSummary,
  type StaticLayoutVerificationReport,
  symbolicExprEquals,
  symbolicNumber,
} from './core.ts'
import {
  buildStaticContractOverrides,
  contract,
  contractValue,
  formatStaticContractSketchEntry,
  loadStaticContractOverridesForSourceFile,
  sketchStaticReturnContractFromSamples,
} from './contracts.ts'
import {
  partitionIntegerRangeByConcreteNumberValue,
  pickIntegerBandRepresentatives,
} from './discrete.ts'
import {
  runHNCommentLayoutStaticVerification,
  runHNCommentLayoutStaticVerificationForSourceFile,
} from './nicer-hacker-news/comment-static-verifier.ts'
import {runNicerHackerNewsStaticVerification} from './nicer-hacker-news/thread-static-verifier.ts'
import {
  runPhotoGalleryStaticVerification,
  runPhotoGalleryStaticVerificationForSourceFile,
} from './photo-gallery/static-verifier.ts'
import {runLifeCalendarStaticVerification} from './life-calendar/static-verifier.ts'
import {runDraggableCardsStaticVerification} from './draggable-cards/static-verifier.ts'
import {runGestureFlickStaticVerification} from './gesture-flick-snap-target/static-verifier.ts'
import {runScrollAnchorStaticVerification} from './scroll-anchor/static-verifier.ts'
import {
  prompt1DLineHeight,
  prompt2DLineHeight,
  prompt2DMaxLines,
  promptPaddingBottom,
} from '../demos/photo-gallery/prompt-layout.ts'

function replaceOnce(source: string, from: string, to: string) {
  const next = source.replace(from, to)
  expect(next).not.toBe(source)
  return next
}

function getLaw(report: StaticLayoutVerificationReport, name: string): StaticLayoutLawSummary {
  const law = report.laws.find(candidate => candidate.name === name)
  if (law == null) throw new Error(`Missing law ${name}`)
  return law
}

function getFunctionSummary(report: StaticLayoutVerificationReport, name: string): StaticLayoutFunctionSummary {
  const summary = report.functionSummaries?.find(candidate => candidate.name === name)
  if (summary == null) throw new Error(`Missing function summary ${name}`)
  return summary
}

function getFirstFailure(law: StaticLayoutLawSummary) {
  const firstFailure = law.firstFailure
  if (firstFailure == null) throw new Error(`Missing first failure for ${law.name}`)
  return firstFailure
}

function getFirstUnknown(law: StaticLayoutLawSummary) {
  const firstUnknown = law.firstUnknown
  if (firstUnknown == null) throw new Error(`Missing first unknown for ${law.name}`)
  return firstUnknown
}

test('law reports keep unknown separate from failures', () => {
  const laws = new Map()
  const x = expectSymbolicNumber(symbolicNumber('x'))
  const y = expectSymbolicNumber(symbolicNumber('y'))

  checkFact(laws, 'non-linear symbolic equality reports unknown', staticLayoutFact.symbolicEquality(
    mulExpr(x, y),
    mulExpr(y, x),
  ), () => ({
    left: 'x * y',
    right: 'y * x',
  }))

  const report = buildStaticLayoutReport('static-layout-facts', 'inline.ts', laws)
  const law = getLaw(report, 'non-linear symbolic equality reports unknown')

  expect(report.phase).toBe('error')
  expect(law.status).toBe('unknown')
  expect(law.firstFailure).toBeUndefined()
  const unknown = getFirstUnknown(law)
  expect(unknown.reason).toBe('symbolic equality is not linear')
  expect(unknown.witness?.['left']).toBe('x * y')
})

test('symbolic mode keeps exponentiation expression shape', () => {
  const source = `
function demo(size: number) {
  return size ** 2
}
`
  const analyzer = new LoweredProgramAnalyzer(source, {}, {}, {
    includeFunctions: ['demo'],
  })

  const returns = analyzer.evaluateFunction('demo', [symbolicNumber('size')], 'symbolic')
  expect(returns).toHaveLength(1)
  const actual = expectSymbolicNumber(returns[0]!.value)
  const expected = powExpr(expectSymbolicNumber(symbolicNumber('size')), constExpr(2))

  expect(symbolicExprEquals(actual, expected)).toBe(true)
})

test('range facts compose under one law', () => {
  const laws = new Map()

  checkFacts(laws, 'range facts share one law summary', [
    staticLayoutFact.rangeEquality(rangeNumber(10, 20, true), rangeNumber(10, 20, true)),
    staticLayoutFact.rangeNonNegative(rangeNumber(0, 12, true)),
    staticLayoutFact.rangeArrayLength(rangeArray([rangeNumber(1, 1, true), rangeNumber(2, 2, true)]), 2),
  ], () => ({
    case: 'range facts',
  }))

  const report = buildStaticLayoutReport('static-layout-facts', 'inline.ts', laws)
  const law = getLaw(report, 'range facts share one law summary')

  expect(report.phase).toBe('ready')
  expect(law.status).toBe('pass')
  expect(law.kind).toBe('range')
  expect(law.checks).toBe(3)
})

test('geometry facts compose under one law', () => {
  const laws = new Map()
  const left = {left: 0, top: 10, width: 40, height: 20}
  const right = {left: 48, top: 12, width: 32, height: 18}

  checkFacts(laws, 'geometry facts share one law summary', [
    staticLayoutFact.concreteRectXWithin(left, {left: 0, right: 100}),
    staticLayoutFact.concreteRectYWithin(right, {top: 0, bottom: 40}),
    staticLayoutFact.concreteRectsDoNotOverlapX(left, right),
  ], () => ({
    case: 'geometry facts',
  }))

  const report = buildStaticLayoutReport('static-layout-facts', 'inline.ts', laws)
  const law = getLaw(report, 'geometry facts share one law summary')

  expect(report.phase).toBe('ready')
  expect(law.status).toBe('pass')
  expect(law.kind).toBe('concrete-fixture')
  expect(law.checks).toBe(3)
})

test('empty fact batches fail instead of crashing when the kind is explicit', () => {
  const laws = new Map()

  checkFacts(laws, 'empty geometry facts', [], () => ({
    case: 'empty',
  }), {
    kind: 'concrete-fixture',
    targets: ['demo.layoutBox'],
  })

  const report = buildStaticLayoutReport('static-layout-facts', 'inline.ts', laws)
  const law = getLaw(report, 'empty geometry facts')

  expect(report.phase).toBe('error')
  expect(law.status).toBe('fail')
  expect(getFirstFailure(law)['reason']).toBe('no facts to check')
})

test('geometry fact failures include visual proof packets', () => {
  const laws = new Map()

  checkFact(laws, 'overflowing rect carries a proof packet', staticLayoutFact.concreteRectXWithin(
    {left: -5, top: 0, width: 120, height: 10},
    {left: 0, right: 100},
  ), () => ({
    case: 'overflow',
  }))

  const report = buildStaticLayoutReport('static-layout-facts', 'inline.ts', laws)
  const law = getLaw(report, 'overflowing rect carries a proof packet')

  expect(report.phase).toBe('error')
  expect(law.status).toBe('fail')
  const failure = getFirstFailure(law)
  expect(failure['leftOverflowBy']).toBe(5)
  expect(failure['rightOverflowBy']).toBe(15)
  expect(failure['overflowBy']).toBe(15)
  expect(String(failure['geometrySvg']).startsWith('<svg ')).toBe(true)
})

test('law summaries record proof provenance', () => {
  const laws = new Map()

  check(laws, 'mixed proof law', true, () => ({
    case: 'manual',
  }))
  checkFact(laws, 'mixed proof law', staticLayoutFact.concreteClose(10, 10), () => ({
    case: 'fact',
  }))

  const report = buildStaticLayoutReport('static-layout-facts', 'inline.ts', laws)
  const law = getLaw(report, 'mixed proof law')

  expect(law.status).toBe('pass')
  expect(law.checks).toBe(2)
  expect(law.proofs).toEqual([
    {mechanism: 'manual-check', checks: 1},
    {mechanism: 'concrete-close', checks: 1},
  ])
})

test('law summaries and reports record proof targets', () => {
  const laws = new Map()

  checkFact(laws, 'viewport law', staticLayoutFact.concreteRectXWithin(
    {left: 0, top: 0, width: 100, height: 20},
    {left: 0, right: 120},
  ), () => ({
    case: 'inside viewport',
  }), {
    targets: ['getGridLayout.items[].layoutBox.x', 'getGridLayout.items[].layoutBox.sizeX'],
  })
  check(laws, 'viewport law', true, () => ({
    case: 'prompt width',
  }), {
    targets: ['getGridLayout.items[].layoutBox.sizeX', 'getGridLayout.items[].prompt.box.sizeX'],
  })

  const report = buildStaticLayoutReport('static-layout-facts', 'inline.ts', laws)
  const law = getLaw(report, 'viewport law')

  expect(law.targets).toEqual([
    {
      target: 'getGridLayout.items[].layoutBox.sizeX',
      checks: 2,
      proofs: [
        {mechanism: 'concrete-rect-x-within', checks: 1},
        {mechanism: 'manual-check', checks: 1},
      ],
    },
    {
      target: 'getGridLayout.items[].layoutBox.x',
      checks: 1,
      proofs: [{mechanism: 'concrete-rect-x-within', checks: 1}],
    },
    {
      target: 'getGridLayout.items[].prompt.box.sizeX',
      checks: 1,
      proofs: [{mechanism: 'manual-check', checks: 1}],
    },
  ])
  expect(report.coverage.find(target => target.target === 'getGridLayout.items[].layoutBox.sizeX')).toEqual({
    target: 'getGridLayout.items[].layoutBox.sizeX',
    checks: 2,
    status: 'pass',
    laws: ['viewport law'],
    proofs: [
      {mechanism: 'concrete-rect-x-within', checks: 1},
      {mechanism: 'manual-check', checks: 1},
    ],
  })
})

// Proof surface stays ready.
test('photo-gallery static verifier keeps its current proof surface', async () => {
  const sourceFilePath = new URL('../demos/photo-gallery/layout-model.ts', import.meta.url).pathname
  const source = await Bun.file(sourceFilePath).text()
  const overrides = await loadStaticContractOverridesForSourceFile(sourceFilePath)
  const report = runPhotoGalleryStaticVerification(source, overrides)

  expect(report.phase).toBe('ready')
  expect(getLaw(report, 'getGridLayout row items do not overlap horizontally').status).toBe('pass')
  expect(getLaw(report, 'rectContainsPoint uses half-open rect edges').status).toBe('pass')
  expect(getLaw(report, 'clamp keeps symbolic branch guards aligned with min, value, and max').status).toBe('pass')
  expect(getLaw(report, 'clamp keeps results inside bounds and preserves the interior interval').status).toBe('pass')
  expect(getLaw(report, 'get1DItemSize derives image size from 1D bounds and scale').status).toBe('pass')
  expect(getLaw(report, 'getLineLayout y position uses padded vertical centering').status).toBe('pass')
  expect(getLaw(report, 'getLineLayout non-focused neighbors do not overlap horizontally').status).toBe('pass')
  expect(getLaw(report, 'getLineLayout advances currentLeft through non-focused items').status).toBe('pass')
  expect(getLaw(report, 'getGridLayout keeps column centers over range evaluation').status).toBe('pass')
  expect(getLaw(report, 'getGridLayout keeps column centers over range evaluation').kind).toBe('range')
  expect(getLaw(report, 'getGridLayout keeps column centers across width partitions').status).toBe('pass')
  expect(getLaw(report, 'getGridLayout keeps column centers across width partitions').kind).toBe('range')
  expect(getLaw(report, 'getGridLayout derives image sizes from aspect ratio caps').status).toBe('pass')
  expect(getLaw(report, 'getGridLayout spaces rowsTop by each row height plus vertical gap').status).toBe('pass')
  expect(getLaw(report, 'getGridLayout vertically centers items inside row slots').status).toBe('pass')
  expect(getLaw(report, 'getGridLayout discovered cols bands stay monotone').status).toBe('pass')
  expect(getLaw(report, 'getGridLayout keeps row count across width partitions').status).toBe('pass')
  expect(getLaw(report, 'makeItemLayoutGeometry keeps prompt x aligned with the image').kind).toBe('symbolic')
  expect(getLaw(report, 'colsBoxMaxSizeXF keeps cols in supported range over width intervals').kind).toBe('range')
  expect(getLaw(report, 'colsBoxMaxSizeXF fills the horizontal track across width partitions').status).toBe('pass')
  expect(getLaw(report, 'colsBoxMaxSizeXF exactly fills the horizontal track').kind).toBe('concrete-sweep')
  expect(getLaw(report, 'colsBoxMaxSizeXF exactly fills the horizontal track').checks).toBe(1281)
  expect(report.candidateLaws?.some(candidate => candidate.name === 'colsBoxMaxSizeXF sweep suggests filledWidth = containerSizeX')).toBe(false)
  expect(report.candidateLaws?.some(candidate => candidate.name === 'colsBoxMaxSizeXF sweep observed cols in 1..6')).toBe(true)
})

test('photo-gallery discovered cols bands agree with representative concrete widths', async () => {
  const sourceFilePath = new URL('../demos/photo-gallery/layout-model.ts', import.meta.url).pathname
  const source = await Bun.file(sourceFilePath).text()
  const overrides = await loadStaticContractOverridesForSourceFile(sourceFilePath)
  const analyzer = new LoweredProgramAnalyzer(source, {
    prompt1DLineHeight,
    prompt2DLineHeight,
    prompt2DMaxLines,
    promptPaddingBottom,
  }, overrides)
  const layoutSources = concreteArray([
    concreteObject({ar: concreteNumber(1), naturalSizeX: concreteNumber(400), preparedPrompt: concreteNull('concrete')}),
    concreteObject({ar: concreteNumber(1.5), naturalSizeX: concreteNumber(700), preparedPrompt: concreteNull('concrete')}),
    concreteObject({ar: concreteNumber(0.75), naturalSizeX: concreteNumber(480), preparedPrompt: concreteNull('concrete')}),
    concreteObject({ar: concreteNumber(2), naturalSizeX: concreteNumber(900), preparedPrompt: concreteNull('concrete')}),
    concreteObject({ar: concreteNumber(0.5), naturalSizeX: concreteNumber(360), preparedPrompt: concreteNull('concrete')}),
    concreteObject({ar: concreteNumber(1.2), naturalSizeX: concreteNumber(640), preparedPrompt: concreteNull('concrete')}),
  ])
  const boxesGapX = analyzer.getGlobalNumber('boxesGapX')
  const partitions = partitionIntegerRangeByConcreteNumberValue(320, 1600, width => {
    const cases = analyzer.evaluateFunction('colsBoxMaxSizeXF', [concreteNumber(width)], 'concrete')
    expect(cases).toHaveLength(1)
    return expectConcreteNumber(getProp(expectObject(cases[0]!.value), 'cols'))
  })

  for (const partition of partitions) {
    for (const width of pickIntegerBandRepresentatives(partition)) {
      const cases = analyzer.evaluateFunction('getGridLayout', [layoutSources, concreteNumber(width)], 'concrete')
      expect(cases).toHaveLength(1)
      const layout = expectObject(cases[0]!.value)
      const items = expectArray(getProp(layout, 'items'))
      const boxMaxSizeX = expectConcreteNumber(getProp(layout, 'boxMaxSizeX'))

      for (let itemIndex = 0; itemIndex < items.items.length; itemIndex++) {
        const item = expectObject(items.items[itemIndex]!)
        const layoutBox = expectObject(getProp(item, 'layoutBox'))
        const x = expectConcreteNumber(getProp(layoutBox, 'x'))
        const sizeX = expectConcreteNumber(getProp(layoutBox, 'sizeX'))
        const column = itemIndex % partition.value
        const actualCenterX = x + sizeX / 2
        const expectedCenterX = boxesGapX + column * boxesGapX + column * boxMaxSizeX + boxMaxSizeX / 2
        expect(Math.abs(actualCenterX - expectedCenterX) <= 1e-6).toBe(true)
      }
    }
  }
})

test('nicer-hacker-news static verifier keeps the row geometry slice ready', async () => {
  const source = await Bun.file(new URL('../demos/nicer-hacker-news/hn-thread-layout.ts', import.meta.url)).text()
  const report = runNicerHackerNewsStaticVerification(source)

  expect(report.phase).toBe('ready')
  expect(getLaw(report, 'layoutHNThreadVisualGeometry keeps comment x and width tied to indent math').status).toBe('pass')
  expect(getLaw(report, 'layoutHNRowHitGeometry keeps row tops contiguous over height intervals').status).toBe('pass')
  expect(getLaw(report, 'layoutHNThreadVisualGeometry keeps user tops pinned to row tops over intervals').status).toBe('pass')
  expect(getLaw(report, 'layoutHNThreadVisualGeometry keeps visible-row bookkeeping fixed when every row is visible').status).toBe('pass')
  expect(getLaw(report, 'layoutHNThreadVisualGeometry keeps visible-row bookkeeping internally consistent').checks).toBe(2)
})

test('nicer-hacker-news comment verifier keeps the text layout kernel ready', async () => {
  const sourceFilePath = new URL('../demos/nicer-hacker-news/hn-comment-layout.ts', import.meta.url).pathname
  const source = await Bun.file(sourceFilePath).text()
  const overrides = await loadStaticContractOverridesForSourceFile(sourceFilePath)
  const report = runHNCommentLayoutStaticVerification(source, overrides)

  expect(report.phase).toBe('ready')
  expect(getLaw(report, 'lineBreakCharCountAt returns exact line-break widths on exact strings').status).toBe('pass')
  expect(getLaw(report, 'lineBreakCharCountAt returns exact line-break widths on exact strings').kind).toBe('range')
  expect(getLaw(report, 'commentTextLength returns the last line textEnd').status).toBe('pass')
  expect(getLaw(report, 'commentTextLength returns the last line textEnd over exact layouts').kind).toBe('range')
  expect(getLaw(report, 'findHNCommentTextOffsetInEmptySpace returns exact offsets on seam intervals').status).toBe('pass')
  expect(getLaw(report, 'findHNCommentTextOffsetInEmptySpace returns null inside line interiors over intervals').status).toBe('pass')
  expect(getLaw(report, 'layoutPreparedHNCommentDoc keeps fragments inside their line boxes').status).toBe('pass')
  expect(getLaw(report, 'findHNCommentTextRects returns the expected merged geometry on concrete scenarios').status).toBe('pass')
  expect(getLaw(report, 'findHNCommentTextOffsetInEmptySpace returns the expected offset at geometric seams').status).toBe('pass')
  expect(getLaw(report, 'layoutPreparedHNCommentDoc derives total height from block heights and block gaps').checks).toBe(2)
})

test('life-calendar static verifier keeps the grid sizing kernel ready', async () => {
  const source = await Bun.file(new URL('../demos/life-calendar/grid-sizing.ts', import.meta.url)).text()
  const report = runLifeCalendarStaticVerification(source)

  expect(report.phase).toBe('ready')
  expect(getLaw(report, 'gridSizing keeps countX a multiple of 7').status).toBe('pass')
  expect(getLaw(report, 'gridSizing fills gridSizeY exactly').status).toBe('pass')
  expect(getLaw(report, 'gridSizing covers all cells').status).toBe('pass')
  expect(getLaw(report, 'gridSizing keeps blockSize positive over viewport intervals').status).toBe('pass')
  expect(getLaw(report, 'hitTest returns the expected cell index at known positions').status).toBe('pass')
  expect(getLaw(report, 'hitTest returns the expected cell index at known positions').checks).toBe(9)
})

test('gesture-flick-snap-target static verifier keeps the snap geometry ready', async () => {
  const source = await Bun.file(new URL('../demos/gesture-flick-snap-target/snap-layout.ts', import.meta.url)).text()
  const report = runGestureFlickStaticVerification(source)

  expect(report.phase).toBe('ready')
  expect(getLaw(report, 'getCorners keeps each corner at the padded viewport edge').status).toBe('pass')
  expect(getLaw(report, 'nearestCorner always returns one of the four corners').status).toBe('pass')
  expect(getLaw(report, 'nearestCorner returns a corner with minimal squared distance').status).toBe('pass')
  expect(getLaw(report, 'decayRestPos adds velocity divided by friction').status).toBe('pass')
})

test('draggable-cards static verifier keeps the swap geometry ready', async () => {
  const source = await Bun.file(new URL('../demos/draggable-cards/swap-layout.ts', import.meta.url)).text()
  const report = runDraggableCardsStaticVerification(source)

  expect(report.phase).toBe('ready')
  expect(getLaw(report, 'center returns half the remaining space').status).toBe('pass')
  expect(getLaw(report, 'shouldSwapUp uses a strict midpoint threshold').status).toBe('pass')
  expect(getLaw(report, 'shouldSwapDown uses a strict midpoint threshold').status).toBe('pass')
  expect(getLaw(report, 'swap thresholds leave a dead zone at the midpoint').status).toBe('pass')
  expect(getLaw(report, 'stackLayout returns one contiguous top per row').status).toBe('pass')
})

test('scroll-anchor static verifier keeps anchor preservation ready', async () => {
  const source = await Bun.file(new URL('../demos/scroll-anchor/anchor-layout.ts', import.meta.url)).text()
  const report = runScrollAnchorStaticVerification(source)

  expect(report.phase).toBe('ready')
  expect(getLaw(report, 'computeAnchorLayout total height matches grouped item geometry').status).toBe('pass')
  expect(getLaw(report, 'computeAnchorLayout returns one positioned output per input item').status).toBe('pass')
  expect(getLaw(report, 'prepending items preserves the anchored item screen y').status).toBe('pass')
})

test('life-calendar verifier catches broken countX divisibility', async () => {
  const source = await Bun.file(new URL('../demos/life-calendar/grid-sizing.ts', import.meta.url)).text()
  const buggySource = replaceOnce(source, '/ 7) * 7', '/ 7) * 6')
  const report = runLifeCalendarStaticVerification(buggySource)

  expect(report.phase).toBe('error')
  expect(getLaw(report, 'gridSizing keeps countX a multiple of 7').status).toBe('fail')
})

test('life-calendar verifier catches broken grid height derivation', async () => {
  const source = await Bun.file(new URL('../demos/life-calendar/grid-sizing.ts', import.meta.url)).text()
  const buggySource = replaceOnce(source, 'const blockSize = gridSizeY / countY', 'const blockSize = gridSizeY / (countY + 1)')
  const report = runLifeCalendarStaticVerification(buggySource)

  expect(report.phase).toBe('error')
  expect(getLaw(report, 'gridSizing fills gridSizeY exactly').status).toBe('fail')
})

// Contract loading.
test('photo-gallery verifier can auto-load imported sidecar contracts from the source file', async () => {
  const sourceFilePath = new URL('../demos/photo-gallery/layout-model.ts', import.meta.url).pathname
  const report = await runPhotoGalleryStaticVerificationForSourceFile(sourceFilePath)

  expect(report.phase).toBe('ready')
  expect(getLaw(report, 'getGridLayout row items do not overlap horizontally').status).toBe('pass')
  expect(getFunctionSummary(report, 'measurePromptLayout').kind).toBe('return-value')
  expect(getFunctionSummary(report, 'measurePromptLayout').domains).toEqual(['concrete', 'range'])
})

test('HN comment verifier can auto-load same-file sidecar contracts', async () => {
  const sourceFilePath = new URL('../demos/nicer-hacker-news/hn-comment-layout.ts', import.meta.url).pathname
  const report = await runHNCommentLayoutStaticVerificationForSourceFile(sourceFilePath)

  expect(report.phase).toBe('ready')
  expect(getLaw(report, 'findHNCommentTextRects returns the expected merged geometry on concrete scenarios').status).toBe('pass')
  expect(getFunctionSummary(report, 'layoutNextLine').domains).toEqual(['concrete', 'range'])
  expect(getFunctionSummary(report, 'walkRichInlineLineRanges').domains).toEqual(['concrete'])
  expect(getFunctionSummary(report, 'pushMergedRect').domains).toEqual(['concrete'])
})

// Mutation canaries.
test('photo-gallery verifier catches broken track-fill math', async () => {
  const sourceFilePath = new URL('../demos/photo-gallery/layout-model.ts', import.meta.url).pathname
  const source = await Bun.file(sourceFilePath).text()
  const overrides = await loadStaticContractOverridesForSourceFile(sourceFilePath)
  const buggySource = replaceOnce(
    source,
    'const boxMaxSizeX = (containerSizeX - boxesGapX - cols * boxesGapX) / cols',
    'const boxMaxSizeX = containerSizeX / cols',
  )
  const report = runPhotoGalleryStaticVerification(buggySource, overrides)

  expect(report.phase).toBe('error')
  expect(getLaw(report, 'colsBoxMaxSizeXF fills the horizontal track across width partitions').status).toBe('fail')
  expect(getLaw(report, 'colsBoxMaxSizeXF exactly fills the horizontal track').status).toBe('fail')
})

test('photo-gallery verifier catches broken column-slot math', async () => {
  const sourceFilePath = new URL('../demos/photo-gallery/layout-model.ts', import.meta.url).pathname
  const source = await Bun.file(sourceFilePath).text()
  const overrides = await loadStaticContractOverridesForSourceFile(sourceFilePath)
  const buggySource = replaceOnce(
    source,
    'const x = boxesGapX + (boxMaxSizeX + boxesGapX) * (i % cols) + (boxMaxSizeX - measurement.imageSizeX) / 2',
    'const x = boxesGapX + (boxMaxSizeX + boxesGapX) * ((i + 1) % cols) + (boxMaxSizeX - measurement.imageSizeX) / 2',
  )
  const report = runPhotoGalleryStaticVerification(buggySource, overrides)
  const law = getLaw(report, 'getGridLayout keeps column centers across width partitions')

  expect(report.phase).toBe('error')
  expect(law.status).toBe('fail')
  const failure = getFirstFailure(law)
  expect(failure['widthMin']).toBe(failure['widthMax'])
  expect(failure['partitionWidthMin']).toBeDefined()
  expect(failure['partitionWidthMax']).toBeDefined()
  expect(failure['column']).toBe(0)
  expect(failure['expectedCenterX']).toBeDefined()
  expect(getLaw(report, 'getGridLayout keeps column centers over range evaluation').status).toBe('fail')
  expect(getLaw(report, 'getGridLayout keeps column centers across width partitions').status).toBe('fail')
})

test('photo-gallery verifier catches broken half-open hit testing', async () => {
  const sourceFilePath = new URL('../demos/photo-gallery/layout-model.ts', import.meta.url).pathname
  const source = await Bun.file(sourceFilePath).text()
  const overrides = await loadStaticContractOverridesForSourceFile(sourceFilePath)
  const buggySource = replaceOnce(
    source,
    'x < r.x + r.sizeX',
    'x <= r.x + r.sizeX',
  )
  const report = runPhotoGalleryStaticVerification(buggySource, overrides)
  const law = getLaw(report, 'rectContainsPoint uses half-open rect edges')

  expect(report.phase).toBe('error')
  expect(law.status).toBe('fail')
  expect(getFirstFailure(law)['scenario']).toBe('right_edge_excluded')
})

test('photo-gallery verifier catches broken clamp boundary branch shape', async () => {
  const sourceFilePath = new URL('../demos/photo-gallery/layout-model.ts', import.meta.url).pathname
  const source = await Bun.file(sourceFilePath).text()
  const overrides = await loadStaticContractOverridesForSourceFile(sourceFilePath)
  const buggySource = replaceOnce(
    source,
    'return v > max ? max : v < min ? min : v',
    'return v >= max ? max : v < min ? min : v',
  )
  const report = runPhotoGalleryStaticVerification(buggySource, overrides)

  expect(report.phase).toBe('error')
  expect(getLaw(report, 'clamp keeps symbolic branch guards aligned with min, value, and max').status).toBe('fail')
})

test('photo-gallery verifier catches broken 1D focused scale policy', async () => {
  const sourceFilePath = new URL('../demos/photo-gallery/layout-model.ts', import.meta.url).pathname
  const source = await Bun.file(sourceFilePath).text()
  const overrides = await loadStaticContractOverridesForSourceFile(sourceFilePath)
  const buggySource = replaceOnce(
    source,
    'get1DItemSize(source, box1DMaxSizeX, box1DMaxSizeY, i === focused ? 1 : 0.7)',
    'get1DItemSize(source, box1DMaxSizeX, box1DMaxSizeY, i !== focused ? 1 : 0.7)',
  )
  const report = runPhotoGalleryStaticVerification(buggySource, overrides)

  expect(report.phase).toBe('error')
  expect(getLaw(report, 'getLineLayout derives item sizes from 1D bounds and focus scale').status).toBe('fail')
})

test('photo-gallery verifier catches broken 1D y centering', async () => {
  const sourceFilePath = new URL('../demos/photo-gallery/layout-model.ts', import.meta.url).pathname
  const source = await Bun.file(sourceFilePath).text()
  const overrides = await loadStaticContractOverridesForSourceFile(sourceFilePath)
  const buggySource = replaceOnce(
    source,
    'const y = Math.max(windowPaddingTop, (windowSizeY - measurement.layoutHeight) / 2) + scrollY',
    'const y = Math.max(windowPaddingTop, (windowSizeY + measurement.layoutHeight) / 2) + scrollY',
  )
  const report = runPhotoGalleryStaticVerification(buggySource, overrides)
  const law = getLaw(report, 'getLineLayout y position uses padded vertical centering')

  expect(report.phase).toBe('error')
  expect(law.status).toBe('fail')
  expect(getFirstFailure(law)['actualY']).toBeDefined()
})

test('photo-gallery verifier catches broken grid row centering', async () => {
  const sourceFilePath = new URL('../demos/photo-gallery/layout-model.ts', import.meta.url).pathname
  const source = await Bun.file(sourceFilePath).text()
  const overrides = await loadStaticContractOverridesForSourceFile(sourceFilePath)
  const buggySource = replaceOnce(
    source,
    'const y = rowsTop[currentRow]! + (rowHeights[currentRow]! - measurement.layoutHeight) / 2',
    'const y = rowsTop[currentRow]! + (rowHeights[currentRow]! - measurement.layoutHeight) / 3',
  )
  const report = runPhotoGalleryStaticVerification(buggySource, overrides)

  expect(report.phase).toBe('error')
  expect(getLaw(report, 'getGridLayout vertically centers items inside row slots').status).toBe('fail')
})

test('photo-gallery verifier catches broken grid row spacing', async () => {
  const sourceFilePath = new URL('../demos/photo-gallery/layout-model.ts', import.meta.url).pathname
  const source = await Bun.file(sourceFilePath).text()
  const overrides = await loadStaticContractOverridesForSourceFile(sourceFilePath)
  const buggySource = replaceOnce(
    source,
    'rowsTop.push(rowsTop.at(-1)! + rowHeight + boxesGapY)',
    'rowsTop.push(rowsTop.at(-1)! + rowHeight - boxesGapY)',
  )
  const report = runPhotoGalleryStaticVerification(buggySource, overrides)
  const law = getLaw(report, 'getGridLayout spaces rowsTop by each row height plus vertical gap')

  expect(report.phase).toBe('error')
  expect(law.status).toBe('fail')
  expect(getFirstFailure(law)['actualSpacing']).toBeDefined()
})

test('photo-gallery verifier catches broken range content-height derivation', async () => {
  const sourceFilePath = new URL('../demos/photo-gallery/layout-model.ts', import.meta.url).pathname
  const source = await Bun.file(sourceFilePath).text()
  const overrides = await loadStaticContractOverridesForSourceFile(sourceFilePath)
  const buggySource = replaceOnce(
    source,
    'contentHeight: rowsTop.at(-1)!',
    'contentHeight: rowsTop[0]!',
  )
  const report = runPhotoGalleryStaticVerification(buggySource, overrides)
  const law = getLaw(report, 'getGridLayout content height comes from last rowsTop over range evaluation')

  expect(report.phase).toBe('error')
  expect(law.status).toBe('fail')
  expect(law.kind).toBe('range')
  expect(getFirstFailure(law)['contentHeight']).toBeDefined()
  expect(getLaw(report, 'getGridLayout keeps content height tied to rowsTop across width partitions').status).toBe('fail')
})

test('photo-gallery verifier catches broken negative portrait scaling over width partitions', async () => {
  const sourceFilePath = new URL('../demos/photo-gallery/layout-model.ts', import.meta.url).pathname
  const source = await Bun.file(sourceFilePath).text()
  const overrides = await loadStaticContractOverridesForSourceFile(sourceFilePath)
  const buggySource = replaceOnce(
    source,
    'boxMaxSizeX * 1.05',
    'boxMaxSizeX * -1.05',
  )
  const report = runPhotoGalleryStaticVerification(buggySource, overrides)
  const law = getLaw(report, 'getGridLayout keeps column centers across width partitions')

  expect(report.phase).toBe('error')
  expect(law.status).toBe('fail')
  expect(law.kind).toBe('range')
  expect(getFirstFailure(law)['expectedCenterX']).toBeDefined()
})

test('gesture-flick verifier catches broken nearestCorner comparison', async () => {
  const source = await Bun.file(new URL('../demos/gesture-flick-snap-target/snap-layout.ts', import.meta.url)).text()
  const buggySource = replaceOnce(source, 'if (d < bestDist)', 'if (d > bestDist)')
  const report = runGestureFlickStaticVerification(buggySource)

  expect(report.phase).toBe('error')
  expect(getLaw(report, 'nearestCorner returns a corner with minimal squared distance').status).toBe('fail')
})

test('draggable-cards verifier catches broken swap midpoint ownership', async () => {
  const source = await Bun.file(new URL('../demos/draggable-cards/swap-layout.ts', import.meta.url)).text()
  const buggySource = replaceOnce(source, 'return pointerY < neighborDestY + neighborSizeY / 2', 'return pointerY <= neighborDestY + neighborSizeY / 2')
  const report = runDraggableCardsStaticVerification(buggySource)

  expect(report.phase).toBe('error')
  expect(getLaw(report, 'shouldSwapUp uses a strict midpoint threshold').status).toBe('fail')
  expect(getLaw(report, 'swap thresholds leave a dead zone at the midpoint').status).toBe('fail')
})

test('scroll-anchor verifier catches broken anchor delta direction', async () => {
  const source = await Bun.file(new URL('../demos/scroll-anchor/anchor-layout.ts', import.meta.url)).text()
  const buggySource = replaceOnce(
    source,
    'adjustedScrollTop = adjustedScrollTop + (y - anchorPrevY)',
    'adjustedScrollTop = adjustedScrollTop - (y - anchorPrevY)',
  )
  const report = runScrollAnchorStaticVerification(buggySource)
  const law = getLaw(report, 'prepending items preserves the anchored item screen y')

  expect(report.phase).toBe('error')
  expect(law.status).toBe('fail')
  expect(getFirstFailure(law)['afterScreenY']).toBeDefined()
})

test('HN row verifier catches broken comment width math', async () => {
  const source = await Bun.file(new URL('../demos/nicer-hacker-news/hn-thread-layout.ts', import.meta.url)).text()
  const buggySource = replaceOnce(
    source,
    'width: row.commentLayout.width + params.commentRightGap,',
    'width: row.commentLayout.width - params.commentRightGap,',
  )
  const report = runNicerHackerNewsStaticVerification(buggySource)
  const law = getLaw(report, 'layoutHNThreadVisualGeometry keeps comment x and width tied to indent math')

  expect(report.phase).toBe('error')
  expect(law.status).toBe('fail')
  const failure = getFirstFailure(law)
  expect(failure['rowIndex']).toBeDefined()
  expect(failure['commentWidth']).toBeDefined()
  expect(failure['expectedCommentWidth']).toBeDefined()
})

test('HN row verifier catches broken row-top interval math', async () => {
  const source = await Bun.file(new URL('../demos/nicer-hacker-news/hn-thread-layout.ts', import.meta.url)).text()
  const buggySource = replaceOnce(
    source,
    'rowTop += row.rowHeightNatural',
    'rowTop += row.rowHeightNatural + 1',
  )
  const report = runNicerHackerNewsStaticVerification(buggySource)
  const law = getLaw(report, 'layoutHNRowHitGeometry keeps row tops contiguous over height intervals')

  expect(report.phase).toBe('error')
  expect(law.status).toBe('fail')
  const failure = getFirstFailure(law)
  expect(failure['secondTop']).toBeDefined()
  expect(failure['expectedSecondTop']).toBeDefined()
})

test('HN thread verifier catches broken visible-row interval bookkeeping', async () => {
  const source = await Bun.file(new URL('../demos/nicer-hacker-news/hn-thread-layout.ts', import.meta.url)).text()
  const buggySource = replaceOnce(
    source,
    'firstVisibleRowTop = rowTop',
    'firstVisibleRowTop = rowBottom',
  )
  const report = runNicerHackerNewsStaticVerification(buggySource)
  const law = getLaw(report, 'layoutHNThreadVisualGeometry keeps visible-row bookkeeping fixed when every row is visible')

  expect(report.phase).toBe('error')
  expect(law.status).toBe('fail')
  expect(getFirstFailure(law)['firstVisibleRowTop']).toBeDefined()
})

test('HN thread verifier catches broken user-top clamp math', async () => {
  const source = await Bun.file(new URL('../demos/nicer-hacker-news/hn-thread-layout.ts', import.meta.url)).text()
  const buggySource = replaceOnce(
    source,
    'const userTop = clamp(rowTop, 0, rowBottom - userHeight)',
    'const userTop = clamp(rowTop + 4, 0, rowBottom - userHeight)',
  )
  const report = runNicerHackerNewsStaticVerification(buggySource)
  const law = getLaw(report, 'layoutHNThreadVisualGeometry keeps user tops pinned to row tops over intervals')

  expect(report.phase).toBe('error')
  expect(law.status).toBe('fail')
  expect(getFirstFailure(law)['firstUserTop']).toBeDefined()
})

test('HN comment verifier catches a broken minimum width clamp', async () => {
  const sourceFilePath = new URL('../demos/nicer-hacker-news/hn-comment-layout.ts', import.meta.url).pathname
  const source = await Bun.file(sourceFilePath).text()
  const overrides = await loadStaticContractOverridesForSourceFile(sourceFilePath)
  const buggySource = replaceOnce(
    source,
    'const safeWidth = Math.max(1, maxWidth)',
    'const safeWidth = Math.max(2, maxWidth)',
  )
  const report = runHNCommentLayoutStaticVerification(buggySource, overrides)

  expect(report.phase).toBe('error')
  expect(getLaw(report, 'layoutPreparedHNCommentDoc clamps width to at least one pixel').status).toBe('fail')
})

test('HN comment verifier catches broken CRLF counting', async () => {
  const sourceFilePath = new URL('../demos/nicer-hacker-news/hn-comment-layout.ts', import.meta.url).pathname
  const source = await Bun.file(sourceFilePath).text()
  const overrides = await loadStaticContractOverridesForSourceFile(sourceFilePath)
  const buggySource = replaceOnce(
    source,
    "if (ch === '\\r' && text[index + 1] === '\\n') return 2",
    "if (ch === '\\r' && text[index + 1] === '\\n') return 1",
  )
  const report = runHNCommentLayoutStaticVerification(buggySource, overrides)
  const law = getLaw(report, 'lineBreakCharCountAt returns exact line-break widths on exact strings')

  expect(report.phase).toBe('error')
  expect(law.status).toBe('fail')
  expect(getFirstFailure(law)['scenario']).toBe('crlf')
})

test('HN comment verifier catches broken commentTextLength math', async () => {
  const sourceFilePath = new URL('../demos/nicer-hacker-news/hn-comment-layout.ts', import.meta.url).pathname
  const source = await Bun.file(sourceFilePath).text()
  const overrides = await loadStaticContractOverridesForSourceFile(sourceFilePath)
  const buggySource = replaceOnce(
    source,
    'if (line != null) length = line.textEnd',
    'if (line != null) length = line.textStart',
  )
  const report = runHNCommentLayoutStaticVerification(buggySource, overrides)
  const concreteLaw = getLaw(report, 'commentTextLength returns the last line textEnd')
  const rangeLaw = getLaw(report, 'commentTextLength returns the last line textEnd over exact layouts')

  expect(report.phase).toBe('error')
  expect(concreteLaw.status).toBe('fail')
  const concreteFailure = getFirstFailure(concreteLaw)
  expect(concreteFailure['actual']).toBeDefined()
  expect(concreteFailure['expected']).toBeDefined()
  expect(rangeLaw.status).toBe('fail')
})

test('HN comment verifier catches a broken substring offset in text rect geometry', async () => {
  const sourceFilePath = new URL('../demos/nicer-hacker-news/hn-comment-layout.ts', import.meta.url).pathname
  const source = await Bun.file(sourceFilePath).text()
  const overrides = await loadStaticContractOverridesForSourceFile(sourceFilePath)
  const buggySource = replaceOnce(
    source,
    'const fragmentStart = Math.max(0, start - fragment.textStart)',
    'const fragmentStart = Math.max(0, start - fragment.textStart + 1)',
  )
  const report = runHNCommentLayoutStaticVerification(buggySource, overrides)
  const law = getLaw(report, 'findHNCommentTextRects returns the expected merged geometry on concrete scenarios')

  expect(report.phase).toBe('error')
  expect(law.status).toBe('fail')
  const failure = getFirstFailure(law)
  expect(failure['actualRects']).toBeDefined()
  expect(failure['expectedRects']).toBeDefined()
  expect(String(failure['geometrySvg']).startsWith('<svg ')).toBe(true)
})

test('HN comment verifier catches a broken midpoint decision in empty-space offsets', async () => {
  const sourceFilePath = new URL('../demos/nicer-hacker-news/hn-comment-layout.ts', import.meta.url).pathname
  const source = await Bun.file(sourceFilePath).text()
  const overrides = await loadStaticContractOverridesForSourceFile(sourceFilePath)
  const buggySource = replaceOnce(
    source,
    'return y < (previousLine.top + previousLine.height + line.top) / 2 ? previousLine.textEnd : line.textStart',
    'return y < (previousLine.top + previousLine.height + line.top) / 2 ? line.textStart : line.textStart',
  )
  const report = runHNCommentLayoutStaticVerification(buggySource, overrides)

  expect(report.phase).toBe('error')
  expect(getLaw(report, 'findHNCommentTextOffsetInEmptySpace returns the expected offset at geometric seams').status).toBe('fail')
})

test('HN comment verifier catches broken left-edge routing over intervals', async () => {
  const sourceFilePath = new URL('../demos/nicer-hacker-news/hn-comment-layout.ts', import.meta.url).pathname
  const source = await Bun.file(sourceFilePath).text()
  const overrides = await loadStaticContractOverridesForSourceFile(sourceFilePath)
  const buggySource = replaceOnce(
    source,
    'if (x < 0) return line.textStart',
    'if (x < 0) return line.textEnd',
  )
  const report = runHNCommentLayoutStaticVerification(buggySource, overrides)
  const law = getLaw(report, 'findHNCommentTextOffsetInEmptySpace returns exact offsets on seam intervals')

  expect(report.phase).toBe('error')
  expect(law.status).toBe('fail')
  expect(getFirstFailure(law)['scenario']).toBe('inside_line_left')
})

test('callback overrides thread outer local mutations back to the caller', () => {
  const source = `
function walk(cb: (n: number) => void) {
  cb(1)
}

function demo() {
  let total = 0
  walk(n => {
    total += n
  })
  return total
}
`
  const analyzer = new LoweredProgramAnalyzer(source, {}, {
    walk: {
      evaluate(args, mode, context) {
        if (mode !== 'concrete') throw new Error('walk override only supports concrete mode')
        const callbackReturns = invokeConcreteFunctionValue(context.analyzer, context.state, args[0]!, [concreteNumber(1)])
        return callbackReturns.map(result => ({
          constraints: result.state.constraints,
          env: result.state.env,
          value: concreteNull('concrete'),
        }))
      },
    },
  }, {
    includeFunctions: ['demo'],
  })

  const returns = analyzer.evaluateFunction('demo', [], 'concrete')
  expect(returns).toHaveLength(1)
  expect(expectConcreteNumber(returns[0]!.value)).toBe(1)
})

test('declarative callback contracts thread outer local mutations back to the caller', () => {
  const source = `
function walk(flow, cb) {
  cb(flow.items[0])
}

function demo() {
  const flow = {items: [1]}
  let total = 0
  walk(flow, n => {
    total += n
  })
  return total
}
`
  const analyzer = new LoweredProgramAnalyzer(source, {}, buildStaticContractOverrides({
    walk: contract.forEachArrayItem(0, ['items'], 1),
  }), {
    includeFunctions: ['demo'],
  })

  const returns = analyzer.evaluateFunction('demo', [], 'concrete')
  expect(returns).toHaveLength(1)
  expect(expectConcreteNumber(returns[0]!.value)).toBe(1)
})

test('ordinary helper calls stay pure from the caller env point of view', () => {
  const source = `
function plusOne(n: number) {
  return n + 1
}

function demo() {
  let total = 1
  const next = plusOne(total)
  return total + next
}
`
  const analyzer = new LoweredProgramAnalyzer(source, {}, {}, {
    includeFunctions: ['plusOne', 'demo'],
  })

  const returns = analyzer.evaluateFunction('demo', [], 'concrete')
  expect(returns).toHaveLength(1)
  expect(expectConcreteNumber(returns[0]!.value)).toBe(3)
})

test('declarative return-value contracts can synthesize structured geometry', () => {
  const source = `
function measure(width, lineHeight) {
  return null
}

function demo() {
  const layout = measure(120, 14)
  return layout.visibleHeight
}
`
  const analyzer = new LoweredProgramAnalyzer(source, {}, buildStaticContractOverrides({
    measure: contract.returnValue(contractValue.object({
      width: contractValue.arg(0),
      visibleHeight: contractValue.mul(contractValue.arg(1), contractValue.number(2)),
      lines: contractValue.array([]),
    })),
  }), {
    includeFunctions: ['demo'],
  })

  const returns = analyzer.evaluateFunction('demo', [], 'concrete')
  expect(returns).toHaveLength(1)
  expect(expectConcreteNumber(returns[0]!.value)).toBe(28)
})

test('declarative return-value contracts can synthesize range geometry', () => {
  const source = `
function measure(width, lineHeight) {
  return null
}

function demo(width: number, lineHeight: number) {
  const layout = measure(width, lineHeight)
  return layout.visibleHeight
}
`
  const analyzer = new LoweredProgramAnalyzer(source, {}, buildStaticContractOverrides({
    measure: contract.returnValue(contractValue.object({
      width: contractValue.arg(0),
      visibleHeight: contractValue.mul(contractValue.arg(1), contractValue.number(2)),
      lines: contractValue.array([]),
    })),
  }), {
    includeFunctions: ['demo'],
  })

  const visibleHeight = expectRangeNumber(joinRangeCases(analyzer.evaluateFunctionRange('demo', [
    rangeNumber(100, 160, true),
    rangeNumber(12, 16, true),
  ])))
  expect(visibleHeight).toEqual(rangeNumber(24, 32, true))
})

test('contract sketches can rediscover simple return-value summaries from samples', () => {
  const sketch = sketchStaticReturnContractFromSamples([
    {
      args: [concreteNull('concrete'), concreteNumber(120), concreteNumber(4), concreteNumber(14)],
      value: concreteObject({
        width: concreteNumber(120),
        visibleHeight: concreteNumber(28),
        lines: concreteArray([]),
      }),
    },
    {
      args: [concreteNull('concrete'), concreteNumber(200), concreteNumber(4), concreteNumber(10)],
      value: concreteObject({
        width: concreteNumber(200),
        visibleHeight: concreteNumber(20),
        lines: concreteArray([]),
      }),
    },
  ])
  expect(sketch?.evidence).toBe(2)
  if (sketch == null) throw new Error('Expected a contract sketch')
  expect(formatStaticContractSketchEntry('measure', sketch)).toBe(`measure: contract.returnValue(contractValue.object({
  width: contractValue.arg(1),
  visibleHeight: contractValue.mul(contractValue.arg(3), contractValue.number(2)),
  lines: contractValue.array([]),
})),`)

  const source = `
function measure(prepared, width, maxLines, lineHeight) {
  return null
}

function demo(width, lineHeight) {
  const layout = measure(null, width, 4, lineHeight)
  return layout.visibleHeight
}
`
  const analyzer = new LoweredProgramAnalyzer(source, {}, buildStaticContractOverrides({
    measure: sketch.spec,
  }), {
    includeFunctions: ['demo'],
  })

  const returns = analyzer.evaluateFunction('demo', [concreteNumber(150), concreteNumber(11)], 'concrete')
  expect(returns).toHaveLength(1)
  expect(expectConcreteNumber(returns[0]!.value)).toBe(22)
})

test('declarative lookup and string-width contracts can summarize range boundaries', () => {
  const source = `
function takeLine(doc, cursor) {
  return null
}

function measure(text) {
  return 0
}

function demo(doc, cursor) {
  const line = takeLine(doc, cursor)
  return measure(line.text)
}
`
  const analyzer = new LoweredProgramAnalyzer(source, {}, buildStaticContractOverrides({
    takeLine: contract.lookupArrayItem(0, ['lines'], 1, ['segmentIndex'], {defaultNull: true}),
    measure: contract.stringUnitWidth(0, 10),
  }), {
    includeFunctions: ['demo'],
  })

  const width = expectRangeNumber(joinRangeCases(analyzer.evaluateFunctionRange('demo', [
    rangeObject({
      lines: rangeArray([
        rangeObject({text: rangeString('hello')}),
        rangeObject({text: rangeString('world')}),
      ]),
    }),
    rangeObject({segmentIndex: rangeNumber(1, 1, true)}),
  ])))
  expect(width).toEqual(rangeNumber(50, 50, true))
})

test('range mode keeps exact append-only array facts through pushes', () => {
  const source = `
function demo() {
  const tops = [40]
  tops.push(120)
  tops.push(180)
  return tops
}
`
  const analyzer = new LoweredProgramAnalyzer(source, {}, {}, {
    includeFunctions: ['demo'],
  })

  const returns = analyzer.evaluateFunctionRange('demo', [])
  const tops = expectRangeArray(joinRangeCases(returns))

  expect(tops.lengthMin).toBe(3)
  expect(tops.lengthMax).toBe(3)
  expect(tops.isStrictlyIncreasingNumeric).toBe(true)
  expect(expectRangeNumber(tops.last!)).toEqual(rangeNumber(180, 180, true))
})

test('range mode drops the strict-increase flag when pushed values go backward', () => {
  const source = `
function demo() {
  const tops = [40]
  tops.push(120)
  tops.push(100)
  return tops
}
`
  const analyzer = new LoweredProgramAnalyzer(source, {}, {}, {
    includeFunctions: ['demo'],
  })

  const returns = analyzer.evaluateFunctionRange('demo', [])
  const tops = expectRangeArray(joinRangeCases(returns))

  expect(tops.lengthMin).toBe(3)
  expect(tops.isStrictlyIncreasingNumeric).toBe(false)
})

test('range mode keeps exact array indexing and at(-1)', () => {
  const source = `
function byIndex() {
  const values = [10, 20, 30]
  return values[1]
}

function byAt() {
  const values = [10, 20, 30]
  return values.at(-1)
}
`
  const analyzer = new LoweredProgramAnalyzer(source, {}, {}, {
    includeFunctions: ['byIndex', 'byAt'],
  })

  expect(expectRangeNumber(joinRangeCases(analyzer.evaluateFunctionRange('byIndex', [])))).toEqual(rangeNumber(20, 20, true))
  expect(expectRangeNumber(joinRangeCases(analyzer.evaluateFunctionRange('byAt', [])))).toEqual(rangeNumber(30, 30, true))
})

test('range mode maps exact arrays with callback item and index facts', () => {
  const source = `
function demo(offset: number) {
  const values = [10, 20]
  return values.map((value, index) => ({x: value + offset, index}))
}
`
  const analyzer = new LoweredProgramAnalyzer(source, {}, {}, {
    includeFunctions: ['demo'],
  })

  const items = expectRangeArray(joinRangeCases(analyzer.evaluateFunctionRange('demo', [
    rangeNumber(1, 3, true),
  ])))
  expect(items.lengthMin).toBe(2)
  expect(items.lengthMax).toBe(2)
  const exactItems = items.items
  if (exactItems == null) throw new Error('Expected exact mapped array items')
  const first = expectRangeObject(exactItems[0]!)
  const second = expectRangeObject(exactItems[1]!)

  expect(expectRangeNumber(getRangeProp(first, 'x'))).toEqual(rangeNumber(11, 13, true))
  expect(expectRangeNumber(getRangeProp(first, 'index'))).toEqual(rangeNumber(0, 0, true))
  expect(expectRangeNumber(getRangeProp(second, 'x'))).toEqual(rangeNumber(21, 23, true))
  expect(expectRangeNumber(getRangeProp(second, 'index'))).toEqual(rangeNumber(1, 1, true))
})

test('range mode tracks integer remainder bounds', () => {
  const source = `
function demo(width: number) {
  return width % 3
}
`
  const analyzer = new LoweredProgramAnalyzer(source, {}, {}, {
    includeFunctions: ['demo'],
  })

  const remainder = expectRangeNumber(joinRangeCases(analyzer.evaluateFunctionRange('demo', [rangeNumber(0, 100, true)])))
  expect(remainder).toEqual(rangeNumber(0, 2, true))
})

test('range mode tracks exact string lengths', () => {
  const source = `
function demo() {
  const text = 'hello'
  return text.length
}
`
  const analyzer = new LoweredProgramAnalyzer(source, {}, {}, {
    includeFunctions: ['demo'],
  })

  expect(expectRangeNumber(joinRangeCases(analyzer.evaluateFunctionRange('demo', [])))).toEqual(rangeNumber(5, 5, true))
})

test('range mode can index exact strings', () => {
  const source = `
function demo() {
  const text = 'hello'
  return text[1].length
}
`
  const analyzer = new LoweredProgramAnalyzer(source, {}, {}, {
    includeFunctions: ['demo'],
  })

  expect(expectRangeNumber(joinRangeCases(analyzer.evaluateFunctionRange('demo', [])))).toEqual(rangeNumber(1, 1, true))
})

test('range mode keeps Math.ceil results integral over non-integer intervals', () => {
  const source = `
function demo(value: number) {
  return Math.ceil(value)
}
`
  const analyzer = new LoweredProgramAnalyzer(source, {}, {}, {
    includeFunctions: ['demo'],
  })

  expect(expectRangeNumber(joinRangeCases(analyzer.evaluateFunctionRange('demo', [
    rangeNumber(1.1, 2.9, false),
  ])))).toEqual(rangeNumber(2, 3, true))
})

test('range mode narrows piecewise helpers over identifier comparisons', () => {
  const source = `
function clamp(min: number, v: number, max: number) {
  return v > max ? max : v < min ? min : v
}
`
  const analyzer = new LoweredProgramAnalyzer(source, {}, {}, {
    includeFunctions: ['clamp'],
  })

  const value = expectRangeNumber(joinRangeCases(analyzer.evaluateFunctionRange('clamp', [
    rangeNumber(10, 10, true),
    rangeNumber(0, 30, true),
    rangeNumber(20, 20, true),
  ])))

  expect(value).toEqual(rangeNumber(10, 20, true))
})

test('range mode narrows nested object properties through simple branches', () => {
  const source = `
function pick(params) {
  return params.value > params.max ? params.max : params.value
}
`
  const analyzer = new LoweredProgramAnalyzer(source, {}, {}, {
    includeFunctions: ['pick'],
  })

  const value = expectRangeNumber(joinRangeCases(analyzer.evaluateFunctionRange('pick', [rangeObject({
    value: rangeNumber(0, 30, true),
    max: rangeNumber(20, 20, true),
  })])))

  expect(value).toEqual(rangeNumber(0, 20, true))
})

test('range mode narrows logical branches before reading the taken path', () => {
  const source = `
function demo(value: number) {
  return value > 10 && value < 20 ? value : 0
}
`
  const analyzer = new LoweredProgramAnalyzer(source, {}, {}, {
    includeFunctions: ['demo'],
  })

  const value = expectRangeNumber(joinRangeCases(analyzer.evaluateFunctionRange('demo', [
    rangeNumber(0, 30, true),
  ])))

  expect(value).toEqual(rangeNumber(0, 19, true))
})
