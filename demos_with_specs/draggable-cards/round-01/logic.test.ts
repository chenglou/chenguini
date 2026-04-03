import { describe, expect, test } from 'bun:test'
import { estimateReleaseVelocity, reorderWhileDragging, type CardLayout } from './model'

describe('reorderWhileDragging', () => {
  const layout: CardLayout[] = [
    { id: 0, top: 50, height: 90 },
    { id: 1, top: 140, height: 120 },
    { id: 2, top: 260, height: 80 },
    { id: 3, top: 340, height: 100 },
    { id: 4, top: 440, height: 110 },
  ]

  test('swaps upward once the pointer crosses the previous midpoint', () => {
    const result = reorderWhileDragging({
      order: [0, 1, 2, 3, 4],
      draggedId: 2,
      pointerY: 190,
      layout,
    })

    expect(result.order).toEqual([0, 2, 1, 3, 4])
    expect(result.didSwap).toBe(true)
  })

  test('swaps downward once the pointer crosses the next midpoint', () => {
    const result = reorderWhileDragging({
      order: [0, 1, 2, 3, 4],
      draggedId: 2,
      pointerY: 391,
      layout,
    })

    expect(result.order).toEqual([0, 1, 3, 2, 4])
    expect(result.didSwap).toBe(true)
  })

  test('keeps swapping until the dragged card reaches the correct slot', () => {
    const result = reorderWhileDragging({
      order: [0, 1, 2, 3, 4],
      draggedId: 4,
      pointerY: 90,
      layout,
    })

    expect(result.order).toEqual([4, 0, 1, 2, 3])
    expect(result.didSwap).toBe(true)
  })

  test('does nothing when the pointer stays on the same side of the threshold', () => {
    const result = reorderWhileDragging({
      order: [0, 1, 2, 3, 4],
      draggedId: 2,
      pointerY: 320,
      layout,
    })

    expect(result.order).toEqual([0, 1, 2, 3, 4])
    expect(result.didSwap).toBe(false)
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

  test('returns zero when there is not enough history inside the window', () => {
    const velocity = estimateReleaseVelocity([
      { x: 20, y: 40, time: 20 },
    ], 20)

    expect(velocity).toEqual({ x: 0, y: 0 })
  })
})
