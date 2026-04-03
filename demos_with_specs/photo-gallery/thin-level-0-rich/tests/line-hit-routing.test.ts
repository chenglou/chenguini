import {describe, expect, test} from 'bun:test'

import {resolveLineClickAction} from '../gallery'

describe('resolveLineClickAction', () => {
  test('sends the left strip to previous and the right strip to next', () => {
    expect(resolveLineClickAction({viewportWidth: 1_280, clientX: 40})).toBe('prev')
    expect(resolveLineClickAction({viewportWidth: 1_280, clientX: 1_210})).toBe('next')
  })

  test('keeps the middle area for dismiss', () => {
    expect(resolveLineClickAction({viewportWidth: 1_280, clientX: 100})).toBe('dismiss')
    expect(resolveLineClickAction({viewportWidth: 1_280, clientX: 640})).toBe('dismiss')
    expect(resolveLineClickAction({viewportWidth: 1_280, clientX: 1_180})).toBe('dismiss')
  })
})
