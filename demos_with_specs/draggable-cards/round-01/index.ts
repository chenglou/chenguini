import {
  CARD_COUNT,
  CARD_WIDTH,
  STACK_TOP,
  estimateReleaseVelocity,
  getCardHeight,
  getCardLightnessBase,
  getCenteredX,
  reorderWhileDragging,
  type CardLayout,
  type PointerSample,
} from './model'
} from './model.ts'

const msPerAnimationStep = 4
const positionStiffness = 290
const positionDamping = 24
const scaleStiffness = 240
const scaleDamping = 20
const settleVelocity = 8
const settleDistance = 0.2
const dragScale = 1.1
const maxPointerSamples = 20

type Spring = {
  pos: number
  dest: number
  v: number
  k: number
  b: number
}

type CardState = {
  id: number
  height: number
  lightnessBase: number
  x: Spring
  y: Spring
  scale: Spring
  node: HTMLDivElement
}

type DragState = {
  id: number
  deltaX: number
  deltaY: number
}

type PointerFact = {
  x: number
  y: number
  time: number
}

type Report = {
  status: 'ready' | 'error'
  requestId: string
  message?: string
  scenario?: string
  initialOrder?: number[]
  finalOrder?: number[]
  swapOccurred?: boolean
  draggedId?: number | null
  lastDraggedId?: number | null
  cursor?: string
  duringSettle?: ReportSnapshot
  afterSettle?: ReportSnapshot
}

type ReportSnapshot = {
  draggedId: number | null
  lastDraggedId: number | null
  zOrder: number[]
  isAnimating: boolean
}

type State = {
  cards: CardState[]
  order: number[]
  drag: DragState | null
  lastDraggedId: number | null
  hoveredId: number | null
  pointer: {
    x: number
    y: number
    hasPosition: boolean
    isDown: boolean
  }
  pointerSamples: PointerSample[]
  events: {
    pointerDown: PointerFact | null
    pointerUp: PointerFact | null
  }
  scheduledRaf: number | null
  animatedUntilTime: number | null
  cursor: string
  scenarioStarted: boolean
}

function spring(position: number, destination = position, velocity = 0, stiffness = positionStiffness, damping = positionDamping): Spring {
  return { pos: position, dest: destination, v: velocity, k: stiffness, b: damping }
}

function springStep(springState: Spring) {
  const t = msPerAnimationStep / 1000
  const springForce = -springState.k * (springState.pos - springState.dest)
  const damperForce = -springState.b * springState.v
  const nextVelocity = springState.v + (springForce + damperForce) * t
  const nextPosition = springState.pos + nextVelocity * t
  springState.pos = nextPosition
  springState.v = nextVelocity
}

function springMostlyDone(springState: Spring) {
  return Math.abs(springState.v) < settleVelocity && Math.abs(springState.dest - springState.pos) < settleDistance
}

function springGoToEnd(springState: Spring) {
  springState.pos = springState.dest
  springState.v = 0
}

const cards = Array.from({ length: CARD_COUNT }, (_, id) => {
  const height = getCardHeight(id)
  const node = document.createElement('div')
  node.className = 'card'
  node.textContent = `Drag Me ${id}`
  document.body.appendChild(node)
  return {
    id,
    height,
    lightnessBase: getCardLightnessBase(id),
    x: spring(0),
    y: spring(0),
    scale: spring(1, 1, 0, scaleStiffness, scaleDamping),
    node,
  }
})

const state: State = {
  cards,
  order: cards.map((card) => card.id),
  drag: null,
  lastDraggedId: null,
  hoveredId: null,
  pointer: { x: 0, y: 0, hasPosition: false, isDown: false },
  pointerSamples: [],
  events: { pointerDown: null, pointerUp: null },
  scheduledRaf: null,
  animatedUntilTime: null,
  cursor: 'auto',
  scenarioStarted: false,
}

initializeCardPositions()
installEvents()
scheduleRender()
maybeStartScenario()

function initializeCardPositions() {
  const centeredX = getCenteredX(document.documentElement.clientWidth)
  const layout = getRestLayout(state.order)
  for (const card of state.cards) {
    const target = layout.find((entry) => entry.id === card.id)
    if (target == null) continue
    card.x.pos = centeredX
    card.x.dest = centeredX
    card.y.pos = target.top
    card.y.dest = target.top
  }
}

function installEvents() {
  window.addEventListener('resize', scheduleRender)
  window.addEventListener('pointerdown', (event) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return
    acceptPointerDown({ x: event.pageX, y: event.pageY, time: event.timeStamp })
  })
  window.addEventListener('pointermove', (event) => {
    acceptPointerMove({ x: event.pageX, y: event.pageY, time: event.timeStamp })
  })
  window.addEventListener('pointerup', (event) => {
    acceptPointerUp({ x: event.pageX, y: event.pageY, time: event.timeStamp })
  })
  window.addEventListener('pointercancel', (event) => {
    acceptPointerUp({ x: event.pageX, y: event.pageY, time: event.timeStamp })
  })
  window.addEventListener('touchmove', (event) => {
    const touch = event.touches[0]
    if (touch == null) return
    acceptPointerMove({ x: touch.pageX, y: touch.pageY, time: event.timeStamp })
  }, { passive: true })
  window.addEventListener('touchend', (event) => {
    const touch = event.changedTouches[0]
    if (touch == null) return
    acceptPointerUp({ x: touch.pageX, y: touch.pageY, time: event.timeStamp })
  })
}

function acceptPointerDown(point: PointerFact) {
  state.pointer.x = point.x
  state.pointer.y = point.y
  state.pointer.hasPosition = true
  state.pointer.isDown = true
  state.pointerSamples = [{ x: point.x, y: point.y, time: point.time }]
  state.events.pointerDown = point
  scheduleRender()
}

function acceptPointerMove(point: PointerFact) {
  state.pointer.x = point.x
  state.pointer.y = point.y
  state.pointer.hasPosition = true
  if (state.pointer.isDown || state.drag != null) {
    pushPointerSample({ x: point.x, y: point.y, time: point.time })
  }
  scheduleRender()
}

function acceptPointerUp(point: PointerFact) {
  state.pointer.x = point.x
  state.pointer.y = point.y
  state.pointer.hasPosition = true
  state.pointer.isDown = false
  pushPointerSample({ x: point.x, y: point.y, time: point.time })
  state.events.pointerUp = point
  scheduleRender()
}

function pushPointerSample(sample: PointerSample) {
  state.pointerSamples.push(sample)
  if (state.pointerSamples.length > maxPointerSamples) state.pointerSamples.shift()
}

function scheduleRender() {
  if (state.scheduledRaf != null) return
  state.scheduledRaf = requestAnimationFrame(render)
}

function render(now: number) {
  state.scheduledRaf = null

  const windowWidth = document.documentElement.clientWidth
  const centeredX = getCenteredX(windowWidth)

  let order = state.order
  let drag = state.drag
  let lastDraggedId = state.lastDraggedId
  let hoveredId = state.hoveredId

  if (state.events.pointerDown != null) {
    const hitId = hitTestCard(state.events.pointerDown.x, state.events.pointerDown.y)
    if (hitId != null) {
      const card = state.cards[hitId]
      const rect = getVisualRect(card)
      drag = {
        id: hitId,
        deltaX: state.events.pointerDown.x - rect.left,
        deltaY: state.events.pointerDown.y - rect.top,
      }
      lastDraggedId = hitId === lastDraggedId ? null : lastDraggedId
      hoveredId = hitId
    }
  }

  if (drag != null) {
    const layoutBeforeSwap = getRestLayout(order)
    const draggedCard = state.cards[drag.id]
    const rawX = state.pointer.x - drag.deltaX
    const dragX = rawX + (centeredX - rawX) / 1.5
    const dragY = state.pointer.y - drag.deltaY

    draggedCard.x.pos = dragX
    draggedCard.x.dest = dragX
    draggedCard.y.pos = dragY
    draggedCard.y.dest = dragY

    const reorderResult = reorderWhileDragging({
      order,
      draggedId: drag.id,
      pointerY: state.pointer.y,
      layout: layoutBeforeSwap,
    })
    order = reorderResult.order
  }

  if (state.events.pointerUp != null && drag != null) {
    const releasedCard = state.cards[drag.id]
    const velocity = estimateReleaseVelocity(state.pointerSamples, state.events.pointerUp.time)
    releasedCard.x.v += velocity.x
    releasedCard.y.v += velocity.y
    drag = null
    lastDraggedId = releasedCard.id
  }

  const restLayout = getRestLayout(order)
  for (const card of state.cards) {
    const target = restLayout.find((entry) => entry.id === card.id)
    if (target == null) continue
    if (drag == null || drag.id !== card.id) {
      card.x.dest = centeredX
      card.y.dest = target.top
    }
    card.scale.dest = drag != null && drag.id === card.id ? dragScale : 1
  }

  if (drag == null) {
    hoveredId = state.pointer.hasPosition ? hitTestCard(state.pointer.x, state.pointer.y) : null
  }

  let animatedUntilTime = state.animatedUntilTime ?? now
  const steps = Math.min(300, Math.floor((now - animatedUntilTime) / msPerAnimationStep))
  animatedUntilTime += steps * msPerAnimationStep

  for (let i = 0; i < steps; i++) {
    for (const card of state.cards) {
      if (drag == null || drag.id !== card.id) {
        springStep(card.x)
        springStep(card.y)
      }
      springStep(card.scale)

      if (springMostlyDone(card.x)) springGoToEnd(card.x)
      if (springMostlyDone(card.y)) springGoToEnd(card.y)
      if (springMostlyDone(card.scale)) springGoToEnd(card.scale)
    }
  }

  if (lastDraggedId != null) {
    const card = state.cards[lastDraggedId]
    if (springMostlyDone(card.x) && springMostlyDone(card.y) && springMostlyDone(card.scale)) {
      lastDraggedId = null
    }
  }

  const zOrder = getZOrder(order, drag?.id ?? null, lastDraggedId)
  const zIndexById = new Map<number, number>()
  zOrder.forEach((id, index) => {
    zIndexById.set(id, index + 1)
  })

  let stillAnimating = drag != null
  for (const card of state.cards) {
    if (!springMostlyDone(card.x) || !springMostlyDone(card.y) || !springMostlyDone(card.scale)) {
      stillAnimating = true
    }
  }

  const cursor = drag != null ? 'grabbing' : hoveredId != null ? 'grab' : 'auto'

  state.order = order
  state.drag = drag
  state.lastDraggedId = lastDraggedId
  state.hoveredId = hoveredId
  state.cursor = cursor
  state.events.pointerDown = null
  state.events.pointerUp = null
  state.animatedUntilTime = stillAnimating ? animatedUntilTime : null

  document.body.style.cursor = cursor

  for (const card of state.cards) {
    const isDragged = drag != null && drag.id === card.id
    const isLastDragged = lastDraggedId != null && lastDraggedId === card.id
    const visualShadow = isDragged
      ? '0 28px 60px hsla(220 65% 28% / 0.35)'
      : isLastDragged
        ? '0 20px 40px hsla(220 55% 28% / 0.24)'
        : '0 8px 18px hsla(220 40% 28% / 0.14)'

    card.node.style.height = `${card.height}px`
    card.node.style.transform = `translate(${card.x.pos}px, ${card.y.pos}px) scale(${card.scale.pos})`
    card.node.style.zIndex = `${zIndexById.get(card.id) ?? 1}`
    card.node.style.opacity = isDragged ? '0.7' : '1'
    card.node.style.boxShadow = visualShadow
    card.node.style.background = `linear-gradient(180deg, hsl(210 78% ${card.lightnessBase + 14}%), hsl(214 68% ${card.lightnessBase}%))`
    card.node.style.borderColor = `hsl(214 72% ${Math.max(22, card.lightnessBase - 10)}%)`
    card.node.style.color = 'white'
  }

  if (stillAnimating) scheduleRender()
}

function getRestLayout(order: number[]): CardLayout[] {
  let top = STACK_TOP
  const layout: CardLayout[] = []
  for (const id of order) {
    const card = state.cards[id]
    layout.push({ id, top, height: card.height })
    top += card.height
  }
  return layout
}

function getZOrder(order: number[], draggedId: number | null, lastDraggedId: number | null) {
  const base = order.filter((id) => id !== draggedId && id !== lastDraggedId)
  if (lastDraggedId != null) base.push(lastDraggedId)
  if (draggedId != null) base.push(draggedId)
  return base
}

function getVisualRect(card: CardState) {
  const scaledWidth = CARD_WIDTH * card.scale.pos
  const scaledHeight = card.height * card.scale.pos
  return {
    left: card.x.pos - (scaledWidth - CARD_WIDTH) / 2,
    top: card.y.pos - (scaledHeight - card.height) / 2,
    right: card.x.pos - (scaledWidth - CARD_WIDTH) / 2 + scaledWidth,
    bottom: card.y.pos - (scaledHeight - card.height) / 2 + scaledHeight,
  }
}

function hitTestCard(x: number, y: number) {
  const zOrder = getZOrder(state.order, state.drag?.id ?? null, state.lastDraggedId)
  for (let i = zOrder.length - 1; i >= 0; i--) {
    const id = zOrder[i]
    if (id == null) continue
    const card = state.cards[id]
    const rect = getVisualRect(card)
    if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) return id
  }
  return null
}

function getSnapshot(): ReportSnapshot {
  return {
    draggedId: state.drag?.id ?? null,
    lastDraggedId: state.lastDraggedId,
    zOrder: getZOrder(state.order, state.drag?.id ?? null, state.lastDraggedId),
    isAnimating: isAnimatingNow(),
  }
}

function isAnimatingNow() {
  if (state.drag != null) return true
  for (const card of state.cards) {
    if (!springMostlyDone(card.x) || !springMostlyDone(card.y) || !springMostlyDone(card.scale)) return true
  }
  return false
}

function maybeStartScenario() {
  const params = new URLSearchParams(location.search)
  if (params.get('report') !== '1' || state.scenarioStarted) return
  state.scenarioStarted = true
  location.hash = `phase=${encodeURIComponent(JSON.stringify({
    status: 'running',
    requestId: params.get('requestId') ?? 'missing-request-id',
    scenario: params.get('scenario') ?? 'missing-scenario',
  }))}`
  void runScenario(params)
}

async function runScenario(params: URLSearchParams) {
  const requestId = params.get('requestId') ?? 'missing-request-id'
  const scenario = params.get('scenario') ?? 'unknown'

  try {
    await waitFrames(1)
    const report = await buildScenarioReport(requestId, scenario)
    publishReport(report)
  } catch (error) {
    publishReport({
      status: 'error',
      requestId,
      scenario,
      message: error instanceof Error ? error.message : String(error),
    })
  }
}

async function buildScenarioReport(requestId: string, scenario: string): Promise<Report> {
  switch (scenario) {
    case 'reorder-drag':
      return runReorderScenario(requestId)
    case 'release-depth':
      return runReleaseDepthScenario(requestId)
    default:
      throw new Error(`Unknown scenario: ${scenario}`)
  }
}

async function runReorderScenario(requestId: string): Promise<Report> {
  const initialOrder = state.order.slice()
  const start = getCardCenter(1)
  const towardMiddle = getCardCenter(2)
  const towardLower = getCardCenter(3)

  acceptPointerDown({ x: start.x, y: start.y, time: performance.now() })
  await waitFrames(1)

  acceptPointerMove({ x: towardMiddle.x + 90, y: towardMiddle.y + 20, time: performance.now() + 16 })
  await waitFrames(1)

  acceptPointerMove({ x: towardLower.x + 80, y: towardLower.y + 40, time: performance.now() + 32 })
  await waitFrames(1)

  acceptPointerUp({ x: towardLower.x + 80, y: towardLower.y + 40, time: performance.now() + 48 })
  await waitFrames(1)
  await waitFor(() => !isAnimatingNow(), 2500)

  return {
    status: 'ready',
    requestId,
    scenario: 'reorder-drag',
    initialOrder,
    finalOrder: state.order.slice(),
    swapOccurred: !sameOrder(initialOrder, state.order),
    draggedId: state.drag?.id ?? null,
    lastDraggedId: state.lastDraggedId,
    cursor: state.cursor,
  }
}

async function runReleaseDepthScenario(requestId: string): Promise<Report> {
  const start = getCardCenter(2)

  acceptPointerDown({ x: start.x, y: start.y, time: performance.now() })
  await waitFrames(1)

  acceptPointerMove({ x: start.x + 110, y: start.y - 10, time: performance.now() + 16 })
  await waitFrames(1)

  acceptPointerMove({ x: start.x + 140, y: start.y + 15, time: performance.now() + 32 })
  await waitFrames(1)

  acceptPointerUp({ x: start.x + 140, y: start.y + 15, time: performance.now() + 48 })
  await waitFrames(1)
  await waitFor(() => state.lastDraggedId === 2 && state.drag == null && isAnimatingNow(), 1500)
  const duringSettle = getSnapshot()
  await waitFor(() => !isAnimatingNow() && state.lastDraggedId == null, 2500)

  return {
    status: 'ready',
    requestId,
    scenario: 'release-depth',
    draggedId: state.drag?.id ?? null,
    lastDraggedId: state.lastDraggedId,
    cursor: state.cursor,
    duringSettle,
    afterSettle: getSnapshot(),
  }
}

function publishReport(report: Report) {
  location.hash = `report=${encodeURIComponent(JSON.stringify(report))}`
}

function waitFrames(frameCount: number) {
  return new Promise<void>((resolve) => {
    let remaining = frameCount
    function step() {
      remaining--
      if (remaining <= 0) {
        resolve()
      } else {
        requestAnimationFrame(step)
      }
    }
    requestAnimationFrame(step)
  })
}

function waitFor(predicate: () => boolean, timeoutMs: number) {
  return new Promise<void>((resolve, reject) => {
    const startedAt = performance.now()
    function check() {
      if (predicate()) {
        resolve()
        return
      }
      if (performance.now() - startedAt > timeoutMs) {
        reject(new Error(`Timed out after ${timeoutMs}ms`))
        return
      }
      requestAnimationFrame(check)
    }
    check()
  })
}

function getCardCenter(id: number) {
  const card = state.cards[id]
  const rect = getVisualRect(card)
  return {
    x: rect.left + (rect.right - rect.left) / 2,
    y: rect.top + (rect.bottom - rect.top) / 2,
  }
}

function sameOrder(a: number[], b: number[]) {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false
  }
  return true
}
