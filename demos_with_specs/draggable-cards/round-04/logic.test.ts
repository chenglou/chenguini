import { describe, expect, test } from 'bun:test'
import { applyReorderThresholds, estimateReleaseVelocity } from './shared'

describe('applyReorderThresholds', () => {
  test('does not reorder downward until the pointer crosses the next midpoint', () => {
    const result = applyReorderThresholds({
      orderedCardIds: [0, 1, 2],
      draggedCardId: 0,
      pointerY: 199,
      topPadding: 50,
      getCardHeight(cardId) {
        switch (cardId) {
          case 0:
            return 60
          case 1:
            return 180
          case 2:
            return 90
        }
      },
    })

    expect(result.orderedCardIds).toEqual([0, 1, 2])
    expect(result.draggedOrderIndex).toBe(0)
    expect(result.swapCount).toBe(0)
  })

  test('swaps downward once the pointer crosses the next midpoint', () => {
    const result = applyReorderThresholds({
      orderedCardIds: [0, 1, 2],
      draggedCardId: 0,
      pointerY: 201,
      topPadding: 50,
      getCardHeight(cardId) {
        switch (cardId) {
          case 0:
            return 60
          case 1:
            return 180
          case 2:
            return 90
        }
      },
    })

    expect(result.orderedCardIds).toEqual([1, 0, 2])
    expect(result.draggedOrderIndex).toBe(1)
    expect(result.swapCount).toBe(1)
  })

  test('can leap across multiple cards in one move', () => {
    const result = applyReorderThresholds({
      orderedCardIds: [0, 1, 2, 3],
      draggedCardId: 0,
      pointerY: 351,
      topPadding: 50,
      getCardHeight(cardId) {
        switch (cardId) {
          case 0:
            return 60
          case 1:
            return 80
          case 2:
            return 100
          case 3:
            return 120
        }
      },
    })

    expect(result.orderedCardIds).toEqual([1, 2, 3, 0])
    expect(result.draggedOrderIndex).toBe(3)
    expect(result.swapCount).toBe(3)
  })

  test('swaps upward once the pointer crosses the previous midpoint', () => {
    const result = applyReorderThresholds({
      orderedCardIds: [0, 2, 1, 3],
      draggedCardId: 1,
      pointerY: 149,
      topPadding: 50,
      getCardHeight(cardId) {
        switch (cardId) {
          case 0:
            return 60
          case 1:
            return 100
          case 2:
            return 140
          case 3:
            return 120
        }
      },
    })

    expect(result.orderedCardIds).toEqual([0, 1, 2, 3])
    expect(result.draggedOrderIndex).toBe(1)
    expect(result.swapCount).toBe(1)
  })
})

describe('estimateReleaseVelocity', () => {
  test('uses only recent samples from roughly the last 100ms', () => {
    const velocity = estimateReleaseVelocity({
      now: 220,
      samples: [
        { x: 0, y: 0, time: 0 },
        { x: 100, y: 50, time: 80 },
        { x: 220, y: 170, time: 160 },
        { x: 260, y: 210, time: 220 },
      ],
    })

    expect(velocity.x).toBeCloseTo(1600, 6)
    expect(velocity.y).toBeCloseTo(1600, 6)
  })

  test('returns zero velocity when there is not enough recent history', () => {
    const velocity = estimateReleaseVelocity({
      now: 1000,
      samples: [{ x: 120, y: 240, time: 1000 }],
    })

    expect(velocity).toEqual({ x: 0, y: 0 })
  })
})
