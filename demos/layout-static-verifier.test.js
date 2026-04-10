import {expect, test} from 'bun:test'
import {
  concreteNull,
  concreteNumber,
  expectConcreteNumber,
  invokeConcreteFunctionValue,
  LoweredProgramAnalyzer,
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

test('photo-gallery static verifier keeps its current proof surface', async () => {
  const sourceFilePath = new URL('./photo-gallery/layout-model.ts', import.meta.url).pathname
  const source = await Bun.file(sourceFilePath).text()
  const overrides = await loadStaticContractOverridesForSourceFile(sourceFilePath)
  const report = runPhotoGalleryStaticVerification(source, overrides)

  expect(report.phase).toBe('ready')
  expect(report.laws.find(law => law.name === 'getGridLayout row items do not overlap horizontally')?.status).toBe('pass')
  expect(report.laws.find(law => law.name === 'colsBoxMaxSizeXF exactly fills the horizontal track')?.checks).toBe(1281)
})

test('nicer-hacker-news static verifier keeps the row geometry slice ready', async () => {
  const source = await Bun.file(new URL('./nicer-hacker-news/hn-thread-layout.ts', import.meta.url)).text()
  const report = runNicerHackerNewsStaticVerification(source)

  expect(report.phase).toBe('ready')
  expect(report.laws.find(law => law.name === 'layoutHNThreadVisualGeometry keeps comment x and width tied to indent math')?.status).toBe('pass')
  expect(report.laws.find(law => law.name === 'layoutHNThreadVisualGeometry keeps visible-row bookkeeping internally consistent')?.checks).toBe(2)
})

test('nicer-hacker-news comment verifier keeps the text layout kernel ready', async () => {
  const sourceFilePath = new URL('./nicer-hacker-news/hn-comment-layout.ts', import.meta.url).pathname
  const source = await Bun.file(sourceFilePath).text()
  const overrides = await loadStaticContractOverridesForSourceFile(sourceFilePath)
  const report = runHNCommentLayoutStaticVerification(source, overrides)

  expect(report.phase).toBe('ready')
  expect(report.laws.find(law => law.name === 'layoutPreparedHNCommentDoc keeps fragments inside their line boxes')?.status).toBe('pass')
  expect(report.laws.find(law => law.name === 'findHNCommentTextRects returns the expected merged geometry on concrete scenarios')?.status).toBe('pass')
  expect(report.laws.find(law => law.name === 'findHNCommentTextOffsetInEmptySpace returns the expected offset at geometric seams')?.status).toBe('pass')
  expect(report.laws.find(law => law.name === 'layoutPreparedHNCommentDoc derives total height from block heights and block gaps')?.checks).toBe(2)
})

test('photo-gallery verifier can auto-load imported sidecar contracts from the source file', async () => {
  const sourceFilePath = new URL('./photo-gallery/layout-model.ts', import.meta.url).pathname
  const report = await runPhotoGalleryStaticVerificationForSourceFile(sourceFilePath)

  expect(report.phase).toBe('ready')
  expect(report.laws.find(law => law.name === 'getGridLayout row items do not overlap horizontally')?.status).toBe('pass')
})

test('HN comment verifier can auto-load same-file sidecar contracts', async () => {
  const sourceFilePath = new URL('./nicer-hacker-news/hn-comment-layout.ts', import.meta.url).pathname
  const report = await runHNCommentLayoutStaticVerificationForSourceFile(sourceFilePath)

  expect(report.phase).toBe('ready')
  expect(report.laws.find(law => law.name === 'findHNCommentTextRects returns the expected merged geometry on concrete scenarios')?.status).toBe('pass')
})

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
  expect(report.laws.find(law => law.name === 'colsBoxMaxSizeXF exactly fills the horizontal track')?.status).toBe('fail')
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
  expect(report.laws.find(law => law.name === 'layoutHNThreadVisualGeometry keeps comment x and width tied to indent math')?.status).toBe('fail')
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
  expect(report.laws.find(law => law.name === 'layoutPreparedHNCommentDoc clamps width to at least one pixel')?.status).toBe('fail')
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
  expect(report.laws.find(law => law.name === 'findHNCommentTextRects returns the expected merged geometry on concrete scenarios')?.status).toBe('fail')
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
  expect(report.laws.find(law => law.name === 'findHNCommentTextOffsetInEmptySpace returns the expected offset at geometric seams')?.status).toBe('fail')
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
