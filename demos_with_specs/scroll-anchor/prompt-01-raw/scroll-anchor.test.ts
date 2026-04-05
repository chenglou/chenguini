import { describe, expect, test } from 'bun:test'

import {
  buildInitialItems,
  buildLayout,
  pickAnchor,
  prependItemsAbove,
  resolveScrollAnchor,
  collectVisibleEntries,
} from './model.js'

describe('scroll anchor model', () => {
  test('layout math matches headers, item positions, and total height', () => {
    const items = buildInitialItems()
    const layout = buildLayout(items)

    expect(layout.headers.map((entry) => [entry.day, entry.y])).toEqual([
      ['Today', 0],
      ['Yesterday', 920],
      ['2 Days Ago', 1084],
    ])

    expect(layout.items.map((entry) => [entry.id, entry.y])).toEqual([
      ['V1', 32],
      ['V2', 140],
      ['V3', 248],
      ['V4', 356],
      ['V5', 464],
      ['V6', 572],
      ['V7', 680],
      ['V8', 788],
      ['V9', 952],
      ['V10', 1116],
      ['V11', 1224],
      ['V12', 1332],
      ['V13', 1440],
      ['V14', 1548],
      ['V15', 1656],
      ['V16', 1764],
      ['V17', 1872],
    ])

    expect(layout.totalHeight).toBe(1972)
  })

  test('pickAnchor finds the first item below the current scrollTop', () => {
    const layout = buildLayout(buildInitialItems())
    expect(pickAnchor(layout.items, 700)).toEqual({ id: 'V8', prevY: 788 })
    expect(pickAnchor(layout.items, 1_010)).toEqual({ id: 'V10', prevY: 1116 })
  })

  test('data prepended above the anchor adjusts scrollTop by the anchor delta', () => {
    const initialItems = buildInitialItems()
    const initialLayout = buildLayout(initialItems)
    const anchor = pickAnchor(initialLayout.items, 700)

    if (anchor == null) {
      throw new Error('expected an anchor at scrollTop 700')
    }

    const { items: prependedItems } = prependItemsAbove(initialItems, 17, 3)
    const nextLayout = buildLayout(prependedItems)
    const result = resolveScrollAnchor({
      layout: nextLayout,
      scrollTop: 700,
      storedScrollTop: 700,
      explicitScrollTop: null,
      anchor,
    })

    expect(result.adjustedScrollTop).toBe(1_024)
    expect(result.anchor).toEqual({ id: 'V8', prevY: 1_112 })
  })

  test('rapid prepend lands on the same final anchor whether updates batch or split', () => {
    const initialItems = buildInitialItems()
    const initialLayout = buildLayout(initialItems)
    const startingAnchor = pickAnchor(initialLayout.items, 700)

    if (startingAnchor == null) {
      throw new Error('expected an anchor at scrollTop 700')
    }

    const batched = prependItemsAbove(initialItems, 17, 3)
    const batchedResult = resolveScrollAnchor({
      layout: buildLayout(batched.items),
      scrollTop: 700,
      storedScrollTop: 700,
      explicitScrollTop: null,
      anchor: startingAnchor,
    })

    const firstStep = prependItemsAbove(initialItems, 17, 1)
    const firstStepResult = resolveScrollAnchor({
      layout: buildLayout(firstStep.items),
      scrollTop: 700,
      storedScrollTop: 700,
      explicitScrollTop: null,
      anchor: startingAnchor,
    })

    const secondStep = prependItemsAbove(firstStep.items, firstStep.nextCounter, 2)
    const secondStepResult = resolveScrollAnchor({
      layout: buildLayout(secondStep.items),
      scrollTop: firstStepResult.adjustedScrollTop,
      storedScrollTop: firstStepResult.adjustedScrollTop,
      explicitScrollTop: null,
      anchor: firstStepResult.anchor,
    })

    expect(secondStepResult.adjustedScrollTop).toBe(batchedResult.adjustedScrollTop)
    expect(secondStepResult.anchor).toEqual(batchedResult.anchor)
  })

  test('visible mounting only keeps the headers and items near the viewport', () => {
    const layout = buildLayout(buildInitialItems())
    const visible = collectVisibleEntries(layout, {
      scrollTop: 700,
      viewportHeight: 600,
      overscan: 0,
    })

    expect(visible.items.map((entry) => entry.id)).toEqual([
      'V7',
      'V8',
      'V9',
      'V10',
      'V11',
    ])
    expect(visible.headers.map((entry) => entry.day)).toEqual(['Yesterday', '2 Days Ago'])
    expect(visible.items).toHaveLength(5)
    expect(visible.items.length).toBeLessThan(layout.items.length)
  })
})
