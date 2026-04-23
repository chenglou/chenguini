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
  rows: GridRow[]
}

export type GridRow = {
  top: number
  height: number
  bottom: number
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

function gridImageMaxSizeY(
  ar: number, // @fit 0.1..10
  boxMaxSizeX: number, // @fit 0..2000
) {
  // @fit 0..2100
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
  const rows: GridRow[] = []
  const measurements: Array<{
    imageSizeX: number
    imageSizeY: number
    layoutHeight: number
    promptLayout: PromptLayout
  }> = []
  let nextRowTop = windowPaddingTop
  let rowHeight = 0

  /** @fit
   * rows.length <= layoutSources.length
   * rows[].bottom == rows[].top + rows[].height
   * spaced(rows, boxesGapY)
   */
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
      const top = nextRowTop
      const bottom = top + rowHeight
      rows.push({top, height: rowHeight, bottom})
      nextRowTop = bottom + boxesGapY
      rowHeight = 0
    }
  }

  return {
    boxMaxSizeX,
    cols,
    contentHeight: nextRowTop,
    items: measurements.map((measurement, i) => {
      const currentRow = Math.floor(i / cols)
      const row = rows[currentRow]!
      const x = boxesGapX + (boxMaxSizeX + boxesGapX) * (i % cols) + (boxMaxSizeX - measurement.imageSizeX) / 2
      const y = row.top + (row.height - measurement.layoutHeight) / 2
      return makeItemLayoutGeometry(
        x,
        y,
        measurement.imageSizeX,
        measurement.imageSizeY,
        measurement.promptLayout,
        prompt2DLineHeight,
      )
    }),
    rows,
  }
}

function lineBoxMaxSizes(
  windowSizeX: number, // @fit 320..2000
  windowSizeY: number, // @fit 320..2000
) {
  return {
    // @fit == windowSizeX - boxes1DGapX * 2 - hitArea1DSizeX * 2
    box1DMaxSizeX: windowSizeX - boxes1DGapX * 2 - hitArea1DSizeX * 2, // @fit 16..1696
    // @fit == windowSizeY - windowPaddingTop - boxes1DGapY
    box1DMaxSizeY: windowSizeY - windowPaddingTop - boxes1DGapY, // @fit 252..1932
  }
}

function lineLayoutY(
  // @fit <= windowSizeY - windowPaddingTop - boxes1DGapY
  layoutHeight: number, // @fit 0..10000
  windowSizeY: number, // @fit 320..2000
  scrollY: number, // @fit -100000..100000
) {
  // @fit >= scrollY + windowPaddingTop
  // @fit <= scrollY + windowSizeY - boxes1DGapY - layoutHeight
  return Math.max(windowPaddingTop, (windowSizeY - layoutHeight) / 2) + scrollY
}

export function getLineLayout(
  layoutSources: LayoutSource[],
  focused: number, // @fit int 0..1000
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
    leftHitArea: focused > 0 ? {
      box: {
        x: 0, // @fit == 0
        y: scrollY, // @fit == scrollY
        sizeX: hitArea1DSizeX, // @fit == hitArea1DSizeX
        sizeY: windowSizeY, // @fit == windowSizeY
      },
      // @fit >= 0
      targetIndex: focused - 1, // @fit == focused - 1
    } : null,
    rightHitArea: focused < layoutSources.length - 1 ? {
      box: {
        x: windowSizeX - hitArea1DSizeX, // @fit == windowSizeX - hitArea1DSizeX
        y: scrollY, // @fit == scrollY
        sizeX: hitArea1DSizeX, // @fit == hitArea1DSizeX
        sizeY: windowSizeY, // @fit == windowSizeY
      },
      // @fit int 1..1001
      targetIndex: focused + 1, // @fit < layoutSources.length
    } : null,
  }
}

function makeItemLayoutGeometry(
  x: number, // @fit -10000..10000
  y: number, // @fit -10000..10000
  imageSizeX: number, // @fit 0..10000
  imageSizeY: number, // @fit 0..10000
  promptLayout: PromptLayout,
  promptLineHeight: number,
): ItemLayoutGeometry {
  const imageBox = {
    x,
    y,
    sizeX: imageSizeX, // @fit == imageSizeX
    sizeY: imageSizeY, // @fit == imageSizeY
  }
  const layoutBox = {
    x,
    y,
    sizeX: imageSizeX,
    sizeY: imageSizeY + promptLayout.visibleHeight + promptPaddingBottom, // @fit == imageSizeY + promptLayout.visibleHeight + promptPaddingBottom
  }
  return {
    imageBox,
    layoutBox,
    prompt: {
      box: {
        x,
        y: y + imageSizeY, // @fit == y + imageSizeY
        sizeX: promptLayout.width, // @fit == promptLayout.width
        sizeY: promptLayout.visibleHeight, // @fit == promptLayout.visibleHeight
      },
      lineHeight: promptLineHeight,
      lines: promptLayout.lines, // @fit == promptLayout.lines
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
