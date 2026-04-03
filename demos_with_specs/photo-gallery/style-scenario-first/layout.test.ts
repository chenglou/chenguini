import { expect, test } from 'bun:test'

import { photoGalleryData } from './data'
import { computeGridLayout, resolveLineModeClick } from './layout'

test('grid layout math respects the fixed paddings, gaps, and column cap', () => {
  const layout = computeGridLayout(1024, 900, photoGalleryData)

  expect(layout.columns).toBe(4)
  expect(layout.columnWidth).toBe(222)
  expect(layout.items[0]?.x).toBe(32)
  expect(layout.items[0]?.y).toBe(40)
  expect(layout.items[1]?.x).toBe(278)
  expect(layout.items[4]?.y).toBeGreaterThan(layout.items[0]?.y ?? 0)

  const square = layout.items.find((item) => item.id === 'd228330c-7364-497b-994f-a37467ae436a/0_0')
  const portrait = layout.items.find((item) => item.id === '7b5301ca-ef01-44bd-8bcc-4473c945aaaf/0_0')
  const landscape = layout.items.find((item) => item.id === 'e1d06d80-68ca-4081-9ca2-73f5ba7333cc/0_3')

  expect(square?.imageWidth).toBeCloseTo(188.7, 1)
  expect(square?.imageHeight).toBeCloseTo(188.7, 1)
  expect(portrait?.imageHeight).toBeCloseTo(233.1, 1)
  expect(landscape?.imageWidth).toBe(222)
  expect(landscape?.imageHeight).toBeCloseTo(111, 0)
})

test('grid layout never exceeds seven columns', () => {
  const layout = computeGridLayout(3200, 900, photoGalleryData)

  expect(layout.columns).toBe(7)
})

test('line mode click routing uses the viewport strips, not the animated card edges', () => {
  expect(resolveLineModeClick(900, 12, 5, 24)).toEqual({action: 'previous', focusedIndex: 4})
  expect(resolveLineModeClick(900, 899, 5, 24)).toEqual({action: 'next', focusedIndex: 6})
  expect(resolveLineModeClick(900, 450, 5, 24)).toEqual({action: 'dismiss', focusedIndex: null})
})

test('line mode click routing focuses the first image when nothing is focused yet', () => {
  expect(resolveLineModeClick(900, 4, null, 24)).toEqual({action: 'previous', focusedIndex: 0})
  expect(resolveLineModeClick(900, 892, null, 24)).toEqual({action: 'next', focusedIndex: 0})
})
