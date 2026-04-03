export const layoutConfig = Object.freeze({
  sidePadding: 32,
  gridGap: 24,
  gridTopPadding: 40,
  gridBottomPadding: 32,
  minTargetCardWidth: 220,
  maxColumns: 7,
  lineNeighborScale: 0.7,
  lineGap: 52,
  lineBottomGap: 28,
  lineTopFloor: 40,
  lineSideStrip: 100,
  gridCaptionVisibleText: 44,
  lineCaptionVisibleText: 64,
  captionBottomPadding: 8,
})

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

function getAspectFactor(photo) {
  if (photo.w > photo.h) return 1
  if (photo.w === photo.h) return 0.85
  return 1.05
}

export function getColumns(containerWidth) {
  const availableWidth = Math.max(0, containerWidth - layoutConfig.sidePadding * 2)
  const rawColumns = Math.floor(
    (availableWidth + layoutConfig.gridGap) /
      (layoutConfig.minTargetCardWidth + layoutConfig.gridGap),
  )
  return clamp(rawColumns, 1, layoutConfig.maxColumns)
}

export function getColumnWidth(containerWidth) {
  const columns = getColumns(containerWidth)
  const availableWidth =
    containerWidth - layoutConfig.sidePadding * 2 - layoutConfig.gridGap * (columns - 1)
  return availableWidth / columns
}

export function getImageHeight(photo, boxMaxSizeX) {
  return Math.round(boxMaxSizeX * (photo.h / photo.w) * getAspectFactor(photo))
}

export function getCardHeight(photo, boxMaxSizeX) {
  return (
    getImageHeight(photo, boxMaxSizeX) +
    layoutConfig.gridCaptionVisibleText +
    layoutConfig.captionBottomPadding +
    16
  )
}

export function measureGridLayout(items, containerWidth) {
  const columns = getColumns(containerWidth)
  const columnWidth = getColumnWidth(containerWidth)
  const boxMaxSizeX = columnWidth
  const rows = []
  const itemRects = new Array(items.length)
  const rowByIndex = new Map()
  const rowById = new Map()

  let top = layoutConfig.gridTopPadding

  for (let startIndex = 0; startIndex < items.length; startIndex += columns) {
    const endIndex = Math.min(items.length, startIndex + columns)
    const rowItems = items.slice(startIndex, endIndex)
    const rowHeight = rowItems.reduce((max, photo) => {
      return Math.max(max, getCardHeight(photo, boxMaxSizeX))
    }, 0)
    const rowIndex = rows.length
    const row = {
      index: rowIndex,
      top,
      bottom: top + rowHeight,
      height: rowHeight,
      startIndex,
      endIndex: endIndex - 1,
      itemIndices: [],
    }

    rowItems.forEach((photo, localIndex) => {
      const itemIndex = startIndex + localIndex
      const left = layoutConfig.sidePadding + localIndex * (columnWidth + layoutConfig.gridGap)
      const rect = {
        index: itemIndex,
        id: photo.id,
        left,
        top,
        width: columnWidth,
        height: getCardHeight(photo, boxMaxSizeX),
        rowIndex,
      }
      itemRects[itemIndex] = rect
      row.itemIndices.push(itemIndex)
      rowById.set(photo.id, rect)
    })

    rows.push(row)
    rowByIndex.set(rowIndex, row)
    top += rowHeight + layoutConfig.gridGap
  }

  const contentHeight = rows.length
    ? rows[rows.length - 1].bottom + layoutConfig.gridBottomPadding
    : layoutConfig.gridTopPadding + layoutConfig.gridBottomPadding

  function getVisibleRowRange(scrollTop, viewportHeight) {
    if (!rows.length) return [0, -1]

    const visibleTop = Math.max(0, scrollTop - layoutConfig.gridGap)
    const visibleBottom = scrollTop + viewportHeight + layoutConfig.gridGap

    let startRow = 0
    for (let i = 0; i < rows.length; i += 1) {
      if (rows[i].bottom >= visibleTop) {
        startRow = i
        break
      }
    }

    let endRow = rows.length - 1
    for (let i = rows.length - 1; i >= 0; i -= 1) {
      if (rows[i].top <= visibleBottom) {
        endRow = i
        break
      }
    }

    return [startRow, endRow]
  }

  function getMountedRange(scrollTop, viewportHeight) {
    const [startRow, endRow] = getVisibleRowRange(scrollTop, viewportHeight)
    if (endRow < startRow) return [0, -1]
    return [rows[startRow].startIndex, rows[endRow].endIndex]
  }

  return {
    columns,
    columnWidth,
    boxMaxSizeX,
    rows,
    itemRects,
    contentHeight,
    getVisibleRowRange,
    getMountedRange,
    getItemRect(index) {
      return itemRects[index] ?? null
    },
    getRowForItemIndex(index) {
      const rect = itemRects[index]
      if (!rect) return null
      return rowByIndex.get(rect.rowIndex) ?? null
    },
    getRowForId(id) {
      const rect = rowById.get(id)
      if (!rect) return null
      return rowByIndex.get(rect.rowIndex) ?? null
    },
  }
}

export function routeLineClick(stageWidth, x) {
  if (x < layoutConfig.lineSideStrip) return 'previous'
  if (x >= stageWidth - layoutConfig.lineSideStrip) return 'next'
  return 'dismiss'
}

export function getDismissScrollTop({ rowTop, rowBottom, scrollTop, viewportHeight }) {
  const viewportBottom = scrollTop + viewportHeight
  if (rowTop >= scrollTop && rowBottom <= viewportBottom) {
    return scrollTop
  }
  return Math.max(0, rowTop - layoutConfig.lineTopFloor)
}
