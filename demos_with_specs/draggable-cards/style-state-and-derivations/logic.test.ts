import { describe, expect, test } from 'bun:test'
import { buildStackLayout, estimateReleaseVelocity, reorderIdsByPointerY } from './logic'

describe('reorderIdsByPointerY', () => {
  test('swaps upward once the pointer crosses the previous midpoint', () => {
    const order = [0, 1, 2, 3, 4]
    const layout = buildStackLayout(order)

    const result = reorderIdsByPointerY(order, 2, layout[1]!.midpoint - 1)

    expect(result.order).toEqual([0, 2, 1, 3, 4])
    expect(result.didSwap).toBe(true)
  })

  test('swaps downward once the pointer crosses the next midpoint', () => {
    const order = [0, 1, 2, 3, 4]
    const layout = buildStackLayout(order)

    const result = reorderIdsByPointerY(order, 2, layout[3]!.midpoint + 1)

    expect(result.order).toEqual([0, 1, 3, 2, 4])
    expect(result.didSwap).toBe(true)
  })

  test('keeps swapping until the dragged card reaches the right slot', () => {
    const order = [0, 1, 2, 3, 4]
    const layout = buildStackLayout(order)

    const result = reorderIdsByPointerY(order, 4, layout[0]!.midpoint - 1)

    expect(result.order).toEqual([4, 0, 1, 2, 3])
    expect(result.didSwap).toBe(true)
  })
})

describe('estimateReleaseVelocity', () => {
  test('uses roughly the last 100ms of pointer history', () => {
    const velocity = estimateReleaseVelocity([
      { x: 0, y: 0, time: 0 },
      { x: 20, y: 40, time: 20 },
      { x: 80, y: 120, time: 80 },
      { x: 120, y: 180, time: 120 },
    ], 120)

    expect(velocity).toEqual({ x: 1000, y: 1400 })
  })

  test('returns zero when the history is too short to estimate a velocity', () => {
    const velocity = estimateReleaseVelocity([
      { x: 20, y: 40, time: 20 },
    ], 20)

    expect(velocity).toEqual({ x: 0, y: 0 })
  })
})
