export const CARD_COUNT = 5
export const CARD_WIDTH = 320
export const TOP_PADDING = 50
export const DRAG_SCALE = 1.1
export const DRAG_OPACITY = 0.7
export const MS_PER_ANIMATION_STEP = 4
export const SPRING_STIFFNESS = 290
export const SPRING_DAMPING = 24

export type CardSpec = {
  id: number
  width: number
  height: number
  lightnessBase: number
  top: number
  left: number
}

export type PointerSample = {
  x: number
  y: number
  time: number
}

export type Spring = {
  value: number
  dest: number
  v: number
  stiffness: number
  damping: number
}

export function hash(n: number) {
  n = Math.imul((n >>> 16) ^ n, 0x21f0aaad)
  n = Math.imul((n >>> 15) ^ n, 0x735a2d97)
  return (((n >>> 15) ^ n) >>> 0) / 0x100000000
}

export function createCardSpecs(count = CARD_COUNT): CardSpec[] {
  return Array.from({ length: count }, (_, id) => ({
    id,
    width: CARD_WIDTH,
    height: 30 + hash(id * 2) * 150,
    lightnessBase: hash(id * 2 + 1) * 40 + 40,
    top: 0,
    left: 0,
  }))
}

export function layoutCards(
  order: number[],
  specs: CardSpec[],
  windowWidth: number,
  topPadding = TOP_PADDING,
): CardSpec[] {
  const specById = new Map(specs.map((spec) => [spec.id, spec]))
  const left = (windowWidth - CARD_WIDTH) / 2
  let top = topPadding

  return order.flatMap((id) => {
    const spec = specById.get(id)
    if (!spec) return []

    const laidOut = {
      ...spec,
      left,
      top,
    }
    top += spec.height
    return [laidOut]
  })
}

export function reorderIdsByPointerY(
  orderedIds: number[],
  draggedId: number,
  pointerY: number,
  cardRects: CardSpec[],
) {
  const next = orderedIds.slice()
  const currentIndex = next.indexOf(draggedId)
  if (currentIndex === -1) return next

  const rectById = new Map(cardRects.map((rect) => [rect.id, rect]))
  let index = currentIndex

  while (index > 0) {
    const prevId = next[index - 1]
    const prevRect = rectById.get(prevId)
    if (!prevRect || pointerY >= prevRect.top + prevRect.height / 2) break
    ;[next[index - 1], next[index]] = [next[index], next[index - 1]]
    index--
  }

  while (index < next.length - 1) {
    const nextId = next[index + 1]
    const nextRect = rectById.get(nextId)
    if (!nextRect || pointerY <= nextRect.top + nextRect.height / 2) break
    ;[next[index], next[index + 1]] = [next[index + 1], next[index]]
    index++
  }

  return next
}

export function estimateReleaseVelocity(
  pointerSamples: PointerSample[],
  now: number,
  windowMs = 100,
) {
  if (pointerSamples.length < 2) return { vx: 0, vy: 0 }

  const startTime = now - windowMs
  const recent = pointerSamples.filter((sample) => sample.time >= startTime && sample.time <= now)
  if (recent.length < 2) return { vx: 0, vy: 0 }

  const first = recent[0]
  const last = recent[recent.length - 1]
  const deltaMs = last.time - first.time
  if (deltaMs <= 0) return { vx: 0, vy: 0 }

  const seconds = deltaMs / 1000
  return {
    vx: (last.x - first.x) / seconds,
    vy: (last.y - first.y) / seconds,
  }
}

export function createSpring(
  value: number,
  dest = value,
  v = 0,
  stiffness = SPRING_STIFFNESS,
  damping = SPRING_DAMPING,
): Spring {
  return { value, dest, v, stiffness, damping }
}

export function pinSpring(spring: Spring, value: number) {
  spring.value = value
  spring.dest = value
  spring.v = 0
}

export function advanceSpringForMs(spring: Spring, ms: number, stepMs = MS_PER_ANIMATION_STEP) {
  let remaining = ms
  while (remaining > 0) {
    const slice = Math.min(stepMs, remaining)
    const dt = slice / 1000
    const force = (spring.dest - spring.value) * spring.stiffness - spring.v * spring.damping
    spring.v += force * dt
    spring.value += spring.v * dt
    remaining -= slice
  }
}

export function springIsSettled(spring: Spring) {
  return Math.abs(spring.value - spring.dest) < 0.35 && Math.abs(spring.v) < 0.35
}
