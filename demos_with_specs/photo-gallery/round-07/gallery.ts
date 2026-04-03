import type { PhotoData } from './data'

export const GRID_GAP = 24
export const GRID_TOP_PADDING = 40
export const GRID_CAPTION_HEIGHT = 52
export const GRID_MIN_CARD_WIDTH = 220
export const GRID_MAX_COLUMNS = 7
export const GRID_OCCLUSION_BUFFER = 320
export const LINE_SIDE_HIT_WIDTH = 100
export const LINE_GAP = 52
export const LINE_TOP_PADDING = 40
export const LINE_IMAGE_TO_CAPTION_GAP = 28
export const LINE_CAPTION_HEIGHT = 72

export type GridLayoutInput = {
  viewportWidth: number
  viewportHeight: number
  scrollTop: number
  photos: PhotoData[]
}

export type GridItemLayout = {
  id: string
  index: number
  rowIndex: number
  columnIndex: number
  x: number
  y: number
  width: number
  height: number
  imageWidth: number
  imageHeight: number
  rowTop: number
  rowHeight: number
}

export type GridRowLayout = {
  index: number
  y: number
  height: number
  itemIds: string[]
}

export type GridLayout = {
  columnCount: number
  boxMaxSizeX: number
  sidePadding: number
  totalHeight: number
  rows: GridRowLayout[]
  items: GridItemLayout[]
  visibleItemIds: string[]
}

export type LineLayoutInput = {
  viewportWidth: number
  viewportHeight: number
  photos: PhotoData[]
  focusedIndex: number
}

export type LineItemLayout = {
  id: string
  index: number
  x: number
  y: number
  width: number
  height: number
  imageHeight: number
  captionTop: number
  isFocused: boolean
  visible: boolean
}

export type LineLayout = {
  items: LineItemLayout[]
  focusedIndex: number
  focusRect: LineItemLayout
  maxImageHeight: number
}

export type LinePointerInput = {
  viewportWidth: number
  pointerX: number
  focusedIndex: number
  photoCount: number
}

export type LinePointerAction =
  | { kind: 'focus'; index: number }
  | { kind: 'dismiss' }

export function computeGridLayout(input: GridLayoutInput): GridLayout {
  const sidePadding = getSidePadding(input.viewportWidth)
  const availableWidth = Math.max(0, input.viewportWidth - sidePadding * 2)
  const columnCount = clamp(
    Math.floor((availableWidth + GRID_GAP) / (GRID_MIN_CARD_WIDTH + GRID_GAP)),
    1,
    GRID_MAX_COLUMNS,
  )
  const boxMaxSizeX =
    (availableWidth - GRID_GAP * (columnCount - 1)) / Math.max(1, columnCount)

  const rows: GridRowLayout[] = []
  const items: GridItemLayout[] = []

  let currentY = GRID_TOP_PADDING

  for (let rowIndex = 0; rowIndex * columnCount < input.photos.length; rowIndex++) {
    const rowPhotos = input.photos.slice(
      rowIndex * columnCount,
      rowIndex * columnCount + columnCount,
    )

    const sized = rowPhotos.map((photo) => {
      const { imageWidth, imageHeight } = computeGridImageSize(photo, boxMaxSizeX)
      return {
        photo,
        imageWidth,
        imageHeight,
        width: imageWidth,
        height: imageHeight + GRID_CAPTION_HEIGHT,
      }
    })

    const rowHeight = sized.reduce(
      (max, item) => Math.max(max, item.height),
      GRID_CAPTION_HEIGHT,
    )

    const row = {
      index: rowIndex,
      y: currentY,
      height: rowHeight,
      itemIds: rowPhotos.map((photo) => photo.id),
    }
    rows.push(row)

    for (const [columnIndex, entry] of sized.entries()) {
      const columnX = sidePadding + columnIndex * (boxMaxSizeX + GRID_GAP)
      items.push({
        id: entry.photo.id,
        index: rowIndex * columnCount + columnIndex,
        rowIndex,
        columnIndex,
        x: columnX + (boxMaxSizeX - entry.width) / 2,
        y: currentY,
        width: entry.width,
        height: entry.height,
        imageWidth: entry.imageWidth,
        imageHeight: entry.imageHeight,
        rowTop: currentY,
        rowHeight,
      })
    }

    currentY += rowHeight + GRID_GAP
  }

  const visibleTop = input.scrollTop - GRID_OCCLUSION_BUFFER
  const visibleBottom = input.scrollTop + input.viewportHeight + GRID_OCCLUSION_BUFFER
  const visibleItemIds = rows
    .filter(
      (row) => row.y + row.height >= visibleTop && row.y <= visibleBottom,
    )
    .flatMap((row) => row.itemIds)

  return {
    columnCount,
    boxMaxSizeX,
    sidePadding,
    totalHeight: currentY - GRID_GAP + GRID_TOP_PADDING,
    rows,
    items,
    visibleItemIds,
  }
}

export function computeLineLayout(input: LineLayoutInput): LineLayout {
  const maxImageHeight = Math.max(
    220,
    input.viewportHeight -
      LINE_TOP_PADDING -
      LINE_IMAGE_TO_CAPTION_GAP -
      LINE_CAPTION_HEIGHT -
      48,
  )
  const maxFocusedWidth = Math.max(260, input.viewportWidth - 320)
  const sized = input.photos.map((photo, index) => {
    const fit = fitRect(photo.w, photo.h, maxFocusedWidth, maxImageHeight)
    const scale = index === input.focusedIndex ? 1 : 0.7
    return {
      id: photo.id,
      index,
      width: fit.width * scale,
      height: fit.height * scale,
      imageHeight: fit.height * scale,
      isFocused: index === input.focusedIndex,
    }
  })

  const focus = sized[input.focusedIndex]
  if (focus == null) {
    throw new Error(`Invalid focused index ${input.focusedIndex}`)
  }

  const focusX = (input.viewportWidth - focus.width) / 2
  const focusY = Math.max(
    LINE_TOP_PADDING,
    (input.viewportHeight - LINE_CAPTION_HEIGHT - LINE_IMAGE_TO_CAPTION_GAP - focus.height) /
      2,
  )

  const items: LineItemLayout[] = []
  let leftEdge = focusX
  let rightEdge = focusX + focus.width
  const visibilityBuffer = 260

  for (let index = input.focusedIndex - 1; index >= 0; index--) {
    const entry = sized[index]
    if (entry == null) continue
    leftEdge -= LINE_GAP + entry.width
    items.push({
      id: entry.id,
      index,
      x: leftEdge,
      y: focusY + (focus.height - entry.height) / 2,
      width: entry.width,
      height: entry.height + LINE_CAPTION_HEIGHT,
      imageHeight: entry.imageHeight,
      captionTop: focusY + (focus.height - entry.height) / 2 + entry.height + 12,
      isFocused: false,
      visible:
        leftEdge + entry.width >= -visibilityBuffer &&
        leftEdge <= input.viewportWidth + visibilityBuffer,
    })
  }

  items.push({
    id: focus.id,
    index: focus.index,
    x: focusX,
    y: focusY,
    width: focus.width,
    height: focus.height + LINE_CAPTION_HEIGHT,
    imageHeight: focus.imageHeight,
    captionTop: focusY + focus.height + 12,
    isFocused: true,
    visible: true,
  })

  for (let index = input.focusedIndex + 1; index < sized.length; index++) {
    const entry = sized[index]
    if (entry == null) continue
    items.push({
      id: entry.id,
      index,
      x: rightEdge + LINE_GAP,
      y: focusY + (focus.height - entry.height) / 2,
      width: entry.width,
      height: entry.height + LINE_CAPTION_HEIGHT,
      imageHeight: entry.imageHeight,
      captionTop: focusY + (focus.height - entry.height) / 2 + entry.height + 12,
      isFocused: false,
      visible:
        rightEdge + LINE_GAP + entry.width >= -visibilityBuffer &&
        rightEdge + LINE_GAP <= input.viewportWidth + visibilityBuffer,
    })
    rightEdge += LINE_GAP + entry.width
  }

  items.sort((a, b) => a.index - b.index)

  return {
    items,
    focusedIndex: input.focusedIndex,
    focusRect: items[input.focusedIndex] ?? items.find((item) => item.isFocused)!,
    maxImageHeight,
  }
}

export function routeLineModePointer(
  input: LinePointerInput,
): LinePointerAction {
  if (
    input.pointerX <= LINE_SIDE_HIT_WIDTH &&
    input.focusedIndex > 0
  ) {
    return { kind: 'focus', index: input.focusedIndex - 1 }
  }
  if (
    input.pointerX >= input.viewportWidth - LINE_SIDE_HIT_WIDTH &&
    input.focusedIndex < input.photoCount - 1
  ) {
    return { kind: 'focus', index: input.focusedIndex + 1 }
  }
  return { kind: 'dismiss' }
}

export function getRowForPhoto(layout: GridLayout, photoId: string) {
  const item = layout.items.find((entry) => entry.id === photoId)
  if (item == null) return null
  return layout.rows[item.rowIndex] ?? null
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function getSidePadding(viewportWidth: number) {
  return clamp(Math.round(viewportWidth * 0.04), 20, 40)
}

function computeGridImageSize(photo: PhotoData, boxMaxSizeX: number) {
  const aspectRatio = photo.w / photo.h
  const imgMaxSizeY =
    aspectRatio > 1.02
      ? boxMaxSizeX
      : aspectRatio < 0.98
        ? boxMaxSizeX * 1.05
        : boxMaxSizeX * 0.85
  const imageWidth = Math.min(photo.w, boxMaxSizeX, imgMaxSizeY * aspectRatio)
  return {
    imageWidth,
    imageHeight: imageWidth / aspectRatio,
  }
}

function fitRect(
  naturalWidth: number,
  naturalHeight: number,
  maxWidth: number,
  maxHeight: number,
) {
  const scale = Math.min(maxWidth / naturalWidth, maxHeight / naturalHeight, 1)
  return {
    width: naturalWidth * scale,
    height: naturalHeight * scale,
  }
}
