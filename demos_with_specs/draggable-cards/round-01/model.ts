export const CARD_COUNT = 5
export const CARD_WIDTH = 320
export const STACK_TOP = 50

export type PointerSample = {
  x: number
  y: number
  time: number
}

export type CardLayout = {
  id: number
  top: number
  height: number
}

export function hash(n: number) {
  n = Math.imul((n >>> 16) ^ n, 0x21f0aaad)
  n = Math.imul((n >>> 15) ^ n, 0x735a2d97)
  return (((n >>> 15) ^ n) >>> 0) / 0x100000000
}

export function getCardHeight(id: number) {
  return 30 + hash(id * 2) * 150
}

export function getCardLightnessBase(id: number) {
  return hash(id * 2 + 1) * 40 + 40
}

export function getCenteredX(windowWidth: number) {
  return (windowWidth - CARD_WIDTH) / 2
}

export function estimateReleaseVelocity(samples: PointerSample[], now: number) {
  if (samples.length < 2) return { x: 0, y: 0 }

  let firstIndex = samples.length - 1
  while (firstIndex > 0 && now - samples[firstIndex - 1]!.time <= 100) firstIndex--

  const first = samples[firstIndex]
  const last = samples[samples.length - 1]
  if (first == null || last == null) return { x: 0, y: 0 }

  const dt = now - first.time
  if (dt <= 0) return { x: 0, y: 0 }

  return {
    x: ((last.x - first.x) / dt) * 1000,
    y: ((last.y - first.y) / dt) * 1000,
  }
}

export function reorderWhileDragging(input: {
  order: number[]
  draggedId: number
  pointerY: number
  layout: CardLayout[]
}) {
  const topPadding = input.layout.reduce((minTop, entry) => Math.min(minTop, entry.top), Number.POSITIVE_INFINITY)
  const heightById = new Map<number, number>()
  for (const entry of input.layout) heightById.set(entry.id, entry.height)

  const order = input.order.slice()
  let draggedIndex = order.indexOf(input.draggedId)
  if (draggedIndex === -1) return { order, didSwap: false }

  let didSwap = false

  while (draggedIndex > 0) {
    const previousId = order[draggedIndex - 1]
    if (previousId == null) break

    const previousTop = getSlotTop(order, draggedIndex - 1, topPadding, heightById)
    const previousHeight = heightById.get(previousId)
    if (previousHeight == null) break

    if (input.pointerY >= previousTop + previousHeight / 2) break

    order[draggedIndex] = previousId
    order[draggedIndex - 1] = input.draggedId
    draggedIndex--
    didSwap = true
  }

  while (draggedIndex < order.length - 1) {
    const nextId = order[draggedIndex + 1]
    if (nextId == null) break

    const nextTop = getSlotTop(order, draggedIndex + 1, topPadding, heightById)
    const nextHeight = heightById.get(nextId)
    if (nextHeight == null) break

    if (input.pointerY <= nextTop + nextHeight / 2) break

    order[draggedIndex] = nextId
    order[draggedIndex + 1] = input.draggedId
    draggedIndex++
    didSwap = true
  }

  return { order, didSwap }
}

function getSlotTop(order: number[], index: number, topPadding: number, heightById: Map<number, number>) {
  let top = topPadding
  for (let i = 0; i < index; i++) {
    const id = order[i]
    const height = id == null ? null : heightById.get(id)
    if (height != null) top += height
  }
  return top
}
