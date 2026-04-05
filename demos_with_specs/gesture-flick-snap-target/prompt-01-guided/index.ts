import {
  CARD_HEIGHT,
  CARD_WIDTH,
  CORNER_MARKER_SIZE,
  DECAY_FRICTION,
  REST_MARKER_SIZE,
  chooseNearestCorner,
  computeDecayRestPosition,
  estimateReleaseVelocity,
  getCornerTargets,
  isSpringSettled,
  roundPoint,
  spring,
  springGoToEnd,
  springStep,
  type CornerId,
  type Point,
  type PointerSample,
  type SpringConfig,
} from './gesture-flick-snap-target'

type DragInfo = {
  id: 'pip'
  deltaX: number
  deltaY: number
}

type PointerState = 'up' | 'down' | 'firstDown'
type ReleaseKind = 'mouseup' | 'touchend' | 'touchcancel'

type Report = {
  phase: 'loading' | 'running' | 'ready' | 'error'
  requestId: string
  scenario: string
  chosenCorner?: CornerId
  restPoint?: Point | null
  settledCard?: Point
  targetCard?: Point
  dragFollow?: {
    pointer: Point
    card: Point
    offset: Point
  }
  releaseKind?: ReleaseKind
  message?: string
}

type StagedEvents = {
  mouseup: PointerSample | null
  touchend: PointerSample | null
  touchcancel: PointerSample | null
  mousemove: PointerSample | null
  touchmove: PointerSample | null
  pointerdown: PointerSample | null
}

type State = {
  animatedUntilTime: number | null
  dragged: DragInfo | null
  lastDragged: DragInfo | null
  pointerState: PointerState
  pointer: PointerSample[]
  restPoint: Point | null
  snapCornerId: CornerId
  events: StagedEvents
  card: {
    id: 'pip'
    x: SpringConfig
    y: SpringConfig
    scale: SpringConfig
  }
}

const scenario = new URLSearchParams(location.search).get('scenario') ?? ''
const requestId = new URLSearchParams(location.search).get('requestId') ?? ''
const cardNode = document.createElement('div')
const restMarkerNode = document.createElement('div')
const cornerNodes = getCornerTargets(window.innerWidth, window.innerHeight).map(corner => {
  const node = document.createElement('div')
  node.className = 'corner-marker'
  node.dataset.cornerId = corner.id
  node.style.width = `${CORNER_MARKER_SIZE}px`
  node.style.height = `${CORNER_MARKER_SIZE}px`
  document.body.appendChild(node)
  return {id: corner.id, node}
})

cardNode.className = 'pip-card'
cardNode.textContent = 'PiP'
cardNode.style.width = `${CARD_WIDTH}px`
cardNode.style.height = `${CARD_HEIGHT}px`
restMarkerNode.className = 'rest-marker'
restMarkerNode.style.width = `${REST_MARKER_SIZE}px`
restMarkerNode.style.height = `${REST_MARKER_SIZE}px`
document.body.appendChild(restMarkerNode)
document.body.appendChild(cardNode)

let scheduledRaf: number | null = null
let runningScenario = false

const initialCorner = getCornerTargets(
  document.documentElement.clientWidth,
  document.documentElement.clientHeight,
).find(corner => corner.id === 'bottom-left')!

const st: State = {
  animatedUntilTime: null,
  dragged: null,
  lastDragged: null,
  pointerState: 'up',
  pointer: [{x: 0, y: 0, time: 0}],
  restPoint: null,
  snapCornerId: 'bottom-left',
  events: {
    mouseup: null,
    touchend: null,
    touchcancel: null,
    mousemove: null,
    touchmove: null,
    pointerdown: null,
  },
  card: {
    id: 'pip',
    x: spring(initialCorner.card.x),
    y: spring(initialCorner.card.y),
    scale: spring(1),
  },
}

function scheduleRender() {
  if (scheduledRaf != null) return
  scheduledRaf = requestAnimationFrame(function renderAndMaybeScheduleAnotherRender(now) {
    scheduledRaf = null
    if (render(now)) scheduleRender()
  })
}

function springForEach(run: (springConfig: SpringConfig) => void) {
  run(st.card.x)
  run(st.card.y)
  run(st.card.scale)
}

function stagePointerDown(sample: PointerSample) {
  st.events.pointerdown = sample
  scheduleRender()
}

function stageMouseMove(sample: PointerSample) {
  st.events.mousemove = sample
  scheduleRender()
}

function stageTouchMove(sample: PointerSample) {
  st.events.touchmove = sample
  scheduleRender()
}

function stageRelease(kind: ReleaseKind, sample: PointerSample) {
  st.events[kind] = sample
  scheduleRender()
}

window.addEventListener('resize', () => scheduleRender())
window.addEventListener('pointerdown', event => {
  if (event.pointerType === 'mouse' && event.button !== 0) return
  stagePointerDown({x: event.pageX, y: event.pageY, time: event.timeStamp})
})
window.addEventListener('mousemove', event => {
  stageMouseMove({x: event.pageX, y: event.pageY, time: event.timeStamp})
})
window.addEventListener('mouseup', event => {
  stageRelease('mouseup', {x: event.pageX, y: event.pageY, time: event.timeStamp})
})
window.addEventListener('touchmove', event => {
  const touch = event.touches[0]
  if (touch == null) return
  event.preventDefault()
  stageTouchMove({x: touch.pageX, y: touch.pageY, time: event.timeStamp})
}, {passive: false})
window.addEventListener('touchend', event => {
  const touch = event.changedTouches[0]
  if (touch == null) return
  event.preventDefault()
  stageRelease('touchend', {x: touch.pageX, y: touch.pageY, time: event.timeStamp})
}, {passive: false})
window.addEventListener('touchcancel', event => {
  const touch = event.changedTouches[0]
  if (touch == null) return
  event.preventDefault()
  stageRelease('touchcancel', {x: touch.pageX, y: touch.pageY, time: event.timeStamp})
}, {passive: false})

function hitTest(pointer: PointerSample) {
  return (
    st.card.x.pos <= pointer.x &&
    pointer.x < st.card.x.pos + CARD_WIDTH &&
    st.card.y.pos <= pointer.y &&
    pointer.y < st.card.y.pos + CARD_HEIGHT
  )
}

function render(now: number) {
  if (st.events.mouseup != null || st.events.touchend != null || st.events.touchcancel != null) {
    st.pointerState = 'up'
  }
  if (st.events.mouseup != null) st.pointer.push(st.events.mouseup)
  if (st.events.touchend != null) st.pointer.push(st.events.touchend)
  if (st.events.touchcancel != null) st.pointer.push(st.events.touchcancel)
  if (st.events.mousemove != null) st.pointer.push(st.events.mousemove)
  if (st.events.touchmove != null) st.pointer.push(st.events.touchmove)
  if (st.events.pointerdown != null && st.pointerState === 'up') {
    st.pointerState = 'firstDown'
    st.pointer.push(st.events.pointerdown)
  }

  const viewportWidth = document.documentElement.clientWidth
  const viewportHeight = document.documentElement.clientHeight
  const corners = getCornerTargets(viewportWidth, viewportHeight)
  const pointerLast = st.pointer.at(-1)!

  let newDragged: DragInfo | null
  let newSnapCornerId = st.snapCornerId
  let newRestPoint = st.restPoint

  if (st.pointerState === 'down') {
    newDragged = st.dragged
  } else if (st.pointerState === 'up') {
    if (st.dragged != null) {
      const velocity = estimateReleaseVelocity(st.pointer)
      const restPoint = computeDecayRestPosition(
        {x: st.card.x.pos, y: st.card.y.pos},
        velocity,
        DECAY_FRICTION,
      )
      const nearestCorner = chooseNearestCorner(corners, restPoint)

      st.card.x.v += velocity.x
      st.card.y.v += velocity.y
      newSnapCornerId = nearestCorner.id
      newRestPoint = restPoint
    }
    newDragged = null
  } else if (hitTest(pointerLast)) {
    newDragged = {
      id: 'pip',
      deltaX: pointerLast.x - st.card.x.pos,
      deltaY: pointerLast.y - st.card.y.pos,
    }
    newRestPoint = null
  } else {
    newDragged = null
  }

  const targetCorner = corners.find(corner => corner.id === newSnapCornerId)!
  if (newDragged != null) {
    const nextX = pointerLast.x - newDragged.deltaX
    const nextY = pointerLast.y - newDragged.deltaY
    st.card.x.pos = st.card.x.dest = nextX
    st.card.y.pos = st.card.y.dest = nextY
    st.card.scale.dest = 1.04
  } else {
    st.card.x.dest = targetCorner.card.x
    st.card.y.dest = targetCorner.card.y
    st.card.scale.dest = 1
  }

  let newAnimatedUntilTime = st.animatedUntilTime ?? now
  const steps = Math.min(300, Math.floor((now - newAnimatedUntilTime) / 4))
  newAnimatedUntilTime += steps * 4

  let stillAnimating = false
  springForEach(springConfig => {
    for (let i = 0; i < steps; i++) springStep(springConfig)
    if (isSpringSettled(springConfig)) springGoToEnd(springConfig)
    else stillAnimating = true
  })

  const cardIsSettled =
    isSpringSettled(st.card.x) &&
    isSpringSettled(st.card.y) &&
    isSpringSettled(st.card.scale)

  for (const corner of corners) {
    const cornerNode = cornerNodes.find(candidate => candidate.id === corner.id)!.node
    cornerNode.style.transform = `translate3d(${corner.marker.x - CORNER_MARKER_SIZE / 2}px, ${corner.marker.y - CORNER_MARKER_SIZE / 2}px, 0)`
  }

  restMarkerNode.style.display = newRestPoint == null ? 'none' : 'block'
  if (newRestPoint != null) {
    restMarkerNode.style.transform = `translate3d(${newRestPoint.x - REST_MARKER_SIZE / 2}px, ${newRestPoint.y - REST_MARKER_SIZE / 2}px, 0)`
  }

  cardNode.style.transform = `translate3d(${st.card.x.pos}px, ${st.card.y.pos}px, 0) scale(${st.card.scale.pos})`
  cardNode.style.zIndex =
    newDragged != null ? '3'
    : st.lastDragged != null ? '2'
    : '1'
  cardNode.style.boxShadow =
    newDragged != null
      ? '0 28px 48px rgba(0, 0, 0, 0.4)'
      : st.lastDragged != null
        ? '0 20px 36px rgba(0, 0, 0, 0.34)'
        : '0 18px 40px rgba(0, 0, 0, 0.32)'
  document.body.style.cursor =
    newDragged != null ? 'grabbing'
    : hitTest(pointerLast) ? 'grab'
    : 'auto'

  if (st.pointerState === 'firstDown') st.pointerState = 'down'
  if (st.dragged != null && newDragged == null) st.lastDragged = st.dragged
  else if (newDragged != null) st.lastDragged = null
  else if (st.lastDragged != null && cardIsSettled) st.lastDragged = null

  st.dragged = newDragged
  st.snapCornerId = newSnapCornerId
  st.restPoint = newRestPoint
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

scheduleRender()

if (scenario !== '' && requestId !== '') {
  publishReport({phase: 'loading', requestId, scenario})
  void runScenario(scenario, requestId)
}

async function runScenario(activeScenario: string, activeRequestId: string) {
  if (runningScenario) return
  runningScenario = true
  publishReport({phase: 'running', requestId: activeRequestId, scenario: activeScenario})

  try {
    let report: Omit<Report, 'phase' | 'requestId' | 'scenario'>
    if (activeScenario === 'drag-under-pointer') {
      report = await runDragUnderPointerScenario()
    } else if (activeScenario === 'flick-upper-right') {
      report = await runFlickUpperRightScenario()
    } else if (activeScenario === 'slow-lower-right') {
      report = await runLowerRightScenario('touchend')
    } else if (activeScenario === 'touchcancel-lower-right') {
      report = await runLowerRightScenario('touchcancel')
    } else {
      throw new Error(`unknown scenario: ${activeScenario}`)
    }

    publishReport({
      phase: 'ready',
      requestId: activeRequestId,
      scenario: activeScenario,
      ...report,
    })
  } catch (error) {
    publishReport({
      phase: 'error',
      requestId: activeRequestId,
      scenario: activeScenario,
      message: error instanceof Error ? error.message : String(error),
    })
  } finally {
    runningScenario = false
  }
}

async function runDragUnderPointerScenario(): Promise<Omit<Report, 'phase' | 'requestId' | 'scenario'>> {
  const bottomLeft = getCornerTargets(
    document.documentElement.clientWidth,
    document.documentElement.clientHeight,
  ).find(corner => corner.id === 'bottom-left')!
  let clock = performance.now()
  const start = {x: bottomLeft.card.x + 32, y: bottomLeft.card.y + 24}
  const dragPointer = {x: start.x + 220, y: start.y - 150}

  stagePointerDown({x: start.x, y: start.y, time: clock})
  await waitForFrames(2)
  clock += 16
  stageMouseMove({x: dragPointer.x, y: dragPointer.y, time: clock})
  await waitForFrames(2)

  const dragFollow = {
    pointer: roundPoint(dragPointer),
    card: roundPoint({x: st.card.x.pos, y: st.card.y.pos}),
    offset: roundPoint({
      x: st.dragged?.deltaX ?? 0,
      y: st.dragged?.deltaY ?? 0,
    }),
  }

  clock += 16
  stageRelease('mouseup', {x: dragPointer.x, y: dragPointer.y, time: clock})
  await waitUntilSettled()

  return {
    dragFollow,
    chosenCorner: st.snapCornerId,
    restPoint: st.restPoint == null ? null : roundPoint(st.restPoint),
    settledCard: roundPoint({x: st.card.x.pos, y: st.card.y.pos}),
    targetCard: roundPoint(currentTargetCard()),
    releaseKind: 'mouseup',
  }
}

async function runFlickUpperRightScenario(): Promise<Omit<Report, 'phase' | 'requestId' | 'scenario'>> {
  const bottomLeft = getCornerTargets(
    document.documentElement.clientWidth,
    document.documentElement.clientHeight,
  ).find(corner => corner.id === 'bottom-left')!
  let clock = performance.now()
  const start = {x: bottomLeft.card.x + 60, y: bottomLeft.card.y + 40}

  stagePointerDown({x: start.x, y: start.y, time: clock})
  await waitForFrames(2)
  clock += 16
  stageMouseMove({x: start.x + 280, y: start.y - 180, time: clock})
  await waitForFrames(2)
  clock += 16
  stageMouseMove({x: start.x + 520, y: start.y - 360, time: clock})
  await waitForFrames(2)
  clock += 16
  stageRelease('mouseup', {x: start.x + 660, y: start.y - 470, time: clock})
  await waitUntilSettled()

  return {
    chosenCorner: st.snapCornerId,
    restPoint: st.restPoint == null ? null : roundPoint(st.restPoint),
    settledCard: roundPoint({x: st.card.x.pos, y: st.card.y.pos}),
    targetCard: roundPoint(currentTargetCard()),
    releaseKind: 'mouseup',
  }
}

async function runLowerRightScenario(
  releaseKind: 'touchend' | 'touchcancel',
): Promise<Omit<Report, 'phase' | 'requestId' | 'scenario'>> {
  const bottomLeft = getCornerTargets(
    document.documentElement.clientWidth,
    document.documentElement.clientHeight,
  ).find(corner => corner.id === 'bottom-left')!
  let clock = performance.now()
  const start = {x: bottomLeft.card.x + 60, y: bottomLeft.card.y + 40}

  stagePointerDown({x: start.x, y: start.y, time: clock})
  await waitForFrames(2)
  clock += 120
  stageTouchMove({x: start.x + 620, y: start.y - 8, time: clock})
  await waitForFrames(2)
  clock += 80
  stageTouchMove({x: start.x + 760, y: start.y - 6, time: clock})
  await waitForFrames(2)
  clock += 80
  stageRelease(releaseKind, {x: start.x + 800, y: start.y - 6, time: clock})
  await waitUntilSettled()

  return {
    chosenCorner: st.snapCornerId,
    restPoint: st.restPoint == null ? null : roundPoint(st.restPoint),
    settledCard: roundPoint({x: st.card.x.pos, y: st.card.y.pos}),
    targetCard: roundPoint(currentTargetCard()),
    releaseKind,
  }
}

function currentTargetCard(): Point {
  return getCornerTargets(
    document.documentElement.clientWidth,
    document.documentElement.clientHeight,
  ).find(corner => corner.id === st.snapCornerId)!.card
}

function publishReport(report: Report) {
  location.hash = `report=${encodeURIComponent(JSON.stringify(report))}`
}

function nextFrame() {
  return new Promise<number>(resolve => requestAnimationFrame(resolve))
}

async function waitForFrames(frameCount: number) {
  for (let i = 0; i < frameCount; i++) {
    await nextFrame()
  }
}

async function waitUntilSettled(timeoutMs = 4_000) {
  const deadline = performance.now() + timeoutMs
  while (performance.now() < deadline) {
    await nextFrame()
    if (
      st.dragged == null &&
      isSpringSettled(st.card.x) &&
      isSpringSettled(st.card.y) &&
      isSpringSettled(st.card.scale)
    ) {
      return
    }
  }

  throw new Error('card never settled')
}
