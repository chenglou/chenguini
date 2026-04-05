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

export type LayoutEntry =
  | {kind: 'header'; day: string; top: number; height: number}
  | {kind: 'item'; item: Item; top: number; height: number}

export type Layout = {
  entries: LayoutEntry[]
  headerTops: Record<string, number>
  itemTops: Record<string, number>
  totalHeight: number
}

export const colors = [
  '#c0392b', '#2980b9', '#27ae60', '#8e44ad',
  '#d35400', '#16a085', '#2c3e50', '#f39c12',
]

export const ITEM_HEIGHT = 100
export const HEADER_HEIGHT = 24
export const FIRST_HEADER_GAP = 0
export const LATER_HEADER_GAP = 32
export const HEADER_BOTTOM_GAP = 8
export const ITEM_GAP = 8
export const TARGET_SCROLL_TOP = 700

const initialGroups = [
  {day: 'Today', count: 8},
  {day: 'Yesterday', count: 1},
  {'day': '2 Days Ago', count: 8},
] as const

export function buildInitialItems() {
  const items: Item[] = []
  let nextNumber = 1

  for (const group of initialGroups) {
    for (let i = 0; i < group.count; i++) {
      items.push(makeItem(nextNumber, group.day))
      nextNumber++
    }
  }

  return {items, nextNumber}
}

export function prependItems(items: Item[], nextNumber: number, count: number) {
  const newItems: Item[] = []

  for (let i = 0; i < count; i++) {
    newItems.push(makeItem(nextNumber + i, 'Today'))
  }

  return {
    items: [...newItems, ...items],
    nextNumber: nextNumber + count,
  }
}

export function computeLayout(items: Item[]): Layout {
  const groups: Array<{day: string; items: Item[]}> = []
  const groupsByDay = new Map<string, {day: string; items: Item[]}>()

  for (const item of items) {
    let group = groupsByDay.get(item.day)
    if (group == null) {
      group = {day: item.day, items: []}
      groupsByDay.set(item.day, group)
      groups.push(group)
    }
    group.items.push(item)
  }

  const entries: LayoutEntry[] = []
  const headerTops: Record<string, number> = {}
  const itemTops: Record<string, number> = {}
  let y = 0

  for (let groupIndex = 0; groupIndex < groups.length; groupIndex++) {
    const group = groups[groupIndex]!
    y += groupIndex === 0 ? FIRST_HEADER_GAP : LATER_HEADER_GAP

    headerTops[group.day] = y
    entries.push({kind: 'header', day: group.day, top: y, height: HEADER_HEIGHT})
    y += HEADER_HEIGHT + HEADER_BOTTOM_GAP

    for (let itemIndex = 0; itemIndex < group.items.length; itemIndex++) {
      const item = group.items[itemIndex]!
      itemTops[item.id] = y
      entries.push({kind: 'item', item, top: y, height: ITEM_HEIGHT})
      y += ITEM_HEIGHT
      if (itemIndex < group.items.length - 1) y += ITEM_GAP
    }
  }

  return {entries, headerTops, itemTops, totalHeight: y}
}

export function pickAnchor(layout: Layout, scrollTop: number): Anchor | null {
  for (const entry of layout.entries) {
    if (entry.kind !== 'item') continue
    if (entry.top + entry.height > scrollTop) return {id: entry.item.id, prevY: entry.top}
  }

  return null
}

export function adjustScrollTopForAnchor(anchor: Anchor | null, layout: Layout, scrollTop: number) {
  if (anchor == null) return {scrollTop, anchor: null, delta: 0}

  const nextY = layout.itemTops[anchor.id]
  if (nextY == null) return {scrollTop, anchor: null, delta: 0}

  const delta = nextY - anchor.prevY
  return {
    scrollTop: scrollTop + delta,
    anchor: {id: anchor.id, prevY: nextY},
    delta,
  }
}

export function findItemAtY(layout: Layout, y: number) {
  for (const entry of layout.entries) {
    if (entry.kind !== 'item') continue
    if (entry.top <= y && y < entry.top + entry.height) return entry.item
  }

  return null
}

export function getVisibleEntries(layout: Layout, scrollTop: number, viewportHeight: number) {
  const viewportBottom = scrollTop + viewportHeight
  return layout.entries.filter(entry => entry.top < viewportBottom && entry.top + entry.height > scrollTop)
}

function makeItem(number: number, day: string): Item {
  return {
    id: `V${number}`,
    day,
    label: `#${number}`,
    color: colors[(number - 1) % colors.length]!,
  }
}
