export const CARD_COUNT = 5
export const ROW_SIZE_X = 320
export const TOP_PADDING = 50
export const MS_PER_ANIMATION_STEP = 4
export const XY_STIFFNESS = 290
export const XY_DAMPING = 24
const SPRING_DONE_DISTANCE = 0.01
const SPRING_DONE_VELOCITY = 0.01

export type PointerSample = {
  x: number
  y: number
  time: number
}

export type Velocity = {
  x: number
  y: number
}

export type Spring = {
  pos: number
  dest: number
  v: number
  k: number
  b: number
}

export type CardModel = {
  id: number
  label: string
  sizeY: number
  lightnessBase: number
}

export type ReorderResult = {
  order: number[]
  draggedIndex: number
  swapCount: number
}

export function hash(n: number) {
  n = Math.imul((n >>> 16) ^ n, 0x21f0aaad)
  n = Math.imul((n >>> 15) ^ n, 0x735a2d97)
  return (((n >>> 15) ^ n) >>> 0) / 0x100000000
}

export function makeCards(count = CARD_COUNT): CardModel[] {
  return Array.from({ length: count }, (_, id) => ({
    id,
    label: `Drag Me ${id}`,
    sizeY: 30 + hash(id * 2) * 150,
    lightnessBase: hash(id * 2 + 1) * 40 + 40,
  }))
}

export function centeredCardX(viewportWidth: number) {
  return (viewportWidth - ROW_SIZE_X) / 2
}

export function spring(position: number, destination = position, velocity = 0, stiffness = XY_STIFFNESS, damping = XY_DAMPING): Spring {
  return {
    pos: position,
    dest: destination,
    v: velocity,
    k: stiffness,
    b: damping,
  }
}

export function springStep(config: Spring) {
  const seconds = MS_PER_ANIMATION_STEP / 1000
  const springForce = -config.k * (config.pos - config.dest)
  const damperForce = -config.b * config.v
  const nextVelocity = config.v + (springForce + damperForce) * seconds
  const nextPosition = config.pos + nextVelocity * seconds
  config.v = nextVelocity
  config.pos = nextPosition
}

export function springMostlyDone(config: Spring) {
  return Math.abs(config.v) < SPRING_DONE_VELOCITY && Math.abs(config.dest - config.pos) < SPRING_DONE_DISTANCE
}

export function springGoToEnd(config: Spring) {
  config.pos = config.dest
  config.v = 0
}

export function applyDragReorder(
  order: number[],
  draggedIndex: number,
  pointerY: number,
  cards: readonly CardModel[],
  topPadding = TOP_PADDING,
): ReorderResult {
  const nextOrder = [...order]
  let nextDraggedIndex = draggedIndex
  let swapCount = 0

  for (;;) {
    let swapped = false
    if (nextDraggedIndex > 0) {
      const previousIndex = nextDraggedIndex - 1
      const previousId = nextOrder[previousIndex]!
      const previousMidpoint = getStackTopForOrderIndex(nextOrder, previousIndex, cards, topPadding) + cards[previousId]!.sizeY / 2
      if (pointerY < previousMidpoint) {
        swap(nextOrder, nextDraggedIndex, previousIndex)
        nextDraggedIndex = previousIndex
        swapCount++
        swapped = true
      }
    }
    if (swapped) continue

    if (nextDraggedIndex < nextOrder.length - 1) {
      const followingIndex = nextDraggedIndex + 1
      const followingId = nextOrder[followingIndex]!
      const followingMidpoint = getStackTopForOrderIndex(nextOrder, followingIndex, cards, topPadding) + cards[followingId]!.sizeY / 2
      if (pointerY > followingMidpoint) {
        swap(nextOrder, nextDraggedIndex, followingIndex)
        nextDraggedIndex = followingIndex
        swapCount++
        continue
      }
    }
    break
  }

  return { order: nextOrder, draggedIndex: nextDraggedIndex, swapCount }
}

export function getStackTopForOrderIndex(order: readonly number[], orderIndex: number, cards: readonly CardModel[], topPadding = TOP_PADDING) {
  let y = topPadding
  for (let index = 0; index < orderIndex; index++) {
    y += cards[order[index]!]!.sizeY
  }
  return y
}

export function estimateReleaseVelocity(samples: readonly PointerSample[], lookbackMs = 100): Velocity {
  if (samples.length < 2) return { x: 0, y: 0 }
  const end = samples[samples.length - 1]!
  const minTime = end.time - lookbackMs
  let startIndex = samples.length - 2
  while (startIndex > 0 && samples[startIndex]!.time > minTime) {
    startIndex--
  }
  const start = samples[startIndex]!
  const deltaTime = end.time - start.time
  if (deltaTime <= 0) return { x: 0, y: 0 }
  return {
    x: (end.x - start.x) / deltaTime * 1000,
    y: (end.y - start.y) / deltaTime * 1000,
  }
}

function swap(values: number[], a: number, b: number) {
  const next = values[a]!
  values[a] = values[b]!
  values[b] = next
}
