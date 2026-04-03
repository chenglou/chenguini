import type { PhotoData } from './photo-data'

export const LINE_SIDE_STRIP = 100
export const LINE_NEIGHBOR_SCALE = 0.7
export const LINE_CARD_GAP = 52
export const LINE_BOTTOM_GAP = 28
export const LINE_TOP_FLOOR = 40
export const LINE_CAPTION_VISIBLE_HEIGHT = 64
export const LINE_CAPTION_BOTTOM_GAP = 8

export type LineStripAction = 'previous' | 'dismiss' | 'next'

export type LineLayoutItem = {
  id: string
  index: number
  x: number
  y: number
  width: number
  height: number
  scale: number
}

export type LineLayout = {
  focusIndex: number
  mediaTop: number
  mediaHeight: number
  captionTop: number
  items: LineLayoutItem[]
}

export function routeLineStripClick(
  viewportWidth: number,
  pointerX: number,
): LineStripAction {
  if (pointerX < LINE_SIDE_STRIP) {
    return 'previous'
  }

  if (pointerX >= viewportWidth - LINE_SIDE_STRIP) {
    return 'next'
  }

  return 'dismiss'
}

export function computeLineLayout(
  photos: readonly PhotoData[],
  focusedPhotoId: string,
  viewportWidth: number,
  viewportHeight: number,
): LineLayout {
  const focusIndex = photos.findIndex((photo) => photo.id === focusedPhotoId)
  if (focusIndex === -1) {
    throw new Error(`Focused photo missing from line layout: ${focusedPhotoId}`)
  }

  const mediaTop = LINE_TOP_FLOOR
  const mediaHeight = Math.max(
    160,
    viewportHeight -
      LINE_TOP_FLOOR -
      LINE_BOTTOM_GAP -
      LINE_CAPTION_VISIBLE_HEIGHT -
      LINE_CAPTION_BOTTOM_GAP,
  )
  const focusMaxWidth = Math.max(
    180,
    viewportWidth - LINE_SIDE_STRIP * 2 - LINE_CARD_GAP * 2,
  )

  const sizes = photos.map((photo, index) => {
    const scale = index === focusIndex ? 1 : LINE_NEIGHBOR_SCALE
    return {
      scale,
      ...fitPhotoInsideBox(photo, focusMaxWidth * scale, mediaHeight * scale),
    }
  })

  const items: LineLayoutItem[] = new Array(photos.length)
  const focusedSize = sizes[focusIndex]
  if (focusedSize == null) {
    throw new Error(`Focused size missing for photo: ${focusedPhotoId}`)
  }

  const focusX = (viewportWidth - focusedSize.width) / 2
  items[focusIndex] = {
    id: photos[focusIndex]?.id ?? focusedPhotoId,
    index: focusIndex,
    x: focusX,
    y: mediaTop + (mediaHeight - focusedSize.height) / 2,
    width: focusedSize.width,
    height: focusedSize.height,
    scale: focusedSize.scale,
  }

  let leftEdge = focusX
  for (let index = focusIndex - 1; index >= 0; index -= 1) {
    const size = sizes[index]
    const photo = photos[index]
    if (size == null || photo == null) {
      continue
    }

    const x = leftEdge - LINE_CARD_GAP - size.width
    items[index] = {
      id: photo.id,
      index,
      x,
      y: mediaTop + (mediaHeight - size.height) / 2,
      width: size.width,
      height: size.height,
      scale: size.scale,
    }
    leftEdge = x
  }

  let rightEdge = focusX + focusedSize.width
  for (let index = focusIndex + 1; index < photos.length; index += 1) {
    const size = sizes[index]
    const photo = photos[index]
    if (size == null || photo == null) {
      continue
    }

    const x = rightEdge + LINE_CARD_GAP
    items[index] = {
      id: photo.id,
      index,
      x,
      y: mediaTop + (mediaHeight - size.height) / 2,
      width: size.width,
      height: size.height,
      scale: size.scale,
    }
    rightEdge = x + size.width
  }

  return {
    focusIndex,
    mediaTop,
    mediaHeight,
    captionTop:
      viewportHeight - LINE_CAPTION_BOTTOM_GAP - LINE_CAPTION_VISIBLE_HEIGHT,
    items,
  }
}

function fitPhotoInsideBox(
  photo: PhotoData,
  maxWidth: number,
  maxHeight: number,
): { width: number; height: number } {
  const scale = Math.min(maxWidth / photo.w, maxHeight / photo.h)
  return {
    width: photo.w * scale,
    height: photo.h * scale,
  }
}
