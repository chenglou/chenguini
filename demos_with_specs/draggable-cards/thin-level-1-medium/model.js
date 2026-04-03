export const CARD_WIDTH = 320;
export const CARD_COUNT = 5;
export const TOP_PADDING = 50;
export const DRAG_SCALE = 1.1;
export const DRAG_OPACITY = 0.7;
export const MS_PER_ANIMATION_STEP = 6;

export function hash(n) {
  n = Math.imul((n >>> 16) ^ n, 0x21f0aaad);
  n = Math.imul((n >>> 15) ^ n, 0x735a2d97);
  return (((n >>> 15) ^ n) >>> 0) / 0x100000000;
}

export function getCardHeight(cardId) {
  return 30 + hash(cardId * 2) * 150;
}

export function getCardLightness(cardId) {
  return hash(cardId * 2 + 1) * 40 + 40;
}

export function createOrderedCardIds() {
  return Array.from({ length: CARD_COUNT }, (_, cardId) => cardId);
}

export function getCardLayouts(orderedCardIds) {
  const layouts = new Map();
  let y = TOP_PADDING;

  for (const cardId of orderedCardIds) {
    const height = getCardHeight(cardId);
    layouts.set(cardId, { y, height, midpoint: y + height / 2 });
    y += height;
  }

  return layouts;
}

export function reorderByPointerMidpoint(orderedCardIds, draggedCardId, pointerY) {
  const remainingCardIds = orderedCardIds.filter((cardId) => cardId !== draggedCardId);
  const layouts = getCardLayouts(remainingCardIds);

  let insertAt = 0;
  for (const cardId of remainingCardIds) {
    const layout = layouts.get(cardId);
    if (layout != null && pointerY >= layout.midpoint) insertAt += 1;
  }

  const reorderedCardIds = remainingCardIds.slice();
  reorderedCardIds.splice(insertAt, 0, draggedCardId);
  return reorderedCardIds;
}

export function estimateReleaseVelocity(pointerHistory, now) {
  if (pointerHistory.length < 2) return { vx: 0, vy: 0 };

  const latestPoint = pointerHistory[pointerHistory.length - 1];
  let anchorPoint = pointerHistory[0];

  for (let index = pointerHistory.length - 2; index >= 0; index -= 1) {
    const point = pointerHistory[index];
    if (now - point.time <= 100) anchorPoint = point;
    else break;
  }

  const elapsed = latestPoint.time - anchorPoint.time;
  if (elapsed <= 0) return { vx: 0, vy: 0 };

  return {
    vx: ((latestPoint.x - anchorPoint.x) / elapsed) * 1000,
    vy: ((latestPoint.y - anchorPoint.y) / elapsed) * 1000,
  };
}

export function cardZIndex(orderedCardIds, draggedCardId, lastDraggedCardId, cardId) {
  if (draggedCardId === cardId) return 300;
  if (draggedCardId == null && lastDraggedCardId === cardId) return 200;
  return 10 + orderedCardIds.indexOf(cardId);
}
