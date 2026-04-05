import {describe, expect, test} from 'bun:test'

import {
  colors,
  computeLayout,
  createInitialItems,
  itemAtReferenceLine,
  pickAnchor,
  prependItems,
  resolveAnchoredScroll,
} from './model'

describe('layout math', () => {
  test('positions headers, items, and total height with the spec numbers', () => {
    const {items} = createInitialItems()
    const layout = computeLayout(items)

    expect(layout.headerBoxes).toEqual([
      {day: 'Today', top: 0, height: 24},
      {day: 'Yesterday', top: 920, height: 24},
      {day: '2 Days Ago', top: 1084, height: 24},
    ])

    expect(layout.itemBoxes[0]).toMatchObject({id: 'V1', day: 'Today', top: 32, height: 100})
    expect(layout.itemBoxes[7]).toMatchObject({id: 'V8', day: 'Today', top: 788, height: 100})
    expect(layout.itemBoxes[8]).toMatchObject({id: 'V9', day: 'Yesterday', top: 952, height: 100})
    expect(layout.itemBoxes[9]).toMatchObject({id: 'V10', day: '2 Days Ago', top: 1116, height: 100})
    expect(layout.itemBoxes.at(-1)).toMatchObject({id: 'V17', day: '2 Days Ago', top: 1872, height: 100})
    expect(layout.totalHeight).toBe(1972)
  })

  test('new prepended items increment ids, labels, and colors', () => {
    const initial = createInitialItems()
    const next = prependItems(initial.items, initial.nextItemNumber, 3)

    expect(next.items.slice(0, 3)).toEqual([
      {id: 'V18', day: 'Today', label: '#18', color: colors[1]!},
      {id: 'V19', day: 'Today', label: '#19', color: colors[2]!},
      {id: 'V20', day: 'Today', label: '#20', color: colors[3]!},
    ])
    expect(next.nextItemNumber).toBe(21)
  })
})

describe('anchor logic', () => {
  test('picks a new anchor from an explicit scroll target', () => {
    const {items} = createInitialItems()
    const layout = computeLayout(items)
    const resolved = resolveAnchoredScroll({
      anchor: null,
      currentScrollTop: 0,
      explicitScrollTop: 700,
      layout,
      storedScrollTop: 0,
    })

    expect(resolved.adjustedScrollTop).toBe(700)
    expect(resolved.anchor).toEqual({id: 'V7', prevY: 680})
    expect(itemAtReferenceLine(layout, 700, 540)).toBe('V9')
  })

  test('applies anchor delta after prepending above the viewport', () => {
    const initial = createInitialItems()
    const layout = computeLayout(initial.items)
    const anchor = pickAnchor(layout.itemBoxes, 700)
    const prepended = prependItems(initial.items, initial.nextItemNumber, 3)
    const nextLayout = computeLayout(prepended.items)
    const resolved = resolveAnchoredScroll({
      anchor,
      currentScrollTop: 700,
      explicitScrollTop: null,
      layout: nextLayout,
      storedScrollTop: 700,
    })

    expect(anchor).toEqual({id: 'V7', prevY: 680})
    expect(resolved.adjustedScrollTop).toBe(1024)
    expect(resolved.anchor).toEqual({id: 'V7', prevY: 1004})
  })

  test('rapid prepends land on the same anchored result in one render or two', () => {
    const initial = createInitialItems()
    const initialLayout = computeLayout(initial.items)
    const anchor = pickAnchor(initialLayout.itemBoxes, 0)

    const oneShotItems = prependItems(initial.items, initial.nextItemNumber, 3)
    const oneShotResolved = resolveAnchoredScroll({
      anchor,
      currentScrollTop: 0,
      explicitScrollTop: null,
      layout: computeLayout(oneShotItems.items),
      storedScrollTop: 0,
    })

    const plusOne = prependItems(initial.items, initial.nextItemNumber, 1)
    const afterOne = resolveAnchoredScroll({
      anchor,
      currentScrollTop: 0,
      explicitScrollTop: null,
      layout: computeLayout(plusOne.items),
      storedScrollTop: 0,
    })

    const plusTwoMore = prependItems(plusOne.items, plusOne.nextItemNumber, 2)
    const afterTwo = resolveAnchoredScroll({
      anchor: afterOne.anchor,
      currentScrollTop: afterOne.adjustedScrollTop,
      explicitScrollTop: null,
      layout: computeLayout(plusTwoMore.items),
      storedScrollTop: afterOne.adjustedScrollTop,
    })

    expect(anchor).toEqual({id: 'V1', prevY: 32})
    expect(afterOne.adjustedScrollTop).toBe(108)
    expect(afterOne.anchor).toEqual({id: 'V1', prevY: 140})
    expect(afterTwo.adjustedScrollTop).toBe(oneShotResolved.adjustedScrollTop)
    expect(afterTwo.anchor).toEqual(oneShotResolved.anchor)
    expect(afterTwo.adjustedScrollTop).toBe(324)
    expect(itemAtReferenceLine(computeLayout(plusTwoMore.items), afterTwo.adjustedScrollTop, 540)).toBe('V3')
  })
})
