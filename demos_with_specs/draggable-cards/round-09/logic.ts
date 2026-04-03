export const CARD_WIDTH = 320
export const TOP_PADDING = 50
export const CARD_COUNT = 5
export const MS_PER_ANIMATION_STEP = 4
export const XY_STIFFNESS = 290
export const XY_DAMPING = 24
export const SCALE_STIFFNESS = 290
export const SCALE_DAMPING = 24
export const DRAG_SCALE = 1.1
export const DRAG_OPACITY = 0.7

export type CardId = string

export type PointerSample = {
  x: number
  y: number
  time: number
}

export type Point = {
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
  id: CardId
  top: number
  height: number
}

export type CardModel = {
  id: CardId
  label: string
  height: number
  lightnessBase: number
}

export function hash(n: number) {
  n = Math.imul((n >>> 16) ^ n, 0x21f0aaad)
  n = Math.imul((n >>> 15) ^ n, 0x735a2d97)
  return (((n >>> 15) ^ n) >>> 0) / 0x100000000
}

export function createCards() {
  return Array.from({ length: CARD_COUNT }, (_, index): CardModel => ({
    id: String(index),
    label: `Drag Me ${index}`,
    height: 30 + hash(index * 2) * 150,
    lightnessBase: hash(index * 2 + 1) * 40 + 40,
  }))
}

export function spring(position: number, stiffness = XY_STIFFNESS, damping = XY_DAMPING): Spring {
  return { pos: position, dest: position, v: 0, k: stiffness, b: damping }
}

export function springStep(config: Spring) {
  const dt = MS_PER_ANIMATION_STEP / 1000
  const force = -config.k * (config.pos - config.dest) - config.b * config.v
  config.v += force * dt
  config.pos += config.v * dt
}

export function springMostlyDone(config: Spring) {
  return Math.abs(config.v) < 0.01 && Math.abs(config.dest - config.pos) < 0.01
}

export function snapSpring(config: Spring) {
  config.pos = config.dest
  config.v = 0
}

export function stackLayouts(orderedIds: CardId[], cardById: Map<CardId, CardModel>) {
  const layouts: CardLayout[] = []
  let top = TOP_PADDING
  for (const id of orderedIds) {
    const card = cardById.get(id)
    if (!card) continue
    layouts.push({ id, top, height: card.height })
    top += card.height
  }
  return layouts
}

export function centeredColumnX(windowWidth: number) {
  return (windowWidth - CARD_WIDTH) / 2
}

export function reorderCardsDuringDrag({
  orderedIds,
  draggedId,
  pointerY,
  layouts,
}: {
  orderedIds: CardId[]
  draggedId: CardId
  pointerY: number
  layouts: CardLayout[]
}) {
  const nextOrder = orderedIds.slice()
  const layoutById = new Map(layouts.map((layout) => [layout.id, layout]))
  let draggedIndex = nextOrder.indexOf(draggedId)
  let swapped = false

  while (draggedIndex > 0) {
    const previousId = nextOrder[draggedIndex - 1]
    const previousLayout = layoutById.get(previousId)
    if (!previousLayout) break
    const midpoint = previousLayout.top + previousLayout.height / 2
    if (pointerY >= midpoint) break
    nextOrder[draggedIndex] = previousId
    nextOrder[draggedIndex - 1] = draggedId
    draggedIndex -= 1
    swapped = true
  }

  while (draggedIndex < nextOrder.length - 1) {
    const nextId = nextOrder[draggedIndex + 1]
    const nextLayout = layoutById.get(nextId)
    if (!nextLayout) break
    const midpoint = nextLayout.top + nextLayout.height / 2
    if (pointerY <= midpoint) break
    nextOrder[draggedIndex] = nextId
    nextOrder[draggedIndex + 1] = draggedId
    draggedIndex += 1
    swapped = true
  }

  return { orderedIds: nextOrder, swapped }
}

export function estimateReleaseVelocity(samples: PointerSample[], now: number, windowMs = 100): Point {
  if (samples.length < 2) return { x: 0, y: 0 }

  const latest = samples[samples.length - 1]
  let earliest = latest

  for (let index = samples.length - 2; index >= 0; index -= 1) {
    const sample = samples[index]
    if (now - sample.time > windowMs) break
    earliest = sample
  }

  const dt = now - earliest.time
  if (earliest === latest || dt <= 0) return { x: 0, y: 0 }

  return {
    x: ((latest.x - earliest.x) / dt) * 1000,
    y: ((latest.y - earliest.y) / dt) * 1000,
  }
}
