export type Item = {
  id: string
  day: string
  label: string
  color: string
}

export type Anchor = {
  id: string
  prevY: number
}

export type HeaderBox = {
  day: string
  top: number
  height: number
}

export type ItemBox = Item & {
  top: number
  height: number
}

export type Layout = {
  headerBoxes: HeaderBox[]
  itemBoxes: ItemBox[]
  itemBoxById: Map<string, ItemBox>
  totalHeight: number
}

export const colors = [
  '#c0392b', '#2980b9', '#27ae60', '#8e44ad',
  '#d35400', '#16a085', '#2c3e50', '#f39c12',
]

export const days = ['Today', 'Yesterday', '2 Days Ago'] as const

export const headerHeight = 24
export const firstHeaderGap = 0
export const laterHeaderGap = 32
export const headerBottomGap = 8
export const itemHeight = 100
export const itemGap = 8
export const targetScrollTop = 700
export const scrollerHeight = 540

function makeItem(counter: number, day: Item['day']): Item {
  return {
    id: `V${counter}`,
    day,
    label: `#${counter}`,
    color: colors[(counter - 1) % colors.length]!,
  }
}

export function createInitialItems() {
  const items: Item[] = []
  let nextItemNumber = 1

  for (let i = 0; i < 8; i++) items.push(makeItem(nextItemNumber++, 'Today'))
  items.push(makeItem(nextItemNumber++, 'Yesterday'))
  for (let i = 0; i < 8; i++) items.push(makeItem(nextItemNumber++, '2 Days Ago'))

  return {items, nextItemNumber}
}

export function prependItems(items: readonly Item[], nextItemNumber: number, count: number) {
  const created: Item[] = []
  let next = nextItemNumber
  for (let i = 0; i < count; i++) created.push(makeItem(next++, 'Today'))
  return {
    items: [...created, ...items],
    nextItemNumber: next,
  }
}

export function computeLayout(items: readonly Item[]): Layout {
  const headerBoxes: HeaderBox[] = []
  const itemBoxes: ItemBox[] = []
  const itemBoxById = new Map<string, ItemBox>()
  let y = 0

  for (let dayIndex = 0; dayIndex < days.length; dayIndex++) {
    const day = days[dayIndex]!
    const itemsForDay = items.filter((item) => item.day === day)
    if (itemsForDay.length === 0) continue

    y += dayIndex === 0 ? firstHeaderGap : laterHeaderGap
    headerBoxes.push({day, top: y, height: headerHeight})
    y += headerHeight + headerBottomGap

    for (let itemIndex = 0; itemIndex < itemsForDay.length; itemIndex++) {
      const item = itemsForDay[itemIndex]!
      const box: ItemBox = {...item, top: y, height: itemHeight}
      itemBoxes.push(box)
      itemBoxById.set(item.id, box)
      y += itemHeight
      if (itemIndex < itemsForDay.length - 1) y += itemGap
    }
  }

  return {headerBoxes, itemBoxes, itemBoxById, totalHeight: y}
}

export function pickAnchor(itemBoxes: readonly ItemBox[], scrollTop: number): Anchor | null {
  const picked = itemBoxes.find((item) => item.top + item.height > scrollTop) ?? itemBoxes.at(-1) ?? null
  return picked == null ? null : {id: picked.id, prevY: picked.top}
}

export function resolveAnchoredScroll(args: {
  anchor: Anchor | null
  currentScrollTop: number
  explicitScrollTop: number | null
  layout: Layout
  storedScrollTop: number
}) {
  const {currentScrollTop, explicitScrollTop, layout, storedScrollTop} = args
  const requestedScrollTop = explicitScrollTop ?? currentScrollTop
  const anchorBox = args.anchor == null ? null : layout.itemBoxById.get(args.anchor.id) ?? null
  const shouldPickAnchor =
    args.anchor == null ||
    anchorBox == null ||
    currentScrollTop !== storedScrollTop ||
    explicitScrollTop != null

  if (shouldPickAnchor) {
    return {
      adjustedScrollTop: requestedScrollTop,
      anchor: pickAnchor(layout.itemBoxes, requestedScrollTop),
    }
  }

  const adjustedScrollTop = currentScrollTop + (anchorBox.top - args.anchor.prevY)
  return {
    adjustedScrollTop,
    anchor: {id: args.anchor.id, prevY: anchorBox.top},
  }
}

export function clampScrollTop(totalHeight: number, viewportHeight: number, scrollTop: number) {
  return Math.max(0, Math.min(scrollTop, Math.max(0, totalHeight - viewportHeight)))
}

export function isVisible(top: number, height: number, scrollTop: number, viewportHeight: number) {
  return top < scrollTop + viewportHeight && top + height > scrollTop
}

export function itemAtReferenceLine(layout: Layout, scrollTop: number, viewportHeight: number) {
  const contentY = scrollTop + viewportHeight / 2
  const item = layout.itemBoxes.find((box) => box.top <= contentY && box.top + box.height > contentY)
  return item?.id ?? null
}
