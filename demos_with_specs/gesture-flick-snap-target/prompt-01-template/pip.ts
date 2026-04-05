export const pipWidth = 120
export const pipHeight = 80
export const cornerPad = 20
export const cornerMarkerSize = 16
export const restMarkerSize = 10
export const msPerAnimationStep = 4
export const springStiffness = 290
export const springDamping = 24
export const decayFriction = 4.5

export type Point = {x: number; y: number}
export type Viewport = {width: number; height: number}
export type Velocity = Point
export type PointerSample = Point & {time: number}
export type CornerId = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
export type CornerTarget = Point & {id: CornerId}

export function getCornerTargets(viewport: Viewport): CornerTarget[] {
  return [
    {id: 'top-left', x: cornerPad, y: cornerPad},
    {id: 'top-right', x: viewport.width - cornerPad - pipWidth, y: cornerPad},
    {id: 'bottom-left', x: cornerPad, y: viewport.height - cornerPad - pipHeight},
    {
      id: 'bottom-right',
      x: viewport.width - cornerPad - pipWidth,
      y: viewport.height - cornerPad - pipHeight,
    },
  ]
}

export function chooseNearestCorner(corners: CornerTarget[], point: Point) {
  let bestCorner = corners[0]!
  let bestDistance = distanceSquared(bestCorner, point)

  for (let i = 1; i < corners.length; i++) {
    const corner = corners[i]!
    const distance = distanceSquared(corner, point)
    if (distance < bestDistance) {
      bestCorner = corner
      bestDistance = distance
    }
  }

  return bestCorner
}

export function computeDecayRestPosition({
  position,
  velocity,
  friction = decayFriction,
}: {
  position: Point
  velocity: Velocity
  friction?: number
}) {
  return {
    x: position.x + velocity.x / friction,
    y: position.y + velocity.y / friction,
  }
}

export function estimateReleaseVelocity(samples: PointerSample[], maxAgeMs = 100): Velocity {
  if (samples.length < 2) return {x: 0, y: 0}

  const last = samples.at(-1)!
  let firstIndex = samples.length - 1

  while (firstIndex > 0 && last.time - samples[firstIndex - 1]!.time <= maxAgeMs) {
    firstIndex--
  }

  const first = samples[firstIndex]!
  const deltaTime = last.time - first.time
  if (deltaTime <= 0) return {x: 0, y: 0}

  return {
    x: ((last.x - first.x) / deltaTime) * 1000,
    y: ((last.y - first.y) / deltaTime) * 1000,
  }
}

function distanceSquared(a: Point, b: Point) {
  const dx = a.x - b.x
  const dy = a.y - b.y
  return dx * dx + dy * dy
}
