export const CARD_WIDTH = 320
export const TOP_PADDING = 50
export const POINTER_HISTORY_WINDOW_MS = 100
export const MS_PER_ANIMATION_STEP = 4
export const XY_STIFFNESS = 290
export const XY_DAMPING = 24

export type CardId = string

export type PointerSample = {
  timeMs: number
  x: number
  y: number
}

export type CardSpec = {
  id: CardId
  label: string
  height: number
  lightnessBase: number
}

export function hash(n: number): number {
  n = Math.imul((n >>> 16) ^ n, 0x21f0aaad)
  n = Math.imul((n >>> 15) ^ n, 0x735a2d97)
  return (((n >>> 15) ^ n) >>> 0) / 0x100000000
}

export function buildCards(cardCount = 5): CardSpec[] {
  return Array.from({ length: cardCount }, (_, index) => ({
    id: String(index),
    label: `Drag Me ${index}`,
    height: 30 + hash(index * 2) * 150,
    lightnessBase: hash(index * 2 + 1) * 40 + 40,
  }))
}

export function getDraggedCardPosition(args: {
  pointerX: number
  pointerY: number
  deltaX: number
  deltaY: number
  rowSizeX: number
  windowWidth: number
}): {
  rawX: number
  centeredX: number
  x: number
  y: number
} {
  const rawX = args.pointerX - args.deltaX
  const centeredX = getCenteredX(args.windowWidth, args.rowSizeX)

  return {
    rawX,
    centeredX,
    x: rawX + (centeredX - rawX) / 1.5,
    y: args.pointerY - args.deltaY,
  }
}

export function getCenteredX(windowWidth: number, rowSizeX: number): number {
  return (windowWidth - rowSizeX) / 2
}

export function getCardTopById(args: {
  orderedCardIds: readonly CardId[]
  cardHeightsById: Readonly<Record<CardId, number>>
  topPadding: number
}): Record<CardId, number> {
  const topById: Record<CardId, number> = {}
  let nextTop = args.topPadding

  for (const cardId of args.orderedCardIds) {
    topById[cardId] = nextTop
    nextTop += args.cardHeightsById[cardId]
  }

  return topById
}

export function getReorderedCardIds(args: {
  orderedCardIds: readonly CardId[]
  draggedCardId: CardId
  draggedMidpointY: number
  topPadding: number
  cardHeightsById: Readonly<Record<CardId, number>>
}): CardId[] {
  const remainingCardIds = args.orderedCardIds.filter((cardId) => cardId !== args.draggedCardId)
  let nextTop = args.topPadding
  let insertIndex = remainingCardIds.length

  for (const [index, cardId] of remainingCardIds.entries()) {
    const midpointY = nextTop + args.cardHeightsById[cardId] / 2

    if (args.draggedMidpointY < midpointY) {
      insertIndex = index
      break
    }

    nextTop += args.cardHeightsById[cardId]
  }

  return [
    ...remainingCardIds.slice(0, insertIndex),
    args.draggedCardId,
    ...remainingCardIds.slice(insertIndex),
  ]
}

export function estimateReleaseVelocity(args: {
  nowMs: number
  pointerSamples: readonly PointerSample[]
  historyWindowMs?: number
}): {
  xPxPerMs: number
  yPxPerMs: number
} {
  const historyWindowMs = args.historyWindowMs ?? POINTER_HISTORY_WINDOW_MS
  const recentSamples = args.pointerSamples.filter(
    (sample) => args.nowMs - sample.timeMs <= historyWindowMs,
  )

  const firstSample = recentSamples[0]
  const lastSample = recentSamples[recentSamples.length - 1]

  if (!firstSample || !lastSample || firstSample === lastSample) {
    return { xPxPerMs: 0, yPxPerMs: 0 }
  }

  const durationMs = lastSample.timeMs - firstSample.timeMs

  if (durationMs <= 0) {
    return { xPxPerMs: 0, yPxPerMs: 0 }
  }

  return {
    xPxPerMs: (lastSample.x - firstSample.x) / durationMs,
    yPxPerMs: (lastSample.y - firstSample.y) / durationMs,
  }
}

export function keepRecentPointerSamples(
  pointerSamples: readonly PointerSample[],
  nowMs: number,
  historyWindowMs = POINTER_HISTORY_WINDOW_MS,
): PointerSample[] {
  return pointerSamples.filter((sample) => nowMs - sample.timeMs <= historyWindowMs)
}

export function getDepthTier(args: {
  cardId: CardId
  draggedCardId: CardId | null
  settlingCardId: CardId | null
}): number {
  if (args.cardId === args.draggedCardId) {
    return 3
  }

  if (args.cardId === args.settlingCardId) {
    return 2
  }

  return 1
}

export function stepSpringAxis(args: {
  position: number
  velocity: number
  target: number
  stiffness?: number
  damping?: number
  dtMs: number
}): {
  position: number
  velocity: number
} {
  const stiffness = args.stiffness ?? XY_STIFFNESS
  const damping = args.damping ?? XY_DAMPING
  const dtSeconds = args.dtMs / 1000
  const acceleration = stiffness * (args.target - args.position) - damping * args.velocity
  const velocity = args.velocity + acceleration * dtSeconds
  const position = args.position + velocity * dtSeconds

  return {
    position,
    velocity,
  }
}

export function isNearlySettled(args: {
  position: number
  velocity: number
  target: number
  epsilonPosition?: number
  epsilonVelocity?: number
}): boolean {
  const epsilonPosition = args.epsilonPosition ?? 0.5
  const epsilonVelocity = args.epsilonVelocity ?? 0.02

  return (
    Math.abs(args.target - args.position) <= epsilonPosition &&
    Math.abs(args.velocity) <= epsilonVelocity
  )
}
