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
export const VIEWPORT_HEIGHT = 360;

const DAY_ORDER = ["Today", "Yesterday", "2 Days Ago"];
const INITIAL_COUNTS = [
  ["Today", 8],
  ["Yesterday", 1],
  ["2 Days Ago", 8],
];

export function createInitialItems() {
  const items = [];
  let itemNumber = 0;

  for (const [day, count] of INITIAL_COUNTS) {
    for (let index = 0; index < count; index += 1) {
      itemNumber += 1;
      items.push(createItem(itemNumber, day));
    }
  }

  return items;
}

export function prependItemsAbove(items, count) {
  let itemNumber = getHighestItemNumber(items);
  const prependedItems = [];

  for (let index = 0; index < count; index += 1) {
    itemNumber += 1;
    prependedItems.push(createItem(itemNumber, "Today"));
  }

  return [...prependedItems, ...items];
}

export function buildLayout(items) {
  const headers = [];
  const layoutItems = [];
  const byId = new Map();
  const groups = groupItems(items);
  let y = 0;

  for (let groupIndex = 0; groupIndex < groups.length; groupIndex += 1) {
    const group = groups[groupIndex];
    if (!group.items.length) {
      continue;
    }

    y += groupIndex === 0 ? FIRST_HEADER_GAP : LATER_HEADER_GAP;
    headers.push({ day: group.day, y });
    y += HEADER_HEIGHT + HEADER_BOTTOM_GAP;

    for (let itemIndex = 0; itemIndex < group.items.length; itemIndex += 1) {
      const item = group.items[itemIndex];
      const layoutItem = { ...item, y };
      layoutItems.push(layoutItem);
      byId.set(item.id, layoutItem);
      y += ITEM_HEIGHT;
      if (itemIndex < group.items.length - 1) {
        y += ITEM_GAP;
      }
    }
  }

  return {
    headers,
    items: layoutItems,
    byId,
    totalHeight: y,
  };
}

export function computeAnchorFrame({
  layout,
  scrollTop,
  storedScrollTop,
  anchor,
}) {
  const userScrolled = scrollTop !== storedScrollTop;

  if (userScrolled) {
    return {
      userScrolled,
      adjustedScrollTop: scrollTop,
      anchor: pickAnchor(layout, scrollTop),
    };
  }

  if (!anchor) {
    return {
      userScrolled,
      adjustedScrollTop: scrollTop,
      anchor: pickAnchor(layout, scrollTop),
    };
  }

  const anchorItem = layout.byId.get(anchor.id);
  if (!anchorItem) {
    return {
      userScrolled,
      adjustedScrollTop: scrollTop,
      anchor: pickAnchor(layout, scrollTop),
    };
  }

  const adjustedScrollTop = scrollTop + (anchorItem.y - anchor.prevY);

  return {
    userScrolled,
    adjustedScrollTop,
    anchor: {
      id: anchor.id,
      prevY: anchorItem.y,
    },
  };
}

export function pickAnchor(layout, scrollTop) {
  for (const item of layout.items) {
    if (item.y + ITEM_HEIGHT > scrollTop) {
      return { id: item.id, prevY: item.y };
    }
  }

  const lastItem = layout.items.at(-1);
  if (!lastItem) {
    return null;
  }

  return { id: lastItem.id, prevY: lastItem.y };
}

export function getVisibleEntries(layout, scrollTop, viewportHeight) {
  const visibleTop = scrollTop;
  const visibleBottom = scrollTop + viewportHeight;

  return {
    headers: layout.headers.filter((header) =>
      rectIntersects(header.y, HEADER_HEIGHT, visibleTop, visibleBottom),
    ),
    items: layout.items.filter((item) =>
      rectIntersects(item.y, ITEM_HEIGHT, visibleTop, visibleBottom),
    ),
  };
}

export function getReferenceItemId(layout, scrollTop, viewportHeight) {
  const referenceY = scrollTop + viewportHeight / 2;
  for (const item of layout.items) {
    if (referenceY >= item.y && referenceY < item.y + ITEM_HEIGHT) {
      return item.id;
    }
  }
  return null;
}

function createItem(itemNumber, day) {
  return {
    id: `V${itemNumber}`,
    day,
    label: `#${itemNumber}`,
    color: colors[(itemNumber - 1) % colors.length],
  };
}

function getHighestItemNumber(items) {
  let highest = 0;
  for (const item of items) {
    const itemNumber = Number(item.id.slice(1));
    if (itemNumber > highest) {
      highest = itemNumber;
    }
  }
  return highest;
}

function groupItems(items) {
  return DAY_ORDER.map((day) => ({
    day,
    items: items.filter((item) => item.day === day),
  }));
}

function rectIntersects(y, height, visibleTop, visibleBottom) {
  return y < visibleBottom && y + height > visibleTop;
}
