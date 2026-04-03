export const gridGap = 24
export const gridTopPadding = 40
export const gridSidePadding = 32
export const minCardWidth = 220
export const maxGridColumns = 7
export const gridCaptionVisibleHeight = 44
export const gridCaptionBottomPadding = 8
export const lineGap = 52
export const lineCaptionVisibleHeight = 64
export const lineCaptionBottomPadding = 8
export const lineBottomGap = 28
export const lineTopPadding = 40
export const lineNavigationStripWidth = 100

export function clamp(min, value, max) {
  return Math.max(min, Math.min(value, max))
}

export function lerp(a, b, t) {
  return a + (b - a) * t
}

export function getAspectKind(photo) {
  const aspect = photo.w / photo.h
  if (aspect > 1.03) return 'landscape'
  if (aspect < 0.97) return 'portrait'
  return 'square'
}

export function getGridColumnCount(viewportWidth) {
  const availableWidth = Math.max(1, viewportWidth - gridSidePadding * 2)
  const columns = Math.floor((availableWidth + gridGap) / (minCardWidth + gridGap))
  return clamp(1, columns, maxGridColumns)
}

export function getGridBoxWidth(viewportWidth, columnCount = getGridColumnCount(viewportWidth)) {
  const availableWidth = Math.max(1, viewportWidth - gridSidePadding * 2)
  return (availableWidth - gridGap * (columnCount - 1)) / columnCount
}

export function getGridImageMetrics(photo, boxMaxSizeX) {
  const aspect = photo.w / photo.h
  const kind = getAspectKind(photo)
  let imgMaxSizeY = boxMaxSizeX
  switch (kind) {
    case 'square':
      imgMaxSizeY = boxMaxSizeX * 0.85
      break
    case 'portrait':
      imgMaxSizeY = boxMaxSizeX * 1.05
      break
    case 'landscape':
      imgMaxSizeY = boxMaxSizeX
      break
  }

  const width = Math.min(photo.w, boxMaxSizeX, imgMaxSizeY * aspect)
  const height = width / aspect
  return { kind, width, height }
}

export function getGridCaptionHeight() {
  return gridCaptionVisibleHeight + gridCaptionBottomPadding
}

export function layoutGrid(photos, viewportWidth) {
  const columnCount = getGridColumnCount(viewportWidth)
  const boxMaxSizeX = getGridBoxWidth(viewportWidth, columnCount)
  const captionHeight = getGridCaptionHeight()
  const items = []
  let y = gridTopPadding

  for (let rowStart = 0; rowStart < photos.length; rowStart += columnCount) {
    const rowItems = []
    let rowHeight = 0
    const rowIndex = Math.floor(rowStart / columnCount)

    for (let columnIndex = 0; columnIndex < columnCount; columnIndex++) {
      const photoIndex = rowStart + columnIndex
      if (photoIndex >= photos.length) break

      const photo = photos[photoIndex]
      const imageMetrics = getGridImageMetrics(photo, boxMaxSizeX)
      const cardHeight = imageMetrics.height + captionHeight
      rowHeight = Math.max(rowHeight, cardHeight)
      rowItems.push({
        id: photo.id,
        photoIndex,
        rowIndex,
        columnIndex,
        slotKey: `${rowIndex}:${columnIndex}`,
        rowTop: y,
        imageWidth: imageMetrics.width,
        imageHeight: imageMetrics.height,
        width: imageMetrics.width,
        height: cardHeight,
      })
    }

    for (const rowItem of rowItems) {
      const boxX = gridSidePadding + rowItem.columnIndex * (boxMaxSizeX + gridGap)
      items.push({
        ...rowItem,
        x: boxX + (boxMaxSizeX - rowItem.width) / 2,
        y,
      })
    }

    y += rowHeight + gridGap
  }

  return {
    columnCount,
    boxMaxSizeX,
    totalHeight: Math.max(0, y - gridGap + gridTopPadding),
    items,
  }
}

export function getVisibleGridItems(layout, scrollTop, viewportHeight, overscan = 480) {
  const minY = scrollTop - overscan
  const maxY = scrollTop + viewportHeight + overscan
  const visible = []
  for (const item of layout.items) {
    if (item.y + item.height >= minY && item.y <= maxY) visible.push(item)
  }
  return visible
}

export function findAnchorItem(layout, scrollTop) {
  for (const item of layout.items) {
    if (item.y + item.height >= scrollTop) return item
  }
  return layout.items[0] ?? null
}

export function getPhotoIndexById(photos, id) {
  for (let index = 0; index < photos.length; index++) {
    if (photos[index].id === id) return index
  }
  return -1
}

export function getHashForFocusedId(focusedId) {
  return focusedId == null ? '' : `#photo=${encodeURIComponent(focusedId)}`
}

export function parseFocusedIdFromHash(hash) {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash
  const params = new URLSearchParams(raw)
  const value = params.get('photo')
  return value == null || value === '' ? null : value
}

export function getLineCaptionHeight() {
  return lineCaptionVisibleHeight + lineCaptionBottomPadding
}

export function getLineImageSize(photo, viewportWidth, viewportHeight, isFocused) {
  const captionHeight = getLineCaptionHeight()
  const maxHeight = Math.max(180, viewportHeight - lineTopPadding - lineBottomGap - captionHeight - 48)
  const maxWidth = Math.max(240, viewportWidth - lineNavigationStripWidth * 2 - 72)
  const fitScale = Math.min(maxWidth / photo.w, maxHeight / photo.h)
  const focusedScale = fitScale
  const passiveScale = fitScale * 0.7
  const scale = isFocused ? focusedScale : passiveScale
  return {
    width: photo.w * scale,
    height: photo.h * scale,
  }
}

export function layoutLine(photos, focusedIndex, viewportWidth, viewportHeight) {
  const captionHeight = getLineCaptionHeight()
  const centerY = lineTopPadding
  const items = []
  const focusedPhoto = photos[focusedIndex]
  const focusedSize = getLineImageSize(focusedPhoto, viewportWidth, viewportHeight, true)
  const focusedX = (viewportWidth - focusedSize.width) / 2
  const focusedY = centerY

  let cursorLeft = focusedX - lineGap
  let cursorRight = focusedX + focusedSize.width + lineGap

  for (let index = focusedIndex - 1; index >= 0; index--) {
    const size = getLineImageSize(photos[index], viewportWidth, viewportHeight, false)
    cursorLeft -= size.width
    items.push({
      id: photos[index].id,
      photoIndex: index,
      x: cursorLeft,
      y: centerY + (focusedSize.height - size.height) * 0.5,
      width: size.width,
      height: size.height + captionHeight,
      imageHeight: size.height,
      isFocused: false,
    })
    cursorLeft -= lineGap
  }

  items.push({
    id: focusedPhoto.id,
    photoIndex: focusedIndex,
    x: focusedX,
    y: focusedY,
    width: focusedSize.width,
    height: focusedSize.height + captionHeight,
    imageHeight: focusedSize.height,
    isFocused: true,
  })

  for (let index = focusedIndex + 1; index < photos.length; index++) {
    const size = getLineImageSize(photos[index], viewportWidth, viewportHeight, false)
    items.push({
      id: photos[index].id,
      photoIndex: index,
      x: cursorRight,
      y: centerY + (focusedSize.height - size.height) * 0.5,
      width: size.width,
      height: size.height + captionHeight,
      imageHeight: size.height,
      isFocused: false,
    })
    cursorRight += size.width + lineGap
  }

  return {
    captionHeight,
    items,
  }
}

export function getVisibleLineItems(layout, viewportWidth, overscan = 240) {
  const minX = -overscan
  const maxX = viewportWidth + overscan
  const visible = []
  for (const item of layout.items) {
    if (item.x + item.width >= minX && item.x <= maxX) visible.push(item)
  }
  return visible
}

export function resolveLinePointerAction(pointerX, viewportWidth, focusedIndex, photoCount) {
  const onLeft = pointerX < lineNavigationStripWidth
  const onRight = pointerX > viewportWidth - lineNavigationStripWidth

  if (onLeft && focusedIndex > 0) return 'focus-prev'
  if (onRight && focusedIndex < photoCount - 1) return 'focus-next'
  return 'dismiss'
}

export function resolveLineKeyAction(key, focusedIndex, photoCount) {
  if (key === 'Escape') return 'dismiss'
  if (key === 'ArrowLeft') {
    if (focusedIndex == null) return 'focus-first'
    return focusedIndex > 0 ? 'focus-prev' : 'stay'
  }
  if (key === 'ArrowRight') {
    if (focusedIndex == null) return 'focus-first'
    return focusedIndex < photoCount - 1 ? 'focus-next' : 'stay'
  }
  return 'stay'
}
