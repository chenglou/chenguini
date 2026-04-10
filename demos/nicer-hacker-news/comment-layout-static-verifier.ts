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
  getProp,
  type InternalLawSummary,
  invokeConcreteFunctionValue,
  LoweredProgramAnalyzer,
  type StaticLayoutVerificationReport,
} from '../layout-static-core'

export function runHNCommentLayoutStaticVerification(sourceText: string): StaticLayoutVerificationReport {
  const analyzer = new LoweredProgramAnalyzer(sourceText, {}, {
    walkRichInlineLineRanges: {
      evaluate(args, mode, context) {
        if (mode !== 'concrete') throw new Error('walkRichInlineLineRanges override only supports concrete mode')
        const flow = expectObject(args[0]!)
        const callback = args[2]!
        const lineRanges = expectArray(getProp(flow, 'lineRanges'))
        let activeStates = [context.state]
        for (let i = 0; i < lineRanges.items.length; i++) {
          const nextStates = []
          for (const state of activeStates) {
            const callbackReturns = invokeConcreteFunctionValue(context.analyzer, state, callback, [lineRanges.items[i]!])
            if (callbackReturns.length !== 1) throw new Error('walkRichInlineLineRanges callback must resolve to 1 case')
            nextStates.push(callbackReturns[0]!.state)
          }
          activeStates = nextStates
        }
        return activeStates.map(state => ({
          constraints: state.constraints,
          env: state.env,
          value: concreteNull('concrete'),
        }))
      },
    },
    materializeRichInlineLineRange: {
      evaluate(args, mode, context) {
        if (mode !== 'concrete') throw new Error('materializeRichInlineLineRange override only supports concrete mode')
        return [{
          constraints: context.state.constraints,
          env: context.state.env,
          value: args[1]!,
        }]
      },
    },
    layoutNextLine: {
      evaluate(args, mode, context) {
        if (mode !== 'concrete') throw new Error('layoutNextLine override only supports concrete mode')
        const prepared = expectObject(args[0]!)
        const cursor = expectObject(args[1]!)
        const lines = expectArray(getProp(prepared, 'lines'))
        const segmentIndex = expectConcreteNumber(getProp(cursor, 'segmentIndex'))
        return [{
          constraints: context.state.constraints,
          env: context.state.env,
          value: segmentIndex >= lines.items.length ? concreteNull('concrete') : lines.items[segmentIndex]!,
        }]
      },
    },
  }, {
    includeFunctions: ['layoutPreparedHNCommentDoc', 'lineBreakCharCountAt'],
  })
  const laws = new Map<string, InternalLawSummary>()

  verifyLayoutPreparedHNCommentDocConcrete(analyzer, laws)

  return buildStaticLayoutReport('nicer-hacker-news-comment-static-layout', 'demos/nicer-hacker-news/hn-comment-layout.ts', laws)
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
