import {describe, expect, test} from 'bun:test'

import {routeLineModeHit} from './layout'

describe('routeLineModeHit', () => {
  test('routes left, middle, and right strips by layout', () => {
    expect(routeLineModeHit({viewportWidth: 1280, pointerX: 48})).toBe('previous')
    expect(routeLineModeHit({viewportWidth: 1280, pointerX: 640})).toBe('dismiss')
    expect(routeLineModeHit({viewportWidth: 1280, pointerX: 1232})).toBe('next')
  })

  test('does not care whether the animated image edge overlaps the strip', () => {
    const result = routeLineModeHit({
      viewportWidth: 1280,
      pointerX: 96,
      animatedImageLeft: 72,
      animatedImageRight: 1210,
    })

    expect(result).toBe('previous')
  })
})
