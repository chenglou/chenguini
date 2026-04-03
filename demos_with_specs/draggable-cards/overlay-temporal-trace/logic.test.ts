import { expect, test } from 'bun:test'
import { createCards, estimateReleaseVelocity, reorderByCenterY } from './logic.js'

test('derives the spec card metrics', () => {
  expect(createCards().map(card => ({
    id: card.id,
    sizeY: card.sizeY,
    lightnessBase: card.lightnessBase,
  }))).toEqual([
    { id: 1, sizeY: 38.00160976359621, lightnessBase: 77.09846252575517 },
    { id: 2, sizeY: 113.59467118280008, lightnessBase: 66.02021258324385 },
    { id: 3, sizeY: 158.2430466148071, lightnessBase: 76.78799151442945 },
    { id: 4, sizeY: 143.76254714559764, lightnessBase: 65.43296894989908 },
    { id: 5, sizeY: 46.16257082205266, lightnessBase: 70.0491510797292 },
  ])
})

test('reorders once the dragged center crosses the next midpoint', () => {
  const cards = new Map([
    [1, { id: 1, sizeY: 40, lightnessBase: 50 }],
    [2, { id: 2, sizeY: 60, lightnessBase: 50 }],
    [3, { id: 3, sizeY: 50, lightnessBase: 50 }],
    [4, { id: 4, sizeY: 30, lightnessBase: 50 }],
    [5, { id: 5, sizeY: 70, lightnessBase: 50 }],
  ])

  expect(reorderByCenterY([1, 2, 3, 4, 5], 1, 120, cards, 50)).toEqual([1, 2, 3, 4, 5])
  expect(reorderByCenterY([1, 2, 3, 4, 5], 1, 121, cards, 50)).toEqual([2, 1, 3, 4, 5])
})

test('estimates release velocity from the last 100ms and falls back to zero', () => {
  expect(estimateReleaseVelocity([
    { time: 0, x: 0, y: 0 },
    { time: 30, x: 6, y: 12 },
    { time: 90, x: 18, y: 48 },
  ], 100)).toEqual({ x: 0.2, y: 0.5333333333333333 })

  expect(estimateReleaseVelocity([
    { time: 0, x: 0, y: 0 },
    { time: 140, x: 40, y: 80 },
  ], 150)).toEqual({ x: 0, y: 0 })
})
