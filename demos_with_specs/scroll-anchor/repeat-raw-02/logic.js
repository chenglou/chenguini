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

export const ITEM_HEIGHT = 100
export const HEADER_HEIGHT = 24
export const FIRST_HEADER_GAP = 0
export const LATER_HEADER_GAP = 32
export const HEADER_BOTTOM_GAP = 8
export const ITEM_GAP = 8
export const TARGET_SCROLL_TOP = 700
export const SCROLLER_HEIGHT = 520

const DAY_COUNTS = [
  ['Today', 8],
  ['Yesterday', 1],
  ['2 Days Ago', 8],
]

export function createInitialState() {
  let nextItemNumber = 1
  const items = []

  for (const [day, count] of DAY_COUNTS) {
    for (let index = 0; index < count; index++) {
      items.push(createItem(nextItemNumber, day))
      nextItemNumber += 1
    }
  }

  return {
    items,
    nextItemNumber,
  }
}

export function prependItems(state, count) {
  let nextItemNumber = state.nextItemNumber
  const newItems = []

  for (let index = 0; index < count; index++) {
    newItems.push(createItem(nextItemNumber, 'Today'))
    nextItemNumber += 1
  }

  return {
    items: [...newItems, ...state.items],
    nextItemNumber,
  }
}

export function computeLayout(items) {
  const groups = groupItemsByDay(items)
  const headers = []
  const laidOutItems = []
  const itemsById = new Map()
  let y = 0

  groups.forEach((group, groupIndex) => {
    y += groupIndex === 0 ? FIRST_HEADER_GAP : LATER_HEADER_GAP

    headers.push({
      day: group.day,
      top: y,
      height: HEADER_HEIGHT,
    })
    y += HEADER_HEIGHT + HEADER_BOTTOM_GAP

    group.items.forEach((item, itemIndex) => {
      const laidOutItem = {
        ...item,
        top: y,
        height: ITEM_HEIGHT,
      }
      laidOutItems.push(laidOutItem)
      itemsById.set(item.id, laidOutItem)

      y += ITEM_HEIGHT
      if (itemIndex < group.items.length - 1) {
        y += ITEM_GAP
      }
    })
  })

  return {
    headers,
    items: laidOutItems,
    itemsById,
    totalHeight: y,
  }
}

export function getVisibleEntries(layout, scrollTop, viewportHeight) {
  const viewportBottom = scrollTop + viewportHeight
  return {
    headers: layout.headers.filter((header) =>
      intersectsViewport(header.top, header.height, scrollTop, viewportBottom),
    ),
    items: layout.items.filter((item) =>
      intersectsViewport(item.top, item.height, scrollTop, viewportBottom),
    ),
  }
}

export function pickAnchor(layout, scrollTop) {
  if (layout.items.length === 0) {
    return null
  }

  const nextItem =
    layout.items.find((item) => item.top >= scrollTop) ??
    layout.items[layout.items.length - 1]

  return {
    id: nextItem.id,
    prevY: nextItem.top,
  }
}

export function computeRenderPlan({
  layout,
  scrollTop,
  storedScrollTop,
  anchor,
  forceAnchorRepick = false,
}) {
  const userScrolled = forceAnchorRepick || scrollTop !== storedScrollTop

  if (userScrolled) {
    return {
      userScrolled: true,
      adjustedScrollTop: scrollTop,
      anchor: pickAnchor(layout, scrollTop),
    }
  }

  if (!anchor) {
    return {
      userScrolled: false,
      adjustedScrollTop: scrollTop,
      anchor: null,
    }
  }

  const nextAnchor = { ...anchor }
  const currentAnchorItem = layout.itemsById.get(nextAnchor.id)

  if (!currentAnchorItem) {
    return {
      userScrolled: false,
      adjustedScrollTop: scrollTop,
      anchor: pickAnchor(layout, scrollTop),
    }
  }

  const adjustedScrollTop = scrollTop + (currentAnchorItem.top - nextAnchor.prevY)
  nextAnchor.prevY = currentAnchorItem.top

  return {
    userScrolled: false,
    adjustedScrollTop,
    anchor: nextAnchor,
  }
}

export function findReferenceItem(layout, scrollTop, viewportHeight) {
  const referenceY = scrollTop + viewportHeight / 2
  return (
    layout.items.find(
      (item) => item.top <= referenceY && referenceY < item.top + item.height,
    ) ?? null
  )
}

function createItem(itemNumber, day) {
  return {
    id: `V${itemNumber}`,
    day,
    label: `#${itemNumber}`,
    color: colors[(itemNumber - 1) % colors.length],
  }
}

function groupItemsByDay(items) {
  const groups = []
  const groupsByDay = new Map()

  for (const item of items) {
    let group = groupsByDay.get(item.day)
    if (!group) {
      group = {
        day: item.day,
        items: [],
      }
      groupsByDay.set(item.day, group)
      groups.push(group)
    }
    group.items.push(item)
  }

  return groups
}

function intersectsViewport(top, height, viewportTop, viewportBottom) {
  const bottom = top + height
  return bottom > viewportTop && top < viewportBottom
}
