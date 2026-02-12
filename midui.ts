// @cs
// midui: shared UI helpers for game-engine-style render loop apps
//
// spring physics (euler integration, framerate-decoupled):
//   msPerAnimationStep = 6 (ms per physics step)
//   Spring = { pos, dest, v, k, b }
//   spring(pos, dest=pos, v=0, k=333, b=33) -> Spring
//   springStep(s): mutates s.pos, s.v via Fspring=-k*(pos-dest), Fdamper=-b*v, mass=1
//   springGoToEnd(s): snap pos=dest, v=0
//   springMostlyDone(s): |v|<0.01 && |dest-pos|<0.01
//
// geometry:
//   center(containee, container, insetStart=0, insetEnd=0) -> centered position
//   insideInclusive(px, py, rectX, rectY, sizeX, sizeY) -> bool
//   overlapInclusive(x1,y1,w1,h1, x2,y2,w2,h2) -> bool (rect-rect, size-based)
//   overlap(a: Vec4, b: Vec4) -> area (rect-rect, corner-based xyzw=left,top,right,bottom)
//   fit(aspectRatio, containerW, containerH) -> fitted width
//   length(x, y) -> euclidean distance
//
// math:
//   remap(value, oldMin, oldMax, newMin, newMax) -> linear remap, divide-by-zero safe
//   clamp(min, v, max)
//   easeOutQuad(x), easeOutQuart(x)
//   minIndex(arr) -> index of smallest element
//   fract(x) -> x - floor(x)
//
// hash (deterministic, fract-based, from shadertoy):
//   hash11(p) -> number in [0,1)
//   hash21(p) -> Vec2 {x,y} each in [0,1)
//   hash31(p) -> Vec3 {x,y,z} each in [0,1)
//
// types:
//   Vec2 = {x, y}, Vec3 = {x, y, z}, Vec4 = {x, y, z, w}
//   vec2(x,y), vec3(x,y,z), vec4(x,y,z,w) constructors
// @/cs

// === generic spring physics
// 4ms/step for the spring animation's step. Typically 4 steps for 60fps (16.6ms/frame) and 2 for 120fps (8.3ms/frame). Frame time delta varies, so not always true
// could use 8ms instead, but 120fps' 8.3ms/frame means the computation might not fit in the remaining 0.3ms, which means sometime the simulation step wouldn't even run once, giving the illusion of jank
export const msPerAnimationStep = 6
export type Spring = { pos: number; dest: number; v: number; k: number; b: number }
export function spring(position: number, destination = position, velocity = 0, stiffness = 333, damping = 33): Spring {
  return { pos: position, dest: destination, v: velocity, k: stiffness, b: damping } // try https://chenglou.me/react-motion/demos/demo5-spring-parameters-chooser/
}
export function springStep(config: Spring) {
  // https://blog.maximeheckel.com/posts/the-physics-behind-spring-animations/
  // this seems inspired by https://github.com/chenglou/react-motion/blob/9e3ce95bacaa9a1b259f969870a21c727232cc68/src/stepper.js
  const t = msPerAnimationStep / 1000 // convert to seconds for the physics equation
  const { pos, dest, v, k, b } = config
  // for animations, dest is actually spring at rest. Current position is the spring's stretched/compressed state
  const Fspring = -k * (pos - dest) // Spring stiffness, in kg / s^2
  const Fdamper = -b * v // Damping, in kg / s
  const a = Fspring + Fdamper // a needs to be divided by mass, but we'll assume mass of 1. Adjust k and b to change spring curve instead
  const newV = v + a * t
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

// === generic helpers
export function center(containee: number, container: number, containerInsetStart = 0, containerInsetEnd = 0) {
  // assuming container size already includes containerInsetStart and containerInsetEnd
  return containerInsetStart + (container - containerInsetStart - containerInsetEnd - containee) / 2
}

export function remap(value: number, oldMin: number, oldMax: number, newMin: number, newMax: number): number {
  if (oldMin === oldMax) return (newMin + newMax) / 2 // avoid divide by 0
  return ((value - oldMin) / (oldMax - oldMin)) * (newMax - newMin) + newMin
}

export function length(x: number, y: number) {
  return Math.sqrt(x * x + y * y)
}

export function insideInclusive(x1: number, y1: number, x2: number, y2: number, sizeX: number, sizeY: number) {
  return x2 <= x1 && x1 <= x2 + sizeX && y2 <= y1 && y1 <= y2 + sizeY
}

export function overlapInclusive(
  x1: number,
  y1: number,
  sizeX1: number,
  sizeY1: number,
  x2: number,
  y2: number,
  sizeX2: number,
  sizeY2: number,
) {
  return x1 <= x2 + sizeX2 && x2 <= x1 + sizeX1 && y1 <= y2 + sizeY2 && y2 <= y1 + sizeY1
}

// returns the overlapped area size
export function overlap(a: Vec4, b: Vec4): number {
  const left = Math.max(a.x, b.x)
  const right = Math.min(a.z, b.z)
  const top = Math.max(a.y, b.y)
  const bottom = Math.min(a.w, b.w)

  if (right > left && bottom > top) return (right - left) * (bottom - top)
  return 0 // no overlap
}

export function fit(ar: number, containerSizeX: number, containerSizeY: number) {
  // returns max size x that fits in the container without changing aspect ratio
  return Math.min(containerSizeX, containerSizeY * ar) // returns fitted sizeX. Get fitted sizeY with sizeX / ar
}

export function clamp(min: number, v: number, max: number) {
  return v > max ? max : v < min ? min : v
}

export function easeOutQuad(x: number): number {
  return 1 - (1 - x) ** 2
}
export function easeOutQuart(x: number): number {
  return 1 - (1 - x) ** 4
}

export function minIndex(arr: number[]) {
  let min = Infinity
  let minIndex = 0
  for (let i = 0; i < arr.length; i++) {
    const value = arr[i]!
    if (value < min) {
      minIndex = i
      min = value
    }
  }
  return minIndex
}

export function fract(x: number) {
  return x - Math.floor(x)
}

// https://www.shadertoy.com/view/4djSRW
export function hash11(p: number): number {
  p = fract(p * 0.1031)
  p *= p + 33.33
  p *= p + p
  return fract(p)
}

export function hash21(p: number): Vec2 {
  const p3x = fract(p * 0.1031)
  const p3y = fract(p * 0.103)
  const p3z = fract(p * 0.0973)

  const dot = p3x * (p3y + 33.33) + p3y * (p3z + 33.33) + p3z * (p3x + 33.33)

  const px = p3x + dot
  const py = p3y + dot
  const pz = p3z + dot

  return {
    x: fract((px + py) * pz),
    y: fract((px + pz) * py),
  }
}

export function hash31(p: number): Vec3 {
  const p3x = fract(p * 0.1031)
  const p3y = fract(p * 0.103)
  const p3z = fract(p * 0.0973)

  const dot = p3x * (p3y + 33.33) + p3y * (p3z + 33.33) + p3z * (p3x + 33.33)

  const px = p3x + dot
  const py = p3y + dot
  const pz = p3z + dot

  return {
    x: fract((px + py) * pz),
    y: fract((px + pz) * py),
    z: fract((py + pz) * px),
  }
}

// convenient types
export type Vec2 = { x: number; y: number }
export type Vec3 = { x: number; y: number; z: number }
export type Vec4 = { x: number; y: number; z: number; w: number }

export function vec2(x: number, y: number): Vec2 {
  return { x, y }
}
export function vec3(x: number, y: number, z: number): Vec3 {
  return { x, y, z }
}
export function vec4(x: number, y: number, z: number, w: number): Vec4 {
  return { x, y, z, w }
}
