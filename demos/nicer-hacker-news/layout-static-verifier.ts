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
} from '../layout-static-core'

export function runNicerHackerNewsStaticVerification(sourceText: string): StaticLayoutVerificationReport {
  const analyzer = new LoweredProgramAnalyzer(sourceText, {})
  const laws = new Map<string, InternalLawSummary>()

  verifyRowHitGeometry(analyzer, laws)
  verifyRowHitGeometryRange(analyzer, laws)
  verifyThreadVisualGeometry(analyzer, laws)
  verifyThreadVisualGeometryRange(analyzer, laws)

  return buildStaticLayoutReport('nicer-hacker-news-static-layout', 'demos/nicer-hacker-news/hn-thread-layout.ts', laws)
}

function verifyThreadVisualGeometryRange(analyzer: LoweredProgramAnalyzer, laws: Map<string, InternalLawSummary>) {
  const layout = expectRangeObject(joinRangeCases(analyzer.evaluateFunctionRange('layoutHNThreadVisualGeometry', [rangeObject({
    rows: rangeArray([
      rangeObject({
        indent: rangeNumber(0, 0, true),
        rowHeight: rangeNumber(100, 140, true),
        commentLayout: rangeObject({width: rangeNumber(240, 320, true)}),
      }),
      rangeObject({
        indent: rangeNumber(1, 1, true),
        rowHeight: rangeNumber(80, 96, true),
        commentLayout: rangeObject({width: rangeNumber(200, 260, true)}),
      }),
      rangeObject({
        indent: rangeNumber(2, 2, true),
        rowHeight: rangeNumber(60, 72, true),
        commentLayout: rangeObject({width: rangeNumber(160, 220, true)}),
      }),
    ]),
    containerWidth: rangeNumber(680, 760, true),
    indentWidth: rangeNumber(24, 24, true),
    commentLeftGap: rangeNumber(24, 24, true),
    commentRightGap: rangeNumber(20, 20, true),
    commentUserGapNatural: rangeNumber(8, 8, true),
    userHeightNatural: rangeNumber(18, 18, true),
    rowsScrollerTopGap: rangeNumber(40, 40, true),
    scrollerPeekUp: rangeNumber(0, 0, true),
    scrollTopCap: rangeNumber(40, 40, true),
    scrollerHeight: rangeNumber(1000, 1000, true),
  })])))

  const rows = expectRangeArray(getRangeProp(layout, 'rows'))
  check(laws, 'layoutHNThreadVisualGeometry preserves row count over width and height intervals', rows.lengthMin === 3 && rows.lengthMax === 3, () => ({
    rowCountMin: rows.lengthMin,
    rowCountMax: rows.lengthMax,
  }))
  if (rows.items == null || rows.items.length !== 3) return

  const firstRow = expectRangeObject(rows.items[0]!)
  const secondRow = expectRangeObject(rows.items[1]!)
  const thirdRow = expectRangeObject(rows.items[2]!)
  const firstRowRect = expectRangeObject(getRangeProp(firstRow, 'rowRect'))
  const secondRowRect = expectRangeObject(getRangeProp(secondRow, 'rowRect'))
  const thirdRowRect = expectRangeObject(getRangeProp(thirdRow, 'rowRect'))
  const firstCommentRect = expectRangeObject(getRangeProp(firstRow, 'commentRect'))
  const secondCommentRect = expectRangeObject(getRangeProp(secondRow, 'commentRect'))
  const thirdCommentRect = expectRangeObject(getRangeProp(thirdRow, 'commentRect'))
  const firstTop = expectRangeNumber(getRangeProp(firstRowRect, 'top'))
  const firstHeight = expectRangeNumber(getRangeProp(firstRowRect, 'height'))
  const secondTop = expectRangeNumber(getRangeProp(secondRowRect, 'top'))
  const secondHeight = expectRangeNumber(getRangeProp(secondRowRect, 'height'))
  const thirdTop = expectRangeNumber(getRangeProp(thirdRowRect, 'top'))
  const thirdHeight = expectRangeNumber(getRangeProp(thirdRowRect, 'height'))
  const firstBottom = expectRangeNumber(getRangeProp(firstRow, 'rowBottom'))
  const secondBottom = expectRangeNumber(getRangeProp(secondRow, 'rowBottom'))
  const thirdBottom = expectRangeNumber(getRangeProp(thirdRow, 'rowBottom'))
  const firstVisibleRowIndex = expectRangeNumber(getRangeProp(layout, 'firstVisibleRowIndex'))
  const lastVisibleRowIndex = expectRangeNumber(getRangeProp(layout, 'lastVisibleRowIndex'))
  const firstVisibleRowTop = expectRangeNumber(getRangeProp(layout, 'firstVisibleRowTop'))
  const contentHeight = expectRangeNumber(getRangeProp(layout, 'contentHeight'))

  check(laws, 'layoutHNThreadVisualGeometry keeps row tops contiguous over intervals', rangesEqual(
    secondTop,
    firstBottom,
  ) && rangesEqual(
    thirdTop,
    secondBottom,
  ) && rangesEqual(
    firstBottom,
    addRanges(firstTop, firstHeight),
  ) && rangesEqual(
    secondBottom,
    addRanges(secondTop, secondHeight),
  ) && rangesEqual(
    thirdBottom,
    addRanges(thirdTop, thirdHeight),
  ), () => ({
    secondTop: describeRange(secondTop),
    expectedSecondTop: describeRange(firstBottom),
    thirdTop: describeRange(thirdTop),
    expectedThirdTop: describeRange(secondBottom),
  }))
  check(laws, 'layoutHNThreadVisualGeometry keeps comment x tied to indent math over intervals', rangesEqual(
    expectRangeNumber(getRangeProp(firstCommentRect, 'left')),
    rangeNumber(24, 24, true),
  ) && rangesEqual(
    expectRangeNumber(getRangeProp(secondCommentRect, 'left')),
    rangeNumber(48, 48, true),
  ) && rangesEqual(
    expectRangeNumber(getRangeProp(thirdCommentRect, 'left')),
    rangeNumber(72, 72, true),
  ), () => ({
    firstLeft: describeRange(expectRangeNumber(getRangeProp(firstCommentRect, 'left'))),
    secondLeft: describeRange(expectRangeNumber(getRangeProp(secondCommentRect, 'left'))),
    thirdLeft: describeRange(expectRangeNumber(getRangeProp(thirdCommentRect, 'left'))),
  }))
  check(laws, 'layoutHNThreadVisualGeometry keeps comment width tied to comment layout width over intervals', rangesEqual(
    expectRangeNumber(getRangeProp(firstCommentRect, 'width')),
    rangeNumber(260, 340, true),
  ) && rangesEqual(
    expectRangeNumber(getRangeProp(secondCommentRect, 'width')),
    rangeNumber(220, 280, true),
  ) && rangesEqual(
    expectRangeNumber(getRangeProp(thirdCommentRect, 'width')),
    rangeNumber(180, 240, true),
  ), () => ({
    firstWidth: describeRange(expectRangeNumber(getRangeProp(firstCommentRect, 'width'))),
    secondWidth: describeRange(expectRangeNumber(getRangeProp(secondCommentRect, 'width'))),
    thirdWidth: describeRange(expectRangeNumber(getRangeProp(thirdCommentRect, 'width'))),
  }))
  check(laws, 'layoutHNThreadVisualGeometry keeps visible-row bookkeeping fixed when every row is visible', rangesEqual(
    firstVisibleRowIndex,
    rangeNumber(0, 0, true),
  ) && rangesEqual(
    lastVisibleRowIndex,
    rangeNumber(2, 2, true),
  ) && rangesEqual(
    firstVisibleRowTop,
    rangeNumber(0, 0, true),
  ), () => ({
    firstVisibleRowIndex: describeRange(firstVisibleRowIndex),
    lastVisibleRowIndex: describeRange(lastVisibleRowIndex),
    firstVisibleRowTop: describeRange(firstVisibleRowTop),
  }))
  check(laws, 'layoutHNThreadVisualGeometry derives content height from the last row bottom plus scrollTopCap over intervals', rangesEqual(
    contentHeight,
    addRanges(thirdBottom, rangeNumber(40, 40, true)),
  ), () => ({
    contentHeight: describeRange(contentHeight),
    expectedContentHeight: describeRange(addRanges(thirdBottom, rangeNumber(40, 40, true))),
  }))
}

function verifyRowHitGeometryRange(analyzer: LoweredProgramAnalyzer, laws: Map<string, InternalLawSummary>) {
  const result = expectRangeArray(joinRangeCases(analyzer.evaluateFunctionRange('layoutHNRowHitGeometry', [rangeObject({
    rows: rangeArray([
      rangeObject({indent: rangeNumber(0, 0, true), rowHeightNatural: rangeNumber(72, 120, true)}),
      rangeObject({indent: rangeNumber(1, 1, true), rowHeightNatural: rangeNumber(84, 96, true)}),
      rangeObject({indent: rangeNumber(2, 2, true), rowHeightNatural: rangeNumber(60, 88, true)}),
    ]),
    submissionHeight: rangeNumber(180, 260, true),
    scrollTopCap: rangeNumber(24, 48, true),
    containerWidth: rangeNumber(640, 760, true),
  })])))

  check(laws, 'layoutHNRowHitGeometry preserves row count over height intervals', result.lengthMin === 3 && result.lengthMax === 3, () => ({
    rowCountMin: result.lengthMin,
    rowCountMax: result.lengthMax,
  }))
  if (result.items == null || result.items.length !== 3) return
  const rows = result.items

  const firstRect = expectRangeObject(getRangeProp(expectRangeObject(rows[0]!), 'rowRect'))
  const secondRect = expectRangeObject(getRangeProp(expectRangeObject(rows[1]!), 'rowRect'))
  const thirdRect = expectRangeObject(getRangeProp(expectRangeObject(rows[2]!), 'rowRect'))
  const firstTop = expectRangeNumber(getRangeProp(firstRect, 'top'))
  const firstHeight = expectRangeNumber(getRangeProp(firstRect, 'height'))
  const secondTop = expectRangeNumber(getRangeProp(secondRect, 'top'))
  const secondHeight = expectRangeNumber(getRangeProp(secondRect, 'height'))
  const thirdTop = expectRangeNumber(getRangeProp(thirdRect, 'top'))
  const thirdHeight = expectRangeNumber(getRangeProp(thirdRect, 'height'))

  let widthMatches = true
  let leftIsZero = true
  for (let rowIndex = 0; rowIndex < result.items.length; rowIndex++) {
    const row = expectRangeObject(result.items[rowIndex]!)
    const rowRect = expectRangeObject(getRangeProp(row, 'rowRect'))
    const width = expectRangeNumber(getRangeProp(rowRect, 'width'))
    const left = expectRangeNumber(getRangeProp(rowRect, 'left'))
    if (left.min !== 0 || left.max !== 0) leftIsZero = false
    if (width.min !== 640 || width.max !== 760) widthMatches = false
  }

  check(laws, 'layoutHNRowHitGeometry keeps row tops contiguous over height intervals', rangesEqual(
    secondTop,
    addRanges(firstTop, firstHeight),
  ) && rangesEqual(
    thirdTop,
    addRanges(secondTop, secondHeight),
  ), () => ({
    secondTop: describeRange(secondTop),
    expectedSecondTop: describeRange(addRanges(firstTop, firstHeight)),
    thirdTop: describeRange(thirdTop),
    expectedThirdTop: describeRange(addRanges(secondTop, secondHeight)),
  }))
  check(laws, 'layoutHNRowHitGeometry keeps each row full-width over width intervals', widthMatches && leftIsZero, () => ({
    leftIsZero: leftIsZero ? 'true' : 'false',
    width: rows.map(item => {
      const rowRect = expectRangeObject(getRangeProp(expectRangeObject(item), 'rowRect'))
      return describeRange(expectRangeNumber(getRangeProp(rowRect, 'width')))
    }).join('|'),
  }))
  check(laws, 'layoutHNRowHitGeometry keeps row heights non-negative over height intervals', firstHeight.min >= 0 && secondHeight.min >= 0 && thirdHeight.min >= 0, () => ({
    firstHeight: describeRange(firstHeight),
    secondHeight: describeRange(secondHeight),
    thirdHeight: describeRange(thirdHeight),
  }))
}

function addRanges(left: ReturnType<typeof expectRangeNumber>, right: ReturnType<typeof expectRangeNumber>) {
  return rangeNumber(left.min + right.min, left.max + right.max, left.isInteger && right.isInteger)
}

function rangesEqual(left: ReturnType<typeof expectRangeNumber>, right: ReturnType<typeof expectRangeNumber>) {
  return left.min === right.min && left.max === right.max && left.isInteger === right.isInteger
}

function describeRange(value: ReturnType<typeof expectRangeNumber>) {
  return `[${value.min},${value.max}]${value.isInteger ? ':int' : ''}`
}

function verifyRowHitGeometry(analyzer: LoweredProgramAnalyzer, laws: Map<string, InternalLawSummary>) {
  const scenarios = [
    {
      label: 'thread_rows',
      rows: concreteArray([
        concreteObject({indent: concreteNumber(0), rowHeightNatural: concreteNumber(120)}),
        concreteObject({indent: concreteNumber(1), rowHeightNatural: concreteNumber(84)}),
        concreteObject({indent: concreteNumber(2), rowHeightNatural: concreteNumber(96)}),
        concreteObject({indent: concreteNumber(1), rowHeightNatural: concreteNumber(72)}),
      ]),
      submissionHeight: 260,
      scrollTopCap: 48,
      containerWidth: 760,
    },
    {
      label: 'empty_thread',
      rows: concreteArray([]),
      submissionHeight: 180,
      scrollTopCap: 24,
      containerWidth: 640,
    },
  ]

  for (const scenario of scenarios) {
    const returns = analyzer.evaluateFunction('layoutHNRowHitGeometry', [concreteObject({
      rows: scenario.rows,
      submissionHeight: concreteNumber(scenario.submissionHeight),
      scrollTopCap: concreteNumber(scenario.scrollTopCap),
      containerWidth: concreteNumber(scenario.containerWidth),
    })], 'concrete')
    check(laws, 'layoutHNRowHitGeometry stays branch-free per concrete scenario', returns.length === 1, () => ({
      scenario: scenario.label,
      cases: returns.length,
    }))
    if (returns.length !== 1) continue

    const rows = expectArray(returns[0]!.value)
    check(laws, 'layoutHNRowHitGeometry preserves row count', rows.items.length === scenario.rows.items.length, () => ({
      scenario: scenario.label,
      rowCount: rows.items.length,
      expectedRowCount: scenario.rows.items.length,
    }))

    let expectedTop = scenario.submissionHeight - scenario.scrollTopCap
    let monotone = true
    let widthsMatch = true
    for (let i = 0; i < rows.items.length; i++) {
      const row = expectObject(rows.items[i]!)
      const rowRect = expectObject(getProp(row, 'rowRect'))
      const top = expectConcreteNumber(getProp(rowRect, 'top'))
      const left = expectConcreteNumber(getProp(rowRect, 'left'))
      const width = expectConcreteNumber(getProp(rowRect, 'width'))
      const height = expectConcreteNumber(getProp(rowRect, 'height'))
      if (Math.abs(top - expectedTop) > epsilon) monotone = false
      if (left !== 0 || Math.abs(width - scenario.containerWidth) > epsilon || height < -epsilon) widthsMatch = false
      expectedTop += height
    }

    check(laws, 'layoutHNRowHitGeometry stacks row tops contiguously', monotone, () => ({
      scenario: scenario.label,
      firstExpectedTop: scenario.submissionHeight - scenario.scrollTopCap,
    }))
    check(laws, 'layoutHNRowHitGeometry keeps each row full-width and non-negative', widthsMatch, () => ({
      scenario: scenario.label,
      containerWidth: scenario.containerWidth,
    }))
  }
}

function verifyThreadVisualGeometry(analyzer: LoweredProgramAnalyzer, laws: Map<string, InternalLawSummary>) {
  const scenarios = [
    {
      label: 'mixed_visibility',
      rows: concreteArray([
        concreteObject({indent: concreteNumber(0), rowHeight: concreteNumber(120), commentLayout: concreteObject({width: concreteNumber(300)})}),
        concreteObject({indent: concreteNumber(1), rowHeight: concreteNumber(84), commentLayout: concreteObject({width: concreteNumber(260)})}),
        concreteObject({indent: concreteNumber(2), rowHeight: concreteNumber(72), commentLayout: concreteObject({width: concreteNumber(180)})}),
        concreteObject({indent: concreteNumber(1), rowHeight: concreteNumber(168), commentLayout: concreteObject({width: concreteNumber(360)})}),
        concreteObject({indent: concreteNumber(0), rowHeight: concreteNumber(92), commentLayout: concreteObject({width: concreteNumber(320)})}),
      ]),
      containerWidth: 760,
      indentWidth: 24,
      commentLeftGap: 24,
      commentRightGap: 20,
      commentUserGapNatural: 8,
      userHeightNatural: 18,
      rowsScrollerTopGap: 32,
      scrollerPeekUp: 16,
      scrollTopCap: 40,
      scrollerHeight: 320,
    },
    {
      label: 'fully_hidden',
      rows: concreteArray([
        concreteObject({indent: concreteNumber(0), rowHeight: concreteNumber(80), commentLayout: concreteObject({width: concreteNumber(280)})}),
        concreteObject({indent: concreteNumber(1), rowHeight: concreteNumber(96), commentLayout: concreteObject({width: concreteNumber(240)})}),
      ]),
      containerWidth: 680,
      indentWidth: 24,
      commentLeftGap: 24,
      commentRightGap: 20,
      commentUserGapNatural: 8,
      userHeightNatural: 18,
      rowsScrollerTopGap: 24,
      scrollerPeekUp: -220,
      scrollTopCap: 60,
      scrollerHeight: 40,
    },
  ]

  for (const scenario of scenarios) {
    const returns = analyzer.evaluateFunction('layoutHNThreadVisualGeometry', [concreteObject({
      rows: scenario.rows,
      containerWidth: concreteNumber(scenario.containerWidth),
      indentWidth: concreteNumber(scenario.indentWidth),
      commentLeftGap: concreteNumber(scenario.commentLeftGap),
      commentRightGap: concreteNumber(scenario.commentRightGap),
      commentUserGapNatural: concreteNumber(scenario.commentUserGapNatural),
      userHeightNatural: concreteNumber(scenario.userHeightNatural),
      rowsScrollerTopGap: concreteNumber(scenario.rowsScrollerTopGap),
      scrollerPeekUp: concreteNumber(scenario.scrollerPeekUp),
      scrollTopCap: concreteNumber(scenario.scrollTopCap),
      scrollerHeight: concreteNumber(scenario.scrollerHeight),
    })], 'concrete')
    check(laws, 'layoutHNThreadVisualGeometry stays branch-free per concrete scenario', returns.length === 1, () => ({
      scenario: scenario.label,
      cases: returns.length,
    }))
    if (returns.length !== 1) continue

    const layout = expectObject(returns[0]!.value)
    const rows = expectArray(getProp(layout, 'rows'))
    const contentHeight = expectConcreteNumber(getProp(layout, 'contentHeight'))
    const firstVisibleRowIndex = getProp(layout, 'firstVisibleRowIndex')
    const lastVisibleRowIndex = getProp(layout, 'lastVisibleRowIndex')
    const firstVisibleRowTop = getProp(layout, 'firstVisibleRowTop')

    check(laws, 'layoutHNThreadVisualGeometry preserves row count', rows.items.length === scenario.rows.items.length, () => ({
      scenario: scenario.label,
      rowCount: rows.items.length,
      expectedRowCount: scenario.rows.items.length,
    }))

    let monotone = true
    let commentMathMatches = true
    let userRectStaysInsideRow = true
    let gutterStaysOrdered = true
    let maxRowBottom = scenario.rowsScrollerTopGap + scenario.scrollerPeekUp - scenario.scrollTopCap
    for (let i = 0; i < rows.items.length; i++) {
      const row = expectObject(rows.items[i]!)
      const input = expectObject(scenario.rows.items[i]!)
      const rowRect = expectObject(getProp(row, 'rowRect'))
      const userRect = expectObject(getProp(row, 'userRect'))
      const commentRect = expectObject(getProp(row, 'commentRect'))
      const gutter = expectObject(getProp(row, 'gutter'))

      const rowTop = expectConcreteNumber(getProp(rowRect, 'top'))
      const rowHeight = expectConcreteNumber(getProp(rowRect, 'height'))
      const rowBottom = expectConcreteNumber(getProp(row, 'rowBottom'))
      const rowLeft = expectConcreteNumber(getProp(rowRect, 'left'))
      const rowWidth = expectConcreteNumber(getProp(rowRect, 'width'))
      const indent = expectConcreteNumber(getProp(row, 'indent'))
      const commentLayout = expectObject(getProp(input, 'commentLayout'))
      const expectedCommentLeft = indent * scenario.indentWidth + scenario.commentLeftGap
      const expectedCommentWidth = expectConcreteNumber(getProp(commentLayout, 'width')) + scenario.commentRightGap
      const userTop = expectConcreteNumber(getProp(userRect, 'top'))
      const userHeight = expectConcreteNumber(getProp(userRect, 'height'))
      const gutterTop = expectConcreteNumber(getProp(gutter, 'top'))
      const gutterBottom = expectConcreteNumber(getProp(gutter, 'bottom'))

      if (Math.abs(rowBottom - (rowTop + rowHeight)) > epsilon || rowTop + epsilon < maxRowBottom) monotone = false
      if (rowLeft !== 0 || Math.abs(rowWidth - scenario.containerWidth) > epsilon) monotone = false
      if (Math.abs(expectConcreteNumber(getProp(commentRect, 'left')) - expectedCommentLeft) > epsilon) commentMathMatches = false
      if (Math.abs(expectConcreteNumber(getProp(commentRect, 'width')) - expectedCommentWidth) > epsilon) commentMathMatches = false
      if (expectConcreteNumber(getProp(commentRect, 'height')) < -epsilon) commentMathMatches = false
      if (userTop < rowTop - epsilon || userTop + userHeight > rowBottom + epsilon) userRectStaysInsideRow = false
      if (gutterBottom + epsilon < gutterTop) gutterStaysOrdered = false
      maxRowBottom = rowBottom
    }

    check(laws, 'layoutHNThreadVisualGeometry keeps row bottoms monotone and full-width', monotone, () => ({
      scenario: scenario.label,
      rowCount: rows.items.length,
    }))
    check(laws, 'layoutHNThreadVisualGeometry keeps comment x and width tied to indent math', commentMathMatches, () => ({
      scenario: scenario.label,
    }))
    check(laws, 'layoutHNThreadVisualGeometry keeps the user rect inside the row', userRectStaysInsideRow, () => ({
      scenario: scenario.label,
    }))
    check(laws, 'layoutHNThreadVisualGeometry keeps gutter segments ordered', gutterStaysOrdered, () => ({
      scenario: scenario.label,
    }))
    check(laws, 'layoutHNThreadVisualGeometry derives content height from the last row bottom plus scrollTopCap', Math.abs(contentHeight - (maxRowBottom + scenario.scrollTopCap)) <= epsilon, () => ({
      scenario: scenario.label,
      contentHeight,
      expectedContentHeight: maxRowBottom + scenario.scrollTopCap,
    }))

    const visibleStateConsistent =
      firstVisibleRowIndex.kind === 'null'
        ? lastVisibleRowIndex.kind === 'null' && firstVisibleRowTop.kind === 'null'
        : (() => {
            if (lastVisibleRowIndex.kind === 'null' || firstVisibleRowTop.kind === 'null') return false
            const firstIndex = expectConcreteNumber(firstVisibleRowIndex)
            const lastIndex = expectConcreteNumber(lastVisibleRowIndex)
            if (firstIndex < 0 || lastIndex < firstIndex || lastIndex >= rows.items.length) return false
            const firstRow = expectObject(rows.items[firstIndex]!)
            const firstRowRect = expectObject(getProp(firstRow, 'rowRect'))
            return Math.abs(expectConcreteNumber(firstVisibleRowTop) - expectConcreteNumber(getProp(firstRowRect, 'top'))) <= epsilon
          })()
    check(laws, 'layoutHNThreadVisualGeometry keeps visible-row bookkeeping internally consistent', visibleStateConsistent, () => ({
      scenario: scenario.label,
      firstVisibleRowIndex: firstVisibleRowIndex.kind === 'null' ? null : expectConcreteNumber(firstVisibleRowIndex),
      lastVisibleRowIndex: lastVisibleRowIndex.kind === 'null' ? null : expectConcreteNumber(lastVisibleRowIndex),
    }))
  }
}
