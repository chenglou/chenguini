import type {PhotoData} from './data'

export const GRID_SIDE_PADDING = 32
export const GRID_GAP = 24
export const GRID_TOP_PADDING = 40
export const GRID_MIN_CARD_WIDTH = 220
export const GRID_MAX_COLUMNS = 7
export const GRID_CAPTION_VISIBLE_HEIGHT = 44
export const GRID_CAPTION_BOTTOM_PADDING = 8

export const LINE_NAV_STRIP_WIDTH = 100
export const LINE_GAP = 52
export const LINE_TOP_FLOOR = 40
export const LINE_CAPTION_VISIBLE_HEIGHT = 64
export const LINE_CAPTION_BOTTOM_PADDING = 8
export const LINE_NEIGHBOR_SCALE = 0.7
export const GRID_HOVER_SCALE = 1.02
export const GRID_VISIBLE_BUFFER = 300

export type AspectClass = 'landscape' | 'square' | 'portrait'

export type GridLayoutItem = {
  id: string
  index: number
  rowIndex: number
  colIndex: number
  x: number
  y: number
  width: number
  height: number
  imageWidth: number
  imageHeight: number
  captionHeight: number
  aspectClass: AspectClass
}

export type GridLayout = {
  sidePadding: number
  gap: number
  topPadding: number
  columnCount: number
  cardWidth: number
  rowHeights: number[]
  rowTops: number[]
  totalHeight: number
  items: GridLayoutItem[]
}

export type LineLayoutItem = {
  id: string
  index: number
  x: number
  y: number
  width: number
  height: number
  scale: number
  imageWidth: number
  imageHeight: number
  captionHeight: number
}

export type LineHitArea = 'previous' | 'next' | 'dismiss'

function aspectClass(photo: PhotoData): AspectClass {
  const ratio = photo.w / photo.h
  if (ratio > 1.05) return 'landscape'
  if (ratio < 0.95) return 'portrait'
  return 'square'
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function computeGridLayout(photos: PhotoData[], viewportWidth: number): GridLayout {
  const availableWidth = Math.max(0, viewportWidth - GRID_SIDE_PADDING * 2)
  const targetColumns = Math.floor((availableWidth + GRID_GAP) / (GRID_MIN_CARD_WIDTH + GRID_GAP))
  const columnCount = clamp(targetColumns, 1, GRID_MAX_COLUMNS)
  const cardWidth = Math.floor((availableWidth - GRID_GAP * (columnCount - 1)) / columnCount)

  const rowHeights: number[] = []
  const rowCards: GridLayoutItem[] = []
  const items: GridLayoutItem[] = []

  for (let index = 0; index < photos.length; index++) {
    const photo = photos[index]!
    const colIndex = index % columnCount
    const rowIndex = Math.floor(index / columnCount)
    const photoAspect = photo.w / photo.h
    const currentAspectClass = aspectClass(photo)
    const imageHeightBudget =
      currentAspectClass === 'landscape'
        ? cardWidth
        : currentAspectClass === 'square'
          ? cardWidth * 0.85
          : cardWidth * 1.05
    const imageWidth = Math.min(photo.w, cardWidth, imageHeightBudget * photoAspect)
    const imageHeight = imageWidth / photoAspect
    const captionHeight = GRID_CAPTION_VISIBLE_HEIGHT + GRID_CAPTION_BOTTOM_PADDING
    const height = imageHeight + captionHeight
    const x = GRID_SIDE_PADDING + colIndex * (cardWidth + GRID_GAP)
    const item: GridLayoutItem = {
      id: photo.id,
      index,
      rowIndex,
      colIndex,
      x,
      y: 0,
      width: cardWidth,
      height,
      imageWidth,
      imageHeight,
      captionHeight,
      aspectClass: currentAspectClass,
    }
    items.push(item)
    rowCards.push(item)

    if (colIndex === columnCount - 1 || index === photos.length - 1) {
      let rowHeight = 0
      for (let i = 0; i < rowCards.length; i++) rowHeight = Math.max(rowHeight, rowCards[i]!.height)
      rowHeights[rowIndex] = rowHeight
      rowCards.length = 0
    }
  }

  const rowTops: number[] = []
  let currentTop = GRID_TOP_PADDING
  for (let rowIndex = 0; rowIndex < rowHeights.length; rowIndex++) {
    rowTops[rowIndex] = currentTop
    currentTop += rowHeights[rowIndex]! + GRID_GAP
  }

  for (const item of items) {
    item.y = rowTops[item.rowIndex]!
  }

  return {
    sidePadding: GRID_SIDE_PADDING,
    gap: GRID_GAP,
    topPadding: GRID_TOP_PADDING,
    columnCount,
    cardWidth,
    rowHeights,
    rowTops,
    totalHeight: currentTop - GRID_GAP,
    items,
  }
}

export function getVisibleGridIndices(
  layout: GridLayout,
  scrollTop: number,
  viewportHeight: number,
  buffer = GRID_VISIBLE_BUFFER,
): number[] {
  const visible: number[] = []
  const minY = scrollTop - buffer
  const maxY = scrollTop + viewportHeight + buffer

  for (let index = 0; index < layout.items.length; index++) {
    const item = layout.items[index]!
    if (item.y + item.height < minY) continue
    if (item.y > maxY) continue
    visible.push(index)
  }

  return visible
}

export function routeLineModeHitArea(clientX: number, viewportWidth: number): LineHitArea {
  if (clientX <= LINE_NAV_STRIP_WIDTH) return 'previous'
  if (clientX >= viewportWidth - LINE_NAV_STRIP_WIDTH) return 'next'
  return 'dismiss'
}

export function computeLineLayout(
  photos: PhotoData[],
  viewportWidth: number,
  viewportHeight: number,
  focusIndex: number,
): LineLayoutItem[] {
  const focus = photos[focusIndex]!
  const lineMaxImageHeight = Math.max(160, viewportHeight - LINE_TOP_FLOOR - LINE_CAPTION_VISIBLE_HEIGHT - LINE_CAPTION_BOTTOM_PADDING - 28)
  const focusMaxWidth = Math.max(220, Math.min(viewportWidth - LINE_NAV_STRIP_WIDTH * 2 - 40, 760))

  const baseSizes = photos.map((photo) => {
    const aspect = photo.w / photo.h
    const imageWidth = Math.min(photo.w, focusMaxWidth, lineMaxImageHeight * aspect)
    const imageHeight = imageWidth / aspect
    const captionHeight = LINE_CAPTION_VISIBLE_HEIGHT + LINE_CAPTION_BOTTOM_PADDING
    return {
      imageWidth,
      imageHeight,
      captionHeight,
      width: imageWidth,
      height: imageHeight + captionHeight,
    }
  })

  const focusBase = baseSizes[focusIndex]!
  const focusTop = Math.max(LINE_TOP_FLOOR, Math.floor((viewportHeight - focusBase.height) / 2))
  const focusCenterY = focusTop + focusBase.height / 2
  const items: LineLayoutItem[] = new Array(photos.length)
  items[focusIndex] = {
    id: focus.id,
    index: focusIndex,
    x: Math.floor(viewportWidth / 2 - focusBase.width / 2),
    y: focusTop,
    width: focusBase.width,
    height: focusBase.height,
    scale: 1,
    imageWidth: focusBase.imageWidth,
    imageHeight: focusBase.imageHeight,
    captionHeight: focusBase.captionHeight,
  }

  let leftEdge = items[focusIndex]!.x
  for (let index = focusIndex - 1; index >= 0; index--) {
    const base = baseSizes[index]!
    const width = base.width * LINE_NEIGHBOR_SCALE
    const height = base.height * LINE_NEIGHBOR_SCALE
    leftEdge -= LINE_GAP + width
    items[index] = {
      id: photos[index]!.id,
      index,
      x: Math.floor(leftEdge),
      y: Math.floor(focusCenterY - height / 2),
      width,
      height,
      scale: LINE_NEIGHBOR_SCALE,
      imageWidth: base.imageWidth * LINE_NEIGHBOR_SCALE,
      imageHeight: base.imageHeight * LINE_NEIGHBOR_SCALE,
      captionHeight: base.captionHeight * LINE_NEIGHBOR_SCALE,
    }
  }

  let rightEdge = items[focusIndex]!.x + focusBase.width
  for (let index = focusIndex + 1; index < photos.length; index++) {
    const base = baseSizes[index]!
    const width = base.width * LINE_NEIGHBOR_SCALE
    const height = base.height * LINE_NEIGHBOR_SCALE
    const x = rightEdge + LINE_GAP
    items[index] = {
      id: photos[index]!.id,
      index,
      x: Math.floor(x),
      y: Math.floor(focusCenterY - height / 2),
      width,
      height,
      scale: LINE_NEIGHBOR_SCALE,
      imageWidth: base.imageWidth * LINE_NEIGHBOR_SCALE,
      imageHeight: base.imageHeight * LINE_NEIGHBOR_SCALE,
      captionHeight: base.captionHeight * LINE_NEIGHBOR_SCALE,
    }
    rightEdge = x + width
  }

  return items
}
