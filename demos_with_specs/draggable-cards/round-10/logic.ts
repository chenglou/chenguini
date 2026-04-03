export const CARD_WIDTH = 320
export const CARD_COUNT = 5
export const TOP_PADDING = 50
export const MS_PER_ANIMATION_STEP = 4
export const SPRING_STIFFNESS = 290
export const SPRING_DAMPING = 24
export const SCALE_STIFFNESS = 290
export const SCALE_DAMPING = 24
export const SPRING_SNAP_DISTANCE = 0.05
export const SPRING_SNAP_VELOCITY = 0.05

export type PointerSample = {
  x: number
  y: number
  time: number
}

export type Spring = {
  pos: number
  dest: number
  v: number
  stiffness: number
  damping: number
}

export type CardSpec = {
  id: number
  height: number
  lightnessBase: number
  label?: string
  backgroundColor?: string
  outlineColor?: string
  textColor?: string
  top?: number
  left?: number
  width?: number
}

export function hash(n: number) {
  n = Math.imul((n >>> 16) ^ n, 0x21f0aaad)
  n = Math.imul((n >>> 15) ^ n, 0x735a2d97)
  return (((n >>> 15) ^ n) >>> 0) / 0x100000000
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function hslBlue(lightness: number, saturation = 78) {
  return `hsl(216 ${saturation}% ${clamp(lightness, 0, 100)}%)`
}

export function createCardSpecs(count = CARD_COUNT): CardSpec[] {
  return Array.from({ length: count }, (_, id) => {
    const height = 30 + hash(id * 2) * 150
    const lightnessBase = hash(id * 2 + 1) * 40 + 40
    const backgroundLightness = clamp(lightnessBase + 6, 0, 100)
    const outlineLightness = clamp(lightnessBase - 12, 0, 100)
    return {
      id,
      height,
      lightnessBase,
      label: `Drag Me ${id}`,
      backgroundColor: hslBlue(backgroundLightness, 72),
      outlineColor: hslBlue(outlineLightness, 84),
      textColor: 'hsl(220 35% 14%)',
    }
  })
}

export function createSpring(
  pos: number,
  dest = pos,
  v = 0,
  stiffness = SPRING_STIFFNESS,
  damping = SPRING_DAMPING,
): Spring {
  return { pos, dest, v, stiffness, damping }
}

export function springStep(spring: Spring) {
  const t = MS_PER_ANIMATION_STEP / 1000
  const forceSpring = -spring.stiffness * (spring.pos - spring.dest)
  const forceDamping = -spring.damping * spring.v
  const acceleration = forceSpring + forceDamping
  const nextV = spring.v + acceleration * t
  const nextPos = spring.pos + nextV * t

  spring.v = nextV
  spring.pos = nextPos

  if (springIsSettled(spring)) {
    spring.pos = spring.dest
    spring.v = 0
  }
}

export function springIsSettled(spring: Spring) {
  return Math.abs(spring.v) < SPRING_SNAP_VELOCITY && Math.abs(spring.dest - spring.pos) < SPRING_SNAP_DISTANCE
}

export function snapSpringToDest(spring: Spring) {
  spring.pos = spring.dest
  spring.v = 0
}

export function pinSpring(spring: Spring, value: number) {
  spring.pos = value
  spring.dest = value
  spring.v = 0
}

export function advanceSpringForMs(spring: Spring, elapsedMs: number) {
  const steps = Math.min(300, Math.floor(elapsedMs / MS_PER_ANIMATION_STEP))
  for (let i = 0; i < steps; i += 1) springStep(spring)
}

export function estimateReleaseVelocity(samples: readonly PointerSample[], now = samples[samples.length - 1]?.time ?? 0) {
  if (samples.length < 2) return { vx: 0, vy: 0 }

  const cutoff = now - 100
  let start = samples[0]
  for (const sample of samples) {
    if (sample.time >= cutoff) {
      start = sample
      break
    }
  }

  const last = samples[samples.length - 1]
  const dt = now - start.time
  if (dt <= 0) return { vx: 0, vy: 0 }

  return {
    vx: ((last.x - start.x) / dt) * 1000,
    vy: ((last.y - start.y) / dt) * 1000,
  }
}

function heightById(cards: readonly CardSpec[]) {
  return new Map(cards.map((card) => [card.id, card.height] as const))
}

function topForIndex(order: readonly number[], heights: Map<number, number>, index: number, topPadding = TOP_PADDING) {
  let top = topPadding
  for (let i = 0; i < index; i += 1) top += heights.get(order[i]) ?? 0
  return top
}

export function reorderIdsByPointerY(
  order: readonly number[],
  draggedId: number,
  pointerY: number,
  cards: readonly CardSpec[],
  topPadding = TOP_PADDING,
) {
  const next = [...order]
  const heights = heightById(cards)

  while (true) {
    const index = next.indexOf(draggedId)
    if (index < 0) return next

    if (index > 0) {
      const previousId = next[index - 1]
      const previousTop = topForIndex(next, heights, index - 1, topPadding)
      const previousMidpoint = previousTop + (heights.get(previousId) ?? 0) / 2
      if (pointerY < previousMidpoint) {
        ;[next[index - 1], next[index]] = [next[index], next[index - 1]]
        continue
      }
    }

    if (index < next.length - 1) {
      const nextId = next[index + 1]
      const nextTop = topForIndex(next, heights, index + 1, topPadding)
      const nextMidpoint = nextTop + (heights.get(nextId) ?? 0) / 2
      if (pointerY > nextMidpoint) {
        ;[next[index], next[index + 1]] = [next[index + 1], next[index]]
        continue
      }
    }

    return next
  }
}

export function computeStackLayout(
  order: readonly number[],
  cards: readonly CardSpec[],
  windowWidth: number,
  topPadding = TOP_PADDING,
) {
  const centerX = (windowWidth - CARD_WIDTH) / 2
  const positions = new Map<number, { x: number; y: number }>()
  const heights = heightById(cards)

  let y = topPadding
  for (const id of order) {
    positions.set(id, { x: centerX, y })
    y += heights.get(id) ?? 0
  }

  return positions
}
