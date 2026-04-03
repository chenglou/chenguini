import {expect, test} from 'bun:test'

import {photoGalleryData} from '../data'
import {
  GRID_CAPTION_BOTTOM,
  GRID_CAPTION_VISIBLE,
  GRID_GAP,
  GRID_MAX_COLUMNS,
  GRID_MIN_TARGET_CARD_WIDTH,
  GRID_SIDE_PADDING,
  GRID_TOP_PADDING,
  LINE_LEFT_STRIP,
  LINE_RIGHT_STRIP,
  createGridLayout,
  routeLineClick,
} from '../gallery'

test('grid layout keeps the exact sizing constants and aspect buckets', () => {
  const layout = createGridLayout(photoGalleryData.slice(0, 3), 1800)
  const expectedAvailableWidth = 1800 - GRID_SIDE_PADDING * 2
  const expectedBoxMaxSizeX =
    (expectedAvailableWidth - GRID_GAP * (GRID_MAX_COLUMNS - 1)) / GRID_MAX_COLUMNS

  expect(layout.availableWidth).toBe(expectedAvailableWidth)
  expect(layout.columnCount).toBe(GRID_MAX_COLUMNS)
  expect(layout.boxMaxSizeX).toBeCloseTo(expectedBoxMaxSizeX, 6)

  expect(layout.items[0]?.width).toBeCloseTo(expectedBoxMaxSizeX * 0.85, 6)
  expect(layout.items[1]?.width).toBeCloseTo(expectedBoxMaxSizeX * 1.05, 6)
  expect(layout.items[2]?.width).toBeCloseTo(expectedBoxMaxSizeX * 1.05, 6)
})

test('grid layout positions rows with 32/24/40 spacing and wraps when needed', () => {
  const layout = createGridLayout(photoGalleryData.slice(0, 5), 900)

  expect(layout.rows[0]?.y).toBe(GRID_TOP_PADDING)
  expect(layout.items[0]?.x).toBe(GRID_SIDE_PADDING)
  expect(layout.items[1]?.x).toBeCloseTo(
    GRID_SIDE_PADDING + (layout.items[0]?.width ?? 0) + GRID_GAP,
    6,
  )
  expect(layout.items[0]?.height).toBeCloseTo(
    ((layout.items[0]?.width ?? 0) * photoGalleryData[0]!.h) / photoGalleryData[0]!.w +
      GRID_CAPTION_VISIBLE +
      GRID_CAPTION_BOTTOM,
    6,
  )
  expect(layout.rows.length).toBeGreaterThan(1)
  expect(layout.items[3]?.rowIndex).toBe(1)

  const nextRowMinY = GRID_TOP_PADDING + (layout.rows[0]?.height ?? 0) + GRID_GAP
  expect(layout.rows[1]?.y).toBeCloseTo(nextRowMinY, 6)
})

test('grid columns stay near the 220px target and never exceed seven columns', () => {
  const layout = createGridLayout(photoGalleryData.slice(0, 10), 1420)
  const rawColumnCount = Math.floor(
    (layout.availableWidth + GRID_GAP) / (GRID_MIN_TARGET_CARD_WIDTH + GRID_GAP),
  )

  expect(layout.columnCount).toBe(Math.min(GRID_MAX_COLUMNS, Math.max(1, rawColumnCount)))
  expect(layout.columnCount).toBeLessThanOrEqual(GRID_MAX_COLUMNS)
  expect(layout.boxMaxSizeX).toBeGreaterThan(215)
  expect(layout.boxMaxSizeX).toBeLessThan(280)
})

test('line click routing keeps the 100px left and right strips exact', () => {
  const viewportWidth = 1200

  expect(routeLineClick(0, viewportWidth)).toBe('previous')
  expect(routeLineClick(LINE_LEFT_STRIP - 1, viewportWidth)).toBe('previous')
  expect(routeLineClick(LINE_LEFT_STRIP, viewportWidth)).toBe('dismiss')
  expect(routeLineClick(viewportWidth - LINE_RIGHT_STRIP - 1, viewportWidth)).toBe('dismiss')
  expect(routeLineClick(viewportWidth - LINE_RIGHT_STRIP, viewportWidth)).toBe('next')
  expect(routeLineClick(viewportWidth - 1, viewportWidth)).toBe('next')
})
