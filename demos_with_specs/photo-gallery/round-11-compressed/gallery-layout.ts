import type { PhotoData } from './photo-gallery-data'

export const GRID_SIDE_PADDING = 32
export const GRID_GAP = 24
export const GRID_TOP_PADDING = 40
export const GRID_CAPTION_VISIBLE_HEIGHT = 44
export const GRID_CAPTION_BOTTOM = 8
export const GRID_BOTTOM_PADDING = 40
export const MAX_COLUMNS = 7
export const MIN_TARGET_CARD_WIDTH = 220

export const LINE_SIDE_STRIP_WIDTH = 100
export const LINE_NEIGHBOR_SCALE = 0.7
export const LINE_GAP = 52
export const LINE_BOTTOM_GAP = 28
export const LINE_CAPTION_VISIBLE_HEIGHT = 64
export const LINE_CAPTION_BOTTOM = 8
export const LINE_TOP_PADDING = 72
export const LINE_SIDE_BUFFER = 32

export type GridItemLayout = {
  id: string
  index: number
  row: number
  col: number
  left: number
  top: number
  width: number
  cardHeight: number
  imageWidth: number
  imageHeight: number
}

export type GridRowLayout = {
  index: number
  top: number
  height: number
  bottom: number
  itemIds: string[]
}

export type GridLayout = {
  columns: number
  boxMaxSizeX: number
  rows: GridRowLayout[]
  totalHeight: number
  itemsById: Record<string, GridItemLayout>
}

export type MountedRowRange = {
  visibleStartRow: number
  visibleEndRow: number
  mountedStartRow: number
  mountedEndRow: number
}

export type LineHitArea = 'previous' | 'dismiss' | 'next'

export type LineItemLayout = {
  id: string
  left: number
  top: number
  width: number
  height: number
  opacity: number
  scale: number
  isFocused: boolean
}

export type LineLayout = {
  items: LineItemLayout[]
  captionTop: number
  captionWidth: number
}

function getCategoryMaxHeight(photo: PhotoData, boxMaxSizeX: number) {
  const aspectRatio = photo.w / photo.h

  if (aspectRatio > 1.05) {
    return boxMaxSizeX
  }
  if (aspectRatio < 0.95) {
    return boxMaxSizeX * 1.05
  }
  return boxMaxSizeX * 0.85
}

function fitSize(photo: PhotoData, maxWidth: number, maxHeight: number) {
  const scale = Math.min(maxWidth / photo.w, maxHeight / photo.h)
  return {
    width: photo.w * scale,
    height: photo.h * scale,
  }
}

export function computeGridLayout({
  photos,
  viewportWidth,
}: {
  photos: PhotoData[]
  viewportWidth: number
}): GridLayout {
  const contentWidth = Math.max(viewportWidth - GRID_SIDE_PADDING * 2, MIN_TARGET_CARD_WIDTH)
  const roughColumnCount = Math.floor((contentWidth + GRID_GAP) / (MIN_TARGET_CARD_WIDTH + GRID_GAP))
  const columns = Math.max(1, Math.min(MAX_COLUMNS, roughColumnCount))
  const boxMaxSizeX = (contentWidth - GRID_GAP * (columns - 1)) / columns

  const rows: GridRowLayout[] = []
  const itemsById: Record<string, GridItemLayout> = {}

  let rowTop = GRID_TOP_PADDING
  let rowIndex = 0

  for (let start = 0; start < photos.length; start += columns) {
    const rowPhotos = photos.slice(start, start + columns)
    let rowHeight = 0

    const rowItems = rowPhotos.map((photo, offset) => {
      const imageSize = fitSize(photo, boxMaxSizeX, getCategoryMaxHeight(photo, boxMaxSizeX))
      const cardHeight = imageSize.height + GRID_CAPTION_VISIBLE_HEIGHT + GRID_CAPTION_BOTTOM

      rowHeight = Math.max(rowHeight, cardHeight)

      return {
        id: photo.id,
        index: start + offset,
        row: rowIndex,
        col: offset,
        left: GRID_SIDE_PADDING + offset * (boxMaxSizeX + GRID_GAP),
        top: rowTop,
        width: boxMaxSizeX,
        cardHeight,
        imageWidth: imageSize.width,
        imageHeight: imageSize.height,
      } satisfies GridItemLayout
    })

    const row = {
      index: rowIndex,
      top: rowTop,
      height: rowHeight,
      bottom: rowTop + rowHeight,
      itemIds: rowItems.map((item) => item.id),
    } satisfies GridRowLayout

    rows.push(row)
    for (const item of rowItems) {
      itemsById[item.id] = item
    }

    rowTop += rowHeight + GRID_GAP
    rowIndex += 1
  }

  const totalHeight = rows.length === 0
    ? GRID_TOP_PADDING + GRID_BOTTOM_PADDING
    : rows.at(-1)!.bottom + GRID_BOTTOM_PADDING

  return {
    columns,
    boxMaxSizeX,
    rows,
    totalHeight,
    itemsById,
  }
}

export function computeMountedRowRange({
  rows,
  scrollTop,
  viewportHeight,
  overscanRows = 1,
}: {
  rows: GridRowLayout[]
  scrollTop: number
  viewportHeight: number
  overscanRows?: number
}): MountedRowRange | null {
  if (rows.length === 0) {
    return null
  }

  const viewportBottom = scrollTop + viewportHeight
  const visibleStartRow = rows.findIndex((row) => row.bottom >= scrollTop)
  const visibleEndRow = rows.findLastIndex((row) => row.top <= viewportBottom)

  const safeVisibleStart = visibleStartRow === -1 ? rows.length - 1 : visibleStartRow
  const safeVisibleEnd = visibleEndRow === -1 ? rows.length - 1 : visibleEndRow

  return {
    visibleStartRow: safeVisibleStart,
    visibleEndRow: safeVisibleEnd,
    mountedStartRow: Math.max(0, safeVisibleStart - overscanRows),
    mountedEndRow: Math.min(rows.length - 1, safeVisibleEnd + overscanRows),
  }
}

export function computeLineLayout({
  photos,
  focusedIndex,
  viewportWidth,
  viewportHeight,
}: {
  photos: PhotoData[]
  focusedIndex: number
  viewportWidth: number
  viewportHeight: number
}): LineLayout {
  const stageWidth = Math.max(0, viewportWidth - LINE_SIDE_STRIP_WIDTH * 2)
  const captionTop = viewportHeight - LINE_CAPTION_VISIBLE_HEIGHT - LINE_CAPTION_BOTTOM
  const imageBottom = captionTop - LINE_BOTTOM_GAP
  const maxHeight = Math.max(180, imageBottom - LINE_TOP_PADDING)
  const focusedMaxWidth = Math.max(240, stageWidth * 0.62)
  const centeredLeft = LINE_SIDE_STRIP_WIDTH + stageWidth / 2

  const itemsByIndex = photos.map((photo, index) => {
    const baseSize = fitSize(photo, focusedMaxWidth, maxHeight)
    const isFocused = index === focusedIndex
    const scale = isFocused ? 1 : LINE_NEIGHBOR_SCALE
    const width = baseSize.width * scale
    const height = baseSize.height * scale

    return {
      id: photo.id,
      left: 0,
      top: imageBottom - height,
      width,
      height,
      opacity: isFocused ? 1 : Math.max(0.28, 0.82 - Math.abs(index - focusedIndex) * 0.16),
      scale,
      isFocused,
    } satisfies LineItemLayout
  })

  const focusedItem = itemsByIndex[focusedIndex]
  focusedItem.left = centeredLeft - focusedItem.width / 2

  let rightCursor = focusedItem.left + focusedItem.width + LINE_GAP
  for (let index = focusedIndex + 1; index < itemsByIndex.length; index += 1) {
    const item = itemsByIndex[index]
    item.left = rightCursor
    rightCursor += item.width + LINE_GAP
  }

  let leftCursor = focusedItem.left - LINE_GAP
  for (let index = focusedIndex - 1; index >= 0; index -= 1) {
    const item = itemsByIndex[index]
    item.left = leftCursor - item.width
    leftCursor = item.left - LINE_GAP
  }

  return {
    items: itemsByIndex.filter((item) => item.left + item.width >= -LINE_SIDE_BUFFER && item.left <= viewportWidth + LINE_SIDE_BUFFER),
    captionTop,
    captionWidth: stageWidth,
  }
}

export function routeLineHitArea({
  clientX,
  viewportWidth,
}: {
  clientX: number
  viewportWidth: number
}): LineHitArea {
  if (clientX < LINE_SIDE_STRIP_WIDTH) {
    return 'previous'
  }
  if (clientX >= viewportWidth - LINE_SIDE_STRIP_WIDTH) {
    return 'next'
  }
  return 'dismiss'
}
