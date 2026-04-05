import {describe, expect, test} from 'bun:test'
import {
  COLORS,
  REFERENCE_LINE_VIEWPORT_HEIGHT,
  TARGET_SCROLL_TOP,
  buildLayout,
  createInitialState,
  findItemAtReferenceLine,
  pickAnchor,
  prependAbove,
  resolveAnchorAdjustment,
} from './model'

describe('scroll anchor model', () => {
  test('lays out headers, items, and total height with the exact spec numbers', () => {
    const state = createInitialState()
    const layout = buildLayout(state.items)

    expect(layout.headers.map(header => [header.day, header.top])).toEqual([
      ['Today', 0],
      ['Yesterday', 920],
      ['2 Days Ago', 1084],
    ])

    expect(layout.items.find(item => item.id === 'V1')).toMatchObject({top: 32, bottom: 132})
    expect(layout.items.find(item => item.id === 'V8')).toMatchObject({top: 788, bottom: 888})
    expect(layout.items.find(item => item.id === 'V9')).toMatchObject({top: 952, bottom: 1052})
    expect(layout.items.find(item => item.id === 'V10')).toMatchObject({top: 1116, bottom: 1216})
    expect(layout.totalHeight).toBe(1972)
  })

  test('prepends new items with incrementing ids, labels, and the exact color cycle', () => {
    const state = createInitialState()
    prependAbove(state, 3)

    expect(state.items.slice(0, 3)).toEqual([
      {id: 'V18', day: 'Today', label: '#18', color: COLORS[1]},
      {id: 'V19', day: 'Today', label: '#19', color: COLORS[2]},
      {id: 'V20', day: 'Today', label: '#20', color: COLORS[3]},
    ])
    expect(state.nextItemNumber).toBe(21)
  })

  test('picks the first visible item as the anchor and adjusts scroll by the anchor delta', () => {
    const state = createInitialState()
    const beforeLayout = buildLayout(state.items)
    const anchor = pickAnchor(beforeLayout.items, TARGET_SCROLL_TOP)

    expect(anchor).toEqual({id: 'V7', prevY: 680})

    prependAbove(state, 3)
    const afterLayout = buildLayout(state.items)
    const adjusted = resolveAnchorAdjustment(afterLayout.items, anchor, TARGET_SCROLL_TOP)

    expect(adjusted).toEqual({
      adjustedScrollTop: 1024,
      anchor: {id: 'V7', prevY: 1004},
    })
  })

  test('reference-line lookup is sensitive to scroll position changes', () => {
    const state = createInitialState()
    const layout = buildLayout(state.items)

    expect(findItemAtReferenceLine(layout.items, 0, REFERENCE_LINE_VIEWPORT_HEIGHT)?.id).toBe('V3')
    expect(findItemAtReferenceLine(layout.items, TARGET_SCROLL_TOP, REFERENCE_LINE_VIEWPORT_HEIGHT)?.id).toBe('V9')
  })
})
