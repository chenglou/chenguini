import {describe, expect, test} from 'bun:test'

import {
  buildStackMetrics,
  createCards,
  estimateReleaseVelocity,
  getReorderIndex,
  moveItem,
} from '../drag-demo'

describe('drag-demo model', () => {
  test('reorders before release once the dragged center crosses the next midpoint', () => {
    const cards = createCards()
    const order = cards.map((card) => card.id)
    const stack = buildStackMetrics(order, cards)
    const draggedCard = stack[1]
    const nextCard = stack[2]

    expect(draggedCard).toBeDefined()
    expect(nextCard).toBeDefined()

    const beforeCrossingTop = nextCard.midpointY - draggedCard.sizeY / 2 - 0.5
    const afterCrossingTop = nextCard.midpointY - draggedCard.sizeY / 2 + 0.5

    expect(getReorderIndex(order, cards, draggedCard.id, beforeCrossingTop)).toBe(1)

    const reorderedIndex = getReorderIndex(order, cards, draggedCard.id, afterCrossingTop)

    expect(reorderedIndex).toBe(2)
    expect(moveItem(order, 1, reorderedIndex)).toEqual([
      order[0],
      order[2],
      order[1],
      order[3],
      order[4],
    ])
  })

  test('release velocity only uses recent pointer history', () => {
    const velocity = estimateReleaseVelocity([
      {timeMs: 0, x: 0, y: 0},
      {timeMs: 40, x: 0, y: 200},
      {timeMs: 130, x: 0, y: 210},
      {timeMs: 180, x: 0, y: 220},
    ])

    expect(velocity.x).toBeCloseTo(0, 6)
    expect(velocity.y).toBeCloseTo(0.2, 6)
  })
})
