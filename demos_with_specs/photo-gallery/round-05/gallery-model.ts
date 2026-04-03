import type {PhotoData} from './data'

export const gridGap = 24
export const gridTopPadding = 40
export const gridCaptionHeight = 52
export const gridMinCardWidth = 220
export const gridSidePadding = 32
export const maxGridColumns = 7
export const lineGap = 52
export const lineTopPadding = 40
export const lineBottomGap = 28
export const lineCaptionHeight = 72
export const lineStripWidth = 100

export type GridItemLayout = {
  id: string
  index: number
  column: number
  row: number
  x: number
  y: number
  width: number
  height: number
  imageWidth: number
  imageHeight: number
}

export type GridRowLayout = {
  index: number
  y: number
  height: number
  itemIndices: number[]
}

export type GridLayout = {
  columnCount: number
  boxMaxSizeX: number
  items: GridItemLayout[]
  rows: GridRowLayout[]
  totalHeight: number
}

export type LineRect = {
  id: string
  index: number
  x: number
  y: number
  width: number
  height: number
  isFocused: boolean
}

export type LineLayout = {
  items: LineRect[]
  imageAreaTop: number
  imageAreaHeight: number
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export function classifyAspect(photo: PhotoData): 'portrait' | 'square' | 'landscape' {
  const ratio = photo.w / photo.h
  if (ratio > 1.05) return 'landscape'
  if (ratio < 0.95) return 'portrait'
  return 'square'
}

export function getGridColumnCount(viewportWidth: number): number {
  const availableWidth = Math.max(0, viewportWidth - gridSidePadding * 2)
  const columns = Math.floor((availableWidth + gridGap) / (gridMinCardWidth + gridGap))
  return clamp(columns, 1, maxGridColumns)
}

export function getGridImageSize(photo: PhotoData, boxMaxSizeX: number): {imageWidth: number; imageHeight: number} {
  const aspect = photo.w / photo.h
  const imgMaxSizeY =
    classifyAspect(photo) === 'square'
      ? boxMaxSizeX * 0.85
      : classifyAspect(photo) === 'portrait'
        ? boxMaxSizeX * 1.05
        : boxMaxSizeX
  const imageWidth = Math.min(photo.w, boxMaxSizeX, imgMaxSizeY * aspect)
  const imageHeight = imageWidth / aspect
  return {imageWidth, imageHeight}
}

export function computeGridLayout(photos: PhotoData[], viewportWidth: number): GridLayout {
  const columnCount = getGridColumnCount(viewportWidth)
  const availableWidth = Math.max(0, viewportWidth - gridSidePadding * 2)
  const boxMaxSizeX = (availableWidth - gridGap * (columnCount - 1)) / columnCount
  const items: GridItemLayout[] = []
  const rows: GridRowLayout[] = []

  let rowTop = gridTopPadding
  for (let rowIndex = 0; rowIndex * columnCount < photos.length; rowIndex++) {
    const start = rowIndex * columnCount
    const end = Math.min(photos.length, start + columnCount)
    let rowHeight = 0
    const rowItems: GridItemLayout[] = []

    for (let index = start; index < end; index++) {
      const photo = photos[index]!
      const column = index - start
      const {imageWidth, imageHeight} = getGridImageSize(photo, boxMaxSizeX)
      const width = imageWidth
      const height = imageHeight + gridCaptionHeight
      rowHeight = Math.max(rowHeight, height)
      rowItems.push({
        id: photo.id,
        index,
        column,
        row: rowIndex,
        x: gridSidePadding + column * (boxMaxSizeX + gridGap) + (boxMaxSizeX - width) / 2,
        y: rowTop,
        width,
        height,
        imageWidth,
        imageHeight,
      })
    }

    rows.push({
      index: rowIndex,
      y: rowTop,
      height: rowHeight,
      itemIndices: rowItems.map(item => item.index),
    })
    for (const item of rowItems) {
      item.y = rowTop
      items.push(item)
    }
    rowTop += rowHeight + gridGap
  }

  return {
    columnCount,
    boxMaxSizeX,
    items,
    rows,
    totalHeight: rowTop - gridGap + gridTopPadding,
  }
}

export function getMountedItemIds(layout: GridLayout, scrollTop: number, viewportHeight: number, overscanRows = 1): Set<string> {
  const startY = Math.max(0, scrollTop)
  const endY = scrollTop + viewportHeight
  const mountedIds = new Set<string>()
  for (const row of layout.rows) {
    const rowBottom = row.y + row.height
    if (rowBottom < startY - overscanRows * 400) continue
    if (row.y > endY + overscanRows * 400) continue
    for (const index of row.itemIndices) {
      mountedIds.add(layout.items[index]!.id)
    }
  }
  return mountedIds
}

export function routeLineModeClick(input: {
  x: number
  viewportWidth: number
  hasPrevious: boolean
  hasNext: boolean
}): 'previous' | 'next' | 'dismiss' {
  if (input.x <= lineStripWidth && input.hasPrevious) return 'previous'
  if (input.x >= input.viewportWidth - lineStripWidth && input.hasNext) return 'next'
  return 'dismiss'
}

function fitSize(width: number, height: number, maxWidth: number, maxHeight: number): {width: number; height: number} {
  const scale = Math.min(maxWidth / width, maxHeight / height)
  return {
    width: width * scale,
    height: height * scale,
  }
}

export function computeLineLayout(
  photos: PhotoData[],
  focusedIndex: number,
  viewportWidth: number,
  viewportHeight: number,
  scrollTop: number,
): LineLayout {
  const imageAreaTop = scrollTop + lineTopPadding
  const imageAreaHeight = Math.max(160, viewportHeight - lineTopPadding - lineBottomGap - lineCaptionHeight)
  const focusMaxWidth = Math.max(240, viewportWidth - lineStripWidth * 2 - 120)
  const focusPhoto = photos[focusedIndex]!
  const focusSize = fitSize(focusPhoto.w, focusPhoto.h, focusMaxWidth, imageAreaHeight)
  const focusX = (viewportWidth - focusSize.width) / 2
  const focusY = imageAreaTop + (imageAreaHeight - focusSize.height) / 2
  const items: LineRect[] = []

  items[focusedIndex] = {
    id: focusPhoto.id,
    index: focusedIndex,
    x: focusX,
    y: focusY,
    width: focusSize.width,
    height: focusSize.height,
    isFocused: true,
  }

  let leftEdge = focusX - lineGap
  for (let index = focusedIndex - 1; index >= 0; index--) {
    const photo = photos[index]!
    const size = fitSize(photo.w, photo.h, focusSize.width * 0.7, focusSize.height * 0.7)
    leftEdge -= size.width
    items[index] = {
      id: photo.id,
      index,
      x: leftEdge,
      y: imageAreaTop + (imageAreaHeight - size.height) / 2,
      width: size.width,
      height: size.height,
      isFocused: false,
    }
    leftEdge -= lineGap
  }

  let rightEdge = focusX + focusSize.width + lineGap
  for (let index = focusedIndex + 1; index < photos.length; index++) {
    const photo = photos[index]!
    const size = fitSize(photo.w, photo.h, focusSize.width * 0.7, focusSize.height * 0.7)
    items[index] = {
      id: photo.id,
      index,
      x: rightEdge,
      y: imageAreaTop + (imageAreaHeight - size.height) / 2,
      width: size.width,
      height: size.height,
      isFocused: false,
    }
    rightEdge += size.width + lineGap
  }

  return {items, imageAreaTop, imageAreaHeight}
}
