import { describe, expect, test } from 'bun:test'

import { computeGridLayout } from '../layout'

const samplePhotos = [
  {
    id: 'square',
    w: 2048,
    h: 2048,
    prompt: 'Miniature watermelon delicately balanced on fingertip',
  },
  {
    id: 'portrait',
    w: 1792,
    h: 2688,
    prompt: 'Hourglass heart, liquid, grand canyon background, fleeting, ephemerality of time',
  },
  {
    id: 'landscape',
    w: 1536,
    h: 768,
    prompt: 'Tetris monuments in lord of the rings setting',
  },
  {
    id: 'square-2',
    w: 1024,
    h: 1024,
    prompt: 'Apple WWDC promo, dan mumford',
  },
] as const

describe('computeGridLayout', () => {
  test('uses 32px side padding, 24px gaps, and clamps columns to 7', () => {
    const layout = computeGridLayout(samplePhotos, 2_400)

    expect(layout.columns).toBe(7)
    expect(layout.sidePadding).toBe(32)
    expect(layout.gap).toBe(24)
    expect(layout.topPadding).toBe(40)
    expect(layout.boxMaxSizeX).toBeCloseTo((2_400 - 64 - 24 * 6) / 7, 5)
    expect(layout.items[0]?.x).toBe(32)
    expect(layout.items[1]?.x).toBeCloseTo(32 + layout.boxMaxSizeX + 24, 5)
  })

  test('drops to fewer columns once the target card width would go below about 220px', () => {
    expect(computeGridLayout(samplePhotos, 1_600).columns).toBe(6)
    expect(computeGridLayout(samplePhotos, 760).columns).toBe(2)
    expect(computeGridLayout(samplePhotos, 260).columns).toBe(1)
  })

  test('caps square and portrait image heights differently from landscape ones', () => {
    const layout = computeGridLayout(samplePhotos, 1_600)
    const square = layout.items[0]
    const portrait = layout.items[1]
    const landscape = layout.items[2]

    if (square == null || portrait == null || landscape == null) {
      throw new Error('layout items missing')
    }

    expect(square.imageHeight).toBeCloseTo(layout.boxMaxSizeX * 0.85, 5)
    expect(portrait.imageHeight).toBeCloseTo(layout.boxMaxSizeX * 1.05, 5)
    expect(landscape.imageHeight).toBeCloseTo(layout.boxMaxSizeX * 0.5, 5)
    expect(square.cardHeight).toBeCloseTo(square.imageHeight + 44 + 8, 5)
  })

  test('stacks later rows after the tallest card in the row plus the 24px gap', () => {
    const layout = computeGridLayout(samplePhotos, 760)
    const first = layout.items[0]
    const second = layout.items[1]
    const third = layout.items[2]

    if (first == null || second == null || third == null) {
      throw new Error('layout items missing')
    }

    const firstRowHeight = Math.max(first.cardHeight, second.cardHeight)

    expect(first.rowIndex).toBe(0)
    expect(second.rowIndex).toBe(0)
    expect(third.rowIndex).toBe(1)
    expect(first.y).toBe(40)
    expect(third.y).toBeCloseTo(40 + firstRowHeight + 24, 5)
    expect(layout.totalHeight).toBeGreaterThan(third.y + third.cardHeight)
  })
})
