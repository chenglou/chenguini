export const GRID_SIDE_PADDING = 32
export const GRID_GAP = 24
export const GRID_TOP_PADDING = 40
export const GRID_MIN_CARD_WIDTH = 220
export const GRID_MAX_COLUMNS = 7
export const GRID_CAPTION_VISIBLE = 44
export const GRID_CAPTION_BOTTOM_PADDING = 8

export const LINE_NEIGHBOR_SCALE = 0.7
export const LINE_CARD_GAP = 52
export const LINE_BOTTOM_GAP = 28
export const LINE_TOP_FLOOR = 40
export const LEFT_STRIP = 100
export const RIGHT_STRIP = 100
export const LINE_CAPTION_VISIBLE = 64
export const LINE_CAPTION_BOTTOM_PADDING = 8

const clamp = (value, min, max) => Math.max(min, Math.min(max, value))

function getOrientation(photo) {
  if (photo.w === photo.h) return 'square'
  return photo.w > photo.h ? 'landscape' : 'portrait'
}

export function measureGridImage(photo, boxMaxSizeX) {
  const aspectRatio = photo.w / photo.h
  const orientation = getOrientation(photo)
  const imageMaxSizeY =
    orientation === 'square'
      ? boxMaxSizeX * 0.85
      : orientation === 'portrait'
        ? boxMaxSizeX * 1.05
        : boxMaxSizeX

  const imageWidth = Math.min(photo.w, boxMaxSizeX, imageMaxSizeY * aspectRatio)
  const imageHeight = imageWidth / aspectRatio

  return {
    aspectRatio,
    imageMaxSizeY,
    imageWidth,
    imageHeight,
  }
}

export function layoutGrid(photos, viewportWidth) {
  const sidePadding = GRID_SIDE_PADDING
  const gap = GRID_GAP
  const topPadding = GRID_TOP_PADDING
  const availableWidth = Math.max(0, viewportWidth - sidePadding * 2)
  const maxColumnsByWidth = Math.floor((availableWidth + gap) / (GRID_MIN_CARD_WIDTH + gap))
  const columns = clamp(maxColumnsByWidth || 1, 1, GRID_MAX_COLUMNS)
  const boxMaxSizeX = columns > 0 ? (availableWidth - gap * (columns - 1)) / columns : availableWidth

  const rows = []
  const items = []

  for (let index = 0; index < photos.length; index += 1) {
    const photo = photos[index]
    const rowIndex = Math.floor(index / columns)
    const colIndex = index % columns
    const x = sidePadding + colIndex * (boxMaxSizeX + gap)
    const metrics = measureGridImage(photo, boxMaxSizeX)
    const cardHeight = metrics.imageHeight + GRID_CAPTION_VISIBLE + GRID_CAPTION_BOTTOM_PADDING

    if (!rows[rowIndex]) {
      rows[rowIndex] = {
        index: rowIndex,
        top: 0,
        height: 0,
        bottom: 0,
      }
    }

    rows[rowIndex].height = Math.max(rows[rowIndex].height, cardHeight)

    items.push({
      ...photo,
      index,
      rowIndex,
      colIndex,
      x,
      y: 0,
      cardWidth: boxMaxSizeX,
      cardHeight,
      ...metrics,
    })
  }

  let y = topPadding
  for (const row of rows) {
    row.top = y
    row.bottom = y + row.height
    y += row.height + gap
  }

  for (const item of items) {
    const row = rows[item.rowIndex]
    item.y = row.top
    item.rowTop = row.top
    item.rowBottom = row.bottom
  }

  return {
    sidePadding,
    gap,
    topPadding,
    columns,
    boxMaxSizeX,
    rows,
    items,
    totalHeight: rows.length > 0 ? rows[rows.length - 1].bottom + GRID_SIDE_PADDING : topPadding,
  }
}

export function resolveMountedRows(layout, scrollTop, viewportHeight, bufferRows = 1) {
  if (layout.rows.length === 0) return { startRow: 0, endRow: -1 }

  let startRow = 0
  while (startRow < layout.rows.length && layout.rows[startRow].bottom < scrollTop) {
    startRow += 1
  }

  let endRow = startRow
  const targetBottom = scrollTop + viewportHeight
  while (endRow < layout.rows.length && layout.rows[endRow].top <= targetBottom) {
    endRow += 1
  }
  endRow = Math.max(0, endRow - 1)

  return {
    startRow: Math.max(0, startRow - bufferRows),
    endRow: Math.min(layout.rows.length - 1, endRow + bufferRows),
  }
}

export function resolveMountedPhotoIds(layout, scrollTop, viewportHeight, bufferRows = 1) {
  const { startRow, endRow } = resolveMountedRows(layout, scrollTop, viewportHeight, bufferRows)
  const visible = new Set()

  for (const item of layout.items) {
    if (item.rowIndex >= startRow && item.rowIndex <= endRow) {
      visible.add(item.id)
    }
  }

  return visible
}

export function resolveLineClick({ x, width, focusedIndex, total }) {
  if (x <= LEFT_STRIP) {
    if (focusedIndex > 0) return { type: 'prev', nextIndex: focusedIndex - 1 }
    return { type: 'noop' }
  }

  if (x >= width - RIGHT_STRIP) {
    if (focusedIndex < total - 1) return { type: 'next', nextIndex: focusedIndex + 1 }
    return { type: 'noop' }
  }

  return { type: 'dismiss' }
}

export function resolveDismissToRow({ layout, focusedId, viewportHeight }) {
  const focused = layout.items.find((item) => item.id === focusedId)
  if (!focused) {
    return {
      scrollTop: 0,
      rowTop: 0,
      gapAboveRow: 0,
      rowIndex: 0,
    }
  }

  const rowTop = focused.rowTop ?? layout.rows[focused.rowIndex]?.top ?? 0
  const scrollTop = Math.max(0, rowTop - 40)
  const gapAboveRow = rowTop - scrollTop

  return {
    scrollTop,
    rowTop,
    gapAboveRow,
    rowIndex: focused.rowIndex,
    viewportHeight,
  }
}
