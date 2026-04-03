export const CARD_COUNT = 5
export const CARD_WIDTH = 320
export const STACK_TOP = 50

export type PointerSample = {
  x: number
  y: number
  time: number
}

export type CardMetric = {
  id: number
  height: number
  lightnessBase: number
}

export type StackLayoutEntry = {
  id: number
  top: number
  height: number
  midpoint: number
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

export function getCardMetric(id: number): CardMetric {
  return {
    id,
    height: getCardHeight(id),
    lightnessBase: getCardLightnessBase(id),
  }
}

export function getCenteredX(windowWidth: number) {
  return (windowWidth - CARD_WIDTH) / 2
}

export function getDraggedX(windowWidth: number, pointerX: number, deltaX: number) {
  const rawX = pointerX - deltaX
  const centeredX = getCenteredX(windowWidth)
  return rawX + (centeredX - rawX) / 1.5
}

export function buildStackLayout(orderedIds: number[]) {
  const layout: StackLayoutEntry[] = []
  let top = STACK_TOP

  for (let i = 0; i < orderedIds.length; i++) {
    const id = orderedIds[i]
    if (id == null) continue
    const height = getCardHeight(id)
    layout.push({
      id,
      top,
      height,
      midpoint: top + height / 2,
    })
    top += height
  }

  return layout
}

export function reorderIdsByPointerY(orderedIds: number[], draggedId: number, pointerY: number) {
  const nextOrder = orderedIds.slice()
  let didSwap = false

  while (true) {
    const draggedIndex = nextOrder.indexOf(draggedId)
    if (draggedIndex === -1) break

    const layout = buildStackLayout(nextOrder)
    const previous = layout[draggedIndex - 1]
    if (previous != null && pointerY < previous.midpoint) {
      nextOrder[draggedIndex] = previous.id
      nextOrder[draggedIndex - 1] = draggedId
      didSwap = true
      continue
    }

    const next = layout[draggedIndex + 1]
    if (next != null && pointerY > next.midpoint) {
      nextOrder[draggedIndex] = next.id
      nextOrder[draggedIndex + 1] = draggedId
      didSwap = true
      continue
    }

    break
  }

  return { order: nextOrder, didSwap }
}

export function estimateReleaseVelocity(samples: PointerSample[], now: number, windowMs = 100) {
  if (samples.length < 2) return { x: 0, y: 0 }

  let firstIndex = samples.length - 1
  while (firstIndex > 0 && now - samples[firstIndex - 1]!.time <= windowMs) {
    firstIndex--
  }

  const first = samples[firstIndex]
  const last = samples[samples.length - 1]
  if (first == null || last == null) return { x: 0, y: 0 }

  const dt = last.time - first.time
  if (dt <= 0) return { x: 0, y: 0 }

  return {
    x: ((last.x - first.x) / dt) * 1000,
    y: ((last.y - first.y) / dt) * 1000,
  }
}
