import {
  computeStackLayout,
  createCards,
  estimatePointerVelocity,
  reorderDraggedCard,
  type CardSpec,
  type PointerSample,
} from './logic.ts'

const CARD_WIDTH = 320
const MS_PER_ANIMATION_STEP = 4
const SPRING_STIFFNESS = 290
const SPRING_DAMPING = 24

type Spring = {
  pos: number
  dest: number
  v: number
}

type CardState = CardSpec & {
  x: Spring
  y: Spring
  scale: Spring
}

type DragState = {
  id: number
  pointerId: number
  deltaX: number
  deltaY: number
  pointerX: number
  pointerY: number
  history: PointerSample[]
}

type ReleaseState = {
  id: number
  deltaX: number
  deltaY: number
  pointerX: number
  pointerY: number
  vx: number
  vy: number
  time: number
}

type PointerEventRecord =
  | { type: 'pointerdown'; pointerId: number; x: number; y: number; time: number; targetId: number | null }
  | { type: 'pointermove'; pointerId: number; x: number; y: number; time: number }
  | { type: 'pointerup'; pointerId: number; x: number; y: number; time: number }
  | { type: 'pointercancel'; pointerId: number; x: number; y: number; time: number }

type Report = {
  phase: 'loading' | 'running' | 'ready' | 'error'
  requestId: string
  scenario: string
  orderedCardIds?: string[]
  lastDraggedId?: string | null
  topLayerCardId?: string | null
  message?: string
}

type State = {
  order: number[]
  drag: DragState | null
  lastDraggedId: number | null
  release: ReleaseState | null
  events: PointerEventRecord[]
  animatedUntilTime: number | null
}

const params = new URLSearchParams(location.search)
const scenario = params.get('scenario') ?? ''
const requestId = params.get('requestId') ?? ''

const cards = createCards().map<CardState>((card) => ({
  ...card,
  x: { pos: 0, dest: 0, v: 0 },
  y: { pos: 0, dest: 0, v: 0 },
  scale: { pos: 1, dest: 1, v: 0 },
}))

const domCards: Record<number, HTMLDivElement> = {}
const state: State = {
  order: cards.map((card) => card.id),
  drag: null,
  lastDraggedId: null,
  release: null,
  events: [],
  animatedUntilTime: null,
}

const stage = document.getElementById('stage')
if (!(stage instanceof HTMLElement)) {
  throw new Error('Missing #stage')
}

for (const card of cards) {
  const node = document.createElement('div')
  node.className = 'card'
  node.dataset.cardId = String(card.id)
  node.textContent = `Drag Me ${card.id}`
  node.style.width = `${CARD_WIDTH}px`
  node.style.height = `${card.sizeY}px`
  node.style.background = `hsl(216 86% ${card.lightnessBase}%)`
  node.style.transformOrigin = '50% 50%'
  stage.appendChild(node)
  domCards[card.id] = node
}

function makeSpring(value: number): Spring {
  return { pos: value, dest: value, v: 0 }
}

function getCenteredX() {
  return (document.documentElement.clientWidth - CARD_WIDTH) / 2
}

function springStep(spring: Spring) {
  const t = MS_PER_ANIMATION_STEP / 1000
  const forceSpring = -SPRING_STIFFNESS * (spring.pos - spring.dest)
  const forceDamper = -SPRING_DAMPING * spring.v
  const acceleration = forceSpring + forceDamper
  spring.v += acceleration * t
  spring.pos += spring.v * t
}

function springMostlyDone(spring: Spring) {
  return Math.abs(spring.v) < 0.01 && Math.abs(spring.pos - spring.dest) < 0.01
}

function initializeCardPositions() {
  const layout = computeStackLayout(state.order, cards)
  const centeredX = getCenteredX()

  for (const card of cards) {
    const target = layout.byId[card.id]!
    card.x = makeSpring(centeredX)
    card.y = makeSpring(target.top)
    card.scale = makeSpring(1)
    const node = domCards[card.id]!
    node.style.transform = `translate3d(${centeredX}px, ${target.top}px, 0) scale(1)`
    node.style.zIndex = String(10 + card.id)
    node.style.opacity = '1'
    node.style.boxShadow = '0 10px 20px rgba(0, 0, 0, 0.18)'
  }
}

function queuePointerEvent(event: PointerEventRecord) {
  state.events.push(event)
  scheduleRender()
}

function getCardIdFromTarget(target: EventTarget | null) {
  if (!(target instanceof Element)) {
    return null
  }

  const node = target.closest<HTMLElement>('[data-card-id]')
  if (node == null) {
    return null
  }

  return Number(node.dataset.cardId)
}

function pointerPointFromMouse(event: PointerEvent) {
  return {
    pointerId: event.pointerId,
    x: event.pageX,
    y: event.pageY,
    time: event.timeStamp,
  }
}

function pointerPointFromTouch(event: TouchEvent) {
  const touch = event.changedTouches[0]
  if (touch == null) {
    return null
  }

  return {
    pointerId: touch.identifier,
    x: touch.pageX,
    y: touch.pageY,
    time: event.timeStamp,
  }
}

function handlePointerDown(event: PointerEvent) {
  event.preventDefault()
  const point = pointerPointFromMouse(event)
  queuePointerEvent({
    type: 'pointerdown',
    pointerId: point.pointerId,
    x: point.x,
    y: point.y,
    time: point.time,
    targetId: getCardIdFromTarget(event.target),
  })
}

function handlePointerMove(event: PointerEvent) {
  const point = pointerPointFromMouse(event)
  queuePointerEvent({
    type: 'pointermove',
    pointerId: point.pointerId,
    x: point.x,
    y: point.y,
    time: point.time,
  })
}

function handlePointerUp(event: PointerEvent) {
  const point = pointerPointFromMouse(event)
  queuePointerEvent({
    type: 'pointerup',
    pointerId: point.pointerId,
    x: point.x,
    y: point.y,
    time: point.time,
  })
}

function handlePointerCancel(event: PointerEvent) {
  const point = pointerPointFromMouse(event)
  queuePointerEvent({
    type: 'pointercancel',
    pointerId: point.pointerId,
    x: point.x,
    y: point.y,
    time: point.time,
  })
}

function handleTouchStart(event: TouchEvent) {
  event.preventDefault()
  const point = pointerPointFromTouch(event)
  if (point == null) {
    return
  }

  queuePointerEvent({
    type: 'pointerdown',
    pointerId: point.pointerId,
    x: point.x,
    y: point.y,
    time: point.time,
    targetId: getCardIdFromTarget(event.target),
  })
}

function handleTouchMove(event: TouchEvent) {
  event.preventDefault()
  const point = pointerPointFromTouch(event)
  if (point == null) {
    return
  }

  queuePointerEvent({
    type: 'pointermove',
    pointerId: point.pointerId,
    x: point.x,
    y: point.y,
    time: point.time,
  })
}

function handleTouchEnd(event: TouchEvent) {
  const point = pointerPointFromTouch(event)
  if (point == null) {
    return
  }

  queuePointerEvent({
    type: 'pointerup',
    pointerId: point.pointerId,
    x: point.x,
    y: point.y,
    time: point.time,
  })
}

function handleTouchCancel(event: TouchEvent) {
  const point = pointerPointFromTouch(event)
  if (point == null) {
    return
  }

  queuePointerEvent({
    type: 'pointercancel',
    pointerId: point.pointerId,
    x: point.x,
    y: point.y,
    time: point.time,
  })
}

stage.addEventListener('pointerdown', handlePointerDown)
window.addEventListener('pointermove', handlePointerMove)
window.addEventListener('pointerup', handlePointerUp)
window.addEventListener('pointercancel', handlePointerCancel)
stage.addEventListener('touchstart', handleTouchStart, { passive: false })
window.addEventListener('touchmove', handleTouchMove, { passive: false })
window.addEventListener('touchend', handleTouchEnd)
window.addEventListener('touchcancel', handleTouchCancel)

function processInputs() {
  while (state.events.length > 0) {
    const event = state.events.shift()!
    switch (event.type) {
      case 'pointerdown': {
        if (state.drag != null || event.targetId == null) {
          break
        }

        const card = cards[event.targetId]!
        state.drag = {
          id: event.targetId,
          pointerId: event.pointerId,
          deltaX: event.x - card.x.pos,
          deltaY: event.y - card.y.pos,
          pointerX: event.x,
          pointerY: event.y,
          history: [{ x: event.x, y: event.y, time: event.time }],
        }
        state.lastDraggedId = null
        break
      }
      case 'pointermove': {
        if (state.drag == null || state.drag.pointerId !== event.pointerId) {
          break
        }

        state.drag.pointerX = event.x
        state.drag.pointerY = event.y
        state.drag.history.push({ x: event.x, y: event.y, time: event.time })
        while (state.drag.history.length > 40) {
          state.drag.history.shift()
        }
        break
      }
      case 'pointerup':
      case 'pointercancel': {
        if (state.drag == null || state.drag.pointerId !== event.pointerId) {
          break
        }

        const history = state.drag.history.slice()
        history.push({ x: event.x, y: event.y, time: event.time })
        const velocity = estimatePointerVelocity(history, event.time)
        state.release = {
          id: state.drag.id,
          deltaX: state.drag.deltaX,
          deltaY: state.drag.deltaY,
          pointerX: event.x,
          pointerY: event.y,
          vx: velocity.vx,
          vy: velocity.vy,
          time: event.time,
        }
        state.drag = null
        break
      }
    }
  }
}

function applyRelease(layout: ReturnType<typeof computeStackLayout>) {
  if (state.release == null) {
    return
  }

  const release = state.release
  const card = cards[release.id]!
  const rawX = release.pointerX - release.deltaX
  const rawY = release.pointerY - release.deltaY
  const centeredX = getCenteredX()
  const dragX = rawX + (centeredX - rawX) / 1.5

  card.x.pos = dragX
  card.x.dest = centeredX
  card.x.v = release.vx
  card.y.pos = rawY
  card.y.dest = layout.byId[release.id]!.top
  card.y.v = release.vy
  card.scale.pos = 1.1
  card.scale.dest = 1
  card.scale.v = 0

  state.lastDraggedId = release.id
  state.animatedUntilTime = release.time
  state.release = null
}

function cardZIndex(cardId: number) {
  if (state.drag?.id === cardId) {
    return 300
  }

  if (state.drag == null && state.lastDraggedId === cardId) {
    return 200
  }

  return 10 + state.order.indexOf(cardId)
}

function snapshotReport(phase: Report['phase']): Report {
  let topLayerCardId: number | null = null
  let topLayerZ = -Infinity

  for (const card of cards) {
    const zIndex = cardZIndex(card.id)
    if (zIndex > topLayerZ) {
      topLayerZ = zIndex
      topLayerCardId = card.id
    }
  }

  return {
    phase,
    requestId,
    scenario,
    orderedCardIds: state.order.map((id) => String(id)),
    lastDraggedId: state.lastDraggedId == null ? null : String(state.lastDraggedId),
    topLayerCardId: topLayerCardId == null ? null : String(topLayerCardId),
  }
}

function publishReport(report: Report) {
  location.hash = `report=${encodeURIComponent(JSON.stringify(report))}`
}

let scheduledRaf: number | null = null

function scheduleRender() {
  if (scheduledRaf != null) {
    return
  }

  scheduledRaf = requestAnimationFrame(function renderAndMaybeScheduleAnotherFrame(now) {
    scheduledRaf = null
    if (render(now)) {
      scheduleRender()
    }
  })
}

function render(now: number) {
  processInputs()

  if (state.drag != null) {
    const draggedCard = cards[state.drag.id]!
    const draggedCenterY = state.drag.pointerY - state.drag.deltaY + draggedCard.sizeY / 2
    state.order = reorderDraggedCard(state.order, state.drag.id, draggedCenterY, cards)
  }

  const draggedId = state.drag?.id ?? null
  const layout = draggedId == null ? computeStackLayout(state.order, cards) : computeStackLayout(state.order.filter((id) => id !== draggedId), cards)

  if (state.release != null) {
    applyRelease(layout)
  }

  const settledLayout = state.drag == null ? computeStackLayout(state.order, cards) : computeStackLayout(state.order.filter((id) => id !== state.drag.id), cards)

  const canAdvance = state.drag == null
  const animatedUntilTime = state.animatedUntilTime ?? now
  const steps = canAdvance ? Math.min(300, Math.floor((now - animatedUntilTime) / MS_PER_ANIMATION_STEP)) : 0
  const nextAnimatedUntilTime = animatedUntilTime + steps * MS_PER_ANIMATION_STEP

  let stillAnimating = false

  for (const card of cards) {
    const node = domCards[card.id]!
    const isDragged = state.drag?.id === card.id

    if (isDragged) {
      const rawX = state.drag!.pointerX - state.drag!.deltaX
      const rawY = state.drag!.pointerY - state.drag!.deltaY
      const centeredX = getCenteredX()
      const dragX = rawX + (centeredX - rawX) / 1.5
      card.x.pos = card.x.dest = dragX
      card.y.pos = card.y.dest = rawY
      card.scale.pos = card.scale.dest = 1.1
      card.x.v = 0
      card.y.v = 0
      card.scale.v = 0
      node.style.transform = `translate3d(${dragX}px, ${rawY}px, 0) scale(1.1)`
      node.style.zIndex = String(cardZIndex(card.id))
      node.style.opacity = '0.7'
      node.style.boxShadow = '0 30px 70px rgba(0, 0, 0, 0.34)'
      continue
    }

    card.x.dest = getCenteredX()
    card.y.dest = settledLayout.byId[card.id]!.top
    card.scale.dest = 1

    for (let i = 0; i < steps; i++) {
      springStep(card.x)
      springStep(card.y)
      springStep(card.scale)
    }

    if (!springMostlyDone(card.x) || !springMostlyDone(card.y) || !springMostlyDone(card.scale)) {
      stillAnimating = true
    } else {
      card.x.pos = card.x.dest
      card.y.pos = card.y.dest
      card.scale.pos = card.scale.dest
      card.x.v = 0
      card.y.v = 0
      card.scale.v = 0
    }

    node.style.transform = `translate3d(${card.x.pos}px, ${card.y.pos}px, 0) scale(${card.scale.pos})`
    node.style.zIndex = String(cardZIndex(card.id))
    node.style.opacity = '1'
    node.style.boxShadow = state.lastDraggedId === card.id ? '0 30px 70px rgba(0, 0, 0, 0.34)' : '0 10px 20px rgba(0, 0, 0, 0.18)'
  }

  if (state.lastDraggedId != null) {
    const lastDragged = cards[state.lastDraggedId]!
    if (springMostlyDone(lastDragged.x) && springMostlyDone(lastDragged.y) && springMostlyDone(lastDragged.scale)) {
      state.lastDraggedId = null
    } else {
      stillAnimating = true
    }
  }

  if (state.drag != null || state.release != null) {
    stillAnimating = true
  }

  state.animatedUntilTime = stillAnimating ? nextAnimatedUntilTime : null
  document.body.style.cursor = state.drag != null ? 'grabbing' : 'default'
  return stillAnimating
}

initializeCardPositions()
publishReport(snapshotReport('loading'))
scheduleRender()
void runScenario()

async function nextFrame() {
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
}

async function waitForSettled() {
  for (;;) {
    let settled = true
    for (const card of cards) {
      if (!springMostlyDone(card.x) || !springMostlyDone(card.y) || !springMostlyDone(card.scale)) {
        settled = false
        break
      }
    }

    if (settled && state.drag == null && state.release == null && state.lastDraggedId == null) {
      return
    }

    await nextFrame()
  }
}

function pointerEventAt(type: string, target: EventTarget, x: number, y: number, extra: { pointerId?: number; buttons?: number; button?: number } = {}) {
  const event = new PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    composed: true,
    pointerId: extra.pointerId ?? 1,
    pointerType: 'mouse',
    isPrimary: true,
    buttons: extra.buttons ?? 0,
    button: extra.button ?? 0,
    clientX: x,
    clientY: y,
  })
  target.dispatchEvent(event)
}

async function delay(ms: number) {
  await new Promise<void>((resolve) => setTimeout(resolve, ms))
}

async function runReorderScenario() {
  await nextFrame()
  const card = domCards[1]!
  const startRect = card.getBoundingClientRect()
  const startX = startRect.left + startRect.width / 2
  const startY = startRect.top + startRect.height / 2
  pointerEventAt('pointerdown', card, startX, startY, { buttons: 1, button: 0 })
  await nextFrame()

  const targetRect = domCards[2]!.getBoundingClientRect()
  const moveX = targetRect.left + targetRect.width / 2
  const moveY = targetRect.top + targetRect.height / 2 + 18
  pointerEventAt('pointermove', window, moveX, moveY, { buttons: 1 })
  await nextFrame()
  pointerEventAt('pointerup', window, moveX, moveY)
  await nextFrame()

  await waitForSettled()
  publishReport(snapshotReport('ready'))
}

async function runSettlingDepthScenario() {
  await nextFrame()
  const card = domCards[2]!
  const startRect = card.getBoundingClientRect()
  const startX = startRect.left + startRect.width / 2
  const startY = startRect.top + startRect.height / 2
  pointerEventAt('pointerdown', card, startX, startY, { buttons: 1, button: 0 })
  await nextFrame()

  const moveX = startX + 24
  const moveY = startY + 18
  pointerEventAt('pointermove', window, moveX, moveY, { buttons: 1 })
  await nextFrame()
  pointerEventAt('pointerup', window, moveX, moveY)

  await nextFrame()
  publishReport(snapshotReport('running'))
  await delay(120)
  await waitForSettled()
  publishReport(snapshotReport('ready'))
}

async function runScenario() {
  if (scenario === '') {
    return
  }

  try {
    switch (scenario) {
      case 'reorder':
        await runReorderScenario()
        break
      case 'settling-depth':
        await runSettlingDepthScenario()
        break
      default:
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
