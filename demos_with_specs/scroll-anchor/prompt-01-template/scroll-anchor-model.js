export const COLORS = [
  '#c0392b', '#2980b9', '#27ae60', '#8e44ad',
  '#d35400', '#16a085', '#2c3e50', '#f39c12',
]

export const DAY_ORDER = ['Today', 'Yesterday', '2 Days Ago']

export const ITEM_HEIGHT = 100
export const HEADER_HEIGHT = 24
export const FIRST_HEADER_GAP = 0
export const LATER_HEADER_GAP = 32
export const HEADER_BOTTOM_GAP = 8
export const ITEM_GAP = 8
export const TARGET_SCROLL = 700

export function createInitialState() {
  const items = []
  let nextId = 1

  nextId = pushItems(items, nextId, 'Today', 8)
  nextId = pushItems(items, nextId, 'Yesterday', 1)
  nextId = pushItems(items, nextId, '2 Days Ago', 8)

  return {items, nextId}
}

export function prependItems(items, nextId, count) {
  const prepended = []
  const endId = pushItems(prepended, nextId, 'Today', count)
  return {
    items: [...prepended, ...items],
    nextId: endId,
  }
}

export function layoutEntries(items) {
  const entries = []
  const itemTops = new Map()
  let y = 0
  let firstGroup = true

  for (const day of DAY_ORDER) {
    const dayItems = items.filter(item => item.day === day)
    if (dayItems.length === 0) continue

    y += firstGroup ? FIRST_HEADER_GAP : LATER_HEADER_GAP
    entries.push({
      day,
      height: HEADER_HEIGHT,
      key: `header:${day}`,
      kind: 'header',
      y,
    })
    y += HEADER_HEIGHT + HEADER_BOTTOM_GAP

    for (let index = 0; index < dayItems.length; index++) {
      const item = dayItems[index]
      entries.push({
        ...item,
        height: ITEM_HEIGHT,
        kind: 'item',
        y,
      })
      itemTops.set(item.id, y)
      y += ITEM_HEIGHT
      if (index < dayItems.length - 1) y += ITEM_GAP
    }

    firstGroup = false
  }

  return {
    entries,
    itemTops,
    totalHeight: y,
  }
}

export function pickAnchor(layout, scrollTop) {
  let lastItem = null

  for (const entry of layout.entries) {
    if (entry.kind !== 'item') continue
    lastItem = entry
    if (entry.y >= scrollTop) {
      return {
        itemId: entry.id,
        prevY: entry.y,
      }
    }
  }

  return lastItem == null ? null : {itemId: lastItem.id, prevY: lastItem.y}
}

export function applyAnchorAdjustment({anchor, layout, scrollTop, storedScrollTop}) {
  const userScrolled = Math.abs(scrollTop - storedScrollTop) > 0.001
  if (userScrolled) {
    return {
      adjustment: 0,
      anchor: pickAnchor(layout, scrollTop),
      scrollTop,
      userScrolled: true,
    }
  }

  if (anchor == null) {
    return {
      adjustment: 0,
      anchor: pickAnchor(layout, scrollTop),
      scrollTop,
      userScrolled: false,
    }
  }

  const currentY = layout.itemTops.get(anchor.itemId)
  if (currentY == null) {
    return {
      adjustment: 0,
      anchor: pickAnchor(layout, scrollTop),
      scrollTop,
      userScrolled: false,
    }
  }

  const adjustment = currentY - anchor.prevY
  return {
    adjustment,
    anchor: {
      itemId: anchor.itemId,
      prevY: currentY,
    },
    scrollTop: scrollTop + adjustment,
    userScrolled: false,
  }
}

export function findItemAtReferenceLine(layout, scrollTop, viewportHeight) {
  const worldY = scrollTop + viewportHeight / 2

  for (const entry of layout.entries) {
    if (entry.kind !== 'item') continue
    if (entry.y <= worldY && worldY < entry.y + ITEM_HEIGHT) {
      return {
        itemId: entry.id,
        offsetWithinItem: worldY - entry.y,
      }
    }
  }

  return null
}

export function getVisibleEntries(layout, scrollTop, viewportHeight) {
  const top = scrollTop
  const bottom = scrollTop + viewportHeight

  return layout.entries.filter(entry => entry.y + entry.height > top && entry.y < bottom)
}

function pushItems(items, nextId, day, count) {
  let id = nextId
  for (let index = 0; index < count; index++) {
    items.push(makeItem(id, day))
    id += 1
  }
  return id
}

function makeItem(n, day) {
  return {
    color: COLORS[(n - 1) % COLORS.length],
    day,
    id: `V${n}`,
    label: `#${n}`,
  }
}
