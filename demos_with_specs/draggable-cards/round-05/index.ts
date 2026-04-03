import {
  CARD_COUNT,
  MS_PER_ANIMATION_STEP,
  ROW_SIZE_X,
  TOP_PADDING,
  applyDragReorder,
  centeredCardX,
  estimateReleaseVelocity,
  makeCards,
  spring,
  springGoToEnd,
  springMostlyDone,
  springStep,
  type CardModel,
  type PointerSample,
  type Spring,
} from './logic.ts'

type CardState = CardModel & {
  element: HTMLDivElement
  x: Spring
  y: Spring
  scale: Spring
}

type DragState = {
  cardId: number
  deltaX: number
  deltaY: number
  pointerX: number
  pointerY: number
  pointerType: string
  samples: PointerSample[]
}

type Snapshot = {
  order: number[]
  draggedId: number | null
  lastDraggedId: number | null
  topCardId: number | null
  zOrderTopToBottom: number[]
  positions: Array<{ id: number; x: number; y: number; z: number }>
}

type ScenarioReport = Snapshot & {
  phase: 'loading' | 'running' | 'ready' | 'error'
  requestId: string
  scenario: string
  swapCount: number
  swapObservedDuringDrag: boolean
  duringSettle: {
    lastDraggedId: number | null
    topCardId: number | null
  }
  env: {
    userAgent: string
    viewportWidth: number
    viewportHeight: number
    devicePixelRatio: number
  }
  message?: string
}

const params = new URLSearchParams(location.search)
const shouldReport = params.get('report') === '1'
const scenario = params.get('scenario') ?? 'interactive'
const requestId = params.get('requestId') ?? ''

const cards = makeCards(CARD_COUNT).map(card => {
  const element = document.createElement('div')
  element.className = 'card'
  element.textContent = card.label
  element.dataset.cardId = String(card.id)
  document.body.append(element)
  return {
    ...card,
    element,
    x: spring(0),
    y: spring(0),
    scale: spring(1),
  }
})

const state = {
  cards,
  order: cards.map(card => card.id),
  drag: null as DragState | null,
  hoveredId: null as number | null,
  lastDraggedId: null as number | null,
  lastAnimationTime: performance.now(),
  rafId: 0,
}

layoutCards()
syncCardPositionsToDestinations()
render()
installInput()
scheduleFrame()

if (shouldReport) {
  publishReport({
    ...captureReport('loading', 0, false, { lastDraggedId: null, topCardId: null }),
  })
  void runScenario().catch(error => {
    publishReport({
      ...captureReport('error', 0, false, { lastDraggedId: state.lastDraggedId, topCardId: computeTopCardId() }),
      message: error instanceof Error ? error.message : String(error),
    })
  })
}

function installInput() {
  for (const card of state.cards) {
    card.element.addEventListener('pointerdown', event => {
      if (event.button !== 0) return
      event.preventDefault()
      beginDrag(card.id, event.pageX, event.pageY, event.timeStamp, event.pointerType)
    })
  }

  window.addEventListener('pointermove', event => {
    if (state.drag != null) {
      if (event.pointerType.length === 0 || state.drag.pointerType === event.pointerType || state.drag.pointerType === 'mouse') {
        updateDrag(event.pageX, event.pageY, event.timeStamp)
      }
      return
    }
    updateHover(event.pageX, event.pageY)
  }, { passive: true })

  window.addEventListener('mousemove', event => {
    if (state.drag == null) {
      updateHover(event.pageX, event.pageY)
      return
    }
    if (state.drag.pointerType !== 'touch') {
      updateDrag(event.pageX, event.pageY, event.timeStamp)
    }
  }, { passive: true })

  window.addEventListener('touchmove', event => {
    if (state.drag == null || state.drag.pointerType !== 'touch') return
    const touch = event.touches[0]
    if (touch == null) return
    updateDrag(touch.pageX, touch.pageY, event.timeStamp)
  }, { passive: true })

  window.addEventListener('pointerup', event => {
    if (state.drag == null) return
    finishDrag(event.pageX, event.pageY, event.timeStamp)
  }, { passive: true })

  window.addEventListener('mouseup', event => {
    if (state.drag == null || state.drag.pointerType === 'touch') return
    finishDrag(event.pageX, event.pageY, event.timeStamp)
  }, { passive: true })

  window.addEventListener('pointercancel', event => {
    if (state.drag == null) return
    finishDrag(event.pageX, event.pageY, event.timeStamp)
  }, { passive: true })

  window.addEventListener('touchend', event => {
    if (state.drag == null) return
    const touch = event.changedTouches[0]
    if (touch == null) {
      finishDrag(state.drag.pointerX, state.drag.pointerY, event.timeStamp)
      return
    }
    finishDrag(touch.pageX, touch.pageY, event.timeStamp)
  }, { passive: true })

  window.addEventListener('touchcancel', event => {
    if (state.drag == null) return
    const touch = event.changedTouches[0]
    if (touch == null) {
      finishDrag(state.drag.pointerX, state.drag.pointerY, event.timeStamp)
      return
    }
    finishDrag(touch.pageX, touch.pageY, event.timeStamp)
  }, { passive: true })

  window.addEventListener('resize', () => {
    layoutCards()
    if (state.drag != null) {
      pinDraggedCard()
    }
    scheduleFrame()
  })
}

function beginDrag(cardId: number, pointerX: number, pointerY: number, time: number, pointerType: string) {
  const card = state.cards[cardId]!
  state.drag = {
    cardId,
    deltaX: pointerX - card.x.pos,
    deltaY: pointerY - card.y.pos,
    pointerX,
    pointerY,
    pointerType,
    samples: [{ x: pointerX, y: pointerY, time }],
  }
  state.lastDraggedId = null
  card.scale.dest = 1.1
  pinDraggedCard()
  render()
  scheduleFrame()
}

function updateDrag(pointerX: number, pointerY: number, time: number) {
  if (state.drag == null) return
  state.drag.pointerX = pointerX
  state.drag.pointerY = pointerY
  pushSample(state.drag.samples, { x: pointerX, y: pointerY, time })
  pinDraggedCard()
  const draggedIndex = state.order.indexOf(state.drag.cardId)
  const reorder = applyDragReorder(state.order, draggedIndex, pointerY, state.cards, TOP_PADDING)
  if (reorder.swapCount > 0) {
    state.order = reorder.order
  }
  layoutCards()
  render()
  scheduleFrame()
}

function finishDrag(pointerX: number, pointerY: number, time: number) {
  if (state.drag == null) return
  const drag = state.drag
  pushSample(drag.samples, { x: pointerX, y: pointerY, time })
  const velocity = estimateReleaseVelocity(drag.samples)
  const card = state.cards[drag.cardId]!
  card.x.v += velocity.x
  card.y.v += velocity.y
  card.scale.dest = 1
  state.drag = null
  state.lastDraggedId = drag.cardId
  layoutCards()
  render()
  scheduleFrame()
}

function layoutCards() {
  const x = centeredCardX(document.documentElement.clientWidth)
  let y = TOP_PADDING
  for (const id of state.order) {
    if (state.drag?.cardId === id) continue
    const card = state.cards[id]!
    card.x.dest = x
    card.y.dest = y
    y += card.sizeY
  }
}

function syncCardPositionsToDestinations() {
  for (const card of state.cards) {
    card.x.pos = card.x.dest
    card.y.pos = card.y.dest
    card.x.v = 0
    card.y.v = 0
  }
}

function pinDraggedCard() {
  if (state.drag == null) return
  const card = state.cards[state.drag.cardId]!
  const rawX = state.drag.pointerX - state.drag.deltaX
  const centeredX = centeredCardX(document.documentElement.clientWidth)
  const dragX = rawX + (centeredX - rawX) / 1.5
  const dragY = state.drag.pointerY - state.drag.deltaY
  card.x.pos = dragX
  card.x.dest = dragX
  card.y.pos = dragY
  card.y.dest = dragY
}

function updateHover(pointerX: number, pointerY: number) {
  state.hoveredId = hitTest(pointerX, pointerY)
  render()
}

function hitTest(pointerX: number, pointerY: number) {
  const zOrder = getZOrder()
  for (const id of zOrder) {
    const card = state.cards[id]!
    if (
      pointerX >= card.x.pos &&
      pointerX <= card.x.pos + ROW_SIZE_X &&
      pointerY >= card.y.pos &&
      pointerY <= card.y.pos + card.sizeY
    ) {
      return id
    }
  }
  return null
}

function scheduleFrame() {
  if (state.rafId !== 0) return
  state.rafId = requestAnimationFrame(frame)
}

function frame(now: number) {
  state.rafId = 0
  const elapsed = now - state.lastAnimationTime
  const steps = Math.min(300, Math.floor(elapsed / MS_PER_ANIMATION_STEP))
  if (steps > 0) {
    state.lastAnimationTime += steps * MS_PER_ANIMATION_STEP
    for (let step = 0; step < steps; step++) {
      for (const card of state.cards) {
        if (state.drag?.cardId === card.id) continue
        springStep(card.x)
        springStep(card.y)
        springStep(card.scale)
        if (springMostlyDone(card.x)) springGoToEnd(card.x)
        if (springMostlyDone(card.y)) springGoToEnd(card.y)
        if (springMostlyDone(card.scale)) springGoToEnd(card.scale)
      }
    }
  }
  if (state.drag != null) {
    pinDraggedCard()
  }
  if (state.lastDraggedId != null) {
    const card = state.cards[state.lastDraggedId]!
    if (springMostlyDone(card.x) && springMostlyDone(card.y) && springMostlyDone(card.scale)) {
      springGoToEnd(card.x)
      springGoToEnd(card.y)
      springGoToEnd(card.scale)
      state.lastDraggedId = null
    }
  }
  render()
  if (state.drag != null || hasAnimatingCard()) {
    scheduleFrame()
  }
}

function hasAnimatingCard() {
  return state.cards.some(card => (
    !springMostlyDone(card.x) ||
    !springMostlyDone(card.y) ||
    !springMostlyDone(card.scale)
  ))
}

function render() {
  document.body.style.cursor = state.drag != null ? 'grabbing' : 'auto'
  for (const card of state.cards) {
    const dragging = state.drag?.cardId === card.id
    const hovering = state.hoveredId === card.id && state.drag == null
    const z = getZIndex(card.id)
    const outline = `hsl(210 76% ${clamp(card.lightnessBase - 12, 26, 78)}%)`
    const fill = `linear-gradient(180deg, hsl(210 78% ${clamp(card.lightnessBase + 6, 44, 92)}%), hsl(214 72% ${clamp(card.lightnessBase - 4, 36, 84)}%))`
    card.element.style.height = `${card.sizeY}px`
    card.element.style.transform = `translate(${card.x.pos}px, ${card.y.pos}px) scale(${card.scale.pos})`
    card.element.style.background = fill
    card.element.style.borderColor = outline
    card.element.style.boxShadow = dragging
      ? '0 30px 55px rgba(25, 48, 110, 0.34)'
      : '0 10px 24px rgba(28, 52, 110, 0.16)'
    card.element.style.opacity = dragging ? '0.7' : '1'
    card.element.style.zIndex = String(z)
    card.element.style.cursor = dragging ? 'grabbing' : hovering ? 'grab' : 'auto'
  }
}

function getZIndex(cardId: number) {
  if (state.drag?.cardId === cardId) return 100
  if (state.lastDraggedId === cardId) return 50
  return state.order.indexOf(cardId) + 1
}

function getZOrder() {
  return [...state.cards]
    .sort((left, right) => getZIndex(right.id) - getZIndex(left.id))
    .map(card => card.id)
}

function computeTopCardId() {
  return getZOrder()[0] ?? null
}

function captureSnapshot(): Snapshot {
  const zOrderTopToBottom = getZOrder()
  return {
    order: [...state.order],
    draggedId: state.drag?.cardId ?? null,
    lastDraggedId: state.lastDraggedId,
    topCardId: zOrderTopToBottom[0] ?? null,
    zOrderTopToBottom,
    positions: state.cards.map(card => ({
      id: card.id,
      x: round2(card.x.pos),
      y: round2(card.y.pos),
      z: getZIndex(card.id),
    })),
  }
}

function captureReport(
  phase: ScenarioReport['phase'],
  swapCount: number,
  swapObservedDuringDrag: boolean,
  duringSettle: ScenarioReport['duringSettle'],
): ScenarioReport {
  return {
    phase,
    requestId,
    scenario,
    swapCount,
    swapObservedDuringDrag,
    duringSettle,
    env: {
      userAgent: navigator.userAgent,
      viewportWidth: document.documentElement.clientWidth,
      viewportHeight: document.documentElement.clientHeight,
      devicePixelRatio: window.devicePixelRatio,
    },
    ...captureSnapshot(),
  }
}

function publishReport(report: ScenarioReport) {
  location.hash = `report=${encodeURIComponent(JSON.stringify(report))}`
}

async function runScenario() {
  await nextFrame()
  let swapCount = 0
  let swapObservedDuringDrag = false
  let duringSettle = { lastDraggedId: null as number | null, topCardId: null as number | null }

  publishReport(captureReport('running', 0, false, duringSettle))

  if (scenario === 'swap-down') {
    const card0 = state.cards[0]!
    const startX = card0.x.pos + ROW_SIZE_X / 2
    const startY = card0.y.pos + card0.sizeY / 2
    beginDrag(0, startX, startY, 0, 'script')
    const path = [
      { x: startX + 20, y: state.cards[1]!.y.dest + state.cards[1]!.sizeY / 2 + 12, time: 16 },
      { x: startX + 40, y: state.cards[2]!.y.dest + state.cards[2]!.sizeY / 2 + 18, time: 32 },
    ]
    for (const point of path) {
      const beforeOrder = [...state.order]
      updateDrag(point.x, point.y, point.time)
      if (beforeOrder.join(',') !== state.order.join(',')) {
        swapObservedDuringDrag = true
      }
      swapCount += Math.abs(state.order.indexOf(0) - beforeOrder.indexOf(0))
      await nextFrame()
    }
    finishDrag(path[path.length - 1]!.x, path[path.length - 1]!.y, 48)
    await waitForIdle()
  } else if (scenario === 'release-depth') {
    const card2 = state.cards[2]!
    const startX = card2.x.pos + ROW_SIZE_X / 2
    const startY = card2.y.pos + card2.sizeY / 2
    beginDrag(2, startX, startY, 0, 'script')
    const path = [
      { x: startX + 90, y: startY + 12, time: 16 },
      { x: startX + 150, y: startY + 20, time: 32 },
    ]
    for (const point of path) {
      updateDrag(point.x, point.y, point.time)
      await nextFrame()
    }
    finishDrag(path[path.length - 1]!.x, path[path.length - 1]!.y, 48)
    await nextFrame()
    duringSettle = {
      lastDraggedId: state.lastDraggedId,
      topCardId: computeTopCardId(),
    }
    await waitForIdle()
  } else {
    throw new Error(`Unknown scenario "${scenario}"`)
  }

  publishReport(captureReport('ready', swapCount, swapObservedDuringDrag, duringSettle))
}

async function waitForIdle() {
  const deadline = performance.now() + 10_000
  while (performance.now() < deadline) {
    if (state.drag == null && !hasAnimatingCard() && state.lastDraggedId == null) return
    await nextFrame()
  }
  throw new Error('Scenario did not settle before timeout')
}

function nextFrame() {
  return new Promise<void>(resolve => {
    requestAnimationFrame(() => resolve())
  })
}

function pushSample(samples: PointerSample[], sample: PointerSample) {
  samples.push(sample)
  if (samples.length > 20) samples.shift()
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function round2(value: number) {
  return Math.round(value * 100) / 100
}
