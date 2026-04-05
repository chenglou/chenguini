export type Day = 'Today' | 'Yesterday' | '2 Days Ago'

export type Item = {
  id: string
  day: Day
  label: string
  color: string
}

export type ScrollAnchor = {
  id: string
  prevY: number
}

export const ITEM_HEIGHT = 100
export const HEADER_HEIGHT = 24
export const FIRST_HEADER_GAP = 0
export const LATER_HEADER_GAP = 32
export const HEADER_BOTTOM_GAP = 8
export const ITEM_GAP = 8
export const TARGET_SCROLL_TOP = 700

export const colors = [
  '#c0392b', '#2980b9', '#27ae60', '#8e44ad',
  '#d35400', '#16a085', '#2c3e50', '#f39c12',
] as const

const days: Day[] = ['Today', 'Yesterday', '2 Days Ago']

export type HeaderEntry = {
  kind: 'header'
  day: Day
  top: number
  height: number
}

export type ItemEntry = {
  kind: 'item'
  item: Item
  top: number
  height: number
}

export type LayoutEntry = HeaderEntry | ItemEntry

export type Layout = {
  entries: LayoutEntry[]
  totalHeight: number
}

export function createInitialItems() {
  let nextNumber = 1
  const items: Item[] = []

  for (let i = 0; i < 8; i++) items.push(createItem(nextNumber++, 'Today'))
  items.push(createItem(nextNumber++, 'Yesterday'))
  for (let i = 0; i < 8; i++) items.push(createItem(nextNumber++, '2 Days Ago'))

  return items
}

export function prependItemsAbove(items: Item[], nextNumber: number, count: number) {
  const prepended: Item[] = []
  let currentNumber = nextNumber

  for (let i = 0; i < count; i++) prepended.push(createItem(currentNumber++, 'Today'))

  return {
    items: prepended.concat(items),
    nextItemNumber: currentNumber,
  }
}

export function createLayout(items: Item[]): Layout {
  const entries: LayoutEntry[] = []
  let y = 0

  for (let dayIndex = 0; dayIndex < days.length; dayIndex++) {
    const day = days[dayIndex]!
    const itemsForDay = items.filter(item => item.day === day)
    if (itemsForDay.length === 0) continue

    y += dayIndex === 0 ? FIRST_HEADER_GAP : LATER_HEADER_GAP
    entries.push({
      kind: 'header',
      day,
      top: y,
      height: HEADER_HEIGHT,
    })
    y += HEADER_HEIGHT + HEADER_BOTTOM_GAP

    for (let itemIndex = 0; itemIndex < itemsForDay.length; itemIndex++) {
      const item = itemsForDay[itemIndex]!
      entries.push({
        kind: 'item',
        item,
        top: y,
        height: ITEM_HEIGHT,
      })
      y += ITEM_HEIGHT
      if (itemIndex < itemsForDay.length - 1) y += ITEM_GAP
    }
  }

  return {entries, totalHeight: y}
}

export function pickAnchor(entries: LayoutEntry[], scrollTop: number): ScrollAnchor | null {
  let lastItem: ItemEntry | null = null

  for (const entry of entries) {
    if (entry.kind !== 'item') continue
    lastItem = entry
    if (entry.top >= scrollTop) {
      return {
        id: entry.item.id,
        prevY: entry.top,
      }
    }
  }

  if (lastItem == null) return null
  return {id: lastItem.item.id, prevY: lastItem.top}
}

export function applyAnchorDelta(scrollTop: number, anchor: ScrollAnchor, currentY: number) {
  return {
    adjustedScrollTop: scrollTop + (currentY - anchor.prevY),
    anchor: {
      id: anchor.id,
      prevY: currentY,
    } satisfies ScrollAnchor,
  }
}

export function findReferenceItem(entries: LayoutEntry[], scrollTop: number, viewportHeight: number) {
  const lineY = scrollTop + viewportHeight / 2
  return entries.find(entry =>
    entry.kind === 'item' && entry.top <= lineY && lineY < entry.top + entry.height
  ) ?? null
}

function createItem(number: number, day: Day): Item {
  return {
    id: `V${number}`,
    day,
    label: `#${number}`,
    color: colors[(number - 1) % colors.length]!,
  }
}
