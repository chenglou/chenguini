import { expect, test } from 'bun:test'

import { createCards, estimateReleaseVelocity, layoutCards, reorderDraggedCard } from './logic.js'

test('reorderDraggedCard swaps once the pointer crosses the next midpoint', () => {
  const cards = createCards()
  const initialOrder = cards.map(card => card.id)
  const layout = layoutCards(initialOrder, cards, 1000)
  const draggedCard = cards[2]
  if (draggedCard == null) throw new Error('missing card 2')

  const pointerY = layout['2'].y + draggedCard.height / 2 + 1
  const result = reorderDraggedCard(initialOrder, cards, '0', pointerY, layout)

  expect(result.changed).toBe(true)
  expect(result.order).toEqual(['1', '2', '0', '3', '4'])
})

test('estimateReleaseVelocity uses the most recent 100ms of samples', () => {
  const velocity = estimateReleaseVelocity([
    { x: 0, y: 0, time: 0 },
    { x: 5, y: 10, time: 20 },
    { x: 40, y: 35, time: 70 },
    { x: 105, y: 90, time: 120 },
  ], 120)

  expect(velocity.x).toBe(1000)
  expect(velocity.y).toBe(800)
})
