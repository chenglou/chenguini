export const CARD_WIDTH = 320
export const TOP_PADDING = 50
export const RECENT_HISTORY_MS = 100

export type CardId = string

export type CardModel = {
  id: CardId
  label: string
  sizeY: number
  lightnessBase: number
}

export type PointerHistorySample = {
  time: number
  y: number
}

export function hash(n: number) {
  n = Math.imul((n >>> 16) ^ n, 0x21f0aaad)
  n = Math.imul((n >>> 15) ^ n, 0x735a2d97)
  return (((n >>> 15) ^ n) >>> 0) / 0x100000000
}

export function buildCards(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    id: `card-${index + 1}`,
    label: `Card ${index + 1}`,
    sizeY: 30 + hash(index * 2) * 150,
    lightnessBase: hash(index * 2 + 1) * 40 + 40,
  })) satisfies CardModel[]
}

export function reorderByMidpoint(
  order: CardId[],
  heightsById: Record<CardId, number>,
  draggedId: CardId,
  draggedTop: number,
  topPadding: number,
) {
  const draggedHeight = heightsById[draggedId]
  if (draggedHeight === undefined) {
    return order
  }

  const draggedCenter = draggedTop + draggedHeight / 2
  const remainingIds = order.filter((id) => id !== draggedId)
  let currentTop = topPadding
  let insertionIndex = remainingIds.length

  for (const [index, id] of remainingIds.entries()) {
    const height = heightsById[id]
    if (height === undefined) {
      continue
    }

    const midpoint = currentTop + height / 2
    if (draggedCenter < midpoint) {
      insertionIndex = index
      break
    }

    currentTop += height
  }

  return [
    ...remainingIds.slice(0, insertionIndex),
    draggedId,
    ...remainingIds.slice(insertionIndex),
  ]
}

export function getReleaseVelocity(history: PointerHistorySample[], now: number) {
  const latest = history.at(-1)
  if (latest === undefined) {
    return 0
  }

  const windowStart = now - RECENT_HISTORY_MS
  const firstRecent = history.find((sample) => sample.time >= windowStart) ?? history[0]
  if (firstRecent === undefined || latest.time <= firstRecent.time) {
    return 0
  }

  return (latest.y - firstRecent.y) / (latest.time - firstRecent.time)
}
