import { describe, expect, test } from 'bun:test'

import {
  age,
  computeGridMetrics,
  dayRectForIndex,
  hitTestDayIndex,
  life,
} from './logic'

describe('computeGridMetrics', () => {
  test('matches the 1200x900 geometry snapshot', () => {
    const metrics = computeGridMetrics(1200, 900)

    expect(metrics.countX).toBe(182)
    expect(metrics.countY).toBe(151)
    expect(metrics.gridTop).toBeCloseTo(4, 6)
    expect(metrics.canvasWidth).toBeCloseTo(1075.13, 2)
    expect(metrics.countX % 7).toBe(0)
  })

  test('fits a 75-year lifespan into the computed grid', () => {
    const metrics = computeGridMetrics(900, 700)

    expect(metrics.countX % 7).toBe(0)
    expect(metrics.countX * metrics.countY).toBeGreaterThanOrEqual(life)
    expect(metrics.blockSize).toBeGreaterThan(0)
    expect(metrics.canvasHeight).toBeCloseTo(700 - 8, 6)
  })
})

describe('hitTestDayIndex', () => {
  test('maps ordinary days, the current day, and the final day back to day indexes', () => {
    const metrics = computeGridMetrics(1200, 900)
    const ordinaryDay = 21
    const currentDay = age
    const finalDay = life - 1

    const ordinaryRect = dayRectForIndex(ordinaryDay, metrics)
    const currentRect = dayRectForIndex(currentDay, metrics)
    const finalRect = dayRectForIndex(finalDay, metrics)

    expect(
      hitTestDayIndex(
        ordinaryRect.x + ordinaryRect.width / 2,
        ordinaryRect.y + ordinaryRect.height / 2,
        metrics,
      ),
    ).toBe(ordinaryDay)
    expect(
      hitTestDayIndex(
        currentRect.x + currentRect.width / 2,
        currentRect.y + currentRect.height / 2,
        metrics,
      ),
    ).toBe(currentDay)
    expect(
      hitTestDayIndex(
        finalRect.x + finalRect.width / 2,
        finalRect.y + finalRect.height / 2,
        metrics,
      ),
    ).toBe(finalDay)
  })

  test('returns null outside the canvas bounds and inside trailing empty grid slots', () => {
    const metrics = computeGridMetrics(1200, 900)
    const trailingRect = dayRectForIndex(life, metrics)

    expect(hitTestDayIndex(-1, 10, metrics)).toBeNull()
    expect(hitTestDayIndex(metrics.gridLeft - 1, metrics.gridTop + 10, metrics)).toBeNull()
    expect(
      hitTestDayIndex(
        metrics.gridLeft + metrics.canvasWidth + 1,
        metrics.gridTop + 10,
        metrics,
      ),
    ).toBeNull()
    expect(
      hitTestDayIndex(
        trailingRect.x + trailingRect.width / 2,
        trailingRect.y + trailingRect.height / 2,
        metrics,
      ),
    ).toBeNull()
  })
})
