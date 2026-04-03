import { expect, test } from 'bun:test'

import {
  estimateReleaseVelocity,
  getStackLayout,
  makeCards,
  reorderByMidpoint,
} from '../model.js'

test('reorder happens once the dragged card crosses the next midpoint', () => {
  const cards = makeCards()
  const orderedCardIds = cards.map((card) => card.id)
  const layout = getStackLayout({ cards, orderedCardIds })
  const nextMidpointY = (layout[0].centerY + layout[1].centerY) / 2

  expect(
    reorderByMidpoint({
      cards,
      orderedCardIds,
      draggedCardId: orderedCardIds[0],
      draggedCenterY: nextMidpointY - 1,
    }),
  ).toEqual(orderedCardIds)

  expect(
    reorderByMidpoint({
      cards,
      orderedCardIds,
      draggedCardId: orderedCardIds[0],
      draggedCenterY: nextMidpointY + 1,
    }),
  ).toEqual(['card-1', 'card-0', 'card-2', 'card-3', 'card-4'])
})

test('release velocity only uses recent pointer history', () => {
  const recentHistory = [
    { x: 0, y: 1_000, time: 160 },
    { x: 0, y: 1_010, time: 190 },
    { x: 0, y: 1_020, time: 220 },
  ]

  const fullHistory = [
    { x: 0, y: 0, time: 0 },
    { x: 0, y: 900, time: 100 },
    ...recentHistory,
  ]

  const recentVelocity = estimateReleaseVelocity(recentHistory, 220)
  const velocityWithOldSamples = estimateReleaseVelocity(fullHistory, 220)

  expect(velocityWithOldSamples.x).toBeCloseTo(recentVelocity.x, 6)
  expect(velocityWithOldSamples.y).toBeCloseTo(recentVelocity.y, 6)
  expect(velocityWithOldSamples.y).toBeCloseTo((20 / 60) * 1_000, 6)
})
