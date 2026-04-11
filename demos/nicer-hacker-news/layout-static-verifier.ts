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
      rangeThreadRow(0, 100, 140, 240, 320),
      rangeThreadRow(1, 80, 96, 200, 260),
      rangeThreadRow(2, 60, 72, 160, 220),
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
  }), 'range')
  if (rows.items == null || rows.items.length !== 3) return

  const firstRow = expectRangeObject(rows.items[0]!)
  const secondRow = expectRangeObject(rows.items[1]!)
  const thirdRow = expectRangeObject(rows.items[2]!)
  const firstRowRect = getRangeObjectProp(firstRow, 'rowRect')
  const secondRowRect = getRangeObjectProp(secondRow, 'rowRect')
  const thirdRowRect = getRangeObjectProp(thirdRow, 'rowRect')
  const firstUserRect = getRangeObjectProp(firstRow, 'userRect')
  const secondUserRect = getRangeObjectProp(secondRow, 'userRect')
  const thirdUserRect = getRangeObjectProp(thirdRow, 'userRect')
  const firstCommentRect = getRangeObjectProp(firstRow, 'commentRect')
  const secondCommentRect = getRangeObjectProp(secondRow, 'commentRect')
  const thirdCommentRect = getRangeObjectProp(thirdRow, 'commentRect')
  const firstTop = getRangeNumberProp(firstRowRect, 'top')
  const firstHeight = getRangeNumberProp(firstRowRect, 'height')
  const secondTop = getRangeNumberProp(secondRowRect, 'top')
  const secondHeight = getRangeNumberProp(secondRowRect, 'height')
  const thirdTop = getRangeNumberProp(thirdRowRect, 'top')
  const thirdHeight = getRangeNumberProp(thirdRowRect, 'height')
  const firstUserTop = getRangeNumberProp(firstUserRect, 'top')
  const secondUserTop = getRangeNumberProp(secondUserRect, 'top')
  const thirdUserTop = getRangeNumberProp(thirdUserRect, 'top')
  const firstBottom = getRangeNumberProp(firstRow, 'rowBottom')
  const secondBottom = getRangeNumberProp(secondRow, 'rowBottom')
  const thirdBottom = getRangeNumberProp(thirdRow, 'rowBottom')
  const firstVisibleRowIndex = getRangeNumberProp(layout, 'firstVisibleRowIndex')
  const lastVisibleRowIndex = getRangeNumberProp(layout, 'lastVisibleRowIndex')
  const firstVisibleRowTop = getRangeNumberProp(layout, 'firstVisibleRowTop')
  const contentHeight = getRangeNumberProp(layout, 'contentHeight')

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
  }), 'range')
  check(laws, 'layoutHNThreadVisualGeometry keeps comment x tied to indent math over intervals', rangesEqual(
    getRangeNumberProp(firstCommentRect, 'left'),
    rangeNumber(24, 24, true),
  ) && rangesEqual(
    getRangeNumberProp(secondCommentRect, 'left'),
    rangeNumber(48, 48, true),
  ) && rangesEqual(
    getRangeNumberProp(thirdCommentRect, 'left'),
    rangeNumber(72, 72, true),
  ), () => ({
    firstLeft: describeRange(getRangeNumberProp(firstCommentRect, 'left')),
    secondLeft: describeRange(getRangeNumberProp(secondCommentRect, 'left')),
    thirdLeft: describeRange(getRangeNumberProp(thirdCommentRect, 'left')),
  }), 'range')
  check(laws, 'layoutHNThreadVisualGeometry keeps user tops pinned to row tops over intervals', rangesEqual(
    firstUserTop,
    firstTop,
  ) && rangesEqual(
    secondUserTop,
    secondTop,
  ) && rangesEqual(
    thirdUserTop,
    thirdTop,
  ), () => ({
    firstUserTop: describeRange(firstUserTop),
    expectedFirstUserTop: describeRange(firstTop),
    secondUserTop: describeRange(secondUserTop),
    expectedSecondUserTop: describeRange(secondTop),
    thirdUserTop: describeRange(thirdUserTop),
    expectedThirdUserTop: describeRange(thirdTop),
  }), 'range')
  check(laws, 'layoutHNThreadVisualGeometry keeps comment width tied to comment layout width over intervals', rangesEqual(
    getRangeNumberProp(firstCommentRect, 'width'),
    rangeNumber(260, 340, true),
  ) && rangesEqual(
    getRangeNumberProp(secondCommentRect, 'width'),
    rangeNumber(220, 280, true),
  ) && rangesEqual(
    getRangeNumberProp(thirdCommentRect, 'width'),
    rangeNumber(180, 240, true),
  ), () => ({
    firstWidth: describeRange(getRangeNumberProp(firstCommentRect, 'width')),
    secondWidth: describeRange(getRangeNumberProp(secondCommentRect, 'width')),
    thirdWidth: describeRange(getRangeNumberProp(thirdCommentRect, 'width')),
  }), 'range')
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
  }), 'range')
  check(laws, 'layoutHNThreadVisualGeometry derives content height from the last row bottom plus scrollTopCap over intervals', rangesEqual(
    contentHeight,
    addRanges(thirdBottom, rangeNumber(40, 40, true)),
  ), () => ({
    contentHeight: describeRange(contentHeight),
    expectedContentHeight: describeRange(addRanges(thirdBottom, rangeNumber(40, 40, true))),
  }), 'range')
}

function verifyRowHitGeometryRange(analyzer: LoweredProgramAnalyzer, laws: Map<string, InternalLawSummary>) {
  const result = expectRangeArray(joinRangeCases(analyzer.evaluateFunctionRange('layoutHNRowHitGeometry', [rangeObject({
    rows: rangeArray([
      rangeRowHitInput(0, 72, 120),
      rangeRowHitInput(1, 84, 96),
      rangeRowHitInput(2, 60, 88),
    ]),
    submissionHeight: rangeNumber(180, 260, true),
    scrollTopCap: rangeNumber(24, 48, true),
    containerWidth: rangeNumber(640, 760, true),
  })])))

  check(laws, 'layoutHNRowHitGeometry preserves row count over height intervals', result.lengthMin === 3 && result.lengthMax === 3, () => ({
    rowCountMin: result.lengthMin,
    rowCountMax: result.lengthMax,
  }), 'range')
  if (result.items == null || result.items.length !== 3) return
  const rows = result.items

  const firstRect = getRangeObjectProp(expectRangeObject(rows[0]!), 'rowRect')
  const secondRect = getRangeObjectProp(expectRangeObject(rows[1]!), 'rowRect')
  const thirdRect = getRangeObjectProp(expectRangeObject(rows[2]!), 'rowRect')
  const firstTop = getRangeNumberProp(firstRect, 'top')
  const firstHeight = getRangeNumberProp(firstRect, 'height')
  const secondTop = getRangeNumberProp(secondRect, 'top')
  const secondHeight = getRangeNumberProp(secondRect, 'height')
  const thirdTop = getRangeNumberProp(thirdRect, 'top')
  const thirdHeight = getRangeNumberProp(thirdRect, 'height')

  let widthMatches = true
  let leftIsZero = true
  for (let rowIndex = 0; rowIndex < result.items.length; rowIndex++) {
    const row = expectRangeObject(result.items[rowIndex]!)
    const rowRect = getRangeObjectProp(row, 'rowRect')
    const width = getRangeNumberProp(rowRect, 'width')
    const left = getRangeNumberProp(rowRect, 'left')
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
  }), 'range')
  check(laws, 'layoutHNRowHitGeometry keeps each row full-width over width intervals', widthMatches && leftIsZero, () => ({
    leftIsZero: leftIsZero ? 'true' : 'false',
    width: rows.map(item => {
      const rowRect = getRangeObjectProp(expectRangeObject(item), 'rowRect')
      return describeRange(getRangeNumberProp(rowRect, 'width'))
    }).join('|'),
  }), 'range')
  check(laws, 'layoutHNRowHitGeometry keeps row heights non-negative over height intervals', firstHeight.min >= 0 && secondHeight.min >= 0 && thirdHeight.min >= 0, () => ({
    firstHeight: describeRange(firstHeight),
    secondHeight: describeRange(secondHeight),
    thirdHeight: describeRange(thirdHeight),
  }), 'range')
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

function rangeRowHitInput(indent: number, rowHeightMin: number, rowHeightMax: number) {
  return rangeObject({
    indent: rangeNumber(indent, indent, true),
    rowHeightNatural: rangeNumber(rowHeightMin, rowHeightMax, true),
  })
}

function rangeThreadRow(indent: number, rowHeightMin: number, rowHeightMax: number, commentWidthMin: number, commentWidthMax: number) {
  return rangeObject({
    indent: rangeNumber(indent, indent, true),
    rowHeight: rangeNumber(rowHeightMin, rowHeightMax, true),
    commentLayout: rangeObject({width: rangeNumber(commentWidthMin, commentWidthMax, true)}),
  })
}

function getRangeObjectProp(object: ReturnType<typeof expectRangeObject>, key: string) {
  return expectRangeObject(getRangeProp(object, key))
}

function getRangeNumberProp(object: ReturnType<typeof expectRangeObject>, key: string) {
  return expectRangeNumber(getRangeProp(object, key))
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
    }), 'concrete-fixture')
    if (returns.length !== 1) continue

    const rows = expectArray(returns[0]!.value)
    check(laws, 'layoutHNRowHitGeometry preserves row count', rows.items.length === scenario.rows.items.length, () => ({
      scenario: scenario.label,
      rowCount: rows.items.length,
      expectedRowCount: scenario.rows.items.length,
    }), 'concrete-fixture')

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
    }), 'concrete-fixture')
    check(laws, 'layoutHNRowHitGeometry keeps each row full-width and non-negative', widthsMatch, () => ({
      scenario: scenario.label,
      containerWidth: scenario.containerWidth,
    }), 'concrete-fixture')
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
    }), 'concrete-fixture')
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
    }), 'concrete-fixture')

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
    }), 'concrete-fixture')
    check(laws, 'layoutHNThreadVisualGeometry keeps comment x and width tied to indent math', commentMathMatches, () => ({
      scenario: scenario.label,
    }), 'concrete-fixture')
    check(laws, 'layoutHNThreadVisualGeometry keeps the user rect inside the row', userRectStaysInsideRow, () => ({
      scenario: scenario.label,
    }), 'concrete-fixture')
    check(laws, 'layoutHNThreadVisualGeometry keeps gutter segments ordered', gutterStaysOrdered, () => ({
      scenario: scenario.label,
    }), 'concrete-fixture')
    check(laws, 'layoutHNThreadVisualGeometry derives content height from the last row bottom plus scrollTopCap', Math.abs(contentHeight - (maxRowBottom + scenario.scrollTopCap)) <= epsilon, () => ({
      scenario: scenario.label,
      contentHeight,
      expectedContentHeight: maxRowBottom + scenario.scrollTopCap,
    }), 'concrete-fixture')

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
    }), 'concrete-fixture')
  }
}
