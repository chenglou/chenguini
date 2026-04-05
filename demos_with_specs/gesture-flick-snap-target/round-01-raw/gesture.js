export const PIP_WIDTH = 120
export const PIP_HEIGHT = 80
export const CORNER_PAD = 20
export const CORNER_MARKER_SIZE = 16
export const REST_MARKER_SIZE = 10
export const MS_PER_ANIMATION_STEP = 4
export const SPRING_STIFFNESS = 290
export const SPRING_DAMPING = 24
export const DECAY_FRICTION = 4.5
export const RECENT_POINTER_WINDOW_MS = 100

/**
 * @typedef {"top-left" | "top-right" | "bottom-left" | "bottom-right"} CornerName
 */

/**
 * @typedef {{x: number, y: number}} Point
 * @typedef {{vx: number, vy: number}} Velocity
 * @typedef {{x: number, y: number, time: number}} PointerSample
 */

export function computeCornerPositions({
  viewportWidth,
  viewportHeight,
  cardWidth,
  cardHeight,
  cornerPad,
}) {
  return {
    "top-left": { x: cornerPad, y: cornerPad },
    "top-right": { x: viewportWidth - cornerPad - cardWidth, y: cornerPad },
    "bottom-left": { x: cornerPad, y: viewportHeight - cornerPad - cardHeight },
    "bottom-right": {
      x: viewportWidth - cornerPad - cardWidth,
      y: viewportHeight - cornerPad - cardHeight,
    },
  }
}

export function chooseNearestCorner(point, corners) {
  /** @type {CornerName} */
  let nearestCorner = "top-left"
  let nearestDistanceSq = Number.POSITIVE_INFINITY

  for (const [cornerName, cornerPoint] of Object.entries(corners)) {
    const dx = point.x - cornerPoint.x
    const dy = point.y - cornerPoint.y
    const distanceSq = dx * dx + dy * dy
    if (distanceSq < nearestDistanceSq) {
      nearestDistanceSq = distanceSq
      nearestCorner = /** @type {CornerName} */ (cornerName)
    }
  }

  return nearestCorner
}

export function computeDecayRestPosition({
  position,
  velocity,
  decayFriction,
}) {
  return {
    x: position.x + velocity.vx / decayFriction,
    y: position.y + velocity.vy / decayFriction,
  }
}

export function estimateReleaseVelocity({ samples, now, windowMs }) {
  if (samples.length < 2) {
    return { vx: 0, vy: 0 }
  }

  const lastSample = samples[samples.length - 1]
  let startSample = lastSample

  for (let index = samples.length - 2; index >= 0; index -= 1) {
    const sample = samples[index]
    if (now - sample.time > windowMs) {
      break
    }
    startSample = sample
  }

  if (startSample === lastSample) {
    startSample = samples[samples.length - 2]
  }

  const elapsedMs = Math.max(lastSample.time - startSample.time, 1)
  return {
    vx: ((lastSample.x - startSample.x) / elapsedMs) * 1000,
    vy: ((lastSample.y - startSample.y) / elapsedMs) * 1000,
  }
}

function axisSettled(position, destination, velocity) {
  return Math.abs(destination - position) <= 0.15 && Math.abs(velocity) <= 2
}

function integrateSpring(position, velocity, destination, dtSeconds) {
  const acceleration =
    SPRING_STIFFNESS * (destination - position) - SPRING_DAMPING * velocity
  const nextVelocity = velocity + acceleration * dtSeconds
  const nextPosition = position + nextVelocity * dtSeconds
  return { position: nextPosition, velocity: nextVelocity }
}

function withinRect(point, rect) {
  return (
    point.x >= rect.x &&
    point.x <= rect.x + rect.width &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.height
  )
}

export function createGestureModel() {
  /** @type {Record<CornerName, Point>} */
  let corners = computeCornerPositions({
    viewportWidth: PIP_WIDTH + CORNER_PAD * 2,
    viewportHeight: PIP_HEIGHT + CORNER_PAD * 2,
    cardWidth: PIP_WIDTH,
    cardHeight: PIP_HEIGHT,
    cornerPad: CORNER_PAD,
  })

  /** @type {CornerName} */
  let targetCorner = "bottom-left"
  let viewportWidth = PIP_WIDTH + CORNER_PAD * 2
  let viewportHeight = PIP_HEIGHT + CORNER_PAD * 2

  const state = {
    position: { ...corners["bottom-left"] },
    destination: { ...corners["bottom-left"] },
    velocity: { vx: 0, vy: 0 },
    restPoint: null,
    releaseKind: null,
    drag: {
      active: false,
      offsetX: 0,
      offsetY: 0,
      pointerHistory: [],
    },
    initialized: false,
  }

  function syncCorners() {
    corners = computeCornerPositions({
      viewportWidth,
      viewportHeight,
      cardWidth: PIP_WIDTH,
      cardHeight: PIP_HEIGHT,
      cornerPad: CORNER_PAD,
    })
    state.destination = { ...corners[targetCorner] }
    if (!state.drag.active && isSettled()) {
      state.position = { ...corners[targetCorner] }
      state.velocity = { vx: 0, vy: 0 }
    }
  }

  function isSettled() {
    return (
      axisSettled(state.position.x, state.destination.x, state.velocity.vx) &&
      axisSettled(state.position.y, state.destination.y, state.velocity.vy)
    )
  }

  function setViewport(nextViewportWidth, nextViewportHeight) {
    viewportWidth = nextViewportWidth
    viewportHeight = nextViewportHeight
    if (!state.initialized) {
      state.initialized = true
      syncCorners()
      state.position = { ...corners["bottom-left"] }
      state.destination = { ...corners["bottom-left"] }
      targetCorner = "bottom-left"
      return
    }
    syncCorners()
  }

  function pushPointerSample(sample) {
    state.drag.pointerHistory.push(sample)
    if (state.drag.pointerHistory.length > 24) {
      state.drag.pointerHistory.shift()
    }
  }

  function beginDrag(point) {
    const pipRect = {
      x: state.position.x,
      y: state.position.y,
      width: PIP_WIDTH,
      height: PIP_HEIGHT,
    }

    if (!withinRect(point, pipRect)) {
      return false
    }

    state.drag.active = true
    state.drag.offsetX = point.x - state.position.x
    state.drag.offsetY = point.y - state.position.y
    state.drag.pointerHistory = []
    pushPointerSample(point)
    state.velocity = { vx: 0, vy: 0 }
    state.destination = { ...state.position }
    state.releaseKind = null
    return true
  }

  function moveDrag(point) {
    if (!state.drag.active) {
      return false
    }

    pushPointerSample(point)
    state.position = {
      x: point.x - state.drag.offsetX,
      y: point.y - state.drag.offsetY,
    }
    state.destination = { ...state.position }
    state.velocity = { vx: 0, vy: 0 }
    return true
  }

  function finishDrag(releaseKind, point) {
    if (!state.drag.active) {
      return null
    }

    if (point != null) {
      pushPointerSample(point)
    }

    const velocity = estimateReleaseVelocity({
      samples: state.drag.pointerHistory,
      now: point?.time ?? state.drag.pointerHistory.at(-1)?.time ?? 0,
      windowMs: RECENT_POINTER_WINDOW_MS,
    })
    const restPoint = computeDecayRestPosition({
      position: state.position,
      velocity,
      decayFriction: DECAY_FRICTION,
    })

    targetCorner = chooseNearestCorner(restPoint, corners)
    state.destination = { ...corners[targetCorner] }
    state.velocity = velocity
    state.restPoint = restPoint
    state.releaseKind = releaseKind
    state.drag.active = false
    return {
      chosenCorner: targetCorner,
      restPoint,
      velocity,
    }
  }

  function step(ms) {
    if (state.drag.active) {
      return true
    }

    if (isSettled()) {
      state.position = { ...state.destination }
      state.velocity = { vx: 0, vy: 0 }
      return false
    }

    const dtSeconds = ms / 1000
    const nextX = integrateSpring(
      state.position.x,
      state.velocity.vx,
      state.destination.x,
      dtSeconds,
    )
    const nextY = integrateSpring(
      state.position.y,
      state.velocity.vy,
      state.destination.y,
      dtSeconds,
    )

    state.position = { x: nextX.position, y: nextY.position }
    state.velocity = { vx: nextX.velocity, vy: nextY.velocity }

    if (isSettled()) {
      state.position = { ...state.destination }
      state.velocity = { vx: 0, vy: 0 }
      return false
    }

    return true
  }

  function getSnapshot() {
    return {
      viewport: { width: viewportWidth, height: viewportHeight },
      corners,
      position: { ...state.position },
      destination: { ...state.destination },
      velocity: { ...state.velocity },
      restPoint:
        state.restPoint == null ? null : { x: state.restPoint.x, y: state.restPoint.y },
      releaseKind: state.releaseKind,
      drag: {
        active: state.drag.active,
        offsetX: state.drag.offsetX,
        offsetY: state.drag.offsetY,
      },
      chosenCorner: targetCorner,
      animating: state.drag.active || !isSettled(),
    }
  }

  return {
    beginDrag,
    finishDrag,
    getSnapshot,
    moveDrag,
    setViewport,
    step,
  }
}
