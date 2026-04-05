import type {PhotoData} from './data'

export const SIDE_PADDING = 32
export const GRID_GAP = 24
export const TOP_PADDING = 40
export const MAX_COLUMNS = 7
export const MIN_TARGET_CARD_WIDTH = 220
export const LINE_SIDE_STRIP_WIDTH = 100
export const LINE_NEIGHBOR_SCALE = 0.7
export const LINE_GAP = 52
export const LINE_BOTTOM_GAP = 28
export const GRID_CAPTION_VISIBLE_HEIGHT = 44
export const GRID_CAPTION_BOTTOM = 8
export const LINE_CAPTION_VISIBLE_HEIGHT = 64
export const LINE_CAPTION_BOTTOM = 8
export const DISMISS_RESTORE_GAP = 40

const GRID_OVERSCAN_ROWS = 1

export type FittedPhotoBox = {
  width: number
  height: number
}

export type GridCardLayout = {
  id: string
  x: number
  y: number
  width: number
  height: number
  imageWidth: number
  imageHeight: number
  row: number
  column: number
}

export type GridLayout = {
  columnCount: number
  cardWidth: number
  totalRows: number
  totalHeight: number
  rowTops: number[]
  rowHeights: number[]
  cards: GridCardLayout[]
  mountedPhotoIds: string[]
}

export function fitPhotoIntoBox({
  naturalWidth,
  naturalHeight,
  boxMaxWidth,
}: {
  naturalWidth: number
  naturalHeight: number
  boxMaxWidth: number
}): FittedPhotoBox {
  const maxHeight =
    naturalWidth > naturalHeight
      ? boxMaxWidth
      : naturalWidth === naturalHeight
        ? boxMaxWidth * 0.85
        : boxMaxWidth * 1.05
  const scale = Math.min(boxMaxWidth / naturalWidth, maxHeight / naturalHeight)

  return {
    width: naturalWidth * scale,
    height: naturalHeight * scale,
  }
}

export function computeGridLayout({
  photos,
  viewportWidth,
  viewportHeight,
  scrollTop,
}: {
  photos: PhotoData[]
  viewportWidth: number
  viewportHeight: number
  scrollTop: number
}): GridLayout {
  const usableWidth = Math.max(1, viewportWidth - SIDE_PADDING * 2)
  const rawColumnCount = Math.floor((usableWidth + GRID_GAP) / (MIN_TARGET_CARD_WIDTH + GRID_GAP))
  const columnCount = clamp(rawColumnCount, 1, MAX_COLUMNS)
  const cardWidth = (usableWidth - GRID_GAP * (columnCount - 1)) / columnCount
  const totalRows = Math.ceil(photos.length / columnCount)

  const rowTops: number[] = []
  const rowHeights: number[] = []
  const cards: GridCardLayout[] = []
  let nextRowTop = TOP_PADDING

  for (let row = 0; row < totalRows; row += 1) {
    const rowStart = row * columnCount
    const rowPhotos = photos.slice(rowStart, rowStart + columnCount)
    const measuredCards = rowPhotos.map((photo, column) => {
      const fittedBox = fitPhotoIntoBox({
        naturalWidth: photo.w,
        naturalHeight: photo.h,
        boxMaxWidth: cardWidth,
      })

      return {
        id: photo.id,
        x: SIDE_PADDING + column * (cardWidth + GRID_GAP),
        y: nextRowTop,
        width: cardWidth,
        height: fittedBox.height + GRID_CAPTION_VISIBLE_HEIGHT + GRID_CAPTION_BOTTOM,
        imageWidth: fittedBox.width,
        imageHeight: fittedBox.height,
        row,
        column,
      } satisfies GridCardLayout
    })

    const rowHeight = Math.max(...measuredCards.map(card => card.height))
    rowTops.push(nextRowTop)
    rowHeights.push(rowHeight)
    cards.push(...measuredCards)
    nextRowTop += rowHeight + GRID_GAP
  }

  const lastRowHeight = rowHeights.at(-1) ?? 0
  const bottomPadding = Math.max(TOP_PADDING, viewportHeight - DISMISS_RESTORE_GAP - lastRowHeight)
  const totalHeight = totalRows === 0 ? TOP_PADDING : nextRowTop - GRID_GAP + bottomPadding
  const visibleRows = findVisibleRows({rowTops, rowHeights, scrollTop, viewportHeight})
  const mountedStartRow = Math.max(0, visibleRows.startRow - GRID_OVERSCAN_ROWS)
  const mountedEndRow = Math.min(totalRows - 1, visibleRows.endRow + GRID_OVERSCAN_ROWS)
  const mountedPhotoIds = cards
    .filter(card => card.row >= mountedStartRow && card.row <= mountedEndRow)
    .map(card => card.id)

  return {
    columnCount,
    cardWidth,
    totalRows,
    totalHeight,
    rowTops,
    rowHeights,
    cards,
    mountedPhotoIds,
  }
}

export function routeLineModeHit({
  viewportWidth,
  pointerX,
}: {
  viewportWidth: number
  pointerX: number
  animatedImageLeft?: number
  animatedImageRight?: number
}): 'previous' | 'dismiss' | 'next' {
  if (pointerX < LINE_SIDE_STRIP_WIDTH) {
    return 'previous'
  }

  if (pointerX > viewportWidth - LINE_SIDE_STRIP_WIDTH) {
    return 'next'
  }

  return 'dismiss'
}

function findVisibleRows({
  rowTops,
  rowHeights,
  scrollTop,
  viewportHeight,
}: {
  rowTops: number[]
  rowHeights: number[]
  scrollTop: number
  viewportHeight: number
}): {
  startRow: number
  endRow: number
} {
  if (rowTops.length === 0) {
    return {startRow: 0, endRow: 0}
  }

  let startRow = 0
  while (startRow < rowTops.length - 1 && rowTops[startRow]! + rowHeights[startRow]! <= scrollTop) {
    startRow += 1
  }

  let endRow = startRow
  const viewportBottom = scrollTop + viewportHeight
  while (endRow < rowTops.length - 1 && rowTops[endRow + 1]! < viewportBottom) {
    endRow += 1
  }

  return {startRow, endRow}
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}
