import {describe, expect, test} from 'bun:test'

import {photoGalleryData} from './data'
import {
  computeGridItemSize,
  computeGridMetrics,
  routeLineModeHitArea,
} from './galleryModel'

describe('computeGridMetrics', () => {
  test('clamps the column count and exposes the per-column budget', () => {
    expect(computeGridMetrics(760)).toEqual({
      columns: 2,
      boxMaxSizeX: 336,
    })

    expect(computeGridMetrics(2200)).toEqual({
      columns: 7,
      boxMaxSizeX: 284.57142857142856,
    })
  })
})

describe('computeGridItemSize', () => {
  test('shrinks square images, lets portrait images grow taller, and keeps landscape images at the normal budget', () => {
    const boxMaxSizeX = 280

    const square = computeGridItemSize(photoGalleryData[0], boxMaxSizeX)
    expect(square.imageWidth).toBe(238)
    expect(square.imageHeight).toBe(238)
    expect(square.cardHeight).toBe(290)

    const portrait = computeGridItemSize(photoGalleryData[16], boxMaxSizeX)
    expect(portrait.imageWidth).toBe(196)
    expect(portrait.imageHeight).toBe(294)
    expect(portrait.cardHeight).toBe(346)

    const landscape = computeGridItemSize(photoGalleryData[14], boxMaxSizeX)
    expect(landscape.imageWidth).toBe(280)
    expect(landscape.imageHeight).toBeCloseTo(186.66666666666666)
    expect(landscape.cardHeight).toBeCloseTo(238.66666666666666)
  })
})

describe('routeLineModeHitArea', () => {
  test('uses full-height forgiving strips and falls back to dismiss when navigation is unavailable', () => {
    expect(routeLineModeHitArea(50, 1200, 8, photoGalleryData.length)).toEqual({
      type: 'focus',
      index: 7,
    })

    expect(routeLineModeHitArea(1170, 1200, 8, photoGalleryData.length)).toEqual({
      type: 'focus',
      index: 9,
    })

    expect(routeLineModeHitArea(600, 1200, 8, photoGalleryData.length)).toEqual({
      type: 'dismiss',
    })

    expect(routeLineModeHitArea(50, 1200, 0, photoGalleryData.length)).toEqual({
      type: 'dismiss',
    })

    expect(
      routeLineModeHitArea(1170, 1200, photoGalleryData.length - 1, photoGalleryData.length),
    ).toEqual({
      type: 'dismiss',
    })
  })
})
