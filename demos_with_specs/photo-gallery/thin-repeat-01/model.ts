import type {PhotoData} from './data'

export const GRID_SIDE_PADDING = 32
export const GRID_GAP = 24
export const GRID_TOP_PADDING = 40
export const GRID_MAX_COLUMNS = 7
export const GRID_MIN_TARGET_CARD_WIDTH = 220
export const GRID_CAPTION_VISIBLE_HEIGHT = 44
export const GRID_CAPTION_BOTTOM = 8
export const GRID_CAPTION_TOTAL = GRID_CAPTION_VISIBLE_HEIGHT + GRID_CAPTION_BOTTOM

export const LINE_LEFT_STRIP = 100
export const LINE_RIGHT_STRIP = 100
export const LINE_NEIGHBOR_SCALE = 0.7
export const LINE_GAP = 52
export const LINE_BOTTOM_GAP = 28
export const LINE_CAPTION_VISIBLE_HEIGHT = 64
export const LINE_CAPTION_BOTTOM = 8
export const LINE_CAPTION_TOTAL = LINE_CAPTION_VISIBLE_HEIGHT + LINE_CAPTION_BOTTOM

export type GridRowLayout = {
  index: number
  top: number
  height: number
  itemIds: string[]
}

export type GridItemLayout = {
  id: string
  index: number
  rowIndex: number
  rowTop: number
  x: number
  y: number
  cardWidth: number
  imageHeight: number
  cardHeight: number
}

export type GridLayout = {
  boxMaxSizeX: number
  columnCount: number
  rows: GridRowLayout[]
  items: GridItemLayout[]
  itemsById: Map<string, GridItemLayout>
  contentHeight: number
}

export type LineClickResult = {
  kind: 'previous' | 'next' | 'dismiss'
  nextIndex: number
}

type PhotoKind = 'landscape' | 'square' | 'portrait'

export function buildGridLayout(photos: PhotoData[], viewportWidth: number): GridLayout {
  const columnCount = getGridColumnCount(viewportWidth)
  const availableWidth = Math.max(0, viewportWidth - GRID_SIDE_PADDING * 2)
  const boxMaxSizeX = Math.max(
    0,
    (availableWidth - GRID_GAP * (columnCount - 1)) / columnCount,
  )

  const rows: GridRowLayout[] = []
  const items: GridItemLayout[] = []
  const itemsById = new Map<string, GridItemLayout>()
  let cursorY = GRID_TOP_PADDING

  for (let startIndex = 0; startIndex < photos.length; startIndex += columnCount) {
    const rowPhotos = photos.slice(startIndex, startIndex + columnCount)
    const rowHeights = rowPhotos.map((photo) => {
      const cardWidth = boxMaxSizeX * getPhotoWidthFactor(getPhotoKind(photo))
      return (cardWidth * photo.h) / photo.w
    })
    const rowImageHeight = Math.max(...rowHeights)
    const rowHeight = rowImageHeight + GRID_CAPTION_TOTAL
    const rowIndex = rows.length
    const itemIds: string[] = []

    for (let columnIndex = 0; columnIndex < rowPhotos.length; columnIndex++) {
      const photo = rowPhotos[columnIndex]!
      const cardWidth = boxMaxSizeX * getPhotoWidthFactor(getPhotoKind(photo))
      const imageHeight = (cardWidth * photo.h) / photo.w
      const cellX = GRID_SIDE_PADDING + columnIndex * (boxMaxSizeX + GRID_GAP)
      const x = cellX + (boxMaxSizeX - cardWidth) / 2
      const item: GridItemLayout = {
        id: photo.id,
        index: startIndex + columnIndex,
        rowIndex,
        rowTop: cursorY,
        x,
        y: cursorY,
        cardWidth,
        imageHeight,
        cardHeight: imageHeight + GRID_CAPTION_VISIBLE_HEIGHT,
      }
      items.push(item)
      itemsById.set(photo.id, item)
      itemIds.push(photo.id)
    }

    rows.push({
      index: rowIndex,
      top: cursorY,
      height: rowHeight,
      itemIds,
    })

    cursorY += rowHeight + GRID_GAP
  }

  const contentHeight =
    rows.length === 0 ? GRID_TOP_PADDING : rows[rows.length - 1]!.top + rows[rows.length - 1]!.height

  return {
    boxMaxSizeX,
    columnCount,
    rows,
    items,
    itemsById,
    contentHeight,
  }
}

export function getVisibleRowRange(
  layout: GridLayout,
  scrollTop: number,
  viewportHeight: number,
): [number, number] {
  if (layout.rows.length === 0) return [0, 0]

  const viewportBottom = scrollTop + viewportHeight
  let firstVisible = 0
  while (
    firstVisible < layout.rows.length - 1 &&
    layout.rows[firstVisible]!.top + layout.rows[firstVisible]!.height < scrollTop
  ) {
    firstVisible++
  }

  let lastVisible = firstVisible
  while (
    lastVisible < layout.rows.length - 1 &&
    layout.rows[lastVisible]!.top <= viewportBottom
  ) {
    lastVisible++
  }
  if (layout.rows[lastVisible]!.top > viewportBottom && lastVisible > firstVisible) {
    lastVisible--
  }

  return [firstVisible, lastVisible]
}

export function getMountedItemIds(
  layout: GridLayout,
  visibleRowRange: [number, number],
): string[] {
  const mountedItemIds: string[] = []
  const [start, end] = visibleRowRange
  for (let rowIndex = start; rowIndex <= end; rowIndex++) {
    const row = layout.rows[rowIndex]
    if (row == null) continue
    mountedItemIds.push(...row.itemIds)
  }
  return mountedItemIds
}

export function routeLineClick(args: {
  clientX: number
  viewportWidth: number
  focusedIndex: number
  itemCount: number
}): LineClickResult {
  const {clientX, viewportWidth, focusedIndex, itemCount} = args
  if (clientX < LINE_LEFT_STRIP) {
    return {kind: 'previous', nextIndex: Math.max(0, focusedIndex - 1)}
  }
  if (clientX > viewportWidth - LINE_RIGHT_STRIP) {
    return {kind: 'next', nextIndex: Math.min(itemCount - 1, focusedIndex + 1)}
  }
  return {kind: 'dismiss', nextIndex: focusedIndex}
}

export function formatFocusedHash(photoId: string) {
  return `#photo=${encodeURIComponent(photoId)}`
}

export function parseFocusedHash(hash: string, knownIds: Set<string>): string | null {
  if (hash === '') return null
  const params = new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash)
  const rawPhotoId = params.get('photo')
  if (rawPhotoId == null) return null
  const photoId = decodeURIComponent(rawPhotoId)
  return knownIds.has(photoId) ? photoId : null
}

function getGridColumnCount(viewportWidth: number) {
  const availableWidth = Math.max(0, viewportWidth - GRID_SIDE_PADDING * 2)
  const targetColumns = Math.floor(
    (availableWidth + GRID_GAP) / (GRID_MIN_TARGET_CARD_WIDTH + GRID_GAP),
  )
  return clamp(targetColumns, 1, GRID_MAX_COLUMNS)
}

function getPhotoKind(photo: PhotoData): PhotoKind {
  if (photo.w === photo.h) return 'square'
  return photo.w > photo.h ? 'landscape' : 'portrait'
}

function getPhotoWidthFactor(photoKind: PhotoKind) {
  switch (photoKind) {
    case 'landscape':
      return 1
    case 'square':
      return 0.85
    case 'portrait':
      return 1.05
  }
}

function clamp(value: number, minValue: number, maxValue: number) {
  return Math.max(minValue, Math.min(maxValue, value))
}
