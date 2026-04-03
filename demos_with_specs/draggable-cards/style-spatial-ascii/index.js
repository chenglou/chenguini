import {
  CARD_WIDTH,
  DRAGGED_SCALE,
  SPRING_STEP_MS,
  createCards,
  createSpring,
  estimateReleaseVelocity,
  layoutCards,
  reorderDraggedCard,
  springSettled,
  stepSpring,
} from './logic.js'

const params = new URLSearchParams(window.location.search)
const requestId = params.get('requestId') ?? ''
const scenario = params.get('scenario') ?? ''
const reportMode = requestId !== ''

const stage = document.querySelector('#stage')
if (!(stage instanceof HTMLElement)) {
  throw new Error('Missing stage container')
}

const cards = createCards()
const cardById = new Map(cards.map(card => [card.id, card]))
const order = cards.map(card => card.id)
const springsById = new Map()
const nodesById = new Map()

for (const card of cards) {
  springsById.set(card.id, {
    x: createSpring(0),
    y: createSpring(0),
    scale: createSpring(1),
  })
}

const state = {
  order,
  drag: null,
  lastDraggedId: null,
  pendingEvents: [],
  scheduled: false,
  animationClock: null,
  lastReportHash: '',
}

initializeDom()
publishReport('loading')
scheduleRender()

window.addEventListener('resize', scheduleRender)
window.addEventListener('pointermove', onPointerMove)
window.addEventListener('pointerup', onPointerEnd)
window.addEventListener('pointercancel', onPointerEnd)

function initializeDom() {
  const initialLayout = layoutCards(state.order, cards, window.innerWidth)

  for (const card of cards) {
    const node = document.createElement('div')
    node.className = 'card'
    node.dataset.cardId = card.id
    node.textContent = card.label
    node.style.height = `${card.height}px`
    node.style.background = `hsl(214 72% ${card.lightnessBase}%)`
    node.style.zIndex = String(10 + state.order.indexOf(card.id))
    node.addEventListener('pointerdown', onPointerDown)

    const spring = springsById.get(card.id)
    spring.x.pos = spring.x.dest = initialLayout[card.id].x
    spring.y.pos = spring.y.dest = initialLayout[card.id].y

    nodesById.set(card.id, node)
    stage.appendChild(node)
  }
}

function onPointerDown(event) {
  if (!(event.currentTarget instanceof HTMLElement)) return
  if (event.button !== 0) return
  event.preventDefault()

  try {
    event.currentTarget.setPointerCapture(event.pointerId)
  } catch {
    // Not all browser automation paths support capture.
  }

  queueEvent({
    type: 'pointerdown',
    id: event.currentTarget.dataset.cardId ?? '',
    pointerId: event.pointerId,
    x: event.pageX,
    y: event.pageY,
    time: event.timeStamp,
  })
}

function onPointerMove(event) {
  queueEvent({
    type: 'pointermove',
    pointerId: event.pointerId,
    x: event.pageX,
    y: event.pageY,
    time: event.timeStamp,
  })
}

function onPointerEnd(event) {
  queueEvent({
    type: event.type === 'pointercancel' ? 'pointercancel' : 'pointerup',
    pointerId: event.pointerId,
    x: event.pageX,
    y: event.pageY,
    time: event.timeStamp,
  })
}

function queueEvent(event) {
  state.pendingEvents.push(event)
  if (state.pendingEvents.length > 20) {
    state.pendingEvents.splice(0, state.pendingEvents.length - 20)
  }
  scheduleRender()
}

function scheduleRender() {
  if (state.scheduled) return
  state.scheduled = true
  requestAnimationFrame(render)
}

function render(now) {
  state.scheduled = false

  let layout = layoutCards(state.order, cards, window.innerWidth)
  let animationStart = state.animationClock

  while (state.pendingEvents.length > 0) {
    const event = state.pendingEvents.shift()
    if (event == null) break

    if (event.type === 'pointerdown') {
      if (state.drag != null || event.id === '') continue
      const card = cardById.get(event.id)
      const cardLayout = layout[event.id]
      const spring = springsById.get(event.id)
      if (card == null || cardLayout == null || spring == null) continue

      state.drag = {
        id: event.id,
        pointerId: event.pointerId,
        deltaX: event.x - cardLayout.x,
        deltaY: event.y - cardLayout.y,
        samples: [{ x: event.x, y: event.y, time: event.time }],
        pointerX: event.x,
        pointerY: event.y,
      }
      state.lastDraggedId = null
      continue
    }

    if (event.type === 'pointermove') {
      if (state.drag == null || state.drag.pointerId !== event.pointerId) continue

      state.drag.pointerX = event.x
      state.drag.pointerY = event.y
      state.drag.samples.push({ x: event.x, y: event.y, time: event.time })
      if (state.drag.samples.length > 20) state.drag.samples.shift()

      const reordered = reorderDraggedCard(state.order, cards, state.drag.id, event.y, layout)
      if (reordered.changed) {
        state.order = reordered.order
        layout = reordered.layout
        animationStart ??= event.time
      }
      continue
    }

    if (event.type === 'pointerup' || event.type === 'pointercancel') {
      if (state.drag == null || state.drag.pointerId !== event.pointerId) continue

      state.drag.samples.push({ x: event.x, y: event.y, time: event.time })
      if (state.drag.samples.length > 20) state.drag.samples.shift()

      const releaseVelocity = estimateReleaseVelocity(state.drag.samples, event.time)
      const spring = springsById.get(state.drag.id)
      const targetLayout = layoutCards(state.order, cards, window.innerWidth)
      if (spring != null && targetLayout[state.drag.id] != null) {
        spring.x.dest = targetLayout[state.drag.id].x
        spring.y.dest = targetLayout[state.drag.id].y
        spring.x.v += releaseVelocity.x
        spring.y.v += releaseVelocity.y
        spring.scale.dest = 1
      }

      state.lastDraggedId = state.drag.id
      state.drag = null
      animationStart = event.time
      continue
    }
  }

  layout = layoutCards(state.order, cards, window.innerWidth)

  for (const card of cards) {
    const spring = springsById.get(card.id)
    const node = nodesById.get(card.id)
    const target = layout[card.id]
    if (spring == null || node == null || target == null) continue

    if (state.drag?.id === card.id) {
      const rawX = state.drag.pointerX - state.drag.deltaX
      const dragX = rawX + ((window.innerWidth - CARD_WIDTH) / 2 - rawX) / 1.5
      const dragY = state.drag.pointerY - state.drag.deltaY
      spring.x.pos = spring.x.dest = dragX
      spring.x.v = 0
      spring.y.pos = spring.y.dest = dragY
      spring.y.v = 0
      spring.scale.pos = spring.scale.dest = DRAGGED_SCALE
      spring.scale.v = 0
      continue
    }

    spring.x.dest = target.x
    spring.y.dest = target.y
    spring.scale.dest = 1
  }

  state.animationClock = animationStart

  const hasAnimatedClock = state.animationClock != null
  const steps = hasAnimatedClock ? Math.min(300, Math.floor((now - state.animationClock) / SPRING_STEP_MS)) : 0
  if (hasAnimatedClock) {
    state.animationClock += steps * SPRING_STEP_MS
  }

  for (let stepIndex = 0; stepIndex < steps; stepIndex++) {
    for (const card of cards) {
      if (state.drag?.id === card.id) continue
      const spring = springsById.get(card.id)
      if (spring == null) continue
      stepSpring(spring.x)
      stepSpring(spring.y)
      stepSpring(spring.scale)
    }
  }

  let stillAnimating = false
  for (const card of cards) {
    if (state.drag?.id === card.id) continue
    const spring = springsById.get(card.id)
    if (spring == null) continue
    if (!springSettled(spring.x) || !springSettled(spring.y) || !springSettled(spring.scale)) {
      stillAnimating = true
    }
  }

  if (state.lastDraggedId != null && state.drag == null) {
    const spring = springsById.get(state.lastDraggedId)
    if (spring != null && springSettled(spring.x) && springSettled(spring.y) && springSettled(spring.scale)) {
      state.lastDraggedId = null
    } else {
      stillAnimating = true
    }
  }

  if (stillAnimating && state.animationClock == null) {
    state.animationClock = now
  } else if (!stillAnimating) {
    state.animationClock = null
  }

  for (const card of cards) {
    const spring = springsById.get(card.id)
    const node = nodesById.get(card.id)
    if (spring == null || node == null) continue

    const scale = spring.scale.pos
    const offsetX = (CARD_WIDTH * (1 - scale)) / 2
    const offsetY = (card.height * (1 - scale)) / 2
    const dragging = state.drag?.id === card.id

    node.style.transform = `translate3d(${spring.x.pos + offsetX}px, ${spring.y.pos + offsetY}px, 0) scale(${scale})`
    node.style.zIndex = String(cardZIndex(card.id))
    node.style.opacity = dragging ? '0.72' : '1'
    node.style.cursor = dragging ? 'grabbing' : 'grab'
    node.style.boxShadow = dragging ? '0 20px 42px rgba(0, 0, 0, 0.24)' : '0 10px 22px rgba(0, 0, 0, 0.14)'
  }

  document.body.style.cursor = state.drag != null ? 'grabbing' : 'auto'

  publishReport(state.drag != null || stillAnimating ? 'running' : 'ready')

  if (stillAnimating || state.pendingEvents.length > 0) {
    scheduleRender()
  }
}

function cardZIndex(cardId) {
  if (state.drag?.id === cardId) return 300
  if (state.drag == null && state.lastDraggedId === cardId) return 200
  return 10 + state.order.indexOf(cardId)
}

function publishReport(phase) {
  if (!reportMode) return

  const topId = state.drag?.id ?? state.lastDraggedId ?? state.order[state.order.length - 1] ?? ''
  const report = {
    phase,
    requestId,
    scenario,
    orderedIds: state.order.slice(),
    topId,
    draggedId: state.drag?.id ?? null,
    lastDraggedId: state.lastDraggedId,
  }
  const hash = `report=${encodeURIComponent(JSON.stringify(report))}`
  if (state.lastReportHash !== hash) {
    state.lastReportHash = hash
    window.location.hash = hash
  }
}
