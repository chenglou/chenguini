export type Item = {
  id: string
  day: string
  label: string
  color: string
}

export type ScrollAnchor = {
  id: string
  prevY: number
}

export type LayoutHeader = {
  day: string
  top: number
  height: number
}

export type LayoutItem = Item & {
  top: number
  height: number
  bottom: number
}

export type LayoutEntry =
  | {
      kind: 'header'
      key: string
      day: string
      top: number
      height: number
    }
  | {
      kind: 'item'
      key: string
      item: LayoutItem
      top: number
      height: number
    }

export type LayoutResult = {
  headers: LayoutHeader[]
  items: LayoutItem[]
  entries: LayoutEntry[]
  itemMap: Map<string, LayoutItem>
  totalHeight: number
}

export const COLORS = [
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

export function createInitialItems(): Item[] {
  const items: Item[] = []
  let nextNumber = 1

  nextNumber = pushItems(items, 'Today', 8, nextNumber)
  nextNumber = pushItems(items, 'Yesterday', 1, nextNumber)
  pushItems(items, '2 Days Ago', 8, nextNumber)

  return items
}

export function createPrependItems(args: {count: number; startAt: number; day?: string}) {
  const items: Item[] = []
  const day = args.day ?? 'Today'
  let nextNumber = args.startAt

  nextNumber = pushItems(items, day, args.count, nextNumber)
  return {items, nextNumber}
}

export function layoutItems(items: Item[]): LayoutResult {
  const headers: LayoutHeader[] = []
  const laidOutItems: LayoutItem[] = []
  const entries: LayoutEntry[] = []
  const itemMap = new Map<string, LayoutItem>()
  let currentDay: string | null = null
  let y = 0

  for (let i = 0; i < items.length; i++) {
    const item = items[i]!

    if (item.day !== currentDay) {
      y += currentDay == null ? FIRST_HEADER_GAP : LATER_HEADER_GAP
      const header: LayoutHeader = {
        day: item.day,
        top: y,
        height: HEADER_HEIGHT,
      }
      headers.push(header)
      entries.push({
        kind: 'header',
        key: `header:${item.day}`,
        day: item.day,
        top: header.top,
        height: header.height,
      })
      y += HEADER_HEIGHT + HEADER_BOTTOM_GAP
      currentDay = item.day
    }

    const laidOut: LayoutItem = {
      ...item,
      top: y,
      height: ITEM_HEIGHT,
      bottom: y + ITEM_HEIGHT,
    }
    laidOutItems.push(laidOut)
    itemMap.set(item.id, laidOut)
    entries.push({
      kind: 'item',
      key: `item:${item.id}`,
      item: laidOut,
      top: laidOut.top,
      height: laidOut.height,
    })
    y += ITEM_HEIGHT

    const nextItem = items[i + 1]
    if (nextItem != null && nextItem.day === item.day) y += ITEM_GAP
  }

  return {
    headers,
    items: laidOutItems,
    entries,
    itemMap,
    totalHeight: y,
  }
}

export function getVisibleEntries(layout: LayoutResult, scrollTop: number, viewportHeight: number): LayoutEntry[] {
  const bottom = scrollTop + viewportHeight
  return layout.entries.filter(entry => entry.top < bottom && entry.top + entry.height > scrollTop)
}

export function pickAnchor(layout: LayoutResult, scrollTop: number): ScrollAnchor | null {
  for (const item of layout.items) {
    if (item.bottom > scrollTop) {
      return {
        id: item.id,
        prevY: item.top,
      }
    }
  }

  return null
}

export function applyAnchorDelta(scrollTop: number, anchor: ScrollAnchor, currentY: number) {
  const delta = currentY - anchor.prevY
  return {
    nextScrollTop: scrollTop + delta,
    anchor: {
      id: anchor.id,
      prevY: currentY,
    } satisfies ScrollAnchor,
  }
}

export function didScrollSourceChange(args: {
  scrollTop: number
  storedScrollTop: number
  explicitScrollAction: boolean
}) {
  return args.explicitScrollAction || args.scrollTop !== args.storedScrollTop
}

export function getReferenceItem(layout: LayoutResult, scrollTop: number, viewportHeight: number): LayoutItem | null {
  const referenceY = scrollTop + viewportHeight / 2
  for (const item of layout.items) {
    if (item.top <= referenceY && referenceY < item.bottom) return item
  }

  return null
}

function pushItems(items: Item[], day: string, count: number, startAt: number) {
  let nextNumber = startAt
  for (let i = 0; i < count; i++) {
    items.push({
      id: `V${nextNumber}`,
      day,
      label: `#${nextNumber}`,
      color: COLORS[(nextNumber - 1) % COLORS.length]!,
    })
    nextNumber += 1
  }

  return nextNumber
}
