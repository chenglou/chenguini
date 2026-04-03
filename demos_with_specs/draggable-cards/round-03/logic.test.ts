import { describe, expect, test } from 'bun:test'

import {
  reorderDraggedCard,
  estimateReleaseVelocity,
  type CardLayout,
  type PointerSample,
} from './logic'

describe('reorderDraggedCard', () => {
  const layout: CardLayout[] = [
    { id: 0, y: 50, height: 80 },
    { id: 1, y: 130, height: 100 },
    { id: 2, y: 230, height: 90 },
    { id: 3, y: 320, height: 70 },
  ]

  test('does not swap until the pointer crosses the next midpoint', () => {
    const result = reorderDraggedCard(layout, [0, 1, 2, 3], 1, 274)
    expect(result.order).toEqual([0, 1, 2, 3])
    expect(result.didSwap).toBe(false)
  })

  test('swaps downward once the pointer crosses the next midpoint', () => {
    const result = reorderDraggedCard(layout, [0, 1, 2, 3], 1, 276)
    expect(result.order).toEqual([0, 2, 1, 3])
    expect(result.didSwap).toBe(true)
  })

  test('can climb multiple slots upward in one move', () => {
    const result = reorderDraggedCard(layout, [0, 1, 2, 3], 3, 80)
    expect(result.order).toEqual([3, 0, 1, 2])
    expect(result.didSwap).toBe(true)
  })
})

describe('estimateReleaseVelocity', () => {
  test('uses roughly the last 100ms of pointer history', () => {
    const samples: PointerSample[] = [
      { x: 0, y: 0, time: 0 },
      { x: 40, y: 20, time: 50 },
      { x: 95, y: 50, time: 120 },
      { x: 155, y: 95, time: 200 },
    ]
    expect(estimateReleaseVelocity(samples, 200)).toEqual({ x: 750, y: 562.5 })
  })

  test('returns zero velocity when there is not enough recent movement', () => {
    const samples: PointerSample[] = [{ x: 20, y: 40, time: 120 }]
    expect(estimateReleaseVelocity(samples, 200)).toEqual({ x: 0, y: 0 })
  })
})
