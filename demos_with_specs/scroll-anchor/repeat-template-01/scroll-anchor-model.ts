export type Item = {
  id: string
  day: string
  label: string
  color: string
}

export type DemoState = {
  items: Item[]
  nextItemNumber: number
}

export type HeaderLayout = {
  day: string
  top: number
  height: number
}

export type PositionedItem = Item & {
  top: number
  height: number
  bottom: number
}

export type LayoutResult = {
  headers: HeaderLayout[]
  items: PositionedItem[]
  totalHeight: number
}

export type Anchor = {
  itemId: string
  prevY: number
}

export type ReconcileAnchorArgs = {
  readScrollTop: number
  storedScrollTop: number
  anchor: Anchor | null
  itemLayouts: PositionedItem[]
  explicitScrollTop?: number
}

export type ReconcileAnchorResult = {
  userScrolled: boolean
  requestedScrollTop: number
  anchor: Anchor | null
}

export const ITEM_HEIGHT = 100
export const HEADER_HEIGHT = 24
export const FIRST_HEADER_GAP = 0
export const LATER_HEADER_GAP = 32
export const HEADER_BOTTOM_GAP = 8
export const ITEM_GAP = 8
export const TARGET_SCROLL_TOP = 700
export const DAY_ORDER = ['Today', 'Yesterday', '2 Days Ago'] as const
export const colors = [
  '#c0392b', '#2980b9', '#27ae60', '#8e44ad',
  '#d35400', '#16a085', '#2c3e50', '#f39c12',
]

export function createInitialState(): DemoState {
  let nextItemNumber = 1
  const items: Item[] = []

  for (const [day, count] of [['Today', 8], ['Yesterday', 1], ['2 Days Ago', 8]] as const) {
    for (let i = 0; i < count; i++) {
      items.push(createItem(nextItemNumber, day))
      nextItemNumber += 1
    }
  }

  return {items, nextItemNumber}
}

export function prependItems(state: DemoState, count: number): DemoState {
  const prepended: Item[] = []
  let nextItemNumber = state.nextItemNumber

  for (let i = 0; i < count; i++) {
    prepended.push(createItem(nextItemNumber, 'Today'))
    nextItemNumber += 1
  }

  const firstNonTodayIndex = state.items.findIndex(item => item.day !== 'Today')
  if (firstNonTodayIndex === -1) {
    return {
      items: [...prepended, ...state.items],
      nextItemNumber,
    }
  }

  return {
    items: [
      ...prepended,
      ...state.items.slice(0, firstNonTodayIndex),
      ...state.items.slice(firstNonTodayIndex),
    ],
    nextItemNumber,
  }
}

export function layoutItems(items: Item[]): LayoutResult {
  const groups = new Map<string, Item[]>()
  for (const day of DAY_ORDER) groups.set(day, [])
  for (const item of items) groups.get(item.day)?.push(item)

  const headers: HeaderLayout[] = []
  const laidOutItems: PositionedItem[] = []
  let y = 0

  DAY_ORDER.forEach((day, dayIndex) => {
    const groupItems = groups.get(day) ?? []
    if (groupItems.length === 0) return

    y += dayIndex === 0 ? FIRST_HEADER_GAP : LATER_HEADER_GAP
    headers.push({day, top: y, height: HEADER_HEIGHT})
    y += HEADER_HEIGHT + HEADER_BOTTOM_GAP

    for (let i = 0; i < groupItems.length; i++) {
      const item = groupItems[i]!
      laidOutItems.push({
        ...item,
        top: y,
        height: ITEM_HEIGHT,
        bottom: y + ITEM_HEIGHT,
      })
      y += ITEM_HEIGHT
      if (i < groupItems.length - 1) y += ITEM_GAP
    }
  })

  return {
    headers,
    items: laidOutItems,
    totalHeight: y,
  }
}

export function pickAnchor(items: PositionedItem[], scrollTop: number): Anchor | null {
  if (items.length === 0) return null
  const item = items.find(candidate => candidate.top >= scrollTop) ?? items[items.length - 1]!
  return {
    itemId: item.id,
    prevY: item.top,
  }
}

export function reconcileAnchor({
  readScrollTop,
  storedScrollTop,
  anchor,
  itemLayouts,
  explicitScrollTop,
}: ReconcileAnchorArgs): ReconcileAnchorResult {
  const requestedScrollTop = explicitScrollTop ?? readScrollTop
  const userScrolled = explicitScrollTop != null || readScrollTop !== storedScrollTop

  if (userScrolled) {
    return {
      userScrolled,
      requestedScrollTop,
      anchor: pickAnchor(itemLayouts, requestedScrollTop),
    }
  }

  if (anchor == null) {
    return {
      userScrolled,
      requestedScrollTop,
      anchor: pickAnchor(itemLayouts, requestedScrollTop),
    }
  }

  const anchorItem = itemLayouts.find(item => item.id === anchor.itemId)
  if (anchorItem == null) {
    return {
      userScrolled,
      requestedScrollTop,
      anchor: pickAnchor(itemLayouts, requestedScrollTop),
    }
  }

  return {
    userScrolled,
    requestedScrollTop: readScrollTop + (anchorItem.top - anchor.prevY),
    anchor: {
      itemId: anchor.itemId,
      prevY: anchorItem.top,
    },
  }
}

export function findItemAtViewportY(
  items: PositionedItem[],
  scrollTop: number,
  localViewportY: number,
): PositionedItem | null {
  const y = scrollTop + localViewportY
  return items.find(item => item.top <= y && y < item.bottom) ?? null
}

export function isVisible(top: number, height: number, scrollTop: number, viewportHeight: number) {
  return top < scrollTop + viewportHeight && top + height > scrollTop
}

function createItem(itemNumber: number, day: string): Item {
  return {
    id: `V${itemNumber}`,
    day,
    label: `#${itemNumber}`,
    color: colors[(itemNumber - 1) % colors.length]!,
  }
}
