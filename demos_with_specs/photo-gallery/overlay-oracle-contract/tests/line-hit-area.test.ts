import { expect, test } from 'bun:test'

import { resolveLineHitArea } from '../layout'

test('line hit routing uses 100px strips on both sides', () => {
  expect(resolveLineHitArea(0, 1200)).toBe('previous')
  expect(resolveLineHitArea(99, 1200)).toBe('previous')
  expect(resolveLineHitArea(100, 1200)).toBe('dismiss')
  expect(resolveLineHitArea(1099, 1200)).toBe('dismiss')
  expect(resolveLineHitArea(1100, 1200)).toBe('next')
  expect(resolveLineHitArea(1199, 1200)).toBe('next')
})

