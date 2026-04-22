import {type PhotoData} from './data'
import {
  measurePromptLayout,
  preparePrompt,
  prompt1DLineHeight,
  prompt1DMaxLines,
  prompt2DLineHeight,
  prompt2DMaxLines,
  promptPaddingBottom,
  promptPaddingTop,
  type PreparedPrompt,
  type PromptLine,
  type PromptLayout,
} from './prompt-layout'

// This file is the pure geometry model for photo-gallery.
// The demo renders it.

export type Rect = {
  x: number
  y: number
  sizeX: number
  sizeY: number
}

export type PromptGeometry = {
  box: Rect
  lineHeight: number
  lines: PromptLine[]
}

export type ItemLayoutGeometry = {
  imageBox: Rect
  layoutBox: Rect
  prompt: PromptGeometry
}

export type GridLayoutModel = {
  boxMaxSizeX: number
  cols: number
  contentHeight: number
  items: ItemLayoutGeometry[]
  rowsTop: number[]
}

export type EdgeHitArea = {
  box: Rect
  targetIndex: number
}

export type LineLayoutModel = {
  items: ItemLayoutGeometry[]
  leftHitArea: EdgeHitArea | null
  rightHitArea: EdgeHitArea | null
}

export type LayoutSource = {
  ar: number
  naturalSizeX: number
  preparedPrompt: PreparedPrompt
}

export const boxesGapX = 24
export const boxesGapY = 24
export const boxes1DGapX = 52
export const boxes1DGapY = 28
export const windowPaddingTop = 40
export const gapTopPeek = 40
export const hitArea1DSizeX = 100

export function rectContainsPoint(r: Rect, x: number, y: number) {
  return r.x <= x && x < r.x + r.sizeX && r.y <= y && y < r.y + r.sizeY
}

/** @fit
 * given data.length: int 0..1000
 * result.length == data.length
 */
export function makeLayoutSources(data: Pick<PhotoData, 'w' | 'h' | 'prompt'>[]): LayoutSource[] {
  return data.map(d => ({
    ar: d.w / d.h,
    naturalSizeX: d.w,
    preparedPrompt: preparePrompt(d.prompt),
  }))
}

/** @fit
 * given max >= min
 * result >= min
 * result <= max
 */
function clamp(
  min: number, // @fit -100000..100000
  v: number, // @fit -100000..100000
  max: number, // @fit -100000..100000
) {
  return v > max ? max : v < min ? min : v
}

export function colsBoxMaxSizeXF(
  containerSizeX: number, // @fit 320..2000
) {
  const boxMinSizeX = 220
  const cols = clamp(1, Math.floor((containerSizeX - boxesGapX) / (boxMinSizeX + boxesGapX)), 7)
  const boxMaxSizeX = (containerSizeX - boxesGapX - cols * boxesGapX) / cols
  return {
    cols, // @fit int 1..7
    boxMaxSizeX, // @fit 0..2000
  }
}

/** @fit
 * result: 0..2100
 */
function gridImageMaxSizeY(
  ar: number, // @fit 0.1..10
  boxMaxSizeX: number, // @fit 0..2000
) {
  return ar === 1 ? boxMaxSizeX * 0.85
    : ar < 1 ? boxMaxSizeX * 1.05
    : boxMaxSizeX
}

/** @fit
 * result: 0..2000
 * result <= naturalSizeX
 * result <= boxMaxSizeX
 */
function gridImageSizeX(
  naturalSizeX: number, // @fit 0..10000
  boxMaxSizeX: number, // @fit 0..2000
  aspectSizeX: number, // @fit 0..21000
) {
  const cappedByBox = Math.min(naturalSizeX, boxMaxSizeX)
  return Math.min(cappedByBox, aspectSizeX)
}

/** @fit
 * result.imageSizeX <= naturalSizeX
 * result.imageSizeX <= boxMaxSizeX
 */
function measureGridImage(
  ar: number, // @fit 0.1..10
  naturalSizeX: number, // @fit 0..10000
  boxMaxSizeX: number, // @fit 0..2000
) {
  const imgMaxSizeY = gridImageMaxSizeY(ar, boxMaxSizeX)
  const imageSizeX = gridImageSizeX(naturalSizeX, boxMaxSizeX, imgMaxSizeY * ar)
  const imageSizeY = imageSizeX / ar
  return {
    imageSizeX, // @fit 0..2000
    imageSizeY, // @fit 0..20000
  }
}

/** @fit
 * given layoutSources.length: int 0..1000
 * given layoutSources[].ar: 0.1..10
 * given layoutSources[].naturalSizeX: 0..10000
 */
export function getGridLayout(
  layoutSources: LayoutSource[],
  windowSizeX: number, // @fit 320..2000
): GridLayoutModel {
  const {cols, boxMaxSizeX} = colsBoxMaxSizeXF(windowSizeX)
  const rowsTop: number[] = [windowPaddingTop]
  const rowHeights: number[] = []
  const measurements: Array<{
    imageSizeX: number
    imageSizeY: number
    layoutHeight: number
    promptLayout: PromptLayout
  }> = []
  let rowHeight = 0

  for (let i = 0; i < layoutSources.length; i++) {
    const source = layoutSources[i]!
    const ar = source.ar
    const {imageSizeX, imageSizeY} = measureGridImage(ar, source.naturalSizeX, boxMaxSizeX)
    const promptLayout = measurePromptLayout(source.preparedPrompt, imageSizeX, prompt2DMaxLines, prompt2DLineHeight)
    const layoutHeight = imageSizeY + promptLayout.visibleHeight + promptPaddingBottom
    measurements.push({
      imageSizeX,
      imageSizeY,
      layoutHeight,
      promptLayout,
    })
    rowHeight = Math.max(rowHeight, layoutHeight)
    if (i % cols === cols - 1 || i === layoutSources.length - 1) {
      rowHeights.push(rowHeight)
      rowsTop.push(rowsTop.at(-1)! + rowHeight + boxesGapY)
      rowHeight = 0
    }
  }

  return {
    boxMaxSizeX,
    cols,
    contentHeight: rowsTop.at(-1)!,
    items: measurements.map((measurement, i) => {
      const currentRow = Math.floor(i / cols)
      const x = boxesGapX + (boxMaxSizeX + boxesGapX) * (i % cols) + (boxMaxSizeX - measurement.imageSizeX) / 2
      const y = rowsTop[currentRow]! + (rowHeights[currentRow]! - measurement.layoutHeight) / 2
      return makeItemLayoutGeometry(
        x,
        y,
        measurement.imageSizeX,
        measurement.imageSizeY,
        measurement.promptLayout,
        prompt2DLineHeight,
      )
    }),
    rowsTop,
  }
}

/** @fit
 * result.box1DMaxSizeX == windowSizeX - boxes1DGapX * 2 - hitArea1DSizeX * 2
 * result.box1DMaxSizeY == windowSizeY - windowPaddingTop - boxes1DGapY
 */
function lineBoxMaxSizes(
  windowSizeX: number, // @fit 320..2000
  windowSizeY: number, // @fit 320..2000
) {
  return {
    box1DMaxSizeX: windowSizeX - boxes1DGapX * 2 - hitArea1DSizeX * 2, // @fit 16..1696
    box1DMaxSizeY: windowSizeY - windowPaddingTop - boxes1DGapY, // @fit 252..1932
  }
}

/** @fit
 * given layoutHeight <= windowSizeY - windowPaddingTop - boxes1DGapY
 * result >= scrollY + windowPaddingTop
 * result + layoutHeight <= scrollY + windowSizeY - boxes1DGapY
 */
function lineLayoutY(
  layoutHeight: number, // @fit 0..10000
  windowSizeY: number, // @fit 320..2000
  scrollY: number, // @fit -100000..100000
) {
  return Math.max(windowPaddingTop, (windowSizeY - layoutHeight) / 2) + scrollY
}

/** @fit
 * result.targetIndex == focused - 1
 * result.box.x == 0
 * result.box.y == scrollY
 * result.box.sizeX == hitArea1DSizeX
 * result.box.sizeY == windowSizeY
 */
function leftEdgeHitArea(
  focused: number, // @fit int 1..1000
  scrollY: number, // @fit -100000..100000
  windowSizeY: number, // @fit 320..2000
): EdgeHitArea {
  return {
    box: {x: 0, y: scrollY, sizeX: hitArea1DSizeX, sizeY: windowSizeY},
    targetIndex: focused - 1, // @fit int 0..999
  }
}

/** @fit
 * result.targetIndex == focused + 1
 * result.box.x == windowSizeX - hitArea1DSizeX
 * result.box.y == scrollY
 * result.box.sizeX == hitArea1DSizeX
 * result.box.sizeY == windowSizeY
 */
function rightEdgeHitArea(
  focused: number, // @fit int 0..999
  windowSizeX: number, // @fit 320..2000
  scrollY: number, // @fit -100000..100000
  windowSizeY: number, // @fit 320..2000
): EdgeHitArea {
  return {
    box: {x: windowSizeX - hitArea1DSizeX, y: scrollY, sizeX: hitArea1DSizeX, sizeY: windowSizeY},
    targetIndex: focused + 1, // @fit int 1..1000
  }
}

export function getLineLayout(
  layoutSources: LayoutSource[],
  focused: number,
  windowSizeX: number, // @fit 320..2000
  windowSizeY: number, // @fit 320..2000
  scrollY: number,
): LineLayoutModel {
  const {box1DMaxSizeX, box1DMaxSizeY} = lineBoxMaxSizes(windowSizeX, windowSizeY)
  const measurements = layoutSources.map((source, i) =>
    get1DItemSize(source, box1DMaxSizeX, box1DMaxSizeY, i === focused ? 1 : 0.7))

  let currentLeft = hitArea1DSizeX + boxes1DGapX
  for (let i = focused - 1; i >= 0; i--) currentLeft -= measurements[i]!.imageSizeX + boxes1DGapX

  const items: ItemLayoutGeometry[] = []
  for (let i = 0; i < layoutSources.length; i++) {
    const measurement = measurements[i]!
    const x = i === focused ? (windowSizeX - measurement.imageSizeX) / 2 : currentLeft
    const y = lineLayoutY(measurement.layoutHeight, windowSizeY, scrollY)
    items.push(makeItemLayoutGeometry(
      x,
      y,
      measurement.imageSizeX,
      measurement.imageSizeY,
      measurement.promptLayout,
      prompt1DLineHeight,
    ))
    currentLeft = i === focused ? windowSizeX - hitArea1DSizeX : currentLeft + measurement.imageSizeX + boxes1DGapX
  }

  return {
    items,
    leftHitArea: focused > 0 ? leftEdgeHitArea(focused, scrollY, windowSizeY) : null,
    rightHitArea: focused < layoutSources.length - 1 ? rightEdgeHitArea(focused, windowSizeX, scrollY, windowSizeY) : null,
  }
}

/** @fit
 * given promptLayout.width: 0..10000
 * given promptLayout.visibleHeight: 0..10000
 * result.imageBox.sizeX == imageSizeX
 * result.imageBox.sizeY == imageSizeY
 * result.layoutBox.sizeY == imageSizeY + promptLayout.visibleHeight + promptPaddingBottom
 * result.prompt.box.y == y + imageSizeY
 * result.prompt.box.sizeX == promptLayout.width
 * result.prompt.box.sizeY == promptLayout.visibleHeight
 * result.prompt.lines == promptLayout.lines
 */
function makeItemLayoutGeometry(
  x: number, // @fit -10000..10000
  y: number, // @fit -10000..10000
  imageSizeX: number, // @fit 0..10000
  imageSizeY: number, // @fit 0..10000
  promptLayout: PromptLayout,
  promptLineHeight: number,
): ItemLayoutGeometry {
  const imageBox = {x, y, sizeX: imageSizeX, sizeY: imageSizeY}
  const layoutBox = {x, y, sizeX: imageSizeX, sizeY: imageSizeY + promptLayout.visibleHeight + promptPaddingBottom}
  return {
    imageBox,
    layoutBox,
    prompt: {
      box: {x, y: y + imageSizeY, sizeX: promptLayout.width, sizeY: promptLayout.visibleHeight},
      lineHeight: promptLineHeight,
      lines: promptLayout.lines,
    },
  }
}

function get1DItemSize(
  source: LayoutSource,
  box1DMaxSizeX: number,
  box1DMaxSizeY: number,
  scaleFactor: number,
) {
  let promptAreaY = promptPaddingTop + prompt1DLineHeight * prompt1DMaxLines + promptPaddingBottom
  while (true) {
    const imgMaxSizeY = Math.max(1, box1DMaxSizeY - promptAreaY)
    const imageSizeX = Math.min(source.naturalSizeX, box1DMaxSizeX, imgMaxSizeY * source.ar) * scaleFactor
    const promptLayout = measurePromptLayout(source.preparedPrompt, imageSizeX, prompt1DMaxLines, prompt1DLineHeight)
    const nextPromptAreaY = promptLayout.visibleHeight + promptPaddingBottom
    if (nextPromptAreaY === promptAreaY) {
      return {
        imageSizeX,
        imageSizeY: imageSizeX / source.ar,
        promptLayout,
        layoutHeight: imageSizeX / source.ar + nextPromptAreaY,
      }
    }
    promptAreaY = nextPromptAreaY
  }
}
