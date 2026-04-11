import {expect, test} from 'bun:test'
import {
  concreteNull,
  concreteNumber,
  expectConcreteNumber,
  expectRangeArray,
  expectRangeNumber,
  invokeConcreteFunctionValue,
  joinRangeCases,
  LoweredProgramAnalyzer,
  rangeNumber,
  rangeObject,
} from './layout-static-core.ts'
import {
  buildConcreteContractOverrides,
  contract,
  contractValue,
  loadStaticContractOverridesForSourceFile,
} from './layout-static-contracts.ts'
import {
  runHNCommentLayoutStaticVerification,
  runHNCommentLayoutStaticVerificationForSourceFile,
} from './nicer-hacker-news/comment-layout-static-verifier.ts'
import {runNicerHackerNewsStaticVerification} from './nicer-hacker-news/layout-static-verifier.ts'
import {
  runPhotoGalleryStaticVerification,
  runPhotoGalleryStaticVerificationForSourceFile,
} from './photo-gallery/layout-static-verifier.ts'

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
  const sourceFilePath = new URL('./photo-gallery/layout-model.ts', import.meta.url).pathname
  const source = await Bun.file(sourceFilePath).text()
  const overrides = await loadStaticContractOverridesForSourceFile(sourceFilePath)
  const report = runPhotoGalleryStaticVerification(source, overrides)

  expect(report.phase).toBe('ready')
  expect(getLaw(report, 'getGridLayout row items do not overlap horizontally')?.status).toBe('pass')
  expect(getLaw(report, 'getGridLayout keeps each item centered in its column slot')?.status).toBe('pass')
  expect(getLaw(report, 'makeItemLayoutGeometry keeps prompt x aligned with the image')?.kind).toBe('symbolic')
  expect(getLaw(report, 'colsBoxMaxSizeXF keeps cols in supported range over width intervals')?.kind).toBe('range')
  expect(getLaw(report, 'colsBoxMaxSizeXF exactly fills the horizontal track')?.kind).toBe('concrete-sweep')
  expect(getLaw(report, 'colsBoxMaxSizeXF exactly fills the horizontal track')?.checks).toBe(1281)
})

test('nicer-hacker-news static verifier keeps the row geometry slice ready', async () => {
  const source = await Bun.file(new URL('./nicer-hacker-news/hn-thread-layout.ts', import.meta.url)).text()
  const report = runNicerHackerNewsStaticVerification(source)

  expect(report.phase).toBe('ready')
  expect(getLaw(report, 'layoutHNThreadVisualGeometry keeps comment x and width tied to indent math')?.status).toBe('pass')
  expect(getLaw(report, 'layoutHNRowHitGeometry keeps row tops contiguous over height intervals')?.status).toBe('pass')
  expect(getLaw(report, 'layoutHNThreadVisualGeometry keeps user tops pinned to row tops over intervals')?.status).toBe('pass')
  expect(getLaw(report, 'layoutHNThreadVisualGeometry keeps visible-row bookkeeping fixed when every row is visible')?.status).toBe('pass')
  expect(getLaw(report, 'layoutHNThreadVisualGeometry keeps visible-row bookkeeping internally consistent')?.checks).toBe(2)
})

test('nicer-hacker-news comment verifier keeps the text layout kernel ready', async () => {
  const sourceFilePath = new URL('./nicer-hacker-news/hn-comment-layout.ts', import.meta.url).pathname
  const source = await Bun.file(sourceFilePath).text()
  const overrides = await loadStaticContractOverridesForSourceFile(sourceFilePath)
  const report = runHNCommentLayoutStaticVerification(source, overrides)

  expect(report.phase).toBe('ready')
  expect(getLaw(report, 'lineBreakCharCountAt returns exact line-break widths on exact strings')?.status).toBe('pass')
  expect(getLaw(report, 'lineBreakCharCountAt returns exact line-break widths on exact strings')?.kind).toBe('range')
  expect(getLaw(report, 'findHNCommentTextOffsetInEmptySpace returns exact offsets on seam intervals')?.status).toBe('pass')
  expect(getLaw(report, 'findHNCommentTextOffsetInEmptySpace returns null inside line interiors over intervals')?.status).toBe('pass')
  expect(getLaw(report, 'layoutPreparedHNCommentDoc keeps fragments inside their line boxes')?.status).toBe('pass')
  expect(getLaw(report, 'findHNCommentTextRects returns the expected merged geometry on concrete scenarios')?.status).toBe('pass')
  expect(getLaw(report, 'findHNCommentTextOffsetInEmptySpace returns the expected offset at geometric seams')?.status).toBe('pass')
  expect(getLaw(report, 'layoutPreparedHNCommentDoc derives total height from block heights and block gaps')?.checks).toBe(2)
})

// Contract loading.
test('photo-gallery verifier can auto-load imported sidecar contracts from the source file', async () => {
  const sourceFilePath = new URL('./photo-gallery/layout-model.ts', import.meta.url).pathname
  const report = await runPhotoGalleryStaticVerificationForSourceFile(sourceFilePath)

  expect(report.phase).toBe('ready')
  expect(getLaw(report, 'getGridLayout row items do not overlap horizontally')?.status).toBe('pass')
})

test('HN comment verifier can auto-load same-file sidecar contracts', async () => {
  const sourceFilePath = new URL('./nicer-hacker-news/hn-comment-layout.ts', import.meta.url).pathname
  const report = await runHNCommentLayoutStaticVerificationForSourceFile(sourceFilePath)

  expect(report.phase).toBe('ready')
  expect(getLaw(report, 'findHNCommentTextRects returns the expected merged geometry on concrete scenarios')?.status).toBe('pass')
})

// Mutation canaries.
test('photo-gallery verifier catches broken track-fill math', async () => {
  const sourceFilePath = new URL('./photo-gallery/layout-model.ts', import.meta.url).pathname
  const source = await Bun.file(sourceFilePath).text()
  const overrides = await loadStaticContractOverridesForSourceFile(sourceFilePath)
  const buggySource = replaceOnce(
    source,
    'const boxMaxSizeX = (containerSizeX - boxesGapX - cols * boxesGapX) / cols',
    'const boxMaxSizeX = containerSizeX / cols',
  )
  const report = runPhotoGalleryStaticVerification(buggySource, overrides)

  expect(report.phase).toBe('error')
  expect(getLaw(report, 'colsBoxMaxSizeXF exactly fills the horizontal track')?.status).toBe('fail')
})

test('photo-gallery verifier catches broken column-slot math', async () => {
  const sourceFilePath = new URL('./photo-gallery/layout-model.ts', import.meta.url).pathname
  const source = await Bun.file(sourceFilePath).text()
  const overrides = await loadStaticContractOverridesForSourceFile(sourceFilePath)
  const buggySource = replaceOnce(
    source,
    'const x = boxesGapX + (boxMaxSizeX + boxesGapX) * (i % cols) + (boxMaxSizeX - measurement.imageSizeX) / 2',
    'const x = boxesGapX + (boxMaxSizeX + boxesGapX) * ((i + 1) % cols) + (boxMaxSizeX - measurement.imageSizeX) / 2',
  )
  const report = runPhotoGalleryStaticVerification(buggySource, overrides)
  const law = getLaw(report, 'getGridLayout keeps each item centered in its column slot')

  expect(report.phase).toBe('error')
  expect(law?.status).toBe('fail')
  expect(law?.firstFailure?.column).toBe(0)
  expect(law?.firstFailure?.expectedCenterX).toBeDefined()
})

test('HN row verifier catches broken comment width math', async () => {
  const source = await Bun.file(new URL('./nicer-hacker-news/hn-thread-layout.ts', import.meta.url)).text()
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
  const source = await Bun.file(new URL('./nicer-hacker-news/hn-thread-layout.ts', import.meta.url)).text()
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
  const source = await Bun.file(new URL('./nicer-hacker-news/hn-thread-layout.ts', import.meta.url)).text()
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
  const source = await Bun.file(new URL('./nicer-hacker-news/hn-thread-layout.ts', import.meta.url)).text()
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
  const sourceFilePath = new URL('./nicer-hacker-news/hn-comment-layout.ts', import.meta.url).pathname
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
  const sourceFilePath = new URL('./nicer-hacker-news/hn-comment-layout.ts', import.meta.url).pathname
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

test('HN comment verifier catches a broken substring offset in text rect geometry', async () => {
  const sourceFilePath = new URL('./nicer-hacker-news/hn-comment-layout.ts', import.meta.url).pathname
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
  const sourceFilePath = new URL('./nicer-hacker-news/hn-comment-layout.ts', import.meta.url).pathname
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
  const sourceFilePath = new URL('./nicer-hacker-news/hn-comment-layout.ts', import.meta.url).pathname
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
  const analyzer = new LoweredProgramAnalyzer(source, {}, buildConcreteContractOverrides({
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
  const analyzer = new LoweredProgramAnalyzer(source, {}, buildConcreteContractOverrides({
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
