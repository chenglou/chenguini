import { applyReorderThresholds, estimateReleaseVelocity, hash, type PointerSample } from './shared'

const rowSizeX = 320
const topPadding = 50
const msPerAnimationStep = 4
const settleVelocityThreshold = 8
const settleDistanceThreshold = 0.5

type Spring = {
  pos: number
  dest: number
  v: number
  k: number
  b: number
}

type Card = {
  id: number
  height: number
  lightnessBase: number
  x: Spring
  y: Spring
  scale: Spring
  node: HTMLDivElement
}

type DragState = {
  cardId: number
  deltaX: number
  deltaY: number
  pointerX: number
  pointerY: number
  pointerSamples: PointerSample[]
  moveKind: 'mouse' | 'touch'
}

type State = {
  orderedCardIds: number[]
  cards: Card[]
  drag: DragState | null
  lastDraggedId: number | null
  hoveredCardId: number | null
  animatedUntilTime: number | null
  swapCount: number
  lastHandledMove: { x: number; y: number; time: number } | null
  reportError: string | null
}

const searchParams = new URLSearchParams(location.search)
const requestId = searchParams.get('requestId') ?? 'manual'

const initialWindowWidth = document.documentElement.clientWidth
const initialCenteredX = (initialWindowWidth - rowSizeX) / 2
const cards = createCards(initialCenteredX)
for (const card of cards) document.body.appendChild(card.node)

const st: State = {
  orderedCardIds: cards.map((card) => card.id),
  cards,
  drag: null,
  lastDraggedId: null,
  hoveredCardId: null,
  animatedUntilTime: null,
  swapCount: 0,
  lastHandledMove: null,
  reportError: null,
}

let scheduledRaf: number | null = null
publishReport({ phase: 'booting', cursor: 'auto' })

window.addEventListener('resize', () => scheduleRender())
window.addEventListener('pointerdown', (event) => {
  if (event.button !== 0) return
  const pointer = { x: event.pageX, y: event.pageY, time: event.timeStamp }
  beginDrag(pointer, event.pointerType === 'touch' ? 'touch' : 'mouse')
  scheduleRender()
})
window.addEventListener('pointermove', (event) => {
  updatePointer({ x: event.pageX, y: event.pageY, time: event.timeStamp }, 'pointer')
})
window.addEventListener('mousemove', (event) => {
  updatePointer({ x: event.pageX, y: event.pageY, time: event.timeStamp }, 'mouse')
})
window.addEventListener('touchmove', (event) => {
  const touch = event.touches[0]
  if (touch == null) return
  if (st.drag != null) event.preventDefault()
  updatePointer({ x: touch.pageX, y: touch.pageY, time: event.timeStamp }, 'touch')
}, { passive: false })
window.addEventListener('pointerup', (event) => {
  finishDrag({ x: event.pageX, y: event.pageY, time: event.timeStamp }, 'pointer')
})
window.addEventListener('pointercancel', (event) => {
  finishDrag({ x: event.pageX, y: event.pageY, time: event.timeStamp }, 'pointer')
})
window.addEventListener('mouseup', (event) => {
  finishDrag({ x: event.pageX, y: event.pageY, time: event.timeStamp }, 'mouse')
})
window.addEventListener('touchend', (event) => {
  const touch = event.changedTouches[0]
  if (touch == null) return
  finishDrag({ x: touch.pageX, y: touch.pageY, time: event.timeStamp }, 'touch')
})
window.addEventListener('touchcancel', (event) => {
  const touch = event.changedTouches[0]
  if (touch == null) return
  finishDrag({ x: touch.pageX, y: touch.pageY, time: event.timeStamp }, 'touch')
})
window.addEventListener('error', (event) => {
  st.reportError = event.message || 'Unknown runtime error'
  publishError(st.reportError)
})

scheduleRender()

function createCards(centeredX: number) {
  const createdCards: Card[] = []
  let currentTop = topPadding
  for (let cardId = 0; cardId < 5; cardId++) {
    const height = 30 + hash(cardId * 2) * 150
    const lightnessBase = hash(cardId * 2 + 1) * 40 + 40
    const node = document.createElement('div')
    node.className = 'card'
    node.textContent = `Drag Me ${cardId}`
    createdCards.push({
      id: cardId,
      height,
      lightnessBase,
      x: spring(centeredX, centeredX, 0, 290, 24),
      y: spring(currentTop, currentTop, 0, 290, 24),
      scale: spring(1, 1, 0, 290, 24),
      node,
    })
    currentTop += height
  }
  return createdCards
}

function scheduleRender() {
  if (scheduledRaf != null) return
  scheduledRaf = requestAnimationFrame(function renderAndMaybeScheduleAnotherFrame(now) {
    scheduledRaf = null
    if (render(now)) scheduleRender()
  })
}

function render(now: number) {
  const windowWidth = document.documentElement.clientWidth
  const centeredX = (windowWidth - rowSizeX) / 2
  const slotTops = getSlotTops(st.orderedCardIds)

  for (const card of st.cards) {
    card.x.dest = centeredX
    card.scale.dest = 1
    const orderIndex = st.orderedCardIds.indexOf(card.id)
    card.y.dest = slotTops[orderIndex]!
  }

  if (st.drag != null) {
    const draggedCard = st.cards[st.drag.cardId]!
    const rawX = st.drag.pointerX - st.drag.deltaX
    const rawY = st.drag.pointerY - st.drag.deltaY
    const pulledX = rawX + (centeredX - rawX) / 1.5
    draggedCard.x.pos = draggedCard.x.dest = pulledX
    draggedCard.y.pos = draggedCard.y.dest = rawY
    draggedCard.scale.pos = draggedCard.scale.dest = 1.1
  }

  let animatedUntilTime = st.animatedUntilTime ?? now
  const steps = Math.min(300, Math.max(0, Math.floor((now - animatedUntilTime) / msPerAnimationStep)))
  animatedUntilTime += steps * msPerAnimationStep
  for (let step = 0; step < steps; step++) {
    for (const card of st.cards) {
      if (st.drag?.cardId === card.id) continue
      springStep(card.x)
      springStep(card.y)
      springStep(card.scale)
    }
  }

  let stillAnimating = st.drag != null
  for (const card of st.cards) {
    if (st.drag?.cardId === card.id) continue
    if (!springMostlyDone(card.x) || !springMostlyDone(card.y) || !springMostlyDone(card.scale)) {
      stillAnimating = true
      continue
    }
    snapSpring(card.x)
    snapSpring(card.y)
    snapSpring(card.scale)
  }

  if (st.lastDraggedId != null) {
    const lastDraggedCard = st.cards[st.lastDraggedId]!
    const settled = springMostlyDone(lastDraggedCard.x) &&
      springMostlyDone(lastDraggedCard.y) &&
      springMostlyDone(lastDraggedCard.scale)
    if (settled && st.drag == null) {
      st.lastDraggedId = null
    }
  }

  st.animatedUntilTime = stillAnimating ? animatedUntilTime : null

  const cursor = getCursor()
  document.body.style.cursor = cursor

  const depthOrder = getDepthOrder()
  for (let index = 0; index < depthOrder.length; index++) {
    const cardId = depthOrder[index]!
    const card = st.cards[cardId]!
    const isDragged = st.drag?.cardId === cardId
    card.node.style.width = `${rowSizeX}px`
    card.node.style.height = `${card.height}px`
    card.node.style.transform = `translate(${card.x.pos}px, ${card.y.pos}px) scale(${card.scale.pos})`
    card.node.style.opacity = isDragged ? '0.7' : '1'
    card.node.style.zIndex = String(depthOrder.length - index)
    card.node.style.boxShadow = isDragged
      ? '0 30px 70px rgba(15, 31, 56, 0.35)'
      : '0 12px 24px rgba(15, 31, 56, 0.18)'
    card.node.style.background = `linear-gradient(180deg, hsl(208 72% ${Math.min(86, card.lightnessBase + 9)}%), hsl(214 74% ${card.lightnessBase}%))`
    card.node.style.border = `1px solid hsl(215 70% ${Math.max(28, card.lightnessBase - 18)}%)`
  }

  publishReport({
    phase: st.drag != null ? 'dragging' : st.lastDraggedId != null ? 'settling' : 'idle',
    cursor,
  })

  return stillAnimating
}

function beginDrag(pointer: PointerSample, moveKind: 'mouse' | 'touch') {
  if (st.drag != null) return
  const hitCardId = hitTest(pointer.x, pointer.y)
  if (hitCardId == null) {
    st.hoveredCardId = null
    return
  }

  const hitCard = st.cards[hitCardId]!
  st.drag = {
    cardId: hitCardId,
    deltaX: pointer.x - hitCard.x.pos,
    deltaY: pointer.y - hitCard.y.pos,
    pointerX: pointer.x,
    pointerY: pointer.y,
    pointerSamples: [pointer],
    moveKind,
  }
  st.lastDraggedId = null
  st.swapCount = 0
  st.hoveredCardId = hitCardId
  st.lastHandledMove = { x: pointer.x, y: pointer.y, time: pointer.time }
}

function updatePointer(pointer: PointerSample, source: 'pointer' | 'mouse' | 'touch') {
  if (st.lastHandledMove != null &&
    st.lastHandledMove.x === pointer.x &&
    st.lastHandledMove.y === pointer.y &&
    st.lastHandledMove.time === pointer.time) {
    return
  }
  st.lastHandledMove = { x: pointer.x, y: pointer.y, time: pointer.time }

  if (st.drag == null) {
    st.hoveredCardId = hitTest(pointer.x, pointer.y)
    scheduleRender()
    return
  }

  if (
    (source === 'mouse' && st.drag.moveKind === 'touch') ||
    (source === 'touch' && st.drag.moveKind === 'mouse')
  ) {
    return
  }

  st.drag.pointerX = pointer.x
  st.drag.pointerY = pointer.y
  st.drag.pointerSamples.push(pointer)
  if (st.drag.pointerSamples.length > 20) st.drag.pointerSamples.shift()

  const reordered = applyReorderThresholds({
    orderedCardIds: st.orderedCardIds,
    draggedCardId: st.drag.cardId,
    pointerY: pointer.y,
    topPadding,
    getCardHeight(cardId) {
      return st.cards[cardId]!.height
    },
  })
  if (reordered.swapCount > 0) {
    st.orderedCardIds = reordered.orderedCardIds
    st.swapCount += reordered.swapCount
  }

  scheduleRender()
}

function finishDrag(pointer: PointerSample, source: 'pointer' | 'mouse' | 'touch') {
  if (st.drag == null) return
  if (
    source !== 'pointer' &&
    ((source === 'mouse' && st.drag.moveKind === 'touch') ||
      (source === 'touch' && st.drag.moveKind === 'mouse'))
  ) {
    return
  }

  st.drag.pointerX = pointer.x
  st.drag.pointerY = pointer.y
  st.drag.pointerSamples.push(pointer)
  if (st.drag.pointerSamples.length > 20) st.drag.pointerSamples.shift()

  const releasedCardId = st.drag.cardId
  const velocity = estimateReleaseVelocity({
    now: pointer.time,
    samples: st.drag.pointerSamples,
  })
  const releasedCard = st.cards[releasedCardId]!
  releasedCard.x.v += velocity.x
  releasedCard.y.v += velocity.y

  st.lastDraggedId = releasedCardId
  st.drag = null
  st.hoveredCardId = hitTest(pointer.x, pointer.y)
  st.lastHandledMove = { x: pointer.x, y: pointer.y, time: pointer.time }
  scheduleRender()
}

function getCursor() {
  if (st.drag != null) return 'grabbing'
  if (st.hoveredCardId != null) return 'grab'
  return 'auto'
}

function getSlotTops(orderedCardIds: number[]) {
  const tops: number[] = []
  let y = topPadding
  for (const cardId of orderedCardIds) {
    tops.push(y)
    y += st.cards[cardId]!.height
  }
  return tops
}

function getDepthOrder() {
  if (st.drag != null) {
    const remaining = st.orderedCardIds.filter((cardId) => cardId !== st.drag?.cardId)
    return [st.drag.cardId, ...remaining]
  }
  if (st.lastDraggedId != null) {
    const remaining = st.orderedCardIds.filter((cardId) => cardId !== st.lastDraggedId)
    return [st.lastDraggedId, ...remaining]
  }
  return st.orderedCardIds.slice()
}

function hitTest(pointerX: number, pointerY: number) {
  const depthOrder = getDepthOrder()
  for (const cardId of depthOrder) {
    const card = st.cards[cardId]!
    const left = card.x.pos
    const top = card.y.pos
    if (
      pointerX >= left &&
      pointerX <= left + rowSizeX &&
      pointerY >= top &&
      pointerY <= top + card.height
    ) {
      return cardId
    }
  }
  return null
}

function publishReport(args: {
  phase: 'booting' | 'idle' | 'dragging' | 'settling'
  cursor: string
}) {
  const report = {
    status: 'ready' as const,
    requestId,
    phase: args.phase,
    orderedCardIds: st.orderedCardIds.slice(),
    cardPositions: st.cards.map((card) => ({
      id: card.id,
      x: round(card.x.pos),
      y: round(card.y.pos),
      width: rowSizeX,
      height: round(card.height),
    })),
    draggedId: st.drag?.cardId ?? null,
    lastDraggedId: st.lastDraggedId,
    cursor: args.cursor,
    zOrder: getDepthOrder(),
    swapCount: st.swapCount,
  }
  const encoded = encodeURIComponent(JSON.stringify(report))
  history.replaceState(null, '', `${location.pathname}${location.search}#report=${encoded}`)
}

function publishError(message: string) {
  const report = {
    status: 'error' as const,
    requestId,
    phase: 'error' as const,
    message,
    orderedCardIds: st.orderedCardIds.slice(),
    cardPositions: [],
    draggedId: st.drag?.cardId ?? null,
    lastDraggedId: st.lastDraggedId,
    cursor: getCursor(),
    zOrder: getDepthOrder(),
    swapCount: st.swapCount,
  }
  const encoded = encodeURIComponent(JSON.stringify(report))
  history.replaceState(null, '', `${location.pathname}${location.search}#report=${encoded}`)
}

function spring(position: number, destination: number, velocity: number, stiffness: number, damping: number): Spring {
  return { pos: position, dest: destination, v: velocity, k: stiffness, b: damping }
}

function springStep(config: Spring) {
  const t = msPerAnimationStep / 1000
  const forceSpring = -config.k * (config.pos - config.dest)
  const forceDamper = -config.b * config.v
  const acceleration = forceSpring + forceDamper
  config.v += acceleration * t
  config.pos += config.v * t
}

function springMostlyDone(config: Spring) {
  return Math.abs(config.v) < settleVelocityThreshold &&
    Math.abs(config.dest - config.pos) < settleDistanceThreshold
}

function snapSpring(config: Spring) {
  config.pos = config.dest
  config.v = 0
}

function round(value: number) {
  return Math.round(value * 100) / 100
}
