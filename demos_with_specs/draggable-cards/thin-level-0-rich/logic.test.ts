import { describe, expect, test } from 'bun:test'

import { estimateReleaseVelocity, reorderByMidpoint } from './logic'

type Slot = {
  id: number
  midpointY: number
  sizeY: number
  topY: number
}

function hash(n: number) {
  n = Math.imul((n >>> 16) ^ n, 0x21f0aaad)
  n = Math.imul((n >>> 15) ^ n, 0x735a2d97)
  return (((n >>> 15) ^ n) >>> 0) / 0x100000000
}

function buildSlots(cardCount: number): Slot[] {
  let topY = 50

  return Array.from({ length: cardCount }, (_, id) => {
    const sizeY = 30 + hash(id * 2) * 150
    const slot = {
      id,
      midpointY: topY + sizeY / 2,
      sizeY,
      topY,
    }
    topY += sizeY
    return slot
  })
}

describe('reorderByMidpoint', () => {
  test('moves a dragged card upward once the pointer crosses just above the previous midpoint', () => {
    const slots = buildSlots(5)

    expect(
      reorderByMidpoint({
        draggedId: 2,
        orderedCardIds: [0, 1, 2, 3, 4],
        pointerY: slots[1].midpointY - 1,
        slots,
      }),
    ).toEqual([0, 2, 1, 3, 4])
  })

  test('moves a dragged card downward once the pointer crosses just below the next midpoint', () => {
    const slots = buildSlots(5)

    expect(
      reorderByMidpoint({
        draggedId: 1,
        orderedCardIds: [0, 1, 2, 3, 4],
        pointerY: slots[2].midpointY + 1,
        slots,
      }),
    ).toEqual([0, 2, 1, 3, 4])
  })
})

describe('estimateReleaseVelocity', () => {
  test('uses roughly the last 100ms instead of the full drag history window', () => {
    const velocity = estimateReleaseVelocity(
      [
        { timeMs: 0, x: 0, y: 0 },
        { timeMs: 60, x: 600, y: 0 },
        { timeMs: 120, x: 610, y: 0 },
        { timeMs: 160, x: 620, y: 0 },
      ],
      160,
    )

    expect(velocity.x).toBeCloseTo(0.2, 3)
    expect(velocity.y).toBeCloseTo(0, 3)
  })
})
