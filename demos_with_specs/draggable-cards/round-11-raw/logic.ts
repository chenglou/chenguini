export type CardId = `card-${number}`

export type Card = {
  id: CardId
  label: string
  lightnessBase: number
  sizeY: number
}

export type PointerSample = {
  timeMs: number
  x: number
  y: number
}

export type Velocity = {
  x: number
  y: number
}

export const cardWidth = 320
export const topPadding = 50
export const dragScale = 1.1
export const dragOpacity = 0.7
export const msPerAnimationStep = 4
export const springStiffness = 290
export const springDamping = 24

export function hash(n: number) {
  n = Math.imul((n >>> 16) ^ n, 0x21f0aaad)
  n = Math.imul((n >>> 15) ^ n, 0x735a2d97)
  return (((n >>> 15) ^ n) >>> 0) / 0x100000000
}

export function createCards(count = 5): Card[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `card-${index}`,
    label: `Drag Me ${index}`,
    lightnessBase: hash(index * 2 + 1) * 40 + 40,
    sizeY: 30 + hash(index * 2) * 150,
  }))
}

export function getSlotMidpoints(cardHeights: number[], paddingTop: number): number[] {
  let y = paddingTop

  return cardHeights.map((height) => {
    const midpoint = y + height / 2
    y += height
    return midpoint
  })
}

export function getReorderIndex(args: {
  currentIndex: number
  draggedCenterY: number
  slotMidpoints: number[]
}): number {
  const { currentIndex, draggedCenterY, slotMidpoints } = args
  let targetIndex = currentIndex

  while (targetIndex < slotMidpoints.length - 1 && draggedCenterY > slotMidpoints[targetIndex + 1]!) {
    targetIndex += 1
  }
  while (targetIndex > 0 && draggedCenterY < slotMidpoints[targetIndex - 1]!) {
    targetIndex -= 1
  }

  return targetIndex
}

export function reorderIds<T>(orderedItems: readonly T[], fromIndex: number, toIndex: number): T[] {
  if (fromIndex === toIndex) {
    return [...orderedItems]
  }

  const reordered = [...orderedItems]
  const [movedItem] = reordered.splice(fromIndex, 1)

  if (movedItem === undefined) {
    return reordered
  }

  reordered.splice(toIndex, 0, movedItem)
  return reordered
}

export function estimateReleaseVelocity(args: {
  nowMs: number
  samples: PointerSample[]
  windowMs?: number
}): Velocity {
  const { nowMs, samples, windowMs = 100 } = args
  const recentSamples = samples.filter((sample) => sample.timeMs >= nowMs - windowMs)

  if (recentSamples.length < 2) {
    return { x: 0, y: 0 }
  }

  const firstSample = recentSamples[0]!
  const lastSample = recentSamples[recentSamples.length - 1]!
  const deltaTimeMs = lastSample.timeMs - firstSample.timeMs

  if (deltaTimeMs <= 0) {
    return { x: 0, y: 0 }
  }

  return {
    x: (lastSample.x - firstSample.x) / deltaTimeMs,
    y: (lastSample.y - firstSample.y) / deltaTimeMs,
  }
}
