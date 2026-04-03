import { describe, expect, test } from 'bun:test'

import { getReleaseVelocity, reorderByMidpoint } from './drag-physics'

describe('reorderByMidpoint', () => {
  test('moves a dragged card once its center crosses the next card midpoint', () => {
    const heightsById = {
      'card-1': 100,
      'card-2': 100,
      'card-3': 100,
    }

    expect(
      reorderByMidpoint(['card-1', 'card-2', 'card-3'], heightsById, 'card-2', 149, 50),
    ).toEqual(['card-1', 'card-2', 'card-3'])

    expect(
      reorderByMidpoint(['card-1', 'card-2', 'card-3'], heightsById, 'card-2', 151, 50),
    ).toEqual(['card-1', 'card-3', 'card-2'])
  })
})

describe('getReleaseVelocity', () => {
  test('uses only the recent pointer history window', () => {
    const history = [
      { time: 0, y: 0 },
      { time: 80, y: 0 },
      { time: 120, y: 0 },
      { time: 170, y: 70 },
      { time: 200, y: 100 },
    ]

    expect(getReleaseVelocity(history, 200)).toBeCloseTo(1.25, 5)
  })
})
