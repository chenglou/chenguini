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
export const TARGET_SCROLL = 700
export const DEMO_VIEWPORT_HEIGHT = 520
export const DAY_ORDER = ['Today', 'Yesterday', '2 Days Ago']

export function createInitialItems() {
  const items = []
  let itemNumber = 1

  for (let i = 0; i < 8; i++) items.push(createItem(itemNumber++, 'Today'))
  items.push(createItem(itemNumber++, 'Yesterday'))
  for (let i = 0; i < 8; i++) items.push(createItem(itemNumber++, '2 Days Ago'))

  return items
}

export function prependItems(items, count, nextItemNumber = items.length + 1) {
  const prepended = []
  let itemNumber = nextItemNumber

  for (let i = 0; i < count; i++) prepended.push(createItem(itemNumber++, 'Today'))

  const todayCount = items.filter(item => item.day === 'Today').length
  return {
    items: [...prepended, ...items.slice(0, todayCount), ...items.slice(todayCount)],
    nextItemNumber: itemNumber,
  }
}

export function layoutItems(items) {
  const headers = []
  const positionedItems = []
  const itemsById = new Map()
  let top = 0

  for (let groupIndex = 0; groupIndex < DAY_ORDER.length; groupIndex++) {
    const day = DAY_ORDER[groupIndex]
    const dayItems = items.filter(item => item.day === day)
    if (dayItems.length === 0) continue

    if (headers.length > 0) top += LATER_HEADER_GAP
    headers.push({day, top})
    top += HEADER_HEIGHT + HEADER_BOTTOM_GAP

    for (let itemIndex = 0; itemIndex < dayItems.length; itemIndex++) {
      const item = dayItems[itemIndex]
      const positionedItem = {id: item.id, item, top}
      positionedItems.push(positionedItem)
      itemsById.set(item.id, positionedItem)
      top += ITEM_HEIGHT
      if (itemIndex < dayItems.length - 1) top += ITEM_GAP
    }
  }

  return {
    headers,
    positionedItems,
    itemsById,
    totalHeight: top,
  }
}

export function pickAnchor(layout, scrollTop) {
  for (const positionedItem of layout.positionedItems) {
    if (positionedItem.top >= scrollTop) return {id: positionedItem.item.id, prevY: positionedItem.top}
  }

  const lastItem = layout.positionedItems[layout.positionedItems.length - 1]
  return lastItem == null ? null : {id: lastItem.item.id, prevY: lastItem.top}
}

export function resolveScrollAnchor({
  anchor,
  layout,
  scrollTop,
  storedScrollTop,
  explicitScrollTop,
}) {
  const anchorScrollTop = explicitScrollTop ?? scrollTop
  const userScrolled = explicitScrollTop != null || scrollTop !== storedScrollTop
  let requestedScrollTop = anchorScrollTop
  let nextAnchor = anchor

  if (userScrolled || nextAnchor == null) {
    nextAnchor = pickAnchor(layout, anchorScrollTop)
  } else {
    const current = layout.itemsById.get(nextAnchor.id)
    if (current != null) {
      requestedScrollTop = scrollTop + (current.top - nextAnchor.prevY)
      nextAnchor = {id: nextAnchor.id, prevY: current.top}
    }
  }

  return {
    anchor: nextAnchor,
    requestedScrollTop,
    userScrolled,
  }
}

export function listVisibleEntries(layout, scrollTop, viewportHeight) {
  const viewportBottom = scrollTop + viewportHeight
  const visibleHeaders = layout.headers.filter(header => intersects(header.top, header.top + HEADER_HEIGHT, scrollTop, viewportBottom))
  const visibleItems = layout.positionedItems.filter(positionedItem =>
    intersects(positionedItem.top, positionedItem.top + ITEM_HEIGHT, scrollTop, viewportBottom),
  )

  return {visibleHeaders, visibleItems}
}

export function findReferenceItem(layout, scrollTop, viewportHeight) {
  const lineY = scrollTop + viewportHeight / 2
  for (const positionedItem of layout.positionedItems) {
    if (positionedItem.top <= lineY && lineY < positionedItem.top + ITEM_HEIGHT) return positionedItem.item
  }
  return null
}

export function getItemCountByDay(items) {
  return DAY_ORDER.map(day => ({
    day,
    count: items.filter(item => item.day === day).length,
  }))
}

function createItem(itemNumber, day) {
  return {
    id: `V${itemNumber}`,
    day,
    label: `#${itemNumber}`,
    color: colors[(itemNumber - 1) % colors.length],
  }
}

function intersects(top, bottom, viewportTop, viewportBottom) {
  return top < viewportBottom && bottom > viewportTop
}
