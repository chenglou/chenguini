import {describe, expect, test} from 'bun:test'

import {photoGalleryData} from '../data'
import {
  buildGridLayout,
  formatFocusedHash,
  parseFocusedHash,
  routeLineClick,
} from '../model'

const knownIds = new Set(photoGalleryData.map((photo) => photo.id))

describe('grid layout', () => {
  test('respects caps, padding, gaps, and size factors', () => {
    const layout = buildGridLayout(photoGalleryData, 1848)

    expect(layout.columnCount).toBe(7)
    expect(layout.boxMaxSizeX).toBeCloseTo(234.2857142857, 4)
    expect(layout.rows.length).toBe(4)
    expect(layout.rows[0]!.top).toBe(40)
    expect(layout.rows[1]!.top).toBeCloseTo(529.0943396226, 4)

    expect(layout.itemsById.get(photoGalleryData[0]!.id)!.cardWidth).toBeCloseTo(
      layout.boxMaxSizeX * 0.85,
      4,
    )
    expect(layout.itemsById.get(photoGalleryData[3]!.id)!.cardWidth).toBeCloseTo(
      layout.boxMaxSizeX,
      4,
    )
    expect(layout.itemsById.get(photoGalleryData[1]!.id)!.cardWidth).toBeCloseTo(
      layout.boxMaxSizeX * 1.05,
      4,
    )
  })

  test('changes when the viewport grows enough for another column', () => {
    const narrow = buildGridLayout(photoGalleryData, 1664)
    const wide = buildGridLayout(photoGalleryData, 1848)

    expect(narrow.columnCount).toBe(6)
    expect(wide.columnCount).toBe(7)
    expect(wide.boxMaxSizeX).toBeLessThan(narrow.boxMaxSizeX)
    expect(wide.rows[0]!.itemIds).toHaveLength(7)
    expect(narrow.rows[0]!.itemIds).toHaveLength(6)
    expect(wide.contentHeight).toBeLessThan(narrow.contentHeight)
  })
})

describe('focused hash', () => {
  test('round-trips a known photo id and ignores unknown ids', () => {
    const targetId = photoGalleryData[10]!.id

    expect(parseFocusedHash(formatFocusedHash(targetId), knownIds)).toBe(targetId)
    expect(parseFocusedHash('#photo=not-a-real-id', knownIds)).toBeNull()
    expect(parseFocusedHash('', knownIds)).toBeNull()
  })
})

describe('line click routing', () => {
  test('uses the fixed 100px left and right strips', () => {
    expect(
      routeLineClick({clientX: 99, viewportWidth: 1200, focusedIndex: 5, itemCount: 24}),
    ).toEqual({kind: 'previous', nextIndex: 4})

    expect(
      routeLineClick({clientX: 100, viewportWidth: 1200, focusedIndex: 5, itemCount: 24}),
    ).toEqual({kind: 'dismiss', nextIndex: 5})

    expect(
      routeLineClick({clientX: 600, viewportWidth: 1200, focusedIndex: 5, itemCount: 24}),
    ).toEqual({kind: 'dismiss', nextIndex: 5})

    expect(
      routeLineClick({clientX: 1100, viewportWidth: 1200, focusedIndex: 5, itemCount: 24}),
    ).toEqual({kind: 'dismiss', nextIndex: 5})

    expect(
      routeLineClick({clientX: 1101, viewportWidth: 1200, focusedIndex: 5, itemCount: 24}),
    ).toEqual({kind: 'next', nextIndex: 6})
  })
})
