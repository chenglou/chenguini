export const CARD_COUNT = 5
export const CARD_WIDTH = 320
export const TOP_PADDING = 50
export const MS_PER_ANIMATION_STEP = 4
export const XY_STIFFNESS = 290
export const XY_DAMPING = 24
export const SCALE_STIFFNESS = 320
export const SCALE_DAMPING = 26

export type PointerSample = {
  x: number
  y: number
  time: number
}

export function hash(n: number) {
  n = Math.imul((n >>> 16) ^ n, 0x21f0aaad)
  n = Math.imul((n >>> 15) ^ n, 0x735a2d97)
  return (((n >>> 15) ^ n) >>> 0) / 0x100000000
}

export function cardHeight(id: number) {
  return 30 + hash(id * 2) * 150
}

export function cardLightness(id: number) {
  return hash(id * 2 + 1) * 40 + 40
}

export function reorderWhileDragging(args: {
  order: number[]
  draggedId: number
  pointerY: number
  topPadding: number
  heightsById: number[]
}) {
  const nextOrder = args.order.slice()
  let swapped = false

  while (true) {
    const draggedIndex = nextOrder.indexOf(args.draggedId)
    if (draggedIndex === -1) {
      throw new Error(`Dragged id ${args.draggedId} is not in order`)
    }

    if (draggedIndex > 0) {
      const previousId = nextOrder[draggedIndex - 1]
      const previousMidpoint = getCardTop(nextOrder, args.heightsById, args.topPadding, previousId) + args.heightsById[previousId] / 2
      if (args.pointerY < previousMidpoint) {
        ;[nextOrder[draggedIndex - 1], nextOrder[draggedIndex]] = [nextOrder[draggedIndex], nextOrder[draggedIndex - 1]]
        swapped = true
        continue
      }
    }

    if (draggedIndex < nextOrder.length - 1) {
      const nextId = nextOrder[draggedIndex + 1]
      const nextMidpoint = getCardTop(nextOrder, args.heightsById, args.topPadding, nextId) + args.heightsById[nextId] / 2
      if (args.pointerY > nextMidpoint) {
        ;[nextOrder[draggedIndex], nextOrder[draggedIndex + 1]] = [nextOrder[draggedIndex + 1], nextOrder[draggedIndex]]
        swapped = true
        continue
      }
    }

    return { order: nextOrder, swapped }
  }
}

export function estimateReleaseVelocity(samples: PointerSample[], lookbackMs = 100) {
  if (samples.length < 2) return { x: 0, y: 0 }

  const latest = samples[samples.length - 1]
  let earliest = latest

  for (let index = samples.length - 2; index >= 0; index--) {
    const sample = samples[index]
    if (latest.time - sample.time <= lookbackMs) {
      earliest = sample
      continue
    }
    break
  }

  const dt = latest.time - earliest.time
  if (dt <= 0) return { x: 0, y: 0 }

  return {
    x: ((latest.x - earliest.x) / dt) * 1000,
    y: ((latest.y - earliest.y) / dt) * 1000,
  }
}

export function getCardTop(order: number[], heightsById: number[], topPadding: number, cardId: number) {
  let top = topPadding
  for (const id of order) {
    if (id === cardId) return top
    top += heightsById[id]
  }
  throw new Error(`Card ${cardId} is not in order`)
}
