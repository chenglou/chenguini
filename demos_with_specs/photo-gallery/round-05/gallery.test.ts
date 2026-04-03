import {describe, expect, test} from 'bun:test'

import {photoGalleryData} from './data'
import {
  computeGridLayout,
  computeLineLayout,
  getGridColumnCount,
  getGridImageSize,
  routeLineModeClick,
} from './gallery-model'

describe('grid layout math', () => {
  test('clamps the responsive column count and keeps the minimum width budget', () => {
    expect(getGridColumnCount(320)).toBe(1)
    expect(getGridColumnCount(980)).toBe(3)
    expect(getGridColumnCount(2200)).toBe(7)
  })

  test('shrinks square cards and lets portrait cards grow taller than landscape cards', () => {
    const square = getGridImageSize(photoGalleryData[0]!, 260)
    const portrait = getGridImageSize(photoGalleryData[1]!, 260)
    const landscape = getGridImageSize(photoGalleryData[3]!, 260)

    expect(square.imageHeight).toBeCloseTo(221, 0)
    expect(portrait.imageHeight).toBeCloseTo(273, 0)
    expect(landscape.imageHeight).toBeCloseTo(173.3333, 3)
    expect(portrait.imageHeight).toBeGreaterThan(square.imageHeight)
    expect(square.imageHeight).toBeGreaterThan(landscape.imageHeight)
  })

  test('keeps the row model stable and total height monotonic', () => {
    const narrow = computeGridLayout(photoGalleryData.slice(0, 12), 820)
    const wide = computeGridLayout(photoGalleryData.slice(0, 12), 1320)

    expect(narrow.columnCount).toBe(3)
    expect(wide.columnCount).toBe(5)
    expect(narrow.rows.length).toBe(4)
    expect(wide.rows.length).toBe(3)
    expect(narrow.totalHeight).toBeGreaterThan(wide.totalHeight)
    expect(narrow.rows[0]?.itemIndices).toEqual([0, 1, 2])
    expect(wide.rows[0]?.itemIndices).toEqual([0, 1, 2, 3, 4])
  })
})

describe('line mode policy', () => {
  test('routes forgiving strip clicks by layout rather than image edges', () => {
    expect(routeLineModeClick({x: 40, viewportWidth: 1200, hasPrevious: true, hasNext: true})).toBe('previous')
    expect(routeLineModeClick({x: 1180, viewportWidth: 1200, hasPrevious: true, hasNext: true})).toBe('next')
    expect(routeLineModeClick({x: 60, viewportWidth: 1200, hasPrevious: false, hasNext: true})).toBe('dismiss')
    expect(routeLineModeClick({x: 600, viewportWidth: 1200, hasPrevious: true, hasNext: true})).toBe('dismiss')
  })

  test('keeps the focused image larger than its neighbors in line mode', () => {
    const layout = computeLineLayout(photoGalleryData.slice(0, 5), 2, 1440, 900, 120)

    expect(layout.items[2]?.isFocused).toBe(true)
    expect(layout.items[1]?.width).toBeLessThan(layout.items[2]!.width)
    expect(layout.items[3]?.width).toBeLessThan(layout.items[2]!.width)
    expect(layout.items[1]?.x).toBeLessThan(layout.items[2]!.x)
    expect(layout.items[3]?.x).toBeGreaterThan(layout.items[2]!.x)
  })
})
