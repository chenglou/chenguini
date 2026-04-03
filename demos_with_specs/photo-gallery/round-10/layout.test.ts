import {describe, expect, test} from 'bun:test'

import {photoGalleryData} from './data'
import {computeGridLayout, routeLineModeClick} from './layout'

describe('computeGridLayout', () => {
  test('uses the responsive column budget and area-aware image caps', () => {
    const layout = computeGridLayout({
      viewportWidth: 1200,
      items: photoGalleryData.slice(0, 4),
    })

    expect(layout.columns).toBe(4)
    expect(layout.columnWidth).toBeCloseTo(266, 5)

    const square = layout.cards[0]
    const portrait = layout.cards[1]
    const landscape = layout.cards[3]

    expect(square.imageWidth).toBeCloseTo(226.1, 5)
    expect(square.imageHeight).toBeCloseTo(226.1, 5)

    expect(portrait.imageWidth).toBeCloseTo(186.2, 5)
    expect(portrait.imageHeight).toBeCloseTo(279.3, 5)

    expect(landscape.imageWidth).toBeCloseTo(266, 5)
    expect(landscape.imageHeight).toBeCloseTo(177.3333333333, 5)
  })

  test('clamps the responsive grid to seven columns', () => {
    const layout = computeGridLayout({
      viewportWidth: 2200,
      items: photoGalleryData.slice(0, 8),
    })

    expect(layout.columns).toBe(7)
    expect(layout.cards[6].x).toBeGreaterThan(layout.cards[5].x)
    expect(layout.rowTops[1]).toBeGreaterThan(layout.rowTops[0])
  })
})

describe('routeLineModeClick', () => {
  test('routes the left and right 100px strips to previous and next', () => {
    expect(
      routeLineModeClick({
        viewportWidth: 1280,
        pointerX: 80,
        hasPrevious: true,
        hasNext: true,
      }),
    ).toBe('previous')

    expect(
      routeLineModeClick({
        viewportWidth: 1280,
        pointerX: 1210,
        hasPrevious: true,
        hasNext: true,
      }),
    ).toBe('next')
  })

  test('dismisses when clicking the middle or a strip with no target', () => {
    expect(
      routeLineModeClick({
        viewportWidth: 1280,
        pointerX: 400,
        hasPrevious: true,
        hasNext: true,
      }),
    ).toBe('dismiss')

    expect(
      routeLineModeClick({
        viewportWidth: 1280,
        pointerX: 40,
        hasPrevious: false,
        hasNext: true,
      }),
    ).toBe('dismiss')

    expect(
      routeLineModeClick({
        viewportWidth: 1280,
        pointerX: 1275,
        hasPrevious: true,
        hasNext: false,
      }),
    ).toBe('dismiss')
  })
})
