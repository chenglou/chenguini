import { describe, expect, test } from 'bun:test'
import { CARD_COUNT, TOP_PADDING, applyDragReorder, estimateReleaseVelocity, makeCards } from './logic.ts'

describe('applyDragReorder', () => {
  const cards = makeCards(CARD_COUNT)

  test('does not swap before the pointer crosses the next card midpoint', () => {
    const order = [0, 1, 2, 3, 4]
    const result = applyDragReorder(order, 0, TOP_PADDING + cards[0]!.sizeY + cards[1]!.sizeY / 2 - 1, cards, TOP_PADDING)
    expect(result.order).toEqual(order)
    expect(result.draggedIndex).toBe(0)
    expect(result.swapCount).toBe(0)
  })

  test('swaps downward once the pointer crosses the next card midpoint', () => {
    const order = [0, 1, 2, 3, 4]
    const result = applyDragReorder(order, 0, TOP_PADDING + cards[0]!.sizeY + cards[1]!.sizeY / 2 + 1, cards, TOP_PADDING)
    expect(result.order).toEqual([1, 0, 2, 3, 4])
    expect(result.draggedIndex).toBe(1)
    expect(result.swapCount).toBe(1)
  })

  test('can move multiple slots in one update and back upward again', () => {
    const movedDown = applyDragReorder([0, 1, 2, 3, 4], 0, TOP_PADDING + cards[0]!.sizeY + cards[1]!.sizeY + cards[2]!.sizeY / 2 + 40, cards, TOP_PADDING)
    expect(movedDown.order).toEqual([1, 2, 0, 3, 4])
    expect(movedDown.draggedIndex).toBe(2)
    expect(movedDown.swapCount).toBe(2)

    const movedUp = applyDragReorder(movedDown.order, movedDown.draggedIndex, TOP_PADDING + cards[1]!.sizeY / 2 - 5, cards, TOP_PADDING)
    expect(movedUp.order).toEqual([0, 1, 2, 3, 4])
    expect(movedUp.draggedIndex).toBe(0)
    expect(movedUp.swapCount).toBe(2)
  })
})

describe('estimateReleaseVelocity', () => {
  test('uses roughly the last 100ms of pointer history', () => {
    const velocity = estimateReleaseVelocity([
      { x: 0, y: 0, time: 0 },
      { x: 24, y: 24, time: 40 },
      { x: 90, y: 120, time: 90 },
      { x: 150, y: 220, time: 140 },
    ])

    expect(velocity.x).toBeCloseTo((150 - 24) / (140 - 40) * 1000, 4)
    expect(velocity.y).toBeCloseTo((220 - 24) / (140 - 40) * 1000, 4)
  })

  test('falls back to zero when there is no usable span', () => {
    expect(estimateReleaseVelocity([{ x: 10, y: 20, time: 5 }])).toEqual({ x: 0, y: 0 })
  })
})
