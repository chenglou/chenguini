import { expect, test } from 'bun:test'
import { routeLineClick } from '../layout.js'

test('line mode click routing splits the stage into left, middle, and right zones', () => {
  expect(routeLineClick(500, 20)).toBe('previous')
  expect(routeLineClick(500, 250)).toBe('dismiss')
  expect(routeLineClick(500, 490)).toBe('next')
})
