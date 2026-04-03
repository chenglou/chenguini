export const msPerAnimationStep = 6

export type Spring = {
  pos: number
  dest: number
  v: number
  k: number
  b: number
}

export function spring(
  position: number,
  destination = position,
  velocity = 0,
  stiffness = 333,
  damping = 33,
): Spring {
  return {pos: position, dest: destination, v: velocity, k: stiffness, b: damping}
}

export function retargetSpring(config: Spring, destination: number) {
  config.dest = destination
}

export function springStep(config: Spring) {
  const t = msPerAnimationStep / 1000
  const {pos, dest, v, k, b} = config
  const springForce = -k * (pos - dest)
  const damperForce = -b * v
  const acceleration = springForce + damperForce
  const nextVelocity = v + acceleration * t
  const nextPosition = pos + nextVelocity * t

  config.pos = nextPosition
  config.v = nextVelocity
}

export function springGoToEnd(config: Spring) {
  config.pos = config.dest
  config.v = 0
}

export function springMostlyDone(config: Spring) {
  return Math.abs(config.v) < 0.01 && Math.abs(config.dest - config.pos) < 0.01
}
