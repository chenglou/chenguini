import {
  buildStackLayout,
  CARD_COUNT,
  CARD_WIDTH,
  estimateReleaseVelocity,
  getCardMetric,
  getCenteredX,
  getDraggedX,
  reorderIdsByPointerY,
  type PointerSample,
} from './logic.ts'

const msPerAnimationStep = 4
const positionStiffness = 290
const positionDamping = 24
const scaleStiffness = 240
const scaleDamping = 20
const dragScale = 1.1
const settleVelocity = 8
const settleDistance = 0.2
const maxPointerSamples = 20
const reportMode = new URLSearchParams(location.search).get('report') === '1'
const scenario = new URLSearchParams(location.search).get('scenario') ?? ''
const requestId = new URLSearchParams(location.search).get('requestId') ?? ''

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
  node: HTMLDivElement
  x: Spring
  y: Spring
  scale: Spring
}

type DragState = {
  id: number
  deltaX: number
  deltaY: number
}

type InputPoint = {
  x: number
  y: number
  time: number
  cardId: number | null
}

type Snapshot = {
  orderedCardIds: number[]
  topCardId: number | null
  draggedCardId: number | null
  lastDraggedId: number | null
  isAnimating: boolean
  cursor: string
}

type Report = {
  phase: 'loading' | 'running' | 'ready' | 'error'
  requestId: string
  scenario: string
  message?: string
  initialOrder?: number[]
  duringDragOrder?: number[]
  finalOrder?: number[]
  duringSettle?: Snapshot
  afterSettle?: Snapshot
}

type State = {
  order: number[]
  cards: CardState[]
  drag: DragState | null
  lastDraggedId: number | null
  pointer: {
    x: number
    y: number
    hasPosition: boolean
    isDown: boolean
  }
  pointerSamples: PointerSample[]
  events: {
    pointerDown: InputPoint | null
    pointerUp: InputPoint | null
  }
  cursor: string
  scheduledRaf: number | null
  animatedUntilTime: number
  scenarioStarted: boolean
}

function getTimelineTime() {
  return document.timeline?.currentTime ?? 0
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
  springState.v = nextVelocity
  springState.pos = nextPosition
}

function springMostlyDone(springState: Spring) {
  return Math.abs(springState.v) < settleVelocity && Math.abs(springState.dest - springState.pos) < settleDistance
}

function springGoToEnd(springState: Spring) {
  springState.pos = springState.dest
  springState.v = 0
}

function cardZIndex(cardId: number) {
  if (state.drag != null && state.drag.id === cardId) return 300
  if (state.drag == null && state.lastDraggedId === cardId) return 200
  return 10 + state.order.indexOf(cardId)
}

function getCardById(cardId: number) {
  for (let i = 0; i < state.cards.length; i++) {
    const card = state.cards[i]
    if (card != null && card.id === cardId) return card
  }
  throw new Error(`Missing card ${cardId}`)
}

function getCardTop(cardId: number) {
  const layout = buildStackLayout(state.order)
  for (let i = 0; i < layout.length; i++) {
    const entry = layout[i]
    if (entry != null && entry.id === cardId) return entry.top
  }
  throw new Error(`Missing layout entry ${cardId}`)
}

function getCardCenterX(cardId: number) {
  const card = getCardById(cardId)
  return card.x.pos + CARD_WIDTH / 2
}

function hasAnyAnimatingCard() {
  for (let i = 0; i < state.cards.length; i++) {
    const card = state.cards[i]
    if (card == null) continue
    if (!springMostlyDone(card.x) || !springMostlyDone(card.y) || !springMostlyDone(card.scale)) return true
  }
  return false
}

function captureSnapshot(): Snapshot {
  return {
    orderedCardIds: state.order.slice(),
    topCardId: state.drag?.id ?? state.lastDraggedId ?? state.order[state.order.length - 1] ?? null,
    draggedCardId: state.drag?.id ?? null,
    lastDraggedId: state.lastDraggedId,
    isAnimating: state.drag != null || hasAnyAnimatingCard(),
    cursor: state.cursor,
  }
}

function publishReport(report: Report) {
  if (!reportMode) return
  location.hash = `report=${encodeURIComponent(JSON.stringify(report))}`
}

function markLoading() {
  publishReport({ phase: 'loading', requestId, scenario })
}

function markRunning() {
  publishReport({ phase: 'running', requestId, scenario })
}

function markReady(extra: Omit<Report, 'phase' | 'requestId' | 'scenario'> = {}) {
  publishReport({
    phase: 'ready',
    requestId,
    scenario,
    ...extra,
  })
}

function markError(message: string) {
  publishReport({
    phase: 'error',
    requestId,
    scenario,
    message,
  })
}

function createCards() {
  const cards: CardState[] = []
  for (let id = 0; id < CARD_COUNT; id++) {
    const metrics = getCardMetric(id)
    const node = document.createElement('div')
    node.className = 'card'
    node.dataset.cardId = String(id)
    node.textContent = `Drag Me ${id}`
    node.style.width = `${CARD_WIDTH}px`
    node.style.height = `${metrics.height}px`
    node.style.background = `hsl(215 70% ${metrics.lightnessBase}%)`
    node.style.borderColor = `hsl(215 70% ${Math.max(0, metrics.lightnessBase - 10)}%)`
    node.style.boxShadow = '0 8px 18px rgba(35, 57, 96, 0.16)'
    document.body.appendChild(node)
    cards.push({
      id,
      height: metrics.height,
      lightnessBase: metrics.lightnessBase,
      node,
      x: spring(0),
      y: spring(0),
      scale: spring(1, 1, 0, scaleStiffness, scaleDamping),
    })
  }
  return cards
}

const state: State = {
  order: Array.from({ length: CARD_COUNT }, (_, id) => id),
  cards: createCards(),
  drag: null,
  lastDraggedId: null,
  pointer: {
    x: 0,
    y: 0,
    hasPosition: false,
    isDown: false,
  },
  pointerSamples: [],
  events: {
    pointerDown: null,
    pointerUp: null,
  },
  cursor: 'auto',
  scheduledRaf: null,
  animatedUntilTime: getTimelineTime(),
  scenarioStarted: false,
}

initializeLayout()
installEvents()
markLoading()
scheduleRender()
requestAnimationFrame(() => {
  void maybeStartScenario()
})

function initializeLayout() {
  const centeredX = getCenteredX(document.documentElement.clientWidth)
  const layout = buildStackLayout(state.order)

  for (let i = 0; i < state.cards.length; i++) {
    const card = state.cards[i]
    if (card == null) continue
    for (let j = 0; j < layout.length; j++) {
      const entry = layout[j]
      if (entry != null && entry.id === card.id) {
        card.x.pos = centeredX
        card.x.dest = centeredX
        card.y.pos = entry.top
        card.y.dest = entry.top
        card.scale.pos = 1
        card.scale.dest = 1
        break
      }
    }
  }
}

function installEvents() {
  window.addEventListener('resize', scheduleRender)
  window.addEventListener('pointerdown', onPointerDown)
  window.addEventListener('pointermove', onPointerMove, { passive: true })
  window.addEventListener('pointerup', onPointerUp)
  window.addEventListener('pointercancel', onPointerUp)
  window.addEventListener('touchmove', onTouchMove, { passive: true })
  window.addEventListener('touchend', onTouchEnd)
  window.addEventListener('touchcancel', onTouchEnd)
}

function onPointerDown(event: PointerEvent) {
  if (event.pointerType === 'mouse' && event.button !== 0) return
  const cardId = getEventCardId(event.target)
  ingestPointerDown({
    x: event.pageX,
    y: event.pageY,
    time: event.timeStamp,
    cardId,
  })
}

function onPointerMove(event: PointerEvent) {
  ingestPointerMove({
    x: event.pageX,
    y: event.pageY,
    time: event.timeStamp,
    cardId: null,
  })
}

function onPointerUp(event: PointerEvent) {
  ingestPointerUp({
    x: event.pageX,
    y: event.pageY,
    time: event.timeStamp,
    cardId: null,
  })
}

function onTouchMove(event: TouchEvent) {
  const touch = event.touches[0]
  if (touch == null) return
  ingestPointerMove({
    x: touch.pageX,
    y: touch.pageY,
    time: event.timeStamp,
    cardId: null,
  })
}

function onTouchEnd(event: TouchEvent) {
  const touch = event.changedTouches[0]
  if (touch == null) return
  ingestPointerUp({
    x: touch.pageX,
    y: touch.pageY,
    time: event.timeStamp,
    cardId: null,
  })
}

function getEventCardId(target: EventTarget | null) {
  if (!(target instanceof Element)) return null
  const card = target.closest('[data-card-id]')
  if (!(card instanceof HTMLElement)) return null
  const parsed = Number.parseInt(card.dataset.cardId ?? '', 10)
  return Number.isNaN(parsed) ? null : parsed
}

function ingestPointerDown(point: InputPoint) {
  state.pointer.x = point.x
  state.pointer.y = point.y
  state.pointer.hasPosition = true
  state.pointer.isDown = true
  state.pointerSamples = [{ x: point.x, y: point.y, time: point.time }]
  state.events.pointerDown = point
  state.animatedUntilTime = getTimelineTime()
  scheduleRender()
}

function ingestPointerMove(point: InputPoint) {
  state.pointer.x = point.x
  state.pointer.y = point.y
  state.pointer.hasPosition = true
  if (state.pointer.isDown || state.drag != null) {
    pushPointerSample({
      x: point.x,
      y: point.y,
      time: point.time,
    })
  }
  scheduleRender()
}

function ingestPointerUp(point: InputPoint) {
  state.pointer.x = point.x
  state.pointer.y = point.y
  state.pointer.hasPosition = true
  state.pointer.isDown = false
  state.events.pointerUp = point
  state.animatedUntilTime = getTimelineTime()
  scheduleRender()
}

function pushPointerSample(sample: PointerSample) {
  state.pointerSamples.push(sample)
  while (state.pointerSamples.length > maxPointerSamples) {
    state.pointerSamples.shift()
  }
}

function scheduleRender() {
  if (state.scheduledRaf != null) return
  state.scheduledRaf = requestAnimationFrame(function renderAndMaybeScheduleAnotherRender(now) {
    state.scheduledRaf = null
    if (render(now)) scheduleRender()
  })
}

function render(now: number) {
  if (state.events.pointerDown != null) {
    const down = state.events.pointerDown
    state.events.pointerDown = null
    if (down.cardId != null) {
      const card = getCardById(down.cardId)
      state.drag = {
        id: down.cardId,
        deltaX: down.x - card.x.pos,
        deltaY: down.y - card.y.pos,
      }
      state.lastDraggedId = null
    }
  }

  if (state.events.pointerUp != null) {
    const up = state.events.pointerUp
    state.events.pointerUp = null
    if (state.drag != null) {
      const draggedId = state.drag.id
      const draggedCard = getCardById(draggedId)
      const velocity = estimateReleaseVelocity(state.pointerSamples, up.time)
      draggedCard.x.v += velocity.x
      draggedCard.y.v += velocity.y
      state.lastDraggedId = draggedId
      state.drag = null
    }
  }

  const windowWidth = document.documentElement.clientWidth

  if (state.drag != null && state.pointer.hasPosition) {
    const reordered = reorderIdsByPointerY(state.order, state.drag.id, state.pointer.y)
    if (reordered.didSwap) state.order = reordered.order
  }

  const currentLayout = buildStackLayout(state.order)
  const centeredX = getCenteredX(windowWidth)
  let hoveredId: number | null = null
  if (!state.pointer.isDown && state.pointer.hasPosition) {
    hoveredId = getHoverId(centeredX, currentLayout)
  }

  let stillAnimating = false
  const elapsed = now - state.animatedUntilTime
  const steps = Math.min(300, Math.max(0, Math.floor(elapsed / msPerAnimationStep)))
  const nextAnimatedUntilTime = state.animatedUntilTime + steps * msPerAnimationStep

  for (let i = 0; i < state.cards.length; i++) {
    const card = state.cards[i]
    if (card == null) continue

    const layoutEntry = findLayoutEntry(currentLayout, card.id)
    if (layoutEntry == null) continue

    const draggingCard = state.drag != null && state.drag.id === card.id
    const isLastDragged = state.drag == null && state.lastDraggedId === card.id
    const targetX = draggingCard ? getDraggedX(windowWidth, state.pointer.x, state.drag.deltaX) : centeredX
    const targetY = draggingCard ? state.pointer.y - state.drag.deltaY : layoutEntry.top
    const targetScale = draggingCard ? dragScale : 1

    if (draggingCard) {
      card.x.pos = targetX
      card.x.dest = targetX
      card.x.v = 0
      card.y.pos = targetY
      card.y.dest = targetY
      card.y.v = 0
      card.scale.pos = targetScale
      card.scale.dest = targetScale
      card.scale.v = 0
    } else {
      card.x.dest = targetX
      card.y.dest = targetY
      card.scale.dest = targetScale

      for (let step = 0; step < steps; step++) {
        springStep(card.x)
        springStep(card.y)
        springStep(card.scale)
      }

      if (springMostlyDone(card.x)) springGoToEnd(card.x)
      if (springMostlyDone(card.y)) springGoToEnd(card.y)
      if (springMostlyDone(card.scale)) springGoToEnd(card.scale)

      if (!springMostlyDone(card.x) || !springMostlyDone(card.y) || !springMostlyDone(card.scale)) {
        stillAnimating = true
      }

      if (isLastDragged && !springMostlyDone(card.x) && !springMostlyDone(card.y)) {
        stillAnimating = true
      }
    }

    const x = card.x.pos
    const y = card.y.pos
    const scale = card.scale.pos
    const opacity = draggingCard ? 0.7 : 1
    const shadow = draggingCard || isLastDragged
      ? '0 18px 36px rgba(28, 45, 82, 0.26)'
      : '0 8px 18px rgba(35, 57, 96, 0.16)'
    const zIndex = cardZIndex(card.id)

    card.node.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${scale})`
    card.node.style.opacity = String(opacity)
    card.node.style.zIndex = String(zIndex)
    card.node.style.boxShadow = shadow
    card.node.style.cursor = state.drag != null && state.drag.id === card.id ? 'grabbing' : 'inherit'
  }

  if (state.drag != null) {
    state.cursor = 'grabbing'
  } else if (hoveredId != null) {
    state.cursor = 'grab'
  } else {
    state.cursor = 'auto'
  }

  document.body.style.cursor = state.cursor

  if (state.lastDraggedId != null && state.drag == null) {
    const draggedCard = getCardById(state.lastDraggedId)
    if (springMostlyDone(draggedCard.x) && springMostlyDone(draggedCard.y) && springMostlyDone(draggedCard.scale)) {
      springGoToEnd(draggedCard.x)
      springGoToEnd(draggedCard.y)
      springGoToEnd(draggedCard.scale)
      state.lastDraggedId = null
    } else {
      stillAnimating = true
    }
  }

  state.animatedUntilTime = stillAnimating ? nextAnimatedUntilTime : now
  return stillAnimating
}

function findLayoutEntry(layout: ReturnType<typeof buildStackLayout>, cardId: number) {
  for (let i = 0; i < layout.length; i++) {
    const entry = layout[i]
    if (entry != null && entry.id === cardId) return entry
  }
  return null
}

function getHoverId(centeredX: number, layout: ReturnType<typeof buildStackLayout>) {
  const pointerX = state.pointer.x
  const pointerY = state.pointer.y
  for (let i = layout.length - 1; i >= 0; i--) {
    const entry = layout[i]
    if (entry == null) continue
    if (pointerX >= centeredX && pointerX <= centeredX + CARD_WIDTH && pointerY >= entry.top && pointerY <= entry.top + entry.height) {
      return entry.id
    }
  }
  return null
}

async function maybeStartScenario() {
  if (!reportMode || state.scenarioStarted || scenario === '') return
  state.scenarioStarted = true
  markRunning()

  try {
    switch (scenario) {
      case 'reorder-before-release':
        await runReorderBeforeReleaseScenario()
        break
      case 'release-depth':
        await runReleaseDepthScenario()
        break
      default:
        throw new Error(`Unknown scenario: ${scenario}`)
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    markError(message)
    throw error
  }
}

async function runReorderBeforeReleaseScenario() {
  const initialOrder = state.order.slice()
  const startCenterX = getCardCenterX(1)
  const startCenterY = getCardTop(1) + getCardById(1).height / 2
  const releaseTime = 1_200

  ingestPointerDown({ x: startCenterX, y: startCenterY, time: 1_000, cardId: 1 })
  await nextFrame()

  const layout = buildStackLayout(state.order)
  const target = layout[3]
  if (target == null) throw new Error('Missing target layout entry for reorder scenario')

  ingestPointerMove({ x: startCenterX, y: target.midpoint + 12, time: 1_060, cardId: null })
  await nextFrame()

  const duringDragOrder = state.order.slice()

  ingestPointerUp({ x: startCenterX, y: target.midpoint + 12, time: releaseTime, cardId: null })
  await waitForSettle()

  markReady({
    initialOrder,
    duringDragOrder,
    finalOrder: state.order.slice(),
  })
}

async function runReleaseDepthScenario() {
  const startCenterX = getCardCenterX(2)
  const startCenterY = getCardTop(2) + getCardById(2).height / 2

  ingestPointerDown({ x: startCenterX, y: startCenterY, time: 2_000, cardId: 2 })
  await nextFrame()

  const layout = buildStackLayout(state.order)
  const target = layout[3]
  if (target == null) throw new Error('Missing target layout entry for release-depth scenario')

  ingestPointerMove({ x: startCenterX, y: target.midpoint + 16, time: 2_040, cardId: null })
  await nextFrame()
  ingestPointerMove({ x: startCenterX, y: target.midpoint + 28, time: 2_100, cardId: null })
  await nextFrame()

  ingestPointerUp({ x: startCenterX, y: target.midpoint + 28, time: 2_140, cardId: null })
  await nextFrame()

  const duringSettle = captureSnapshot()
  await waitForSettle()
  const afterSettle = captureSnapshot()

  markReady({
    duringSettle,
    afterSettle,
  })
}

async function waitForSettle() {
  while (true) {
    await nextFrame()
    if (state.drag == null && state.lastDraggedId == null && !hasAnyAnimatingCard()) {
      return
    }
  }
}

function nextFrame() {
  return new Promise<void>((resolve) => {
    requestAnimationFrame(() => resolve())
  })
}
