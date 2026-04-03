import type {PhotoData} from './data'

export const GRID_GAP = 24
export const GRID_TOP_PADDING = 40
export const GRID_SIDE_PADDING = 32
export const GRID_MIN_CARD_WIDTH = 220
export const GRID_MAX_COLUMNS = 7
export const GRID_CAPTION_HEIGHT = 52
export const LINE_GAP = 52
export const LINE_TOP_PADDING = 40
export const LINE_CAPTION_HEIGHT = 72
export const LINE_SIDE_HIT_WIDTH = 100

export type GridPhotoKind = 'landscape' | 'square' | 'portrait'

export type GridItemLayout = {
  index: number
  id: string
  row: number
  column: number
  x: number
  y: number
  width: number
  height: number
  imageWidth: number
  imageHeight: number
}

export type GridLayout = {
  columns: number
  boxMaxSizeX: number
  contentWidth: number
  totalHeight: number
  items: GridItemLayout[]
  rowHeights: number[]
}

export type LineItemLayout = {
  index: number
  id: string
  x: number
  y: number
  width: number
  height: number
  imageHeight: number
  isFocused: boolean
}

export type LineModeClickAction =
  | {type: 'previous'}
  | {type: 'next'}
  | {type: 'dismiss'}

export function classifyGridPhoto(photo: PhotoData): GridPhotoKind {
  const aspectRatio = photo.w / photo.h
  if (aspectRatio > 1.08) return 'landscape'
  if (aspectRatio < 0.92) return 'portrait'
  return 'square'
}

export function getGridPhotoMaxHeight(kind: GridPhotoKind, boxMaxSizeX: number) {
  switch (kind) {
    case 'landscape':
      return boxMaxSizeX
    case 'square':
      return boxMaxSizeX * 0.85
    case 'portrait':
      return boxMaxSizeX * 1.05
  }
}

export function getResponsiveColumnCount(viewportWidth: number) {
  const contentWidth = Math.max(240, viewportWidth - GRID_SIDE_PADDING * 2)
  const columns = Math.floor((contentWidth + GRID_GAP) / (GRID_MIN_CARD_WIDTH + GRID_GAP))
  return Math.min(GRID_MAX_COLUMNS, Math.max(1, columns))
}

export function computeGridLayout(photos: PhotoData[], viewportWidth: number): GridLayout {
  const contentWidth = Math.max(240, viewportWidth - GRID_SIDE_PADDING * 2)
  const columns = getResponsiveColumnCount(viewportWidth)
  const boxMaxSizeX = Math.floor((contentWidth - GRID_GAP * (columns - 1)) / columns)
  const rowHeights: number[] = []
  const items: GridItemLayout[] = []

  for (let index = 0; index < photos.length; index++) {
    const photo = photos[index]!
    const row = Math.floor(index / columns)
    const column = index % columns
    const kind = classifyGridPhoto(photo)
    const imgMaxSizeY = getGridPhotoMaxHeight(kind, boxMaxSizeX)
    const aspectRatio = photo.w / photo.h
    const imageWidth = Math.min(photo.w, boxMaxSizeX, imgMaxSizeY * aspectRatio)
    const imageHeight = imageWidth / aspectRatio
    const cardHeight = imageHeight + GRID_CAPTION_HEIGHT
    rowHeights[row] = Math.max(rowHeights[row] ?? 0, cardHeight)
    items.push({
      index,
      id: photo.id,
      row,
      column,
      x: 0,
      y: 0,
      width: imageWidth,
      height: cardHeight,
      imageWidth,
      imageHeight,
    })
  }

  let rowTop = GRID_TOP_PADDING
  for (let row = 0; row < rowHeights.length; row++) {
    const rowHeight = rowHeights[row]!
    for (let column = 0; column < columns; column++) {
      const index = row * columns + column
      if (index >= items.length) break
      const item = items[index]!
      const cellLeft = GRID_SIDE_PADDING + column * (boxMaxSizeX + GRID_GAP)
      item.x = cellLeft + (boxMaxSizeX - item.width) / 2
      item.y = rowTop
    }
    rowTop += rowHeight + GRID_GAP
  }

  return {
    columns,
    boxMaxSizeX,
    contentWidth,
    totalHeight: rowTop - GRID_GAP + GRID_TOP_PADDING,
    items,
    rowHeights,
  }
}

export function computeLineLayout(photos: PhotoData[], focusedIndex: number, viewportWidth: number, viewportHeight: number, scrollTop: number): LineItemLayout[] {
  const imageAreaHeight = Math.max(220, Math.min(viewportHeight - LINE_TOP_PADDING - LINE_CAPTION_HEIGHT - 28, viewportWidth * 0.5))
  const focusedPhoto = photos[focusedIndex]!
  const focusedAspectRatio = focusedPhoto.w / focusedPhoto.h
  const focusedImageWidth = Math.min(viewportWidth - 160, imageAreaHeight * focusedAspectRatio)
  const focusedImageHeight = focusedImageWidth / focusedAspectRatio
  const focusedCardHeight = focusedImageHeight + LINE_CAPTION_HEIGHT
  const focusedY = scrollTop + Math.max(LINE_TOP_PADDING, (viewportHeight - focusedCardHeight) / 2)

  const items: LineItemLayout[] = new Array(photos.length)
  items[focusedIndex] = {
    index: focusedIndex,
    id: focusedPhoto.id,
    x: (viewportWidth - focusedImageWidth) / 2,
    y: focusedY,
    width: focusedImageWidth,
    height: focusedCardHeight,
    imageHeight: focusedImageHeight,
    isFocused: true,
  }

  let cursorX = items[focusedIndex]!.x - LINE_GAP
  for (let index = focusedIndex - 1; index >= 0; index--) {
    const photo = photos[index]!
    const aspectRatio = photo.w / photo.h
    const imageHeight = imageAreaHeight * 0.7
    const imageWidth = imageHeight * aspectRatio
    const cardHeight = imageHeight + LINE_CAPTION_HEIGHT
    cursorX -= imageWidth
    items[index] = {
      index,
      id: photo.id,
      x: cursorX,
      y: scrollTop + Math.max(LINE_TOP_PADDING, (viewportHeight - cardHeight) / 2),
      width: imageWidth,
      height: cardHeight,
      imageHeight,
      isFocused: false,
    }
    cursorX -= LINE_GAP
  }

  cursorX = items[focusedIndex]!.x + focusedImageWidth + LINE_GAP
  for (let index = focusedIndex + 1; index < photos.length; index++) {
    const photo = photos[index]!
    const aspectRatio = photo.w / photo.h
    const imageHeight = imageAreaHeight * 0.7
    const imageWidth = imageHeight * aspectRatio
    const cardHeight = imageHeight + LINE_CAPTION_HEIGHT
    items[index] = {
      index,
      id: photo.id,
      x: cursorX,
      y: scrollTop + Math.max(LINE_TOP_PADDING, (viewportHeight - cardHeight) / 2),
      width: imageWidth,
      height: cardHeight,
      imageHeight,
      isFocused: false,
    }
    cursorX += imageWidth + LINE_GAP
  }

  return items
}

export function resolveLineModeClickAction(pointerX: number, viewportWidth: number, focusedIndex: number, photoCount: number): LineModeClickAction {
  if (pointerX <= LINE_SIDE_HIT_WIDTH && focusedIndex > 0) return {type: 'previous'}
  if (pointerX >= viewportWidth - LINE_SIDE_HIT_WIDTH && focusedIndex < photoCount - 1) return {type: 'next'}
  return {type: 'dismiss'}
}

export function getVisibleGridIndices(layout: GridLayout, scrollTop: number, viewportHeight: number, overscan: number) {
  const visibleIndices: number[] = []
  const minY = scrollTop - overscan
  const maxY = scrollTop + viewportHeight + overscan
  for (let index = 0; index < layout.items.length; index++) {
    const item = layout.items[index]!
    if (item.y + item.height >= minY && item.y <= maxY) visibleIndices.push(index)
  }
  return visibleIndices
}
