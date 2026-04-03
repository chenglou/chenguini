export const rowSizeX = 320
export const topPadding = 50
export const msPerAnimationStep = 4
export const positionSpringStiffness = 290
export const positionSpringDamping = 24
export const scaleSpringStiffness = 320
export const scaleSpringDamping = 26

export type PointerSample = {
  x: number
  y: number
  time: number
}

export type Spring = {
  pos: number
  dest: number
  v: number
  k: number
  b: number
}

export function hash(n: number) {
  n = Math.imul((n >>> 16) ^ n, 0x21f0aaad)
  n = Math.imul((n >>> 15) ^ n, 0x735a2d97)
  return (((n >>> 15) ^ n) >>> 0) / 0x100000000
}

export function cardHeightForIndex(index: number) {
  return Math.round(30 + hash(index * 2) * 150)
}

export function cardLightnessForIndex(index: number) {
  return hash(index * 2 + 1) * 40 + 40
}

export function spring(
  position: number,
  destination = position,
  velocity = 0,
  stiffness = positionSpringStiffness,
  damping = positionSpringDamping,
): Spring {
  return { pos: position, dest: destination, v: velocity, k: stiffness, b: damping }
}

export function springStep(config: Spring) {
  const t = msPerAnimationStep / 1_000
  const springForce = -config.k * (config.pos - config.dest)
  const damperForce = -config.b * config.v
  const a = springForce + damperForce
  config.v += a * t
  config.pos += config.v * t
}

export function springGoToEnd(config: Spring) {
  config.pos = config.dest
  config.v = 0
}

export function springMostlyDone(config: Spring) {
  return Math.abs(config.v) < 0.01 && Math.abs(config.dest - config.pos) < 0.01
}

export function estimateReleaseVelocity(samples: PointerSample[], horizonMs = 100) {
  if (samples.length < 2) {
    return { x: 0, y: 0 }
  }

  const last = samples[samples.length - 1]!
  const cutoff = last.time - horizonMs
  let first = last
  for (let i = samples.length - 2; i >= 0; i--) {
    const candidate = samples[i]!
    first = candidate
    if (candidate.time <= cutoff) {
      break
    }
  }

  const dt = Math.max(1, last.time - first.time)
  return {
    x: ((last.x - first.x) / dt) * 1_000,
    y: ((last.y - first.y) / dt) * 1_000,
  }
}

export function reorderForPointer({
  order,
  draggedId,
  pointerY,
  topPadding,
  heights,
}: {
  order: string[]
  draggedId: string
  pointerY: number
  topPadding: number
  heights: Map<string, number>
}) {
  const nextOrder = order.slice()
  let index = nextOrder.indexOf(draggedId)
  if (index === -1) {
    return { order: nextOrder, changed: false }
  }

  let changed = false

  while (index > 0) {
    const previousId = nextOrder[index - 1]!
    const previousMidpoint = stackTopAtIndex(nextOrder, index - 1, topPadding, heights) + heights.get(previousId)! / 2
    if (pointerY >= previousMidpoint) {
      break
    }
    nextOrder[index] = previousId
    nextOrder[index - 1] = draggedId
    index--
    changed = true
  }

  while (index < nextOrder.length - 1) {
    const nextId = nextOrder[index + 1]!
    const nextMidpoint = stackTopAtIndex(nextOrder, index + 1, topPadding, heights) + heights.get(nextId)! / 2
    if (pointerY <= nextMidpoint) {
      break
    }
    nextOrder[index] = nextId
    nextOrder[index + 1] = draggedId
    index++
    changed = true
  }

  return { order: nextOrder, changed }
}

export function stackTopAtIndex(order: string[], index: number, topPadding: number, heights: Map<string, number>) {
  let y = topPadding
  for (let i = 0; i < index; i++) {
    y += heights.get(order[i]!) ?? 0
  }
  return y
}
