import {describe, expect, test} from 'bun:test'

import {
  createInitialState,
  layoutItems,
  pickAnchor,
  prependItems,
  reconcileAnchor,
} from './scroll-anchor-model'

describe('scroll-anchor model', () => {
  test('lays out headers, items, and total height with the spec numbers', () => {
    const state = createInitialState()
    const layout = layoutItems(state.items)

    expect(layout.totalHeight).toBe(1972)
    expect(layout.headers).toEqual([
      {day: 'Today', top: 0, height: 24},
      {day: 'Yesterday', top: 920, height: 24},
      {day: '2 Days Ago', top: 1084, height: 24},
    ])

    expect(layout.items.map(item => ({id: item.id, day: item.day, top: item.top}))).toEqual([
      {id: 'V1', day: 'Today', top: 32},
      {id: 'V2', day: 'Today', top: 140},
      {id: 'V3', day: 'Today', top: 248},
      {id: 'V4', day: 'Today', top: 356},
      {id: 'V5', day: 'Today', top: 464},
      {id: 'V6', day: 'Today', top: 572},
      {id: 'V7', day: 'Today', top: 680},
      {id: 'V8', day: 'Today', top: 788},
      {id: 'V9', day: 'Yesterday', top: 952},
      {id: 'V10', day: '2 Days Ago', top: 1116},
      {id: 'V11', day: '2 Days Ago', top: 1224},
      {id: 'V12', day: '2 Days Ago', top: 1332},
      {id: 'V13', day: '2 Days Ago', top: 1440},
      {id: 'V14', day: '2 Days Ago', top: 1548},
      {id: 'V15', day: '2 Days Ago', top: 1656},
      {id: 'V16', day: '2 Days Ago', top: 1764},
      {id: 'V17', day: '2 Days Ago', top: 1872},
    ])
  })

  test('picks the first item below scrollTop and applies the anchor delta on prepend', () => {
    const state = createInitialState()
    const initialLayout = layoutItems(state.items)
    const anchor = pickAnchor(initialLayout.items, 700)

    expect(anchor).toEqual({itemId: 'V8', prevY: 788})

    const prepended = prependItems(state, 3)
    const nextLayout = layoutItems(prepended.items)
    const result = reconcileAnchor({
      readScrollTop: 700,
      storedScrollTop: 700,
      anchor,
      itemLayouts: nextLayout.items,
    })

    expect(result.userScrolled).toBe(false)
    expect(result.requestedScrollTop).toBe(1024)
    expect(result.anchor).toEqual({itemId: 'V8', prevY: 1112})
  })

  test('rapid prepend lands on the same final scrollTop in one render or two', () => {
    const state = createInitialState()
    const initialLayout = layoutItems(state.items)
    const anchor = pickAnchor(initialLayout.items, 700)
    expect(anchor).toEqual({itemId: 'V8', prevY: 788})

    const onePassState = prependItems(state, 3)
    const onePassResult = reconcileAnchor({
      readScrollTop: 700,
      storedScrollTop: 700,
      anchor,
      itemLayouts: layoutItems(onePassState.items).items,
    })

    expect(onePassResult.requestedScrollTop).toBe(1024)
    expect(onePassResult.anchor).toEqual({itemId: 'V8', prevY: 1112})

    const afterOne = prependItems(state, 1)
    const firstPass = reconcileAnchor({
      readScrollTop: 700,
      storedScrollTop: 700,
      anchor,
      itemLayouts: layoutItems(afterOne.items).items,
    })

    expect(firstPass.requestedScrollTop).toBe(808)
    expect(firstPass.anchor).toEqual({itemId: 'V8', prevY: 896})

    const afterThree = prependItems(afterOne, 2)
    const secondPass = reconcileAnchor({
      readScrollTop: 808,
      storedScrollTop: 808,
      anchor: firstPass.anchor,
      itemLayouts: layoutItems(afterThree.items).items,
    })

    expect(secondPass.requestedScrollTop).toBe(1024)
    expect(secondPass.anchor).toEqual({itemId: 'V8', prevY: 1112})
  })

  test('a new user scroll picks a new anchor from the new scroll position', () => {
    const state = createInitialState()
    const initialLayout = layoutItems(state.items)
    const oldAnchor = pickAnchor(initialLayout.items, 700)

    expect(oldAnchor).toEqual({itemId: 'V8', prevY: 788})

    const scrolled = reconcileAnchor({
      readScrollTop: 920,
      storedScrollTop: 700,
      anchor: oldAnchor,
      itemLayouts: initialLayout.items,
    })

    expect(scrolled.userScrolled).toBe(true)
    expect(scrolled.requestedScrollTop).toBe(920)
    expect(scrolled.anchor).toEqual({itemId: 'V9', prevY: 952})

    const prepended = prependItems(state, 3)
    const anchored = reconcileAnchor({
      readScrollTop: 920,
      storedScrollTop: 920,
      anchor: scrolled.anchor,
      itemLayouts: layoutItems(prepended.items).items,
    })

    expect(anchored.userScrolled).toBe(false)
    expect(anchored.requestedScrollTop).toBe(1244)
    expect(anchored.anchor).toEqual({itemId: 'V9', prevY: 1276})
  })

  test('an explicit scroll request also repicks the anchor even before scrollTop changes', () => {
    const state = createInitialState()
    const result = reconcileAnchor({
      readScrollTop: 0,
      storedScrollTop: 0,
      anchor: null,
      explicitScrollTop: 700,
      itemLayouts: layoutItems(state.items).items,
    })

    expect(result.userScrolled).toBe(true)
    expect(result.requestedScrollTop).toBe(700)
    expect(result.anchor).toEqual({itemId: 'V8', prevY: 788})
  })
})
