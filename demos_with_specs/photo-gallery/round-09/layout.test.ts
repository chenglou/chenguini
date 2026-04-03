import {describe, expect, test} from 'bun:test'

import {computeGridLayout, routeLineModeClick} from './layout'
import {photoGalleryData} from './data'

describe('computeGridLayout', () => {
  test('uses aspect-aware image caps for landscape, portrait, and square cards', () => {
    const layout = computeGridLayout({
      viewportWidth: 1200,
      items: photoGalleryData.slice(0, 4),
    })

    expect(layout.columns).toBe(4)
    expect(layout.columnWidth).toBeCloseTo(266, 5)

    const landscape = layout.cards[3]
    const portrait = layout.cards[1]
    const square = layout.cards[0]

    expect(landscape.imageWidth).toBeCloseTo(266, 5)
    expect(landscape.imageHeight).toBeCloseTo(177.3333333333, 5)

    expect(portrait.imageWidth).toBeCloseTo(186.2, 5)
    expect(portrait.imageHeight).toBeCloseTo(279.3, 5)

    expect(square.imageWidth).toBeCloseTo(226.1, 5)
    expect(square.imageHeight).toBeCloseTo(226.1, 5)
    expect(square.cardHeight).toBeCloseTo(278.1, 5)
  })

  test('changes column count responsively and clamps to seven columns', () => {
    const narrow = computeGridLayout({
      viewportWidth: 760,
      items: photoGalleryData.slice(0, 8),
    })
    const wide = computeGridLayout({
      viewportWidth: 2200,
      items: photoGalleryData.slice(0, 8),
    })

    expect(narrow.columns).toBe(2)
    expect(wide.columns).toBe(7)
    expect(narrow.cards[0].x).toBeCloseTo(57.2, 5)
    expect(wide.cards[6].x).toBeGreaterThan(wide.cards[5].x)
    expect(wide.rowTops[1]).toBeGreaterThan(wide.rowTops[0])
  })
})

describe('routeLineModeClick', () => {
  test('uses the left and right 100px strips as forgiving navigation hit areas', () => {
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
        pointerX: 1205,
        hasPrevious: true,
        hasNext: true,
      }),
    ).toBe('next')
  })

  test('dismisses when clicking outside the strips or when a strip has no target', () => {
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
