export const ITEM_HEIGHT = 100
export const HEADER_HEIGHT = 24
export const FIRST_HEADER_GAP = 0
export const LATER_HEADER_GAP = 32
export const HEADER_BOTTOM_GAP = 8
export const ITEM_GAP = 8
export const SCROLL_TARGET = 700
export const VIEWPORT_HEIGHT = 600
export const INITIAL_ITEM_COUNT = 17

export const colors = [
  '#c0392b',
  '#2980b9',
  '#27ae60',
  '#8e44ad',
  '#d35400',
  '#16a085',
  '#2c3e50',
  '#f39c12',
]

export const dayOrder = ['Today', 'Yesterday', '2 Days Ago']

/**
 * @typedef {{ id: string, day: string, label: string, color: string }} Item
 * @typedef {{ day: string, y: number, height: number }} HeaderEntry
 * @typedef {{ id: string, day: string, label: string, color: string, y: number, height: number }} ItemEntry
 * @typedef {{ headers: HeaderEntry[], items: ItemEntry[], totalHeight: number }} Layout
 * @typedef {{ id: string, prevY: number } | null} Anchor
 */

export function buildInitialItems() {
  /** @type {Item[]} */
  const items = []
  let nextCounter = 0

  for (const [day, count] of [
    ['Today', 8],
    ['Yesterday', 1],
    ['2 Days Ago', 8],
  ]) {
    for (let index = 0; index < count; index += 1) {
      nextCounter += 1
      items.push(createItem(nextCounter, day))
    }
  }

  return items
}

export function createItem(counter, day) {
  const color = colors[(counter - 1) % colors.length]
  return {
    id: `V${counter}`,
    day,
    label: `#${counter}`,
    color,
  }
}

export function prependItemsAbove(items, nextCounter, count) {
  const prepended = []
  let counter = nextCounter

  for (let index = 0; index < count; index += 1) {
    counter += 1
    prepended.push(createItem(counter, 'Today'))
  }

  return {
    items: [...prepended, ...items],
    nextCounter: counter,
  }
}

export function buildLayout(items) {
  /** @type {Map<string, Item[]>} */
  const groupedItems = new Map(dayOrder.map((day) => [day, []]))
  for (const item of items) {
    if (!groupedItems.has(item.day)) {
      groupedItems.set(item.day, [])
    }
    groupedItems.get(item.day).push(item)
  }

  /** @type {HeaderEntry[]} */
  const headers = []
  /** @type {ItemEntry[]} */
  const itemEntries = []
  let y = 0
  let isFirstGroup = true

  for (const day of dayOrder) {
    const dayItems = groupedItems.get(day) ?? []
    if (dayItems.length === 0) {
      continue
    }

    y += isFirstGroup ? FIRST_HEADER_GAP : LATER_HEADER_GAP
    headers.push({ day, y, height: HEADER_HEIGHT })
    y += HEADER_HEIGHT + HEADER_BOTTOM_GAP

    dayItems.forEach((item, index) => {
      itemEntries.push({
        ...item,
        y,
        height: ITEM_HEIGHT,
      })
      y += ITEM_HEIGHT
      if (index < dayItems.length - 1) {
        y += ITEM_GAP
      }
    })

    isFirstGroup = false
  }

  return {
    headers,
    items: itemEntries,
    totalHeight: y,
  }
}

export function pickAnchor(itemEntries, scrollTop) {
  const entry = itemEntries.find((item) => item.y >= scrollTop)
  if (entry == null) {
    return null
  }

  return {
    id: entry.id,
    prevY: entry.y,
  }
}

export function resolveScrollAnchor({
  layout,
  scrollTop,
  storedScrollTop,
  explicitScrollTop,
  anchor,
}) {
  const didScroll = explicitScrollTop != null || scrollTop !== storedScrollTop
  const baseScrollTop = explicitScrollTop ?? scrollTop

  if (didScroll) {
    return {
      adjustedScrollTop: baseScrollTop,
      anchor: pickAnchor(layout.items, baseScrollTop),
      didScroll,
    }
  }

  if (anchor == null) {
    return {
      adjustedScrollTop: baseScrollTop,
      anchor,
      didScroll,
    }
  }

  const currentEntry = layout.items.find((item) => item.id === anchor.id)
  if (currentEntry == null) {
    return {
      adjustedScrollTop: baseScrollTop,
      anchor: null,
      didScroll,
    }
  }

  const adjustedScrollTop = baseScrollTop + (currentEntry.y - anchor.prevY)
  return {
    adjustedScrollTop,
    anchor: {
      id: anchor.id,
      prevY: currentEntry.y,
    },
    didScroll,
  }
}

export function collectVisibleEntries(layout, { scrollTop, viewportHeight, overscan = 160 }) {
  const minY = scrollTop - overscan
  const maxY = scrollTop + viewportHeight + overscan

  return {
    headers: layout.headers.filter((entry) => intersects(entry.y, entry.height, minY, maxY)),
    items: layout.items.filter((entry) => intersects(entry.y, entry.height, minY, maxY)),
  }
}

export function findReferenceItem(layout, scrollTop, viewportHeight) {
  const referenceY = scrollTop + viewportHeight / 2
  return layout.items.find(
    (entry) => entry.y <= referenceY && referenceY < entry.y + entry.height,
  ) ?? null
}

function intersects(top, height, minY, maxY) {
  const bottom = top + height
  return bottom > minY && top < maxY
}
