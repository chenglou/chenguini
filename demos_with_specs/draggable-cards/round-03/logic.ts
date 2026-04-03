export const CARD_COUNT = 5
export const CARD_WIDTH = 320
export const TOP_PADDING = 50
export const MS_PER_ANIMATION_STEP = 4
export const SPRING_STIFFNESS = 290
export const SPRING_DAMPING = 24

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

export type CardLayout = {
  id: number
  y: number
  height: number
}

export type CardSpec = {
  id: number
  label: string
  height: number
  lightnessBase: number
}

export function hash(n: number) {
  n = Math.imul((n >>> 16) ^ n, 0x21f0aaad)
  n = Math.imul((n >>> 15) ^ n, 0x735a2d97)
  return (((n >>> 15) ^ n) >>> 0) / 0x100000000
}

export function createCardSpecs(count = CARD_COUNT) {
  const cards: CardSpec[] = []
  for (let i = 0; i < count; i += 1) {
    cards.push({
      id: i,
      label: `Drag Me ${i}`,
      height: 30 + hash(i * 2) * 150,
      lightnessBase: hash(i * 2 + 1) * 40 + 40,
    })
  }
  return cards
}

export function spring(
  position: number,
  destination = position,
  velocity = 0,
  stiffness = SPRING_STIFFNESS,
  damping = SPRING_DAMPING,
): Spring {
  return { pos: position, dest: destination, v: velocity, k: stiffness, b: damping }
}

export function springStep(config: Spring) {
  const t = MS_PER_ANIMATION_STEP / 1000
  const { pos, dest, v, k, b } = config
  const springForce = -k * (pos - dest)
  const dampingForce = -b * v
  const acceleration = springForce + dampingForce
  const nextVelocity = v + acceleration * t
  const nextPosition = pos + nextVelocity * t

  config.pos = nextPosition
  config.v = nextVelocity
}

export function springMostlyDone(config: Spring) {
  return Math.abs(config.v) < 0.02 && Math.abs(config.dest - config.pos) < 0.02
}

export function springSnap(config: Spring) {
  config.pos = config.dest
  config.v = 0
}

export function centeredCardX(windowWidth: number) {
  return (windowWidth - CARD_WIDTH) / 2
}

export function draggedCardX(pointerX: number, deltaX: number, windowWidth: number) {
  const rawX = pointerX - deltaX
  const centeredX = centeredCardX(windowWidth)
  return rawX + (centeredX - rawX) / 1.5
}

export function layoutCards(order: readonly number[], heightsById: readonly number[]) {
  const layoutsById = new Array<CardLayout>(order.length)
  let y = TOP_PADDING
  for (let i = 0; i < order.length; i += 1) {
    const id = order[i]!
    const height = heightsById[id]!
    layoutsById[id] = { id, y, height }
    y += height
  }
  return layoutsById
}

export function reorderDraggedCard(
  layoutsById: readonly CardLayout[],
  order: readonly number[],
  draggedId: number,
  pointerY: number,
) {
  const nextOrder = order.slice()
  let draggedIndex = nextOrder.indexOf(draggedId)
  let didSwap = false

  while (draggedIndex > 0) {
    const previousId = nextOrder[draggedIndex - 1]!
    const previous = layoutsById[previousId]!
    const midpoint = previous.y + previous.height / 2
    if (pointerY >= midpoint) break
    nextOrder[draggedIndex] = previousId
    nextOrder[draggedIndex - 1] = draggedId
    draggedIndex -= 1
    didSwap = true
  }

  while (draggedIndex < nextOrder.length - 1) {
    const nextId = nextOrder[draggedIndex + 1]!
    const nextCard = layoutsById[nextId]!
    const midpoint = nextCard.y + nextCard.height / 2
    if (pointerY <= midpoint) break
    nextOrder[draggedIndex] = nextId
    nextOrder[draggedIndex + 1] = draggedId
    draggedIndex += 1
    didSwap = true
  }

  return { order: nextOrder, didSwap }
}

export function estimateReleaseVelocity(samples: readonly PointerSample[], now: number): Velocity {
  if (samples.length < 2) return { x: 0, y: 0 }

  const latest = samples[samples.length - 1]!
  let start = latest
  for (let i = samples.length - 2; i >= 0; i -= 1) {
    const sample = samples[i]!
    if (now - sample.time > 100) break
    start = sample
  }

  const dt = latest.time - start.time
  if (dt <= 0) return { x: 0, y: 0 }
  return {
    x: ((latest.x - start.x) / dt) * 1000,
    y: ((latest.y - start.y) / dt) * 1000,
  }
}

export function pushPointerSample(
  samples: readonly PointerSample[],
  sample: PointerSample,
  maxSamples = 20,
) {
  const nextSamples = samples.slice(-(maxSamples - 1))
  nextSamples.push(sample)
  return nextSamples
}
