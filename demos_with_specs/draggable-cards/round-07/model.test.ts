import { describe, expect, test } from 'bun:test'
import { estimateReleaseVelocity, reorderWhileDragging, type PointerSample, type StackCard } from './model'

function card(id: number, top: number, height: number): StackCard {
  return { id, top, height }
}

describe('reorderWhileDragging', () => {
  test('swaps downward after crossing the next card midpoint', () => {
    const order = [0, 1, 2, 3, 4]
    const cards = [
      card(0, 50, 80),
      card(1, 130, 100),
      card(2, 230, 120),
      card(3, 350, 90),
      card(4, 440, 110),
    ]

    expect(reorderWhileDragging(order, cards, 1, 289)).toEqual(order)
    expect(reorderWhileDragging(order, cards, 1, 291)).toEqual([0, 2, 1, 3, 4])
  })

  test('swaps upward after crossing the previous card midpoint', () => {
    const order = [0, 1, 2, 3, 4]
    const cards = [
      card(0, 50, 80),
      card(1, 130, 100),
      card(2, 230, 120),
      card(3, 350, 90),
      card(4, 440, 110),
    ]

    expect(reorderWhileDragging(order, cards, 2, 181)).toEqual(order)
    expect(reorderWhileDragging(order, cards, 2, 179)).toEqual([0, 2, 1, 3, 4])
  })
})

describe('estimateReleaseVelocity', () => {
  test('uses the recent ~100ms window and ignores older samples', () => {
    const samples: PointerSample[] = [
      { x: 0, y: 0, time: 0 },
      { x: 40, y: 60, time: 40 },
      { x: 70, y: 120, time: 80 },
      { x: 140, y: 210, time: 150 },
    ]

    expect(estimateReleaseVelocity(samples, 150)).toEqual({
      x: 1000,
      y: 1285.7142857142858,
    })
  })

  test('returns zero velocity when there is not enough history', () => {
    const samples: PointerSample[] = [{ x: 30, y: 40, time: 200 }]

    expect(estimateReleaseVelocity(samples, 200)).toEqual({
      x: 0,
      y: 0,
    })
  })
})
