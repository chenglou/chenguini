export type Day = 'Today' | 'Yesterday' | '2 Days Ago'

export type Item = {
  id: string
  day: Day
  label: string
  color: string
}

export type ItemState = {
  items: Item[]
  nextItemNumber: number
}

export type LayoutHeader = {
  day: Day
  top: number
  bottom: number
}

export type LayoutItem = Item & {
  top: number
  bottom: number
}

export type Layout = {
  headers: LayoutHeader[]
  items: LayoutItem[]
  totalHeight: number
}

export type Anchor = {
  id: string
  prevY: number
}

export const COLORS = [
  '#c0392b',
  '#2980b9',
  '#27ae60',
  '#8e44ad',
  '#d35400',
  '#16a085',
  '#2c3e50',
  '#f39c12',
] as const

export const ITEM_HEIGHT = 100
export const HEADER_HEIGHT = 24
export const FIRST_HEADER_GAP = 0
export const LATER_HEADER_GAP = 32
export const HEADER_BOTTOM_GAP = 8
export const ITEM_GAP = 8
export const TARGET_SCROLL_TOP = 700
export const REFERENCE_LINE_VIEWPORT_HEIGHT = 560

const DAY_ORDER: Day[] = ['Today', 'Yesterday', '2 Days Ago']
const INITIAL_DAY_COUNTS: Record<Day, number> = {
  Today: 8,
  Yesterday: 1,
  '2 Days Ago': 8,
}

export function createInitialState(): ItemState {
  const items: Item[] = []
  let nextItemNumber = 1

  for (const day of DAY_ORDER) {
    for (let i = 0; i < INITIAL_DAY_COUNTS[day]; i++) {
      items.push(makeItem(day, nextItemNumber))
      nextItemNumber++
    }
  }

  return {items, nextItemNumber}
}

export function prependAbove(state: ItemState, count: number) {
  const nextItems: Item[] = []

  for (let i = 0; i < count; i++) {
    nextItems.push(makeItem('Today', state.nextItemNumber))
    state.nextItemNumber++
  }

  state.items = nextItems.concat(state.items)
}

export function buildLayout(items: Item[]): Layout {
  const headers: LayoutHeader[] = []
  const laidOutItems: LayoutItem[] = []
  let y = 0

  for (let dayIndex = 0; dayIndex < DAY_ORDER.length; dayIndex++) {
    const day = DAY_ORDER[dayIndex]!
    const dayItems = items.filter(item => item.day === day)
    if (dayItems.length === 0) continue

    y += dayIndex === 0 ? FIRST_HEADER_GAP : LATER_HEADER_GAP
    const headerTop = y
    headers.push({
      day,
      top: headerTop,
      bottom: headerTop + HEADER_HEIGHT,
    })
    y += HEADER_HEIGHT + HEADER_BOTTOM_GAP

    for (let itemIndex = 0; itemIndex < dayItems.length; itemIndex++) {
      const item = dayItems[itemIndex]!
      const top = y
      laidOutItems.push({
        ...item,
        top,
        bottom: top + ITEM_HEIGHT,
      })
      y += ITEM_HEIGHT
      if (itemIndex < dayItems.length - 1) y += ITEM_GAP
    }
  }

  return {
    headers,
    items: laidOutItems,
    totalHeight: y,
  }
}

export function pickAnchor(items: LayoutItem[], scrollTop: number): Anchor | null {
  for (const item of items) {
    if (item.bottom > scrollTop) return {id: item.id, prevY: item.top}
  }

  const lastItem = items[items.length - 1]
  return lastItem == null ? null : {id: lastItem.id, prevY: lastItem.top}
}

export function resolveAnchorAdjustment(items: LayoutItem[], anchor: Anchor | null, scrollTop: number) {
  if (anchor == null) return null
  const item = items.find(candidate => candidate.id === anchor.id)
  if (item == null) return null

  return {
    adjustedScrollTop: scrollTop + (item.top - anchor.prevY),
    anchor: {
      id: item.id,
      prevY: item.top,
    },
  }
}

export function findItemAtReferenceLine(items: LayoutItem[], scrollTop: number, viewportHeight: number) {
  const referenceY = scrollTop + viewportHeight / 2
  return items.find(item => item.top <= referenceY && item.bottom >= referenceY) ?? null
}

function makeItem(day: Day, itemNumber: number): Item {
  return {
    id: `V${itemNumber}`,
    day,
    label: `#${itemNumber}`,
    color: COLORS[(itemNumber - 1) % COLORS.length]!,
  }
}
