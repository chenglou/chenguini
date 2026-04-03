import {describe, expect, test} from 'bun:test'

import {buildGridLayout, getLineClickAction, getVisibleRowRange, photoGalleryData} from '../gallery-model'

describe('grid layout math', () => {
  test('wide screens cap at seven columns and keep the target card width near 220px', () => {
    const layout = buildGridLayout({
      photos: photoGalleryData,
      viewportWidth: 1800,
      sidePadding: 32,
      topPadding: 40,
      gap: 24,
      gridCaptionVisibleHeight: 44,
      gridCaptionBottomGap: 8,
      maxColumns: 7,
      minTargetCardWidth: 220,
    })

    expect(layout.columnCount).toBe(7)
    expect(layout.boxMaxSizeX).toBeCloseTo(227.43, 2)
    expect(layout.cards[3]!.boxHeight).toBeCloseTo(layout.boxMaxSizeX, 5)
    expect(layout.cards[0]!.boxHeight).toBeCloseTo(layout.boxMaxSizeX * 0.85, 5)
    expect(layout.cards[1]!.boxHeight).toBeCloseTo(layout.boxMaxSizeX * 1.05, 5)
  })

  test('narrower screens reduce the column count instead of shrinking forever', () => {
    const wideLayout = buildGridLayout({
      photos: photoGalleryData,
      viewportWidth: 1800,
      sidePadding: 32,
      topPadding: 40,
      gap: 24,
      gridCaptionVisibleHeight: 44,
      gridCaptionBottomGap: 8,
      maxColumns: 7,
      minTargetCardWidth: 220,
    })
    const narrowLayout = buildGridLayout({
      photos: photoGalleryData,
      viewportWidth: 1100,
      sidePadding: 32,
      topPadding: 40,
      gap: 24,
      gridCaptionVisibleHeight: 44,
      gridCaptionBottomGap: 8,
      maxColumns: 7,
      minTargetCardWidth: 220,
    })

    expect(wideLayout.columnCount).toBe(7)
    expect(narrowLayout.columnCount).toBe(4)
    expect(narrowLayout.boxMaxSizeX).toBeCloseTo(241, 5)
    expect(narrowLayout.totalHeight).toBeGreaterThan(wideLayout.totalHeight)
  })

  test('visible row range is smaller than the full gallery on a representative scroll state', () => {
    const layout = buildGridLayout({
      photos: photoGalleryData,
      viewportWidth: 1280,
      sidePadding: 32,
      topPadding: 40,
      gap: 24,
      gridCaptionVisibleHeight: 44,
      gridCaptionBottomGap: 8,
      maxColumns: 7,
      minTargetCardWidth: 220,
    })
    const middleRow = layout.rows[2]!

    const visible = getVisibleRowRange({
      rows: layout.rows,
      scrollY: middleRow.y + 16,
      viewportHeight: 280,
      overscanRows: 0,
    })

    expect(visible.startRowIndex).toBe(2)
    expect(visible.endRowIndex).toBe(2)
    expect(visible.mountedCount).toBeLessThan(photoGalleryData.length)
  })
})

describe('line click routing', () => {
  test('the left strip goes previous, the right strip goes next, and the middle dismisses', () => {
    expect(getLineClickAction({clientX: 0, viewportWidth: 1200, sideStripWidth: 100})).toBe('previous')
    expect(getLineClickAction({clientX: 99, viewportWidth: 1200, sideStripWidth: 100})).toBe('previous')
    expect(getLineClickAction({clientX: 100, viewportWidth: 1200, sideStripWidth: 100})).toBe('dismiss')
    expect(getLineClickAction({clientX: 600, viewportWidth: 1200, sideStripWidth: 100})).toBe('dismiss')
    expect(getLineClickAction({clientX: 1100, viewportWidth: 1200, sideStripWidth: 100})).toBe('next')
    expect(getLineClickAction({clientX: 1199, viewportWidth: 1200, sideStripWidth: 100})).toBe('next')
  })
})
