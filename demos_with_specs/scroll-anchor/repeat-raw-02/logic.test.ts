import { describe, expect, test } from 'bun:test'

import {
  SCROLLER_HEIGHT,
  computeLayout,
  computeRenderPlan,
  createInitialState,
  findReferenceItem,
  prependItems,
} from './logic.js'

describe('layout math', () => {
  test('positions headers, items, and total height exactly', () => {
    const state = createInitialState()
    const layout = computeLayout(state.items)

    expect(layout.totalHeight).toBe(1972)
    expect(
      layout.headers.map((header) => ({
        day: header.day,
        top: header.top,
      })),
    ).toEqual([
      { day: 'Today', top: 0 },
      { day: 'Yesterday', top: 920 },
      { day: '2 Days Ago', top: 1084 },
    ])

    expect(
      ['V1', 'V8', 'V9', 'V10', 'V17'].map((id) => ({
        id,
        top: layout.itemsById.get(id)?.top,
      })),
    ).toEqual([
      { id: 'V1', top: 32 },
      { id: 'V8', top: 788 },
      { id: 'V9', top: 952 },
      { id: 'V10', top: 1116 },
      { id: 'V17', top: 1872 },
    ])
  })
})

describe('anchor logic', () => {
  test('picks the first item below scrollTop and adjusts by its delta after prepend', () => {
    const initialState = createInitialState()
    const initialLayout = computeLayout(initialState.items)
    const firstPass = computeRenderPlan({
      layout: initialLayout,
      scrollTop: 700,
      storedScrollTop: 0,
      anchor: null,
      forceAnchorRepick: true,
    })

    expect(firstPass.userScrolled).toBe(true)
    expect(firstPass.anchor).toEqual({ id: 'V8', prevY: 788 })

    const referenceBefore = findReferenceItem(initialLayout, 700, SCROLLER_HEIGHT)
    expect(referenceBefore?.id).toBe('V9')

    const nextState = prependItems(initialState, 3)
    const nextLayout = computeLayout(nextState.items)
    const secondPass = computeRenderPlan({
      layout: nextLayout,
      scrollTop: 700,
      storedScrollTop: 700,
      anchor: firstPass.anchor,
    })

    expect(secondPass.userScrolled).toBe(false)
    expect(secondPass.adjustedScrollTop).toBe(1024)
    expect(secondPass.anchor).toEqual({ id: 'V8', prevY: 1112 })

    const referenceAfter = findReferenceItem(
      nextLayout,
      secondPass.adjustedScrollTop,
      SCROLLER_HEIGHT,
    )
    expect(referenceAfter?.id).toBe('V9')
  })

  test('rapid prepend lands on the same anchored result in one render or two', () => {
    const initialState = createInitialState()
    const initialLayout = computeLayout(initialState.items)
    const anchoredState = computeRenderPlan({
      layout: initialLayout,
      scrollTop: 700,
      storedScrollTop: 0,
      anchor: null,
      forceAnchorRepick: true,
    })

    const sameFrameState = prependItems(prependItems(initialState, 1), 2)
    const sameFrameLayout = computeLayout(sameFrameState.items)
    const sameFramePlan = computeRenderPlan({
      layout: sameFrameLayout,
      scrollTop: 700,
      storedScrollTop: 700,
      anchor: anchoredState.anchor,
    })

    expect(sameFramePlan.adjustedScrollTop).toBe(1024)
    expect(sameFramePlan.anchor).toEqual({ id: 'V8', prevY: 1112 })
    expect(
      findReferenceItem(
        sameFrameLayout,
        sameFramePlan.adjustedScrollTop,
        SCROLLER_HEIGHT,
      )?.id,
    ).toBe('V9')

    const oneItemState = prependItems(initialState, 1)
    const oneItemLayout = computeLayout(oneItemState.items)
    const afterOneItemPlan = computeRenderPlan({
      layout: oneItemLayout,
      scrollTop: 700,
      storedScrollTop: 700,
      anchor: anchoredState.anchor,
    })

    expect(afterOneItemPlan.adjustedScrollTop).toBe(808)
    expect(afterOneItemPlan.anchor).toEqual({ id: 'V8', prevY: 896 })

    const splitState = prependItems(oneItemState, 2)
    const splitLayout = computeLayout(splitState.items)
    const splitPlan = computeRenderPlan({
      layout: splitLayout,
      scrollTop: 808,
      storedScrollTop: 808,
      anchor: afterOneItemPlan.anchor,
    })

    expect(splitPlan.adjustedScrollTop).toBe(1024)
    expect(splitPlan.anchor).toEqual({ id: 'V8', prevY: 1112 })
    expect(findReferenceItem(splitLayout, splitPlan.adjustedScrollTop, SCROLLER_HEIGHT)?.id).toBe(
      'V9',
    )
  })
})
