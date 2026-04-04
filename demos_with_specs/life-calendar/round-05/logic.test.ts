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

  test('changes shape when the viewport narrows', () => {
    const wide = computeGridMetrics(1200, 900)
    const narrow = computeGridMetrics(900, 900)

    expect(narrow.countX % 7).toBe(0)
    expect(narrow.countX).toBeLessThan(wide.countX)
    expect(narrow.canvasWidth).toBeLessThan(wide.canvasWidth)
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
    expect(hitTestDayIndex(metrics.gridLeft + metrics.canvasWidth + 1, 10, metrics)).toBeNull()
    expect(
      hitTestDayIndex(
        trailingRect.x + trailingRect.width / 2,
        trailingRect.y + trailingRect.height / 2,
        metrics,
      ),
    ).toBeNull()
  })
})
