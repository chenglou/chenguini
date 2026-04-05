import {
  chooseNearestCorner,
  computeDecayRestPosition,
  cornerMarkerSize,
  cornerPad,
  decayFriction,
  estimateReleaseVelocity,
  getCornerTargets,
  msPerAnimationStep,
  pipHeight,
  pipWidth,
  restMarkerSize,
  springDamping,
  springStiffness,
  type CornerId,
  type Point,
  type PointerSample,
} from './pip.ts'

type Spring = {
  pos: number
  dest: number
  v: number
  k: number
  b: number
}

type DragState = {
  deltaX: number
  deltaY: number
}

type PointerDownEventData = {
  pageX: number
  pageY: number
  timeStamp: number
}

type MouseEventData = PointerDownEventData

type TouchPointData = {
  pageX: number
  pageY: number
}

type TouchEventData = {
  timeStamp: number
  touches: TouchPointData[]
  changedTouches: TouchPointData[]
}

type Report = {
  phase: 'loading' | 'running' | 'ready' | 'error'
  requestId: string
  scenario: string
  viewport?: {width: number; height: number}
  completedWith?: 'mouseup' | 'touchend' | 'touchcancel'
  chosenCornerId?: CornerId | null
  finalCornerId?: CornerId | null
  restPosition?: Point | null
  finalPosition?: Point | null
  maxDragOffsetError?: number
  restMarkerVisible?: boolean
  message?: string
}

type State = {
  animatedUntilTime: number | null
  drag: DragState | null
  snapCornerId: CornerId
  chosenCornerId: CornerId | null
  pointerState: 'up' | 'firstDown' | 'down'
  pointer: PointerSample[]
  restPosition: Point | null
  maxDragOffsetError: number
  events: {
    mouseup: MouseEventData | null
    touchend: TouchEventData | null
    touchcancel: TouchEventData | null
    mousemove: MouseEventData | null
    touchmove: TouchEventData | null
    pointerdown: PointerDownEventData | null
  }
  pip: {
    x: Spring
    y: Spring
  }
}

const params = new URLSearchParams(location.search)
const scenario = params.get('scenario') ?? ''
const requestId = params.get('requestId') ?? ''

const stage = document.getElementById('stage')
if (!(stage instanceof HTMLDivElement)) {
  throw new Error('Expected #stage to exist')
}

const cornerNodes = [
  createMarker('corner-marker'),
  createMarker('corner-marker'),
  createMarker('corner-marker'),
  createMarker('corner-marker'),
]
const restNode = createMarker('rest-marker')
const pipNode = document.createElement('div')
pipNode.className = 'pip-card'
pipNode.textContent = 'PiP'
stage.append(...cornerNodes, restNode, pipNode)

let scheduledRaf: number | null = null

const initialCorner = getCornerTargets(getViewport()).find((corner) => corner.id === 'bottom-left')!
const st: State = {
  animatedUntilTime: null,
  drag: null,
  snapCornerId: 'bottom-left',
  chosenCornerId: null,
  pointerState: 'up',
  pointer: [{x: 0, y: 0, time: 0}],
  restPosition: null,
  maxDragOffsetError: 0,
  events: {
    mouseup: null,
    touchend: null,
    touchcancel: null,
    mousemove: null,
    touchmove: null,
    pointerdown: null,
  },
  pip: {
    x: spring(initialCorner.x),
    y: spring(initialCorner.y),
  },
}

window.addEventListener('resize', () => scheduleRender())
window.addEventListener('mouseup', (event) => {
  stageMouseUp({pageX: event.pageX, pageY: event.pageY, timeStamp: event.timeStamp})
})
window.addEventListener(
  'touchend',
  (event) => {
    const touch = event.changedTouches[0]
    if (touch == null) return
    stageTouchEnd({
      timeStamp: event.timeStamp,
      touches: [],
      changedTouches: [{pageX: touch.pageX, pageY: touch.pageY}],
    })
  },
  {passive: false},
)
window.addEventListener(
  'touchcancel',
  (event) => {
    const touch = event.changedTouches[0]
    if (touch == null) return
    stageTouchCancel({
      timeStamp: event.timeStamp,
      touches: [],
      changedTouches: [{pageX: touch.pageX, pageY: touch.pageY}],
    })
  },
  {passive: false},
)
window.addEventListener('mousemove', (event) => {
  stageMouseMove({pageX: event.pageX, pageY: event.pageY, timeStamp: event.timeStamp})
})
window.addEventListener(
  'touchmove',
  (event) => {
    const touch = event.touches[0]
    if (touch == null) return
    if (st.drag != null) event.preventDefault()
    stageTouchMove({
      timeStamp: event.timeStamp,
      touches: [{pageX: touch.pageX, pageY: touch.pageY}],
      changedTouches: [{pageX: touch.pageX, pageY: touch.pageY}],
    })
  },
  {passive: false},
)
window.addEventListener('pointerdown', (event) => {
  stagePointerDown({pageX: event.pageX, pageY: event.pageY, timeStamp: event.timeStamp})
})

if (scenario !== '') {
  publishReport({phase: 'loading', requestId, scenario})
}

scheduleRender()

if (scenario !== '') {
  void runScenario()
}

function createMarker(className: string) {
  const node = document.createElement('div')
  node.className = className
  return node
}

function spring(pos: number): Spring {
  return {pos, dest: pos, v: 0, k: springStiffness, b: springDamping}
}

function springStep(config: Spring) {
  const t = msPerAnimationStep / 1000
  const springForce = -config.k * (config.pos - config.dest)
  const damperForce = -config.b * config.v
  const acceleration = springForce + damperForce
  config.v += acceleration * t
  config.pos += config.v * t
}

function springGoToEnd(config: Spring) {
  config.pos = config.dest
  config.v = 0
}

function isSpringSettled(config: Spring) {
  return Math.abs(config.v) < 0.01 && Math.abs(config.dest - config.pos) < 0.01
}

function scheduleRender() {
  if (scheduledRaf != null) return
  scheduledRaf = requestAnimationFrame((now) => {
    scheduledRaf = null
    if (render(now)) scheduleRender()
  })
}

function render(now: number) {
  if (st.events.mouseup != null || st.events.touchend != null || st.events.touchcancel != null) {
    st.pointerState = 'up'
  }
  if (st.events.mouseup != null) {
    st.pointer.push({x: st.events.mouseup.pageX, y: st.events.mouseup.pageY, time: st.events.mouseup.timeStamp})
  }
  if (st.events.touchend != null) {
    const touch = st.events.touchend.changedTouches[0]
    if (touch != null) st.pointer.push({x: touch.pageX, y: touch.pageY, time: st.events.touchend.timeStamp})
  }
  if (st.events.touchcancel != null) {
    const touch = st.events.touchcancel.changedTouches[0]
    if (touch != null) st.pointer.push({x: touch.pageX, y: touch.pageY, time: st.events.touchcancel.timeStamp})
  }
  if (st.events.mousemove != null) {
    st.pointer.push({x: st.events.mousemove.pageX, y: st.events.mousemove.pageY, time: st.events.mousemove.timeStamp})
  }
  if (st.events.touchmove != null) {
    const touch = st.events.touchmove.touches[0]
    if (touch != null) st.pointer.push({x: touch.pageX, y: touch.pageY, time: st.events.touchmove.timeStamp})
  }
  if (st.events.pointerdown != null) {
    st.pointerState = 'firstDown'
    st.pointer.push({x: st.events.pointerdown.pageX, y: st.events.pointerdown.pageY, time: st.events.pointerdown.timeStamp})
  }

  const viewport = getViewport()
  const corners = getCornerTargets(viewport)
  const pointerLast = st.pointer.at(-1)!

  let nextDrag: DragState | null
  if (st.pointerState === 'down') {
    nextDrag = st.drag
  } else if (st.pointerState === 'up') {
    nextDrag = null
    if (st.drag != null) {
      const velocity = estimateReleaseVelocity(st.pointer)
      const currentPosition = {x: st.pip.x.pos, y: st.pip.y.pos}
      const restPosition = computeDecayRestPosition({
        position: currentPosition,
        velocity,
        friction: decayFriction,
      })
      const chosenCorner = chooseNearestCorner(corners, restPosition)

      st.restPosition = restPosition
      st.chosenCornerId = chosenCorner.id
      st.snapCornerId = chosenCorner.id
      st.pip.x.dest = chosenCorner.x
      st.pip.y.dest = chosenCorner.y
      st.pip.x.v = velocity.x
      st.pip.y.v = velocity.y
    }
  } else {
    if (hitTest(pointerLast)) {
      nextDrag = {
        deltaX: pointerLast.x - st.pip.x.pos,
        deltaY: pointerLast.y - st.pip.y.pos,
      }
    } else {
      nextDrag = null
    }
  }

  if (nextDrag != null) {
    st.restPosition = null
    st.chosenCornerId = null
    const x = pointerLast.x - nextDrag.deltaX
    const y = pointerLast.y - nextDrag.deltaY
    st.pip.x.pos = st.pip.x.dest = x
    st.pip.y.pos = st.pip.y.dest = y
    st.pip.x.v = 0
    st.pip.y.v = 0
  } else {
    const snapCorner = corners.find((corner) => corner.id === st.snapCornerId) ?? corners[0]!
    st.pip.x.dest = snapCorner.x
    st.pip.y.dest = snapCorner.y
  }

  let animatedUntilTime = st.animatedUntilTime ?? now
  const steps = Math.min(300, Math.floor((now - animatedUntilTime) / msPerAnimationStep))
  animatedUntilTime += steps * msPerAnimationStep

  let springAnimating = false
  for (let i = 0; i < steps; i++) {
    if (nextDrag == null) {
      springStep(st.pip.x)
      springStep(st.pip.y)
    }
  }

  if (isSpringSettled(st.pip.x)) springGoToEnd(st.pip.x)
  else springAnimating = true

  if (isSpringSettled(st.pip.y)) springGoToEnd(st.pip.y)
  else springAnimating = true

  renderDom(viewport)

  if (st.pointerState === 'firstDown') st.pointerState = 'down'
  st.drag = nextDrag
  st.animatedUntilTime = springAnimating ? animatedUntilTime : null

  if (st.pointerState === 'up') {
    st.pointer = [{x: 0, y: 0, time: 0}]
  }
  if (st.pointer.length > 20) st.pointer.splice(0, st.pointer.length - 20)

  st.events.mouseup = null
  st.events.touchend = null
  st.events.touchcancel = null
  st.events.mousemove = null
  st.events.touchmove = null
  st.events.pointerdown = null

  return nextDrag != null || springAnimating
}

function renderDom(viewport: {width: number; height: number}) {
  const markerPositions = [
    {x: cornerPad, y: cornerPad},
    {x: viewport.width - cornerPad - cornerMarkerSize, y: cornerPad},
    {x: cornerPad, y: viewport.height - cornerPad - cornerMarkerSize},
    {
      x: viewport.width - cornerPad - cornerMarkerSize,
      y: viewport.height - cornerPad - cornerMarkerSize,
    },
  ]

  for (let i = 0; i < cornerNodes.length; i++) {
    const marker = markerPositions[i]!
    cornerNodes[i]!.style.transform = `translate3d(${marker.x}px, ${marker.y}px, 0)`
  }

  pipNode.style.transform = `translate3d(${st.pip.x.pos}px, ${st.pip.y.pos}px, 0)`
  pipNode.style.cursor = st.drag != null ? 'grabbing' : hitTest(st.pointer.at(-1)!) ? 'grab' : 'default'
  pipNode.style.boxShadow =
    st.drag != null
      ? '0 30px 80px rgba(0, 0, 0, 0.42), inset 0 1px 0 rgba(255, 255, 255, 0.7)'
      : '0 22px 60px rgba(0, 0, 0, 0.35), inset 0 1px 0 rgba(255, 255, 255, 0.7)'

  if (st.restPosition == null) {
    restNode.style.opacity = '0'
  } else {
    restNode.style.opacity = '1'
    restNode.style.transform = `translate3d(${st.restPosition.x}px, ${st.restPosition.y}px, 0)`
  }
}

function hitTest(point: Point) {
  return (
    st.pip.x.pos <= point.x &&
    point.x < st.pip.x.pos + pipWidth &&
    st.pip.y.pos <= point.y &&
    point.y < st.pip.y.pos + pipHeight
  )
}

function getViewport() {
  return {
    width: document.documentElement.clientWidth,
    height: document.documentElement.clientHeight,
  }
}

function stagePointerDown(event: PointerDownEventData) {
  st.events.pointerdown = event
  scheduleRender()
}

function stageMouseMove(event: MouseEventData) {
  st.events.mousemove = event
  scheduleRender()
}

function stageMouseUp(event: MouseEventData) {
  st.events.mouseup = event
  scheduleRender()
}

function stageTouchMove(event: TouchEventData) {
  st.events.touchmove = event
  scheduleRender()
}

function stageTouchEnd(event: TouchEventData) {
  st.events.touchend = event
  scheduleRender()
}

function stageTouchCancel(event: TouchEventData) {
  st.events.touchcancel = event
  scheduleRender()
}

function publishReport(report: Report) {
  if (requestId === '') return
  location.hash = `report=${encodeURIComponent(JSON.stringify(report))}`
}

async function runScenario() {
  publishReport({phase: 'running', requestId, scenario})

  try {
    await waitFor(() => scheduledRaf == null, 1_000)

    if (scenario === 'drag-under-pointer-touchcancel') {
      await runDragUnderPointerTouchCancelScenario()
    } else if (scenario === 'flick-upper-right-mouseup') {
      await runFlickUpperRightMouseUpScenario()
    } else if (scenario === 'flick-lower-right-touchend') {
      await runFlickLowerRightTouchEndScenario()
    } else {
      throw new Error(`Unknown scenario: ${scenario}`)
    }
  } catch (error) {
    publishReport({
      phase: 'error',
      requestId,
      scenario,
      message: error instanceof Error ? error.message : String(error),
    })
  }
}

async function runDragUnderPointerTouchCancelScenario() {
  st.maxDragOffsetError = 0
  const start = getPointerInsidePip(78, 36)
  stagePointerDown({pageX: start.x, pageY: start.y, timeStamp: 1_000})
  await nextFrame()

  const moves = [
    {x: start.x + 42, y: start.y - 16, time: 1_040},
    {x: start.x + 62, y: start.y - 26, time: 1_080},
    {x: start.x + 72, y: start.y - 31, time: 1_100},
  ]

  for (const move of moves) {
    stageMouseMove({pageX: move.x, pageY: move.y, timeStamp: move.time})
    await nextFrame()
    measureDragError(move)
  }

  const end = moves.at(-1)!
  stageTouchCancel({
    timeStamp: 1_100,
    touches: [],
    changedTouches: [{pageX: end.x, pageY: end.y}],
  })
  await waitUntilSettled()
  publishScenarioReady('touchcancel')
}

async function runFlickUpperRightMouseUpScenario() {
  const start = getPointerInsidePip(78, 36)
  stagePointerDown({pageX: start.x, pageY: start.y, timeStamp: 2_000})
  await nextFrame()

  const moves = [
    {x: start.x + 112, y: start.y - 116, time: 2_030},
    {x: start.x + 202, y: start.y - 236, time: 2_060},
    {x: start.x + 282, y: start.y - 356, time: 2_080},
  ]

  for (const move of moves) {
    stageMouseMove({pageX: move.x, pageY: move.y, timeStamp: move.time})
    await nextFrame()
  }

  const end = {x: start.x + 322, y: start.y - 386, time: 2_090}
  stageMouseUp({pageX: end.x, pageY: end.y, timeStamp: end.time})
  await waitUntilSettled()
  publishScenarioReady('mouseup')
}

async function runFlickLowerRightTouchEndScenario() {
  const start = getPointerInsidePip(78, 36)
  stagePointerDown({pageX: start.x, pageY: start.y, timeStamp: 3_000})
  await nextFrame()

  const moves = [
    {x: start.x + 72, y: start.y + 4, time: 3_060},
    {x: start.x + 162, y: start.y + 9, time: 3_140},
    {x: start.x + 252, y: start.y + 14, time: 3_220},
  ]

  for (const move of moves) {
    stageTouchMove({
      timeStamp: move.time,
      touches: [{pageX: move.x, pageY: move.y}],
      changedTouches: [{pageX: move.x, pageY: move.y}],
    })
    await nextFrame()
  }

  const end = {x: start.x + 282, y: start.y + 24, time: 3_260}
  stageTouchEnd({
    timeStamp: end.time,
    touches: [],
    changedTouches: [{pageX: end.x, pageY: end.y}],
  })
  await waitUntilSettled()
  publishScenarioReady('touchend')
}

function publishScenarioReady(completedWith: 'mouseup' | 'touchend' | 'touchcancel') {
  const viewport = getViewport()
  const corners = getCornerTargets(viewport)
  const finalPosition = {x: st.pip.x.pos, y: st.pip.y.pos}

  publishReport({
    phase: 'ready',
    requestId,
    scenario,
    viewport,
    completedWith,
    chosenCornerId: st.chosenCornerId,
    finalCornerId: chooseNearestCorner(corners, finalPosition).id,
    restPosition: st.restPosition,
    finalPosition,
    maxDragOffsetError: st.maxDragOffsetError,
    restMarkerVisible: st.restPosition != null,
  })
}

function getPointerInsidePip(offsetX: number, offsetY: number) {
  return {
    x: st.pip.x.pos + offsetX,
    y: st.pip.y.pos + offsetY,
  }
}

function measureDragError(pointer: Point) {
  if (st.drag == null) return

  const expectedX = pointer.x - st.drag.deltaX
  const expectedY = pointer.y - st.drag.deltaY
  const error = Math.max(Math.abs(st.pip.x.pos - expectedX), Math.abs(st.pip.y.pos - expectedY))
  st.maxDragOffsetError = Math.max(st.maxDragOffsetError, error)
}

async function waitUntilSettled() {
  await waitFor(() => st.drag == null && isSpringSettled(st.pip.x) && isSpringSettled(st.pip.y), 4_000)
}

function nextFrame() {
  return new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)))
}

async function waitFor(predicate: () => boolean, timeoutMs: number) {
  const deadline = performance.now() + timeoutMs
  while (performance.now() < deadline) {
    if (predicate()) return
    await nextFrame()
  }
  throw new Error(`Timed out waiting for ${scenario || 'gesture state'} to settle`)
}
