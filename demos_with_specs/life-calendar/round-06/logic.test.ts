import { describe, expect, test } from 'bun:test'
import { age, getGridGeometry, hitTestDayIndex, life, mondayIndexFromJsDay, today } from './model'

describe('getGridGeometry', () => {
  test('matches the 1200x900 geometry snapshot', () => {
    const geometry = getGridGeometry(1200, 900)

    expect(geometry.countX).toBe(182)
    expect(geometry.countX % 7).toBe(0)
    expect(geometry.countY).toBe(151)
    expect(geometry.top).toBe(4)
    expect(geometry.width).toBeCloseTo(1075.1324503311258, 10)
    expect(geometry.height).toBeCloseTo(892, 10)
    expect(geometry.left).toBeCloseTo(62.43377483443711, 10)
  })

  test('keeps the current day inside a Monday-first week bucket', () => {
    const currentWeekStart = age - mondayIndexFromJsDay(today)

    expect(currentWeekStart % 7).toBe(0)
    expect(age - currentWeekStart).toBe(mondayIndexFromJsDay(today))
  })
})

describe('hitTestDayIndex', () => {
  const geometry = getGridGeometry(1200, 900)

  test('maps the center of a visible day cell back to that day index', () => {
    const column = age % geometry.countX
    const row = Math.floor(age / geometry.countX)
    const pointerX = geometry.left + (column + 0.5) * geometry.blockSize
    const pointerY = geometry.top + (row + 0.5) * geometry.blockSize

    expect(hitTestDayIndex(geometry, pointerX, pointerY)).toBe(age)
  })

  test('returns null outside the canvas bounds', () => {
    expect(hitTestDayIndex(geometry, geometry.left - 1, geometry.top + 10)).toBeNull()
    expect(hitTestDayIndex(geometry, geometry.left + 10, geometry.top - 1)).toBeNull()
    expect(hitTestDayIndex(geometry, geometry.left + geometry.width + 1, geometry.top + 10)).toBeNull()
    expect(hitTestDayIndex(geometry, geometry.left + 10, geometry.top + geometry.height + 1)).toBeNull()
  })

  test('returns null for trailing cells past the final day', () => {
    const trailingColumn = life % geometry.countX
    const trailingRow = Math.floor(life / geometry.countX)
    const pointerX = geometry.left + (trailingColumn + 0.5) * geometry.blockSize
    const pointerY = geometry.top + (trailingRow + 0.5) * geometry.blockSize

    expect(hitTestDayIndex(geometry, pointerX, pointerY)).toBeNull()
  })
})
