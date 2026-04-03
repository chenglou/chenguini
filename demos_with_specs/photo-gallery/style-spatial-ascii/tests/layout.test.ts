import { expect, test } from 'bun:test'

import { photoGalleryData } from '../data'
import { computeGridLayout } from '../layout'

test('grid layout math uses responsive columns and the shared spacing rules', () => {
  const layout = computeGridLayout(photoGalleryData, 1200)

  expect(layout.columnCount).toBe(4)
  expect(layout.cardWidth).toBe(266)
  expect(layout.sidePadding).toBe(32)
  expect(layout.gap).toBe(24)
  expect(layout.topPadding).toBe(40)

  expect(layout.items[0]!.x).toBe(32)
  expect(layout.items[0]!.y).toBe(40)
  expect(layout.items[1]!.x).toBe(322)
  expect(layout.items[4]!.rowIndex).toBe(1)
  expect(layout.items[4]!.y).toBeGreaterThan(layout.items[0]!.y)
  expect(layout.totalHeight).toBeGreaterThan(600)
})
