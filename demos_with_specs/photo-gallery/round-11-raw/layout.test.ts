import {describe, expect, test} from 'bun:test'

import {computeGridLayout, fitPhotoIntoBox} from './layout'
import {photoGalleryData} from './data'

describe('computeGridLayout', () => {
  test('uses the expected responsive column counts and card widths', () => {
    const narrow = computeGridLayout({
      photos: photoGalleryData,
      viewportWidth: 800,
      viewportHeight: 900,
      scrollTop: 0,
    })
    const medium = computeGridLayout({
      photos: photoGalleryData,
      viewportWidth: 1200,
      viewportHeight: 900,
      scrollTop: 0,
    })
    const wide = computeGridLayout({
      photos: photoGalleryData,
      viewportWidth: 2200,
      viewportHeight: 900,
      scrollTop: 0,
    })

    expect(narrow.columnCount).toBe(3)
    expect(narrow.cardWidth).toBeCloseTo(229.3333333333, 6)
    expect(narrow.totalRows).toBe(8)

    expect(medium.columnCount).toBe(4)
    expect(medium.cardWidth).toBe(266)
    expect(medium.totalRows).toBe(6)

    expect(wide.columnCount).toBe(7)
    expect(wide.cardWidth).toBeCloseTo(284.5714285714, 6)
    expect(wide.totalRows).toBe(4)
  })

  test('keeps the first row aligned to padding and grid gap', () => {
    const layout = computeGridLayout({
      photos: photoGalleryData,
      viewportWidth: 1200,
      viewportHeight: 900,
      scrollTop: 0,
    })

    expect(layout.cards[0]).toMatchObject({x: 32, y: 40, row: 0, column: 0})
    expect(layout.cards[1]?.x).toBeCloseTo(322, 6)
    expect(layout.cards[2]?.x).toBeCloseTo(612, 6)
    expect(layout.cards[3]?.x).toBeCloseTo(902, 6)
  })

  test('mounts only visible and near-visible rows in grid mode', () => {
    const layout = computeGridLayout({
      photos: photoGalleryData,
      viewportWidth: 1024,
      viewportHeight: 780,
      scrollTop: 700,
    })

    expect(layout.mountedPhotoIds.length).toBeLessThan(photoGalleryData.length)
    expect(layout.mountedPhotoIds.length).toBeGreaterThan(0)
    expect(layout.mountedPhotoIds).toContain(photoGalleryData[8]!.id)
  })
})

describe('fitPhotoIntoBox', () => {
  test('applies the landscape, square, and portrait height caps', () => {
    const landscape = fitPhotoIntoBox({
      naturalWidth: 1344,
      naturalHeight: 896,
      boxMaxWidth: 240,
    })
    const square = fitPhotoIntoBox({
      naturalWidth: 1024,
      naturalHeight: 1024,
      boxMaxWidth: 240,
    })
    const portrait = fitPhotoIntoBox({
      naturalWidth: 1792,
      naturalHeight: 2688,
      boxMaxWidth: 240,
    })

    expect(landscape.width).toBeCloseTo(240, 6)
    expect(landscape.height).toBeCloseTo(160, 6)

    expect(square.width).toBeCloseTo(204, 6)
    expect(square.height).toBeCloseTo(204, 6)

    expect(portrait.width).toBeCloseTo(168, 6)
    expect(portrait.height).toBeCloseTo(252, 6)
  })
})
