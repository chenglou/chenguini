import { expect, test } from 'bun:test'

import { estimateReleaseVelocity, reorderForPointer } from './model'

test('reorderForPointer swaps downward after crossing the next midpoint', () => {
  const order = ['card-0', 'card-1', 'card-2', 'card-3']
  const heights = new Map([
    ['card-0', 100],
    ['card-1', 100],
    ['card-2', 100],
    ['card-3', 100],
  ])

  const result = reorderForPointer({
    order,
    draggedId: 'card-1',
    pointerY: 305,
    topPadding: 50,
    heights,
  })

  expect(result.order).toEqual(['card-0', 'card-2', 'card-1', 'card-3'])
  expect(result.changed).toBe(true)
})

test('reorderForPointer keeps swapping until the pointer lands in the right slot', () => {
  const order = ['card-0', 'card-1', 'card-2', 'card-3']
  const heights = new Map([
    ['card-0', 80],
    ['card-1', 90],
    ['card-2', 110],
    ['card-3', 120],
  ])

  const result = reorderForPointer({
    order,
    draggedId: 'card-0',
    pointerY: 500,
    topPadding: 50,
    heights,
  })

  expect(result.order).toEqual(['card-1', 'card-2', 'card-3', 'card-0'])
  expect(result.changed).toBe(true)
})

test('estimateReleaseVelocity uses the recent pointer window', () => {
  const velocity = estimateReleaseVelocity([
    { x: 0, y: 0, time: 1_000 },
    { x: 12, y: 20, time: 1_040 },
    { x: 26, y: 42, time: 1_080 },
    { x: 40, y: 60, time: 1_100 },
  ])

  expect(velocity.x).toBeCloseTo(400, 6)
  expect(velocity.y).toBeCloseTo(600, 6)
})

test('estimateReleaseVelocity falls back to zero for one sample', () => {
  expect(estimateReleaseVelocity([{ x: 20, y: 30, time: 2_000 }])).toEqual({ x: 0, y: 0 })
})
