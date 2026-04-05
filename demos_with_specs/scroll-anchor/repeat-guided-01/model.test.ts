import {describe, expect, test} from 'bun:test'
import {
  createInitialItems,
  layoutItems,
  pickAnchor,
  prependItems,
  resolveScrollAnchor,
} from './model'

describe('layoutItems', () => {
  test('lays out headers, items, and total height with the spec numbers', () => {
    const items = createInitialItems()
    const layout = layoutItems(items)

    expect(layout.headers).toEqual([
      {day: 'Today', top: 0},
      {day: 'Yesterday', top: 920},
      {day: '2 Days Ago', top: 1084},
    ])

    expect(layout.positionedItems.map(item => ({id: item.id, top: item.top}))).toEqual([
      {id: 'V1', top: 32},
      {id: 'V2', top: 140},
      {id: 'V3', top: 248},
      {id: 'V4', top: 356},
      {id: 'V5', top: 464},
      {id: 'V6', top: 572},
      {id: 'V7', top: 680},
      {id: 'V8', top: 788},
      {id: 'V9', top: 952},
      {id: 'V10', top: 1116},
      {id: 'V11', top: 1224},
      {id: 'V12', top: 1332},
      {id: 'V13', top: 1440},
      {id: 'V14', top: 1548},
      {id: 'V15', top: 1656},
      {id: 'V16', top: 1764},
      {id: 'V17', top: 1872},
    ])

    expect(layout.totalHeight).toBe(1972)
  })
})

describe('resolveScrollAnchor', () => {
  test('picks the first item below the current scroll position', () => {
    const layout = layoutItems(createInitialItems())
    expect(pickAnchor(layout, 700)).toEqual({id: 'V8', prevY: 788})
    expect(pickAnchor(layout, 980)).toEqual({id: 'V10', prevY: 1116})
  })

  test('adjusts scroll by the anchor delta and refreshes prevY between rapid prepends', () => {
    const initialItems = createInitialItems()
    const initialLayout = layoutItems(initialItems)
    const initialAnchor = pickAnchor(initialLayout, 700)

    const afterOne = prependItems(initialItems, 1).items
    const afterOneResult = resolveScrollAnchor({
      anchor: initialAnchor,
      layout: layoutItems(afterOne),
      scrollTop: 700,
      storedScrollTop: 700,
      explicitScrollTop: null,
    })

    expect(afterOneResult.requestedScrollTop).toBe(808)
    expect(afterOneResult.anchor).toEqual({id: 'V8', prevY: 896})

    const afterThree = prependItems(afterOne, 2).items
    const afterThreeResult = resolveScrollAnchor({
      anchor: afterOneResult.anchor,
      layout: layoutItems(afterThree),
      scrollTop: 808,
      storedScrollTop: 808,
      explicitScrollTop: null,
    })

    expect(afterThreeResult.requestedScrollTop).toBe(1024)
    expect(afterThreeResult.anchor).toEqual({id: 'V8', prevY: 1112})
  })

  test('treats an explicit scroll request like a new anchor pick', () => {
    const layout = layoutItems(createInitialItems())
    const result = resolveScrollAnchor({
      anchor: {id: 'V1', prevY: 32},
      layout,
      scrollTop: 0,
      storedScrollTop: 0,
      explicitScrollTop: 700,
    })

    expect(result.userScrolled).toBe(true)
    expect(result.requestedScrollTop).toBe(700)
    expect(result.anchor).toEqual({id: 'V8', prevY: 788})
  })
})
