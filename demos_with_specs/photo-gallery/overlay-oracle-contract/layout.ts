import { type PhotoData } from './data'

export const GRID_SIDE_PADDING = 32
export const GRID_GAP = 24
export const GRID_TOP_PADDING = 40
export const MAX_GRID_COLUMNS = 7
export const TARGET_MIN_CARD_WIDTH = 220
export const GRID_CAPTION_TEXT = 44
export const GRID_CAPTION_BOTTOM_PADDING = 8
export const GRID_CAPTION_HEIGHT = GRID_CAPTION_TEXT + GRID_CAPTION_BOTTOM_PADDING

export const LINE_NEIGHBOR_SCALE = 0.7
export const LINE_CARD_GAP = 52
export const LINE_IMAGE_TO_BOTTOM_GAP = 28
export const LINE_TOP_PADDING_FLOOR = 40
export const LINE_EDGE_STRIP = 100
export const LINE_CAPTION_TEXT = 64
export const LINE_CAPTION_BOTTOM_PADDING = 8
export const LINE_CAPTION_HEIGHT = LINE_CAPTION_TEXT + LINE_CAPTION_BOTTOM_PADDING

export type GridLayoutInput = {
  viewportWidth: number
  viewportHeight: number
  scrollTop: number
}

export type GridItemLayout = {
  id: string
  rowIndex: number
  columnIndex: number
  sizeX: number
  imageHeight: number
  sizeY: number
}

export type GridRowLayout = {
  rowIndex: number
  top: number
  height: number
  bottom: number
  itemIds: string[]
}

export type GridLayout = {
  columns: number
  cardWidth: number
  sidePadding: number
  gap: number
  topPadding: number
  items: GridItemLayout[]
  rows: GridRowLayout[]
  mountedIds: string[]
  totalHeight: number
}

export type LineHitArea = 'previous' | 'next' | 'dismiss'

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function classifyAspectRatio(aspectRatio: number) {
  if (aspectRatio >= 1.1) {
    return 'landscape'
  }

  if (aspectRatio <= 0.9) {
    return 'portrait'
  }

  return 'square'
}

function maxImageHeightFor(cardWidth: number, aspectRatio: number) {
  const kind = classifyAspectRatio(aspectRatio)

  if (kind === 'landscape') {
    return cardWidth
  }

  if (kind === 'portrait') {
    return cardWidth * 1.05
  }

  return cardWidth * 0.85
}

export function measureGridItem(photo: PhotoData, cardWidth: number): GridItemLayout {
  const aspectRatio = photo.w / photo.h
  const maxImageHeight = maxImageHeightFor(cardWidth, aspectRatio)
  const sizeX = Math.min(photo.w, cardWidth, maxImageHeight * aspectRatio)
  const imageHeight = sizeX / aspectRatio

  return {
    id: photo.id,
    rowIndex: 0,
    columnIndex: 0,
    sizeX,
    imageHeight,
    sizeY: imageHeight + GRID_CAPTION_HEIGHT,
  }
}

export function computeGridLayout(photos: PhotoData[], input: GridLayoutInput): GridLayout {
  const columns = clamp(
    Math.floor((input.viewportWidth - GRID_SIDE_PADDING * 2 + GRID_GAP) / (TARGET_MIN_CARD_WIDTH + GRID_GAP)),
    1,
    MAX_GRID_COLUMNS,
  )
  const cardWidth = Math.floor((input.viewportWidth - GRID_SIDE_PADDING * 2 - GRID_GAP * (columns - 1)) / columns)

  const items = photos.map((photo, index) => {
    const item = measureGridItem(photo, cardWidth)
    return {
      ...item,
      rowIndex: Math.floor(index / columns),
      columnIndex: index % columns,
    }
  })

  const rowCount = Math.ceil(photos.length / columns)
  const rows: GridRowLayout[] = []
  let currentTop = GRID_TOP_PADDING

  for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
    const rowItems = items.filter(item => item.rowIndex === rowIndex)
    const height = rowItems.reduce((maxHeight, item) => Math.max(maxHeight, item.sizeY), 0)
    const bottom = currentTop + height

    rows.push({
      rowIndex,
      top: currentTop,
      height,
      bottom,
      itemIds: rowItems.map(item => item.id),
    })

    currentTop = bottom + GRID_GAP
  }

  const mountedIds = computeMountedIds(rows, input.scrollTop, input.viewportHeight)

  return {
    columns,
    cardWidth,
    sidePadding: GRID_SIDE_PADDING,
    gap: GRID_GAP,
    topPadding: GRID_TOP_PADDING,
    items,
    rows,
    mountedIds,
    totalHeight: rows.length === 0 ? GRID_TOP_PADDING * 2 : rows[rows.length - 1]!.bottom + GRID_TOP_PADDING,
  }
}

function computeMountedIds(rows: GridRowLayout[], scrollTop: number, viewportHeight: number) {
  const top = scrollTop
  const bottom = scrollTop + viewportHeight
  const mountedStart = rows.findIndex(row => row.bottom > top)
  const mountedEnd = (() => {
    for (let index = rows.length - 1; index >= 0; index -= 1) {
      if (rows[index]!.top < bottom) {
        return index
      }
    }
    return -1
  })()

  if (mountedStart === -1 || mountedEnd === -1) {
    return []
  }

  const start = Math.max(0, mountedStart - 1)
  const end = Math.min(rows.length - 1, mountedEnd + 1)

  return rows.slice(start, end + 1).flatMap(row => row.itemIds)
}

export function resolveLineHitArea(x: number, viewportWidth: number): LineHitArea {
  if (x < LINE_EDGE_STRIP) {
    return 'previous'
  }

  if (x >= viewportWidth - LINE_EDGE_STRIP) {
    return 'next'
  }

  return 'dismiss'
}

