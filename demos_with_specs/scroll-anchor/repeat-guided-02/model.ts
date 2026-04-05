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

export type LayoutEntry =
  | {
      kind: 'header'
      key: string
      day: string
      top: number
      height: number
      bottom: number
    }
  | {
      kind: 'item'
      key: string
      id: string
      day: string
      label: string
      color: string
      top: number
      height: number
      bottom: number
    }

export type FeedLayout = {
  entries: LayoutEntry[]
  entryTopByKey: Map<string, number>
  itemTopById: Map<string, number>
  totalHeight: number
}

export type ScrollAnchorScenarioStep = {
  mode: 'coalesced' | 'split'
  beforeLineItemId: string | null
  afterLineItemId: string | null
  anchorBeforeId: string | null
  anchorAfterId: string | null
}

export type ScrollAnchorReport = {
  phase: 'loading' | 'running' | 'ready' | 'error'
  requestId: string
  scenario: string
  beforeLineItemId?: string | null
  afterLineItemId?: string | null
  anchorBeforeId?: string | null
  anchorAfterId?: string | null
  anchorAfterUserScrollId?: string | null
  steps?: ScrollAnchorScenarioStep[]
  message?: string
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

export function createInitialFeed() {
  let nextItemNumber = 1
  const items = [
    ...createDayItems('Today', 8, () => nextItemNumber++),
    ...createDayItems('Yesterday', 1, () => nextItemNumber++),
    ...createDayItems('2 Days Ago', 8, () => nextItemNumber++),
  ]
  return {items, nextItemNumber}
}

export function prependItems(
  items: Item[],
  nextItemNumber: number,
  count: number,
  day = 'Today',
) {
  const prepended: Item[] = []
  let currentItemNumber = nextItemNumber

  for (let index = 0; index < count; index++) {
    prepended.push(makeItem(day, currentItemNumber))
    currentItemNumber += 1
  }

  return {
    items: [...prepended, ...items],
    nextItemNumber: currentItemNumber,
  }
}

export function layoutFeed(items: Item[]): FeedLayout {
  const entries: LayoutEntry[] = []
  const entryTopByKey = new Map<string, number>()
  const itemTopById = new Map<string, number>()
  let y = 0
  let previousDay: string | null = null

  for (let index = 0; index < items.length; index++) {
    const item = items[index]!
    if (item.day !== previousDay) {
      y += previousDay == null ? FIRST_HEADER_GAP : LATER_HEADER_GAP
      const key = `header:${item.day}`
      entries.push({
        kind: 'header',
        key,
        day: item.day,
        top: y,
        height: HEADER_HEIGHT,
        bottom: y + HEADER_HEIGHT,
      })
      entryTopByKey.set(key, y)
      y += HEADER_HEIGHT + HEADER_BOTTOM_GAP
      previousDay = item.day
    }

    const key = `item:${item.id}`
    entries.push({
      kind: 'item',
      key,
      id: item.id,
      day: item.day,
      label: item.label,
      color: item.color,
      top: y,
      height: ITEM_HEIGHT,
      bottom: y + ITEM_HEIGHT,
    })
    entryTopByKey.set(key, y)
    itemTopById.set(item.id, y)
    y += ITEM_HEIGHT

    const nextItem = items[index + 1]
    if (nextItem != null && nextItem.day === item.day) y += ITEM_GAP
  }

  return {
    entries,
    entryTopByKey,
    itemTopById,
    totalHeight: y,
  }
}

export function pickAnchorForScrollTop(layout: FeedLayout, scrollTop: number): ScrollAnchor | null {
  let fallbackItem: Extract<LayoutEntry, {kind: 'item'}> | null = null

  for (const entry of layout.entries) {
    if (entry.kind !== 'item') continue
    fallbackItem = entry
    if (entry.top >= scrollTop) return {id: entry.id, prevY: entry.top}
  }

  return fallbackItem == null ? null : {id: fallbackItem.id, prevY: fallbackItem.top}
}

export function resolveAnchorForRender(args: {
  layout: FeedLayout
  readScrollTop: number
  storedScrollTop: number
  explicitScrollToTop: number | null
  previousAnchor: ScrollAnchor | null
}) {
  const effectiveScrollTop = args.explicitScrollToTop ?? args.readScrollTop
  const didRebaseAnchor =
    args.explicitScrollToTop != null ||
    effectiveScrollTop !== args.storedScrollTop ||
    args.previousAnchor == null

  return {
    effectiveScrollTop,
    didRebaseAnchor,
    anchor: didRebaseAnchor
      ? pickAnchorForScrollTop(args.layout, effectiveScrollTop)
      : args.previousAnchor,
  }
}

export function adjustScrollForAnchor(
  effectiveScrollTop: number,
  anchor: ScrollAnchor | null,
  layout: FeedLayout,
) {
  if (anchor == null) {
    return {
      adjustedScrollTop: effectiveScrollTop,
      delta: 0,
      anchor: null,
    }
  }

  const nextY = layout.itemTopById.get(anchor.id)
  if (nextY == null) {
    return {
      adjustedScrollTop: effectiveScrollTop,
      delta: 0,
      anchor: null,
    }
  }

  const delta = nextY - anchor.prevY
  return {
    adjustedScrollTop: effectiveScrollTop + delta,
    delta,
    anchor: {id: anchor.id, prevY: nextY},
  }
}

export function findEntryAtY(layout: FeedLayout, y: number) {
  for (const entry of layout.entries) {
    if (entry.top <= y && y < entry.bottom) return entry
  }
  return null
}

function createDayItems(day: string, count: number, takeItemNumber: () => number) {
  const items: Item[] = []
  for (let index = 0; index < count; index++) {
    items.push(makeItem(day, takeItemNumber()))
  }
  return items
}

function makeItem(day: string, itemNumber: number): Item {
  return {
    id: `V${itemNumber}`,
    day,
    label: `#${itemNumber}`,
    color: colors[(itemNumber - 1) % colors.length]!,
  }
}
