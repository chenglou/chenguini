import { describe, expect, test } from 'bun:test'

import { photoGalleryData } from './photo-gallery-data'
import { computeGridLayout, routeLineHitArea } from './gallery-layout'

describe('computeGridLayout', () => {
  test('derives responsive columns, row positions, and image caps', () => {
    const layout = computeGridLayout({
      photos: photoGalleryData,
      viewportWidth: 2_000,
    })

    expect(layout.columns).toBe(7)
    expect(layout.boxMaxSizeX).toBeCloseTo(256, 5)

    const first = layout.itemsById[photoGalleryData[0].id]
    const portrait = layout.itemsById[photoGalleryData[1].id]
    const secondRowFirst = layout.itemsById[photoGalleryData[7].id]

    expect(first.left).toBeCloseTo(32, 5)
    expect(first.top).toBeCloseTo(40, 5)
    expect(portrait.imageHeight).toBeCloseTo(268.8, 5)
    expect(secondRowFirst.top).toBeCloseTo(384.8, 1)
    expect(layout.totalHeight).toBeGreaterThan(secondRowFirst.top)
  })

  test('shrinks to fewer columns before cards dip under the target width', () => {
    const layout = computeGridLayout({
      photos: photoGalleryData,
      viewportWidth: 1_024,
    })

    expect(layout.columns).toBe(4)
    expect(layout.boxMaxSizeX).toBeCloseTo(222, 5)
    expect(layout.rows).toHaveLength(6)
    expect(layout.itemsById[photoGalleryData[4].id].row).toBe(1)
  })
})

describe('routeLineHitArea', () => {
  test('uses fixed 100px side strips and a dismiss middle', () => {
    expect(routeLineHitArea({ clientX: 0, viewportWidth: 1_200 })).toBe('previous')
    expect(routeLineHitArea({ clientX: 99, viewportWidth: 1_200 })).toBe('previous')
    expect(routeLineHitArea({ clientX: 100, viewportWidth: 1_200 })).toBe('dismiss')
    expect(routeLineHitArea({ clientX: 1_099, viewportWidth: 1_200 })).toBe('dismiss')
    expect(routeLineHitArea({ clientX: 1_100, viewportWidth: 1_200 })).toBe('next')
  })
})
