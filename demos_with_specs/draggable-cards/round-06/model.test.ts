import { describe, expect, test } from 'bun:test'
import { estimateReleaseVelocity, reorderWhileDragging } from './model.ts'

describe('reorderWhileDragging', () => {
  test('swaps downward after crossing the next card midpoint', () => {
    const result = reorderWhileDragging({
      order: [0, 1, 2, 3, 4],
      draggedId: 1,
      pointerY: 281,
      topPadding: 50,
      heightsById: [80, 90, 120, 100, 110],
    })

    expect(result.order).toEqual([0, 2, 1, 3, 4])
    expect(result.swapped).toBe(true)
  })

  test('does not swap downward before reaching the next card midpoint', () => {
    const result = reorderWhileDragging({
      order: [0, 1, 2, 3, 4],
      draggedId: 1,
      pointerY: 199,
      topPadding: 50,
      heightsById: [80, 90, 120, 100, 110],
    })

    expect(result.order).toEqual([0, 1, 2, 3, 4])
    expect(result.swapped).toBe(false)
  })

  test('swaps upward after crossing the previous card midpoint', () => {
    const result = reorderWhileDragging({
      order: [0, 1, 2, 3, 4],
      draggedId: 3,
      pointerY: 175,
      topPadding: 50,
      heightsById: [80, 90, 120, 100, 110],
    })

    expect(result.order).toEqual([0, 1, 3, 2, 4])
    expect(result.swapped).toBe(true)
  })
})

describe('estimateReleaseVelocity', () => {
  test('uses roughly the last 100ms of pointer history', () => {
    const velocity = estimateReleaseVelocity([
      { x: 10, y: 20, time: 0 },
      { x: 18, y: 40, time: 20 },
      { x: 40, y: 80, time: 80 },
      { x: 70, y: 140, time: 140 },
      { x: 100, y: 200, time: 180 },
    ])

    expect(velocity.x).toBeCloseTo(600, 6)
    expect(velocity.y).toBeCloseTo(1200, 6)
  })

  test('returns zero when there is not enough recent history', () => {
    const velocity = estimateReleaseVelocity([{ x: 5, y: 9, time: 12 }])

    expect(velocity).toEqual({ x: 0, y: 0 })
  })
})
