import {describe, expect, test} from 'bun:test'

import {
  HEADER_BOTTOM_GAP,
  HEADER_HEIGHT,
  ITEM_GAP,
  ITEM_HEIGHT,
  LATER_HEADER_GAP,
  adjustAnchorScrollTop,
  buildInitialItems,
  buildLayout,
  pickAnchor,
  prependItems,
} from './model.js'

describe('scroll anchor model', () => {
  test('buildLayout positions headers, items, and total height', () => {
    const layout = buildLayout(buildInitialItems())

    expect(layout.headers).toEqual([
      {day: 'Today', y: 0},
      {day: 'Yesterday', y: 920},
      {day: '2 Days Ago', y: 1084},
    ])

    expect(layout.items.map((item) => ({
      id: item.id,
      day: item.day,
      y: item.y,
    }))).toEqual([
      {id: 'V1', day: 'Today', y: HEADER_HEIGHT + HEADER_BOTTOM_GAP},
      {id: 'V2', day: 'Today', y: 140},
      {id: 'V3', day: 'Today', y: 248},
      {id: 'V4', day: 'Today', y: 356},
      {id: 'V5', day: 'Today', y: 464},
      {id: 'V6', day: 'Today', y: 572},
      {id: 'V7', day: 'Today', y: 680},
      {id: 'V8', day: 'Today', y: 788},
      {id: 'V9', day: 'Yesterday', y: 952},
      {id: 'V10', day: '2 Days Ago', y: 1116},
      {id: 'V11', day: '2 Days Ago', y: 1224},
      {id: 'V12', day: '2 Days Ago', y: 1332},
      {id: 'V13', day: '2 Days Ago', y: 1440},
      {id: 'V14', day: '2 Days Ago', y: 1548},
      {id: 'V15', day: '2 Days Ago', y: 1656},
      {id: 'V16', day: '2 Days Ago', y: 1764},
      {id: 'V17', day: '2 Days Ago', y: 1872},
    ])

    expect(layout.totalHeight).toBe(ITEM_HEIGHT + 1872)
  })

  test('pickAnchor chooses the first item below scrollTop', () => {
    const layout = buildLayout(buildInitialItems())

    expect(pickAnchor(layout.items, 700)).toEqual({id: 'V8', prevY: 788})
    expect(pickAnchor(layout.items, 896)).toEqual({id: 'V9', prevY: 952})
    expect(pickAnchor(layout.items, 1950)).toEqual({id: 'V17', prevY: 1872})
  })

  test('adjustAnchorScrollTop returns the delta and updates prevY immediately', () => {
    const before = buildInitialItems()
    const anchor = pickAnchor(buildLayout(before).items, 700)
    expect(anchor).toEqual({id: 'V8', prevY: 788})

    const after = prependItems(before, 3)
    const layout = buildLayout(after)
    const adjustedScrollTop = adjustAnchorScrollTop(700, anchor, layout.items)

    expect(adjustedScrollTop).toBe(1024)
    expect(anchor).toEqual({id: 'V8', prevY: 1112})
  })

  test('rapid prepend keeps the same adjustment whether changes land in one render or two', () => {
    const before = buildInitialItems()
    const baseAnchor = pickAnchor(buildLayout(before).items, 700)
    expect(baseAnchor).toEqual({id: 'V8', prevY: 788})

    const oneRenderAnchor = {id: baseAnchor.id, prevY: baseAnchor.prevY}
    const oneRenderItems = prependItems(before, 3)
    const oneRenderScrollTop = adjustAnchorScrollTop(
      700,
      oneRenderAnchor,
      buildLayout(oneRenderItems).items,
    )

    const twoRenderAnchor = {id: baseAnchor.id, prevY: baseAnchor.prevY}
    const afterOne = prependItems(before, 1)
    const afterOneScrollTop = adjustAnchorScrollTop(
      700,
      twoRenderAnchor,
      buildLayout(afterOne).items,
    )
    const afterTwo = prependItems(afterOne, 2)
    const afterTwoScrollTop = adjustAnchorScrollTop(
      afterOneScrollTop,
      twoRenderAnchor,
      buildLayout(afterTwo).items,
    )

    expect(oneRenderScrollTop).toBe(afterTwoScrollTop)
    expect(oneRenderAnchor).toEqual(twoRenderAnchor)
    expect(oneRenderScrollTop).toBe(1024)
  })

  test('prependItems keeps the exact spacing-driving constants visible in the model', () => {
    const items = prependItems(buildInitialItems(), 2)

    expect(items.slice(0, 2).map((item) => item.id)).toEqual(['V18', 'V19'])
    expect(HEADER_HEIGHT + HEADER_BOTTOM_GAP).toBe(32)
    expect(ITEM_HEIGHT + ITEM_GAP).toBe(108)
    expect(LATER_HEADER_GAP).toBe(32)
  })
})
