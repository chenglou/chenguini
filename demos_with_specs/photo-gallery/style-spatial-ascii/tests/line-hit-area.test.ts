import { expect, test } from 'bun:test'

import { routeLineModeHitArea } from '../layout'

test('line mode hit areas are based on the 100px layout strips', () => {
  expect(routeLineModeHitArea(50, 1000)).toBe('previous')
  expect(routeLineModeHitArea(500, 1000)).toBe('dismiss')
  expect(routeLineModeHitArea(950, 1000)).toBe('next')
})
