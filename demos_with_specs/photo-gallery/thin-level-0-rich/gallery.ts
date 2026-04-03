import type {PhotoData} from './data'

export const GRID_SIDE_PADDING = 32
export const GRID_GAP = 24
export const GRID_TOP_PADDING = 40
export const GRID_CAPTION_HEIGHT = 52
export const GRID_TARGET_MIN_CARD_WIDTH = 220
export const GRID_MAX_COLUMNS = 7
export const GRID_OVERSCAN = 120

export const LINE_NEIGHBOR_SCALE = 0.7
export const LINE_CARD_GAP = 52
export const LINE_BOTTOM_GAP = 28
export const LINE_TOP_FLOOR = 40
export const LINE_SIDE_STRIP = 100
export const LINE_CAPTION_HEIGHT = 72
export const LINE_ROUTE_HASH_KEY = 'photo'
export const SCENARIO_REPORT_NODE_ID = 'scenario-report'

export type Route =
  | {type: 'grid'}
  | {type: 'line'; photoId: string}

export type LineClickAction = 'prev' | 'next' | 'dismiss'

export type GridCardLayout = {
  cardHeight: number
  cardWidth: number
  columnIndex: number
  imageHeight: number
  imageLeft: number
  imageWidth: number
  left: number
  photoId: string
  rowHeight: number
  rowIndex: number
  top: number
}

export type GridLayout = {
  boxMaxSizeX: number
  cards: GridCardLayout[]
  cardsById: Map<string, GridCardLayout>
  columnCount: number
  rowHeights: number[]
  rowTops: number[]
  totalHeight: number
}

export type LineCardLayout = {
  cardHeight: number
  cardWidth: number
  imageHeight: number
  imageWidth: number
  left: number
  photoId: string
  scale: number
  top: number
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function getGridImageMaxHeight(boxMaxSizeX: number, aspectRatio: number): number {
  if (aspectRatio > 1.05) return boxMaxSizeX
  if (aspectRatio < 0.95) return boxMaxSizeX * 1.05
  return boxMaxSizeX * 0.85
}

export function computeGridLayout(input: {
  photos: PhotoData[]
  viewportWidth: number
}): GridLayout {
  const availableWidth = Math.max(0, input.viewportWidth - GRID_SIDE_PADDING * 2)
  const roughColumnCount = Math.floor((availableWidth + GRID_GAP) / (GRID_TARGET_MIN_CARD_WIDTH + GRID_GAP))
  const columnCount = clamp(roughColumnCount, 1, GRID_MAX_COLUMNS)
  const boxMaxSizeX = (availableWidth - GRID_GAP * (columnCount - 1)) / columnCount

  const cards: GridCardLayout[] = []
  const rowHeights: number[] = []

  for (let index = 0; index < input.photos.length; index += 1) {
    const photo = input.photos[index]!
    const rowIndex = Math.floor(index / columnCount)
    const columnIndex = index % columnCount
    const aspectRatio = photo.w / photo.h
    const maxImageHeight = getGridImageMaxHeight(boxMaxSizeX, aspectRatio)
    const imageWidth = Math.min(photo.w, boxMaxSizeX, maxImageHeight * aspectRatio)
    const imageHeight = imageWidth / aspectRatio
    const cardHeight = imageHeight + GRID_CAPTION_HEIGHT

    rowHeights[rowIndex] = Math.max(rowHeights[rowIndex] ?? 0, cardHeight)

    cards.push({
      cardHeight,
      cardWidth: boxMaxSizeX,
      columnIndex,
      imageHeight,
      imageLeft: (boxMaxSizeX - imageWidth) / 2,
      imageWidth,
      left: GRID_SIDE_PADDING + columnIndex * (boxMaxSizeX + GRID_GAP),
      photoId: photo.id,
      rowHeight: 0,
      rowIndex,
      top: 0,
    })
  }

  const rowTops: number[] = []
  let nextRowTop = GRID_TOP_PADDING
  for (let rowIndex = 0; rowIndex < rowHeights.length; rowIndex += 1) {
    rowTops[rowIndex] = nextRowTop
    nextRowTop += rowHeights[rowIndex]! + GRID_GAP
  }

  const cardsById = new Map<string, GridCardLayout>()
  for (const card of cards) {
    const resolvedCard = {
      ...card,
      rowHeight: rowHeights[card.rowIndex]!,
      top: rowTops[card.rowIndex]!,
    }
    cardsById.set(resolvedCard.photoId, resolvedCard)
  }

  const resolvedCards = cards.map((card) => cardsById.get(card.photoId)!)
  const totalHeight =
    rowHeights.length === 0
      ? GRID_TOP_PADDING * 2
      : rowTops[rowTops.length - 1]! + rowHeights[rowHeights.length - 1]! + GRID_TOP_PADDING

  return {
    boxMaxSizeX,
    cards: resolvedCards,
    cardsById,
    columnCount,
    rowHeights,
    rowTops,
    totalHeight,
  }
}

export function getMountedPhotoIds(input: {
  layout: GridLayout
  scrollTop: number
  viewportHeight: number
  overscan?: number
}): string[] {
  const overscan = input.overscan ?? GRID_OVERSCAN
  const minY = input.scrollTop - overscan
  const maxY = input.scrollTop + input.viewportHeight + overscan

  return input.layout.cards
    .filter((card) => card.top + card.rowHeight >= minY && card.top <= maxY)
    .map((card) => card.photoId)
}

export function resolveLineClickAction(input: {
  clientX: number
  viewportWidth: number
}): LineClickAction {
  if (input.clientX < LINE_SIDE_STRIP) return 'prev'
  if (input.clientX > input.viewportWidth - LINE_SIDE_STRIP) return 'next'
  return 'dismiss'
}

function getLineCardDimensions(photo: PhotoData, viewportWidth: number, viewportHeight: number): {
  cardHeight: number
  cardWidth: number
  imageHeight: number
  imageWidth: number
} {
  const aspectRatio = photo.w / photo.h
  const maxImageWidth = Math.max(220, viewportWidth - LINE_SIDE_STRIP * 2 - 40)
  const maxImageHeight = Math.max(180, viewportHeight - LINE_TOP_FLOOR - LINE_BOTTOM_GAP - LINE_CAPTION_HEIGHT)
  const imageWidth = Math.min(photo.w, maxImageWidth, maxImageHeight * aspectRatio)
  const imageHeight = imageWidth / aspectRatio

  return {
    cardHeight: imageHeight + LINE_CAPTION_HEIGHT,
    cardWidth: imageWidth,
    imageHeight,
    imageWidth,
  }
}

export function computeLineLayout(input: {
  focusedPhotoId: string
  photos: PhotoData[]
  viewportHeight: number
  viewportWidth: number
}): Map<string, LineCardLayout> {
  const focusedIndex = input.photos.findIndex((photo) => photo.id === input.focusedPhotoId)
  if (focusedIndex < 0) {
    return new Map()
  }

  const dimensions = input.photos.map((photo) =>
    getLineCardDimensions(photo, input.viewportWidth, input.viewportHeight),
  )
  const scales = dimensions.map((_, index) => (index === focusedIndex ? 1 : LINE_NEIGHBOR_SCALE))
  const centers = new Array<number>(input.photos.length)

  centers[focusedIndex] = input.viewportWidth / 2
  for (let index = focusedIndex + 1; index < input.photos.length; index += 1) {
    centers[index] =
      centers[index - 1]! +
      (dimensions[index - 1]!.cardWidth * scales[index - 1]!) / 2 +
      LINE_CARD_GAP +
      (dimensions[index]!.cardWidth * scales[index]!) / 2
  }
  for (let index = focusedIndex - 1; index >= 0; index -= 1) {
    centers[index] =
      centers[index + 1]! -
      (dimensions[index + 1]!.cardWidth * scales[index + 1]!) / 2 -
      LINE_CARD_GAP -
      (dimensions[index]!.cardWidth * scales[index]!) / 2
  }

  const focusedCard = dimensions[focusedIndex]!
  const top = Math.max(
    LINE_TOP_FLOOR,
    (input.viewportHeight - focusedCard.cardHeight - LINE_BOTTOM_GAP) / 2,
  )
  const cardsById = new Map<string, LineCardLayout>()
  for (let index = 0; index < input.photos.length; index += 1) {
    const photo = input.photos[index]!
    const card = dimensions[index]!
    cardsById.set(photo.id, {
      ...card,
      left: centers[index]! - card.cardWidth / 2,
      photoId: photo.id,
      scale: scales[index]!,
      top,
    })
  }
  return cardsById
}

export function getFocusedPhotoHash(photoId: string): string {
  const params = new URLSearchParams()
  params.set(LINE_ROUTE_HASH_KEY, photoId)
  return `#${params.toString()}`
}

export function parseFocusedPhotoHash(hash: string, knownPhotoIds: Set<string>): Route {
  const params = new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash)
  const photoId = params.get(LINE_ROUTE_HASH_KEY)
  if (photoId == null || !knownPhotoIds.has(photoId)) {
    return {type: 'grid'}
  }
  return {type: 'line', photoId}
}

export function routesMatch(a: Route, b: Route): boolean {
  if (a.type !== b.type) return false
  if (a.type === 'grid') return true
  return a.photoId === b.photoId
}
