import {
  CARD_WIDTH,
  MS_PER_ANIMATION_STEP,
  TOP_PADDING,
  X_DAMPING,
  X_STIFFNESS,
  Y_DAMPING,
  Y_STIFFNESS,
  centeredX,
  createCardMap,
  createCards,
  estimateReleaseVelocity,
  getSlotPositionMap,
  getTopmostId,
  isSettled,
  reorderByCenterY,
  stepSpring,
} from './logic.js'

const params = new URLSearchParams(location.search)
const scenario = params.get('scenario') ?? ''
const requestId = params.get('requestId') ?? ''

const cards = createCards()
const cardsById = createCardMap(cards)
const stack = document.querySelector('#stack')

if (!stack) {
  throw new Error('missing stack container')
}

const state = {
  order: cards.map(card => card.id),
  activeId: null,
  lastDraggedId: null,
  settlingId: null,
  settlingPosition: null,
  settlingVelocity: { x: 0, y: 0 },
  dragPosition: null,
  pointerId: null,
  grabOffsetX: 0,
  grabOffsetY: 0,
  pointerSamples: [],
}

const cardElements = new Map()
let rafHandle = 0

function currentStatus() {
  if (state.activeId !== null) return 'dragging'
  if (state.settlingId !== null) return 'settling'
  return 'idle'
}

function publishReport(phase, message) {
  const report = {
    phase,
    requestId,
    scenario,
    status: currentStatus(),
    order: state.order.slice(),
    activeId: state.activeId,
    lastDraggedId: state.lastDraggedId,
    topmostId: getTopmostId(state.order, state.activeId, state.settlingId),
    message,
  }

  location.hash = `report=${encodeURIComponent(JSON.stringify(report))}`
}

function render() {
  const slotPositions = getSlotPositionMap(state.order, cardsById, window.innerWidth, TOP_PADDING)
  const activeId = state.activeId
  const settlingId = state.settlingId
  const bodyCursor = activeId !== null ? 'grabbing' : 'auto'

  document.body.style.cursor = bodyCursor

  for (let index = 0; index < cards.length; index += 1) {
    const card = cards[index]
    const element = cardElements.get(card.id)
    if (!element) continue

    const slot = slotPositions.get(card.id)
    if (!slot) continue

    let x = slot.x
    let y = slot.y
    let scale = 1
    let opacity = 1
    let cursor = 'grab'
    let shadow = '0 10px 26px rgba(0, 0, 0, 0.18)'
    let zIndex = String(state.order.indexOf(card.id))
    let stateName = 'idle'

    if (activeId === card.id) {
      x = state.dragPosition.x
      y = state.dragPosition.y
      scale = 1.1
      opacity = 0.7
      cursor = 'grabbing'
      shadow = '0 24px 50px rgba(0, 0, 0, 0.34)'
      zIndex = '200'
      stateName = 'dragging'
    } else if (settlingId === card.id) {
      x = state.settlingPosition.x
      y = state.settlingPosition.y
      cursor = 'grabbing'
      shadow = '0 24px 50px rgba(0, 0, 0, 0.34)'
      zIndex = '190'
      stateName = 'settling'
    }

    element.dataset.state = stateName
    element.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${scale})`
    element.style.opacity = String(opacity)
    element.style.cursor = cursor
    element.style.zIndex = zIndex
    element.style.boxShadow = shadow
  }

  publishReport('ready')
}

function scheduleSettling() {
  if (rafHandle !== 0 || state.settlingId === null) return
  rafHandle = requestAnimationFrame(tick)
}

function tick() {
  rafHandle = 0
  if (state.settlingId === null || state.settlingPosition === null) return

  const targetPositions = getSlotPositionMap(state.order, cardsById, window.innerWidth, TOP_PADDING)
  const target = targetPositions.get(state.settlingId)
  if (!target) return

  const dt = MS_PER_ANIMATION_STEP / 1000
  const [nextX, nextVX] = stepSpring(
    state.settlingPosition.x,
    state.settlingVelocity.x,
    target.x,
    X_STIFFNESS,
    X_DAMPING,
    dt,
  )
  const [nextY, nextVY] = stepSpring(
    state.settlingPosition.y,
    state.settlingVelocity.y,
    target.y,
    Y_STIFFNESS,
    Y_DAMPING,
    dt,
  )

  state.settlingPosition = { x: nextX, y: nextY }
  state.settlingVelocity = { x: nextVX, y: nextVY }

  if (isSettled(nextX, nextVX, target.x) && isSettled(nextY, nextVY, target.y)) {
    state.settlingPosition = { x: target.x, y: target.y }
    state.settlingVelocity = { x: 0, y: 0 }
    state.lastDraggedId = null
    state.settlingId = null
    render()
    return
  }

  render()
  scheduleSettling()
}

function updateDragPosition(clientX, clientY) {
  const activeId = state.activeId
  if (activeId === null) return

  const centered = centeredX(window.innerWidth)
  const rawX = clientX - state.grabOffsetX
  const rawY = clientY - state.grabOffsetY
  state.dragPosition = {
    x: rawX + (centered - rawX) / 1.5,
    y: rawY,
  }

  const activeCenterY = rawY + cardsById.get(activeId).sizeY / 2
  const nextOrder = reorderByCenterY(state.order, activeId, activeCenterY, cardsById, TOP_PADDING)
  if (!areOrdersEqual(nextOrder, state.order)) {
    state.order = nextOrder
  }
}

function areOrdersEqual(a, b) {
  if (a.length !== b.length) return false
  for (let index = 0; index < a.length; index += 1) {
    if (a[index] !== b[index]) return false
  }
  return true
}

function beginDrag(cardId, event) {
  if (state.activeId !== null || state.settlingId !== null) return

  const element = cardElements.get(cardId)
  if (!element) return

  const box = element.getBoundingClientRect()
  state.activeId = cardId
  state.pointerId = event.pointerId
  state.grabOffsetX = event.clientX - box.left
  state.grabOffsetY = event.clientY - box.top
  state.dragPosition = { x: box.left, y: box.top }
  state.pointerSamples = [{ time: performance.now(), x: event.clientX, y: event.clientY }]

  element.setPointerCapture(event.pointerId)
  render()
}

function moveDrag(event) {
  if (state.activeId === null || event.pointerId !== state.pointerId) return

  const now = performance.now()
  state.pointerSamples.push({ time: now, x: event.clientX, y: event.clientY })
  state.pointerSamples = state.pointerSamples.filter(sample => now - sample.time <= 110)
  updateDragPosition(event.clientX, event.clientY)
  render()
}

function endDrag(event) {
  if (state.activeId === null || event.pointerId !== state.pointerId) return

  const activeId = state.activeId
  const activeElement = cardElements.get(activeId)
  const releaseVelocity = estimateReleaseVelocity(state.pointerSamples, performance.now())

  state.activeId = null
  state.pointerId = null
  state.lastDraggedId = activeId
  state.settlingId = activeId
  state.settlingPosition = state.dragPosition
  state.settlingVelocity = releaseVelocity
  state.pointerSamples = []

  if (activeElement?.hasPointerCapture(event.pointerId)) {
    activeElement.releasePointerCapture(event.pointerId)
  }

  render()
  scheduleSettling()
}

for (const card of cards) {
  const element = document.createElement('article')
  element.className = 'card'
  element.dataset.cardId = String(card.id)
  element.style.height = `${card.sizeY}px`
  element.style.background = `linear-gradient(180deg, hsl(${200 + card.id * 18} 44% ${card.lightnessBase + 6}%), hsl(${200 + card.id * 18} 44% ${card.lightnessBase - 4}%))`

  const inner = document.createElement('div')
  inner.className = 'card__inner'
  inner.innerHTML = `
    <div class="card__label">
      <span>Card ${card.id}</span>
      <span>${Math.round(card.sizeY)}px tall</span>
    </div>
    <div class="card__body">Trace tape ${card.id}</div>
    <div class="card__meta">Lightness base ${card.lightnessBase.toFixed(1)}</div>
  `

  element.append(inner)
  element.addEventListener('pointerdown', event => {
    event.preventDefault()
    beginDrag(card.id, event)
  })

  stack.append(element)
  cardElements.set(card.id, element)
}

window.addEventListener('pointermove', moveDrag)
window.addEventListener('pointerup', endDrag)
window.addEventListener('pointercancel', endDrag)
window.addEventListener('resize', () => {
  render()
  if (state.settlingId !== null) {
    scheduleSettling()
  }
})

publishReport('loading')
render()

window.addEventListener('error', event => {
  publishReport('error', event.error?.message ?? 'unknown error')
})

window.addEventListener('unhandledrejection', event => {
  publishReport('error', event.reason?.message ?? String(event.reason))
})
