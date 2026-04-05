import {describe, expect, test} from 'bun:test'
import {
  createInitialItems,
  createPrependItems,
  layoutItems,
  pickAnchor,
  applyAnchorDelta,
  didScrollSourceChange,
  getVisibleEntries,
  type ScrollAnchor,
} from './scroll-anchor-core'

describe('layoutItems', () => {
  test('places headers, items, and total height with the spec numbers', () => {
    const items = createInitialItems()
    const layout = layoutItems(items)

    expect(layout.headers).toEqual([
      {day: 'Today', top: 0, height: 24},
      {day: 'Yesterday', top: 920, height: 24},
      {day: '2 Days Ago', top: 1084, height: 24},
    ])

    expect(layout.items.map(item => ({id: item.id, day: item.day, top: item.top, height: item.height}))).toEqual([
      {id: 'V1', day: 'Today', top: 32, height: 100},
      {id: 'V2', day: 'Today', top: 140, height: 100},
      {id: 'V3', day: 'Today', top: 248, height: 100},
      {id: 'V4', day: 'Today', top: 356, height: 100},
      {id: 'V5', day: 'Today', top: 464, height: 100},
      {id: 'V6', day: 'Today', top: 572, height: 100},
      {id: 'V7', day: 'Today', top: 680, height: 100},
      {id: 'V8', day: 'Today', top: 788, height: 100},
      {id: 'V9', day: 'Yesterday', top: 952, height: 100},
      {id: 'V10', day: '2 Days Ago', top: 1116, height: 100},
      {id: 'V11', day: '2 Days Ago', top: 1224, height: 100},
      {id: 'V12', day: '2 Days Ago', top: 1332, height: 100},
      {id: 'V13', day: '2 Days Ago', top: 1440, height: 100},
      {id: 'V14', day: '2 Days Ago', top: 1548, height: 100},
      {id: 'V15', day: '2 Days Ago', top: 1656, height: 100},
      {id: 'V16', day: '2 Days Ago', top: 1764, height: 100},
      {id: 'V17', day: '2 Days Ago', top: 1872, height: 100},
    ])

    expect(layout.totalHeight).toBe(1972)
  })

  test('returns only visible headers and items for a viewport slice', () => {
    const items = createInitialItems()
    const layout = layoutItems(items)
    const visible = getVisibleEntries(layout, 700, 320)

    expect(visible.map(entry => entry.key)).toEqual([
      'item:V7',
      'item:V8',
      'header:Yesterday',
      'item:V9',
    ])
  })
})

describe('scroll anchoring helpers', () => {
  test('picks the first item crossing the current scrollTop', () => {
    const items = createInitialItems()
    const layout = layoutItems(items)

    expect(pickAnchor(layout, 0)).toEqual({id: 'V1', prevY: 32})
    expect(pickAnchor(layout, 700)).toEqual({id: 'V7', prevY: 680})
    expect(pickAnchor(layout, 1040)).toEqual({id: 'V9', prevY: 952})
  })

  test('adjusts scrollTop by the anchor delta and refreshes prevY immediately', () => {
    const anchor: ScrollAnchor = {id: 'V7', prevY: 680}
    const adjusted = applyAnchorDelta(700, anchor, 1004)

    expect(adjusted.nextScrollTop).toBe(1024)
    expect(adjusted.anchor).toEqual({id: 'V7', prevY: 1004})
  })

  test('detects user scroll from scrollTop changes or an explicit scroll action', () => {
    expect(didScrollSourceChange({scrollTop: 700, storedScrollTop: 700, explicitScrollAction: false})).toBe(false)
    expect(didScrollSourceChange({scrollTop: 720, storedScrollTop: 700, explicitScrollAction: false})).toBe(true)
    expect(didScrollSourceChange({scrollTop: 700, storedScrollTop: 700, explicitScrollAction: true})).toBe(true)
  })

  test('keeps the same top anchor through one prepend or two rapid prepends', () => {
    const initialItems = createInitialItems()
    const initialLayout = layoutItems(initialItems)
    const anchor = pickAnchor(initialLayout, 700)
    expect(anchor).toEqual({id: 'V7', prevY: 680})

    const afterOne = createPrependItems({count: 1, startAt: initialItems.length + 1})
    const layoutAfterOne = layoutItems([...afterOne.items, ...initialItems])
    const adjustedAfterOne = applyAnchorDelta(700, anchor!, layoutAfterOne.itemMap.get('V7')!.top)
    expect(adjustedAfterOne.nextScrollTop).toBe(808)
    expect(adjustedAfterOne.anchor).toEqual({id: 'V7', prevY: 788})

    const afterThree = createPrependItems({count: 3, startAt: initialItems.length + 1})
    const layoutAfterThree = layoutItems([...afterThree.items, ...initialItems])
    const adjustedAfterThree = applyAnchorDelta(700, anchor!, layoutAfterThree.itemMap.get('V7')!.top)
    expect(adjustedAfterThree.nextScrollTop).toBe(1024)
    expect(adjustedAfterThree.anchor).toEqual({id: 'V7', prevY: 1004})
  })
})
