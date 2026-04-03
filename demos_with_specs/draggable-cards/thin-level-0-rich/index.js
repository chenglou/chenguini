import {
  CARD_COUNT,
  DRAG_OPACITY,
  DRAG_SCALE,
  MS_PER_ANIMATION_STEP,
  ROW_SIZE_X,
  SPRING_DAMPING,
  SPRING_STIFFNESS,
  TOP_PADDING_Y,
  buildCardRects,
  computeDragX,
  createCardMetrics,
  estimateReleaseVelocity,
  reorderByMidpoint,
} from './logic.js'

const params = new URLSearchParams(window.location.search)
const scenario = params.get('scenario') ?? ''
const requestId = params.get('requestId') ?? ''

const cardMetrics = createCardMetrics(CARD_COUNT)
const metricById = new Map(cardMetrics.map((metric) => [metric.id, metric]))
const cardStates = new Map()
const cardElements = new Map()

const state = {
  drag: null,
  elevatedCardId: null,
  lastDraggedId: null,
  orderedCardIds: cardMetrics.map((metric) => metric.id),
  releasedCardId: null,
}

const root = document.querySelector('[data-demo-root]')
if (!(root instanceof HTMLElement)) {
  throw new Error('Missing demo root.')
}

const scene = document.createElement('div')
scene.className = 'scene'
root.append(scene)

for (const metric of cardMetrics) {
  const cardState = {
    id: metric.id,
    opacity: 1,
    targetOpacity: 1,
    targetScale: 1,
    targetX: 0,
    targetY: 0,
    scale: 1,
    vOpacity: 0,
    vScale: 0,
    vx: 0,
    vy: 0,
    x: 0,
    y: 0,
  }

  cardStates.set(metric.id, cardState)

  const card = document.createElement('button')
  card.className = 'card'
  card.type = 'button'
  card.dataset.cardId = String(metric.id)
  card.style.height = `${metric.sizeY}px`
  card.style.width = `${ROW_SIZE_X}px`
  card.style.background = `linear-gradient(180deg, hsl(${26 + metric.id * 24} 72% ${metric.lightnessBase + 8}%), hsl(${26 + metric.id * 24} 72% ${metric.lightnessBase}%))`
  card.innerHTML = `
    <span class="card-index">#${metric.id}</span>
    <span class="card-title">Card ${metric.id + 1}</span>
    <span class="card-size">${Math.round(metric.sizeY)}px tall</span>
  `
  card.addEventListener('pointerdown', (event) => {
    event.preventDefault()
    startDrag(metric.id, event.clientX, event.clientY, performance.now())
  })

  cardElements.set(metric.id, card)
  scene.append(card)
}

syncTargets({ jumpToTargets: true })
render()

window.addEventListener(
  'pointermove',
  (event) => {
    if (!state.drag) {
      return
    }

    event.preventDefault()
    moveDrag(event.clientX, event.clientY, performance.now())
  },
  { passive: false },
)

window.addEventListener(
  'pointerup',
  (event) => {
    if (!state.drag) {
      return
    }

    event.preventDefault()
    moveDrag(event.clientX, event.clientY, performance.now())
    endDrag(performance.now())
  },
  { passive: false },
)

window.addEventListener(
  'pointercancel',
  (event) => {
    if (!state.drag) {
      return
    }

    event.preventDefault()
    endDrag(performance.now())
  },
  { passive: false },
)

window.addEventListener('resize', () => {
  syncTargets()
  render()
})

let previousFrameMs = performance.now()
let accumulatedMs = 0

function frame(now) {
  const frameDeltaMs = Math.min(32, now - previousFrameMs)
  previousFrameMs = now
  accumulatedMs += frameDeltaMs

  while (accumulatedMs >= MS_PER_ANIMATION_STEP) {
    stepSimulation(MS_PER_ANIMATION_STEP)
    accumulatedMs -= MS_PER_ANIMATION_STEP
  }

  render()
  window.requestAnimationFrame(frame)
}

window.requestAnimationFrame(frame)

publishReport({ phase: scenario ? 'loading' : 'ready' })

if (scenario && requestId) {
  window.setTimeout(() => {
    void runScenario()
  }, 0)
}

async function runScenario() {
  publishReport({ phase: 'running' })

  try {
    if (scenario === 'reorder-before-release') {
      const report = await runReorderBeforeReleaseScenario()
      publishReport({ phase: 'ready', ...report })
      return
    }

    if (scenario === 'top-until-settle') {
      const report = await runTopUntilSettleScenario()
      publishReport({ phase: 'ready', ...report })
      return
    }

    publishReport({
      phase: 'error',
      message: `Unknown scenario: ${scenario}`,
    })
  } catch (error) {
    publishReport({
      phase: 'error',
      message: error instanceof Error ? error.message : String(error),
    })
  }
}

function startDrag(cardId, pointerX, pointerY, timeMs) {
  const cardState = requireCardState(cardId)
  state.drag = {
    cardId,
    deltaX: pointerX - cardState.x,
    deltaY: pointerY - cardState.y,
    pointerSamples: [{ timeMs, x: pointerX, y: pointerY }],
  }
  state.elevatedCardId = cardId
  state.lastDraggedId = cardId
  state.releasedCardId = null
  cardState.targetScale = DRAG_SCALE
  cardState.targetOpacity = DRAG_OPACITY
  cardState.scale = DRAG_SCALE
  cardState.opacity = DRAG_OPACITY
  cardState.vx = 0
  cardState.vy = 0
  moveDrag(pointerX, pointerY, timeMs)
}

function moveDrag(pointerX, pointerY, timeMs) {
  if (!state.drag) {
    return
  }

  const drag = state.drag
  drag.pointerSamples.push({ timeMs, x: pointerX, y: pointerY })
  drag.pointerSamples = drag.pointerSamples.filter((sample) => sample.timeMs >= timeMs - 240)

  const cardState = requireCardState(drag.cardId)
  cardState.x = computeDragX({
    deltaX: drag.deltaX,
    pointerX,
    windowWidth: window.innerWidth,
  })
  cardState.y = pointerY - drag.deltaY

  const nextOrder = reorderByMidpoint({
    draggedId: drag.cardId,
    orderedCardIds: state.orderedCardIds,
    pointerY,
    slots: buildCardRects(state.orderedCardIds, cardMetrics, TOP_PADDING_Y),
  })

  if (!arraysEqual(nextOrder, state.orderedCardIds)) {
    state.orderedCardIds = nextOrder
    syncTargets()
  }
}

function endDrag(timeMs) {
  if (!state.drag) {
    return
  }

  const drag = state.drag
  const cardState = requireCardState(drag.cardId)
  const releaseVelocity = estimateReleaseVelocity(drag.pointerSamples, timeMs)

  state.drag = null
  state.releasedCardId = drag.cardId
  state.elevatedCardId = drag.cardId

  cardState.targetScale = 1
  cardState.targetOpacity = 1
  cardState.vx += releaseVelocity.x * 1000
  cardState.vy += releaseVelocity.y * 1000

  syncTargets()
}

function syncTargets({ jumpToTargets = false } = {}) {
  const centeredX = (window.innerWidth - ROW_SIZE_X) / 2
  const cardRects = buildCardRects(state.orderedCardIds, cardMetrics, TOP_PADDING_Y)
  let totalHeight = 0

  for (const rect of cardRects) {
    const cardState = requireCardState(rect.id)
    cardState.targetX = centeredX
    cardState.targetY = rect.topY

    if (jumpToTargets && state.drag?.cardId !== rect.id) {
      cardState.x = cardState.targetX
      cardState.y = cardState.targetY
    }

    totalHeight = rect.topY + rect.sizeY
  }

  scene.style.height = `${Math.ceil(totalHeight + 140)}px`
}

function stepSimulation(stepMs) {
  for (const cardState of cardStates.values()) {
    const isDraggedCard = state.drag?.cardId === cardState.id

    if (!isDraggedCard) {
      stepSpring(cardState, 'x', 'vx', cardState.targetX, stepMs)
      stepSpring(cardState, 'y', 'vy', cardState.targetY, stepMs)
    }

    stepSpring(cardState, 'scale', 'vScale', cardState.targetScale, stepMs, 250, 20)
    stepSpring(cardState, 'opacity', 'vOpacity', cardState.targetOpacity, stepMs, 250, 20)
  }

  if (state.releasedCardId !== null) {
    const releasedCardState = requireCardState(state.releasedCardId)

    if (isCardSettled(releasedCardState)) {
      state.releasedCardId = null
      state.elevatedCardId = null
    }
  }
}

function render() {
  for (const cardId of state.orderedCardIds) {
    const cardState = requireCardState(cardId)
    const metric = metricById.get(cardId)
    const element = cardElements.get(cardId)

    if (!metric || !element) {
      continue
    }

    const orderIndex = state.orderedCardIds.indexOf(cardId)
    element.style.opacity = String(clamp(cardState.opacity, 0.4, 1))
    element.style.transform = `translate3d(${cardState.x}px, ${cardState.y}px, 0) scale(${cardState.scale})`
    element.style.zIndex = String(state.elevatedCardId === cardId ? 1000 : orderIndex + 1)
    element.setAttribute('aria-label', `Card ${cardId + 1}`)
  }
}

async function runReorderBeforeReleaseScenario() {
  await waitFrames(2)

  const draggedId = 2
  const draggedCardState = requireCardState(draggedId)
  const draggedMetric = metricById.get(draggedId)
  const cardOneRect = buildCardRects(state.orderedCardIds, cardMetrics, TOP_PADDING_Y).find(
    (rect) => rect.id === 1,
  )

  if (!draggedMetric || !cardOneRect) {
    throw new Error('Could not find the automation seed cards.')
  }

  const pointerX = draggedCardState.x + ROW_SIZE_X / 2
  const pointerStartY = draggedCardState.y + draggedMetric.sizeY / 2

  startDrag(draggedId, pointerX, pointerStartY, performance.now())
  await waitMs(16)
  moveDrag(pointerX, cardOneRect.midpointY - 1, performance.now())
  await waitMs(32)

  const reorderedBeforeRelease = arraysEqual(state.orderedCardIds, [0, 2, 1, 3, 4])

  endDrag(performance.now())
  await waitUntil(() => state.releasedCardId === null, 5_000)

  return {
    lastDraggedId: draggedId,
    orderedCardIds: [...state.orderedCardIds],
    reorderedBeforeRelease,
  }
}

async function runTopUntilSettleScenario() {
  await waitFrames(2)

  const draggedId = 2
  const draggedCardState = requireCardState(draggedId)
  const draggedMetric = metricById.get(draggedId)
  const cardOneRect = buildCardRects(state.orderedCardIds, cardMetrics, TOP_PADDING_Y).find(
    (rect) => rect.id === 1,
  )

  if (!draggedMetric || !cardOneRect) {
    throw new Error('Could not find the automation seed cards.')
  }

  const startPointerX = draggedCardState.x + ROW_SIZE_X / 2
  const startPointerY = draggedCardState.y + draggedMetric.sizeY / 2

  startDrag(draggedId, startPointerX, startPointerY, performance.now())
  await waitMs(16)
  moveDrag(startPointerX, cardOneRect.midpointY - 1, performance.now())
  await waitMs(60)
  moveDrag(startPointerX + 120, cardOneRect.midpointY - 36, performance.now())
  await waitMs(40)
  endDrag(performance.now())

  let stayedOnTopUntilSettle = true

  while (state.releasedCardId !== null) {
    if (getTopCardId() !== draggedId) {
      stayedOnTopUntilSettle = false
    }

    await waitFrames(1)
  }

  return {
    releasedCardId: draggedId,
    stayedOnTopUntilSettle,
  }
}

function getTopCardId() {
  if (state.elevatedCardId !== null) {
    return state.elevatedCardId
  }

  return state.orderedCardIds[state.orderedCardIds.length - 1] ?? null
}

function publishReport(partialReport) {
  if (!requestId || !scenario) {
    return
  }

  const report = {
    requestId,
    scenario,
    ...partialReport,
  }

  window.location.hash = `report=${encodeURIComponent(JSON.stringify(report))}`
}

function requireCardState(cardId) {
  const cardState = cardStates.get(cardId)

  if (!cardState) {
    throw new Error(`Missing card state for id ${cardId}`)
  }

  return cardState
}

function stepSpring(cardState, valueKey, velocityKey, target, stepMs, stiffness = SPRING_STIFFNESS, damping = SPRING_DAMPING) {
  const dt = stepMs / 1000
  const displacement = cardState[valueKey] - target
  const acceleration = -stiffness * displacement - damping * cardState[velocityKey]

  cardState[velocityKey] += acceleration * dt
  cardState[valueKey] += cardState[velocityKey] * dt
}

function isCardSettled(cardState) {
  return (
    Math.abs(cardState.x - cardState.targetX) < 0.6 &&
    Math.abs(cardState.y - cardState.targetY) < 0.6 &&
    Math.abs(cardState.scale - cardState.targetScale) < 0.01 &&
    Math.abs(cardState.opacity - cardState.targetOpacity) < 0.01 &&
    Math.abs(cardState.vx) < 6 &&
    Math.abs(cardState.vy) < 6 &&
    Math.abs(cardState.vScale) < 0.06 &&
    Math.abs(cardState.vOpacity) < 0.06
  )
}

function arraysEqual(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index])
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

function waitMs(durationMs) {
  return new Promise((resolve) => window.setTimeout(resolve, durationMs))
}

function waitFrames(frameCount) {
  return new Promise((resolve) => {
    let remaining = frameCount

    function tick() {
      remaining -= 1
      if (remaining <= 0) {
        resolve()
        return
      }

      window.requestAnimationFrame(tick)
    }

    window.requestAnimationFrame(tick)
  })
}

async function waitUntil(predicate, timeoutMs) {
  const deadline = performance.now() + timeoutMs

  while (performance.now() < deadline) {
    if (predicate()) {
      return
    }

    await waitFrames(1)
  }

  throw new Error('Timed out waiting for the scenario to settle.')
}
