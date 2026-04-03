import {describe, expect, test} from 'bun:test'

import {photoGalleryData} from './data'
import {
  GRID_CAPTION_HEIGHT,
  GRID_TOP_PADDING,
  computeGridLayout,
  getGridImageMetrics,
  routeLineModeClick,
} from './layout'

describe('getGridImageMetrics', () => {
  test('shrinks square images and lets portrait images grow a bit', () => {
    const landscape = getGridImageMetrics(
      {id: 'landscape', w: 2048, h: 1024, prompt: 'Landscape'},
      300,
    )
    const square = getGridImageMetrics(
      {id: 'square', w: 1024, h: 1024, prompt: 'Square'},
      300,
    )
    const portrait = getGridImageMetrics(
      {id: 'portrait', w: 1024, h: 1536, prompt: 'Portrait'},
      300,
    )

    expect(landscape.imageWidth).toBe(300)
    expect(landscape.imageHeight).toBe(150)
    expect(square.imageWidth).toBe(255)
    expect(square.imageHeight).toBe(255)
    expect(portrait.imageWidth).toBe(210)
    expect(portrait.imageHeight).toBe(315)
  })
})

describe('computeGridLayout', () => {
  test('uses a responsive column count capped at seven', () => {
    const narrow = computeGridLayout(photoGalleryData.slice(0, 4), 320)
    const wide = computeGridLayout(photoGalleryData.slice(0, 8), 2400)

    expect(narrow.columnCount).toBe(1)
    expect(wide.columnCount).toBe(7)
  })

  test('starts the first row after the required top padding', () => {
    const layout = computeGridLayout(photoGalleryData.slice(0, 3), 900)

    expect(layout.items.every((item) => item.y >= GRID_TOP_PADDING)).toBe(true)
    expect(layout.items[0]?.y).toBe(GRID_TOP_PADDING)
    expect(layout.items[0]?.cardHeight).toBe(
      layout.items[0]!.imageHeight + GRID_CAPTION_HEIGHT,
    )
  })
})

describe('routeLineModeClick', () => {
  test('routes to the forgiving left and right strips', () => {
    expect(routeLineModeClick(40, 1280, true, true)).toBe('previous')
    expect(routeLineModeClick(1240, 1280, true, true)).toBe('next')
    expect(routeLineModeClick(640, 1280, true, true)).toBe('dismiss')
  })

  test('falls back to dismiss when a nav strip has no neighbor', () => {
    expect(routeLineModeClick(40, 1280, false, true)).toBe('dismiss')
    expect(routeLineModeClick(1240, 1280, true, false)).toBe('dismiss')
  })
})
