import type {PhotoData} from './data'

export const GRID_MIN_CARD_WIDTH = 220
export const GRID_GAP = 24
export const GRID_PAGE_PADDING = 32
export const GRID_TOP_PADDING = 40
export const GRID_CAPTION_HEIGHT = 52
export const GRID_MAX_COLUMNS = 7
export const LINE_NAV_WIDTH = 100
export const LINE_CARD_GAP = 52
export const LINE_OTHER_SCALE = 0.7
export const LINE_TOP_PADDING = 40
export const LINE_CAPTION_HEIGHT = 72
export const LINE_IMAGE_BOTTOM_GAP = 28

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

  const cards = items.map((item, index) => {
    const aspectRatio = item.w / item.h
    const imageMaxHeight = getGridImageMaxHeight(columnWidth, aspectRatio)
    const imageWidth = Math.min(item.w, columnWidth, imageMaxHeight * aspectRatio)
    const imageHeight = imageWidth / aspectRatio
    const cardWidth = imageWidth
    const cardHeight = imageHeight + GRID_CAPTION_HEIGHT
    return {
      id: item.id,
      index,
      row: Math.floor(index / columns),
      column: index % columns,
      imageWidth,
      imageHeight,
      cardWidth,
      cardHeight,
    }
  })

  const rowTops: number[] = []
  const rowHeights: number[] = []
  let y = GRID_TOP_PADDING
  const rowCount = Math.ceil(items.length / columns)
  for (let row = 0; row < rowCount; row += 1) {
    rowTops[row] = y
    const start = row * columns
    const rowCards = cards.slice(start, start + columns)
    let rowHeight = 0
    for (const card of rowCards) {
      rowHeight = Math.max(rowHeight, card.cardHeight)
    }
    rowHeights[row] = rowHeight
    y += rowHeight + GRID_GAP
  }

  const positionedCards: GridCardLayout[] = cards.map((card) => {
    const rowTop = rowTops[card.row] ?? GRID_TOP_PADDING
    const rowHeight = rowHeights[card.row] ?? 0
    const slotX = GRID_PAGE_PADDING + card.column * (columnWidth + GRID_GAP)
    return {
      ...card,
      x: slotX + (columnWidth - card.cardWidth) / 2,
      y: rowTop,
      rowTop,
      rowHeight,
    }
  })

  return {
    columns,
    columnWidth,
    contentWidth,
    totalHeight: items.length === 0 ? GRID_TOP_PADDING : y - GRID_GAP,
    rowTops,
    rowHeights,
    cards: positionedCards,
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
    viewportHeight - LINE_TOP_PADDING - LINE_IMAGE_BOTTOM_GAP - LINE_CAPTION_HEIGHT,
  )
  const maxFocusedWidth = Math.max(240, viewportWidth - LINE_NAV_WIDTH * 2 - 48)
  const cards = items.map((item, index) => {
    const aspectRatio = item.w / item.h
    const naturalImageWidth = Math.min(
      item.w,
      maxFocusedWidth,
      imageAreaHeight * aspectRatio,
    )
    const naturalImageHeight = naturalImageWidth / aspectRatio
    const scale = index === focusedIndex ? 1 : LINE_OTHER_SCALE
    const imageWidth = naturalImageWidth * scale
    const imageHeight = naturalImageHeight * scale
    const cardWidth = imageWidth
    const cardHeight = imageHeight + LINE_IMAGE_BOTTOM_GAP + LINE_CAPTION_HEIGHT
    return {
      id: item.id,
      index,
      x: 0,
      y: LINE_TOP_PADDING + Math.max(0, (imageAreaHeight - imageHeight) / 2),
      cardWidth,
      cardHeight,
      imageWidth,
      imageHeight,
      isFocused: index === focusedIndex,
    }
  })

  const focusedCard = cards[focusedIndex]
  if (focusedCard == null) return []

  const centeredX = viewportWidth / 2 - focusedCard.cardWidth / 2
  for (let index = 0; index < cards.length; index += 1) {
    const card = cards[index]
    if (index === focusedIndex) {
      card.x = centeredX
      continue
    }

    if (index < focusedIndex) {
      let x = centeredX
      for (let i = focusedIndex - 1; i >= index; i -= 1) {
        x -= cards[i].cardWidth + LINE_CARD_GAP
      }
      card.x = x
      continue
    }

    let x = centeredX + focusedCard.cardWidth + LINE_CARD_GAP
    for (let i = focusedIndex + 1; i < index; i += 1) {
      x += cards[i].cardWidth + LINE_CARD_GAP
    }
    card.x = x
  }

  return cards
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
  if (pointerX <= LINE_NAV_WIDTH && hasPrevious) return 'previous'
  if (pointerX >= viewportWidth - LINE_NAV_WIDTH && hasNext) return 'next'
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
  while (
    first < rowTops.length &&
    rowTops[first]! + (rowHeights[first] ?? 0) < minY
  ) {
    first += 1
  }
  let last = first
  while (last < rowTops.length && rowTops[last]! <= maxY) {
    last += 1
  }
  return {
    firstRow: clamp(first, 0, Math.max(0, rowTops.length - 1)),
    lastRow: clamp(last - 1, 0, Math.max(0, rowTops.length - 1)),
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

function getGridImageMaxHeight(columnWidth: number, aspectRatio: number) {
  if (aspectRatio === 1) return columnWidth * 0.85
  if (aspectRatio < 1) return columnWidth * 1.05
  return columnWidth
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}
