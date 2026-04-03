import type {PhotoData} from './data'

export const GRID_SIDE_PADDING = 32
export const GRID_GAP = 24
export const GRID_TOP_PADDING = 40
export const GRID_MAX_COLUMNS = 7
export const GRID_MIN_TARGET_CARD_WIDTH = 220
export const LINE_LEFT_STRIP = 100
export const LINE_RIGHT_STRIP = 100
export const LINE_NEIGHBOR_SCALE = 0.7
export const LINE_GAP = 52
export const LINE_BOTTOM_GAP = 28
export const GRID_CAPTION_VISIBLE = 44
export const GRID_CAPTION_BOTTOM = 8
export const LINE_CAPTION_VISIBLE = 64
export const LINE_CAPTION_BOTTOM = 8

export type PhotoOrientation = 'landscape' | 'square' | 'portrait'

export type GridItemLayout = {
  id: string
  index: number
  rowIndex: number
  x: number
  y: number
  width: number
  height: number
  imageHeight: number
}

export type GridRowLayout = {
  index: number
  y: number
  height: number
  itemIds: string[]
}

export type GridLayout = {
  availableWidth: number
  boxMaxSizeX: number
  columnCount: number
  totalHeight: number
  items: GridItemLayout[]
  rows: GridRowLayout[]
}

export type LineClickAction = 'previous' | 'dismiss' | 'next'

export function getPhotoOrientation(photo: PhotoData): PhotoOrientation {
  const ratio = photo.w / photo.h
  if (ratio > 1.1) return 'landscape'
  if (ratio < 0.9) return 'portrait'
  return 'square'
}

export function getGridBoxWidth(photo: PhotoData, boxMaxSizeX: number): number {
  switch (getPhotoOrientation(photo)) {
    case 'landscape':
      return boxMaxSizeX
    case 'square':
      return boxMaxSizeX * 0.85
    case 'portrait':
      return boxMaxSizeX * 1.05
  }
}

export function createGridLayout(photos: PhotoData[], viewportWidth: number): GridLayout {
  const availableWidth = Math.max(0, viewportWidth - GRID_SIDE_PADDING * 2)
  const columnCount = Math.max(
    1,
    Math.min(
      GRID_MAX_COLUMNS,
      Math.floor((availableWidth + GRID_GAP) / (GRID_MIN_TARGET_CARD_WIDTH + GRID_GAP)),
    ),
  )
  const boxMaxSizeX =
    columnCount === 0 ? 0 : (availableWidth - GRID_GAP * (columnCount - 1)) / columnCount

  const rows: GridRowLayout[] = []
  const items: GridItemLayout[] = []
  let rowWidth = 0
  let rowHeight = 0
  let rowY = GRID_TOP_PADDING
  let rowIndex = 0
  let rowItemIds: string[] = []

  function finalizeRow() {
    if (rowItemIds.length === 0) return
    rows.push({
      index: rowIndex,
      y: rowY,
      height: rowHeight,
      itemIds: rowItemIds,
    })
    rowY += rowHeight + GRID_GAP
    rowHeight = 0
    rowWidth = 0
    rowItemIds = []
    rowIndex += 1
  }

  for (let index = 0; index < photos.length; index += 1) {
    const photo = photos[index]!
    const width = getGridBoxWidth(photo, boxMaxSizeX)
    const imageHeight = width * (photo.h / photo.w)
    const height = imageHeight + GRID_CAPTION_VISIBLE + GRID_CAPTION_BOTTOM
    const nextWidth = rowItemIds.length === 0 ? width : rowWidth + GRID_GAP + width
    if (rowItemIds.length > 0 && nextWidth > availableWidth + 0.001) {
      finalizeRow()
    }

    const x = GRID_SIDE_PADDING + (rowItemIds.length === 0 ? 0 : rowWidth + GRID_GAP)
    rowWidth = rowItemIds.length === 0 ? width : rowWidth + GRID_GAP + width
    rowHeight = Math.max(rowHeight, height)
    rowItemIds.push(photo.id)
    items.push({
      id: photo.id,
      index,
      rowIndex,
      x,
      y: rowY,
      width,
      height,
      imageHeight,
    })
  }

  finalizeRow()

  const totalHeight = rows.length === 0 ? GRID_TOP_PADDING * 2 : rowY - GRID_GAP + GRID_TOP_PADDING
  return {
    availableWidth,
    boxMaxSizeX,
    columnCount,
    totalHeight,
    items,
    rows,
  }
}

export function getOccludedItemIds(layout: GridLayout, scrollTop: number, viewportHeight: number): string[] {
  const overscan = viewportHeight * 0.5
  const minY = scrollTop - overscan
  const maxY = scrollTop + viewportHeight + overscan
  const visibleIds: string[] = []
  for (let index = 0; index < layout.rows.length; index += 1) {
    const row = layout.rows[index]!
    if (row.y + row.height < minY || row.y > maxY) continue
    for (let idIndex = 0; idIndex < row.itemIds.length; idIndex += 1) {
      visibleIds.push(row.itemIds[idIndex]!)
    }
  }
  return visibleIds
}

export function getRowTopForPhoto(layout: GridLayout, photoId: string): number {
  for (let index = 0; index < layout.items.length; index += 1) {
    const item = layout.items[index]!
    if (item.id !== photoId) continue
    return layout.rows[item.rowIndex]!.y
  }
  throw new Error(`unknown photo: ${photoId}`)
}

export function routeLineClick(pointerX: number, viewportWidth: number): LineClickAction {
  if (pointerX < LINE_LEFT_STRIP) return 'previous'
  if (pointerX >= viewportWidth - LINE_RIGHT_STRIP) return 'next'
  return 'dismiss'
}

export function hashForPhoto(photoId: string | null): string {
  if (photoId == null) return ''
  return `#photo=${encodeURIComponent(photoId)}`
}

export function parsePhotoIdFromHash(hash: string): string | null {
  if (!hash.startsWith('#photo=')) return null
  const value = hash.slice('#photo='.length)
  return value === '' ? null : decodeURIComponent(value)
}
