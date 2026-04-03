export type PointerSample = {
  x: number
  y: number
  time: number
}

export type StackCard = {
  id: number
  top: number
  height: number
}

export function hash(n: number) {
  n = Math.imul((n >>> 16) ^ n, 0x21f0aaad)
  n = Math.imul((n >>> 15) ^ n, 0x735a2d97)
  return (((n >>> 15) ^ n) >>> 0) / 0x100000000
}

export function reorderWhileDragging(order: number[], cards: StackCard[], draggedId: number, pointerY: number) {
  const slotsById = new Map(cards.map(card => [card.id, card]))
  const nextOrder = [...order]
  let draggedIndex = nextOrder.indexOf(draggedId)

  if (draggedIndex === -1) return nextOrder

  while (draggedIndex > 0) {
    const previousId = nextOrder[draggedIndex - 1]
    const previousCard = previousId == null ? undefined : slotsById.get(previousId)
    if (previousCard == null) break
    const midpoint = previousCard.top + previousCard.height / 2
    if (pointerY >= midpoint) break
    nextOrder[draggedIndex] = previousId
    nextOrder[draggedIndex - 1] = draggedId
    draggedIndex -= 1
  }

  while (draggedIndex < nextOrder.length - 1) {
    const nextId = nextOrder[draggedIndex + 1]
    const nextCard = nextId == null ? undefined : slotsById.get(nextId)
    if (nextCard == null) break
    const midpoint = nextCard.top + nextCard.height / 2
    if (pointerY <= midpoint) break
    nextOrder[draggedIndex] = nextId
    nextOrder[draggedIndex + 1] = draggedId
    draggedIndex += 1
  }

  return nextOrder
}

export function estimateReleaseVelocity(samples: PointerSample[], releaseTime: number) {
  const lastSample = samples.at(-1)
  if (lastSample == null) return { x: 0, y: 0 }

  let startSample = lastSample
  for (let i = samples.length - 1; i >= 0; i -= 1) {
    const sample = samples[i]
    if (sample == null) continue
    if (releaseTime - sample.time <= 100) {
      startSample = sample
      continue
    }
    break
  }

  const duration = lastSample.time - startSample.time
  if (duration <= 0) return { x: 0, y: 0 }

  return {
    x: ((lastSample.x - startSample.x) / duration) * 1000,
    y: ((lastSample.y - startSample.y) / duration) * 1000,
  }
}
