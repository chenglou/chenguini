import type { PhotoData } from './data'

export const GRID = {
  sidePadding: 32,
  gap: 24,
  topPadding: 40,
  maxColumns: 7,
  minTargetCardWidth: 220,
  captionVisible: 44,
  captionBottom: 8,
} as const

export const LINE = {
  leftStrip: 100,
  rightStrip: 100,
  neighborScale: 0.7,
  gap: 52,
  bottomGap: 28,
  captionVisible: 64,
  captionBottom: 8,
} as const

export type GridItemLayout = {
  photo: PhotoData
  index: number
  row: number
  column: number
  x: number
  y: number
  width: number
  height: number
  totalHeight: number
}

export type GridLayout = {
  boxMaxSizeX: number
  columnCount: number
  rowTops: number[]
  rowHeights: number[]
  totalHeight: number
  items: GridItemLayout[]
}

export type VisibleRowRange = [number, number] | null

export type LineAction = 'previous' | 'dismiss' | 'next'

export type LineItemLayout = {
  photo: PhotoData
  index: number
  left: number
  top: number
  width: number
  height: number
  isFocused: boolean
}

export type LineLayout = {
  items: LineItemLayout[]
  focusIndex: number
}

export function hashForPhoto(id: string): string {
  return `#${encodeURIComponent(id)}`
}

export function parsePhotoHash(hash: string): string | null {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash
  if (raw.length === 0) {
    return null
  }

  try {
    return decodeURIComponent(raw)
  } catch {
    return raw
  }
}

export function getGridBoxWidth(photo: PhotoData, boxMaxSizeX: number): number {
  if (photo.w > photo.h) {
    return boxMaxSizeX
  }

  if (photo.w === photo.h) {
    return boxMaxSizeX * 0.85
  }

  return boxMaxSizeX * 1.05
}

export function computeGridLayout(photos: PhotoData[], viewportWidth: number): GridLayout {
  const innerWidth = Math.max(viewportWidth - GRID.sidePadding * 2, GRID.minTargetCardWidth)
  const rawColumnCount = Math.floor((innerWidth + GRID.gap) / (GRID.minTargetCardWidth + GRID.gap))
  const columnCount = Math.max(1, Math.min(GRID.maxColumns, rawColumnCount))
  const boxMaxSizeX = (innerWidth - GRID.gap * (columnCount - 1)) / columnCount
  const rowCount = Math.ceil(photos.length / columnCount)
  const rowHeights = Array.from({length: rowCount}, () => 0)

  const provisional = photos.map((photo, index) => {
    const row = Math.floor(index / columnCount)
    const column = index % columnCount
    const width = getGridBoxWidth(photo, boxMaxSizeX)
    const height = width * (photo.h / photo.w)
    const totalHeight = height + GRID.captionVisible + GRID.captionBottom
    rowHeights[row] = Math.max(rowHeights[row] ?? 0, totalHeight)

    return {
      photo,
      index,
      row,
      column,
      width,
      height,
      totalHeight,
    }
  })

  const rowTops: number[] = []
  let nextRowTop = GRID.topPadding
  for (let row = 0; row < rowCount; row += 1) {
    rowTops[row] = nextRowTop
    nextRowTop += (rowHeights[row] ?? 0) + GRID.gap
  }

  const items = provisional.map((item) => {
    const cellLeft = GRID.sidePadding + item.column * (boxMaxSizeX + GRID.gap)
    const rowTop = rowTops[item.row] ?? GRID.topPadding
    return {
      ...item,
      x: cellLeft + (boxMaxSizeX - item.width) / 2,
      y: rowTop,
    }
  })

  const totalHeight =
    rowCount === 0
      ? GRID.topPadding
      : (rowTops[rowCount - 1] ?? GRID.topPadding) + (rowHeights[rowCount - 1] ?? 0) + GRID.topPadding

  return {
    boxMaxSizeX,
    columnCount,
    rowTops,
    rowHeights,
    totalHeight,
    items,
  }
}

export function getVisibleRowRange(
  layout: GridLayout,
  scrollTop: number,
  viewportHeight: number,
  overscanRows = 1,
): VisibleRowRange {
  if (layout.rowTops.length === 0) {
    return null
  }

  const viewportBottom = scrollTop + viewportHeight
  let startRow = 0
  while (
    startRow < layout.rowTops.length &&
    (layout.rowTops[startRow] ?? 0) + (layout.rowHeights[startRow] ?? 0) < scrollTop
  ) {
    startRow += 1
  }

  let endRow = startRow
  while (endRow < layout.rowTops.length && (layout.rowTops[endRow] ?? 0) <= viewportBottom) {
    endRow += 1
  }

  const clampedStart = Math.max(0, startRow - overscanRows)
  const clampedEnd = Math.min(layout.rowTops.length - 1, Math.max(startRow, endRow - 1) + overscanRows)
  return [clampedStart, clampedEnd]
}

function fitRect(photo: PhotoData, maxWidth: number, maxHeight: number): {width: number; height: number} {
  const scale = Math.min(maxWidth / photo.w, maxHeight / photo.h)
  return {
    width: photo.w * scale,
    height: photo.h * scale,
  }
}

export function computeLineLayout(
  photos: PhotoData[],
  focusIndex: number,
  viewportWidth: number,
  viewportHeight: number,
): LineLayout {
  const maxWidth = Math.max(320, (viewportWidth - LINE.leftStrip - LINE.rightStrip) * 0.62)
  const maxHeight = Math.max(260, viewportHeight - LINE.captionVisible - LINE.captionBottom - LINE.bottomGap - 180)
  const baseRects = photos.map((photo) => fitRect(photo, maxWidth, maxHeight))
  const focusedRect = baseRects[focusIndex]

  if (focusedRect === undefined) {
    return {items: [], focusIndex}
  }

  const lineTop = Math.max(
    72,
    (viewportHeight - focusedRect.height - LINE.captionVisible - LINE.captionBottom - LINE.bottomGap) / 2,
  )
  const focusedLeft = viewportWidth / 2 - focusedRect.width / 2
  const items: LineItemLayout[] = Array.from({length: photos.length})

  items[focusIndex] = {
    photo: photos[focusIndex]!,
    index: focusIndex,
    left: focusedLeft,
    top: lineTop,
    width: focusedRect.width,
    height: focusedRect.height,
    isFocused: true,
  }

  let leftCursor = focusedLeft - LINE.gap
  for (let index = focusIndex - 1; index >= 0; index -= 1) {
    const rect = baseRects[index]!
    const width = rect.width * LINE.neighborScale
    const height = rect.height * LINE.neighborScale
    leftCursor -= width
    items[index] = {
      photo: photos[index]!,
      index,
      left: leftCursor,
      top: lineTop + (focusedRect.height - height) / 2,
      width,
      height,
      isFocused: false,
    }
    leftCursor -= LINE.gap
  }

  let rightCursor = focusedLeft + focusedRect.width + LINE.gap
  for (let index = focusIndex + 1; index < photos.length; index += 1) {
    const rect = baseRects[index]!
    const width = rect.width * LINE.neighborScale
    const height = rect.height * LINE.neighborScale
    items[index] = {
      photo: photos[index]!,
      index,
      left: rightCursor,
      top: lineTop + (focusedRect.height - height) / 2,
      width,
      height,
      isFocused: false,
    }
    rightCursor += width + LINE.gap
  }

  return {
    items,
    focusIndex,
  }
}

export function routeLineClick(clientX: number, viewportWidth: number): LineAction {
  if (clientX < LINE.leftStrip) {
    return 'previous'
  }

  if (clientX >= viewportWidth - LINE.rightStrip) {
    return 'next'
  }

  return 'dismiss'
}
