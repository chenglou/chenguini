import { expect, test } from 'bun:test'

import { photoGalleryData } from '../data'
import { computeGridLayout } from '../layout'

test('grid layout math keeps the documented spacing and column cap', () => {
  const layout = computeGridLayout(photoGalleryData, {
    viewportWidth: 1920,
    viewportHeight: 900,
    scrollTop: 0,
  })

  expect(layout.sidePadding).toBe(32)
  expect(layout.gap).toBe(24)
  expect(layout.topPadding).toBe(40)
  expect(layout.columns).toBe(7)
  expect(layout.cardWidth).toBe(244)
  expect(layout.rows).toHaveLength(4)
  expect(layout.rows[0]?.top).toBe(40)
  expect(layout.rows[0]?.itemIds).toHaveLength(7)
  expect(layout.items[0]?.sizeX).toBeCloseTo(207.4, 1)
  expect(layout.items[0]?.sizeY).toBeCloseTo(259.4, 1)
})

