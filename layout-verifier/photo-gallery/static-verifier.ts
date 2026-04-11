import {prompt1DLineHeight, prompt2DLineHeight, prompt2DMaxLines, promptPaddingBottom} from '../../demos/photo-gallery/prompt-layout'
import {
  addExpr,
  buildStaticLayoutReport,
  check,
  checkFact,
  concreteArray,
  concreteNull,
  concreteNumber,
  concreteNumberArrayIsStrictlyIncreasing,
  concreteObject,
  constExpr,
  describeNumericArray,
  epsilon,
  expectArray,
  expectConcreteNumber,
  expectObject,
  expectRangeArray,
  expectRangeNumber,
  expectRangeObject,
  expectSymbolicNumber,
  formatScalarExpr,
  getProp,
  getRangeProp,
  type InternalLawSummary,
  joinRangeCases,
  LoweredProgramAnalyzer,
  mineNumericSweepCandidateLaws,
  mulExpr,
  divExpr,
  rangeArray,
  rangeNumber,
  rangeObject,
  summarizeFunctionOverrides,
  type FunctionOverride,
  type StaticLayoutCandidateLaw,
  type StaticLayoutLawWitness,
  type StaticLayoutVerificationReport,
  symbolicExprEquals,
  symbolicNumber,
  symbolicObject,
  symbolicOpaque,
  type Value,
} from '../core'
import {loadStaticContractOverridesForSourceFile} from '../contracts'
import {
  describeIntegerBands,
  partitionIntegerRangeByConcreteNumberValue,
  shrinkIntegerRangeByFailingPredicate,
} from '../discrete'

type WidthColsPartition = {
  widthMin: number
  widthMax: number
  cols: number
}

export function runPhotoGalleryStaticVerification(
  sourceText: string,
  autoContractOverrides: Record<string, FunctionOverride> = {},
): StaticLayoutVerificationReport {
  const analyzer = new LoweredProgramAnalyzer(sourceText, {
    prompt1DLineHeight,
    prompt2DLineHeight,
    prompt2DMaxLines,
    promptPaddingBottom,
  }, autoContractOverrides)
  const laws = new Map<string, InternalLawSummary>()

  verifyMakeItemLayoutGeometry(analyzer, laws)
  verifyGetLineLayoutConcrete(sourceText, autoContractOverrides, laws)
  verifyGetGridLayoutConcrete(sourceText, autoContractOverrides, laws)
  verifyGetGridLayoutRange(sourceText, autoContractOverrides, laws)
  verifyGetGridLayoutRangeAcrossWidthPartitions(sourceText, autoContractOverrides, laws)
  verifyColsBoxMaxSizeXFRange(analyzer, laws)
  const candidateLaws = verifyColsBoxMaxSizeXF(analyzer, laws)

  return buildStaticLayoutReport('photo-gallery-static-layout', 'demos/photo-gallery/layout-model.ts', laws, {
    functionSummaries: summarizeFunctionOverrides(autoContractOverrides),
    candidateLaws,
  })
}

export async function runPhotoGalleryStaticVerificationForSourceFile(sourceFilePath: string): Promise<StaticLayoutVerificationReport> {
  const [sourceText, autoContractOverrides] = await Promise.all([
    Bun.file(sourceFilePath).text(),
    loadStaticContractOverridesForSourceFile(sourceFilePath),
  ])
  return runPhotoGalleryStaticVerification(sourceText, autoContractOverrides)
}

function verifyGetLineLayoutConcrete(
  sourceText: string,
  autoContractOverrides: Record<string, FunctionOverride>,
  laws: Map<string, InternalLawSummary>,
) {
  const analyzer = new LoweredProgramAnalyzer(sourceText, {
    prompt1DLineHeight,
    prompt2DLineHeight,
    prompt2DMaxLines,
    promptPaddingBottom,
  }, {
    ...autoContractOverrides,
    // This proof path trusts the 1D prompt measurement contract here instead of
    // proving the iterative get1DItemSize prompt solver from source.
    get1DItemSize: {
      evaluate(args, mode) {
        if (mode !== 'concrete') throw new Error('get1DItemSize override only supports concrete mode')
        const source = expectObject(args[0]!)
        const box1DMaxSizeX = expectConcreteNumber(args[1]!)
        const box1DMaxSizeY = expectConcreteNumber(args[2]!)
        const scaleFactor = expectConcreteNumber(args[3]!)
        const ar = expectConcreteNumber(getProp(source, 'ar'))
        const naturalSizeX = expectConcreteNumber(getProp(source, 'naturalSizeX'))
        const imageSizeX = Math.min(naturalSizeX, box1DMaxSizeX, box1DMaxSizeY * ar) * scaleFactor
        const imageSizeY = imageSizeX / ar
        const promptVisibleHeight = 24
        return [{
          constraints: [],
          value: concreteObject({
            imageSizeX: concreteNumber(imageSizeX),
            imageSizeY: concreteNumber(imageSizeY),
            promptLayout: concreteObject({
              width: concreteNumber(imageSizeX),
              visibleHeight: concreteNumber(promptVisibleHeight),
              lines: concreteArray([]),
            }),
            layoutHeight: concreteNumber(imageSizeY + promptVisibleHeight + promptPaddingBottom),
          }),
        }]
      },
    },
  })

  const layoutSources = concreteArray([
    concreteObject({ar: concreteNumber(1), naturalSizeX: concreteNumber(400), preparedPrompt: concreteNull('concrete')}),
    concreteObject({ar: concreteNumber(1.5), naturalSizeX: concreteNumber(700), preparedPrompt: concreteNull('concrete')}),
    concreteObject({ar: concreteNumber(0.75), naturalSizeX: concreteNumber(480), preparedPrompt: concreteNull('concrete')}),
    concreteObject({ar: concreteNumber(2), naturalSizeX: concreteNumber(900), preparedPrompt: concreteNull('concrete')}),
  ])

  const lineCases = [
    {focused: 0, label: 'first'},
    {focused: 2, label: 'middle'},
    {focused: 3, label: 'last'},
  ]
  const windowSizeX = 1000
  const windowSizeY = 700
  const scrollY = 123.5
  const hitArea1DSizeX = analyzer.getGlobalNumber('hitArea1DSizeX')

  for (const lineCase of lineCases) {
    const returns = analyzer.evaluateFunction('getLineLayout', [
      layoutSources,
      concreteNumber(lineCase.focused),
      concreteNumber(windowSizeX),
      concreteNumber(windowSizeY),
      concreteNumber(scrollY),
    ], 'concrete')
    check(laws, 'getLineLayout stays branch-free per concrete scenario', returns.length === 1, () => ({
      scenario: lineCase.label,
      cases: returns.length,
    }), 'concrete-fixture')
    if (returns.length !== 1) continue

    const layout = expectObject(returns[0]!.value)
    const items = expectArray(getProp(layout, 'items'))
    const leftHitArea = getProp(layout, 'leftHitArea')
    const rightHitArea = getProp(layout, 'rightHitArea')

    check(laws, 'getLineLayout preserves item count', items.items.length === layoutSources.items.length, () => ({
      scenario: lineCase.label,
      itemCount: items.items.length,
      expectedItemCount: layoutSources.items.length,
    }), 'concrete-fixture')

    const focusedItem = expectObject(items.items[lineCase.focused]!)
    const focusedImageBox = expectObject(getProp(focusedItem, 'imageBox'))
    const focusedCenterX = expectConcreteNumber(getProp(focusedImageBox, 'x')) + expectConcreteNumber(getProp(focusedImageBox, 'sizeX')) / 2
    check(laws, 'getLineLayout keeps the focused image centered', Math.abs(focusedCenterX - windowSizeX / 2) <= epsilon, () => ({
      scenario: lineCase.label,
      focused: lineCase.focused,
      focusedCenterX,
      expectedCenterX: windowSizeX / 2,
    }), 'concrete-fixture')

    check(laws, 'getLineLayout left hit area matches the focused index at the edges', hitAreaMatches(
      leftHitArea,
      lineCase.focused === 0 ? null : {
        targetIndex: lineCase.focused - 1,
        x: 0,
        y: scrollY,
        sizeX: hitArea1DSizeX,
        sizeY: windowSizeY,
      },
    ), () => ({
      scenario: lineCase.label,
      side: 'left',
      focused: lineCase.focused,
      actual: describeHitArea(leftHitArea),
    }), 'concrete-fixture')
    check(laws, 'getLineLayout right hit area matches the focused index at the edges', hitAreaMatches(
      rightHitArea,
      lineCase.focused === layoutSources.items.length - 1 ? null : {
        targetIndex: lineCase.focused + 1,
        x: windowSizeX - hitArea1DSizeX,
        y: scrollY,
        sizeX: hitArea1DSizeX,
        sizeY: windowSizeY,
      },
    ), () => ({
      scenario: lineCase.label,
      side: 'right',
      focused: lineCase.focused,
      actual: describeHitArea(rightHitArea),
    }), 'concrete-fixture')

    let monotone = true
    for (let i = 0; i < items.items.length - 1; i++) {
      const left = expectObject(items.items[i]!)
      const right = expectObject(items.items[i + 1]!)
      const leftImageBox = expectObject(getProp(left, 'imageBox'))
      const rightImageBox = expectObject(getProp(right, 'imageBox'))
      if (expectConcreteNumber(getProp(leftImageBox, 'x')) > expectConcreteNumber(getProp(rightImageBox, 'x')) + epsilon) {
        monotone = false
        break
      }
    }
    check(laws, 'getLineLayout keeps item x order monotone', monotone, () => ({
      scenario: lineCase.label,
      focused: lineCase.focused,
    }), 'concrete-fixture')
  }
}

function verifyGetGridLayoutConcrete(
  sourceText: string,
  autoContractOverrides: Record<string, FunctionOverride>,
  laws: Map<string, InternalLawSummary>,
) {
  const analyzer = new LoweredProgramAnalyzer(sourceText, {
    prompt1DLineHeight,
    prompt2DLineHeight,
    prompt2DMaxLines,
    promptPaddingBottom,
  }, autoContractOverrides)

  const layoutSources = concreteArray([
    concreteObject({ar: concreteNumber(1), naturalSizeX: concreteNumber(400), preparedPrompt: concreteNull('concrete')}),
    concreteObject({ar: concreteNumber(1.5), naturalSizeX: concreteNumber(700), preparedPrompt: concreteNull('concrete')}),
    concreteObject({ar: concreteNumber(0.75), naturalSizeX: concreteNumber(480), preparedPrompt: concreteNull('concrete')}),
    concreteObject({ar: concreteNumber(2), naturalSizeX: concreteNumber(900), preparedPrompt: concreteNull('concrete')}),
    concreteObject({ar: concreteNumber(0.5), naturalSizeX: concreteNumber(360), preparedPrompt: concreteNull('concrete')}),
    concreteObject({ar: concreteNumber(1.2), naturalSizeX: concreteNumber(640), preparedPrompt: concreteNull('concrete')}),
  ])

  const windowWidths = [520, 760, 1100]
  const boxesGapX = analyzer.getGlobalNumber('boxesGapX')
  const boxesGapY = analyzer.getGlobalNumber('boxesGapY')

  for (const windowWidth of windowWidths) {
    const returns = analyzer.evaluateFunction('getGridLayout', [
      layoutSources,
      concreteNumber(windowWidth),
    ], 'concrete')
    check(laws, 'getGridLayout stays branch-free per concrete width', returns.length === 1, () => ({
      windowWidth,
      cases: returns.length,
    }), 'concrete-fixture')
    if (returns.length !== 1) continue

    const layout = expectObject(returns[0]!.value)
    const items = expectArray(getProp(layout, 'items'))
    const rowsTop = expectArray(getProp(layout, 'rowsTop'))
    const cols = expectConcreteNumber(getProp(layout, 'cols'))
    const boxMaxSizeX = expectConcreteNumber(getProp(layout, 'boxMaxSizeX'))
    const contentHeight = expectConcreteNumber(getProp(layout, 'contentHeight'))

    check(laws, 'getGridLayout preserves item count', items.items.length === layoutSources.items.length, () => ({
      windowWidth,
      itemCount: items.items.length,
      expectedItemCount: layoutSources.items.length,
    }), 'concrete-fixture')
    check(laws, 'getGridLayout rowsTop stays monotone', concreteNumberArrayIsStrictlyIncreasing(rowsTop), () => ({
      windowWidth,
      rowsTop: describeNumericArray(rowsTop),
    }), 'concrete-fixture')

    const rowCount = Math.ceil(items.items.length / cols)
    check(laws, 'getGridLayout rowsTop count matches the row count plus trailing bottom', rowsTop.items.length === rowCount + 1, () => ({
      windowWidth,
      cols,
      rowsTopCount: rowsTop.items.length,
      expectedRowsTopCount: rowCount + 1,
    }), 'concrete-fixture')

    let maxBottom = 0
    let withinViewport = true
    let horizontalNonOverlap = true
    let columnCentering = true
    let viewportFailure: null | Record<string, number | string> = null
    let overlapFailure: null | Record<string, number | string> = null
    let columnCenterFailure: null | Record<string, number | string> = null
    for (let i = 0; i < items.items.length; i++) {
      const item = expectObject(items.items[i]!)
      const layoutBox = expectObject(getProp(item, 'layoutBox'))
      const prompt = expectObject(getProp(item, 'prompt'))
      const promptBox = expectObject(getProp(prompt, 'box'))
      const left = expectConcreteNumber(getProp(layoutBox, 'x'))
      const layoutWidth = expectConcreteNumber(getProp(layoutBox, 'sizeX'))
      const right = left + expectConcreteNumber(getProp(layoutBox, 'sizeX'))
      const {row, column} = gridSlot(i, cols)
      const bottom = expectConcreteNumber(getProp(layoutBox, 'y')) + expectConcreteNumber(getProp(layoutBox, 'sizeY'))
      maxBottom = Math.max(maxBottom, bottom)
      if (left < -epsilon || right > windowWidth + epsilon) {
        withinViewport = false
        viewportFailure ??= {
          itemIndex: i,
          row,
          column,
          left,
          right,
          windowWidth,
        }
      }
      if (expectConcreteNumber(getProp(promptBox, 'sizeX')) > layoutWidth + epsilon) {
        withinViewport = false
        viewportFailure ??= {
          itemIndex: i,
          row,
          column,
          promptWidth: expectConcreteNumber(getProp(promptBox, 'sizeX')),
          layoutWidth,
        }
      }

      const slotCenterX = boxesGapX + (boxMaxSizeX + boxesGapX) * column + boxMaxSizeX / 2
      const actualCenterX = left + layoutWidth / 2
      if (Math.abs(actualCenterX - slotCenterX) > epsilon) {
        columnCentering = false
        columnCenterFailure ??= {
          itemIndex: i,
          row,
          column,
          actualCenterX,
          expectedCenterX: slotCenterX,
        }
      }

      if (i % cols !== cols - 1 && i < items.items.length - 1) {
        const next = expectObject(items.items[i + 1]!)
        const nextLayoutBox = expectObject(getProp(next, 'layoutBox'))
        const nextLeft = expectConcreteNumber(getProp(nextLayoutBox, 'x'))
        if (right > nextLeft + epsilon && row === gridSlot(i + 1, cols).row) {
          horizontalNonOverlap = false
          overlapFailure ??= {
            leftItemIndex: i,
            rightItemIndex: i + 1,
            row,
            leftRight: right,
            rightLeft: nextLeft,
            overlapBy: right - nextLeft,
          }
        }
      }
    }

    check(laws, 'getGridLayout keeps layout boxes within the viewport width', withinViewport, () => ({
      windowWidth,
      cols,
      ...(viewportFailure ?? {}),
    }), 'concrete-fixture')
    check(laws, 'getGridLayout row items do not overlap horizontally', horizontalNonOverlap, () => ({
      windowWidth,
      cols,
      ...(overlapFailure ?? {}),
    }), 'concrete-fixture')
    check(laws, 'getGridLayout keeps each item centered in its column slot', columnCentering, () => ({
      windowWidth,
      cols,
      ...(columnCenterFailure ?? {}),
    }), 'concrete-fixture')
    check(laws, 'getGridLayout content height matches the last row bottom plus bottom gap', Math.abs(contentHeight - (maxBottom + boxesGapY)) <= epsilon, () => ({
      windowWidth,
      contentHeight,
      expectedContentHeight: maxBottom + boxesGapY,
    }), 'concrete-fixture')
  }
}

function gridSlot(index: number, cols: number) {
  return {
    row: Math.floor(index / cols),
    column: index % cols,
  }
}

function verifyGetGridLayoutRange(
  sourceText: string,
  autoContractOverrides: Record<string, FunctionOverride>,
  laws: Map<string, InternalLawSummary>,
) {
  const analyzer = new LoweredProgramAnalyzer(sourceText, {
    prompt1DLineHeight,
    prompt2DLineHeight,
    prompt2DMaxLines,
    promptPaddingBottom,
  }, autoContractOverrides)

  const layoutSources = rangePhotoSources()
  const windowWidth = 760
  const layout = expectRangeObject(joinRangeCases(analyzer.evaluateFunctionRange('getGridLayout', [
    layoutSources,
    rangeNumber(windowWidth, windowWidth, true),
  ])))
  const items = expectRangeArray(getRangeProp(layout, 'items'))
  const rowsTop = expectRangeArray(getRangeProp(layout, 'rowsTop'))
  const cols = expectRangeNumber(getRangeProp(layout, 'cols'))
  const boxMaxSizeX = expectRangeNumber(getRangeProp(layout, 'boxMaxSizeX'))
  const contentHeight = expectRangeNumber(getRangeProp(layout, 'contentHeight'))
  const boxesGapX = analyzer.getGlobalNumber('boxesGapX')

  check(laws, 'getGridLayout preserves item count over range evaluation', items.lengthMin === 6 && items.lengthMax === 6, () => ({
    windowWidth,
    itemCountMin: items.lengthMin,
    itemCountMax: items.lengthMax,
    expectedItemCount: 6,
  }), {kind: 'range', targets: ['getGridLayout.return.items.length']})

  check(laws, 'getGridLayout rowsTop stays increasing over range evaluation', rowsTop.isStrictlyIncreasingNumeric, () => ({
    windowWidth,
    rowsTopCountMin: rowsTop.lengthMin,
    rowsTopCountMax: rowsTop.lengthMax,
  }), 'range')

  check(laws, 'getGridLayout rowsTop count matches row count over range evaluation', rowsTop.lengthMin === 3 && rowsTop.lengthMax === 3, () => ({
    windowWidth,
    rowsTopCountMin: rowsTop.lengthMin,
    rowsTopCountMax: rowsTop.lengthMax,
    expectedRowsTopCount: 3,
  }), 'range')

  const lastRowTop = rowsTop.last == null ? null : expectRangeNumber(rowsTop.last)
  check(laws, 'getGridLayout content height comes from last rowsTop over range evaluation', lastRowTop != null && rangesEqual(contentHeight, lastRowTop), () => ({
    windowWidth,
    contentHeight: describeRange(contentHeight),
    expectedContentHeight: lastRowTop == null ? 'missing' : describeRange(lastRowTop),
  }), {kind: 'range', targets: ['getGridLayout.return.contentHeight', 'getGridLayout.return.rowsTop.last']})

  if (items.items == null) return
  let slotsMatch = true
  let firstSlotFailure: null | Record<string, number | string> = null
  for (let itemIndex = 0; itemIndex < items.items.length; itemIndex++) {
    const item = expectRangeObject(items.items[itemIndex]!)
    const layoutBox = getRangeObjectProp(item, 'layoutBox')
    const x = getRangeNumberProp(layoutBox, 'x')
    const sizeX = getRangeNumberProp(layoutBox, 'sizeX')
    const {row, column} = gridSlot(itemIndex, cols.min)
    const actualCenterX = addRanges(x, divideRange(sizeX, 2))
    const expectedCenterX = addRanges(
      rangeNumber(boxesGapX + column * boxesGapX, boxesGapX + column * boxesGapX, false),
      addRanges(mulRange(boxMaxSizeX, column), divideRange(boxMaxSizeX, 2)),
    )
    if (!rangesEqual(actualCenterX, expectedCenterX)) {
      slotsMatch = false
      firstSlotFailure ??= {
        windowWidth,
        itemIndex,
        row,
        column,
        actualCenterX: describeRange(actualCenterX),
        expectedCenterX: describeRange(expectedCenterX),
      }
    }
  }
  check(laws, 'getGridLayout keeps column centers over range evaluation', slotsMatch, () => firstSlotFailure ?? {
    windowWidth,
  }, {kind: 'range', targets: ['getGridLayout.return.items[].layoutBox.x', 'getGridLayout.return.items[].layoutBox.sizeX']})
}

function verifyGetGridLayoutRangeAcrossWidthPartitions(
  sourceText: string,
  autoContractOverrides: Record<string, FunctionOverride>,
  laws: Map<string, InternalLawSummary>,
) {
  const analyzer = new LoweredProgramAnalyzer(sourceText, {
    prompt1DLineHeight,
    prompt2DLineHeight,
    prompt2DMaxLines,
    promptPaddingBottom,
  }, autoContractOverrides)

  const layoutSources = rangePhotoSources()
  const partitions = partitionWidthRangeByCols(analyzer, 320, 1600)
  const coversInterval = widthPartitionsCover(partitions, 320, 1600)
  check(laws, 'getGridLayout partitions width intervals by concrete cols changes', coversInterval, () => ({
    widthMin: 320,
    widthMax: 1600,
    partitions: describeWidthPartitions(partitions),
  }), 'range')
  check(laws, 'getGridLayout discovered cols bands stay monotone', widthPartitionColsIncrease(partitions), () => ({
    partitions: describeWidthPartitions(partitions),
  }), 'range')

  for (const partition of partitions) {
    const layout = expectRangeObject(joinRangeCases(analyzer.evaluateFunctionRange('getGridLayout', [
      layoutSources,
      rangeNumber(partition.widthMin, partition.widthMax, true),
    ])))
    const items = expectRangeArray(getRangeProp(layout, 'items'))
    const rowsTop = expectRangeArray(getRangeProp(layout, 'rowsTop'))
    const cols = expectRangeNumber(getRangeProp(layout, 'cols'))
    const boxMaxSizeX = expectRangeNumber(getRangeProp(layout, 'boxMaxSizeX'))
    const contentHeight = expectRangeNumber(getRangeProp(layout, 'contentHeight'))
    const expectedRowCount = Math.ceil(layoutSources.lengthMax / partition.cols)
    const boxesGapX = analyzer.getGlobalNumber('boxesGapX')

    check(laws, 'getGridLayout keeps cols fixed inside width partitions', cols.min === partition.cols && cols.max === partition.cols, () => ({
      widthMin: partition.widthMin,
      widthMax: partition.widthMax,
      colsMin: cols.min,
      colsMax: cols.max,
      expectedCols: partition.cols,
    }), {kind: 'range', targets: ['getGridLayout.return.cols']})

    check(laws, 'getGridLayout keeps item count across width partitions', items.lengthMin === 6 && items.lengthMax === 6, () => ({
      widthMin: partition.widthMin,
      widthMax: partition.widthMax,
      itemCountMin: items.lengthMin,
      itemCountMax: items.lengthMax,
    }), 'range')

    check(laws, 'getGridLayout keeps row count across width partitions', rowsTop.lengthMin === expectedRowCount + 1 && rowsTop.lengthMax === expectedRowCount + 1, () => ({
      widthMin: partition.widthMin,
      widthMax: partition.widthMax,
      cols: partition.cols,
      rowsTopCountMin: rowsTop.lengthMin,
      rowsTopCountMax: rowsTop.lengthMax,
      expectedRowsTopCount: expectedRowCount + 1,
    }), 'range')

    const lastRowTop = rowsTop.last == null ? null : expectRangeNumber(rowsTop.last)
    check(laws, 'getGridLayout keeps content height tied to rowsTop across width partitions', lastRowTop != null && rangesEqual(contentHeight, lastRowTop), () => ({
      widthMin: partition.widthMin,
      widthMax: partition.widthMax,
      cols: partition.cols,
      contentHeight: describeRange(contentHeight),
      expectedContentHeight: lastRowTop == null ? 'missing' : describeRange(lastRowTop),
    }), {kind: 'range', targets: ['getGridLayout.return.contentHeight', 'getGridLayout.return.rowsTop.last']})

    if (items.items == null) continue
    let slotsMatch = true
    let firstSlotFailure: null | Record<string, number | string> = null
    for (let itemIndex = 0; itemIndex < items.items.length; itemIndex++) {
      const item = expectRangeObject(items.items[itemIndex]!)
      const layoutBox = getRangeObjectProp(item, 'layoutBox')
      const x = getRangeNumberProp(layoutBox, 'x')
      const sizeX = getRangeNumberProp(layoutBox, 'sizeX')
      const {row, column} = gridSlot(itemIndex, partition.cols)
      const actualCenterX = addRanges(x, divideRange(sizeX, 2))
      const expectedCenterX = addRanges(
        rangeNumber(boxesGapX + column * boxesGapX, boxesGapX + column * boxesGapX, false),
        addRanges(mulRange(boxMaxSizeX, column), divideRange(boxMaxSizeX, 2)),
      )
      if (!rangesEqual(actualCenterX, expectedCenterX)) {
        const shrunkWidthBand = shrinkIntegerRangeByFailingPredicate(
          partition.widthMin,
          partition.widthMax,
          (widthMin, widthMax) => getGridCenterFailureForWidthBand(
            analyzer,
            layoutSources,
            widthMin,
            widthMax,
            partition.cols,
          ) != null,
        )
        const shrunkFailure = getGridCenterFailureForWidthBand(
          analyzer,
          layoutSources,
          shrunkWidthBand.min,
          shrunkWidthBand.max,
          partition.cols,
        )
        slotsMatch = false
        firstSlotFailure ??= {
          widthMin: shrunkWidthBand.min,
          widthMax: shrunkWidthBand.max,
          cols: partition.cols,
          itemIndex,
          row,
          column,
          actualCenterX: shrunkFailure == null ? describeRange(actualCenterX) : shrunkFailure.actualCenterX,
          expectedCenterX: shrunkFailure == null ? describeRange(expectedCenterX) : shrunkFailure.expectedCenterX,
          partitionWidthMin: partition.widthMin,
          partitionWidthMax: partition.widthMax,
        }
      }
    }
    check(laws, 'getGridLayout keeps column centers across width partitions', slotsMatch, () => firstSlotFailure ?? {
      widthMin: partition.widthMin,
      widthMax: partition.widthMax,
      cols: partition.cols,
    }, {kind: 'range', targets: ['getGridLayout.return.items[].layoutBox.x', 'getGridLayout.return.items[].layoutBox.sizeX']})
  }
}

function partitionWidthRangeByCols(analyzer: LoweredProgramAnalyzer, widthMin: number, widthMax: number): WidthColsPartition[] {
  return partitionIntegerRangeByConcreteNumberValue(widthMin, widthMax, width => {
    const cases = analyzer.evaluateFunction('colsBoxMaxSizeXF', [concreteNumber(width)], 'concrete')
    if (cases.length !== 1) throw new Error(`colsBoxMaxSizeXF produced ${cases.length} concrete cases at width ${width}`)
    return expectConcreteNumber(getProp(expectObject(cases[0]!.value), 'cols'))
  }).map(partition => ({
    widthMin: partition.inputMin,
    widthMax: partition.inputMax,
    cols: partition.value,
  }))
}

function widthPartitionsCover(partitions: WidthColsPartition[], widthMin: number, widthMax: number) {
  if (partitions.length === 0) return false
  if (partitions[0]!.widthMin !== widthMin) return false
  if (partitions.at(-1)!.widthMax !== widthMax) return false
  for (let i = 1; i < partitions.length; i++) {
    if (partitions[i]!.widthMin !== partitions[i - 1]!.widthMax + 1) return false
  }
  return true
}

function widthPartitionColsIncrease(partitions: WidthColsPartition[]) {
  for (let i = 1; i < partitions.length; i++) {
    if (partitions[i]!.cols <= partitions[i - 1]!.cols) return false
  }
  return true
}

function describeWidthPartitions(partitions: WidthColsPartition[]) {
  return describeIntegerBands(partitions.map(partition => ({
    inputMin: partition.widthMin,
    inputMax: partition.widthMax,
    value: partition.cols,
  })))
}

function getGridCenterFailureForWidthBand(
  analyzer: LoweredProgramAnalyzer,
  layoutSources: ReturnType<typeof rangeArray>,
  widthMin: number,
  widthMax: number,
  cols: number,
) {
  const layout = expectRangeObject(joinRangeCases(analyzer.evaluateFunctionRange('getGridLayout', [
    layoutSources,
    rangeNumber(widthMin, widthMax, true),
  ])))
  const items = expectRangeArray(getRangeProp(layout, 'items'))
  const boxMaxSizeX = expectRangeNumber(getRangeProp(layout, 'boxMaxSizeX'))
  const boxesGapX = analyzer.getGlobalNumber('boxesGapX')
  if (items.items == null) return null

  for (let itemIndex = 0; itemIndex < items.items.length; itemIndex++) {
    const item = expectRangeObject(items.items[itemIndex]!)
    const layoutBox = getRangeObjectProp(item, 'layoutBox')
    const x = getRangeNumberProp(layoutBox, 'x')
    const sizeX = getRangeNumberProp(layoutBox, 'sizeX')
    const {row, column} = gridSlot(itemIndex, cols)
    const actualCenterX = addRanges(x, divideRange(sizeX, 2))
    const expectedCenterX = addRanges(
      rangeNumber(boxesGapX + column * boxesGapX, boxesGapX + column * boxesGapX, false),
      addRanges(mulRange(boxMaxSizeX, column), divideRange(boxMaxSizeX, 2)),
    )
    if (!rangesEqual(actualCenterX, expectedCenterX)) {
      return {
        itemIndex,
        row,
        column,
        actualCenterX: describeRange(actualCenterX),
        expectedCenterX: describeRange(expectedCenterX),
      }
    }
  }

  return null
}

function rangePhotoSource(ar: number, naturalSizeX: number) {
  return rangeObject({
    ar: rangeNumber(ar, ar, Number.isInteger(ar)),
    naturalSizeX: rangeNumber(naturalSizeX, naturalSizeX, true),
    preparedPrompt: rangeObject({}),
  })
}

function rangePhotoSources() {
  return rangeArray([
    rangePhotoSource(1, 400),
    rangePhotoSource(1.5, 700),
    rangePhotoSource(0.75, 480),
    rangePhotoSource(2, 900),
    rangePhotoSource(0.5, 360),
    rangePhotoSource(1.2, 640),
  ])
}

function getRangeObjectProp(object: ReturnType<typeof expectRangeObject>, key: string) {
  return expectRangeObject(getRangeProp(object, key))
}

function getRangeNumberProp(object: ReturnType<typeof expectRangeObject>, key: string) {
  return expectRangeNumber(getRangeProp(object, key))
}

function addRanges(left: ReturnType<typeof expectRangeNumber>, right: ReturnType<typeof expectRangeNumber>) {
  return {
    ...rangeNumber(left.min + right.min, left.max + right.max, left.isInteger && right.isInteger),
    expr: left.expr != null && right.expr != null ? addExpr(left.expr, right.expr) : null,
  }
}

function mulRange(value: ReturnType<typeof expectRangeNumber>, factor: number) {
  const products = [value.min * factor, value.max * factor]
  return {
    ...rangeNumber(Math.min(...products), Math.max(...products), value.isInteger && Number.isInteger(factor)),
    expr: value.expr != null ? mulExpr(value.expr, constExpr(factor)) : null,
  }
}

function divideRange(value: ReturnType<typeof expectRangeNumber>, divisor: number) {
  return {
    ...rangeNumber(value.min / divisor, value.max / divisor, false),
    expr: value.expr != null ? divExpr(value.expr, constExpr(divisor)) : null,
  }
}

function rangesEqual(left: ReturnType<typeof expectRangeNumber>, right: ReturnType<typeof expectRangeNumber>) {
  return (
    Math.abs(left.min - right.min) <= epsilon &&
    Math.abs(left.max - right.max) <= epsilon
  ) || (
    left.expr != null &&
    right.expr != null &&
    symbolicExprEquals(left.expr, right.expr)
  )
}

function describeRange(value: ReturnType<typeof expectRangeNumber>) {
  return `[${value.min},${value.max}]${value.isInteger ? ':int' : ''}`
}

function verifyColsBoxMaxSizeXFRange(analyzer: LoweredProgramAnalyzer, laws: Map<string, InternalLawSummary>) {
  const boxesGapX = analyzer.getGlobalNumber('boxesGapX')
  const cases = analyzer.evaluateFunctionRange('colsBoxMaxSizeXF', [rangeNumber(320, 1600, true)])
  const result = expectRangeObject(joinRangeCases(cases))
  const cols = expectRangeNumber(getRangeProp(result, 'cols'))
  const boxMaxSizeX = expectRangeNumber(getRangeProp(result, 'boxMaxSizeX'))

  checkFact(laws, 'colsBoxMaxSizeXF keeps cols in supported range over width intervals', {
    kind: 'range-within',
    value: cols,
    min: 1,
    max: 7,
  }, () => ({
    colsMin: cols.min,
    colsMax: cols.max,
  }), {targets: ['colsBoxMaxSizeXF.return.cols']})
  checkFact(laws, 'colsBoxMaxSizeXF keeps cols integral over width intervals', {
    kind: 'range-integer',
    value: cols,
  }, () => ({
    colsMin: cols.min,
    colsMax: cols.max,
    colsIsInteger: cols.isInteger ? 'true' : 'false',
  }), {targets: ['colsBoxMaxSizeXF.return.cols']})
  checkFact(laws, 'colsBoxMaxSizeXF keeps boxMaxSizeX non-negative over width intervals', {
    kind: 'range-non-negative',
    value: boxMaxSizeX,
  }, () => ({
    boxMaxSizeXMin: boxMaxSizeX.min,
    boxMaxSizeXMax: boxMaxSizeX.max,
  }), {targets: ['colsBoxMaxSizeXF.return.boxMaxSizeX']})

  const partitions = partitionWidthRangeByCols(analyzer, 320, 1600)
  for (const partition of partitions) {
    const partitionResult = expectRangeObject(joinRangeCases(analyzer.evaluateFunctionRange('colsBoxMaxSizeXF', [
      rangeNumber(partition.widthMin, partition.widthMax, true),
    ])))
    const partitionCols = expectRangeNumber(getRangeProp(partitionResult, 'cols'))
    const partitionBoxMaxSizeX = expectRangeNumber(getRangeProp(partitionResult, 'boxMaxSizeX'))
    const filledWidth = addRanges(
      rangeNumber(boxesGapX + partition.cols * boxesGapX, boxesGapX + partition.cols * boxesGapX, false),
      mulRange(partitionBoxMaxSizeX, partition.cols),
    )

    check(laws, 'colsBoxMaxSizeXF keeps cols fixed inside width partitions', partitionCols.min === partition.cols && partitionCols.max === partition.cols, () => ({
      widthMin: partition.widthMin,
      widthMax: partition.widthMax,
      colsMin: partitionCols.min,
      colsMax: partitionCols.max,
      expectedCols: partition.cols,
    }), 'range')
    check(laws, 'colsBoxMaxSizeXF fills the horizontal track across width partitions', rangesEqual(
      filledWidth,
      rangeNumber(partition.widthMin, partition.widthMax, true),
    ), () => ({
      widthMin: partition.widthMin,
      widthMax: partition.widthMax,
      cols: partition.cols,
      filledWidth: describeRange(filledWidth),
    }), 'range')
  }
}

function verifyMakeItemLayoutGeometry(analyzer: LoweredProgramAnalyzer, laws: Map<string, InternalLawSummary>) {
  const cases = analyzer.evaluateFunction('makeItemLayoutGeometry', [
    symbolicNumber('x'),
    symbolicNumber('y'),
    symbolicNumber('imageSizeX'),
    symbolicNumber('imageSizeY'),
    symbolicObject({
      visibleHeight: symbolicNumber('promptLayout.visibleHeight'),
      width: symbolicNumber('promptLayout.width'),
      lines: symbolicOpaque('promptLayout.lines'),
    }),
    symbolicNumber('promptLineHeight'),
  ], 'symbolic')

  check(laws, 'makeItemLayoutGeometry stays branch-free', cases.length === 1, () => ({
    cases: cases.length,
  }), 'symbolic')
  if (cases.length !== 1) return

  const geometry = expectObject(cases[0]!.value)
  const imageBox = expectObject(getProp(geometry, 'imageBox'))
  const layoutBox = expectObject(getProp(geometry, 'layoutBox'))
  const prompt = expectObject(getProp(geometry, 'prompt'))
  const promptBox = expectObject(getProp(prompt, 'box'))

  const imageX = expectSymbolicNumber(getProp(imageBox, 'x'))
  const imageY = expectSymbolicNumber(getProp(imageBox, 'y'))
  const imageSizeY = expectSymbolicNumber(getProp(imageBox, 'sizeY'))
  const promptX = expectSymbolicNumber(getProp(promptBox, 'x'))
  const promptY = expectSymbolicNumber(getProp(promptBox, 'y'))
  const promptSizeY = expectSymbolicNumber(getProp(promptBox, 'sizeY'))
  const layoutSizeY = expectSymbolicNumber(getProp(layoutBox, 'sizeY'))
  const layoutX = expectSymbolicNumber(getProp(layoutBox, 'x'))

  check(laws, 'makeItemLayoutGeometry keeps image and layout x aligned', symbolicExprEquals(imageX, layoutX), () => ({
    imageX: formatScalarExpr(imageX),
    layoutX: formatScalarExpr(layoutX),
  }), 'symbolic')
  check(laws, 'makeItemLayoutGeometry keeps prompt x aligned with the image', symbolicExprEquals(promptX, imageX), () => ({
    imageX: formatScalarExpr(imageX),
    promptX: formatScalarExpr(promptX),
  }), 'symbolic')
  check(laws, 'makeItemLayoutGeometry puts the prompt directly below the image', symbolicExprEquals(
    promptY,
    addExpr(imageY, imageSizeY),
  ), () => ({
    promptY: formatScalarExpr(promptY),
    expectedPromptY: formatScalarExpr(addExpr(imageY, imageSizeY)),
  }), 'symbolic')
  check(laws, 'makeItemLayoutGeometry derives layout height from image height + prompt height + bottom padding', symbolicExprEquals(
    layoutSizeY,
    addExpr(addExpr(imageSizeY, promptSizeY), constExpr(promptPaddingBottom)),
  ), () => ({
    layoutSizeY: formatScalarExpr(layoutSizeY),
    expectedLayoutSizeY: formatScalarExpr(addExpr(addExpr(imageSizeY, promptSizeY), constExpr(promptPaddingBottom))),
  }), 'symbolic')
}

function verifyColsBoxMaxSizeXF(analyzer: LoweredProgramAnalyzer, laws: Map<string, InternalLawSummary>): StaticLayoutCandidateLaw[] {
  const boxesGapX = analyzer.getGlobalNumber('boxesGapX')
  let previousCols = 0
  let previousBoxMaxSizeX = Infinity
  const samples: StaticLayoutLawWitness[] = []
  for (let containerSizeX = 320; containerSizeX <= 1600; containerSizeX++) {
    const cases = analyzer.evaluateFunction('colsBoxMaxSizeXF', [concreteNumber(containerSizeX)], 'concrete')
    check(laws, 'colsBoxMaxSizeXF stays branch-free per concrete width', cases.length === 1, () => ({
      containerSizeX,
      cases: cases.length,
    }), 'concrete-sweep')
    if (cases.length !== 1) continue

    const result = expectObject(cases[0]!.value)
    const cols = expectConcreteNumber(getProp(result, 'cols'))
    const boxMaxSizeX = expectConcreteNumber(getProp(result, 'boxMaxSizeX'))
    const filledWidth = boxesGapX + cols * boxesGapX + cols * boxMaxSizeX
    samples.push({containerSizeX, cols, boxMaxSizeX, filledWidth})

    check(laws, 'colsBoxMaxSizeXF keeps cols in the supported range', 1 <= cols && cols <= 7, () => ({
      containerSizeX,
      cols,
    }), 'concrete-sweep')
    check(laws, 'colsBoxMaxSizeXF keeps cols integral', Math.abs(cols - Math.round(cols)) <= epsilon, () => ({
      containerSizeX,
      cols,
    }), 'concrete-sweep')
    check(laws, 'colsBoxMaxSizeXF keeps boxMaxSizeX non-negative', boxMaxSizeX >= -epsilon, () => ({
      containerSizeX,
      cols,
      boxMaxSizeX,
    }), 'concrete-sweep')
    check(laws, 'colsBoxMaxSizeXF exactly fills the horizontal track', Math.abs(filledWidth - containerSizeX) <= epsilon, () => ({
      containerSizeX,
      cols,
      boxMaxSizeX,
      filledWidth,
    }), 'concrete-sweep')
    check(laws, 'colsBoxMaxSizeXF keeps cols monotonically non-decreasing over widths', cols >= previousCols, () => ({
      containerSizeX,
      cols,
      previousCols,
    }), 'concrete-sweep')
    check(laws, 'colsBoxMaxSizeXF grows boxMaxSizeX within a column band', cols === previousCols ? boxMaxSizeX >= previousBoxMaxSizeX - epsilon : true, () => ({
      containerSizeX,
      cols,
      boxMaxSizeX,
      previousBoxMaxSizeX,
    }), 'concrete-sweep')
    // Pin concrete values at known widths to catch clamp bound and boxMinSizeX mutations.
    if (containerSizeX === 320) {
      check(laws, 'colsBoxMaxSizeXF produces 1 column at the narrowest viewport', cols === 1, () => ({
        containerSizeX,
        cols,
      }), 'concrete-sweep')
    }
    if (containerSizeX === 1600) {
      check(laws, 'colsBoxMaxSizeXF produces the expected column count at the widest viewport', cols === 6, () => ({
        containerSizeX,
        cols,
      }), 'concrete-sweep')
    }
    previousCols = cols
    previousBoxMaxSizeX = boxMaxSizeX
  }

  const coveredCandidates = new Set([
    'colsBoxMaxSizeXF sweep observed cols as integer',
    'colsBoxMaxSizeXF sweep observed filledWidth as integer',
    'colsBoxMaxSizeXF sweep observed filledWidth in 320..1600',
    'colsBoxMaxSizeXF sweep suggests filledWidth = containerSizeX',
  ])
  return mineNumericSweepCandidateLaws('colsBoxMaxSizeXF', samples, {
    inputKeys: ['containerSizeX'],
    outputKeys: ['cols', 'boxMaxSizeX', 'filledWidth'],
  }).filter(candidate => !coveredCandidates.has(candidate.name))
}

function hitAreaMatches(
  actual: Value,
  expected: {targetIndex: number; x: number; y: number; sizeX: number; sizeY: number} | null,
) {
  if (expected == null) return actual.kind === 'null'
  if (actual.kind !== 'object') return false
  const box = expectObject(getProp(actual, 'box'))
  return (
    expectConcreteNumber(getProp(actual, 'targetIndex')) === expected.targetIndex &&
    Math.abs(expectConcreteNumber(getProp(box, 'x')) - expected.x) <= epsilon &&
    Math.abs(expectConcreteNumber(getProp(box, 'y')) - expected.y) <= epsilon &&
    Math.abs(expectConcreteNumber(getProp(box, 'sizeX')) - expected.sizeX) <= epsilon &&
    Math.abs(expectConcreteNumber(getProp(box, 'sizeY')) - expected.sizeY) <= epsilon
  )
}

function describeHitArea(actual: Value) {
  if (actual.kind === 'null') return 'null'
  if (actual.kind !== 'object') return actual.kind
  const box = expectObject(getProp(actual, 'box'))
  return `${expectConcreteNumber(getProp(actual, 'targetIndex'))}:${expectConcreteNumber(getProp(box, 'x'))},${expectConcreteNumber(getProp(box, 'y'))},${expectConcreteNumber(getProp(box, 'sizeX'))},${expectConcreteNumber(getProp(box, 'sizeY'))}`
}
