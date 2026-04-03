export const msPerAnimationStep = 6

export type Spring = {
  pos: number
  dest: number
  v: number
}

export function spring(position: number): Spring {
  return {pos: position, dest: position, v: 0}
}

export function springStep(config: Spring, stiffness = 333, damping = 33): void {
  const t = msPerAnimationStep / 1000
  const forceSpring = -stiffness * (config.pos - config.dest)
  const forceDamping = -damping * config.v
  const acceleration = forceSpring + forceDamping
  config.v += acceleration * t
  config.pos += config.v * t
}

export function springMostlyDone(config: Spring): boolean {
  return Math.abs(config.v) < 0.01 && Math.abs(config.dest - config.pos) < 0.01
}

export function springSnap(config: Spring): void {
  config.pos = config.dest
  config.v = 0
}
