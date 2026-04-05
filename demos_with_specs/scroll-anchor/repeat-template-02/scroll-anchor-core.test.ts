import {describe, expect, test} from 'bun:test'

import {
  TARGET_SCROLL_TOP,
  adjustScrollTopForAnchor,
  buildInitialItems,
  computeLayout,
  findItemAtY,
  pickAnchor,
  prependItems,
} from './scroll-anchor-core'

describe('scroll-anchor core', () => {
  test('lays out headers, item positions, and total height', () => {
    const {items} = buildInitialItems()
    const layout = computeLayout(items)

    expect(layout.headerTops).toEqual({
      Today: 0,
      Yesterday: 920,
      '2 Days Ago': 1084,
    })
    expect(layout.itemTops.V1).toBe(32)
    expect(layout.itemTops.V8).toBe(788)
    expect(layout.itemTops.V9).toBe(952)
    expect(layout.itemTops.V10).toBe(1116)
    expect(layout.itemTops.V17).toBe(1872)
    expect(layout.totalHeight).toBe(1972)
  })

  test('picks the first item below scrollTop and adjusts by the anchor delta after prepend', () => {
    const initial = buildInitialItems()
    const initialLayout = computeLayout(initial.items)
    const anchor = pickAnchor(initialLayout, TARGET_SCROLL_TOP)

    expect(anchor).toEqual({id: 'V7', prevY: 680})
    expect(findItemAtY(initialLayout, TARGET_SCROLL_TOP + 280)?.id).toBe('V9')

    const prepended = prependItems(initial.items, initial.nextNumber, 3)
    const prependedLayout = computeLayout(prepended.items)
    const adjusted = adjustScrollTopForAnchor(anchor, prependedLayout, TARGET_SCROLL_TOP)

    expect(adjusted.delta).toBe(324)
    expect(adjusted.scrollTop).toBe(1024)
    expect(adjusted.anchor).toEqual({id: 'V7', prevY: 1004})
    expect(findItemAtY(prependedLayout, adjusted.scrollTop + 280)?.id).toBe('V9')
  })

  test('updates anchor.prevY immediately so rapid prepend works across two renders', () => {
    const initial = buildInitialItems()
    const anchor = pickAnchor(computeLayout(initial.items), TARGET_SCROLL_TOP)

    if (anchor == null) throw new Error('Expected initial anchor')

    const afterOne = prependItems(initial.items, initial.nextNumber, 1)
    const firstAdjustment = adjustScrollTopForAnchor(anchor, computeLayout(afterOne.items), TARGET_SCROLL_TOP)

    expect(firstAdjustment.scrollTop).toBe(808)
    expect(firstAdjustment.anchor).toEqual({id: 'V7', prevY: 788})

    const afterThree = prependItems(afterOne.items, afterOne.nextNumber, 2)
    const secondAdjustment = adjustScrollTopForAnchor(
      firstAdjustment.anchor,
      computeLayout(afterThree.items),
      firstAdjustment.scrollTop,
    )

    expect(secondAdjustment.delta).toBe(216)
    expect(secondAdjustment.scrollTop).toBe(1024)
    expect(secondAdjustment.anchor).toEqual({id: 'V7', prevY: 1004})
  })

  test('picks a new anchor from the new scroll position after user scroll', () => {
    const {items} = buildInitialItems()
    const layout = computeLayout(items)

    expect(pickAnchor(layout, 1116)).toEqual({id: 'V10', prevY: 1116})
    expect(findItemAtY(layout, 1116 + 280)?.id).toBe('V12')
  })
})
