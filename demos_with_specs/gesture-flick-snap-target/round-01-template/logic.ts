export const PIP_WIDTH = 120
export const PIP_HEIGHT = 80
export const CORNER_PAD = 20
export const CORNER_MARKER_SIZE = 16
export const REST_MARKER_SIZE = 10
export const MS_PER_ANIMATION_STEP = 4
export const SPRING_STIFFNESS = 290
export const SPRING_DAMPING = 24
export const DECAY_FRICTION = 4.5
export const POINTER_HISTORY_WINDOW_MS = 100

export type Point = {
  x: number
  y: number
}

export type Viewport = {
  width: number
  height: number
}

export type PointerSample = Point & {
  time: number
}

export type CornerName = 'topLeft' | 'topRight' | 'bottomLeft' | 'bottomRight'

export function computeCornerPositions(viewport: Viewport): Record<CornerName, Point> {
  return {
    topLeft: {x: CORNER_PAD, y: CORNER_PAD},
    topRight: {x: viewport.width - CORNER_PAD - PIP_WIDTH, y: CORNER_PAD},
    bottomLeft: {x: CORNER_PAD, y: viewport.height - CORNER_PAD - PIP_HEIGHT},
    bottomRight: {
      x: viewport.width - CORNER_PAD - PIP_WIDTH,
      y: viewport.height - CORNER_PAD - PIP_HEIGHT,
    },
  }
}

export function chooseNearestCorner(position: Point, viewport: Viewport): CornerName {
  const corners = computeCornerPositions(viewport)
  const cornerNames: CornerName[] = ['topLeft', 'topRight', 'bottomLeft', 'bottomRight']

  let bestCorner = cornerNames[0]
  let bestDistanceSquared = Number.POSITIVE_INFINITY

  for (const corner of cornerNames) {
    const target = corners[corner]
    const dx = target.x - position.x
    const dy = target.y - position.y
    const distanceSquared = dx * dx + dy * dy
    if (distanceSquared < bestDistanceSquared) {
      bestDistanceSquared = distanceSquared
      bestCorner = corner
    }
  }

  return bestCorner
}

export function computeDecayRestPosition(args: {
  position: Point
  velocity: Point
  friction?: number
}): Point {
  const friction = args.friction ?? DECAY_FRICTION
  return {
    x: args.position.x + args.velocity.x / friction,
    y: args.position.y + args.velocity.y / friction,
  }
}

export function estimateReleaseVelocity(
  samples: PointerSample[],
  historyWindowMs = POINTER_HISTORY_WINDOW_MS,
): Point {
  if (samples.length < 2) return {x: 0, y: 0}

  const last = samples.at(-1)!
  let firstRecentIndex = samples.length - 1

  while (
    firstRecentIndex > 0 &&
    last.time - samples[firstRecentIndex - 1]!.time <= historyWindowMs
  ) {
    firstRecentIndex--
  }

  const firstRecent = samples[firstRecentIndex]!
  const deltaTime = last.time - firstRecent.time
  if (deltaTime <= 0) return {x: 0, y: 0}

  return {
    x: ((last.x - firstRecent.x) / deltaTime) * 1000,
    y: ((last.y - firstRecent.y) / deltaTime) * 1000,
  }
}
