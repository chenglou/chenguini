import {
  prompt1DLineHeight,
  prompt1DMaxLines,
  prompt2DLineHeight,
  prompt2DMaxLines,
  promptPaddingBottom,
  promptPaddingTop,
} from '../../demos/photo-gallery/prompt-layout'
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
  divExpr,
  epsilon,
  expectArray,
  expectBoolean,
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
  rangeArray,
  rangeNumber,
  rangeObject,
  type FunctionOverride,
  type BoolExpr,
  type RangeNumberValue,
  type RangeObjectValue,
  type ScalarExpr,
  type StaticLayoutCandidateLaw,
  type StaticLayoutLawWitness,
  type StaticLayoutVerificationReport,
  summarizeFunctionOverrides,
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

export function runPhotoGalleryStaticVerification(
  sourceText: string,
  autoContractOverrides: Record<string, FunctionOverride> = {},
): StaticLayoutVerificationReport {
  const analyzer = new LoweredProgramAnalyzer(sourceText, photoGalleryGlobals, autoContractOverrides)
  const laws = new Map<string, InternalLawSummary>()

  verifyClampRange(analyzer, laws)
  verifyRectContainsPointConcrete(analyzer, laws)
  verifyMakeItemLayoutGeometry(analyzer, laws)
  verifyGet1DItemSizeConcrete(sourceText, autoContractOverrides, laws)
  verifyGetLineLayoutConcrete(sourceText, autoContractOverrides, laws)
  verifyGetGridLayoutConcrete(sourceText, autoContractOverrides, laws)
  verifyGetGridLayoutRange(sourceText, autoContractOverrides, laws)
  verifyGetGridLayoutRangeAcrossWidthPartitions(sourceText, autoContractOverrides, laws)
  verifyColsBoxMaxSizeXFRange(analyzer, laws)
  const candidateLaws = [
    ...verifyColsBoxMaxSizeXF(analyzer, laws),
  ]

  return buildStaticLayoutReport('photo-gallery-static-layout', 'demos/photo-gallery/layout-model.ts', laws, {
    functionSummaries: summarizeFunctionOverrides(autoContractOverrides),
    candidateLaws,
  })
}

const photoGalleryGlobals = {
  prompt1DLineHeight,
  prompt1DMaxLines,
  prompt2DLineHeight,
  prompt2DMaxLines,
  promptPaddingBottom,
  promptPaddingTop,
}

function verifyClampRange(analyzer: LoweredProgramAnalyzer, laws: Map<string, InternalLawSummary>) {
  const min = symbolicNumber('min')
  const value = symbolicNumber('v')
  const max = symbolicNumber('max')
  const minExpr = expectSymbolicNumber(min)
  const valueExpr = expectSymbolicNumber(value)
  const maxExpr = expectSymbolicNumber(max)
  const symbolicReturns = analyzer.evaluateFunction('clamp', [min, value, max], 'symbolic')
  const maxBranch = findSymbolicReturn(symbolicReturns, maxExpr)
  const minBranch = findSymbolicReturn(symbolicReturns, minExpr)
  const valueBranch = findSymbolicReturn(symbolicReturns, valueExpr)
  const symbolicShapeMatches = (
    symbolicReturns.length === 3 &&
    maxBranch != null &&
    minBranch != null &&
    valueBranch != null &&
    hasSymbolicConstraint(maxBranch.constraints, '>', valueExpr, maxExpr) &&
    hasSymbolicConstraint(minBranch.constraints, '<=', valueExpr, maxExpr) &&
    hasSymbolicConstraint(minBranch.constraints, '<', valueExpr, minExpr) &&
    hasSymbolicConstraint(valueBranch.constraints, '<=', valueExpr, maxExpr) &&
    hasSymbolicConstraint(valueBranch.constraints, '>=', valueExpr, minExpr)
  )
  check(laws, 'clamp keeps symbolic branch guards aligned with min, value, and max', symbolicShapeMatches, () => ({
    branches: describeSymbolicReturns(symbolicReturns),
  }), {kind: 'symbolic', targets: ['clamp.return']})

  const scenarios = [
    {label: 'below_min', min: rangeNumber(10, 10, true), value: rangeNumber(0, 5, true), max: rangeNumber(20, 20, true), expected: rangeNumber(10, 10, true)},
    {label: 'inside', min: rangeNumber(10, 10, true), value: rangeNumber(10, 20, true), max: rangeNumber(20, 20, true), expected: rangeNumber(10, 20, true)},
    {label: 'above_max', min: rangeNumber(10, 10, true), value: rangeNumber(25, 30, true), max: rangeNumber(20, 20, true), expected: rangeNumber(20, 20, true)},
    {label: 'crossing', min: rangeNumber(10, 10, true), value: rangeNumber(0, 30, true), max: rangeNumber(20, 20, true), expected: rangeNumber(10, 20, true)},
  ]

  for (const scenario of scenarios) {
    const result = expectRangeNumber(joinRangeCases(analyzer.evaluateFunctionRange('clamp', [
      scenario.min,
      scenario.value,
      scenario.max,
    ])))
    check(laws, 'clamp keeps results inside bounds and preserves the interior interval', rangesEqual(result, scenario.expected), () => ({
      scenario: scenario.label,
      actual: describeRange(result),
      expected: describeRange(scenario.expected),
    }), {kind: 'range', targets: ['clamp.return']})
  }
}

function findSymbolicReturn(returns: Array<{constraints: BoolExpr[]; value: Value}>, expr: ScalarExpr) {
  return returns.find(returned => (
    returned.value.kind === 'number' &&
    returned.value.mode === 'symbolic' &&
    symbolicExprEquals(returned.value.expr, expr)
  ))
}

function hasSymbolicConstraint(constraints: BoolExpr[], op: BoolExpr['op'], left: ScalarExpr, right: ScalarExpr) {
  return constraints.some(constraint => (
    constraint.op === op &&
    symbolicExprEquals(constraint.left, left) &&
    symbolicExprEquals(constraint.right, right)
  ))
}

function describeSymbolicReturns(returns: Array<{constraints: BoolExpr[]; value: Value}>) {
  return returns.map(returned => {
    const value =
      returned.value.kind === 'number' && returned.value.mode === 'symbolic'
        ? formatScalarExpr(returned.value.expr)
        : returned.value.kind
    const joinedConstraints = returned.constraints.map(describeBoolExpr).join(' && ')
    const constraints = joinedConstraints.length > 0 ? joinedConstraints : 'true'
    return `${value} when ${constraints}`
  }).join('; ')
}

function describeBoolExpr(expr: BoolExpr) {
  return `${formatScalarExpr(expr.left)} ${expr.op} ${formatScalarExpr(expr.right)}`
}

function verifyRectContainsPointConcrete(analyzer: LoweredProgramAnalyzer, laws: Map<string, InternalLawSummary>) {
  const rectValue = concreteObject({
    x: concreteNumber(10),
    y: concreteNumber(20),
    sizeX: concreteNumber(100),
    sizeY: concreteNumber(50),
  })
  const scenarios = [
    {label: 'top_left_edge', x: 10, y: 20, expected: true},
    {label: 'inside', x: 60, y: 45, expected: true},
    {label: 'outside_left', x: 9, y: 45, expected: false},
    {label: 'outside_top', x: 60, y: 19, expected: false},
    {label: 'right_edge_excluded', x: 110, y: 45, expected: false},
    {label: 'bottom_edge_excluded', x: 60, y: 70, expected: false},
    {label: 'outside_right', x: 111, y: 45, expected: false},
    {label: 'outside_bottom', x: 60, y: 71, expected: false},
  ]

  for (const scenario of scenarios) {
    const returns = analyzer.evaluateFunction('rectContainsPoint', [
      rectValue,
      concreteNumber(scenario.x),
      concreteNumber(scenario.y),
    ], 'concrete')
    check(laws, 'rectContainsPoint stays branch-free per concrete point', returns.length === 1, () => ({
      scenario: scenario.label,
      cases: returns.length,
    }), 'concrete-fixture')
    if (returns.length !== 1) continue

    const result = expectBoolean(returns[0]!.value)
    if (result.mode !== 'concrete') throw new Error('rectContainsPoint concrete proof expected a concrete boolean')
    const actual = result.value
    check(laws, 'rectContainsPoint uses half-open rect edges', actual === scenario.expected, () => ({
      scenario: scenario.label,
      x: scenario.x,
      y: scenario.y,
      actual: actual ? 'true' : 'false',
      expected: scenario.expected ? 'true' : 'false',
    }), {kind: 'concrete-fixture', targets: ['rectContainsPoint.return']})
  }
}

function verifyGetGridLayoutRange(
  sourceText: string,
  autoContractOverrides: Record<string, FunctionOverride>,
  laws: Map<string, InternalLawSummary>,
) {
  const analyzer = new LoweredProgramAnalyzer(sourceText, photoGalleryGlobals, autoContractOverrides)

  const layoutSources = rangeArray([
    rangePhotoSource(1, 400),
    rangePhotoSource(1.5, 700),
    rangePhotoSource(0.75, 480),
    rangePhotoSource(2, 900),
    rangePhotoSource(0.5, 360),
    rangePhotoSource(1.2, 640),
  ])
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
  }), {kind: 'range', targets: ['getGridLayout.items']})

  check(laws, 'getGridLayout rowsTop stays increasing over range evaluation', rowsTop.isStrictlyIncreasingNumeric, () => ({
    windowWidth,
    rowsTopCountMin: rowsTop.lengthMin,
    rowsTopCountMax: rowsTop.lengthMax,
  }), {kind: 'range', targets: ['getGridLayout.rowsTop']})

  check(laws, 'getGridLayout rowsTop count matches row count over range evaluation', rowsTop.lengthMin === 3 && rowsTop.lengthMax === 3, () => ({
    windowWidth,
    rowsTopCountMin: rowsTop.lengthMin,
    rowsTopCountMax: rowsTop.lengthMax,
    expectedRowsTopCount: 3,
  }), {kind: 'range', targets: ['getGridLayout.rowsTop']})

  const lastRowTop = rowsTop.last == null ? null : expectRangeNumber(rowsTop.last)
  check(laws, 'getGridLayout content height comes from last rowsTop over range evaluation', lastRowTop != null && rangesEqual(contentHeight, lastRowTop), () => ({
    windowWidth,
    contentHeight: describeRange(contentHeight),
    expectedContentHeight: lastRowTop == null ? 'missing' : describeRange(lastRowTop),
  }), {kind: 'range', targets: ['getGridLayout.contentHeight', 'getGridLayout.rowsTop']})

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
  }, {kind: 'range', targets: ['getGridLayout.items.layoutBox']})
}

function verifyGetGridLayoutRangeAcrossWidthPartitions(
  sourceText: string,
  autoContractOverrides: Record<string, FunctionOverride>,
  laws: Map<string, InternalLawSummary>,
) {
  const analyzer = new LoweredProgramAnalyzer(sourceText, photoGalleryGlobals, autoContractOverrides)

  const layoutSources = rangeArray([
    rangePhotoSource(1, 400),
    rangePhotoSource(1.5, 700),
    rangePhotoSource(0.75, 480),
    rangePhotoSource(2, 900),
    rangePhotoSource(0.5, 360),
    rangePhotoSource(1.2, 640),
  ])
  const partitions = partitionWidthRangeByCols(analyzer, 320, 1600)
  const coversInterval =
    partitions.length > 0 &&
    partitions[0]!.widthMin === 320 &&
    partitions.at(-1)!.widthMax === 1600 &&
    partitions.every((partition, index) =>
      index === 0 ? true : partition.widthMin === partitions[index - 1]!.widthMax + 1)
  check(laws, 'getGridLayout partitions width intervals by concrete cols changes', coversInterval, () => ({
    widthMin: 320,
    widthMax: 1600,
    partitions: describeIntegerBands(partitions.map(partition => ({
      inputMin: partition.widthMin,
      inputMax: partition.widthMax,
      value: partition.cols,
    }))),
  }), {kind: 'range', targets: ['colsBoxMaxSizeXF.cols']})
  check(laws, 'getGridLayout discovered cols bands stay monotone', partitions.every((partition, index) =>
    index === 0 ? true : partition.cols > partitions[index - 1]!.cols), () => ({
    partitions: describeIntegerBands(partitions.map(partition => ({
      inputMin: partition.widthMin,
      inputMax: partition.widthMax,
      value: partition.cols,
    }))),
  }), {kind: 'range', targets: ['colsBoxMaxSizeXF.cols']})

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
    }), {kind: 'range', targets: ['getGridLayout.cols']})

    check(laws, 'getGridLayout keeps item count across width partitions', items.lengthMin === 6 && items.lengthMax === 6, () => ({
      widthMin: partition.widthMin,
      widthMax: partition.widthMax,
      itemCountMin: items.lengthMin,
      itemCountMax: items.lengthMax,
    }), {kind: 'range', targets: ['getGridLayout.items']})

    check(laws, 'getGridLayout keeps row count across width partitions', rowsTop.lengthMin === expectedRowCount + 1 && rowsTop.lengthMax === expectedRowCount + 1, () => ({
      widthMin: partition.widthMin,
      widthMax: partition.widthMax,
      cols: partition.cols,
      rowsTopCountMin: rowsTop.lengthMin,
      rowsTopCountMax: rowsTop.lengthMax,
      expectedRowsTopCount: expectedRowCount + 1,
    }), {kind: 'range', targets: ['getGridLayout.rowsTop']})

    const lastRowTop = rowsTop.last == null ? null : expectRangeNumber(rowsTop.last)
    check(laws, 'getGridLayout keeps content height tied to rowsTop across width partitions', lastRowTop != null && rangesEqual(contentHeight, lastRowTop), () => ({
      widthMin: partition.widthMin,
      widthMax: partition.widthMax,
      cols: partition.cols,
      contentHeight: describeRange(contentHeight),
      expectedContentHeight: lastRowTop == null ? 'missing' : describeRange(lastRowTop),
    }), {kind: 'range', targets: ['getGridLayout.contentHeight', 'getGridLayout.rowsTop']})

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
    }, {kind: 'range', targets: ['getGridLayout.items.layoutBox']})
  }
}

export async function runPhotoGalleryStaticVerificationForSourceFile(sourceFilePath: string): Promise<StaticLayoutVerificationReport> {
  const [sourceText, autoContractOverrides] = await Promise.all([
    Bun.file(sourceFilePath).text(),
    loadStaticContractOverridesForSourceFile(sourceFilePath),
  ])
  return runPhotoGalleryStaticVerification(sourceText, autoContractOverrides)
}

function verifyGet1DItemSizeConcrete(
  sourceText: string,
  autoContractOverrides: Record<string, FunctionOverride>,
  laws: Map<string, InternalLawSummary>,
) {
  const analyzer = new LoweredProgramAnalyzer(sourceText, photoGalleryGlobals, autoContractOverrides)
  const scenarios = [
    {label: 'focused_square_height_limited', ar: 1, naturalSizeX: 400, box1DMaxSizeX: 520, box1DMaxSizeY: 360, scaleFactor: 1},
    {label: 'neighbor_landscape_width_limited', ar: 1.5, naturalSizeX: 700, box1DMaxSizeX: 420, box1DMaxSizeY: 600, scaleFactor: 0.7},
    {label: 'neighbor_portrait_height_limited', ar: 0.75, naturalSizeX: 480, box1DMaxSizeX: 700, box1DMaxSizeY: 300, scaleFactor: 0.7},
    {label: 'tiny_height_uses_min_image_height', ar: 1.2, naturalSizeX: 480, box1DMaxSizeX: 700, box1DMaxSizeY: 10, scaleFactor: 1},
  ]

  for (const scenario of scenarios) {
    const source = concreteObject({
      ar: concreteNumber(scenario.ar),
      naturalSizeX: concreteNumber(scenario.naturalSizeX),
      preparedPrompt: concreteNull('concrete'),
    })
    const returns = analyzer.evaluateFunction('get1DItemSize', [
      source,
      concreteNumber(scenario.box1DMaxSizeX),
      concreteNumber(scenario.box1DMaxSizeY),
      concreteNumber(scenario.scaleFactor),
    ], 'concrete')
    check(laws, 'get1DItemSize stays branch-free per concrete size case', returns.length === 1, () => ({
      scenario: scenario.label,
      cases: returns.length,
    }), 'concrete-fixture')
    if (returns.length !== 1) continue

    const result = expectObject(returns[0]!.value)
    const promptLayout = expectObject(getProp(result, 'promptLayout'))
    const actualImageSizeX = expectConcreteNumber(getProp(result, 'imageSizeX'))
    const actualImageSizeY = expectConcreteNumber(getProp(result, 'imageSizeY'))
    const actualLayoutHeight = expectConcreteNumber(getProp(result, 'layoutHeight'))
    const actualPromptWidth = expectConcreteNumber(getProp(promptLayout, 'width'))
    const actualPromptVisibleHeight = expectConcreteNumber(getProp(promptLayout, 'visibleHeight'))
    const expected = expected1DMeasurement(
      scenario.ar,
      scenario.naturalSizeX,
      scenario.box1DMaxSizeX,
      scenario.box1DMaxSizeY,
      scenario.scaleFactor,
      prompt1DLineHeight * 2,
    )

    check(laws, 'get1DItemSize derives image size from 1D bounds and scale', (
      Math.abs(actualImageSizeX - expected.imageSizeX) <= epsilon &&
      Math.abs(actualImageSizeY - expected.imageSizeY) <= epsilon
    ), () => ({
      scenario: scenario.label,
      imageSizeX: actualImageSizeX,
      expectedImageSizeX: expected.imageSizeX,
      imageSizeY: actualImageSizeY,
      expectedImageSizeY: expected.imageSizeY,
    }), {kind: 'concrete-fixture', targets: ['get1DItemSize.imageSizeX', 'get1DItemSize.imageSizeY']})
    check(laws, 'get1DItemSize derives layout height from image and prompt heights', Math.abs(actualLayoutHeight - expected.layoutHeight) <= epsilon, () => ({
      scenario: scenario.label,
      layoutHeight: actualLayoutHeight,
      expectedLayoutHeight: expected.layoutHeight,
    }), {kind: 'concrete-fixture', targets: ['get1DItemSize.layoutHeight']})
    check(laws, 'get1DItemSize keeps prompt layout tied to the final image width', (
      Math.abs(actualPromptWidth - expected.imageSizeX) <= epsilon &&
      Math.abs(actualPromptVisibleHeight - expected.promptVisibleHeight) <= epsilon
    ), () => ({
      scenario: scenario.label,
      promptWidth: actualPromptWidth,
      expectedPromptWidth: expected.imageSizeX,
      promptVisibleHeight: actualPromptVisibleHeight,
      expectedPromptVisibleHeight: expected.promptVisibleHeight,
    }), {kind: 'concrete-fixture', targets: ['get1DItemSize.promptLayout']})
  }
}

function verifyGetLineLayoutConcrete(
  sourceText: string,
  autoContractOverrides: Record<string, FunctionOverride>,
  laws: Map<string, InternalLawSummary>,
) {
  const analyzer = new LoweredProgramAnalyzer(sourceText, photoGalleryGlobals, {
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
    {focused: 1, label: 'second'},
    {focused: 2, label: 'middle'},
    {focused: 3, label: 'last'},
  ]
  const windowSizeX = 1000
  const windowSizeY = 700
  const scrollY = 123.5
  const hitArea1DSizeX = analyzer.getGlobalNumber('hitArea1DSizeX')
  const boxes1DGapX = analyzer.getGlobalNumber('boxes1DGapX')
  const boxes1DGapY = analyzer.getGlobalNumber('boxes1DGapY')
  const windowPaddingTop = analyzer.getGlobalNumber('windowPaddingTop')
  const box1DMaxSizeX = windowSizeX - boxes1DGapX * 2 - hitArea1DSizeX * 2
  const box1DMaxSizeY = windowSizeY - windowPaddingTop - boxes1DGapY

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
    const itemRects = items.items.map(itemValue => {
      const item = expectObject(itemValue)
      const layoutBox = expectObject(getProp(item, 'layoutBox'))
      return {
        left: expectConcreteNumber(getProp(layoutBox, 'x')),
        top: expectConcreteNumber(getProp(layoutBox, 'y')),
        width: expectConcreteNumber(getProp(layoutBox, 'sizeX')),
        height: expectConcreteNumber(getProp(layoutBox, 'sizeY')),
      }
    })

    check(laws, 'getLineLayout preserves item count', items.items.length === layoutSources.items.length, () => ({
      scenario: lineCase.label,
      itemCount: items.items.length,
      expectedItemCount: layoutSources.items.length,
    }), 'concrete-fixture')

    let yPositionsMatch = true
    let yFailure: null | Record<string, number | string> = null
    for (let i = 0; i < itemRects.length; i++) {
      const itemRect = itemRects[i]!
      const expectedY = Math.max(windowPaddingTop, (windowSizeY - itemRect.height) / 2) + scrollY
      if (Math.abs(itemRect.top - expectedY) > epsilon) {
        yPositionsMatch = false
        yFailure ??= {
          scenario: lineCase.label,
          itemIndex: i,
          actualY: itemRect.top,
          expectedY,
          layoutHeight: itemRect.height,
        }
      }
    }
    check(laws, 'getLineLayout y position uses padded vertical centering', yPositionsMatch, () => ({
      scenario: lineCase.label,
      focused: lineCase.focused,
      ...(yFailure ?? {}),
    }), {kind: 'concrete-fixture', targets: ['getLineLayout.items[].layoutBox.y']})

    let itemSizesMatch = true
    let sizeFailure: null | Record<string, number | string> = null
    for (let i = 0; i < itemRects.length; i++) {
      const source = expectObject(layoutSources.items[i]!)
      const ar = expectConcreteNumber(getProp(source, 'ar'))
      const naturalSizeX = expectConcreteNumber(getProp(source, 'naturalSizeX'))
      const expected = expected1DOverrideMeasurement(
        ar,
        naturalSizeX,
        box1DMaxSizeX,
        box1DMaxSizeY,
        i === lineCase.focused ? 1 : 0.7,
      )
      const itemRect = itemRects[i]!
      if (
        Math.abs(itemRect.width - expected.imageSizeX) > epsilon ||
        Math.abs(itemRect.height - expected.layoutHeight) > epsilon
      ) {
        itemSizesMatch = false
        sizeFailure ??= {
          scenario: lineCase.label,
          focused: lineCase.focused,
          itemIndex: i,
          actualWidth: itemRect.width,
          expectedWidth: expected.imageSizeX,
          actualHeight: itemRect.height,
          expectedHeight: expected.layoutHeight,
        }
      }
    }
    check(laws, 'getLineLayout derives item sizes from 1D bounds and focus scale', itemSizesMatch, () => ({
      scenario: lineCase.label,
      focused: lineCase.focused,
      ...(sizeFailure ?? {}),
    }), {kind: 'concrete-fixture', targets: ['getLineLayout.items[].layoutBox.sizeX', 'getLineLayout.items[].layoutBox.sizeY']})

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
    let nonFocusedNoOverlap = true
    let currentLeftAdvances = true
    let expectedLeft = hitArea1DSizeX + boxes1DGapX
    for (let i = lineCase.focused - 1; i >= 0; i--) expectedLeft -= itemRects[i]!.width + boxes1DGapX
    let monotoneFailure: null | Record<string, number | string> = null
    let overlapFailure: null | Record<string, number | string> = null
    let currentLeftFailure: null | Record<string, number | string> = null
    for (let i = 0; i < items.items.length - 1; i++) {
      const leftRect = itemRects[i]!
      const rightRect = itemRects[i + 1]!
      if (leftRect.left > rightRect.left + epsilon) {
        monotone = false
        monotoneFailure ??= {
          scenario: lineCase.label,
          focused: lineCase.focused,
          leftItemIndex: i,
          rightItemIndex: i + 1,
          leftX: leftRect.left,
          rightX: rightRect.left,
        }
      }
      if (i !== lineCase.focused && i + 1 !== lineCase.focused) {
        checkFact(laws, 'getLineLayout non-focused neighbors do not overlap horizontally as geometry facts', {
          kind: 'concrete-rects-do-not-overlap-x',
          left: leftRect,
          right: rightRect,
          tolerance: epsilon,
        }, () => ({
          scenario: lineCase.label,
          focused: lineCase.focused,
          leftItemIndex: i,
          rightItemIndex: i + 1,
        }), {targets: [`getLineLayout.items.${i}.layoutBox`, `getLineLayout.items.${i + 1}.layoutBox`]})
        if (leftRect.left + leftRect.width > rightRect.left + epsilon) {
          nonFocusedNoOverlap = false
          overlapFailure ??= {
            scenario: lineCase.label,
            focused: lineCase.focused,
            leftItemIndex: i,
            rightItemIndex: i + 1,
            leftRight: leftRect.left + leftRect.width,
            rightLeft: rightRect.left,
            overlapBy: leftRect.left + leftRect.width - rightRect.left,
          }
        }
      }
    }
    check(laws, 'getLineLayout keeps item x order monotone', monotone, () => ({
      scenario: lineCase.label,
      focused: lineCase.focused,
      ...(monotoneFailure ?? {}),
    }), 'concrete-fixture')
    check(laws, 'getLineLayout non-focused neighbors do not overlap horizontally', nonFocusedNoOverlap, () => ({
      scenario: lineCase.label,
      focused: lineCase.focused,
      ...(overlapFailure ?? {}),
    }), 'concrete-fixture')

    for (let i = 0; i < itemRects.length; i++) {
      const itemRect = itemRects[i]!
      const expectedX = i === lineCase.focused ? (windowSizeX - itemRect.width) / 2 : expectedLeft
      if (Math.abs(itemRect.left - expectedX) > epsilon) {
        currentLeftAdvances = false
        currentLeftFailure ??= {
          scenario: lineCase.label,
          focused: lineCase.focused,
          itemIndex: i,
          actualX: itemRect.left,
          expectedX,
        }
      }
      expectedLeft = i === lineCase.focused ? windowSizeX - hitArea1DSizeX : expectedLeft + itemRect.width + boxes1DGapX
    }
    check(laws, 'getLineLayout advances currentLeft through non-focused items', currentLeftAdvances, () => ({
      scenario: lineCase.label,
      focused: lineCase.focused,
      ...(currentLeftFailure ?? {}),
    }), {kind: 'concrete-fixture', targets: ['getLineLayout.items[].layoutBox.x']})
  }
}

function verifyGetGridLayoutConcrete(
  sourceText: string,
  autoContractOverrides: Record<string, FunctionOverride>,
  laws: Map<string, InternalLawSummary>,
) {
  const analyzer = new LoweredProgramAnalyzer(sourceText, photoGalleryGlobals, autoContractOverrides)

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
    const rowsTopValues = rowsTop.items.map(value => expectConcreteNumber(value))
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
    let imageSizing = true
    let viewportFailure: null | Record<string, number | string> = null
    let overlapFailure: null | Record<string, number | string> = null
    let columnCenterFailure: null | Record<string, number | string> = null
    let imageSizingFailure: null | Record<string, number | string> = null
    const rowHeights = Array.from({length: rowCount}, () => 0)
    const itemRects: Array<{
      itemIndex: number
      row: number
      column: number
      rect: {left: number; top: number; width: number; height: number}
    }> = []
    for (let i = 0; i < items.items.length; i++) {
      const item = expectObject(items.items[i]!)
      const source = expectObject(layoutSources.items[i]!)
      const layoutBox = expectObject(getProp(item, 'layoutBox'))
      const imageBox = expectObject(getProp(item, 'imageBox'))
      const prompt = expectObject(getProp(item, 'prompt'))
      const promptBox = expectObject(getProp(prompt, 'box'))
      const left = expectConcreteNumber(getProp(layoutBox, 'x'))
      const layoutWidth = expectConcreteNumber(getProp(layoutBox, 'sizeX'))
      const layoutTop = expectConcreteNumber(getProp(layoutBox, 'y'))
      const layoutHeight = expectConcreteNumber(getProp(layoutBox, 'sizeY'))
      const right = left + expectConcreteNumber(getProp(layoutBox, 'sizeX'))
      const {row, column} = gridSlot(i, cols)
      const bottom = layoutTop + layoutHeight
      const layoutRect = {left, top: layoutTop, width: layoutWidth, height: layoutHeight}
      rowHeights[row] = Math.max(rowHeights[row] ?? 0, layoutHeight)
      itemRects.push({itemIndex: i, row, column, rect: layoutRect})
      maxBottom = Math.max(maxBottom, bottom)
      checkFact(laws, 'getGridLayout keeps each layout box inside viewport width as geometry facts', {
        kind: 'concrete-rect-x-within',
        rect: layoutRect,
        bounds: {left: 0, right: windowWidth},
        tolerance: epsilon,
      }, () => ({
        windowWidth,
        cols,
        itemIndex: i,
        row,
        column,
      }), {targets: [`getGridLayout.items.${i}.layoutBox`]})
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
      const ar = expectConcreteNumber(getProp(source, 'ar'))
      const naturalSizeX = expectConcreteNumber(getProp(source, 'naturalSizeX'))
      const expectedImage = expectedGridMeasurement(ar, naturalSizeX, boxMaxSizeX)
      const imageWidth = expectConcreteNumber(getProp(imageBox, 'sizeX'))
      const imageHeight = expectConcreteNumber(getProp(imageBox, 'sizeY'))
      if (
        Math.abs(imageWidth - expectedImage.imageSizeX) > epsilon ||
        Math.abs(imageHeight - expectedImage.imageSizeY) > epsilon
      ) {
        imageSizing = false
        imageSizingFailure ??= {
          windowWidth,
          cols,
          itemIndex: i,
          row,
          column,
          imageWidth,
          expectedImageWidth: expectedImage.imageSizeX,
          imageHeight,
          expectedImageHeight: expectedImage.imageSizeY,
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
        const nextTop = expectConcreteNumber(getProp(nextLayoutBox, 'y'))
        const nextWidth = expectConcreteNumber(getProp(nextLayoutBox, 'sizeX'))
        const nextHeight = expectConcreteNumber(getProp(nextLayoutBox, 'sizeY'))
        if (row === gridSlot(i + 1, cols).row) {
          checkFact(laws, 'getGridLayout row item boxes do not overlap horizontally as geometry facts', {
            kind: 'concrete-rects-do-not-overlap-x',
            left: layoutRect,
            right: {left: nextLeft, top: nextTop, width: nextWidth, height: nextHeight},
            tolerance: epsilon,
          }, () => ({
            windowWidth,
            cols,
            leftItemIndex: i,
            rightItemIndex: i + 1,
            row,
          }), {targets: [`getGridLayout.items.${i}.layoutBox`, `getGridLayout.items.${i + 1}.layoutBox`]})
        }
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

    let rowSpacing = true
    let verticalCentering = true
    let rowSpacingFailure: null | Record<string, number | string> = null
    let verticalCenteringFailure: null | Record<string, number | string> = null
    for (let row = 0; row < rowCount; row++) {
      const rowTop = rowsTopValues[row]
      const nextRowTop = rowsTopValues[row + 1]
      const rowHeight = rowHeights[row]
      if (rowTop == null || nextRowTop == null || rowHeight == null) {
        rowSpacing = false
        rowSpacingFailure ??= {
          windowWidth,
          cols,
          row,
          reason: 'missing row top or row height',
        }
        continue
      }
      const actualSpacing = nextRowTop - rowTop
      const expectedSpacing = rowHeight + boxesGapY
      if (Math.abs(actualSpacing - expectedSpacing) > epsilon) {
        rowSpacing = false
        rowSpacingFailure ??= {
          windowWidth,
          cols,
          row,
          actualSpacing,
          expectedSpacing,
          rowHeight,
        }
      }
    }
    for (const item of itemRects) {
      const rowTop = rowsTopValues[item.row]
      const rowHeight = rowHeights[item.row]
      if (rowTop == null || rowHeight == null) continue
      const expectedTop = rowTop + (rowHeight - item.rect.height) / 2
      if (Math.abs(item.rect.top - expectedTop) > epsilon) {
        verticalCentering = false
        verticalCenteringFailure ??= {
          windowWidth,
          cols,
          itemIndex: item.itemIndex,
          row: item.row,
          column: item.column,
          actualTop: item.rect.top,
          expectedTop,
          rowHeight,
          itemHeight: item.rect.height,
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
    check(laws, 'getGridLayout derives image sizes from aspect ratio caps', imageSizing, () => ({
      windowWidth,
      cols,
      ...(imageSizingFailure ?? {}),
    }), {kind: 'concrete-fixture', targets: ['getGridLayout.items[].imageBox.sizeX', 'getGridLayout.items[].imageBox.sizeY']})
    check(laws, 'getGridLayout spaces rowsTop by each row height plus vertical gap', rowSpacing, () => ({
      windowWidth,
      cols,
      ...(rowSpacingFailure ?? {}),
    }), {kind: 'concrete-fixture', targets: ['getGridLayout.rowsTop', 'getGridLayout.items[].layoutBox.sizeY']})
    check(laws, 'getGridLayout vertically centers items inside row slots', verticalCentering, () => ({
      windowWidth,
      cols,
      ...(verticalCenteringFailure ?? {}),
    }), {kind: 'concrete-fixture', targets: ['getGridLayout.items[].layoutBox.y', 'getGridLayout.rowsTop']})
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

function partitionWidthRangeByCols(analyzer: LoweredProgramAnalyzer, widthMin: number, widthMax: number) {
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

function expected1DMeasurement(
  ar: number,
  naturalSizeX: number,
  box1DMaxSizeX: number,
  box1DMaxSizeY: number,
  scaleFactor: number,
  promptVisibleHeight: number,
) {
  const promptAreaY = promptVisibleHeight + promptPaddingBottom
  const imgMaxSizeY = Math.max(1, box1DMaxSizeY - promptAreaY)
  const imageSizeX = Math.min(naturalSizeX, box1DMaxSizeX, imgMaxSizeY * ar) * scaleFactor
  const imageSizeY = imageSizeX / ar
  return {
    imageSizeX,
    imageSizeY,
    promptVisibleHeight,
    layoutHeight: imageSizeY + promptAreaY,
  }
}

function expected1DOverrideMeasurement(
  ar: number,
  naturalSizeX: number,
  box1DMaxSizeX: number,
  box1DMaxSizeY: number,
  scaleFactor: number,
) {
  const promptVisibleHeight = 24
  const imageSizeX = Math.min(naturalSizeX, box1DMaxSizeX, box1DMaxSizeY * ar) * scaleFactor
  const imageSizeY = imageSizeX / ar
  return {
    imageSizeX,
    imageSizeY,
    promptVisibleHeight,
    layoutHeight: imageSizeY + promptVisibleHeight + promptPaddingBottom,
  }
}

function expectedGridMeasurement(ar: number, naturalSizeX: number, boxMaxSizeX: number) {
  const imgMaxSizeY =
    ar === 1 ? boxMaxSizeX * 0.85
    : ar < 1 ? boxMaxSizeX * 1.05
    : boxMaxSizeX
  const imageSizeX = Math.min(naturalSizeX, boxMaxSizeX, imgMaxSizeY * ar)
  return {
    imageSizeX,
    imageSizeY: imageSizeX / ar,
  }
}

function getRangeObjectProp(object: RangeObjectValue, key: string) {
  return expectRangeObject(getRangeProp(object, key))
}

function getRangeNumberProp(object: RangeObjectValue, key: string) {
  return expectRangeNumber(getRangeProp(object, key))
}

function addRanges(left: RangeNumberValue, right: RangeNumberValue) {
  return {
    ...rangeNumber(left.min + right.min, left.max + right.max, left.isInteger && right.isInteger),
    expr: left.expr != null && right.expr != null ? addExpr(left.expr, right.expr) : null,
  }
}

function mulRange(value: RangeNumberValue, factor: number) {
  const products = [value.min * factor, value.max * factor]
  return {
    ...rangeNumber(Math.min(...products), Math.max(...products), value.isInteger && Number.isInteger(factor)),
    expr: value.expr != null ? mulExpr(value.expr, constExpr(factor)) : null,
  }
}

function divideRange(value: RangeNumberValue, divisor: number) {
  return {
    ...rangeNumber(value.min / divisor, value.max / divisor, false),
    expr: value.expr != null ? divExpr(value.expr, constExpr(divisor)) : null,
  }
}

function rangesEqual(left: RangeNumberValue, right: RangeNumberValue) {
  return (
    Math.abs(left.min - right.min) <= epsilon &&
    Math.abs(left.max - right.max) <= epsilon
  ) || (
    left.expr != null &&
    right.expr != null &&
    symbolicExprEquals(left.expr, right.expr)
  )
}

function describeRange(value: RangeNumberValue) {
  return `[${value.min},${value.max}]${value.isInteger ? ':int' : ''}`
}

function verifyColsBoxMaxSizeXFRange(analyzer: LoweredProgramAnalyzer, laws: Map<string, InternalLawSummary>) {
  const boxesGapX = analyzer.getGlobalNumber('boxesGapX')
  const cases = analyzer.evaluateFunctionRange('colsBoxMaxSizeXF', [rangeNumber(320, 1600, true)])
  const result = expectRangeObject(joinRangeCases(cases))
  const cols = expectRangeNumber(getRangeProp(result, 'cols'))
  const boxMaxSizeX = expectRangeNumber(getRangeProp(result, 'boxMaxSizeX'))

  check(laws, 'colsBoxMaxSizeXF keeps cols in supported range over width intervals', cols.min >= 1 && cols.max <= 7, () => ({
    colsMin: cols.min,
    colsMax: cols.max,
  }), 'range')
  check(laws, 'colsBoxMaxSizeXF keeps cols integral over width intervals', cols.isInteger, () => ({
    colsMin: cols.min,
    colsMax: cols.max,
    colsIsInteger: cols.isInteger ? 'true' : 'false',
  }), 'range')
  check(laws, 'colsBoxMaxSizeXF keeps boxMaxSizeX non-negative over width intervals', boxMaxSizeX.min >= -epsilon, () => ({
    boxMaxSizeXMin: boxMaxSizeX.min,
    boxMaxSizeXMax: boxMaxSizeX.max,
  }), 'range')

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
    }), {kind: 'range', targets: ['colsBoxMaxSizeXF.cols']})
    check(laws, 'colsBoxMaxSizeXF fills the horizontal track across width partitions', rangesEqual(
      filledWidth,
      rangeNumber(partition.widthMin, partition.widthMax, true),
    ), () => ({
      widthMin: partition.widthMin,
      widthMax: partition.widthMax,
      cols: partition.cols,
      filledWidth: describeRange(filledWidth),
    }), {kind: 'range', targets: ['colsBoxMaxSizeXF.boxMaxSizeX']})
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

  checkFact(laws, 'makeItemLayoutGeometry keeps image and layout x aligned', {
    kind: 'symbolic-equality',
    left: imageX,
    right: layoutX,
  }, () => ({
    imageX: formatScalarExpr(imageX),
    layoutX: formatScalarExpr(layoutX),
  }), {targets: ['makeItemLayoutGeometry.imageBox.x', 'makeItemLayoutGeometry.layoutBox.x']})
  checkFact(laws, 'makeItemLayoutGeometry keeps prompt x aligned with the image', {
    kind: 'symbolic-equality',
    left: promptX,
    right: imageX,
  }, () => ({
    imageX: formatScalarExpr(imageX),
    promptX: formatScalarExpr(promptX),
  }), {targets: ['makeItemLayoutGeometry.prompt.box.x', 'makeItemLayoutGeometry.imageBox.x']})
  checkFact(laws, 'makeItemLayoutGeometry puts the prompt directly below the image', {
    kind: 'symbolic-equality',
    left: promptY,
    right: addExpr(imageY, imageSizeY),
  }, () => ({
    promptY: formatScalarExpr(promptY),
    expectedPromptY: formatScalarExpr(addExpr(imageY, imageSizeY)),
  }), {targets: ['makeItemLayoutGeometry.prompt.box.y', 'makeItemLayoutGeometry.imageBox']})
  checkFact(laws, 'makeItemLayoutGeometry derives layout height from image height + prompt height + bottom padding', {
    kind: 'symbolic-equality',
    left: layoutSizeY,
    right: addExpr(addExpr(imageSizeY, promptSizeY), constExpr(promptPaddingBottom)),
  }, () => ({
    layoutSizeY: formatScalarExpr(layoutSizeY),
    expectedLayoutSizeY: formatScalarExpr(addExpr(addExpr(imageSizeY, promptSizeY), constExpr(promptPaddingBottom))),
  }), {targets: ['makeItemLayoutGeometry.layoutBox.sizeY']})
}

function verifyColsBoxMaxSizeXF(analyzer: LoweredProgramAnalyzer, laws: Map<string, InternalLawSummary>): StaticLayoutCandidateLaw[] {
  const boxesGapX = analyzer.getGlobalNumber('boxesGapX')
  const samples: StaticLayoutLawWitness[] = []
  let previousCols = 0
  let previousBoxMaxSizeX = Infinity
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
