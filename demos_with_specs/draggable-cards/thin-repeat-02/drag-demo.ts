export const CARD_COUNT = 5
export const CARD_WIDTH = 320
export const TOP_PADDING = 50
export const POINTER_HISTORY_WINDOW_MS = 100

export type Card = {
  id: string
  label: string
  sizeY: number
  lightnessBase: number
}

export type PointerSample = {
  timeMs: number
  x: number
  y: number
}

export type PositionedCard = {
  id: string
  top: number
  sizeY: number
  midpointY: number
}

export type Velocity = {
  x: number
  y: number
}

export function hash(n: number) {
  n = Math.imul((n >>> 16) ^ n, 0x21f0aaad)
  n = Math.imul((n >>> 15) ^ n, 0x735a2d97)
  return (((n >>> 15) ^ n) >>> 0) / 0x100000000
}

export function createCards(): Card[] {
  return Array.from({length: CARD_COUNT}, (_, index) => ({
    id: `card-${index + 1}`,
    label: `Card ${index + 1}`,
    sizeY: 30 + hash(index * 2) * 150,
    lightnessBase: hash(index * 2 + 1) * 40 + 40,
  }))
}

export function buildStackMetrics(order: readonly string[], cards: readonly Card[]): PositionedCard[] {
  const sizeById = new Map(cards.map((card) => [card.id, card.sizeY]))
  const positionedCards: PositionedCard[] = []
  let top = TOP_PADDING

  for (const id of order) {
    const sizeY = sizeById.get(id)
    if (sizeY === undefined) {
      throw new Error(`Missing card metadata for ${id}`)
    }

    positionedCards.push({
      id,
      top,
      sizeY,
      midpointY: top + sizeY / 2,
    })
    top += sizeY
  }

  return positionedCards
}

export function getReorderIndex(
  order: readonly string[],
  cards: readonly Card[],
  draggedId: string,
  draggedTop: number,
): number {
  const stack = buildStackMetrics(order, cards)
  const draggedCard = stack.find((card) => card.id === draggedId)

  if (draggedCard === undefined) {
    throw new Error(`Missing dragged card ${draggedId}`)
  }

  const draggedCenterY = draggedTop + draggedCard.sizeY / 2
  const otherCards = stack.filter((card) => card.id !== draggedId)
  let targetIndex = 0

  for (const card of otherCards) {
    if (draggedCenterY > card.midpointY) {
      targetIndex += 1
    }
  }

  return targetIndex
}

export function moveItem<T>(items: readonly T[], fromIndex: number, toIndex: number): T[] {
  const nextItems = [...items]
  const [movedItem] = nextItems.splice(fromIndex, 1)

  if (movedItem === undefined) {
    throw new Error(`Cannot move missing item at index ${fromIndex}`)
  }

  nextItems.splice(toIndex, 0, movedItem)
  return nextItems
}

export function estimateReleaseVelocity(samples: readonly PointerSample[]): Velocity {
  if (samples.length < 2) {
    return {x: 0, y: 0}
  }

  const lastSample = samples.at(-1)
  if (lastSample === undefined) {
    return {x: 0, y: 0}
  }

  const cutoffTimeMs = lastSample.timeMs - POINTER_HISTORY_WINDOW_MS
  let firstSample = samples[0]

  for (const sample of samples) {
    if (sample.timeMs >= cutoffTimeMs) {
      firstSample = sample
      break
    }
  }

  if (firstSample === lastSample) {
    const previousSample = samples.at(-2)
    if (previousSample !== undefined) {
      firstSample = previousSample
    }
  }

  const deltaTimeMs = Math.max(1, lastSample.timeMs - firstSample.timeMs)

  return {
    x: (lastSample.x - firstSample.x) / deltaTimeMs,
    y: (lastSample.y - firstSample.y) / deltaTimeMs,
  }
}

export function getCenteredX(windowWidth: number, rowSizeX = CARD_WIDTH): number {
  return (windowWidth - rowSizeX) / 2
}

export function getDraggedX(pointerX: number, deltaX: number, windowWidth: number, rowSizeX = CARD_WIDTH): number {
  const rawX = pointerX - deltaX
  const centeredX = getCenteredX(windowWidth, rowSizeX)
  return rawX + (centeredX - rawX) / 1.5
}
