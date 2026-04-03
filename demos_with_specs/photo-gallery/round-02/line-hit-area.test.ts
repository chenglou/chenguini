import { expect, test } from 'bun:test'

import { resolveLineKeyAction, resolveLinePointerAction } from './model'

test('line mode left and right strips route to adjacent images', () => {
  expect(resolveLinePointerAction(24, 1200, 5, 10)).toBe('focus-prev')
  expect(resolveLinePointerAction(1176, 1200, 5, 10)).toBe('focus-next')
})

test('line mode center click dismisses', () => {
  expect(resolveLinePointerAction(600, 1200, 5, 10)).toBe('dismiss')
})

test('line mode falls back to dismiss when there is no neighbor on that side', () => {
  expect(resolveLinePointerAction(40, 1200, 0, 10)).toBe('dismiss')
  expect(resolveLinePointerAction(1180, 1200, 9, 10)).toBe('dismiss')
})

test('line mode keyboard flow follows the spec', () => {
  expect(resolveLineKeyAction('ArrowLeft', null, 10)).toBe('focus-first')
  expect(resolveLineKeyAction('ArrowRight', null, 10)).toBe('focus-first')
  expect(resolveLineKeyAction('ArrowLeft', 3, 10)).toBe('focus-prev')
  expect(resolveLineKeyAction('ArrowRight', 3, 10)).toBe('focus-next')
  expect(resolveLineKeyAction('Escape', 3, 10)).toBe('dismiss')
})
