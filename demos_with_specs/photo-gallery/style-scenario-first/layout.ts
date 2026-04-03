import type {PhotoData} from './data'

export const gridSidePadding = 32
export const gridTopPadding = 40
export const gridGap = 24
export const gridMinCardWidth = 220
export const gridCaptionHeight = 52
export const lineHitStripWidth = 100
export const lineGap = 52

export type GridRowLayout = {
  rowIndex: number
  top: number
  height: number
  startIndex: number
  endIndex: number
}

export type GridItemLayout = {
  id: string
  prompt: string
  rowIndex: number
  columnIndex: number
  x: number
  y: number
  width: number
  height: number
  imageWidth: number
  imageHeight: number
  rowTop: number
  rowHeight: number
}

export type GridLayout = {
  viewportWidth: number
  viewportHeight: number
  columns: number
  columnWidth: number
  totalHeight: number
  rows: GridRowLayout[]
  items: GridItemLayout[]
}

export type LineModeClickRoute =
  | {action: 'previous'; focusedIndex: number | null}
  | {action: 'next'; focusedIndex: number | null}
  | {action: 'dismiss'; focusedIndex: null}

export type LineModeKeyRoute =
  | {action: 'previous'; focusedIndex: number | null}
  | {action: 'next'; focusedIndex: number | null}
  | {action: 'dismiss'; focusedIndex: null}
  | {action: 'noop'; focusedIndex: number | null}

export function fitPhotoSize(photo: PhotoData, boxMaxSizeX: number): {width: number; height: number} {
  const aspectRatio = photo.w / photo.h
  const maxSizeY = aspectRatio > 1 ? boxMaxSizeX : aspectRatio < 1 ? boxMaxSizeX * 1.05 : boxMaxSizeX * 0.85
  const width = Math.min(photo.w, boxMaxSizeX, maxSizeY * aspectRatio)
  return {width, height: width / aspectRatio}
}

export function computeGridColumns(viewportWidth: number): {columns: number; columnWidth: number} {
  const availableWidth = Math.max(0, viewportWidth - gridSidePadding * 2)
  const columns = Math.max(1, Math.min(7, Math.floor((availableWidth + gridGap) / (gridMinCardWidth + gridGap))))
  const columnWidth = (availableWidth - gridGap * (columns - 1)) / columns
  return {columns, columnWidth}
}

export function computeGridLayout(viewportWidth: number, viewportHeight: number, photos: PhotoData[]): GridLayout {
  const {columns, columnWidth} = computeGridColumns(viewportWidth)
  const rows: GridRowLayout[] = []
  const items: GridItemLayout[] = []

  let y = gridTopPadding
  for (let rowIndex = 0; rowIndex * columns < photos.length; rowIndex++) {
    const startIndex = rowIndex * columns
    const endIndex = Math.min(startIndex + columns, photos.length)
    const rowPhotos = photos.slice(startIndex, endIndex)

    let rowHeight = 0
    for (let i = 0; i < rowPhotos.length; i++) {
      const photo = rowPhotos[i]!
      const imageSize = fitPhotoSize(photo, columnWidth)
      rowHeight = Math.max(rowHeight, imageSize.height + gridCaptionHeight)
    }

    rows.push({rowIndex, top: y, height: rowHeight, startIndex, endIndex})

    for (let i = 0; i < rowPhotos.length; i++) {
      const photo = rowPhotos[i]!
      const imageSize = fitPhotoSize(photo, columnWidth)
      const columnIndex = i
      items.push({
        id: photo.id,
        prompt: photo.prompt,
        rowIndex,
        columnIndex,
        x: gridSidePadding + columnIndex * (columnWidth + gridGap),
        y,
        width: columnWidth,
        height: rowHeight,
        imageWidth: imageSize.width,
        imageHeight: imageSize.height,
        rowTop: y,
        rowHeight,
      })
    }

    y += rowHeight + gridGap
  }

  const totalHeight = y + gridTopPadding - gridGap

  return {viewportWidth, viewportHeight, columns, columnWidth, totalHeight, rows, items}
}

export function findGridItem(layout: GridLayout, photoId: string): GridItemLayout | null {
  for (let index = 0; index < layout.items.length; index++) {
    const item = layout.items[index]!
    if (item.id === photoId) return item
  }
  return null
}

export function firstVisibleGridItemId(layout: GridLayout, scrollTop: number, viewportHeight: number): string | null {
  const visibleTop = scrollTop - layout.columnWidth
  const visibleBottom = scrollTop + viewportHeight + layout.columnWidth

  for (let rowIndex = 0; rowIndex < layout.rows.length; rowIndex++) {
    const row = layout.rows[rowIndex]!
    const rowBottom = row.top + row.height
    if (rowBottom <= visibleTop) continue
    if (row.top >= visibleBottom) break

    return layout.items[row.startIndex]?.id ?? null
  }

  return null
}

export function visibleGridItemIds(layout: GridLayout, scrollTop: number, viewportHeight: number): string[] {
  const visibleTop = scrollTop - layout.columnWidth
  const visibleBottom = scrollTop + viewportHeight + layout.columnWidth
  const ids: string[] = []

  for (let rowIndex = 0; rowIndex < layout.rows.length; rowIndex++) {
    const row = layout.rows[rowIndex]!
    const rowBottom = row.top + row.height
    if (rowBottom <= visibleTop) continue
    if (row.top >= visibleBottom) break

    for (let index = row.startIndex; index < row.endIndex; index++) {
      ids.push(layout.items[index]!.id)
    }
  }

  return ids
}

export function focusedGridScrollTop(layout: GridLayout, photoId: string): number {
  const item = findGridItem(layout, photoId)
  if (item == null) return 0
  return Math.max(0, item.rowTop - gridTopPadding)
}

export function resolveLineModeClick(viewportWidth: number, clientX: number, focusedIndex: number | null, itemCount: number): LineModeClickRoute {
  if (itemCount === 0) return {action: 'dismiss', focusedIndex: null}

  if (clientX < lineHitStripWidth) {
    return {action: 'previous', focusedIndex: stepFocusedIndex(focusedIndex, -1, itemCount)}
  }

  if (clientX >= viewportWidth - lineHitStripWidth) {
    return {action: 'next', focusedIndex: stepFocusedIndex(focusedIndex, 1, itemCount)}
  }

  return {action: 'dismiss', focusedIndex: null}
}

export function resolveLineModeKey(key: string, focusedIndex: number | null, itemCount: number): LineModeKeyRoute {
  switch (key) {
    case 'ArrowLeft':
      return {action: 'previous', focusedIndex: stepFocusedIndex(focusedIndex, -1, itemCount)}
    case 'ArrowRight':
      return {action: 'next', focusedIndex: stepFocusedIndex(focusedIndex, 1, itemCount)}
    case 'Escape':
      return {action: 'dismiss', focusedIndex: null}
    default:
      return {action: 'noop', focusedIndex}
  }
}

export function lineWindowIndices(focusedIndex: number, itemCount: number, radius: number): Array<number | null> {
  const indices: Array<number | null> = []
  for (let offset = -radius; offset <= radius; offset++) {
    const index = focusedIndex + offset
    indices.push(index >= 0 && index < itemCount ? index : null)
  }
  return indices
}

export function encodePhotoId(photoId: string | null): string {
  if (photoId == null) return ''
  return `#${encodeURIComponent(photoId)}`
}

export function decodePhotoId(hash: string): string | null {
  if (hash === '' || hash === '#') return null
  const raw = hash.startsWith('#') ? hash.slice(1) : hash
  if (raw === '') return null

  try {
    return decodeURIComponent(raw)
  } catch {
    return null
  }
}

function stepFocusedIndex(focusedIndex: number | null, delta: number, itemCount: number): number | null {
  if (itemCount === 0) return null
  if (focusedIndex == null) return 0
  const nextIndex = focusedIndex + delta
  if (nextIndex < 0) return 0
  if (nextIndex >= itemCount) return itemCount - 1
  return nextIndex
}
