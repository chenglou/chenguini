import type {PhotoData} from './data'

export const GRID_MIN_CARD_WIDTH = 220
export const GRID_GAP = 24
export const GRID_PAGE_PADDING = 32
export const GRID_TOP_PADDING = 40
export const GRID_CAPTION_VISIBLE_TEXT_HEIGHT = 44
export const GRID_CAPTION_BOTTOM_PADDING = 8
export const GRID_CAPTION_HEIGHT = GRID_CAPTION_VISIBLE_TEXT_HEIGHT + GRID_CAPTION_BOTTOM_PADDING
export const GRID_MAX_COLUMNS = 7

export const LINE_LEFT_STRIP_WIDTH = 100
export const LINE_RIGHT_STRIP_WIDTH = 100
export const LINE_HORIZONTAL_GAP = 52
export const LINE_NON_FOCUSED_SCALE = 0.7
export const LINE_TOP_PADDING_FLOOR = 40
export const LINE_CAPTION_VISIBLE_TEXT_HEIGHT = 64
export const LINE_CAPTION_BOTTOM_PADDING = 8
export const LINE_CAPTION_HEIGHT =
  LINE_CAPTION_VISIBLE_TEXT_HEIGHT + LINE_CAPTION_BOTTOM_PADDING
export const LINE_IMAGE_TO_BOTTOM_PADDING_GAP = 28

export type GridCardLayout = {
  id: string
  index: number
  row: number
  column: number
  x: number
  y: number
  rowTop: number
  rowHeight: number
  cardWidth: number
  cardHeight: number
  imageWidth: number
  imageHeight: number
}

export type GridLayout = {
  columns: number
  columnWidth: number
  contentWidth: number
  totalHeight: number
  rowTops: number[]
  rowHeights: number[]
  cards: GridCardLayout[]
}

export type LineCardLayout = {
  id: string
  index: number
  x: number
  y: number
  cardWidth: number
  cardHeight: number
  imageWidth: number
  imageHeight: number
  isFocused: boolean
}

export function computeGridLayout({
  viewportWidth,
  items,
}: {
  viewportWidth: number
  items: PhotoData[]
}): GridLayout {
  const contentWidth = Math.max(0, viewportWidth - GRID_PAGE_PADDING * 2)
  const columns = clamp(
    Math.floor((contentWidth + GRID_GAP) / (GRID_MIN_CARD_WIDTH + GRID_GAP)),
    1,
    GRID_MAX_COLUMNS,
  )
  const columnWidth =
    columns === 1
      ? contentWidth
      : (contentWidth - GRID_GAP * (columns - 1)) / columns

  const cards = new Array<GridCardLayout>(items.length)
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index]
    if (item == null) continue

    const aspectRatio = item.w / item.h
    const maxImageHeight = getGridMaxImageHeight(columnWidth, aspectRatio)
    const imageWidth = Math.min(item.w, columnWidth, maxImageHeight * aspectRatio)
    const imageHeight = imageWidth / aspectRatio
    const cardWidth = imageWidth
    const cardHeight = imageHeight + GRID_CAPTION_HEIGHT
    cards[index] = {
      id: item.id,
      index,
      row: Math.floor(index / columns),
      column: index % columns,
      x: 0,
      y: 0,
      rowTop: 0,
      rowHeight: 0,
      cardWidth,
      cardHeight,
      imageWidth,
      imageHeight,
    }
  }

  const rowTops: number[] = []
  const rowHeights: number[] = []
  let y = GRID_TOP_PADDING
  const rowCount = Math.ceil(items.length / columns)
  for (let row = 0; row < rowCount; row += 1) {
    rowTops[row] = y
    const start = row * columns
    const end = Math.min(items.length, start + columns)
    let rowHeight = 0
    for (let index = start; index < end; index += 1) {
      const card = cards[index]
      if (card == null) continue
      rowHeight = Math.max(rowHeight, card.cardHeight)
    }
    rowHeights[row] = rowHeight
    y += rowHeight + GRID_GAP
  }

  for (let index = 0; index < cards.length; index += 1) {
    const card = cards[index]
    if (card == null) continue
    const rowTop = rowTops[card.row] ?? GRID_TOP_PADDING
    const rowHeight = rowHeights[card.row] ?? 0
    const slotX = GRID_PAGE_PADDING + card.column * (columnWidth + GRID_GAP)
    card.x = slotX + (columnWidth - card.cardWidth) / 2
    card.y = rowTop
    card.rowTop = rowTop
    card.rowHeight = rowHeight
  }

  return {
    columns,
    columnWidth,
    contentWidth,
    totalHeight: items.length === 0 ? GRID_TOP_PADDING : y - GRID_GAP,
    rowTops,
    rowHeights,
    cards: cards.filter((card): card is GridCardLayout => card != null),
  }
}

export function computeLineLayout({
  viewportWidth,
  viewportHeight,
  items,
  focusedIndex,
}: {
  viewportWidth: number
  viewportHeight: number
  items: PhotoData[]
  focusedIndex: number
}): LineCardLayout[] {
  const imageAreaHeight = Math.max(
    180,
    viewportHeight -
      LINE_TOP_PADDING_FLOOR -
      LINE_IMAGE_TO_BOTTOM_PADDING_GAP -
      LINE_CAPTION_HEIGHT,
  )
  const maxFocusedWidth = Math.max(
    240,
    viewportWidth - LINE_LEFT_STRIP_WIDTH - LINE_RIGHT_STRIP_WIDTH - 48,
  )

  const cards = new Array<LineCardLayout>(items.length)
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index]
    if (item == null) continue

    const aspectRatio = item.w / item.h
    const naturalImageWidth = Math.min(item.w, maxFocusedWidth, imageAreaHeight * aspectRatio)
    const naturalImageHeight = naturalImageWidth / aspectRatio
    const scale = index === focusedIndex ? 1 : LINE_NON_FOCUSED_SCALE
    const imageWidth = naturalImageWidth * scale
    const imageHeight = naturalImageHeight * scale
    cards[index] = {
      id: item.id,
      index,
      x: 0,
      y: LINE_TOP_PADDING_FLOOR + Math.max(0, (imageAreaHeight - imageHeight) / 2),
      cardWidth: imageWidth,
      cardHeight: imageHeight + LINE_IMAGE_TO_BOTTOM_PADDING_GAP + LINE_CAPTION_HEIGHT,
      imageWidth,
      imageHeight,
      isFocused: index === focusedIndex,
    }
  }

  const focusedCard = cards[focusedIndex]
  if (focusedCard == null) return []

  const centeredX = viewportWidth / 2 - focusedCard.cardWidth / 2
  focusedCard.x = centeredX
  for (let index = focusedIndex - 1; index >= 0; index -= 1) {
    const next = cards[index + 1]
    const current = cards[index]
    if (next == null || current == null) continue
    current.x = next.x - current.cardWidth - LINE_HORIZONTAL_GAP
  }
  for (let index = focusedIndex + 1; index < cards.length; index += 1) {
    const previous = cards[index - 1]
    const current = cards[index]
    if (previous == null || current == null) continue
    current.x = previous.x + previous.cardWidth + LINE_HORIZONTAL_GAP
  }

  return cards.filter((card): card is LineCardLayout => card != null)
}

export function routeLineModeClick({
  viewportWidth,
  pointerX,
  hasPrevious,
  hasNext,
}: {
  viewportWidth: number
  pointerX: number
  hasPrevious: boolean
  hasNext: boolean
}) {
  if (pointerX <= LINE_LEFT_STRIP_WIDTH && hasPrevious) return 'previous'
  if (pointerX >= viewportWidth - LINE_RIGHT_STRIP_WIDTH && hasNext) return 'next'
  return 'dismiss'
}

export function getVisibleGridRows({
  rowTops,
  rowHeights,
  scrollTop,
  viewportHeight,
  overscan,
}: {
  rowTops: number[]
  rowHeights: number[]
  scrollTop: number
  viewportHeight: number
  overscan: number
}) {
  const minY = scrollTop - overscan
  const maxY = scrollTop + viewportHeight + overscan
  let first = 0
  while (first < rowTops.length && rowTops[first]! + (rowHeights[first] ?? 0) < minY) {
    first += 1
  }
  let last = first
  while (last < rowTops.length && rowTops[last]! <= maxY) {
    last += 1
  }
  const maxRow = Math.max(0, rowTops.length - 1)
  return {
    firstRow: clamp(first, 0, maxRow),
    lastRow: clamp(last - 1, 0, maxRow),
  }
}

export function computeDismissScrollTop({
  currentScrollTop,
  viewportHeight,
  rowTop,
  rowHeight,
}: {
  currentScrollTop: number
  viewportHeight: number
  rowTop: number
  rowHeight: number
}) {
  const peek = 40
  const rowBottom = rowTop + rowHeight
  if (
    rowTop >= currentScrollTop + peek &&
    rowBottom <= currentScrollTop + viewportHeight
  ) {
    return currentScrollTop
  }
  return Math.max(0, rowTop - peek)
}

function getGridMaxImageHeight(columnWidth: number, aspectRatio: number) {
  if (aspectRatio === 1) return columnWidth * 0.85
  if (aspectRatio < 1) return columnWidth * 1.05
  return columnWidth
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}
