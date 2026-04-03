export type CardSpec = {
  id: number
  sizeY: number
  lightnessBase: number
}

export type LayoutCard = {
  id: number
  top: number
  centerY: number
  height: number
}

export type PointerSample = {
  x: number
  y: number
  time: number
}

export type Velocity = {
  vx: number
  vy: number
}

export function hash(n: number) {
  n = Math.imul((n >>> 16) ^ n, 0x21f0aaad)
  n = Math.imul((n >>> 15) ^ n, 0x735a2d97)
  return (((n >>> 15) ^ n) >>> 0) / 0x100000000
}

export function createCards(): CardSpec[] {
  const cards: CardSpec[] = []
  for (let i = 0; i < 5; i++) {
    cards.push({
      id: i,
      sizeY: 30 + hash(i * 2) * 150,
      lightnessBase: hash(i * 2 + 1) * 40 + 40,
    })
  }
  return cards
}

export function computeStackLayout(order: number[], cards: CardSpec[]) {
  const byId: Record<number, LayoutCard> = {}
  let top = 50

  for (let i = 0; i < order.length; i++) {
    const id = order[i]!
    const card = cards[id]!
    const height = card.sizeY
    byId[id] = {
      id,
      top,
      centerY: top + height / 2,
      height,
    }
    top += height
  }

  return {
    byId,
    totalHeight: top - 50,
  }
}

export function reorderDraggedCard(order: number[], draggedId: number, draggedCenterY: number, cards: CardSpec[]) {
  const nextOrder = order.slice()
  let draggedIndex = nextOrder.indexOf(draggedId)

  if (draggedIndex === -1) {
    return nextOrder
  }

  while (true) {
    const layout = computeStackLayout(nextOrder.filter((id) => id !== draggedId), cards)

    if (draggedIndex > 0) {
      const previousId = nextOrder[draggedIndex - 1]!
      if (draggedCenterY < layout.byId[previousId]!.centerY) {
        nextOrder[draggedIndex] = previousId
        nextOrder[draggedIndex - 1] = draggedId
        draggedIndex--
        continue
      }
    }

    if (draggedIndex < nextOrder.length - 1) {
      const nextId = nextOrder[draggedIndex + 1]!
      if (draggedCenterY > layout.byId[nextId]!.centerY) {
        nextOrder[draggedIndex] = nextId
        nextOrder[draggedIndex + 1] = draggedId
        draggedIndex++
        continue
      }
    }

    return nextOrder
  }
}

export function estimatePointerVelocity(samples: PointerSample[], now: number): Velocity {
  if (samples.length < 2) {
    return { vx: 0, vy: 0 }
  }

  let oldestIndex = samples.length - 1
  while (oldestIndex > 0 && now - samples[oldestIndex - 1].time <= 100) {
    oldestIndex--
  }

  const oldest = samples[oldestIndex]
  const latest = samples[samples.length - 1]
  const elapsed = Math.max(1, now - oldest.time)

  return {
    vx: ((latest.x - oldest.x) / elapsed) * 1000,
    vy: ((latest.y - oldest.y) / elapsed) * 1000,
  }
}
