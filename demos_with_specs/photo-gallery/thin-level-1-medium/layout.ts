import type { PhotoData } from './photo-data'

export const GRID_SIDE_PADDING = 32
export const GRID_GAP = 24
export const GRID_TOP_PADDING = 40
export const GRID_BOTTOM_PADDING = 40
export const GRID_MAX_COLUMNS = 7
export const GRID_MIN_TARGET_CARD_WIDTH = 220
export const GRID_CAPTION_VISIBLE_HEIGHT = 44
export const GRID_CAPTION_BOTTOM_GAP = 8

export type GridLayoutItem = {
  id: string
  index: number
  rowIndex: number
  columnIndex: number
  x: number
  y: number
  width: number
  imageHeight: number
  cardHeight: number
}

export type GridLayout = {
  columns: number
  sidePadding: number
  gap: number
  topPadding: number
  boxMaxSizeX: number
  totalHeight: number
  items: GridLayoutItem[]
}

export function computeGridLayout(
  photos: readonly PhotoData[],
  viewportWidth: number,
): GridLayout {
  const availableWidth = Math.max(0, viewportWidth - GRID_SIDE_PADDING * 2)
  const unclampedColumns = Math.floor(
    (availableWidth + GRID_GAP) / (GRID_MIN_TARGET_CARD_WIDTH + GRID_GAP),
  )
  const columns = Math.max(1, Math.min(GRID_MAX_COLUMNS, unclampedColumns))
  const boxMaxSizeX =
    (availableWidth - GRID_GAP * Math.max(0, columns - 1)) / columns

  const items: GridLayoutItem[] = new Array(photos.length)
  let rowY = GRID_TOP_PADDING

  for (let startIndex = 0; startIndex < photos.length; startIndex += columns) {
    const endIndex = Math.min(startIndex + columns, photos.length)
    let rowMaxHeight = 0

    for (let index = startIndex; index < endIndex; index += 1) {
      const photo = photos[index]
      if (photo == null) {
        continue
      }

      const columnIndex = index - startIndex
      const imageHeight = getGridImageHeight(boxMaxSizeX, photo)
      const cardHeight =
        imageHeight + GRID_CAPTION_VISIBLE_HEIGHT + GRID_CAPTION_BOTTOM_GAP
      rowMaxHeight = Math.max(rowMaxHeight, cardHeight)

      items[index] = {
        id: photo.id,
        index,
        rowIndex: Math.floor(startIndex / columns),
        columnIndex,
        x: GRID_SIDE_PADDING + columnIndex * (boxMaxSizeX + GRID_GAP),
        y: rowY,
        width: boxMaxSizeX,
        imageHeight,
        cardHeight,
      }
    }

    rowY += rowMaxHeight + GRID_GAP
  }

  const lastRowGap = photos.length === 0 ? 0 : GRID_GAP

  return {
    columns,
    sidePadding: GRID_SIDE_PADDING,
    gap: GRID_GAP,
    topPadding: GRID_TOP_PADDING,
    boxMaxSizeX,
    totalHeight: rowY - lastRowGap + GRID_BOTTOM_PADDING,
    items,
  }
}

export function getGridImageHeight(boxMaxSizeX: number, photo: PhotoData): number {
  const uncappedHeight = boxMaxSizeX * (photo.h / photo.w)
  return Math.min(uncappedHeight, boxMaxSizeX * getGridCapMultiplier(photo))
}

export function findGridItem(
  layout: GridLayout,
  photoId: string,
): GridLayoutItem | null {
  for (const item of layout.items) {
    if (item.id === photoId) {
      return item
    }
  }

  return null
}

export function getVisibleGridPhotoIds(
  layout: GridLayout,
  scrollTop: number,
  viewportHeight: number,
  overscan = 240,
): string[] {
  const minY = Math.max(0, scrollTop - overscan)
  const maxY = scrollTop + viewportHeight + overscan
  const visibleIds: string[] = []

  for (const item of layout.items) {
    const itemBottom = item.y + item.cardHeight
    if (itemBottom >= minY && item.y <= maxY) {
      visibleIds.push(item.id)
    }
  }

  return visibleIds
}

function getGridCapMultiplier(photo: PhotoData): number {
  const aspect = photo.h / photo.w

  if (aspect >= 1.15) {
    return 1.05
  }

  if (aspect <= 0.85) {
    return 1
  }

  return 0.85
}
