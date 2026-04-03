export type PointerSample = {
  x: number
  y: number
  time: number
}

export function hash(n: number): number {
  n = Math.imul((n >>> 16) ^ n, 0x21f0aaad)
  n = Math.imul((n >>> 15) ^ n, 0x735a2d97)
  return (((n >>> 15) ^ n) >>> 0) / 0x100000000
}

export function estimateReleaseVelocity(
  samples: PointerSample[],
  now: number,
): {vx: number; vy: number} {
  if (samples.length < 2) return {vx: 0, vy: 0}

  let first = samples[samples.length - 1]!
  for (let i = samples.length - 2; i >= 0; i--) {
    const candidate = samples[i]!
    first = candidate
    if (now - candidate.time > 100) break
  }

  const last = samples[samples.length - 1]!
  const dt = last.time - first.time
  if (dt <= 0) return {vx: 0, vy: 0}

  return {
    vx: ((last.x - first.x) / dt) * 1000,
    vy: ((last.y - first.y) / dt) * 1000,
  }
}

function stackTopForIndex(
  order: number[],
  targetIndex: number,
  topPadding: number,
  sizeById: Record<number, number>,
): number {
  let y = topPadding
  for (let i = 0; i < targetIndex; i++) {
    y += sizeById[order[i]!]!
  }
  return y
}

export function reorderIdsForPointer(
  order: number[],
  draggedId: number,
  pointerY: number,
  topPadding: number,
  sizeById: Record<number, number>,
): number[] {
  const nextOrder = order.slice()
  let draggedIndex = nextOrder.indexOf(draggedId)
  if (draggedIndex === -1) return nextOrder

  while (draggedIndex > 0) {
    const previousId = nextOrder[draggedIndex - 1]!
    const previousTop = stackTopForIndex(nextOrder, draggedIndex - 1, topPadding, sizeById)
    const previousMidY = previousTop + sizeById[previousId]! / 2
    if (pointerY >= previousMidY) break
    nextOrder[draggedIndex - 1] = draggedId
    nextOrder[draggedIndex] = previousId
    draggedIndex -= 1
  }

  while (draggedIndex < nextOrder.length - 1) {
    const followingId = nextOrder[draggedIndex + 1]!
    const followingTop = stackTopForIndex(nextOrder, draggedIndex + 1, topPadding, sizeById)
    const followingMidY = followingTop + sizeById[followingId]! / 2
    if (pointerY <= followingMidY) break
    nextOrder[draggedIndex] = followingId
    nextOrder[draggedIndex + 1] = draggedId
    draggedIndex += 1
  }

  return nextOrder
}
