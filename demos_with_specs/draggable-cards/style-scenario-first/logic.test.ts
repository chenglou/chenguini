import { expect, test } from 'bun:test'
import {
  computeStackLayout,
  createCards,
  estimatePointerVelocity,
  reorderDraggedCard,
} from './logic.ts'

test('dragging past a midpoint swaps a card downward or upward before release', () => {
  const cards = createCards()
  const order = [0, 1, 2, 3, 4]
  const layout = computeStackLayout(order, cards)

  const movedDown = reorderDraggedCard(order, 1, layout.byId[2].centerY + 1, cards)
  expect(movedDown).toEqual([0, 2, 1, 3, 4])

  const movedUp = reorderDraggedCard(order, 3, layout.byId[2].centerY - 1, cards)
  expect(movedUp).toEqual([0, 1, 3, 2, 4])
})

test('velocity estimation uses the most recent 100ms of pointer history', () => {
  const velocity = estimatePointerVelocity(
    [
      { x: 0, y: 0, time: 0 },
      { x: 10, y: 4, time: 40 },
      { x: 30, y: 14, time: 120 },
      { x: 70, y: 34, time: 200 },
    ],
    200,
  )

  expect(velocity.vx).toBeCloseTo(500)
  expect(velocity.vy).toBeCloseTo(250)
})
