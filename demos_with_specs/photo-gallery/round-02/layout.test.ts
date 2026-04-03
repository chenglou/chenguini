import { expect, test } from 'bun:test'

import {
  getGridBoxWidth,
  getGridColumnCount,
  getGridImageMetrics,
  gridGap,
  gridTopPadding,
  layoutGrid,
  maxGridColumns,
} from './model'

test('grid column count clamps between 1 and 7', () => {
  expect(getGridColumnCount(180)).toBe(1)
  expect(getGridColumnCount(540)).toBe(2)
  expect(getGridColumnCount(2600)).toBe(maxGridColumns)
})

test('grid image heuristics follow the spec for landscape, square, and portrait images', () => {
  const boxMaxSizeX = getGridBoxWidth(1200, 4)

  const landscape = getGridImageMetrics({ id: 'landscape', w: 1500, h: 1000, prompt: '' }, boxMaxSizeX)
  const square = getGridImageMetrics({ id: 'square', w: 1000, h: 1000, prompt: '' }, boxMaxSizeX)
  const portrait = getGridImageMetrics({ id: 'portrait', w: 1000, h: 1500, prompt: '' }, boxMaxSizeX)

  expect(landscape.kind).toBe('landscape')
  expect(square.kind).toBe('square')
  expect(portrait.kind).toBe('portrait')

  expect(landscape.width).toBeCloseTo(boxMaxSizeX, 4)
  expect(square.height).toBeCloseTo(boxMaxSizeX * 0.85, 4)
  expect(portrait.height).toBeCloseTo(boxMaxSizeX * 1.05, 4)
})

test('grid layout uses the tallest card in a row and keeps row tops stable', () => {
  const photos = [
    { id: 'a', w: 1200, h: 800, prompt: '' },
    { id: 'b', w: 1000, h: 1000, prompt: '' },
    { id: 'c', w: 1000, h: 1500, prompt: '' },
    { id: 'd', w: 1400, h: 900, prompt: '' },
  ]

  const layout = layoutGrid(photos, 720)
  expect(layout.columnCount).toBe(2)
  expect(layout.items[0].y).toBe(gridTopPadding)
  expect(layout.items[1].y).toBe(gridTopPadding)

  const firstRowBottom = Math.max(
    layout.items[0].y + layout.items[0].height,
    layout.items[1].y + layout.items[1].height,
  )

  expect(layout.items[2].y).toBeCloseTo(firstRowBottom + gridGap, 4)
  expect(layout.items[3].y).toBeCloseTo(firstRowBottom + gridGap, 4)
  expect(layout.totalHeight).toBeGreaterThan(firstRowBottom)
})
