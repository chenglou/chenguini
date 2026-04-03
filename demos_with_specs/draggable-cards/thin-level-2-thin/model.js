export const CARD_COUNT = 5
export const CARD_WIDTH = 320
export const ROW_SIZE_X = CARD_WIDTH
export const TOP_PADDING = 50
export const POINTER_HISTORY_WINDOW_MS = 100
export const MS_PER_ANIMATION_STEP = 6
export const MAX_ANIMATION_STEPS = 300

const X_STIFFNESS = 320
const X_DAMPING = 28
const Y_STIFFNESS = 420
const Y_DAMPING = 34

export function hash(n) {
  n = Math.imul((n >>> 16) ^ n, 0x21f0aaad)
  n = Math.imul((n >>> 15) ^ n, 0x735a2d97)
  return (((n >>> 15) ^ n) >>> 0) / 0x100000000
}

export function computeCards(count = CARD_COUNT) {
  return Array.from({ length: count }, (_, index) => ({
    id: `card-${index}`,
    index,
    sizeY: 30 + hash(index * 2) * 150,
    lightnessBase: hash(index * 2 + 1) * 40 + 40,
  }))
}

export function centeredXForWindow(windowWidth) {
  return (windowWidth - ROW_SIZE_X) / 2
}

export function draggedXForPointer(pointerX, deltaX, windowWidth) {
  const rawX = pointerX - deltaX
  const centeredX = centeredXForWindow(windowWidth)
  return rawX + (centeredX - rawX) / 1.5
}

export function slotTopByCardId(cards, orderedCardIds) {
  const heightByCardId = new Map(cards.map((card) => [card.id, card.sizeY]))
  const topByCardId = new Map()
  let cursorY = TOP_PADDING

  for (const cardId of orderedCardIds) {
    topByCardId.set(cardId, cursorY)
    cursorY += heightByCardId.get(cardId) ?? 0
  }

  return topByCardId
}

export function computeLayoutTargets(cards, orderedCardIds, windowWidth) {
  const topByCardId = slotTopByCardId(cards, orderedCardIds)
  const centeredX = centeredXForWindow(windowWidth)
  const targetByCardId = new Map()
  let totalHeight = TOP_PADDING

  for (const card of cards) {
    totalHeight += card.sizeY
    targetByCardId.set(card.id, {
      x: centeredX,
      y: topByCardId.get(card.id) ?? TOP_PADDING,
    })
  }

  return {
    centeredX,
    targetByCardId,
    totalHeight,
  }
}

export function reorderByDraggedCenter(cards, orderedCardIds, draggedCardId, draggedCenterY) {
  const heightByCardId = new Map(cards.map((card) => [card.id, card.sizeY]))
  const topByCardId = slotTopByCardId(cards, orderedCardIds)
  const withoutDraggedCard = orderedCardIds.filter((cardId) => cardId !== draggedCardId)
  let insertAt = 0

  while (insertAt < withoutDraggedCard.length) {
    const cardId = withoutDraggedCard[insertAt]
    const midpointY = (topByCardId.get(cardId) ?? TOP_PADDING) + (heightByCardId.get(cardId) ?? 0) / 2
    if (draggedCenterY < midpointY) break
    insertAt += 1
  }

  const reordered = withoutDraggedCard.slice()
  reordered.splice(insertAt, 0, draggedCardId)
  return reordered
}

export function pushPointerSample(history, sample) {
  const trimmedHistory = history.filter((entry) => sample.time - entry.time <= POINTER_HISTORY_WINDOW_MS * 2)
  trimmedHistory.push(sample)
  return trimmedHistory
}

export function estimateReleaseVelocity(history, now) {
  if (history.length < 2) {
    return { x: 0, y: 0 }
  }

  const last = history[history.length - 1]
  const cutoffTime = now - POINTER_HISTORY_WINDOW_MS
  let firstRecent = history[0]

  for (let index = 0; index < history.length; index += 1) {
    if (history[index].time >= cutoffTime) {
      firstRecent = history[index]
      break
    }
  }

  const deltaTime = Math.max(last.time - firstRecent.time, 1)
  return {
    x: ((last.x - firstRecent.x) / deltaTime) * 1000,
    y: ((last.y - firstRecent.y) / deltaTime) * 1000,
  }
}

export function createMotion(position) {
  return {
    pos: position,
    dest: position,
    v: 0,
  }
}

export function stepMotion(motion, axis, steps) {
  const stiffness = axis === 'x' ? X_STIFFNESS : Y_STIFFNESS
  const damping = axis === 'x' ? X_DAMPING : Y_DAMPING
  const dt = MS_PER_ANIMATION_STEP / 1000

  for (let step = 0; step < steps; step += 1) {
    const force = -stiffness * (motion.pos - motion.dest) - damping * motion.v
    motion.v += force * dt
    motion.pos += motion.v * dt
  }
}

export function motionMostlyDone(motion) {
  return Math.abs(motion.v) < 1 && Math.abs(motion.dest - motion.pos) < 0.5
}

export function cardZIndex(orderedCardIds, activeDragCardId, lastReleasedCardId, cardId) {
  if (activeDragCardId === cardId) return 300
  if (activeDragCardId == null && lastReleasedCardId === cardId) return 200
  return 10 + orderedCardIds.indexOf(cardId)
}
