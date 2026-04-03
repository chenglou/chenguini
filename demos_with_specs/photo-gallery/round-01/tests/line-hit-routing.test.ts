import { describe, expect, test } from 'bun:test'
import { routeLineModeClick } from '../layout'

describe('line mode hit routing', () => {
  test('left and right forgiving hit strips win over the animated image edges', () => {
    expect(routeLineModeClick({ x: 20, viewportWidth: 1280 })).toBe('previous')
    expect(routeLineModeClick({ x: 1270, viewportWidth: 1280 })).toBe('next')
  })

  test('clicking the middle dismisses line mode', () => {
    expect(routeLineModeClick({ x: 640, viewportWidth: 1280 })).toBe('dismiss')
  })
})
