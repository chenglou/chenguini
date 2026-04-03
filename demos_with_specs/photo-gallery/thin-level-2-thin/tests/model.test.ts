import { describe, expect, test } from 'bun:test'

import { photoGalleryData } from '../data'
import { GRID, computeGridLayout, getGridBoxWidth, routeLineClick } from '../model'

describe('photo gallery model', () => {
  test('grid sizing follows the orientation rules and caps columns at seven', () => {
    const layout = computeGridLayout(photoGalleryData, 2_200)
    const landscape = photoGalleryData.find((photo) => photo.w > photo.h)
    const square = photoGalleryData.find((photo) => photo.w === photo.h)
    const portrait = photoGalleryData.find((photo) => photo.h > photo.w)

    expect(layout.columnCount).toBe(7)
    expect(landscape).toBeDefined()
    expect(square).toBeDefined()
    expect(portrait).toBeDefined()
    expect(getGridBoxWidth(landscape!, layout.boxMaxSizeX)).toBeCloseTo(layout.boxMaxSizeX, 6)
    expect(getGridBoxWidth(square!, layout.boxMaxSizeX)).toBeCloseTo(layout.boxMaxSizeX * 0.85, 6)
    expect(getGridBoxWidth(portrait!, layout.boxMaxSizeX)).toBeCloseTo(layout.boxMaxSizeX * 1.05, 6)
  })

  test('grid keeps the requested chrome constants', () => {
    expect(GRID.sidePadding).toBe(32)
    expect(GRID.gap).toBe(24)
    expect(GRID.topPadding).toBe(40)
    expect(GRID.captionVisible).toBe(44)
    expect(GRID.captionBottom).toBe(8)
    expect(GRID.minTargetCardWidth).toBe(220)
  })

  test('line click routing uses the left strip, middle dismiss, and right strip', () => {
    expect(routeLineClick(0, 900)).toBe('previous')
    expect(routeLineClick(99, 900)).toBe('previous')
    expect(routeLineClick(100, 900)).toBe('dismiss')
    expect(routeLineClick(450, 900)).toBe('dismiss')
    expect(routeLineClick(799, 900)).toBe('dismiss')
    expect(routeLineClick(800, 900)).toBe('next')
    expect(routeLineClick(899, 900)).toBe('next')
  })
})
