export const CARD_WIDTH = 320
export const TOP_PADDING = 50
export const MS_PER_ANIMATION_STEP = 4
export const X_STIFFNESS = 290
export const X_DAMPING = 24
export const Y_STIFFNESS = 290
export const Y_DAMPING = 24
export const RELEASE_WINDOW_MS = 100

export function hash(n) {
  n = Math.imul((n >>> 16) ^ n, 0x21f0aaad)
  n = Math.imul((n >>> 15) ^ n, 0x735a2d97)
  return (((n >>> 15) ^ n) >>> 0) / 0x100000000
}

export function createCards() {
  return [1, 2, 3, 4, 5].map(id => ({
    id,
    sizeY: 30 + hash(id * 2) * 150,
    lightnessBase: hash(id * 2 + 1) * 40 + 40,
  }))
}

export function createCardMap(cards) {
  return new Map(cards.map(card => [card.id, card]))
}

export function centeredX(windowWidth) {
  return (windowWidth - CARD_WIDTH) / 2
}

export function getSlotTop(order, id, cardsById, topPadding = TOP_PADDING) {
  let top = topPadding
  for (const orderId of order) {
    if (orderId === id) return top
    top += cardsById.get(orderId).sizeY
  }
  return top
}

export function getSlotPositionMap(order, cardsById, windowWidth, topPadding = TOP_PADDING) {
  const positions = new Map()
  const x = centeredX(windowWidth)
  let y = topPadding

  for (const id of order) {
    positions.set(id, { x, y })
    y += cardsById.get(id).sizeY
  }

  return positions
}

export function reorderByCenterY(order, activeId, centerY, cardsById, topPadding = TOP_PADDING) {
  const activeIndex = order.indexOf(activeId)
  if (activeIndex === -1) return order.slice()

  let targetIndex = 0
  for (const id of order) {
    if (id === activeId) continue

    const top = getSlotTop(order, id, cardsById, topPadding)
    const midpoint = top + cardsById.get(id).sizeY / 2
    if (centerY > midpoint) {
      targetIndex += 1
      continue
    }
    break
  }

  const others = order.filter(id => id !== activeId)
  return [
    ...others.slice(0, targetIndex),
    activeId,
    ...others.slice(targetIndex),
  ]
}

export function estimateReleaseVelocity(samples, now, windowMs = RELEASE_WINDOW_MS) {
  const recent = samples.filter(sample => now - sample.time <= windowMs)
  if (recent.length < 2) {
    return { x: 0, y: 0 }
  }

  const first = recent[0]
  const last = recent[recent.length - 1]
  const elapsed = last.time - first.time
  if (elapsed <= 0) {
    return { x: 0, y: 0 }
  }

  return {
    x: (last.x - first.x) / elapsed,
    y: (last.y - first.y) / elapsed,
  }
}

export function stepSpring(position, velocity, target, stiffness, damping, dt) {
  const acceleration = (target - position) * stiffness - velocity * damping
  const nextVelocity = velocity + acceleration * dt
  const nextPosition = position + nextVelocity * dt
  return [nextPosition, nextVelocity]
}

export function isSettled(position, velocity, target, epsilon = 0.25, velocityEpsilon = 0.01) {
  return Math.abs(position - target) <= epsilon && Math.abs(velocity) <= velocityEpsilon
}

export function getTopmostId(order, activeId, settlingId) {
  if (activeId !== null) return activeId
  if (settlingId !== null) return settlingId
  return order[order.length - 1] ?? null
}
