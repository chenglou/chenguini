import {
  CARD_COUNT,
  CARD_WIDTH,
  MS_PER_ANIMATION_STEP,
  SCALE_DAMPING,
  SCALE_STIFFNESS,
  TOP_PADDING,
  XY_DAMPING,
  XY_STIFFNESS,
  cardHeight,
  cardLightness,
  estimateReleaseVelocity,
  getCardTop,
  reorderWhileDragging,
  type PointerSample,
} from './model.ts'

type Spring = {
  pos: number
  dest: number
  v: number
  k: number
  b: number
}

type CardState = {
  id: number
  sizeY: number
  lightnessBase: number
  x: Spring
  y: Spring
  scale: Spring
  element: HTMLDivElement
}

type ActiveDrag = {
  cardId: number
  deltaX: number
  deltaY: number
  pointerX: number
  pointerY: number
}

type ReportCard = {
  id: number
  x: number
  y: number
  scale: number
  zIndex: number
}

type ScenarioReport = {
  phase: 'loading' | 'running' | 'ready' | 'error'
  requestId: string
  scenario: string
  order: number[]
  draggedId: number | null
  lastDraggedId: number | null
  cursor: string
  swapHappened: boolean
  cards: ReportCard[]
  releaseCardId?: number
  duringSettle?: {
    lastDraggedId: number | null
    zOrderTopToBottom: number[]
    settled: boolean
  }
  afterSettle?: {
    lastDraggedId: number | null
    zOrderTopToBottom: number[]
    settled: boolean
  }
  message?: string
}

const app = document.querySelector<HTMLDivElement>('#app')
if (app == null) throw new Error('Missing #app root')

const heightsById = Array.from({ length: CARD_COUNT }, (_, id) => cardHeight(id))
const initialCenterX = getCenteredX()

const cards = Array.from({ length: CARD_COUNT }, (_, id) => {
  const element = document.createElement('div')
  element.className = 'card'
  element.textContent = `Drag Me ${id}`
  app.append(element)

  const sizeY = heightsById[id]
  const top = getCardTop(range(CARD_COUNT), heightsById, TOP_PADDING, id)
  return {
    id,
    sizeY,
    lightnessBase: cardLightness(id),
    x: spring(initialCenterX),
    y: spring(top),
    scale: spring(1, 1, 0, SCALE_STIFFNESS, SCALE_DAMPING),
    element,
  } satisfies CardState
})

const search = new URLSearchParams(window.location.search)
const reportEnabled = search.get('report') === '1'
const scenario = search.get('scenario') ?? ''
const requestId = search.get('requestId') ?? ''

const state = {
  order: range(CARD_COUNT),
  activeDrag: null as ActiveDrag | null,
  lastDraggedId: null as number | null,
  hoverCardId: null as number | null,
  pointerSamples: [] as PointerSample[],
  swapHappened: false,
  animatedUntilMs: performance.now(),
}

applyLayoutDestinations()
render()
window.requestAnimationFrame(frame)
window.addEventListener('pointerdown', handlePointerDown)
window.addEventListener('pointermove', handlePointerMove)
window.addEventListener('pointerup', handlePointerUp)
window.addEventListener('pointercancel', handlePointerCancel)
window.addEventListener('mousemove', handleMouseMove)
window.addEventListener('mouseup', handleMouseUp)
window.addEventListener('touchmove', handleTouchMove, { passive: false })
window.addEventListener('touchend', handleTouchEnd, { passive: false })
window.addEventListener('touchcancel', handleTouchCancel, { passive: false })
window.addEventListener('resize', handleResize)

publishReport({ phase: 'loading' })
if (reportEnabled && requestId !== '' && scenario !== '') {
  void runScenario(scenario)
}

function handlePointerDown(event: PointerEvent) {
  if (event.button !== 0) return
  beginDragAt(event.pageX, event.pageY, event.timeStamp)
}

function handlePointerMove(event: PointerEvent) {
  if (state.activeDrag == null) {
    updateHover(event.pageX, event.pageY)
    return
  }

  event.preventDefault()
  updateDrag(event.pageX, event.pageY, event.timeStamp)
}

function handlePointerUp(event: PointerEvent) {
  finishDrag(event.pageX, event.pageY, event.timeStamp)
}

function handlePointerCancel(event: PointerEvent) {
  finishDrag(event.pageX, event.pageY, event.timeStamp)
}

function handleMouseMove(event: MouseEvent) {
  if (state.activeDrag == null) {
    updateHover(event.pageX, event.pageY)
    return
  }
  updateDrag(event.pageX, event.pageY, event.timeStamp)
}

function handleMouseUp(event: MouseEvent) {
  finishDrag(event.pageX, event.pageY, event.timeStamp)
}

function handleTouchMove(event: TouchEvent) {
  const touch = event.changedTouches[0]
  if (touch == null) return
  event.preventDefault()
  if (state.activeDrag == null) return
  updateDrag(touch.pageX, touch.pageY, event.timeStamp)
}

function handleTouchEnd(event: TouchEvent) {
  const touch = event.changedTouches[0]
  if (touch == null) {
    finishDrag(null, null, event.timeStamp)
    return
  }
  event.preventDefault()
  finishDrag(touch.pageX, touch.pageY, event.timeStamp)
}

function handleTouchCancel(event: TouchEvent) {
  const touch = event.changedTouches[0]
  if (touch == null) {
    finishDrag(null, null, event.timeStamp)
    return
  }
  event.preventDefault()
  finishDrag(touch.pageX, touch.pageY, event.timeStamp)
}

function handleResize() {
  applyLayoutDestinations()
}

function beginDragAt(pointerX: number, pointerY: number, time: number) {
  const card = hitTest(pointerX, pointerY)
  if (card == null) return

  state.activeDrag = {
    cardId: card.id,
    deltaX: pointerX - card.x.pos,
    deltaY: pointerY - card.y.pos,
    pointerX,
    pointerY,
  }
  state.pointerSamples = [{ x: pointerX, y: pointerY, time }]
  state.hoverCardId = card.id
  state.lastDraggedId = null
  card.scale.pos = 1.1
  card.scale.dest = 1.1
  pinDraggedCard()
  updateCursor()
  render()
}

function updateDrag(pointerX: number, pointerY: number, time: number) {
  const drag = state.activeDrag
  if (drag == null) return

  drag.pointerX = pointerX
  drag.pointerY = pointerY
  pushPointerSample(pointerX, pointerY, time)
  pinDraggedCard()

  const reordered = reorderWhileDragging({
    order: state.order,
    draggedId: drag.cardId,
    pointerY,
    topPadding: TOP_PADDING,
    heightsById,
  })
  if (reordered.swapped) {
    state.order = reordered.order
    state.swapHappened = true
    applyLayoutDestinations()
    pinDraggedCard()
  }

  updateCursor()
  render()
}

function finishDrag(pointerX: number | null, pointerY: number | null, time: number) {
  const drag = state.activeDrag
  if (drag == null) return

  if (pointerX != null && pointerY != null) {
    pushPointerSample(pointerX, pointerY, time)
  }

  const card = cards[drag.cardId]
  const velocity = estimateReleaseVelocity(state.pointerSamples)
  state.activeDrag = null
  state.hoverCardId = null
  state.lastDraggedId = drag.cardId
  card.scale.dest = 1
  card.x.v += velocity.x
  card.y.v += velocity.y
  applyLayoutDestinations()
  updateCursor()
  render()
}

function updateHover(pointerX: number, pointerY: number) {
  state.hoverCardId = hitTest(pointerX, pointerY)?.id ?? null
  updateCursor()
}

function pinDraggedCard() {
  const drag = state.activeDrag
  if (drag == null) return
  const card = cards[drag.cardId]
  const rawX = drag.pointerX - drag.deltaX
  const centeredX = getCenteredX()
  const draggedX = rawX + (centeredX - rawX) / 1.5
  const draggedY = drag.pointerY - drag.deltaY

  card.x.pos = draggedX
  card.x.dest = draggedX
  card.y.pos = draggedY
  card.y.dest = draggedY
}

function applyLayoutDestinations() {
  const centeredX = getCenteredX()
  for (const card of cards) {
    const isDragged = state.activeDrag?.cardId === card.id
    if (isDragged) continue
    card.x.dest = centeredX
    card.y.dest = getCardTop(state.order, heightsById, TOP_PADDING, card.id)
    card.scale.dest = 1
  }
}

function frame(now: number) {
  let steps = Math.floor((now - state.animatedUntilMs) / MS_PER_ANIMATION_STEP)
  if (steps > 300) steps = 300
  if (steps > 0) {
    state.animatedUntilMs += steps * MS_PER_ANIMATION_STEP
    for (let step = 0; step < steps; step++) {
      stepSprings()
    }
  }
  render()
  window.requestAnimationFrame(frame)
}

function stepSprings() {
  for (const card of cards) {
    if (state.activeDrag?.cardId !== card.id) {
      springStep(card.x)
      springStep(card.y)
      maybeSnap(card.x)
      maybeSnap(card.y)
    }
    if (state.activeDrag?.cardId !== card.id) {
      springStep(card.scale)
      maybeSnap(card.scale)
    }
  }

  if (state.lastDraggedId != null && isCardSettled(state.lastDraggedId)) {
    state.lastDraggedId = null
  }
}

function render() {
  for (const card of cards) {
    const zIndex = getZIndex(card.id)
    card.element.style.height = `${card.sizeY}px`
    card.element.style.transform = `translate3d(${card.x.pos}px, ${card.y.pos}px, 0) scale(${card.scale.pos})`
    card.element.style.zIndex = `${zIndex}`
    card.element.style.opacity = state.activeDrag?.cardId === card.id ? '0.7' : '1'
    card.element.style.boxShadow =
      state.activeDrag?.cardId === card.id
        ? '0 30px 60px rgba(28, 75, 145, 0.42)'
        : state.lastDraggedId === card.id
          ? '0 22px 40px rgba(28, 75, 145, 0.26)'
          : '0 12px 28px rgba(28, 75, 145, 0.18)'
    card.element.style.background = `linear-gradient(180deg, ${cardTopColor(card.lightnessBase)} 0%, ${cardBottomColor(card.lightnessBase)} 100%)`
    card.element.style.borderColor = `hsla(212, 72%, ${Math.max(card.lightnessBase - 14, 24)}%, 0.95)`
  }
}

function hitTest(pointerX: number, pointerY: number) {
  const cardsByDepth = cards.slice().sort((left, right) => getZIndex(right.id) - getZIndex(left.id))
  for (const card of cardsByDepth) {
    if (
      pointerX >= card.x.pos &&
      pointerX <= card.x.pos + CARD_WIDTH &&
      pointerY >= card.y.pos &&
      pointerY <= card.y.pos + card.sizeY
    ) {
      return card
    }
  }
  return null
}

function getCenteredX() {
  return (window.innerWidth - CARD_WIDTH) / 2
}

function getZIndex(cardId: number) {
  if (state.activeDrag?.cardId === cardId) return 100
  if (state.lastDraggedId === cardId) return 90
  return state.order.indexOf(cardId) + 1
}

function pushPointerSample(x: number, y: number, time: number) {
  state.pointerSamples.push({ x, y, time })
  if (state.pointerSamples.length > 20) {
    state.pointerSamples.splice(0, state.pointerSamples.length - 20)
  }
}

function updateCursor() {
  document.body.style.cursor = state.activeDrag != null ? 'grabbing' : state.hoverCardId != null ? 'grab' : 'auto'
}

function isCardSettled(cardId: number) {
  const card = cards[cardId]
  return springMostlyDone(card.x) && springMostlyDone(card.y) && springMostlyDone(card.scale)
}

function cardTopColor(lightnessBase: number) {
  return `hsl(212, 76%, ${Math.min(lightnessBase + 10, 90)}%)`
}

function cardBottomColor(lightnessBase: number) {
  return `hsl(215, 72%, ${Math.max(lightnessBase - 8, 24)}%)`
}

function spring(position: number, destination = position, velocity = 0, stiffness = XY_STIFFNESS, damping = XY_DAMPING): Spring {
  return {
    pos: position,
    dest: destination,
    v: velocity,
    k: stiffness,
    b: damping,
  }
}

function springStep(config: Spring) {
  const t = MS_PER_ANIMATION_STEP / 1000
  const force = -config.k * (config.pos - config.dest) - config.b * config.v
  config.v += force * t
  config.pos += config.v * t
}

function maybeSnap(config: Spring) {
  if (springMostlyDone(config)) {
    config.pos = config.dest
    config.v = 0
  }
}

function springMostlyDone(config: Spring) {
  return Math.abs(config.v) < 0.01 && Math.abs(config.dest - config.pos) < 0.01
}

function range(count: number) {
  return Array.from({ length: count }, (_, index) => index)
}

async function runScenario(scenarioName: string) {
  try {
    publishReport({ phase: 'running' })
    await waitFrames(2)

    if (scenarioName === 'swap-down') {
      await runSwapDownScenario()
      publishReport({
        phase: 'ready',
        ...snapshotReport(),
      })
      return
    }

    if (scenarioName === 'release-depth') {
      const details = await runReleaseDepthScenario()
      publishReport({
        phase: 'ready',
        ...snapshotReport(),
        ...details,
      })
      return
    }

    throw new Error(`Unknown scenario: ${scenarioName}`)
  } catch (error) {
    publishReport({
      phase: 'error',
      message: error instanceof Error ? error.message : String(error),
    })
  }
}

async function runSwapDownScenario() {
  const card = cards[1]
  const startX = card.x.pos + CARD_WIDTH / 2
  const startY = card.y.pos + card.sizeY / 2
  const nextId = state.order[state.order.indexOf(1) + 1]
  if (nextId == null) throw new Error('Missing next card for swap scenario')
  const nextMidpoint = getCardTop(state.order, heightsById, TOP_PADDING, nextId) + heightsById[nextId] / 2

  beginDragAt(startX, startY, 0)
  await waitFrames(1)
  updateDrag(startX, nextMidpoint + 16, 60)
  await waitFrames(2)
  finishDrag(startX, nextMidpoint + 24, 120)
  await waitUntil(() => state.lastDraggedId == null, 5_000)
}

async function runReleaseDepthScenario() {
  const card = cards[1]
  const startX = card.x.pos + CARD_WIDTH / 2
  const startY = card.y.pos + card.sizeY / 2
  const nextId = state.order[state.order.indexOf(1) + 1]
  if (nextId == null) throw new Error('Missing next card for depth scenario')
  const nextMidpoint = getCardTop(state.order, heightsById, TOP_PADDING, nextId) + heightsById[nextId] / 2
  const dragX = startX + 120
  const dragY = Math.min(startY + 44, nextMidpoint - 12)

  beginDragAt(startX, startY, 0)
  await waitFrames(1)
  updateDrag(startX + 50, startY + 18, 40)
  await waitFrames(1)
  updateDrag(dragX, dragY, 120)
  await waitFrames(1)
  finishDrag(dragX + 40, dragY + 12, 180)
  await waitUntil(() => state.lastDraggedId === 1 && !isCardSettled(1), 5_000)
  await waitFrames(2)
  const duringSettle = {
    lastDraggedId: state.lastDraggedId,
    zOrderTopToBottom: getZOrderTopToBottom(),
    settled: isCardSettled(1),
  }
  await waitUntil(() => state.lastDraggedId == null, 5_000)
  const afterSettle = {
    lastDraggedId: state.lastDraggedId,
    zOrderTopToBottom: getZOrderTopToBottom(),
    settled: isCardSettled(1),
  }

  return {
    releaseCardId: 1,
    duringSettle,
    afterSettle,
  }
}

function snapshotReport() {
  return {
    scenario,
    order: state.order.slice(),
    draggedId: state.activeDrag?.cardId ?? null,
    lastDraggedId: state.lastDraggedId,
    cursor: document.body.style.cursor || 'auto',
    swapHappened: state.swapHappened,
    cards: cards.map(card => ({
      id: card.id,
      x: round(card.x.pos),
      y: round(card.y.pos),
      scale: round(card.scale.pos),
      zIndex: getZIndex(card.id),
    })),
  }
}

function getZOrderTopToBottom() {
  return cards
    .slice()
    .sort((left, right) => getZIndex(right.id) - getZIndex(left.id))
    .map(card => card.id)
}

function publishReport(partial: Omit<ScenarioReport, 'requestId' | 'scenario' | 'cards' | 'order' | 'draggedId' | 'lastDraggedId' | 'cursor' | 'swapHappened'> & Partial<ScenarioReport>) {
  if (!reportEnabled || requestId === '' || scenario === '') return
  const report: ScenarioReport = {
    phase: partial.phase ?? 'running',
    requestId,
    scenario,
    order: partial.order ?? state.order.slice(),
    draggedId: partial.draggedId ?? state.activeDrag?.cardId ?? null,
    lastDraggedId: partial.lastDraggedId ?? state.lastDraggedId,
    cursor: partial.cursor ?? (document.body.style.cursor || 'auto'),
    swapHappened: partial.swapHappened ?? state.swapHappened,
    cards: partial.cards ?? snapshotReport().cards,
    releaseCardId: partial.releaseCardId,
    duringSettle: partial.duringSettle,
    afterSettle: partial.afterSettle,
    message: partial.message,
  }

  const params = new URLSearchParams()
  params.set('report', JSON.stringify(report))
  window.location.hash = params.toString()
}

function waitFrames(frameCount: number) {
  return new Promise<void>(resolve => {
    const step = () => {
      if (frameCount <= 0) {
        resolve()
        return
      }
      frameCount -= 1
      window.requestAnimationFrame(step)
    }
    window.requestAnimationFrame(step)
  })
}

async function waitUntil(predicate: () => boolean, timeoutMs: number) {
  const deadline = performance.now() + timeoutMs
  while (performance.now() < deadline) {
    if (predicate()) return
    await waitFrames(1)
  }
  throw new Error(`Timed out after ${timeoutMs}ms`)
}

function round(value: number) {
  return Math.round(value * 1000) / 1000
}
