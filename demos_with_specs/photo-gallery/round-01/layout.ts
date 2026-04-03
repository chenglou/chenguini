import type { PhotoData } from './data'

export const GRID_MIN_CARD_WIDTH = 220
export const GRID_MAX_COLUMNS = 7
export const GRID_GAP = 24
export const GRID_TOP_PADDING = 40
export const GRID_CAPTION_HEIGHT = 52
export const GRID_BOTTOM_PADDING = 480
export const GRID_SIDE_PADDING = 32

export const LINE_SIDE_HIT_WIDTH = 100
export const LINE_GAP = 52
export const LINE_TOP_PADDING = 40
export const LINE_CAPTION_HEIGHT = 72
export const LINE_IMAGE_TO_CAPTION_GAP = 28

export type GridBoxSize = {
  width: number
  height: number
  imageWidth: number
  imageHeight: number
  captionHeight: number
}

export type GridRow = {
  index: number
  y: number
  height: number
  startIndex: number
  endIndex: number
}

export type GridCardLayout = GridBoxSize & {
  id: string
  index: number
  rowIndex: number
  columnIndex: number
  x: number
  y: number
}

export type GridLayout = {
  columnCount: number
  columnWidth: number
  rows: GridRow[]
  cards: GridCardLayout[]
  totalHeight: number
}

export type LineCardLayout = {
  id: string
  index: number
  x: number
  y: number
  width: number
  height: number
  imageWidth: number
  imageHeight: number
  captionHeight: number
  scale: number
}

export type LineLayout = {
  cards: LineCardLayout[]
  focusedIndex: number
  imageAreaTop: number
  imageAreaHeight: number
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function fitPhotoWithinBox(photo: PhotoData, maxWidth: number, maxHeight: number) {
  const aspect = photo.w / photo.h
  const width = Math.min(photo.w, maxWidth, maxHeight * aspect)
  return { width, height: width / aspect }
}

export function computeColumnCount(containerWidth: number) {
  return clamp(
    Math.floor((containerWidth + GRID_GAP) / (GRID_MIN_CARD_WIDTH + GRID_GAP)),
    1,
    GRID_MAX_COLUMNS,
  )
}

export function computeGridBoxSize(photo: PhotoData, boxMaxSizeX: number): GridBoxSize {
  const aspect = photo.w / photo.h
  const imageMaxHeight =
    Math.abs(aspect - 1) < 0.05
      ? boxMaxSizeX * 0.85
      : aspect < 1
        ? boxMaxSizeX * 1.05
        : boxMaxSizeX

  const imageWidth = Math.min(photo.w, boxMaxSizeX, imageMaxHeight * aspect)
  const imageHeight = imageWidth / aspect

  return {
    width: imageWidth,
    height: imageHeight + GRID_CAPTION_HEIGHT,
    imageWidth,
    imageHeight,
    captionHeight: GRID_CAPTION_HEIGHT,
  }
}

export function computeGridLayout(photos: PhotoData[], containerWidth: number): GridLayout {
  const columnCount = computeColumnCount(containerWidth)
  const columnWidth =
    (containerWidth - GRID_GAP * Math.max(0, columnCount - 1)) / columnCount
  const rowCount = Math.ceil(photos.length / columnCount)
  const rows: GridRow[] = []
  const rowHeights = new Array<number>(rowCount).fill(0)

  for (let index = 0; index < photos.length; index++) {
    const rowIndex = Math.floor(index / columnCount)
    const box = computeGridBoxSize(photos[index]!, columnWidth)
    rowHeights[rowIndex] = Math.max(rowHeights[rowIndex]!, box.height)
  }

  let rowY = GRID_TOP_PADDING
  for (let rowIndex = 0; rowIndex < rowCount; rowIndex++) {
    const startIndex = rowIndex * columnCount
    const endIndex = Math.min(photos.length - 1, startIndex + columnCount - 1)
    const height = rowHeights[rowIndex]!
    rows.push({ index: rowIndex, y: rowY, height, startIndex, endIndex })
    rowY += height + GRID_GAP
  }

  const cards: GridCardLayout[] = []
  for (let index = 0; index < photos.length; index++) {
    const photo = photos[index]!
    const rowIndex = Math.floor(index / columnCount)
    const columnIndex = index % columnCount
    const row = rows[rowIndex]!
    const box = computeGridBoxSize(photo, columnWidth)
    const columnX = columnIndex * (columnWidth + GRID_GAP)
    const x = columnX + (columnWidth - box.width) / 2
    cards.push({
      id: photo.id,
      index,
      rowIndex,
      columnIndex,
      x,
      y: row.y,
      width: box.width,
      height: box.height,
      imageWidth: box.imageWidth,
      imageHeight: box.imageHeight,
      captionHeight: box.captionHeight,
    })
  }

  const lastRow = rows.at(-1)
  return {
    columnCount,
    columnWidth,
    rows,
    cards,
    totalHeight:
      lastRow == null ? GRID_TOP_PADDING + GRID_BOTTOM_PADDING : lastRow.y + lastRow.height + GRID_BOTTOM_PADDING,
  }
}

export function computeVisibleGridIds(
  layout: GridLayout,
  scrollTop: number,
  viewportHeight: number,
  overscan = 320,
) {
  const minY = scrollTop - overscan
  const maxY = scrollTop + viewportHeight + overscan
  const visibleIds: string[] = []

  for (const card of layout.cards) {
    if (card.y + card.height < minY || card.y > maxY) continue
    visibleIds.push(card.id)
  }

  return visibleIds
}

export function findFirstVisibleCard(
  layout: GridLayout,
  scrollTop: number,
  viewportHeight: number,
) {
  const minY = scrollTop
  const maxY = scrollTop + viewportHeight
  for (const card of layout.cards) {
    if (card.y + card.height >= minY && card.y <= maxY) return card
  }
  return null
}

export function findGridCardById(layout: GridLayout, id: string) {
  for (const card of layout.cards) {
    if (card.id === id) return card
  }
  return null
}

export function computeLineLayout(
  photos: PhotoData[],
  focusedIndex: number,
  viewportWidth: number,
  viewportHeight: number,
): LineLayout {
  const imageAreaHeight = Math.max(
    220,
    viewportHeight - LINE_TOP_PADDING - LINE_CAPTION_HEIGHT - LINE_IMAGE_TO_CAPTION_GAP - 36,
  )
  const imageAreaTop = Math.max(
    LINE_TOP_PADDING,
    (viewportHeight -
      (imageAreaHeight + LINE_IMAGE_TO_CAPTION_GAP + LINE_CAPTION_HEIGHT)) /
      2,
  )
  const baseMaxWidth = Math.max(260, Math.min(viewportWidth * 0.52, viewportWidth - 360))
  const cards: LineCardLayout[] = new Array(photos.length)

  for (let index = 0; index < photos.length; index++) {
    const photo = photos[index]!
    const scale = index === focusedIndex ? 1 : 0.7
    const fitted = fitPhotoWithinBox(photo, baseMaxWidth, imageAreaHeight)
    const width = fitted.width * scale
    const imageHeight = fitted.height * scale
    const height = imageHeight + LINE_IMAGE_TO_CAPTION_GAP + LINE_CAPTION_HEIGHT
    const y = imageAreaTop + (imageAreaHeight - imageHeight) / 2
    cards[index] = {
      id: photo.id,
      index,
      x: 0,
      y,
      width,
      height,
      imageWidth: width,
      imageHeight,
      captionHeight: LINE_CAPTION_HEIGHT,
      scale,
    }
  }

  const focusedCard = cards[focusedIndex]!
  focusedCard.x = viewportWidth / 2 - focusedCard.width / 2

  let cursorRight = focusedCard.x + focusedCard.width + LINE_GAP
  for (let index = focusedIndex + 1; index < cards.length; index++) {
    const card = cards[index]!
    card.x = cursorRight
    cursorRight += card.width + LINE_GAP
  }

  let cursorLeft = focusedCard.x - LINE_GAP
  for (let index = focusedIndex - 1; index >= 0; index--) {
    const card = cards[index]!
    card.x = cursorLeft - card.width
    cursorLeft = card.x - LINE_GAP
  }

  return { cards, focusedIndex, imageAreaTop, imageAreaHeight }
}

export function routeLineModeClick({
  x,
  viewportWidth,
}: {
  x: number
  viewportWidth: number
}) {
  if (x < LINE_SIDE_HIT_WIDTH) return 'previous'
  if (x > viewportWidth - LINE_SIDE_HIT_WIDTH) return 'next'
  return 'dismiss'
}
