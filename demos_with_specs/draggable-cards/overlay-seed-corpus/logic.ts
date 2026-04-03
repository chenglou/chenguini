export const CARD_COUNT = 5
export const CARD_WIDTH = 320
export const TOP_PADDING = 50
export const NO_GAP = 0
export const SPRING_STIFFNESS = 0.18
export const SPRING_DAMPING = 0.82
export const RELEASE_SETTLE_DISTANCE = 0.4
export const RELEASE_SETTLE_SPEED = 0.04

export type CardSpec = {
  id: number
  sizeY: number
  lightnessBase: number
}

export type FlowCard = {
  id: number
  top: number
  midpoint: number
  height: number
}

export type PointerSample = {
  x: number
  y: number
  time: number
}

export type Velocity = {
  x: number
  y: number
}

export function hash(n: number) {
  n = Math.imul((n >>> 16) ^ n, 0x21f0aaad)
  n = Math.imul((n >>> 15) ^ n, 0x735a2d97)
  return (((n >>> 15) ^ n) >>> 0) / 0x100000000
}

export function buildCards(count = CARD_COUNT): CardSpec[] {
  return Array.from({ length: count }, (_, id) => ({
    id,
    sizeY: 30 + hash(id * 2) * 150,
    lightnessBase: hash(id * 2 + 1) * 40 + 40,
  }))
}

export function measureFlow(
  ordered: readonly number[],
  cards: readonly CardSpec[],
  topPadding = TOP_PADDING,
): FlowCard[] {
  let top = topPadding
  return ordered.map((id) => {
    const card = cards[id]
    if (!card) {
      throw new Error(`missing card ${id}`)
    }

    const flowCard = {
      id,
      top,
      midpoint: top + card.sizeY / 2,
      height: card.sizeY,
    }
    top += card.sizeY + NO_GAP
    return flowCard
  })
}

export function reorderByMidpoint(
  ordered: readonly number[],
  draggedId: number,
  pointerY: number,
  cards: readonly CardSpec[],
  topPadding = TOP_PADDING,
): number[] {
  const remaining = ordered.filter((id) => id !== draggedId)
  const flow = measureFlow(remaining, cards, topPadding)
  let insertAt = flow.length

  for (let index = 0; index < flow.length; index += 1) {
    if (pointerY < flow[index]!.midpoint) {
      insertAt = index
      break
    }
  }

  return [...remaining.slice(0, insertAt), draggedId, ...remaining.slice(insertAt)]
}

export function estimateReleaseVelocity(
  samples: readonly PointerSample[],
  now: number,
): Velocity {
  const recent = samples.filter((sample) => sample.time <= now && sample.time >= now - 100)
  if (recent.length < 2) {
    return { x: 0, y: 0 }
  }

  const previous = recent[recent.length - 2]
  const latest = recent[recent.length - 1]
  if (!previous || !latest) {
    return { x: 0, y: 0 }
  }

  const deltaTime = latest.time - previous.time
  if (deltaTime <= 0) {
    return { x: 0, y: 0 }
  }

  return {
    x: (latest.x - previous.x) / deltaTime,
    y: (latest.y - previous.y) / deltaTime,
  }
}

export function computeDraggedX(pointerX: number, grabOffsetX: number, viewportWidth: number) {
  const rawX = pointerX - grabOffsetX
  const centeredX = (viewportWidth - CARD_WIDTH) / 2
  return rawX + (centeredX - rawX) / 1.5
}

export function springToward(
  value: number,
  velocity: number,
  target: number,
  dtSeconds: number,
) {
  const delta = target - value
  const nextVelocity = (velocity + delta * SPRING_STIFFNESS * dtSeconds * 60) *
    Math.pow(SPRING_DAMPING, dtSeconds * 60)
  const nextValue = value + nextVelocity * dtSeconds * 60
  return {
    value: nextValue,
    velocity: nextVelocity,
  }
}

export function isSettled(
  x: number,
  y: number,
  vx: number,
  vy: number,
  targetX: number,
  targetY: number,
) {
  const distance = Math.hypot(targetX - x, targetY - y)
  const speed = Math.hypot(vx, vy)
  return distance < RELEASE_SETTLE_DISTANCE && speed < RELEASE_SETTLE_SPEED
}
