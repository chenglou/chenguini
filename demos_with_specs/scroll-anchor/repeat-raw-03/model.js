/**
 * @typedef {{
 *   id: string;
 *   day: string;
 *   label: string;
 *   color: string;
 * }} Item
 */

/**
 * @typedef {{
 *   items: Item[];
 *   nextItemNumber: number;
 * }} DemoState
 */

/**
 * @typedef {{
 *   id: string;
 *   day: string;
 *   label: string;
 *   color: string;
 *   y: number;
 * }} PositionedItem
 */

/**
 * @typedef {{
 *   day: string;
 *   y: number;
 * }} PositionedHeader
 */

/**
 * @typedef {{
 *   headers: PositionedHeader[];
 *   items: PositionedItem[];
 *   itemPositions: Map<string, PositionedItem>;
 *   totalHeight: number;
 * }} LayoutResult
 */

/**
 * @typedef {{
 *   id: string;
 *   prevY: number;
 * }} ScrollAnchor
 */

export const colors = [
  "#c0392b",
  "#2980b9",
  "#27ae60",
  "#8e44ad",
  "#d35400",
  "#16a085",
  "#2c3e50",
  "#f39c12",
];

export const ITEM_HEIGHT = 100;
export const HEADER_HEIGHT = 24;
export const FIRST_HEADER_GAP = 0;
export const LATER_HEADER_GAP = 32;
export const HEADER_BOTTOM_GAP = 8;
export const ITEM_GAP = 8;
export const TARGET_SCROLL_TOP = 700;
export const VIEWPORT_HEIGHT = 560;

/**
 * @returns {DemoState}
 */
export function createInitialState() {
  const items = [];
  let nextItemNumber = 1;

  for (const [day, count] of [
    ["Today", 8],
    ["Yesterday", 1],
    ["2 Days Ago", 8],
  ]) {
    for (let index = 0; index < count; index += 1) {
      items.push(createItem(nextItemNumber, day));
      nextItemNumber += 1;
    }
  }

  return { items, nextItemNumber };
}

/**
 * @param {DemoState} state
 * @param {number} count
 * @returns {DemoState}
 */
export function prependItems(state, count) {
  const prependedItems = [];
  let nextItemNumber = state.nextItemNumber;

  for (let index = 0; index < count; index += 1) {
    prependedItems.push(createItem(nextItemNumber, "Today"));
    nextItemNumber += 1;
  }

  return {
    items: [...prependedItems, ...state.items],
    nextItemNumber,
  };
}

/**
 * @param {Item[]} items
 * @returns {LayoutResult}
 */
export function computeLayout(items) {
  /** @type {Map<string, Item[]>} */
  const itemsByDay = new Map();
  /** @type {string[]} */
  const dayOrder = [];

  for (const item of items) {
    if (!itemsByDay.has(item.day)) {
      itemsByDay.set(item.day, []);
      dayOrder.push(item.day);
    }
    itemsByDay.get(item.day).push(item);
  }

  /** @type {PositionedHeader[]} */
  const headers = [];
  /** @type {PositionedItem[]} */
  const positionedItems = [];
  /** @type {Map<string, PositionedItem>} */
  const itemPositions = new Map();

  let y = 0;

  for (let dayIndex = 0; dayIndex < dayOrder.length; dayIndex += 1) {
    const day = dayOrder[dayIndex];
    const dayItems = itemsByDay.get(day) ?? [];

    y += dayIndex === 0 ? FIRST_HEADER_GAP : LATER_HEADER_GAP;
    headers.push({ day, y });
    y += HEADER_HEIGHT + HEADER_BOTTOM_GAP;

    for (let itemIndex = 0; itemIndex < dayItems.length; itemIndex += 1) {
      const item = dayItems[itemIndex];
      const positionedItem = {
        ...item,
        y,
      };
      positionedItems.push(positionedItem);
      itemPositions.set(item.id, positionedItem);
      y += ITEM_HEIGHT;
      if (itemIndex < dayItems.length - 1) {
        y += ITEM_GAP;
      }
    }
  }

  return {
    headers,
    items: positionedItems,
    itemPositions,
    totalHeight: y,
  };
}

/**
 * @param {{
 *   currentScrollTop: number;
 *   storedScrollTop: number;
 *   explicitScroll: boolean;
 *   anchor: ScrollAnchor | null;
 *   itemPositions: Map<string, PositionedItem>;
 * }} params
 */
export function computeScrollStep({
  currentScrollTop,
  storedScrollTop,
  explicitScroll,
  anchor,
  itemPositions,
}) {
  const userScrolled = explicitScroll || currentScrollTop !== storedScrollTop;

  if (userScrolled || !anchor || !itemPositions.has(anchor.id)) {
    return {
      userScrolled,
      adjustedScrollTop: currentScrollTop,
      anchor: pickAnchor(itemPositions, currentScrollTop),
    };
  }

  const currentAnchor = itemPositions.get(anchor.id);
  const adjustedScrollTop = currentScrollTop + (currentAnchor.y - anchor.prevY);

  return {
    userScrolled: false,
    adjustedScrollTop,
    anchor: {
      id: anchor.id,
      prevY: currentAnchor.y,
    },
  };
}

/**
 * @param {Map<string, PositionedItem>} itemPositions
 * @param {number} scrollTop
 * @returns {ScrollAnchor | null}
 */
export function pickAnchor(itemPositions, scrollTop) {
  const items = [...itemPositions.values()];
  const anchorItem =
    items.find((item) => item.y >= scrollTop) ?? items[items.length - 1] ?? null;

  if (!anchorItem) {
    return null;
  }

  return {
    id: anchorItem.id,
    prevY: anchorItem.y,
  };
}

/**
 * @param {LayoutResult} layout
 * @param {number} scrollTop
 * @param {number} viewportHeight
 */
export function getVisibleLayout(layout, scrollTop, viewportHeight) {
  const viewportBottom = scrollTop + viewportHeight;

  return {
    headers: layout.headers.filter((header) =>
      rangesIntersect(
        header.y,
        header.y + HEADER_HEIGHT,
        scrollTop,
        viewportBottom,
      ),
    ),
    items: layout.items.filter((item) =>
      rangesIntersect(item.y, item.y + ITEM_HEIGHT, scrollTop, viewportBottom),
    ),
  };
}

/**
 * @param {LayoutResult} layout
 * @param {number} scrollTop
 * @param {number} viewportHeight
 * @returns {PositionedItem | null}
 */
export function findReferenceItem(layout, scrollTop, viewportHeight) {
  const referenceY = scrollTop + viewportHeight / 2;
  return (
    layout.items.find(
      (item) => referenceY >= item.y && referenceY < item.y + ITEM_HEIGHT,
    ) ?? null
  );
}

/**
 * @param {number} itemNumber
 * @param {string} day
 * @returns {Item}
 */
function createItem(itemNumber, day) {
  return {
    id: `V${itemNumber}`,
    day,
    label: `#${itemNumber}`,
    color: colors[(itemNumber - 1) % colors.length],
  };
}

/**
 * @param {number} startA
 * @param {number} endA
 * @param {number} startB
 * @param {number} endB
 */
function rangesIntersect(startA, endA, startB, endB) {
  return endA > startB && startA < endB;
}
