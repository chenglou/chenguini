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
export const TARGET_SCROLL = 700
export const VIEWPORT_HEIGHT = 520

/**
 * @typedef {{
 *   id: string
 *   day: string
 *   label: string
 *   color: string
 * }} Item
 */

/**
 * @typedef {{
 *   id: string
 *   prevY: number
 * }} Anchor
 */

/**
 * @typedef {{
 *   day: string
 *   y: number
 * }} HeaderLayout
 */

/**
 * @typedef {Item & {
 *   y: number
 * }} ItemLayout
 */

/**
 * @typedef {{
 *   headers: HeaderLayout[]
 *   items: ItemLayout[]
 *   totalHeight: number
 * }} Layout
 */

export function buildInitialItems() {
  return [
    ...createItems(1, 8, 'Today'),
    ...createItems(9, 1, 'Yesterday'),
    ...createItems(10, 8, '2 Days Ago'),
  ]
}

/**
 * @param {Item[]} items
 * @param {number} count
 * @returns {Item[]}
 */
export function prependItems(items, count) {
  const startNumber = getNextItemNumber(items)
  const created = createItems(startNumber, count, 'Today')
  return [...created, ...items]
}

/**
 * @param {Item[]} items
 * @returns {Layout}
 */
export function buildLayout(items) {
  /** @type {Map<string, Item[]>} */
  const groups = new Map()
  for (const item of items) {
    const group = groups.get(item.day)
    if (group) {
      group.push(item)
    } else {
      groups.set(item.day, [item])
    }
  }

  /** @type {HeaderLayout[]} */
  const headers = []
  /** @type {ItemLayout[]} */
  const laidOutItems = []

  let y = 0
  let isFirstGroup = true
  for (const [day, groupItems] of groups) {
    y += isFirstGroup ? FIRST_HEADER_GAP : LATER_HEADER_GAP
    headers.push({day, y})
    y += HEADER_HEIGHT + HEADER_BOTTOM_GAP

    for (let index = 0; index < groupItems.length; index += 1) {
      const item = groupItems[index]
      laidOutItems.push({...item, y})
      y += ITEM_HEIGHT
      if (index < groupItems.length - 1) {
        y += ITEM_GAP
      }
    }

    isFirstGroup = false
  }

  return {
    headers,
    items: laidOutItems,
    totalHeight: y,
  }
}

/**
 * @param {ItemLayout[]} items
 * @param {number} scrollTop
 * @returns {Anchor | null}
 */
export function pickAnchor(items, scrollTop) {
  for (const item of items) {
    if (item.y >= scrollTop) {
      return {id: item.id, prevY: item.y}
    }
  }

  const lastItem = items.at(-1)
  return lastItem ? {id: lastItem.id, prevY: lastItem.y} : null
}

/**
 * @param {number} scrollTop
 * @param {Anchor | null} anchor
 * @param {ItemLayout[]} items
 * @returns {number}
 */
export function adjustAnchorScrollTop(scrollTop, anchor, items) {
  if (!anchor) {
    return scrollTop
  }

  const currentItem = items.find((item) => item.id === anchor.id)
  if (!currentItem) {
    return scrollTop
  }

  const adjustedScrollTop = scrollTop + (currentItem.y - anchor.prevY)
  anchor.prevY = currentItem.y
  return adjustedScrollTop
}

/**
 * @param {ItemLayout[]} items
 * @param {number} y
 * @returns {ItemLayout | null}
 */
export function findItemAtY(items, y) {
  for (const item of items) {
    if (y >= item.y && y < item.y + ITEM_HEIGHT) {
      return item
    }
  }

  return null
}

/**
 * @param {number} startNumber
 * @param {number} count
 * @param {string} day
 * @returns {Item[]}
 */
function createItems(startNumber, count, day) {
  return Array.from({length: count}, (_, index) => {
    const number = startNumber + index
    return {
      id: `V${number}`,
      day,
      label: `#${number}`,
      color: colors[(number - 1) % colors.length],
    }
  })
}

/**
 * @param {Item[]} items
 * @returns {number}
 */
function getNextItemNumber(items) {
  let highestNumber = 0
  for (const item of items) {
    highestNumber = Math.max(highestNumber, Number(item.id.slice(1)))
  }
  return highestNumber + 1
}
