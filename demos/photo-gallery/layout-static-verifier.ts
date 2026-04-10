import {prompt1DLineHeight, prompt2DLineHeight, prompt2DMaxLines, promptPaddingBottom} from './prompt-layout'
import {
  addExpr,
  buildStaticLayoutReport,
  check,
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
  expectRangeNumber,
  expectRangeObject,
  expectSymbolicNumber,
  formatScalarExpr,
  getProp,
  getRangeProp,
  type InternalLawSummary,
  joinRangeCases,
  LoweredProgramAnalyzer,
  rangeNumber,
  type StaticLayoutVerificationReport,
  symbolicExprEquals,
  symbolicNumber,
  symbolicObject,
  symbolicOpaque,
  type Value,
} from '../layout-static-core'

export function runPhotoGalleryStaticVerification(sourceText: string): StaticLayoutVerificationReport {
  const analyzer = new LoweredProgramAnalyzer(sourceText, {
    prompt1DLineHeight,
    prompt2DLineHeight,
    prompt2DMaxLines,
    promptPaddingBottom,
  })
  const laws = new Map<string, InternalLawSummary>()

  verifyMakeItemLayoutGeometry(analyzer, laws)
  verifyGetLineLayoutConcrete(sourceText, laws)
  verifyGetGridLayoutConcrete(sourceText, laws)
  verifyColsBoxMaxSizeXFRange(analyzer, laws)
  verifyColsBoxMaxSizeXF(analyzer, laws)

  return buildStaticLayoutReport('photo-gallery-static-layout', 'demos/photo-gallery/layout-model.ts', laws)
}

function verifyGetLineLayoutConcrete(sourceText: string, laws: Map<string, InternalLawSummary>) {
  const analyzer = new LoweredProgramAnalyzer(sourceText, {
    prompt1DLineHeight,
    prompt2DLineHeight,
    prompt2DMaxLines,
    promptPaddingBottom,
  }, {
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
    }))
    if (returns.length !== 1) continue

    const layout = expectObject(returns[0]!.value)
    const items = expectArray(getProp(layout, 'items'))
    const leftHitArea = getProp(layout, 'leftHitArea')
    const rightHitArea = getProp(layout, 'rightHitArea')

    check(laws, 'getLineLayout preserves item count', items.items.length === layoutSources.items.length, () => ({
      scenario: lineCase.label,
      itemCount: items.items.length,
      expectedItemCount: layoutSources.items.length,
    }))

    const focusedItem = expectObject(items.items[lineCase.focused]!)
    const focusedImageBox = expectObject(getProp(focusedItem, 'imageBox'))
    const focusedCenterX = expectConcreteNumber(getProp(focusedImageBox, 'x')) + expectConcreteNumber(getProp(focusedImageBox, 'sizeX')) / 2
    check(laws, 'getLineLayout keeps the focused image centered', Math.abs(focusedCenterX - windowSizeX / 2) <= epsilon, () => ({
      scenario: lineCase.label,
      focused: lineCase.focused,
      focusedCenterX,
      expectedCenterX: windowSizeX / 2,
    }))

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
    }))
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
    }))

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
    }))
  }
}

function verifyGetGridLayoutConcrete(sourceText: string, laws: Map<string, InternalLawSummary>) {
  const analyzer = new LoweredProgramAnalyzer(sourceText, {
    prompt1DLineHeight,
    prompt2DLineHeight,
    prompt2DMaxLines,
    promptPaddingBottom,
  }, {
    measurePromptLayout: {
      evaluate(args, mode) {
        if (mode !== 'concrete') throw new Error('measurePromptLayout override only supports concrete mode')
        const width = expectConcreteNumber(args[1]!)
        const lineHeight = expectConcreteNumber(args[3]!)
        const visibleHeight = lineHeight * 2
        return [{
          constraints: [],
          value: concreteObject({
            width: concreteNumber(width),
            visibleHeight: concreteNumber(visibleHeight),
            lines: concreteArray([]),
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
    concreteObject({ar: concreteNumber(0.5), naturalSizeX: concreteNumber(360), preparedPrompt: concreteNull('concrete')}),
    concreteObject({ar: concreteNumber(1.2), naturalSizeX: concreteNumber(640), preparedPrompt: concreteNull('concrete')}),
  ])

  const windowWidths = [520, 760, 1100]
  const boxesGapY = analyzer.getGlobalNumber('boxesGapY')

  for (const windowWidth of windowWidths) {
    const returns = analyzer.evaluateFunction('getGridLayout', [
      layoutSources,
      concreteNumber(windowWidth),
    ], 'concrete')
    check(laws, 'getGridLayout stays branch-free per concrete width', returns.length === 1, () => ({
      windowWidth,
      cases: returns.length,
    }))
    if (returns.length !== 1) continue

    const layout = expectObject(returns[0]!.value)
    const items = expectArray(getProp(layout, 'items'))
    const rowsTop = expectArray(getProp(layout, 'rowsTop'))
    const cols = expectConcreteNumber(getProp(layout, 'cols'))
    const contentHeight = expectConcreteNumber(getProp(layout, 'contentHeight'))

    check(laws, 'getGridLayout preserves item count', items.items.length === layoutSources.items.length, () => ({
      windowWidth,
      itemCount: items.items.length,
      expectedItemCount: layoutSources.items.length,
    }))
    check(laws, 'getGridLayout rowsTop stays monotone', concreteNumberArrayIsStrictlyIncreasing(rowsTop), () => ({
      windowWidth,
      rowsTop: describeNumericArray(rowsTop),
    }))

    const rowCount = Math.ceil(items.items.length / cols)
    check(laws, 'getGridLayout rowsTop count matches the row count plus trailing bottom', rowsTop.items.length === rowCount + 1, () => ({
      windowWidth,
      cols,
      rowsTopCount: rowsTop.items.length,
      expectedRowsTopCount: rowCount + 1,
    }))

    let maxBottom = 0
    let withinViewport = true
    let horizontalNonOverlap = true
    for (let i = 0; i < items.items.length; i++) {
      const item = expectObject(items.items[i]!)
      const layoutBox = expectObject(getProp(item, 'layoutBox'))
      const prompt = expectObject(getProp(item, 'prompt'))
      const promptBox = expectObject(getProp(prompt, 'box'))
      const left = expectConcreteNumber(getProp(layoutBox, 'x'))
      const right = left + expectConcreteNumber(getProp(layoutBox, 'sizeX'))
      const bottom = expectConcreteNumber(getProp(layoutBox, 'y')) + expectConcreteNumber(getProp(layoutBox, 'sizeY'))
      maxBottom = Math.max(maxBottom, bottom)
      if (left < -epsilon || right > windowWidth + epsilon) withinViewport = false
      if (expectConcreteNumber(getProp(promptBox, 'sizeX')) > expectConcreteNumber(getProp(layoutBox, 'sizeX')) + epsilon) withinViewport = false

      if (i % cols !== cols - 1 && i < items.items.length - 1) {
        const next = expectObject(items.items[i + 1]!)
        const nextLayoutBox = expectObject(getProp(next, 'layoutBox'))
        const nextLeft = expectConcreteNumber(getProp(nextLayoutBox, 'x'))
        if (right > nextLeft + epsilon && Math.floor(i / cols) === Math.floor((i + 1) / cols)) horizontalNonOverlap = false
      }
    }

    check(laws, 'getGridLayout keeps layout boxes within the viewport width', withinViewport, () => ({
      windowWidth,
      cols,
    }))
    check(laws, 'getGridLayout row items do not overlap horizontally', horizontalNonOverlap, () => ({
      windowWidth,
      cols,
    }))
    check(laws, 'getGridLayout content height matches the last row bottom plus bottom gap', Math.abs(contentHeight - (maxBottom + boxesGapY)) <= epsilon, () => ({
      windowWidth,
      contentHeight,
      expectedContentHeight: maxBottom + boxesGapY,
    }))
  }
}

function verifyColsBoxMaxSizeXFRange(analyzer: LoweredProgramAnalyzer, laws: Map<string, InternalLawSummary>) {
  const cases = analyzer.evaluateFunctionRange('colsBoxMaxSizeXF', [rangeNumber(320, 1600, true)])
  const result = expectRangeObject(joinRangeCases(cases))
  const cols = expectRangeNumber(getRangeProp(result, 'cols'))
  const boxMaxSizeX = expectRangeNumber(getRangeProp(result, 'boxMaxSizeX'))

  check(laws, 'colsBoxMaxSizeXF keeps cols in supported range over width intervals', cols.min >= 1 && cols.max <= 7, () => ({
    colsMin: cols.min,
    colsMax: cols.max,
  }))
  check(laws, 'colsBoxMaxSizeXF keeps cols integral over width intervals', cols.isInteger, () => ({
    colsMin: cols.min,
    colsMax: cols.max,
    colsIsInteger: cols.isInteger ? 'true' : 'false',
  }))
  check(laws, 'colsBoxMaxSizeXF keeps boxMaxSizeX non-negative over width intervals', boxMaxSizeX.min >= -epsilon, () => ({
    boxMaxSizeXMin: boxMaxSizeX.min,
    boxMaxSizeXMax: boxMaxSizeX.max,
  }))
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
  }))
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
  }))
  check(laws, 'makeItemLayoutGeometry keeps prompt x aligned with the image', symbolicExprEquals(promptX, imageX), () => ({
    imageX: formatScalarExpr(imageX),
    promptX: formatScalarExpr(promptX),
  }))
  check(laws, 'makeItemLayoutGeometry puts the prompt directly below the image', symbolicExprEquals(
    promptY,
    addExpr(imageY, imageSizeY),
  ), () => ({
    promptY: formatScalarExpr(promptY),
    expectedPromptY: formatScalarExpr(addExpr(imageY, imageSizeY)),
  }))
  check(laws, 'makeItemLayoutGeometry derives layout height from image height + prompt height + bottom padding', symbolicExprEquals(
    layoutSizeY,
    addExpr(addExpr(imageSizeY, promptSizeY), constExpr(promptPaddingBottom)),
  ), () => ({
    layoutSizeY: formatScalarExpr(layoutSizeY),
    expectedLayoutSizeY: formatScalarExpr(addExpr(addExpr(imageSizeY, promptSizeY), constExpr(promptPaddingBottom))),
  }))
}

function verifyColsBoxMaxSizeXF(analyzer: LoweredProgramAnalyzer, laws: Map<string, InternalLawSummary>) {
  const boxesGapX = analyzer.getGlobalNumber('boxesGapX')
  for (let containerSizeX = 320; containerSizeX <= 1600; containerSizeX++) {
    const cases = analyzer.evaluateFunction('colsBoxMaxSizeXF', [concreteNumber(containerSizeX)], 'concrete')
    check(laws, 'colsBoxMaxSizeXF stays branch-free per concrete width', cases.length === 1, () => ({
      containerSizeX,
      cases: cases.length,
    }))
    if (cases.length !== 1) continue

    const result = expectObject(cases[0]!.value)
    const cols = expectConcreteNumber(getProp(result, 'cols'))
    const boxMaxSizeX = expectConcreteNumber(getProp(result, 'boxMaxSizeX'))
    const filledWidth = boxesGapX + cols * boxesGapX + cols * boxMaxSizeX

    check(laws, 'colsBoxMaxSizeXF keeps cols in the supported range', 1 <= cols && cols <= 7, () => ({
      containerSizeX,
      cols,
    }))
    check(laws, 'colsBoxMaxSizeXF keeps cols integral', Math.abs(cols - Math.round(cols)) <= epsilon, () => ({
      containerSizeX,
      cols,
    }))
    check(laws, 'colsBoxMaxSizeXF keeps boxMaxSizeX non-negative', boxMaxSizeX >= -epsilon, () => ({
      containerSizeX,
      cols,
      boxMaxSizeX,
    }))
    check(laws, 'colsBoxMaxSizeXF exactly fills the horizontal track', Math.abs(filledWidth - containerSizeX) <= epsilon, () => ({
      containerSizeX,
      cols,
      boxMaxSizeX,
      filledWidth,
    }))
  }
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
