import { describe, expect, test } from 'bun:test'

import {
  AGE_DAY,
  LIFE_DAYS,
  computeGridMetrics,
  getDayRect,
  hitTestDayIndex,
} from './model'

describe('computeGridMetrics', () => {
  test('matches the 1200x900 geometry snapshot', () => {
    const metrics = computeGridMetrics(1200, 900)

    expect(metrics.countX).toBe(182)
    expect(metrics.countY).toBe(151)
    expect(metrics.gridTop).toBe(4)
    expect(metrics.canvasWidth).toBeCloseTo(1075.13, 2)
    expect(metrics.blockSize).toBeCloseTo(892 / 151, 10)
    expect(metrics.countX % 7).toBe(0)
  })

  test('still covers the full lifespan on a smaller viewport', () => {
    const metrics = computeGridMetrics(840, 620)

    expect(metrics.countX % 7).toBe(0)
    expect(metrics.countX).toBeGreaterThan(0)
    expect(metrics.countY * metrics.countX).toBeGreaterThanOrEqual(LIFE_DAYS)
  })
})

describe('hitTestDayIndex', () => {
  test('maps centered pointer positions back to the matching day', () => {
    const metrics = computeGridMetrics(1200, 900)
    const firstDay = getDayRect(metrics, 0)
    const nextRowDay = getDayRect(metrics, metrics.countX + 3)
    const ageDay = getDayRect(metrics, AGE_DAY)

    expect(
      hitTestDayIndex(
        metrics,
        firstDay.x + firstDay.width / 2,
        firstDay.y + firstDay.height / 2,
      ),
    ).toBe(0)

    expect(
      hitTestDayIndex(
        metrics,
        nextRowDay.x + nextRowDay.width / 2,
        nextRowDay.y + nextRowDay.height / 2,
      ),
    ).toBe(metrics.countX + 3)

    expect(
      hitTestDayIndex(
        metrics,
        ageDay.x + ageDay.width / 2,
        ageDay.y + ageDay.height / 2,
      ),
    ).toBe(AGE_DAY)
  })

  test('returns null outside the canvas or beyond the last day', () => {
    const metrics = computeGridMetrics(1200, 900)
    const emptySlot = getDayRect(metrics, LIFE_DAYS)

    expect(hitTestDayIndex(metrics, metrics.gridLeft - 1, metrics.gridTop + 1)).toBeNull()
    expect(hitTestDayIndex(metrics, metrics.gridLeft + 1, metrics.gridTop - 1)).toBeNull()
    expect(
      hitTestDayIndex(
        metrics,
        emptySlot.x + emptySlot.width / 2,
        emptySlot.y + emptySlot.height / 2,
      ),
    ).toBeNull()
  })
})
