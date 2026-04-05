export const CARD_WIDTH = 120
export const CARD_HEIGHT = 80
export const CORNER_PAD = 20
export const CORNER_MARKER_SIZE = 16
export const REST_MARKER_SIZE = 10
export const MS_PER_ANIMATION_STEP = 4
export const SPRING_STIFFNESS = 290
export const SPRING_DAMPING = 24
export const DECAY_FRICTION = 4.5
export const POINTER_HISTORY_WINDOW_MS = 100

export type Point = {x: number; y: number}
export type Velocity = {x: number; y: number}
export type PointerSample = {x: number; y: number; time: number}
export type CornerId = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'

export type CornerTarget = {
  id: CornerId
  card: Point
  marker: Point
}

export type SpringConfig = {
  pos: number
  dest: number
  v: number
  k: number
  b: number
}

export function spring(
  pos: number,
  v = 0,
  k = SPRING_STIFFNESS,
  b = SPRING_DAMPING,
): SpringConfig {
  return {pos, dest: pos, v, k, b}
}

export function springStep(config: SpringConfig) {
  const t = MS_PER_ANIMATION_STEP / 1000
  const {pos, dest, v, k, b} = config
  const springForce = -k * (pos - dest)
  const damperForce = -b * v
  const acceleration = springForce + damperForce
  const nextVelocity = v + acceleration * t
  const nextPosition = pos + nextVelocity * t

  config.pos = nextPosition
  config.v = nextVelocity
}

export function springGoToEnd(config: SpringConfig) {
  config.pos = config.dest
  config.v = 0
}

export function isSpringSettled(config: SpringConfig) {
  return Math.abs(config.v) < 0.01 && Math.abs(config.dest - config.pos) < 0.01
}

export function getCornerTargets(viewportWidth: number, viewportHeight: number): CornerTarget[] {
  return [
    {
      id: 'top-left',
      card: {x: CORNER_PAD, y: CORNER_PAD},
      marker: {x: CORNER_PAD, y: CORNER_PAD},
    },
    {
      id: 'top-right',
      card: {x: viewportWidth - CORNER_PAD - CARD_WIDTH, y: CORNER_PAD},
      marker: {x: viewportWidth - CORNER_PAD, y: CORNER_PAD},
    },
    {
      id: 'bottom-left',
      card: {x: CORNER_PAD, y: viewportHeight - CORNER_PAD - CARD_HEIGHT},
      marker: {x: CORNER_PAD, y: viewportHeight - CORNER_PAD},
    },
    {
      id: 'bottom-right',
      card: {
        x: viewportWidth - CORNER_PAD - CARD_WIDTH,
        y: viewportHeight - CORNER_PAD - CARD_HEIGHT,
      },
      marker: {x: viewportWidth - CORNER_PAD, y: viewportHeight - CORNER_PAD},
    },
  ]
}

export function chooseNearestCorner(corners: CornerTarget[], point: Point): CornerTarget {
  let winner = corners[0]!
  let winnerDistance = distanceSquared(winner.card, point)

  for (let i = 1; i < corners.length; i++) {
    const candidate = corners[i]!
    const candidateDistance = distanceSquared(candidate.card, point)
    if (candidateDistance < winnerDistance) {
      winner = candidate
      winnerDistance = candidateDistance
    }
  }

  return winner
}

export function computeDecayRestPosition(
  position: Point,
  velocity: Velocity,
  friction = DECAY_FRICTION,
): Point {
  return {
    x: position.x + velocity.x / friction,
    y: position.y + velocity.y / friction,
  }
}

export function estimateReleaseVelocity(
  pointer: PointerSample[],
  historyWindowMs = POINTER_HISTORY_WINDOW_MS,
): Velocity {
  if (pointer.length < 2) return {x: 0, y: 0}

  const last = pointer[pointer.length - 1]!
  let firstIndex = pointer.length - 1

  while (firstIndex > 0 && last.time - pointer[firstIndex - 1]!.time <= historyWindowMs) {
    firstIndex--
  }

  const first = pointer[firstIndex]!
  const deltaTime = last.time - first.time
  if (deltaTime <= 0) return {x: 0, y: 0}

  return {
    x: (last.x - first.x) / deltaTime * 1000,
    y: (last.y - first.y) / deltaTime * 1000,
  }
}

export function roundPoint(point: Point): Point {
  return {
    x: Math.round(point.x * 1000) / 1000,
    y: Math.round(point.y * 1000) / 1000,
  }
}

function distanceSquared(a: Point, b: Point) {
  const dx = a.x - b.x
  const dy = a.y - b.y
  return dx * dx + dy * dy
}
