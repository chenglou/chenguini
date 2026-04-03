import {describe, expect, test} from 'bun:test'

import {photoGalleryData} from '../data'
import {computeGridLayout, GRID_GAP, GRID_SIDE_PADDING, GRID_TOP_PADDING} from '../gallery'

describe('computeGridLayout', () => {
  test('caps columns at seven and stacks the next row below the tallest first-row card', () => {
    const layout = computeGridLayout({
      photos: photoGalleryData.slice(0, 8),
      viewportWidth: 1_800,
    })

    expect(layout.columnCount).toBe(7)
    expect(layout.boxMaxSizeX).toBeCloseTo((1_800 - GRID_SIDE_PADDING * 2 - GRID_GAP * 6) / 7, 6)

    const firstRowIds = photoGalleryData.slice(0, 7).map((photo) => photo.id)
    const tallestFirstRowCard = Math.max(
      ...firstRowIds.map((photoId) => layout.cardsById.get(photoId)!.cardHeight),
    )
    const secondRowCard = layout.cardsById.get(photoGalleryData[7]!.id)!

    expect(secondRowCard.rowIndex).toBe(1)
    expect(secondRowCard.top).toBeCloseTo(GRID_TOP_PADDING + tallestFirstRowCard + GRID_GAP, 6)
  })

  test('uses different image height caps for landscape, square, and portrait cards', () => {
    const landscape = photoGalleryData[3]!
    const portrait = photoGalleryData[1]!
    const square = photoGalleryData[6]!
    const layout = computeGridLayout({
      photos: [landscape, portrait, square],
      viewportWidth: 900,
    })

    const landscapeCard = layout.cardsById.get(landscape.id)!
    const portraitCard = layout.cardsById.get(portrait.id)!
    const squareCard = layout.cardsById.get(square.id)!

    expect(layout.columnCount).toBe(3)
    expect(landscapeCard.imageWidth).toBeCloseTo(layout.boxMaxSizeX, 6)
    expect(squareCard.imageHeight).toBeCloseTo(layout.boxMaxSizeX * 0.85, 6)
    expect(portraitCard.imageHeight).toBeCloseTo(layout.boxMaxSizeX * 1.05, 6)
    expect(portraitCard.imageWidth).toBeLessThan(squareCard.imageWidth)
    expect(portraitCard.cardHeight).toBeGreaterThan(squareCard.cardHeight)
  })
})
