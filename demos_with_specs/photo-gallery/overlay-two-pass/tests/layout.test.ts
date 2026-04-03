import { describe, expect, test } from 'bun:test'

import { layoutGrid, measureGridImage, resolveDismissToRow, resolveLineClick } from '../layout.js'

describe('layout math', () => {
  test('clamps the responsive grid to the pass A rules', () => {
    const layout = layoutGrid(
      [
        { id: 'a', w: 1024, h: 1024, prompt: 'square' },
        { id: 'b', w: 1536, h: 768, prompt: 'landscape' },
      ],
      1080,
    )

    expect(layout.sidePadding).toBe(32)
    expect(layout.gap).toBe(24)
    expect(layout.topPadding).toBe(40)
    expect(layout.columns).toBe(4)
    expect(layout.boxMaxSizeX).toBeCloseTo(236, 0)
  })

  test('shrinks square cards and lets portraits grow a little', () => {
    const square = measureGridImage({ w: 1024, h: 1024 }, 240)
    const portrait = measureGridImage({ w: 864, h: 1728 }, 240)
    const landscape = measureGridImage({ w: 1536, h: 768 }, 240)

    expect(square.imageHeight).toBeCloseTo(204, 0)
    expect(portrait.imageHeight).toBeCloseTo(252, 0)
    expect(landscape.imageHeight).toBeCloseTo(120, 0)
  })
})

describe('line click routing', () => {
  test('uses the 100px strips and dismisses the middle', () => {
    expect(
      resolveLineClick({
        x: 20,
        width: 1200,
        focusedIndex: 4,
        total: 10,
      }),
    ).toEqual({ type: 'prev', nextIndex: 3 })

    expect(
      resolveLineClick({
        x: 1180,
        width: 1200,
        focusedIndex: 4,
        total: 10,
      }),
    ).toEqual({ type: 'next', nextIndex: 5 })

    expect(
      resolveLineClick({
        x: 600,
        width: 1200,
        focusedIndex: 4,
        total: 10,
      }),
    ).toEqual({ type: 'dismiss' })
  })
})

describe('dismiss restore', () => {
  test('targets the focused row with a 40px peek above it', () => {
    const photos = Array.from({ length: 24 }, (_, index) => ({
      id: `photo-${index}`,
      w: 1024,
      h: index % 2 === 0 ? 1536 : 1024,
      prompt: `photo ${index}`,
    }))

    const layout = layoutGrid(photos, 1280)
    const target = resolveDismissToRow({
      layout,
      focusedId: 'photo-15',
      viewportHeight: 760,
    })

    expect(target.scrollTop).toBeGreaterThanOrEqual(0)
    expect(target.gapAboveRow).toBeCloseTo(40, 0)
  })
})
