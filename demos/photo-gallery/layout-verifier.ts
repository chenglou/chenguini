import {photoGalleryData} from './data'
import {
  boxesGapY,
  getGridLayout,
  getLineLayout,
  hitArea1DSizeX,
  makeLayoutSources,
  type GridLayoutModel,
  type LineLayoutModel,
  type Rect,
} from './layout-model'
import {promptPaddingBottom} from './prompt-layout'

type WitnessValue = boolean | number | string | null

export type LayoutLawWitness = Record<string, WitnessValue>

export type LayoutLawSummary = {
  name: string
  checks: number
  status: 'pass' | 'fail'
  firstFailure?: LayoutLawWitness
}

export type LayoutVerificationReport = {
  phase: 'ready' | 'error'
  suite: 'photo-gallery-layout'
  checkedGridWidths: number
  checkedLineCases: number
  laws: LayoutLawSummary[]
}

type InternalLawSummary = {
  name: string
  checks: number
  firstFailure: LayoutLawWitness | null
}

const epsilon = 0.0001
const layoutSources = makeLayoutSources(photoGalleryData)

export function runPhotoGalleryLayoutVerification(): LayoutVerificationReport {
  const laws = new Map<string, InternalLawSummary>()

  for (let width = 320; width <= 1600; width++) verifyGridLayout(laws, width)

  const lineWidths = [320, 375, 430, 768, 1024, 1440]
  const lineHeights = [480, 700, 900]
  const focusIndices = [...new Set([
    0,
    1,
    Math.floor(photoGalleryData.length / 2),
    Math.max(0, photoGalleryData.length - 2),
    photoGalleryData.length - 1,
  ])]
  for (const width of lineWidths) {
    for (const height of lineHeights) {
      for (const focused of focusIndices) verifyLineLayout(laws, width, height, focused)
    }
  }

  const lawSummaries = [...laws.values()].map(law => ({
    name: law.name,
    checks: law.checks,
    status: law.firstFailure == null ? 'pass' : 'fail',
    ...(law.firstFailure == null ? {} : {firstFailure: law.firstFailure}),
  })) satisfies LayoutLawSummary[]

  return {
    phase: lawSummaries.some(law => law.status === 'fail') ? 'error' : 'ready',
    suite: 'photo-gallery-layout',
    checkedGridWidths: 1600 - 320 + 1,
    checkedLineCases: lineWidths.length * lineHeights.length * focusIndices.length,
    laws: lawSummaries,
  }
}

function verifyGridLayout(laws: Map<string, InternalLawSummary>, windowWidth: number) {
  const layout = getGridLayout(layoutSources, windowWidth)
  check(laws, 'grid cols stay in supported range', 1 <= layout.cols && layout.cols <= 7, () => ({
    windowWidth,
    cols: layout.cols,
  }))
  check(laws, 'grid rowsTop is monotone', isStrictlyIncreasing(layout.rowsTop), () => ({
    windowWidth,
    rowsTop: layout.rowsTop.join(','),
  }))
  check(laws, 'grid content height matches the last row bottom plus bottom gap', gridContentHeightMatches(layout), () => ({
    windowWidth,
    contentHeight: layout.contentHeight,
    expectedContentHeight: expectedGridContentHeight(layout),
  }))

  for (let i = 0; i < layout.items.length; i++) {
    const item = layout.items[i]!
    const common = {
      windowWidth,
      itemIndex: i,
      id: photoGalleryData[i]!.id,
    }
    check(laws, 'grid layout boxes stay non-negative', rectIsNonNegative(item.layoutBox), () => ({
      ...common,
      layoutBoxWidth: item.layoutBox.sizeX,
      layoutBoxHeight: item.layoutBox.sizeY,
    }))
    check(laws, 'grid layout boxes stay within the viewport width', item.layoutBox.x >= -epsilon && rectRight(item.layoutBox) <= windowWidth + epsilon, () => ({
      ...common,
      layoutBoxLeft: item.layoutBox.x,
      layoutBoxRight: rectRight(item.layoutBox),
      viewportWidth: windowWidth,
    }))
    check(laws, 'grid hit areas match layout boxes', rectEquals(item.hitArea, item.layoutBox), () => ({
      ...common,
      hitAreaX: item.hitArea.x,
      hitAreaY: item.hitArea.y,
      hitAreaSizeX: item.hitArea.sizeX,
      hitAreaSizeY: item.hitArea.sizeY,
      layoutBoxX: item.layoutBox.x,
      layoutBoxY: item.layoutBox.y,
      layoutBoxSizeX: item.layoutBox.sizeX,
      layoutBoxSizeY: item.layoutBox.sizeY,
    }))
    check(laws, 'grid prompt boxes stay inside layout boxes', rectInside(item.layoutBox, item.prompt.box), () => ({
      ...common,
      layoutBoxLeft: item.layoutBox.x,
      layoutBoxTop: item.layoutBox.y,
      layoutBoxRight: rectRight(item.layoutBox),
      layoutBoxBottom: rectBottom(item.layoutBox),
      promptLeft: item.prompt.box.x,
      promptTop: item.prompt.box.y,
      promptRight: rectRight(item.prompt.box),
      promptBottom: rectBottom(item.prompt.box),
    }))
    check(laws, 'grid prompt boxes stay attached to image boxes', promptBoxStaysAttached(item), () => ({
      ...common,
      imageBottom: rectBottom(item.imageBox),
      promptTop: item.prompt.box.y,
      imageWidth: item.imageBox.sizeX,
      promptWidth: item.prompt.box.sizeX,
      layoutHeight: item.layoutBox.sizeY,
      expectedLayoutHeight: item.imageBox.sizeY + item.prompt.box.sizeY + promptPaddingBottom,
    }))
  }

  const rows = groupIntoRows(layout)
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
    const row = rows[rowIndex]!
    for (let i = 0; i < row.length - 1; i++) {
      const left = row[i]!
      const right = row[i + 1]!
      check(laws, 'grid row items do not overlap horizontally', rectRight(left.layoutBox) <= right.layoutBox.x + epsilon, () => ({
        windowWidth,
        rowIndex,
        leftItemId: photoGalleryData[left.index]!.id,
        rightItemId: photoGalleryData[right.index]!.id,
        leftRight: rectRight(left.layoutBox),
        rightLeft: right.layoutBox.x,
      }))
    }
    if (rowIndex < rows.length - 1) {
      const currentRowBottom = Math.max(...row.map(item => rectBottom(item.layoutBox)))
      const nextRowTop = Math.min(...rows[rowIndex + 1]!.map(item => item.layoutBox.y))
      check(laws, 'grid rows keep the configured vertical gap', currentRowBottom + boxesGapY <= nextRowTop + epsilon, () => ({
        windowWidth,
        rowIndex,
        currentRowBottom,
        nextRowTop,
        requiredGap: boxesGapY,
      }))
    }
  }
}

function verifyLineLayout(laws: Map<string, InternalLawSummary>, windowWidth: number, windowHeight: number, focused: number) {
  const scrollY = 123.5
  const layout = getLineLayout(layoutSources, focused, windowWidth, windowHeight, scrollY)
  check(laws, 'line item order stays monotone in x', lineItemsStayOrdered(layout), () => ({
    windowWidth,
    windowHeight,
    focused,
  }))
  check(laws, 'line focused image stays centered', lineFocusedImageCentered(layout, focused, windowWidth), () => ({
    windowWidth,
    windowHeight,
    focused,
    imageCenterX: rectCenterX(layout.items[focused]!.imageBox),
    expectedCenterX: windowWidth / 2,
  }))
  check(laws, 'line hit areas match the focused index', lineHitAreasMatchFocus(layout, focused, windowWidth, windowHeight, scrollY), () => ({
    windowWidth,
    windowHeight,
    focused,
    leftTargetIndex: layout.leftHitArea?.targetIndex ?? null,
    rightTargetIndex: layout.rightHitArea?.targetIndex ?? null,
    leftHitAreaWidth: layout.leftHitArea?.box.sizeX ?? null,
    rightHitAreaWidth: layout.rightHitArea?.box.sizeX ?? null,
  }))

  for (let i = 0; i < layout.items.length; i++) {
    const item = layout.items[i]!
    const common = {
      windowWidth,
      windowHeight,
      focused,
      itemIndex: i,
      id: photoGalleryData[i]!.id,
    }
    check(laws, 'line layout boxes stay non-negative', rectIsNonNegative(item.layoutBox), () => ({
      ...common,
      layoutBoxWidth: item.layoutBox.sizeX,
      layoutBoxHeight: item.layoutBox.sizeY,
    }))
    check(laws, 'line prompt boxes stay inside layout boxes', rectInside(item.layoutBox, item.prompt.box), () => ({
      ...common,
      layoutBoxLeft: item.layoutBox.x,
      layoutBoxTop: item.layoutBox.y,
      layoutBoxRight: rectRight(item.layoutBox),
      layoutBoxBottom: rectBottom(item.layoutBox),
      promptLeft: item.prompt.box.x,
      promptTop: item.prompt.box.y,
      promptRight: rectRight(item.prompt.box),
      promptBottom: rectBottom(item.prompt.box),
    }))
    check(laws, 'line prompt boxes stay attached to image boxes', promptBoxStaysAttached(item), () => ({
      ...common,
      imageBottom: rectBottom(item.imageBox),
      promptTop: item.prompt.box.y,
      imageWidth: item.imageBox.sizeX,
      promptWidth: item.prompt.box.sizeX,
      layoutHeight: item.layoutBox.sizeY,
      expectedLayoutHeight: item.imageBox.sizeY + item.prompt.box.sizeY + promptPaddingBottom,
    }))
  }
}

function check(
  laws: Map<string, InternalLawSummary>,
  name: string,
  passed: boolean,
  witness: () => LayoutLawWitness,
) {
  let law = laws.get(name)
  if (law == null) {
    law = {name, checks: 0, firstFailure: null}
    laws.set(name, law)
  }
  law.checks++
  if (!passed && law.firstFailure == null) law.firstFailure = witness()
}

function rectIsNonNegative(rect: Rect) {
  return rect.sizeX >= -epsilon && rect.sizeY >= -epsilon
}

function rectInside(outer: Rect, inner: Rect) {
  return (
    outer.x <= inner.x + epsilon &&
    outer.y <= inner.y + epsilon &&
    rectRight(inner) <= rectRight(outer) + epsilon &&
    rectBottom(inner) <= rectBottom(outer) + epsilon
  )
}

function rectEquals(a: Rect, b: Rect) {
  return (
    Math.abs(a.x - b.x) <= epsilon &&
    Math.abs(a.y - b.y) <= epsilon &&
    Math.abs(a.sizeX - b.sizeX) <= epsilon &&
    Math.abs(a.sizeY - b.sizeY) <= epsilon
  )
}

function rectRight(rect: Rect) {
  return rect.x + rect.sizeX
}

function rectBottom(rect: Rect) {
  return rect.y + rect.sizeY
}

function rectCenterX(rect: Rect) {
  return rect.x + rect.sizeX / 2
}

function promptBoxStaysAttached(item: {imageBox: Rect; layoutBox: Rect; prompt: {box: Rect}}) {
  return (
    Math.abs(item.prompt.box.x - item.imageBox.x) <= epsilon &&
    Math.abs(item.prompt.box.y - rectBottom(item.imageBox)) <= epsilon &&
    item.prompt.box.sizeX <= item.imageBox.sizeX + epsilon &&
    Math.abs(item.layoutBox.sizeY - (item.imageBox.sizeY + item.prompt.box.sizeY + promptPaddingBottom)) <= epsilon
  )
}

function isStrictlyIncreasing(values: number[]) {
  for (let i = 1; i < values.length; i++) if (!(values[i]! > values[i - 1]! + epsilon)) return false
  return true
}

function groupIntoRows(layout: GridLayoutModel) {
  const rows: Array<Array<{index: number; layoutBox: Rect}>> = []
  for (let i = 0; i < layout.items.length; i++) {
    const rowIndex = Math.floor(i / layout.cols)
    rows[rowIndex] ??= []
    rows[rowIndex].push({index: i, layoutBox: layout.items[i]!.layoutBox})
  }
  return rows
}

function expectedGridContentHeight(layout: GridLayoutModel) {
  if (layout.items.length === 0) return layout.rowsTop[0] ?? 0
  const lastItemBottom = Math.max(...layout.items.map(item => rectBottom(item.layoutBox)))
  return lastItemBottom + boxesGapY
}

function gridContentHeightMatches(layout: GridLayoutModel) {
  return Math.abs(layout.contentHeight - expectedGridContentHeight(layout)) <= epsilon
}

function lineItemsStayOrdered(layout: LineLayoutModel) {
  for (let i = 0; i < layout.items.length - 1; i++) {
    if (layout.items[i]!.imageBox.x > layout.items[i + 1]!.imageBox.x + epsilon) return false
  }
  return true
}

function lineFocusedImageCentered(layout: LineLayoutModel, focused: number, windowWidth: number) {
  return Math.abs(rectCenterX(layout.items[focused]!.imageBox) - windowWidth / 2) <= epsilon
}

function lineHitAreasMatchFocus(
  layout: LineLayoutModel,
  focused: number,
  windowWidth: number,
  windowHeight: number,
  scrollY: number,
) {
  const leftMatches =
    (focused === 0 && layout.leftHitArea == null) ||
    (
      focused > 0 &&
      layout.leftHitArea != null &&
      layout.leftHitArea.targetIndex === focused - 1 &&
      rectEquals(layout.leftHitArea.box, {x: 0, y: scrollY, sizeX: hitArea1DSizeX, sizeY: windowHeight})
    )
  const rightMatches =
    (focused === layout.items.length - 1 && layout.rightHitArea == null) ||
    (
      focused < layout.items.length - 1 &&
      layout.rightHitArea != null &&
      layout.rightHitArea.targetIndex === focused + 1 &&
      rectEquals(layout.rightHitArea.box, {x: windowWidth - hitArea1DSizeX, y: scrollY, sizeX: hitArea1DSizeX, sizeY: windowHeight})
    )
  return leftMatches && rightMatches
}
