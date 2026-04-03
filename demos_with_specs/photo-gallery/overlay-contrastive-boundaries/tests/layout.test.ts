import { expect, test } from 'bun:test'
import { photoGalleryData } from '../data.js'
import {
  getColumns,
  getDismissScrollTop,
  measureGridLayout,
} from '../layout.js'

test('grid columns clamp to the spec range', () => {
  expect(getColumns(800)).toBe(3)
  expect(getColumns(2000)).toBe(7)
})

test('grid layout computes row ranges and a reduced mounted set', () => {
  const layout = measureGridLayout(photoGalleryData, 1200)

  expect(layout.columns).toBeGreaterThanOrEqual(1)
  expect(layout.rows.length).toBeGreaterThan(0)
  expect(layout.contentHeight).toBeGreaterThan(0)

  const mountedRange = layout.getMountedRange(0, 720)
  expect(mountedRange[0]).toBe(0)
  expect(mountedRange[1]).toBeLessThan(photoGalleryData.length)
})

test('dismiss restore keeps visible rows stable and otherwise lands about 40px above', () => {
  expect(
    getDismissScrollTop({
      rowTop: 900,
      rowBottom: 1200,
      scrollTop: 0,
      viewportHeight: 700,
    }),
  ).toBe(860)

  expect(
    getDismissScrollTop({
      rowTop: 900,
      rowBottom: 1200,
      scrollTop: 840,
      viewportHeight: 700,
    }),
  ).toBe(840)
})
