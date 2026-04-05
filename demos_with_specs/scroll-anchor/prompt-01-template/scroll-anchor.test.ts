import {describe, expect, test} from 'bun:test'

import {
  TARGET_SCROLL,
  applyAnchorAdjustment,
  createInitialState,
  layoutEntries,
  pickAnchor,
  prependItems,
} from './scroll-anchor-model.js'

describe('layoutEntries', () => {
  test('lays out headers, items, and total height with the spec numbers', () => {
    const {items} = createInitialState()
    const layout = layoutEntries(items)
    const positions = new Map(
      layout.entries
        .filter(entry => entry.kind === 'item')
        .map(entry => [entry.id, entry.y]),
    )
    const headers = new Map(
      layout.entries
        .filter(entry => entry.kind === 'header')
        .map(entry => [entry.day, entry.y]),
    )

    expect(headers.get('Today')).toBe(0)
    expect(positions.get('V1')).toBe(32)
    expect(positions.get('V8')).toBe(788)
    expect(headers.get('Yesterday')).toBe(920)
    expect(positions.get('V9')).toBe(952)
    expect(headers.get('2 Days Ago')).toBe(1084)
    expect(positions.get('V10')).toBe(1116)
    expect(positions.get('V17')).toBe(1872)
    expect(layout.totalHeight).toBe(1972)
  })
})

describe('scroll anchoring', () => {
  test('picks the first item below scrollTop', () => {
    const {items} = createInitialState()
    const layout = layoutEntries(items)

    expect(pickAnchor(layout, TARGET_SCROLL)).toEqual({
      itemId: 'V8',
      prevY: 788,
    })
  })

  test('adjusts by the anchor delta when three items are prepended in one render', () => {
    const initial = createInitialState()
    const before = layoutEntries(initial.items)
    const anchor = pickAnchor(before, TARGET_SCROLL)
    const prepended = prependItems(initial.items, initial.nextId, 3)
    const after = layoutEntries(prepended.items)

    expect(anchor).toEqual({itemId: 'V8', prevY: 788})
    expect(applyAnchorAdjustment({
      anchor,
      layout: after,
      scrollTop: TARGET_SCROLL,
      storedScrollTop: TARGET_SCROLL,
    })).toEqual({
      adjustment: 324,
      anchor: {itemId: 'V8', prevY: 1112},
      scrollTop: 1024,
      userScrolled: false,
    })
  })

  test('lands at the same anchored scroll position whether rapid prepends batch or split', () => {
    const initial = createInitialState()
    const before = layoutEntries(initial.items)
    const anchor = pickAnchor(before, TARGET_SCROLL)

    const batched = prependItems(initial.items, initial.nextId, 3)
    const batchedResult = applyAnchorAdjustment({
      anchor,
      layout: layoutEntries(batched.items),
      scrollTop: TARGET_SCROLL,
      storedScrollTop: TARGET_SCROLL,
    })

    const plusOne = prependItems(initial.items, initial.nextId, 1)
    const afterOne = applyAnchorAdjustment({
      anchor,
      layout: layoutEntries(plusOne.items),
      scrollTop: TARGET_SCROLL,
      storedScrollTop: TARGET_SCROLL,
    })
    const plusThree = prependItems(plusOne.items, plusOne.nextId, 2)
    const afterThree = applyAnchorAdjustment({
      anchor: afterOne.anchor,
      layout: layoutEntries(plusThree.items),
      scrollTop: afterOne.scrollTop,
      storedScrollTop: afterOne.scrollTop,
    })

    expect(batchedResult.scrollTop).toBe(1024)
    expect(afterOne.scrollTop).toBe(808)
    expect(afterThree).toEqual({
      adjustment: 216,
      anchor: {itemId: 'V8', prevY: 1112},
      scrollTop: 1024,
      userScrolled: false,
    })
    expect(afterThree.scrollTop).toBe(batchedResult.scrollTop)
  })

  test('repicks the anchor after a user scroll before the prepend lands', () => {
    const initial = createInitialState()
    const before = layoutEntries(initial.items)
    const originalAnchor = pickAnchor(before, TARGET_SCROLL)
    const afterUserScroll = applyAnchorAdjustment({
      anchor: originalAnchor,
      layout: before,
      scrollTop: 980,
      storedScrollTop: TARGET_SCROLL,
    })

    expect(afterUserScroll).toEqual({
      adjustment: 0,
      anchor: {itemId: 'V10', prevY: 1116},
      scrollTop: 980,
      userScrolled: true,
    })

    const prepended = prependItems(initial.items, initial.nextId, 3)
    expect(applyAnchorAdjustment({
      anchor: afterUserScroll.anchor,
      layout: layoutEntries(prepended.items),
      scrollTop: afterUserScroll.scrollTop,
      storedScrollTop: afterUserScroll.scrollTop,
    })).toEqual({
      adjustment: 324,
      anchor: {itemId: 'V10', prevY: 1440},
      scrollTop: 1304,
      userScrolled: false,
    })
  })
})
