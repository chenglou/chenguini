import {describe, expect, test} from 'bun:test'

import {photoGalleryData} from './data'
import {
  computeGridLayout,
  getGridPhotoMaxHeight,
  getResponsiveColumnCount,
  resolveLineModeClickAction,
} from './layout'

describe('grid layout math', () => {
  test('responsive columns stay within the documented bounds', () => {
    expect(getResponsiveColumnCount(360)).toBe(1)
    expect(getResponsiveColumnCount(980)).toBe(3)
    expect(getResponsiveColumnCount(3200)).toBe(7)
  })

  test('area-aware sizing uses the documented height heuristics', () => {
    expect(getGridPhotoMaxHeight('landscape', 300)).toBe(300)
    expect(getGridPhotoMaxHeight('square', 300)).toBe(255)
    expect(getGridPhotoMaxHeight('portrait', 300)).toBe(315)
  })

  test('row layout centers smaller cards inside each column', () => {
    const layout = computeGridLayout(photoGalleryData.slice(0, 3), 1100)
    expect(layout.columns).toBe(4)
    expect(layout.items[0]!.row).toBe(0)
    expect(layout.items[0]!.x).toBeGreaterThan(32)
    expect(layout.items[1]!.width).toBeLessThan(layout.boxMaxSizeX)
    expect(layout.items[2]!.y).toBe(40)
  })
})

describe('line mode hit routing', () => {
  test('left and right strips win over the dismiss region when navigation exists', () => {
    expect(resolveLineModeClickAction(20, 1280, 5, photoGalleryData.length)).toEqual({type: 'previous'})
    expect(resolveLineModeClickAction(1260, 1280, 5, photoGalleryData.length)).toEqual({type: 'next'})
  })

  test('the middle dismisses, and edge clicks dismiss when no sibling exists', () => {
    expect(resolveLineModeClickAction(640, 1280, 5, photoGalleryData.length)).toEqual({type: 'dismiss'})
    expect(resolveLineModeClickAction(10, 1280, 0, photoGalleryData.length)).toEqual({type: 'dismiss'})
    expect(resolveLineModeClickAction(1275, 1280, photoGalleryData.length - 1, photoGalleryData.length)).toEqual({type: 'dismiss'})
  })
})
