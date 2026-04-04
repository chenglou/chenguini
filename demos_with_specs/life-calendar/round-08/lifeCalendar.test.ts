import { describe, expect, test } from 'bun:test'

import { age, computeCellRect, computeGridMetrics, hitTestDayIndex, life } from './lifeCalendar'

describe('computeGridMetrics', () => {
  test('matches the 1200x900 geometry snapshot', () => {
    const metrics = computeGridMetrics(1200, 900)

    expect(metrics.countX).toBe(182)
    expect(metrics.countY).toBe(151)
    expect(metrics.countX % 7).toBe(0)
    expect(metrics.gridTop).toBe(4)
    expect(metrics.gridWidth).toBeCloseTo(1075.13, 2)
  })
})

describe('hitTestDayIndex', () => {
  test('maps cell centers back to their day index', () => {
    const metrics = computeGridMetrics(1200, 900)

    for (const index of [0, age, life - 1]) {
      const cell = computeCellRect(metrics, index)
      const hit = hitTestDayIndex(metrics, cell.x + cell.width / 2, cell.y + cell.height / 2)
      expect(hit).toBe(index)
    }
  })

  test('returns null outside the canvas bounds and in trailing empty cells', () => {
    const metrics = computeGridMetrics(1200, 900)
    const lastCell = computeCellRect(metrics, life - 1)

    expect(hitTestDayIndex(metrics, metrics.gridLeft - 1, metrics.gridTop + 10)).toBeNull()
    expect(hitTestDayIndex(metrics, metrics.gridLeft + metrics.gridWidth + 1, metrics.gridTop + 10)).toBeNull()
    expect(hitTestDayIndex(metrics, metrics.gridLeft + 10, metrics.gridTop - 1)).toBeNull()
    expect(hitTestDayIndex(metrics, metrics.gridLeft + 10, metrics.gridTop + metrics.gridHeight + 1)).toBeNull()
    expect(hitTestDayIndex(metrics, lastCell.x + lastCell.width * 1.5, lastCell.y + lastCell.height / 2)).toBeNull()
  })
})
