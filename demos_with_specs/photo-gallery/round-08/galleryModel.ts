import type {PhotoData} from './data'

export const GRID_GAP = 24
export const GRID_SIDE_PADDING = 32
export const GRID_TOP_PADDING = 40
export const GRID_CAPTION_HEIGHT = 52
export const MAX_GRID_COLUMNS = 7
export const MIN_GRID_CARD_WIDTH = 220
export const GRID_OVERSCAN = 800

export const LINE_SIDE_HIT_WIDTH = 100
export const LINE_CARD_GAP = 52
export const LINE_TOP_PADDING = 40
export const LINE_CAPTION_HEIGHT = 72
export const LINE_IMAGE_BOTTOM_GAP = 28
export const LINE_UNFOCUSED_SCALE = 0.7

export type GridMetrics = {
  columns: number
  boxMaxSizeX: number
}

export type GridItemSize = {
  imageWidth: number
  imageHeight: number
  cardWidth: number
  cardHeight: number
}

export type GridItemLayout = GridItemSize & {
  index: number
  column: number
  left: number
  top: number
}

export type GridLayout = {
  items: GridItemLayout[]
  totalHeight: number
  metrics: GridMetrics
}

export type LineItemLayout = {
  index: number
  left: number
  top: number
  imageWidth: number
  imageHeight: number
  cardWidth: number
  cardHeight: number
  focusDistance: number
}

export type LineHitAction =
  | {type: 'focus'; index: number}
  | {type: 'dismiss'}

export function computeGridMetrics(viewportWidth: number): GridMetrics {
  const usableWidth = Math.max(0, viewportWidth - GRID_SIDE_PADDING * 2)
  const unclampedColumns = Math.floor((usableWidth + GRID_GAP) / (MIN_GRID_CARD_WIDTH + GRID_GAP))
  const columns = Math.min(MAX_GRID_COLUMNS, Math.max(1, unclampedColumns))
  const boxMaxSizeX = (usableWidth - GRID_GAP * (columns - 1)) / columns
  return {columns, boxMaxSizeX}
}

export function computeGridItemSize(photo: PhotoData, boxMaxSizeX: number): GridItemSize {
  const aspectRatio = photo.w / photo.h
  const imgMaxSizeY =
    photo.w === photo.h
      ? boxMaxSizeX * 0.85
      : photo.w < photo.h
        ? boxMaxSizeX * 1.05
        : boxMaxSizeX

  const imageWidth = Math.min(photo.w, boxMaxSizeX, imgMaxSizeY * aspectRatio)
  const imageHeight = imageWidth / aspectRatio

  return {
    imageWidth,
    imageHeight,
    cardWidth: imageWidth,
    cardHeight: imageHeight + GRID_CAPTION_HEIGHT,
  }
}

export function computeGridLayout(photos: PhotoData[], viewportWidth: number): GridLayout {
  const metrics = computeGridMetrics(viewportWidth)
  const columnBottoms = Array.from({length: metrics.columns}, () => GRID_TOP_PADDING)
  const items: GridItemLayout[] = []

  photos.forEach((photo, index) => {
    const size = computeGridItemSize(photo, metrics.boxMaxSizeX)
    let column = 0
    for (let nextColumn = 1; nextColumn < columnBottoms.length; nextColumn++) {
      if (columnBottoms[nextColumn] < columnBottoms[column]) {
        column = nextColumn
      }
    }

    const left = GRID_SIDE_PADDING + column * (metrics.boxMaxSizeX + GRID_GAP)
    const top = columnBottoms[column]

    items.push({...size, index, column, left, top})
    columnBottoms[column] = top + size.cardHeight + GRID_GAP
  })

  return {
    items,
    totalHeight: Math.max(...columnBottoms) - GRID_GAP,
    metrics,
  }
}

export function getVisibleGridIndices(
  layout: GridLayout,
  scrollTop: number,
  viewportHeight: number,
  overscan = GRID_OVERSCAN,
) {
  const minY = scrollTop - overscan
  const maxY = scrollTop + viewportHeight + overscan
  return layout.items
    .filter((item) => item.top + item.cardHeight >= minY && item.top <= maxY)
    .map((item) => item.index)
}

export function getScrollAnchorIndex(layout: GridLayout, scrollTop: number) {
  const anchorY = scrollTop + 1
  return layout.items.find((item) => item.top + item.cardHeight >= anchorY)?.index ?? null
}

function computeLineImageSize(photo: PhotoData, viewportWidth: number, viewportHeight: number) {
  const aspectRatio = photo.w / photo.h
  const maxImageHeight = Math.max(
    180,
    viewportHeight - LINE_TOP_PADDING - LINE_CAPTION_HEIGHT - LINE_IMAGE_BOTTOM_GAP - 24,
  )
  const maxImageWidth = Math.max(220, viewportWidth * 0.58)
  const imageWidth = Math.min(photo.w, maxImageWidth, maxImageHeight * aspectRatio)
  const imageHeight = imageWidth / aspectRatio
  return {imageWidth, imageHeight}
}

export function computeLineLayout(
  photos: PhotoData[],
  focusedIndex: number,
  viewportWidth: number,
  viewportHeight: number,
): LineItemLayout[] {
  const items = photos.map((photo, index) => {
    const baseSize = computeLineImageSize(photo, viewportWidth, viewportHeight)
    const focusDistance = Math.abs(index - focusedIndex)
    const scale = focusDistance === 0 ? 1 : LINE_UNFOCUSED_SCALE
    const imageWidth = baseSize.imageWidth * scale
    const imageHeight = baseSize.imageHeight * scale
    const cardWidth = imageWidth
    const cardHeight = imageHeight + LINE_CAPTION_HEIGHT

    return {
      index,
      left: 0,
      top: Math.max(LINE_TOP_PADDING, (viewportHeight - cardHeight) / 2),
      imageWidth,
      imageHeight,
      cardWidth,
      cardHeight,
      focusDistance,
    }
  })

  const focusedItem = items[focusedIndex]
  focusedItem.left = (viewportWidth - focusedItem.cardWidth) / 2

  let leftEdge = focusedItem.left
  for (let index = focusedIndex - 1; index >= 0; index--) {
    const item = items[index]
    leftEdge -= LINE_CARD_GAP + item.cardWidth
    item.left = leftEdge
  }

  let rightEdge = focusedItem.left + focusedItem.cardWidth
  for (let index = focusedIndex + 1; index < items.length; index++) {
    const item = items[index]
    item.left = rightEdge + LINE_CARD_GAP
    rightEdge = item.left + item.cardWidth
  }

  return items
}

export function routeLineModeHitArea(
  pointerX: number,
  viewportWidth: number,
  focusedIndex: number,
  itemCount: number,
): LineHitAction {
  if (pointerX <= LINE_SIDE_HIT_WIDTH && focusedIndex > 0) {
    return {type: 'focus', index: focusedIndex - 1}
  }

  if (pointerX >= viewportWidth - LINE_SIDE_HIT_WIDTH && focusedIndex < itemCount - 1) {
    return {type: 'focus', index: focusedIndex + 1}
  }

  return {type: 'dismiss'}
}

export function parseFocusedHash(hash: string) {
  const trimmedHash = hash.startsWith('#') ? hash.slice(1) : hash
  const params = new URLSearchParams(trimmedHash)
  return params.get('photo')
}

export function formatFocusedHash(photoId: string | null) {
  return photoId == null ? '' : `#photo=${encodeURIComponent(photoId)}`
}
