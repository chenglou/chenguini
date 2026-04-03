import { describe, expect, test } from 'bun:test'

import {
  buildCards,
  estimateReleaseVelocity,
  measureFlow,
  reorderByMidpoint,
} from './logic'

describe('draggable cards seed corpus', () => {
  test('reorders as soon as the drag crosses the previous card midpoint', () => {
    const cards = buildCards()
    const order = [0, 1, 2, 3, 4]
    const flowWithoutDragged = measureFlow(
      order.filter((id) => id !== 2),
      cards,
    )
    const cardOneMidpoint = flowWithoutDragged.find((card) => card.id === 1)?.midpoint
    if (cardOneMidpoint === undefined) {
      throw new Error('missing card 1 midpoint')
    }

    expect(reorderByMidpoint(order, 2, cardOneMidpoint - 1, cards)).toEqual([
      0, 2, 1, 3, 4,
    ])
    expect(reorderByMidpoint(order, 2, cardOneMidpoint + 1, cards)).toEqual([
      0, 1, 2, 3, 4,
    ])
  })

  test('reorders card 1 after card 2 when the pointer goes below card 2 midpoint', () => {
    const cards = buildCards()
    const order = [0, 1, 2, 3, 4]
    const flowWithoutDragged = measureFlow(
      order.filter((id) => id !== 1),
      cards,
    )
    const cardTwoMidpoint = flowWithoutDragged.find((card) => card.id === 2)?.midpoint
    if (cardTwoMidpoint === undefined) {
      throw new Error('missing card 2 midpoint')
    }

    expect(reorderByMidpoint(order, 1, cardTwoMidpoint + 1, cards)).toEqual([
      0, 2, 1, 3, 4,
    ])
  })

  test('estimates release velocity from the recent sample window', () => {
    const samples = [
      { x: 100, y: 100, time: 0 },
      { x: 130, y: 145, time: 40 },
      { x: 160, y: 190, time: 80 },
      { x: 210, y: 250, time: 120 },
    ]

    expect(estimateReleaseVelocity(samples, 120)).toEqual({ x: 1.25, y: 1.5 })
  })

  test('falls back cleanly when there is only one useful recent sample', () => {
    const samples = [
      { x: 100, y: 100, time: 0 },
      { x: 135, y: 150, time: 40 },
    ]

    expect(estimateReleaseVelocity(samples, 140)).toEqual({ x: 0, y: 0 })
  })
})
