export const CARD_COUNT = 5
export const CARD_WIDTH = 320
export const TOP_PADDING = 50
export const SPRING_STEP_MS = 4
export const SPRING_STIFFNESS = 290
export const SPRING_DAMPING = 24
export const DRAGGED_SCALE = 1.1
export const SETTLE_DISTANCE = 0.4
export const SETTLE_VELOCITY = 12

export function hash(n) {
  n = Math.imul((n >>> 16) ^ n, 0x21f0aaad)
  n = Math.imul((n >>> 15) ^ n, 0x735a2d97)
  return (((n >>> 15) ^ n) >>> 0) / 0x100000000
}

export function createCards() {
  return Array.from({ length: CARD_COUNT }, (_, index) => ({
    id: String(index),
    label: `Drag Me ${index}`,
    height: 30 + hash(index * 2) * 150,
    lightnessBase: hash(index * 2 + 1) * 40 + 40,
  }))
}

export function layoutCards(order, cards, viewportWidth) {
  const cardById = new Map(cards.map(card => [card.id, card]))
  const layout = Object.create(null)
  let y = TOP_PADDING
  const x = (viewportWidth - CARD_WIDTH) / 2

  for (const id of order) {
    const card = cardById.get(id)
    if (card == null) throw new Error(`Missing card ${id}`)
    layout[id] = {
      x,
      y,
      width: CARD_WIDTH,
      height: card.height,
      midpoint: y + card.height / 2,
    }
    y += card.height
  }

  return layout
}

export function reorderDraggedCard(order, cards, draggedId, pointerY, layout) {
  const resolvedLayout = layout ?? layoutCards(order, cards, CARD_WIDTH)
  const nextOrder = order.slice()
  let nextLayout = resolvedLayout
  let changed = false

  while (true) {
    const index = nextOrder.indexOf(draggedId)
    let swapped = false

    if (index > 0) {
      const previousId = nextOrder[index - 1]
      const previousCard = cards.find(card => card.id === previousId)
      const previousLayout = nextLayout[previousId]
      if (previousCard != null && previousLayout != null && pointerY < previousLayout.y + previousCard.height / 2) {
        ;[nextOrder[index - 1], nextOrder[index]] = [nextOrder[index], nextOrder[index - 1]]
        swapped = true
        changed = true
      }
    }

    if (!swapped && index < nextOrder.length - 1) {
      const nextId = nextOrder[index + 1]
      const nextCard = cards.find(card => card.id === nextId)
      const nextCardLayout = nextLayout[nextId]
      if (nextCard != null && nextCardLayout != null && pointerY > nextCardLayout.y + nextCard.height / 2) {
        ;[nextOrder[index], nextOrder[index + 1]] = [nextOrder[index + 1], nextOrder[index]]
        swapped = true
        changed = true
      }
    }

    if (!swapped) break
    nextLayout = layoutCards(nextOrder, cards, CARD_WIDTH)
  }

  return { order: nextOrder, layout: nextLayout, changed }
}

export function createSpring(position, destination = position, velocity = 0, stiffness = SPRING_STIFFNESS, damping = SPRING_DAMPING) {
  return { pos: position, dest: destination, v: velocity, k: stiffness, b: damping }
}

export function stepSpring(spring) {
  const dt = SPRING_STEP_MS / 1000
  const force = -spring.k * (spring.pos - spring.dest) - spring.b * spring.v
  spring.v += force * dt
  spring.pos += spring.v * dt

  if (springSettled(spring)) {
    spring.pos = spring.dest
    spring.v = 0
  }

  return spring
}

export function springSettled(spring) {
  return Math.abs(spring.v) < SETTLE_VELOCITY && Math.abs(spring.dest - spring.pos) < SETTLE_DISTANCE
}

export function estimateReleaseVelocity(samples, now = samples[samples.length - 1]?.time ?? 0) {
  if (samples.length < 2) return { x: 0, y: 0 }

  const last = samples[samples.length - 1]
  let index = samples.length - 2

  while (index >= 0 && now - samples[index].time <= 100) {
    index -= 1
  }

  const start = samples[index + 1] ?? last
  const elapsed = last.time - start.time
  if (elapsed <= 0) return { x: 0, y: 0 }

  return {
    x: ((last.x - start.x) / elapsed) * 1000,
    y: ((last.y - start.y) / elapsed) * 1000,
  }
}
