import {
  buildStaticLayoutReport,
  check,
  concreteArray,
  concreteNull,
  concreteNumber,
  concreteObject,
  concreteString,
  epsilon,
  expectArray,
  expectConcreteNumber,
  expectObject,
  expectRangeNumber,
  getProp,
  type FunctionOverride,
  type InternalLawSummary,
  joinRangeCases,
  LoweredProgramAnalyzer,
  rangeNumber,
  rangeString,
  type StaticLayoutVerificationReport,
} from '../layout-static-core'
import {loadStaticContractOverridesForSourceFile} from '../layout-static-contracts'

export function runHNCommentLayoutStaticVerification(
  sourceText: string,
  autoContractOverrides: Record<string, FunctionOverride> = {},
): StaticLayoutVerificationReport {
  const analyzer = new LoweredProgramAnalyzer(sourceText, {}, autoContractOverrides, {
    includeFunctions: ['layoutPreparedHNCommentDoc', 'lineBreakCharCountAt', 'findHNCommentTextRects', 'findHNCommentTextOffsetInEmptySpace'],
  })
  const laws = new Map<string, InternalLawSummary>()

  verifyLineBreakCharCountAtRange(analyzer, laws)
  verifyLayoutPreparedHNCommentDocConcrete(analyzer, laws)
  verifyFindHNCommentTextRectsConcrete(analyzer, laws)
  verifyFindHNCommentTextOffsetInEmptySpaceConcrete(analyzer, laws)

  return buildStaticLayoutReport('nicer-hacker-news-comment-static-layout', 'demos/nicer-hacker-news/hn-comment-layout.ts', laws)
}

export async function runHNCommentLayoutStaticVerificationForSourceFile(sourceFilePath: string): Promise<StaticLayoutVerificationReport> {
  const [sourceText, autoContractOverrides] = await Promise.all([
    Bun.file(sourceFilePath).text(),
    loadStaticContractOverridesForSourceFile(sourceFilePath),
  ])
  return runHNCommentLayoutStaticVerification(sourceText, autoContractOverrides)
}

function verifyLineBreakCharCountAtRange(analyzer: LoweredProgramAnalyzer, laws: Map<string, InternalLawSummary>) {
  const scenarios = [
    {label: 'crlf', text: '\r\nhello', index: 0, expected: 2},
    {label: 'cr', text: '\rhello', index: 0, expected: 1},
    {label: 'lf', text: '\nhello', index: 0, expected: 1},
    {label: 'plain', text: 'hello', index: 2, expected: 0},
    {label: 'past_end', text: 'hi', index: 5, expected: 0},
  ]

  for (const scenario of scenarios) {
    const result = joinRangeCases(analyzer.evaluateFunctionRange('lineBreakCharCountAt', [
      rangeString(scenario.text),
      rangeNumber(scenario.index, scenario.index, true),
    ]))
    const count = expectRangeNumber(result)

    check(laws, 'lineBreakCharCountAt returns exact line-break widths on exact strings', count.min === scenario.expected && count.max === scenario.expected, () => ({
      scenario: scenario.label,
      countMin: count.min,
      countMax: count.max,
      expected: scenario.expected,
    }))
  }
}

function verifyLayoutPreparedHNCommentDocConcrete(analyzer: LoweredProgramAnalyzer, laws: Map<string, InternalLawSummary>) {
  const lineHeight = analyzer.getGlobalNumber('COMMENT_LINE_HEIGHT')
  const blockGap = analyzer.getGlobalNumber('COMMENT_BLOCK_GAP')
  const scenarios = [
    {
      label: 'mixed_blocks',
      maxWidth: 240,
      doc: concreteObject({
        blocks: concreteArray([
          concreteObject({
            kind: concreteString('paragraph'),
            flow: concreteObject({
              lineRanges: concreteArray([
                concreteObject({
                  width: concreteNumber(130),
                  fragments: concreteArray([
                    concreteObject({itemIndex: concreteNumber(0), gapBefore: concreteNumber(0), text: concreteString('Hello'), occupiedWidth: concreteNumber(42)}),
                    concreteObject({itemIndex: concreteNumber(1), gapBefore: concreteNumber(6), text: concreteString('world'), occupiedWidth: concreteNumber(54)}),
                  ]),
                }),
                concreteObject({
                  width: concreteNumber(92),
                  fragments: concreteArray([
                    concreteObject({itemIndex: concreteNumber(2), gapBefore: concreteNumber(0), text: concreteString('again'), occupiedWidth: concreteNumber(52)}),
                  ]),
                }),
              ]),
            }),
            runs: concreteArray([
              concreteObject({kind: concreteString('text'), text: concreteString('Hello')}),
              concreteObject({kind: concreteString('link'), text: concreteString('world'), href: concreteString('https://example.com')}),
              concreteObject({kind: concreteString('italic'), text: concreteString('again')}),
            ]),
          }),
          concreteObject({
            kind: concreteString('codeBlock'),
            prepared: concreteObject({
              lines: concreteArray([
                concreteObject({
                  text: concreteString('const x = 1'),
                  width: concreteNumber(104),
                  end: concreteObject({segmentIndex: concreteNumber(1), graphemeIndex: concreteNumber(0)}),
                }),
                concreteObject({
                  text: concreteString('return x'),
                  width: concreteNumber(76),
                  end: concreteObject({segmentIndex: concreteNumber(2), graphemeIndex: concreteNumber(0)}),
                }),
              ]),
            }),
            text: concreteString('const x = 1\nreturn x'),
          }),
        ]),
      }),
    },
    {
      label: 'empty_clamp',
      maxWidth: 0,
      doc: concreteObject({
        blocks: concreteArray([]),
      }),
    },
  ]

  for (const scenario of scenarios) {
    const returns = analyzer.evaluateFunction('layoutPreparedHNCommentDoc', [
      scenario.doc,
      concreteNumber(scenario.maxWidth),
    ], 'concrete')
    check(laws, 'layoutPreparedHNCommentDoc stays branch-free per concrete scenario', returns.length === 1, () => ({
      scenario: scenario.label,
      cases: returns.length,
    }))
    if (returns.length !== 1) continue

    const layout = expectObject(returns[0]!.value)
    const blocks = expectArray(getProp(layout, 'blocks'))
    const width = expectConcreteNumber(getProp(layout, 'width'))
    const height = expectConcreteNumber(getProp(layout, 'height'))

    check(laws, 'layoutPreparedHNCommentDoc clamps width to at least one pixel', Math.abs(width - Math.max(1, scenario.maxWidth)) <= epsilon, () => ({
      scenario: scenario.label,
      width,
      expectedWidth: Math.max(1, scenario.maxWidth),
    }))
    check(laws, 'layoutPreparedHNCommentDoc preserves block count', blocks.items.length === expectArray(getProp(scenario.doc, 'blocks')).items.length, () => ({
      scenario: scenario.label,
      blockCount: blocks.items.length,
      expectedBlockCount: expectArray(getProp(scenario.doc, 'blocks')).items.length,
    }))

    let expectedTop = 0
    let totalHeight = 0
    let lineWidthsFit = true
    let lineTopsMonotone = true
    let blockHeightsMatchLineCount = true
    let fragmentsStayInsideTheirLine = true
    let textOffsetsMonotone = true
    let previousTextEnd = 0

    for (let blockIndex = 0; blockIndex < blocks.items.length; blockIndex++) {
      const block = expectObject(blocks.items[blockIndex]!)
      const lines = expectArray(getProp(block, 'lines'))
      const blockHeight = expectConcreteNumber(getProp(block, 'height'))
      const expectedBlockTop = blockIndex === 0 ? 0 : expectedTop + blockGap
      expectedTop = expectedBlockTop
      totalHeight += blockIndex === 0 ? 0 : blockGap

      if (Math.abs(blockHeight - lines.items.length * lineHeight) > epsilon) blockHeightsMatchLineCount = false

      for (let lineIndex = 0; lineIndex < lines.items.length; lineIndex++) {
        const line = expectObject(lines.items[lineIndex]!)
        const lineTop = expectConcreteNumber(getProp(line, 'top'))
        const lineWidth = expectConcreteNumber(getProp(line, 'width'))
        const lineHeightActual = expectConcreteNumber(getProp(line, 'height'))
        const lineTextStart = expectConcreteNumber(getProp(line, 'textStart'))
        const lineTextEnd = expectConcreteNumber(getProp(line, 'textEnd'))
        const fragments = expectArray(getProp(line, 'fragments'))
        const expectedLineTop = expectedBlockTop + lineIndex * lineHeight

        if (Math.abs(lineTop - expectedLineTop) > epsilon) lineTopsMonotone = false
        if (lineWidth > width + epsilon || lineHeightActual !== lineHeight) lineWidthsFit = false
        if (lineTextStart < previousTextEnd - epsilon || lineTextEnd < lineTextStart - epsilon) textOffsetsMonotone = false
        previousTextEnd = lineTextEnd

        let previousFragmentRight = 0
        for (let fragmentIndex = 0; fragmentIndex < fragments.items.length; fragmentIndex++) {
          const fragment = expectObject(fragments.items[fragmentIndex]!)
          const fragmentLeft = expectConcreteNumber(getProp(fragment, 'left'))
          const fragmentTop = expectConcreteNumber(getProp(fragment, 'top'))
          const fragmentWidth = expectConcreteNumber(getProp(fragment, 'width'))
          const fragmentHeight = expectConcreteNumber(getProp(fragment, 'height'))
          const fragmentTextStart = expectConcreteNumber(getProp(fragment, 'textStart'))
          const fragmentTextEnd = expectConcreteNumber(getProp(fragment, 'textEnd'))

          if (
            fragmentTop !== lineTop ||
            fragmentHeight !== lineHeight ||
            fragmentLeft < previousFragmentRight - epsilon ||
            fragmentLeft + fragmentWidth > lineWidth + epsilon ||
            fragmentTextStart < lineTextStart - epsilon ||
            fragmentTextEnd < fragmentTextStart - epsilon ||
            fragmentTextEnd > lineTextEnd + epsilon
          ) {
            fragmentsStayInsideTheirLine = false
          }
          previousFragmentRight = fragmentLeft + fragmentWidth
        }
      }

      totalHeight += blockHeight
      expectedTop += blockHeight
    }

    check(laws, 'layoutPreparedHNCommentDoc keeps line tops monotone and aligned to block tops', lineTopsMonotone, () => ({
      scenario: scenario.label,
      width,
    }))
    check(laws, 'layoutPreparedHNCommentDoc keeps line widths inside the offered width', lineWidthsFit, () => ({
      scenario: scenario.label,
      width,
    }))
    check(laws, 'layoutPreparedHNCommentDoc derives block height from line count', blockHeightsMatchLineCount, () => ({
      scenario: scenario.label,
      lineHeight,
    }))
    check(laws, 'layoutPreparedHNCommentDoc keeps fragments inside their line boxes', fragmentsStayInsideTheirLine, () => ({
      scenario: scenario.label,
    }))
    check(laws, 'layoutPreparedHNCommentDoc keeps text offsets monotone', textOffsetsMonotone, () => ({
      scenario: scenario.label,
    }))
    check(laws, 'layoutPreparedHNCommentDoc derives total height from block heights and block gaps', Math.abs(height - totalHeight) <= epsilon, () => ({
      scenario: scenario.label,
      height,
      expectedHeight: totalHeight,
    }))
  }
}

function verifyFindHNCommentTextRectsConcrete(analyzer: LoweredProgramAnalyzer, laws: Map<string, InternalLawSummary>) {
  const layout = makeConcreteCommentLayoutFixture()

  const scenarios = [
    {
      label: 'empty_length',
      start: 4,
      length: 0,
      expectedRects: [] as Array<{left: number; top: number; width: number; height: number}>,
    },
    {
      label: 'single_fragment_middle',
      start: 1,
      length: 3,
      expectedRects: [{left: 10, top: 0, width: 30, height: 14}],
    },
    {
      label: 'merge_adjacent_fragments',
      start: 2,
      length: 6,
      expectedRects: [{left: 20, top: 0, width: 60, height: 14}],
    },
    {
      label: 'split_across_lines',
      start: 8,
      length: 6,
      expectedRects: [
        {left: 80, top: 0, width: 30, height: 14},
        {left: 0, top: 20, width: 20, height: 14},
      ],
    },
  ]

  for (const scenario of scenarios) {
    const returns = analyzer.evaluateFunction('findHNCommentTextRects', [
      layout,
      concreteNumber(scenario.start),
      concreteNumber(scenario.length),
    ], 'concrete')
    check(laws, 'findHNCommentTextRects stays branch-free per concrete scenario', returns.length === 1, () => ({
      scenario: scenario.label,
      cases: returns.length,
    }))
    if (returns.length !== 1) continue

    const rects = expectArray(returns[0]!.value)
    const actualRects = rects.items.map(item => {
      const rect = expectObject(item)
      return {
        left: expectConcreteNumber(getProp(rect, 'left')),
        top: expectConcreteNumber(getProp(rect, 'top')),
        width: expectConcreteNumber(getProp(rect, 'width')),
        height: expectConcreteNumber(getProp(rect, 'height')),
      }
    })

    let matchesExpectedRects = actualRects.length === scenario.expectedRects.length
    for (let i = 0; i < actualRects.length && i < scenario.expectedRects.length; i++) {
      const actual = actualRects[i]!
      const expected = scenario.expectedRects[i]!
      if (
        Math.abs(actual.left - expected.left) > epsilon ||
        Math.abs(actual.top - expected.top) > epsilon ||
        Math.abs(actual.width - expected.width) > epsilon ||
        Math.abs(actual.height - expected.height) > epsilon
      ) {
        matchesExpectedRects = false
      }
    }

    let orderedAndInsideLines = true
    let previousTop = -Infinity
    let previousLeft = -Infinity
    for (const rect of actualRects) {
      if (rect.top < previousTop - epsilon || (Math.abs(rect.top - previousTop) <= epsilon && rect.left < previousLeft - epsilon)) {
        orderedAndInsideLines = false
      }

      const line = rect.top === 0
        ? {width: 110, height: 14}
        : rect.top === 20
          ? {width: 40, height: 14}
          : null
      if (line == null || rect.left < -epsilon || rect.width < -epsilon || rect.left + rect.width > line.width + epsilon || rect.height !== line.height) {
        orderedAndInsideLines = false
      }

      previousTop = rect.top
      previousLeft = rect.left
    }

    check(laws, 'findHNCommentTextRects returns the expected merged geometry on concrete scenarios', matchesExpectedRects, () => ({
      scenario: scenario.label,
      rectCount: actualRects.length,
      expectedRectCount: scenario.expectedRects.length,
    }))
    check(laws, 'findHNCommentTextRects keeps returned rects ordered and inside their line boxes', orderedAndInsideLines, () => ({
      scenario: scenario.label,
      rectCount: actualRects.length,
    }))
  }
}

function verifyFindHNCommentTextOffsetInEmptySpaceConcrete(analyzer: LoweredProgramAnalyzer, laws: Map<string, InternalLawSummary>) {
  const layout = makeConcreteCommentLayoutFixture()
  const emptyLayout = concreteObject({
    width: concreteNumber(200),
    height: concreteNumber(0),
    blocks: concreteArray([]),
  })
  const scenarios = [
    {label: 'before_first_line', layout, x: 0, y: -1, expectedOffset: 0},
    {label: 'inside_line_left', layout, x: -5, y: 4, expectedOffset: 0},
    {label: 'inside_line_middle', layout, x: 30, y: 4, expectedOffset: null},
    {label: 'inside_line_right', layout, x: 200, y: 4, expectedOffset: 11},
    {label: 'between_lines_biases_to_previous', layout, x: 0, y: 16, expectedOffset: 11},
    {label: 'between_lines_biases_to_next', layout, x: 0, y: 18, expectedOffset: 12},
    {label: 'below_last_line', layout, x: 0, y: 40, expectedOffset: 16},
    {label: 'empty_layout', layout: emptyLayout, x: 0, y: 10, expectedOffset: null},
  ]

  for (const scenario of scenarios) {
    const returns = analyzer.evaluateFunction('findHNCommentTextOffsetInEmptySpace', [
      scenario.layout,
      concreteNumber(scenario.x),
      concreteNumber(scenario.y),
    ], 'concrete')
    check(laws, 'findHNCommentTextOffsetInEmptySpace stays branch-free per concrete scenario', returns.length === 1, () => ({
      scenario: scenario.label,
      cases: returns.length,
    }))
    if (returns.length !== 1) continue

    const offset = returns[0]!.value.kind === 'null' ? null : expectConcreteNumber(returns[0]!.value)
    check(laws, 'findHNCommentTextOffsetInEmptySpace returns the expected offset at geometric seams', offset === scenario.expectedOffset, () => ({
      scenario: scenario.label,
      offset,
      expectedOffset: scenario.expectedOffset,
    }))
  }
}

function makeConcreteCommentLayoutFixture() {
  return concreteObject({
    width: concreteNumber(200),
    height: concreteNumber(34),
    blocks: concreteArray([
      concreteObject({
        kind: concreteString('paragraph'),
        height: concreteNumber(34),
        lines: concreteArray([
          concreteObject({
            top: concreteNumber(0),
            width: concreteNumber(110),
            height: concreteNumber(14),
            textStart: concreteNumber(0),
            textEnd: concreteNumber(11),
            fragments: concreteArray([
              concreteObject({
                kind: concreteString('text'),
                href: concreteNull('concrete'),
                text: concreteString('hello'),
                gapBefore: concreteNumber(0),
                left: concreteNumber(0),
                top: concreteNumber(0),
                width: concreteNumber(50),
                height: concreteNumber(14),
                textStart: concreteNumber(0),
                textEnd: concreteNumber(5),
              }),
              concreteObject({
                kind: concreteString('link'),
                href: concreteString('https://example.com'),
                text: concreteString('world'),
                gapBefore: concreteNumber(0),
                left: concreteNumber(50),
                top: concreteNumber(0),
                width: concreteNumber(50),
                height: concreteNumber(14),
                textStart: concreteNumber(5),
                textEnd: concreteNumber(10),
              }),
              concreteObject({
                kind: concreteString('italic'),
                href: concreteNull('concrete'),
                text: concreteString('!'),
                gapBefore: concreteNumber(0),
                left: concreteNumber(100),
                top: concreteNumber(0),
                width: concreteNumber(10),
                height: concreteNumber(14),
                textStart: concreteNumber(10),
                textEnd: concreteNumber(11),
              }),
            ]),
          }),
          concreteObject({
            top: concreteNumber(20),
            width: concreteNumber(40),
            height: concreteNumber(14),
            textStart: concreteNumber(12),
            textEnd: concreteNumber(16),
            fragments: concreteArray([
              concreteObject({
                kind: concreteString('code'),
                href: concreteNull('concrete'),
                text: concreteString('code'),
                gapBefore: concreteNumber(0),
                left: concreteNumber(0),
                top: concreteNumber(20),
                width: concreteNumber(40),
                height: concreteNumber(14),
                textStart: concreteNumber(12),
                textEnd: concreteNumber(16),
              }),
            ]),
          }),
        ]),
      }),
    ]),
  })
}
