import {expect, test} from 'bun:test'
import {
  buildStaticLayoutReport,
  checkFact,
  concreteArray,
  concreteNull,
  concreteNumber,
  concreteObject,
  expectArray,
  expectConcreteNumber,
  expectObject,
  expectRangeArray,
  expectRangeNumber,
  expectRangeObject,
  getProp,
  getRangeProp,
  invokeConcreteFunctionValue,
  joinRangeCases,
  LoweredProgramAnalyzer,
  rangeArray,
  rangeNumber,
  rangeObject,
  rangeString,
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
import {
  prompt1DLineHeight,
  prompt2DLineHeight,
  prompt2DMaxLines,
  promptPaddingBottom,
} from '../demos/photo-gallery/prompt-layout.ts'

function replaceOnce(source, from, to) {
  const next = source.replace(from, to)
  expect(next).not.toBe(source)
  return next
}

function getLaw(report, name) {
  const law = report.laws.find(candidate => candidate.name === name)
  expect(law).toBeDefined()
  return law
}

// Proof surface stays ready.
test('photo-gallery static verifier keeps its current proof surface', async () => {
  const sourceFilePath = new URL('../demos/photo-gallery/layout-model.ts', import.meta.url).pathname
  const source = await Bun.file(sourceFilePath).text()
  const overrides = await loadStaticContractOverridesForSourceFile(sourceFilePath)
  const report = runPhotoGalleryStaticVerification(source, overrides)

  expect(report.phase).toBe('ready')
  expect(getLaw(report, 'getGridLayout row items do not overlap horizontally')?.status).toBe('pass')
  expect(getLaw(report, 'getGridLayout keeps each item centered in its column slot')?.status).toBe('pass')
  expect(getLaw(report, 'getGridLayout keeps column centers over range evaluation')?.status).toBe('pass')
  expect(getLaw(report, 'getGridLayout keeps column centers over range evaluation')?.kind).toBe('range')
  expect(getLaw(report, 'getGridLayout keeps column centers across width partitions')?.status).toBe('pass')
  expect(getLaw(report, 'getGridLayout keeps column centers across width partitions')?.kind).toBe('range')
  expect(getLaw(report, 'getGridLayout discovered cols bands stay monotone')?.status).toBe('pass')
  expect(getLaw(report, 'getGridLayout keeps row count across width partitions')?.status).toBe('pass')
  expect(getLaw(report, 'makeItemLayoutGeometry keeps prompt x aligned with the image')?.kind).toBe('symbolic')
  expect(getLaw(report, 'colsBoxMaxSizeXF keeps cols in supported range over width intervals')?.kind).toBe('range')
  expect(getLaw(report, 'colsBoxMaxSizeXF keeps cols in supported range over width intervals')?.proofs?.[0]?.mechanism).toBe('range-within')
  expect(report.coverage.some(summary => summary.target === 'colsBoxMaxSizeXF.return.cols')).toBe(true)
  expect(report.functionSummaries?.some(summary => summary.name === 'measurePromptLayout' && summary.domains.includes('range'))).toBe(true)
  expect(report.candidateLaws?.some(candidate => candidate.name.includes('boxMaxSizeX'))).toBe(true)
  expect(getLaw(report, 'colsBoxMaxSizeXF fills the horizontal track across width partitions')?.status).toBe('pass')
  expect(getLaw(report, 'colsBoxMaxSizeXF exactly fills the horizontal track')?.kind).toBe('concrete-sweep')
  expect(getLaw(report, 'colsBoxMaxSizeXF exactly fills the horizontal track')?.checks).toBe(1281)
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
    return expectConcreteNumber(getProp(expectObject(cases[0].value), 'cols'))
  })

  for (const partition of partitions) {
    for (const width of pickIntegerBandRepresentatives(partition)) {
      const cases = analyzer.evaluateFunction('getGridLayout', [layoutSources, concreteNumber(width)], 'concrete')
      expect(cases).toHaveLength(1)
      const layout = expectObject(cases[0].value)
      const items = expectArray(getProp(layout, 'items'))
      const boxMaxSizeX = expectConcreteNumber(getProp(layout, 'boxMaxSizeX'))

      for (let itemIndex = 0; itemIndex < items.items.length; itemIndex++) {
        const item = expectObject(items.items[itemIndex])
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

test('static reports keep unknown separate from failures and summarize target coverage', () => {
  const laws = new Map()
  checkFact(laws, 'symbolic fact can be unknown', {
    kind: 'symbolic-equality',
    left: {kind: 'mul', left: {kind: 'var', name: 'x'}, right: {kind: 'var', name: 'x'}},
    right: {kind: 'var', name: 'x'},
  }, () => ({
    target: 'demo.return.width',
  }), {targets: ['demo.return.width']})

  const report = buildStaticLayoutReport('unit', 'unit.ts', laws)
  expect(report.phase).toBe('error')
  expect(getLaw(report, 'symbolic fact can be unknown')?.status).toBe('unknown')
  expect(getLaw(report, 'symbolic fact can be unknown')?.firstUnknown?.reason).toBeDefined()
  expect(report.coverage[0]?.target).toBe('demo.return.width')
  expect(report.coverage[0]?.status).toBe('unknown')
})

test('nicer-hacker-news static verifier keeps the row geometry slice ready', async () => {
  const source = await Bun.file(new URL('../demos/nicer-hacker-news/hn-thread-layout.ts', import.meta.url)).text()
  const report = runNicerHackerNewsStaticVerification(source)

  expect(report.phase).toBe('ready')
  expect(getLaw(report, 'layoutHNThreadVisualGeometry keeps comment x and width tied to indent math')?.status).toBe('pass')
  expect(getLaw(report, 'layoutHNRowHitGeometry keeps row tops contiguous over height intervals')?.status).toBe('pass')
  expect(getLaw(report, 'layoutHNThreadVisualGeometry keeps user tops pinned to row tops over intervals')?.status).toBe('pass')
  expect(getLaw(report, 'layoutHNThreadVisualGeometry keeps visible-row bookkeeping fixed when every row is visible')?.status).toBe('pass')
  expect(getLaw(report, 'layoutHNThreadVisualGeometry keeps visible-row bookkeeping internally consistent')?.checks).toBe(2)
})

test('nicer-hacker-news comment verifier keeps the text layout kernel ready', async () => {
  const sourceFilePath = new URL('../demos/nicer-hacker-news/hn-comment-layout.ts', import.meta.url).pathname
  const source = await Bun.file(sourceFilePath).text()
  const overrides = await loadStaticContractOverridesForSourceFile(sourceFilePath)
  const report = runHNCommentLayoutStaticVerification(source, overrides)

  expect(report.phase).toBe('ready')
  expect(getLaw(report, 'lineBreakCharCountAt returns exact line-break widths on exact strings')?.status).toBe('pass')
  expect(getLaw(report, 'lineBreakCharCountAt returns exact line-break widths on exact strings')?.kind).toBe('range')
  expect(getLaw(report, 'commentTextLength returns the last line textEnd')?.status).toBe('pass')
  expect(getLaw(report, 'commentTextLength returns the last line textEnd over exact layouts')?.kind).toBe('range')
  expect(getLaw(report, 'findHNCommentTextOffsetInEmptySpace returns exact offsets on seam intervals')?.status).toBe('pass')
  expect(getLaw(report, 'findHNCommentTextOffsetInEmptySpace returns null inside line interiors over intervals')?.status).toBe('pass')
  expect(getLaw(report, 'layoutPreparedHNCommentDoc keeps fragments inside their line boxes')?.status).toBe('pass')
  expect(getLaw(report, 'findHNCommentTextRects returns the expected merged geometry on concrete scenarios')?.status).toBe('pass')
  expect(getLaw(report, 'findHNCommentTextOffsetInEmptySpace returns the expected offset at geometric seams')?.status).toBe('pass')
  expect(getLaw(report, 'layoutPreparedHNCommentDoc derives total height from block heights and block gaps')?.checks).toBe(2)
})

test('life-calendar static verifier keeps the grid sizing kernel ready', async () => {
  const source = await Bun.file(new URL('../demos/life-calendar/grid-sizing.ts', import.meta.url)).text()
  const report = runLifeCalendarStaticVerification(source)

  expect(report.phase).toBe('ready')
  expect(getLaw(report, 'gridSizing keeps countX a multiple of 7')?.status).toBe('pass')
  expect(getLaw(report, 'gridSizing fills gridSizeY exactly')?.status).toBe('pass')
  expect(getLaw(report, 'gridSizing covers all cells')?.status).toBe('pass')
  expect(getLaw(report, 'gridSizing keeps blockSize positive over viewport intervals')?.status).toBe('pass')
  expect(getLaw(report, 'hitTest returns the expected cell index at known positions')?.status).toBe('pass')
  expect(getLaw(report, 'hitTest returns the expected cell index at known positions')?.checks).toBe(7)
})

test('life-calendar verifier catches broken countX divisibility', async () => {
  const source = await Bun.file(new URL('../demos/life-calendar/grid-sizing.ts', import.meta.url)).text()
  const buggySource = replaceOnce(source, '/ 7) * 7', '/ 7) * 6')
  const report = runLifeCalendarStaticVerification(buggySource)

  expect(report.phase).toBe('error')
  expect(getLaw(report, 'gridSizing keeps countX a multiple of 7')?.status).toBe('fail')
})

test('life-calendar verifier catches broken grid height derivation', async () => {
  const source = await Bun.file(new URL('../demos/life-calendar/grid-sizing.ts', import.meta.url)).text()
  const buggySource = replaceOnce(source, 'const blockSize = gridSizeY / countY', 'const blockSize = gridSizeY / (countY + 1)')
  const report = runLifeCalendarStaticVerification(buggySource)

  expect(report.phase).toBe('error')
  expect(getLaw(report, 'gridSizing fills gridSizeY exactly')?.status).toBe('fail')
})

// Contract loading.
test('photo-gallery verifier can auto-load imported sidecar contracts from the source file', async () => {
  const sourceFilePath = new URL('../demos/photo-gallery/layout-model.ts', import.meta.url).pathname
  const report = await runPhotoGalleryStaticVerificationForSourceFile(sourceFilePath)

  expect(report.phase).toBe('ready')
  expect(getLaw(report, 'getGridLayout row items do not overlap horizontally')?.status).toBe('pass')
})

test('HN comment verifier can auto-load same-file sidecar contracts', async () => {
  const sourceFilePath = new URL('../demos/nicer-hacker-news/hn-comment-layout.ts', import.meta.url).pathname
  const report = await runHNCommentLayoutStaticVerificationForSourceFile(sourceFilePath)

  expect(report.phase).toBe('ready')
  expect(getLaw(report, 'findHNCommentTextRects returns the expected merged geometry on concrete scenarios')?.status).toBe('pass')
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
  expect(getLaw(report, 'colsBoxMaxSizeXF fills the horizontal track across width partitions')?.status).toBe('fail')
  expect(getLaw(report, 'colsBoxMaxSizeXF exactly fills the horizontal track')?.status).toBe('fail')
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
  expect(law?.status).toBe('fail')
  expect(law?.firstFailure?.widthMin).toBe(law?.firstFailure?.widthMax)
  expect(law?.firstFailure?.partitionWidthMin).toBeDefined()
  expect(law?.firstFailure?.partitionWidthMax).toBeDefined()
  expect(law?.firstFailure?.column).toBe(0)
  expect(law?.firstFailure?.expectedCenterX).toBeDefined()
  expect(getLaw(report, 'getGridLayout keeps each item centered in its column slot')?.status).toBe('fail')
  expect(getLaw(report, 'getGridLayout keeps column centers over range evaluation')?.status).toBe('fail')
  expect(getLaw(report, 'getGridLayout keeps column centers across width partitions')?.status).toBe('fail')
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
  expect(law?.status).toBe('fail')
  expect(law?.kind).toBe('range')
  expect(law?.firstFailure?.contentHeight).toBeDefined()
  expect(getLaw(report, 'getGridLayout keeps content height tied to rowsTop across width partitions')?.status).toBe('fail')
})

test('HN row verifier catches broken comment width math', async () => {
  const source = await Bun.file(new URL('../demos/nicer-hacker-news/hn-thread-layout.ts', import.meta.url)).text()
  const buggySource = replaceOnce(
    source,
    'width: row.commentLayout.width + params.commentRightGap,',
    'width: row.commentLayout.width - params.commentRightGap,',
  )
  const report = runNicerHackerNewsStaticVerification(buggySource)

  expect(report.phase).toBe('error')
  expect(getLaw(report, 'layoutHNThreadVisualGeometry keeps comment x and width tied to indent math')?.status).toBe('fail')
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
  expect(law?.status).toBe('fail')
  expect(law?.firstFailure?.secondTop).toBeDefined()
  expect(law?.firstFailure?.expectedSecondTop).toBeDefined()
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
  expect(law?.status).toBe('fail')
  expect(law?.firstFailure?.firstVisibleRowTop).toBeDefined()
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
  expect(law?.status).toBe('fail')
  expect(law?.firstFailure?.firstUserTop).toBeDefined()
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
  expect(getLaw(report, 'layoutPreparedHNCommentDoc clamps width to at least one pixel')?.status).toBe('fail')
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
  expect(law?.status).toBe('fail')
  expect(law?.firstFailure?.scenario).toBe('crlf')
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
  expect(concreteLaw?.status).toBe('fail')
  expect(concreteLaw?.firstFailure?.actual).toBeDefined()
  expect(concreteLaw?.firstFailure?.expected).toBeDefined()
  expect(rangeLaw?.status).toBe('fail')
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

  expect(report.phase).toBe('error')
  expect(getLaw(report, 'findHNCommentTextRects returns the expected merged geometry on concrete scenarios')?.status).toBe('fail')
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
  expect(getLaw(report, 'findHNCommentTextOffsetInEmptySpace returns the expected offset at geometric seams')?.status).toBe('fail')
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
  expect(law?.status).toBe('fail')
  expect(law?.firstFailure?.scenario).toBe('inside_line_left')
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
        const callbackReturns = invokeConcreteFunctionValue(context.analyzer, context.state, args[0], [concreteNumber(1)])
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
  expect(expectConcreteNumber(returns[0].value)).toBe(1)
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
  expect(expectConcreteNumber(returns[0].value)).toBe(1)
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
  expect(expectConcreteNumber(returns[0].value)).toBe(3)
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
  expect(expectConcreteNumber(returns[0].value)).toBe(28)
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
  expect(expectConcreteNumber(returns[0].value)).toBe(22)
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
  expect(expectRangeNumber(tops.last)).toEqual(rangeNumber(180, 180, true))
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
  const first = expectRangeObject(items.items[0])
  const second = expectRangeObject(items.items[1])

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
