import { describe, expect, test } from 'bun:test'

import { routeLineStripClick } from '../line-mode'

describe('routeLineStripClick', () => {
  test('uses the leftmost 100px as previous', () => {
    expect(routeLineStripClick(1_200, 0)).toBe('previous')
    expect(routeLineStripClick(1_200, 99.9)).toBe('previous')
  })

  test('uses the rightmost 100px as next', () => {
    expect(routeLineStripClick(1_200, 1_100)).toBe('next')
    expect(routeLineStripClick(1_200, 1_199.9)).toBe('next')
  })

  test('treats the middle band as dismiss, including the left boundary at 100px', () => {
    expect(routeLineStripClick(1_200, 100)).toBe('dismiss')
    expect(routeLineStripClick(1_200, 600)).toBe('dismiss')
  })
})
