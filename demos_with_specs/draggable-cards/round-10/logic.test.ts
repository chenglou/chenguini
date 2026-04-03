import { describe, expect, test } from 'bun:test'
import {
  estimateReleaseVelocity,
  reorderIdsByPointerY,
  type CardSpec,
  type PointerSample,
} from './logic.ts'

function cardsByHeight(heights: number[]): CardSpec[] {
  const baseX = 0
  let y = 50

  return heights.map((height, id) => {
    const card = {
      id,
      height,
      lightnessBase: 50,
      top: y,
      left: baseX,
      width: 320,
    }
    y += height
    return card
  })
}

describe('reorderIdsByPointerY', () => {
  test('swaps the dragged card downward after crossing the next midpoint', () => {
    const specs = cardsByHeight([100, 120, 140, 160, 180])
    const after = reorderIdsByPointerY([0, 1, 2, 3, 4], 0, specs[1].top + specs[1].height / 2 + 1, specs)
    expect(after).toEqual([1, 0, 2, 3, 4])
  })

  test('swaps the dragged card upward after crossing the previous midpoint', () => {
    const specs = cardsByHeight([100, 120, 140, 160, 180])
    const after = reorderIdsByPointerY([0, 1, 2, 3, 4], 2, specs[1].top + specs[1].height / 2 - 1, specs)
    expect(after).toEqual([0, 2, 1, 3, 4])
  })
})

describe('estimateReleaseVelocity', () => {
  test('uses only the recent pointer history window', () => {
    const samples: PointerSample[] = [
      { x: 0, y: 0, time: 0 },
      { x: 25, y: 30, time: 40 },
      { x: 80, y: 100, time: 100 },
      { x: 120, y: 160, time: 140 },
    ]

    const velocity = estimateReleaseVelocity(samples, 140)

    expect(velocity.vx).toBeCloseTo(950, 2)
    expect(velocity.vy).toBeCloseTo(1300, 2)
  })

  test('returns zero velocity when there is no useful history', () => {
    const samples: PointerSample[] = [{ x: 12, y: 34, time: 10 }]

    const velocity = estimateReleaseVelocity(samples, 10)

    expect(velocity).toEqual({ vx: 0, vy: 0 })
  })
})
