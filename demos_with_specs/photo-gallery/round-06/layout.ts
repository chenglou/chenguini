import type {PhotoData} from './data'

export const GRID_GAP = 24
export const GRID_TOP_PADDING = 40
export const GRID_CAPTION_HEIGHT = 52
export const GRID_MIN_CARD_WIDTH = 220
export const GRID_SIDE_PADDING = 32
export const LINE_NAV_WIDTH = 100

export type GridLayoutItem = {
  photoId: string
  column: number
  stackIndex: number
  x: number
  y: number
  imageWidth: number
  imageHeight: number
  cardWidth: number
  cardHeight: number
}

export type GridLayout = {
  columnCount: number
  columnWidth: number
  contentHeight: number
  items: GridLayoutItem[]
}

export type LineModeClickAction = 'previous' | 'next' | 'dismiss'

export function getGridImageMetrics(photo: PhotoData, boxMaxSizeX: number) {
  const aspectRatio = photo.w / photo.h
  const imgMaxSizeY =
    aspectRatio > 1.03
      ? boxMaxSizeX
      : aspectRatio < 0.97
        ? boxMaxSizeX * 1.05
        : boxMaxSizeX * 0.85

  const imageWidth = Math.min(photo.w, boxMaxSizeX, imgMaxSizeY * aspectRatio)
  const imageHeight = imageWidth / aspectRatio

  return {imageWidth, imageHeight}
}

export function computeGridLayout(photos: PhotoData[], viewportWidth: number): GridLayout {
  const availableWidth = Math.max(1, viewportWidth - GRID_SIDE_PADDING * 2)
  const columnCount = Math.max(
    1,
    Math.min(
      7,
      Math.floor((availableWidth + GRID_GAP) / (GRID_MIN_CARD_WIDTH + GRID_GAP)),
    ),
  )
  const columnWidth =
    (availableWidth - GRID_GAP * Math.max(0, columnCount - 1)) / columnCount
  const columnHeights = new Array(columnCount).fill(GRID_TOP_PADDING)
  const columnItemCounts = new Array(columnCount).fill(0)
  const items: GridLayoutItem[] = []

  for (const photo of photos) {
    let column = 0
    for (let i = 1; i < columnHeights.length; i++) {
      if (columnHeights[i]! < columnHeights[column]!) column = i
    }

    const {imageWidth, imageHeight} = getGridImageMetrics(photo, columnWidth)
    const cardWidth = imageWidth
    const cardHeight = imageHeight + GRID_CAPTION_HEIGHT
    const x =
      GRID_SIDE_PADDING +
      column * (columnWidth + GRID_GAP) +
      (columnWidth - cardWidth) / 2
    const y = columnHeights[column]!

    items.push({
      photoId: photo.id,
      column,
      stackIndex: columnItemCounts[column]!,
      x,
      y,
      imageWidth,
      imageHeight,
      cardWidth,
      cardHeight,
    })

    columnItemCounts[column]! += 1
    columnHeights[column]! += cardHeight + GRID_GAP
  }

  const contentHeight =
    items.length === 0
      ? GRID_TOP_PADDING
      : Math.max(...columnHeights) - GRID_GAP

  return {columnCount, columnWidth, contentHeight, items}
}

export function routeLineModeClick(
  clientX: number,
  viewportWidth: number,
  hasPrevious: boolean,
  hasNext: boolean,
): LineModeClickAction {
  if (clientX <= LINE_NAV_WIDTH) return hasPrevious ? 'previous' : 'dismiss'
  if (clientX >= viewportWidth - LINE_NAV_WIDTH) {
    return hasNext ? 'next' : 'dismiss'
  }
  return 'dismiss'
}
