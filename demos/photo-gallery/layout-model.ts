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
  occlusionBounds: Rect
  prompt: PromptGeometry
}

export type GridLayoutModel = {
  boxMaxSizeX: number
  cols: number
  contentHeight: number
  items: Array<ItemLayoutGeometry & {hitArea: Rect}>
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

/** @fit
 * result.x == x
 * result.y == y
 * result.sizeX == sizeX
 * result.sizeY == sizeY
 */
export function rect(x: number, y: number, sizeX: number, sizeY: number): Rect {
  return {x, y, sizeX, sizeY}
}

export function rectContainsPoint(r: Rect, x: number, y: number) {
  return r.x <= x && x < r.x + r.sizeX && r.y <= y && y < r.y + r.sizeY
}

export function makeLayoutSources(data: Pick<PhotoData, 'w' | 'h' | 'prompt'>[]): LayoutSource[] {
  return data.map(d => ({
    ar: d.w / d.h,
    naturalSizeX: d.w,
    preparedPrompt: preparePrompt(d.prompt),
  }))
}

/** @fit
 * given min: number[-100000, 100000]
 * given v: number[-100000, 100000]
 * given max: number[-100000, 100000]
 * given max >= min
 * result >= min
 * result <= max
 */
function clamp(min: number, v: number, max: number) {
  return v > max ? max : v < min ? min : v
}

/** @fit
 * given containerSizeX: number[320, 2000]
 * result.cols >= 1
 * result.boxMaxSizeX: number[0, 2000]
 */
export function colsBoxMaxSizeXF(containerSizeX: number) {
  const boxMinSizeX = 220
  const cols = clamp(1, Math.floor((containerSizeX - boxesGapX) / (boxMinSizeX + boxesGapX)), 7)
  const boxMaxSizeX = (containerSizeX - boxesGapX - cols * boxesGapX) / cols
  return {cols, boxMaxSizeX}
}

export function getGridLayout(layoutSources: LayoutSource[], windowSizeX: number): GridLayoutModel {
  const {cols, boxMaxSizeX} = colsBoxMaxSizeXF(windowSizeX)
  const rowsTop: number[] = [windowPaddingTop]
  const rowHeights: number[] = []
  const measurements: Array<{
    ar: number
    imageSizeX: number
    imageSizeY: number
    layoutHeight: number
    promptLayout: PromptLayout
  }> = []
  let rowHeight = 0

  for (let i = 0; i < layoutSources.length; i++) {
    const source = layoutSources[i]!
    const ar = source.ar
    const imgMaxSizeY =
      ar === 1 ? boxMaxSizeX * 0.85
      : ar < 1 ? boxMaxSizeX * 1.05
      : boxMaxSizeX
    const imageSizeX = Math.min(source.naturalSizeX, boxMaxSizeX, imgMaxSizeY * ar)
    const imageSizeY = imageSizeX / ar
    const promptLayout = measurePromptLayout(source.preparedPrompt, imageSizeX, prompt2DMaxLines, prompt2DLineHeight, true)
    const layoutHeight = imageSizeY + promptLayout.visibleHeight + promptPaddingBottom
    measurements.push({
      ar,
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
      const geometry = makeItemLayoutGeometry(
        x,
        y,
        measurement.imageSizeX,
        measurement.imageSizeY,
        measurement.promptLayout,
        prompt2DLineHeight,
      )
      return {
        ...geometry,
        hitArea: geometry.layoutBox,
      }
    }),
    rowsTop,
  }
}

export function getLineLayout(
  layoutSources: LayoutSource[],
  focused: number,
  windowSizeX: number,
  windowSizeY: number,
  scrollY: number,
): LineLayoutModel {
  const box1DMaxSizeY = windowSizeY - windowPaddingTop - boxes1DGapY
  const box1DMaxSizeX = windowSizeX - boxes1DGapX * 2 - hitArea1DSizeX * 2
  const measurements = layoutSources.map((source, i) =>
    get1DItemSize(source, box1DMaxSizeX, box1DMaxSizeY, i === focused ? 1 : 0.7))

  let currentLeft = hitArea1DSizeX + boxes1DGapX
  for (let i = focused - 1; i >= 0; i--) currentLeft -= measurements[i]!.imageSizeX + boxes1DGapX

  const items: ItemLayoutGeometry[] = []
  for (let i = 0; i < layoutSources.length; i++) {
    const measurement = measurements[i]!
    const x = i === focused ? (windowSizeX - measurement.imageSizeX) / 2 : currentLeft
    const y = Math.max(windowPaddingTop, (windowSizeY - measurement.layoutHeight) / 2) + scrollY
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
    leftHitArea: focused > 0 ? {box: rect(0, scrollY, hitArea1DSizeX, windowSizeY), targetIndex: focused - 1} : null,
    rightHitArea: focused < layoutSources.length - 1 ? {box: rect(windowSizeX - hitArea1DSizeX, scrollY, hitArea1DSizeX, windowSizeY), targetIndex: focused + 1} : null,
  }
}

/** @fit
 * given x: number[-10000, 10000]
 * given y: number[-10000, 10000]
 * given imageSizeX: number[0, 10000]
 * given imageSizeY: number[0, 10000]
 * given promptLayout.width: number[0, 10000]
 * given promptLayout.visibleHeight: number[0, 10000]
 * given promptLineHeight: number[0, 1000]
 * result.imageBox.x == x
 * result.imageBox.y == y
 * result.imageBox.sizeX == imageSizeX
 * result.imageBox.sizeY == imageSizeY
 * result.layoutBox.sizeX == imageSizeX
 * result.prompt.box.x == x
 * result.prompt.box.y == y + imageSizeY
 * result.prompt.box.sizeX == promptLayout.width
 * result.prompt.box.sizeY == promptLayout.visibleHeight
 * result.prompt.lineHeight == promptLineHeight
 */
function makeItemLayoutGeometry(
  x: number,
  y: number,
  imageSizeX: number,
  imageSizeY: number,
  promptLayout: PromptLayout,
  promptLineHeight: number,
): ItemLayoutGeometry {
  const imageBox = rect(x, y, imageSizeX, imageSizeY)
  const layoutBox = rect(x, y, imageSizeX, imageSizeY + promptLayout.visibleHeight + promptPaddingBottom)
  return {
    imageBox,
    layoutBox,
    occlusionBounds: layoutBox,
    prompt: {
      box: rect(x, y + imageSizeY, promptLayout.width, promptLayout.visibleHeight),
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
    const promptLayout = measurePromptLayout(source.preparedPrompt, imageSizeX, prompt1DMaxLines, prompt1DLineHeight, false)
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
