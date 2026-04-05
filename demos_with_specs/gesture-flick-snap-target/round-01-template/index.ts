import {
  DECAY_FRICTION,
  MS_PER_ANIMATION_STEP,
  PIP_HEIGHT,
  PIP_WIDTH,
  SPRING_DAMPING,
  SPRING_STIFFNESS,
  chooseNearestCorner,
  computeCornerPositions,
  computeDecayRestPosition,
  estimateReleaseVelocity,
  type CornerName,
  type Point,
  type PointerSample,
  type Viewport,
} from './logic'

type SpringConfig = {
  pos: number
  dest: number
  v: number
  k: number
  b: number
}

type DragInfo = {
  deltaX: number
  deltaY: number
}

type Report = {
  phase: 'loading' | 'running' | 'ready' | 'error'
  requestId: string
  scenario: string
  chosenCorner?: CornerName
  finalCorner?: CornerName
  restPoint?: Point | null
  maxPointerError?: number
  message?: string
}

type State = {
  animatedUntilTime: number | null
  dragged: DragInfo | null
  lastDragged: DragInfo | null
  pointerState: 'up' | 'down' | 'firstDown'
  pointer: PointerSample[]
  corner: CornerName
  lastChosenCorner: CornerName | null
  restPoint: Point | null
  events: {
    mouseup: MouseEvent | null
    touchend: TouchEvent | null
    touchcancel: TouchEvent | null
    mousemove: MouseEvent | null
    touchmove: TouchEvent | null
    pointerdown: PointerEvent | null
  }
  pip: {
    x: SpringConfig
    y: SpringConfig
  }
}

function spring(pos: number, v = 0, k = SPRING_STIFFNESS, b = SPRING_DAMPING): SpringConfig {
  return {pos, dest: pos, v, k, b}
}

function springStep(config: SpringConfig) {
  const t = MS_PER_ANIMATION_STEP / 1000
  const {pos, dest, v, k, b} = config
  const springForce = -k * (pos - dest)
  const dampingForce = -b * v
  const acceleration = springForce + dampingForce
  const newV = v + acceleration * t
  const newPos = pos + newV * t

  config.pos = newPos
  config.v = newV
}

function springGoToEnd(config: SpringConfig) {
  config.pos = config.dest
  config.v = 0
}

function isSpringSettled(config: SpringConfig) {
  return Math.abs(config.v) < 0.01 && Math.abs(config.dest - config.pos) < 0.01
}

function isPipSettled() {
  return isSpringSettled(st.pip.x) && isSpringSettled(st.pip.y)
}

function currentViewport(): Viewport {
  return {
    width: document.documentElement.clientWidth,
    height: document.documentElement.clientHeight,
  }
}

function currentPosition(): Point {
  return {x: st.pip.x.pos, y: st.pip.y.pos}
}

const pipEl = document.querySelector<HTMLDivElement>('#pip-card')!
const restMarkerEl = document.querySelector<HTMLDivElement>('#rest-marker')!
const cornerMarkerEls = Array.from(document.querySelectorAll<HTMLDivElement>('.corner-marker'))

const initialCorner = 'bottomLeft'
const initialPosition = computeCornerPositions(currentViewport())[initialCorner]

const st: State = {
  animatedUntilTime: null,
  dragged: null,
  lastDragged: null,
  pointerState: 'up',
  pointer: [{x: 0, y: 0, time: 0}],
  corner: initialCorner,
  lastChosenCorner: null,
  restPoint: null,
  events: {
    mouseup: null,
    touchend: null,
    touchcancel: null,
    mousemove: null,
    touchmove: null,
    pointerdown: null,
  },
  pip: {
    x: spring(initialPosition.x),
    y: spring(initialPosition.y),
  },
}

const params = new URLSearchParams(location.search)
const scenario = params.get('scenario') ?? ''
const requestId = params.get('requestId') ?? ''

let scheduledRaf: number | null = null
let scenarioStarted = false

function scheduleRender() {
  if (scheduledRaf != null) return
  scheduledRaf = requestAnimationFrame(function renderAndMaybeScheduleAnotherRender(now) {
    scheduledRaf = null
    if (render(now)) scheduleRender()
  })
}

function readChangedTouch(event: TouchEvent) {
  return event.changedTouches[0] ?? null
}

function readActiveTouch(event: TouchEvent) {
  return event.touches[0] ?? null
}

function hitTest(pointer: PointerSample) {
  return (
    st.pip.x.pos <= pointer.x &&
    pointer.x < st.pip.x.pos + PIP_WIDTH &&
    st.pip.y.pos <= pointer.y &&
    pointer.y < st.pip.y.pos + PIP_HEIGHT
  )
}

function pushPointerSample(sample: PointerSample | null) {
  if (sample == null) return
  st.pointer.push(sample)
}

function publishReport(report: Report) {
  location.hash = `report=${encodeURIComponent(JSON.stringify(report))}`
}

function reportError(message: string) {
  if (scenario === '' || requestId === '') return
  publishReport({
    phase: 'error',
    requestId,
    scenario,
    message,
  })
}

function render(now: number) {
  if (st.events.mouseup != null || st.events.touchend != null || st.events.touchcancel != null) {
    st.pointerState = 'up'
  }

  if (st.events.mouseup != null) {
    pushPointerSample({
      x: st.events.mouseup.pageX,
      y: st.events.mouseup.pageY,
      time: st.events.mouseup.timeStamp,
    })
  }
  if (st.events.touchend != null) {
    const touch = readChangedTouch(st.events.touchend)
    pushPointerSample(
      touch == null
        ? null
        : {
            x: touch.pageX,
            y: touch.pageY,
            time: st.events.touchend.timeStamp,
          },
    )
  }
  if (st.events.touchcancel != null) {
    const touch = readChangedTouch(st.events.touchcancel)
    pushPointerSample(
      touch == null
        ? null
        : {
            x: touch.pageX,
            y: touch.pageY,
            time: st.events.touchcancel.timeStamp,
          },
    )
  }
  if (st.events.mousemove != null) {
    pushPointerSample({
      x: st.events.mousemove.pageX,
      y: st.events.mousemove.pageY,
      time: st.events.mousemove.timeStamp,
    })
  }
  if (st.events.touchmove != null) {
    const touch = readActiveTouch(st.events.touchmove)
    pushPointerSample(
      touch == null
        ? null
        : {
            x: touch.pageX,
            y: touch.pageY,
            time: st.events.touchmove.timeStamp,
          },
    )
  }
  if (st.events.pointerdown != null) {
    st.pointerState = 'firstDown'
    pushPointerSample({
      x: st.events.pointerdown.pageX,
      y: st.events.pointerdown.pageY,
      time: st.events.pointerdown.timeStamp,
    })
  }

  const viewport = currentViewport()
  const corners = computeCornerPositions(viewport)
  const pointerLast = st.pointer.at(-1)!

  let newDragged: DragInfo | null
  if (st.pointerState === 'down') {
    newDragged = st.dragged
  } else if (st.pointerState === 'up') {
    if (st.dragged != null) {
      const releaseVelocity = estimateReleaseVelocity(st.pointer)
      st.pip.x.v += releaseVelocity.x
      st.pip.y.v += releaseVelocity.y
      st.restPoint = computeDecayRestPosition({
        position: currentPosition(),
        velocity: releaseVelocity,
        friction: DECAY_FRICTION,
      })
      st.corner = chooseNearestCorner(st.restPoint, viewport)
      st.lastChosenCorner = st.corner
    }
    newDragged = null
  } else {
    if (hitTest(pointerLast)) {
      st.restPoint = null
      st.lastChosenCorner = null
      newDragged = {
        deltaX: pointerLast.x - st.pip.x.pos,
        deltaY: pointerLast.y - st.pip.y.pos,
      }
    } else {
      newDragged = null
    }
  }

  if (newDragged != null) {
    st.pip.x.pos = pointerLast.x - newDragged.deltaX
    st.pip.x.dest = st.pip.x.pos
    st.pip.y.pos = pointerLast.y - newDragged.deltaY
    st.pip.y.dest = st.pip.y.pos
  } else {
    const snapTarget = corners[st.corner]
    st.pip.x.dest = snapTarget.x
    st.pip.y.dest = snapTarget.y
  }

  let newAnimatedUntilTime = st.animatedUntilTime ?? now
  const steps = Math.min(300, Math.floor((now - newAnimatedUntilTime) / MS_PER_ANIMATION_STEP))
  newAnimatedUntilTime += steps * MS_PER_ANIMATION_STEP

  let stillAnimating = false
  for (const axis of [st.pip.x, st.pip.y]) {
    for (let step = 0; step < steps; step++) springStep(axis)
    if (isSpringSettled(axis)) {
      springGoToEnd(axis)
    } else {
      stillAnimating = true
    }
  }

  if (st.lastDragged != null && isPipSettled()) st.lastDragged = null

  for (const markerEl of cornerMarkerEls) {
    const corner = markerEl.dataset.corner as CornerName
    const position = corners[corner]
    markerEl.style.transform = `translate3d(${position.x}px, ${position.y}px, 0)`
    markerEl.style.zIndex = '10'
  }

  if (st.restPoint == null) {
    restMarkerEl.style.opacity = '0'
  } else {
    restMarkerEl.style.opacity = '1'
    restMarkerEl.style.transform = `translate3d(${st.restPoint.x}px, ${st.restPoint.y}px, 0)`
    restMarkerEl.style.zIndex = '20'
  }

  pipEl.style.transform = `translate3d(${st.pip.x.pos}px, ${st.pip.y.pos}px, 0)`
  pipEl.style.zIndex = st.dragged != null ? '300' : st.lastDragged != null ? '200' : '100'
  pipEl.style.boxShadow =
    st.dragged != null
      ? '0 26px 48px rgba(0, 0, 0, 0.42), inset 0 1px 0 rgba(255, 255, 255, 0.82)'
      : '0 18px 42px rgba(0, 0, 0, 0.38), inset 0 1px 0 rgba(255, 255, 255, 0.8)'
  document.body.style.cursor = st.dragged != null ? 'grabbing' : hitTest(pointerLast) ? 'grab' : 'auto'

  if (st.pointerState === 'firstDown') st.pointerState = 'down'
  if (st.dragged != null && newDragged == null) st.lastDragged = st.dragged
  st.dragged = newDragged
  st.animatedUntilTime = stillAnimating ? newAnimatedUntilTime : null
  if (st.pointerState === 'up') st.pointer = [{x: 0, y: 0, time: 0}]
  if (st.pointer.length > 20) st.pointer.shift()
  st.events.mouseup = null
  st.events.touchend = null
  st.events.touchcancel = null
  st.events.mousemove = null
  st.events.touchmove = null
  st.events.pointerdown = null

  return newDragged != null || stillAnimating
}

function dispatchMouse(type: 'mousemove' | 'mouseup', point: Point) {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: point.x,
    clientY: point.y,
    screenX: point.x,
    screenY: point.y,
    button: 0,
    buttons: type === 'mousemove' ? 1 : 0,
  })
  window.dispatchEvent(event)
}

function dispatchPointerDown(point: Point) {
  const event = new PointerEvent('pointerdown', {
    bubbles: true,
    cancelable: true,
    clientX: point.x,
    clientY: point.y,
    screenX: point.x,
    screenY: point.y,
    pointerId: 1,
    pointerType: 'mouse',
    isPrimary: true,
    button: 0,
    buttons: 1,
  })
  window.dispatchEvent(event)
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function nextFrame() {
  return new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
}

async function waitForSettle() {
  const deadline = performance.now() + 5_000
  while (performance.now() < deadline) {
    if (isPipSettled() && st.dragged == null) return
    await nextFrame()
  }
  throw new Error('PiP did not settle in time')
}

function currentPipRect() {
  const rect = pipEl.getBoundingClientRect()
  return {x: rect.left, y: rect.top, width: rect.width, height: rect.height}
}

async function runScenario() {
  publishReport({phase: 'loading', requestId, scenario})
  await nextFrame()
  publishReport({phase: 'running', requestId, scenario})

  if (scenario === 'drag-under-pointer') {
    const start = {
      x: st.pip.x.pos + 34,
      y: st.pip.y.pos + 26,
    }
    const dragOffset = {
      x: start.x - st.pip.x.pos,
      y: start.y - st.pip.y.pos,
    }
    let maxPointerError = 0

    dispatchPointerDown(start)
    await nextFrame()

    for (const point of [
      {x: start.x + 36, y: start.y - 22},
      {x: start.x + 74, y: start.y - 10},
      {x: start.x + 110, y: start.y - 42},
    ]) {
      dispatchMouse('mousemove', point)
      await nextFrame()
      const rect = currentPipRect()
      const error = Math.max(
        Math.abs(rect.x - (point.x - dragOffset.x)),
        Math.abs(rect.y - (point.y - dragOffset.y)),
      )
      maxPointerError = Math.max(maxPointerError, error)
    }

    dispatchMouse('mouseup', {x: start.x + 110, y: start.y - 42})
    await nextFrame()

    publishReport({
      phase: 'ready',
      requestId,
      scenario,
      maxPointerError,
    })
    return
  }

  if (scenario === 'flick-upper-right') {
    const start = {
      x: st.pip.x.pos + 48,
      y: st.pip.y.pos + 36,
    }

    dispatchPointerDown(start)
    await nextFrame()

    for (const point of [
      {x: start.x + 60, y: start.y - 70},
      {x: start.x + 160, y: start.y - 170},
      {x: start.x + 250, y: start.y - 240},
    ]) {
      dispatchMouse('mousemove', point)
      await sleep(16)
      await nextFrame()
    }

    dispatchMouse('mouseup', {x: start.x + 250, y: start.y - 240})
    await waitForSettle()

    publishReport({
      phase: 'ready',
      requestId,
      scenario,
      chosenCorner: st.lastChosenCorner ?? st.corner,
      finalCorner: chooseNearestCorner(currentPosition(), currentViewport()),
      restPoint: st.restPoint,
    })
    return
  }

  if (scenario === 'slow-lower-right') {
    const start = {
      x: st.pip.x.pos + 50,
      y: st.pip.y.pos + 28,
    }

    dispatchPointerDown(start)
    await nextFrame()

    for (const step of [
      {point: {x: start.x + 90, y: start.y - 6}, pauseMs: 50},
      {point: {x: start.x + 190, y: start.y - 4}, pauseMs: 50},
      {point: {x: start.x + 270, y: start.y - 2}, pauseMs: 24},
      {point: {x: start.x + 320, y: start.y - 2}, pauseMs: 16},
    ]) {
      dispatchMouse('mousemove', step.point)
      await sleep(step.pauseMs)
      await nextFrame()
    }

    await sleep(16)
    dispatchMouse('mouseup', {x: start.x + 320, y: start.y - 2})
    await waitForSettle()

    publishReport({
      phase: 'ready',
      requestId,
      scenario,
      chosenCorner: st.lastChosenCorner ?? st.corner,
      finalCorner: chooseNearestCorner(currentPosition(), currentViewport()),
      restPoint: st.restPoint,
    })
    return
  }

  throw new Error(`Unknown scenario: ${scenario}`)
}

for (const axis of [st.pip.x, st.pip.y]) {
  axis.k = SPRING_STIFFNESS
  axis.b = SPRING_DAMPING
}

window.addEventListener('resize', () => scheduleRender())
window.addEventListener('mouseup', (event) => {
  st.events.mouseup = event
  scheduleRender()
})
window.addEventListener('touchend', (event) => {
  st.events.touchend = event
  scheduleRender()
})
window.addEventListener('touchcancel', (event) => {
  st.events.touchcancel = event
  scheduleRender()
})
window.addEventListener('mousemove', (event) => {
  st.events.mousemove = event
  scheduleRender()
})
window.addEventListener('touchmove', (event) => {
  st.events.touchmove = event
  scheduleRender()
})
window.addEventListener('pointerdown', (event) => {
  if (event.button !== 0 || !event.isPrimary) return
  st.events.pointerdown = event
  scheduleRender()
})

scheduleRender()

if (scenario !== '' && requestId !== '' && !scenarioStarted) {
  scenarioStarted = true
  queueMicrotask(() => {
    runScenario().catch((error) => {
      reportError(error instanceof Error ? error.message : String(error))
    })
  })
}
