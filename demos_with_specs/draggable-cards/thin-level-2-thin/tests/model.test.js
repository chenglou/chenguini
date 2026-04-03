import { expect, test } from 'bun:test'

import {
  computeCards,
  estimateReleaseVelocity,
  reorderByDraggedCenter,
  slotTopByCardId,
} from '../model.js'

test('reorderByDraggedCenter waits for the next card midpoint', () => {
  const cards = computeCards(5)
  const orderedCardIds = cards.map((card) => card.id)
  const draggedCardId = orderedCardIds[1]
  const nextCardId = orderedCardIds[2]
  const slotTop = slotTopByCardId(cards, orderedCardIds)
  const nextMidpoint = slotTop.get(nextCardId) + cards[2].sizeY / 2

  expect(reorderByDraggedCenter(cards, orderedCardIds, draggedCardId, nextMidpoint - 0.5)).toEqual(orderedCardIds)
  expect(reorderByDraggedCenter(cards, orderedCardIds, draggedCardId, nextMidpoint + 0.5)).toEqual([
    orderedCardIds[0],
    orderedCardIds[2],
    orderedCardIds[1],
    orderedCardIds[3],
    orderedCardIds[4],
  ])
})

test('estimateReleaseVelocity uses only recent pointer history', () => {
  const history = [
    { x: 40, y: 40, time: 0 },
    { x: 320, y: 420, time: 40 },
    { x: 330, y: 435, time: 130 },
    { x: 350, y: 465, time: 190 },
    { x: 360, y: 480, time: 210 },
  ]

  const velocity = estimateReleaseVelocity(history, 210)

  expect(velocity.x).toBeCloseTo((360 - 330) / (210 - 130) * 1000, 6)
  expect(velocity.y).toBeCloseTo((480 - 435) / (210 - 130) * 1000, 6)
})

