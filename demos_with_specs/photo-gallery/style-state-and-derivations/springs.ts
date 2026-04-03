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

export function springStep(config: Spring) {
  const t = msPerAnimationStep / 1000
  const {pos, dest, v, k, b} = config
  const forceSpring = -k * (pos - dest)
  const forceDamping = -b * v
  const acceleration = forceSpring + forceDamping
  const newV = v + acceleration * t
  const newPos = pos + newV * t

  config.pos = newPos
  config.v = newV
}

export function springGoToEnd(config: Spring) {
  config.pos = config.dest
  config.v = 0
}

export function springMostlyDone(s: Spring) {
  return Math.abs(s.v) < 0.01 && Math.abs(s.dest - s.pos) < 0.01
}
