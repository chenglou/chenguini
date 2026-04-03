import { estimateReleaseVelocity, hash, reorderWhileDragging, type PointerSample, type StackCard } from './model'
import type { ScenarioName, ScenarioReport } from './shared'

const rowSizeX = 320
const topPadding = 50
const msPerAnimationStep = 4
const xyStiffness = 290
const xyDamping = 24
const scaleStiffness = 320
const scaleDamping = 26
const maxAnimationStepsPerFrame = 300

type Spring = {
  pos: number
  dest: number
  v: number
  k: number
  b: number
}

type CardState = {
  id: number
  label: string
  height: number
  lightnessBase: number
  element: HTMLDivElement
  x: Spring
  y: Spring
  scale: Spring
}

type DragState = {
  draggedId: number
  deltaX: number
  deltaY: number
  pointerType: string
  pointerId: number | null
  samples: PointerSample[]
}

const root = document.querySelector<HTMLDivElement>('#app')

if (root == null) {
  throw new Error('Missing app root')
}

const initialColumnX = getCenteredX(window.innerWidth)
const cards = Array.from({ length: 5 }, (_, id) => createCardState(id, initialColumnX))
const cardsById = new Map(cards.map(card => [card.id, card]))
let order = cards.map(card => card.id)
let dragState: DragState | null = null
let lastDraggedId: number | null = null
let hoveredId: number | null = null
let lastFrameTime = performance.now()
let animationFrameScheduled = false

for (const card of cards) {
  root.append(card.element)
}

applyStackTargets()
renderCards()
scheduleFrame()
installInput()
installAutomation()

window.addEventListener('resize', () => {
  applyStackTargets()
  renderCards()
  scheduleFrame()
})

function createCardState(id: number, centeredX: number): CardState {
  const height = 30 + hash(id * 2) * 150
  const lightnessBase = hash(id * 2 + 1) * 40 + 40
  const y = getTargetYForOrder(orderAtStart(), id)
  const element = document.createElement('div')

  element.className = 'card'
  element.textContent = `Drag Me ${id}`
  element.style.height = `${height}px`
  element.style.background = `linear-gradient(180deg, hsl(212 84% ${lightnessBase + 8}%), hsl(214 78% ${lightnessBase - 8}%))`
  element.style.border = `1px solid hsl(214 72% ${Math.max(18, lightnessBase - 16)}%)`
  element.style.boxShadow = shadowForCard(false, false)

  return {
    id,
    label: `Drag Me ${id}`,
    height,
    lightnessBase,
    element,
    x: spring(centeredX, centeredX, 0, xyStiffness, xyDamping),
    y: spring(y, y, 0, xyStiffness, xyDamping),
    scale: spring(1, 1, 0, scaleStiffness, scaleDamping),
  }
}

function orderAtStart() {
  return [0, 1, 2, 3, 4]
}

function installInput() {
  window.addEventListener('pointerdown', event => {
    if (event.button !== 0) return
    const point = pointFromPointerEvent(event)
    const hit = hitTest(point.x, point.y)
    if (hit == null) return
    event.preventDefault()
    startDrag(hit.id, point.x, point.y, event.timeStamp, event.pointerType, event.pointerId)
  })

  window.addEventListener('pointermove', event => {
    const point = pointFromPointerEvent(event)
    if (dragState != null && event.pointerId === dragState.pointerId) {
      event.preventDefault()
      updateDrag(point.x, point.y, event.timeStamp)
      return
    }
    hoveredId = hitTest(point.x, point.y)?.id ?? null
    renderCards()
  })

  window.addEventListener('pointerup', event => {
    if (dragState == null || dragState.pointerId !== event.pointerId) return
    finishDrag(event.timeStamp)
  })

  window.addEventListener('pointercancel', event => {
    if (dragState == null || dragState.pointerId !== event.pointerId) return
    finishDrag(event.timeStamp)
  })

  window.addEventListener('mousemove', event => {
    if (dragState?.pointerType !== 'mouse') {
      hoveredId = hitTest(event.pageX, event.pageY)?.id ?? null
      renderCards()
      return
    }
    updateDrag(event.pageX, event.pageY, event.timeStamp)
  })

  window.addEventListener('mouseup', event => {
    if (dragState?.pointerType !== 'mouse') return
    finishDrag(event.timeStamp)
  })

  window.addEventListener(
    'touchmove',
    event => {
      if (dragState?.pointerType !== 'touch') return
      const touch = event.touches[0] ?? event.changedTouches[0]
      if (touch == null) return
      event.preventDefault()
      updateDrag(touch.pageX, touch.pageY, event.timeStamp)
    },
    { passive: false },
  )

  window.addEventListener('touchend', event => {
    if (dragState?.pointerType !== 'touch') return
    event.preventDefault()
    finishDrag(event.timeStamp)
  })

  window.addEventListener('touchcancel', event => {
    if (dragState?.pointerType !== 'touch') return
    event.preventDefault()
    finishDrag(event.timeStamp)
  })
}

function pointFromPointerEvent(event: PointerEvent) {
  return { x: event.pageX, y: event.pageY }
}

function hitTest(pageX: number, pageY: number) {
  const hitOrder = [...cards].sort((left, right) => getCardZIndex(right) - getCardZIndex(left))
  for (const card of hitOrder) {
    const left = card.x.pos
    const top = card.y.pos
    if (pageX >= left && pageX <= left + rowSizeX && pageY >= top && pageY <= top + card.height) {
      return { id: card.id }
    }
  }
  return null
}

function startDrag(id: number, pageX: number, pageY: number, time: number, pointerType: string, pointerId: number | null) {
  const card = mustCard(id)
  dragState = {
    draggedId: id,
    deltaX: pageX - card.x.pos,
    deltaY: pageY - card.y.pos,
    pointerType,
    pointerId,
    samples: [{ x: pageX, y: pageY, time }],
  }
  lastDraggedId = null
  hoveredId = id
  applyDraggedPosition(pageX, pageY)
  card.scale.dest = 1.1
  scheduleFrame()
  renderCards()
}

function updateDrag(pageX: number, pageY: number, time: number) {
  if (dragState == null) return
  pushSample(dragState.samples, { x: pageX, y: pageY, time })
  applyDraggedPosition(pageX, pageY)

  const stackCards = getStackCards()
  const nextOrder = reorderWhileDragging(order, stackCards, dragState.draggedId, pageY)
  if (!sameOrder(order, nextOrder)) {
    order = nextOrder
  }

  applyStackTargets()
  renderCards()
}

function finishDrag(time: number) {
  if (dragState == null) return

  const releasedId = dragState.draggedId
  const releasedCard = mustCard(releasedId)
  const velocity = estimateReleaseVelocity(dragState.samples, time)

  dragState = null
  lastDraggedId = releasedId
  releasedCard.x.v += velocity.x
  releasedCard.y.v += velocity.y
  releasedCard.scale.dest = 1
  applyStackTargets()
  hoveredId = null
  scheduleFrame()
  renderCards()
}

function pushSample(samples: PointerSample[], sample: PointerSample) {
  samples.push(sample)
  if (samples.length > 20) {
    samples.splice(0, samples.length - 20)
  }
}

function applyDraggedPosition(pageX: number, pageY: number) {
  if (dragState == null) return
  const draggedCard = mustCard(dragState.draggedId)
  const rawX = pageX - dragState.deltaX
  const centeredX = getCenteredX(window.innerWidth)
  const draggedX = rawX + (centeredX - rawX) / 1.5
  const draggedY = pageY - dragState.deltaY

  draggedCard.x.pos = draggedX
  draggedCard.x.dest = draggedX
  draggedCard.y.pos = draggedY
  draggedCard.y.dest = draggedY
  draggedCard.scale.dest = 1.1
}

function applyStackTargets() {
  const centeredX = getCenteredX(window.innerWidth)
  let currentTop = topPadding

  for (const id of order) {
    const card = mustCard(id)
    if (dragState?.draggedId !== id) {
      card.x.dest = centeredX
      card.y.dest = currentTop
    }
    if (dragState?.draggedId !== id) {
      card.scale.dest = 1
    }
    currentTop += card.height
  }
}

function scheduleFrame() {
  if (animationFrameScheduled) return
  animationFrameScheduled = true
  requestAnimationFrame(frame)
}

function frame(now: number) {
  animationFrameScheduled = false

  const elapsed = now - lastFrameTime
  const steps = Math.min(maxAnimationStepsPerFrame, Math.max(1, Math.floor(elapsed / msPerAnimationStep)))
  lastFrameTime += steps * msPerAnimationStep

  let animationStillRunning = dragState != null
  for (let i = 0; i < steps; i += 1) {
    for (const card of cards) {
      if (dragState?.draggedId === card.id) continue
      animationStillRunning = springStep(card.x) || animationStillRunning
      animationStillRunning = springStep(card.y) || animationStillRunning
      animationStillRunning = springStep(card.scale) || animationStillRunning
    }
    if (dragState != null) {
      const draggedCard = mustCard(dragState.draggedId)
      animationStillRunning = springStep(draggedCard.scale) || animationStillRunning
    }
  }

  if (lastDraggedId != null) {
    const card = mustCard(lastDraggedId)
    if (springsSettled(card)) {
      lastDraggedId = null
    } else {
      animationStillRunning = true
    }
  }

  renderCards()

  if (animationStillRunning) {
    scheduleFrame()
  } else {
    lastFrameTime = now
  }
}

function spring(position: number, destination: number, velocity: number, stiffness: number, damping: number): Spring {
  return { pos: position, dest: destination, v: velocity, k: stiffness, b: damping }
}

function springStep(springState: Spring) {
  const t = msPerAnimationStep / 1000
  const springForce = -springState.k * (springState.pos - springState.dest)
  const damperForce = -springState.b * springState.v
  const acceleration = springForce + damperForce
  springState.v += acceleration * t
  springState.pos += springState.v * t

  if (Math.abs(springState.v) < 0.01 && Math.abs(springState.dest - springState.pos) < 0.01) {
    springState.pos = springState.dest
    springState.v = 0
    return false
  }
  return true
}

function springsSettled(card: CardState) {
  return card.x.pos === card.x.dest && card.y.pos === card.y.dest && card.scale.pos === card.scale.dest && card.x.v === 0 && card.y.v === 0 && card.scale.v === 0
}

function renderCards() {
  const bodyCursor = dragState != null ? 'grabbing' : hoveredId != null ? 'grab' : 'auto'
  document.body.style.cursor = bodyCursor

  for (const card of cards) {
    const isDragged = dragState?.draggedId === card.id
    const isLastDragged = lastDraggedId === card.id
    const opacity = isDragged ? 0.7 : 1

    card.element.style.transform = `translate3d(${card.x.pos}px, ${card.y.pos}px, 0) scale(${card.scale.pos})`
    card.element.style.opacity = `${opacity}`
    card.element.style.zIndex = `${getCardZIndex(card)}`
    card.element.style.cursor = isDragged ? 'grabbing' : hoveredId === card.id ? 'grab' : 'auto'
    card.element.style.boxShadow = shadowForCard(isDragged, isLastDragged)
    card.element.style.background = `linear-gradient(180deg, hsl(212 84% ${card.lightnessBase + (isDragged ? 12 : 8)}%), hsl(214 78% ${card.lightnessBase - (isDragged ? 4 : 8)}%))`
  }
}

function getCardZIndex(card: CardState) {
  if (dragState?.draggedId === card.id) return 200
  if (lastDraggedId === card.id) return 100
  const stackIndex = order.indexOf(card.id)
  return stackIndex + 1
}

function shadowForCard(isDragged: boolean, isLastDragged: boolean) {
  if (isDragged) return '0 30px 70px rgba(28, 56, 110, 0.42)'
  if (isLastDragged) return '0 24px 50px rgba(28, 56, 110, 0.28)'
  return '0 10px 25px rgba(33, 58, 105, 0.16)'
}

function getStackCards(): StackCard[] {
  let top = topPadding
  return order.map(id => {
    const card = mustCard(id)
    const stackCard = { id, top, height: card.height }
    top += card.height
    return stackCard
  })
}

function getTargetYForOrder(orderIds: number[], targetId: number) {
  let top = topPadding
  for (const id of orderIds) {
    if (id === targetId) return top
    top += mustHeight(id)
  }
  return top
}

function mustHeight(id: number) {
  return 30 + hash(id * 2) * 150
}

function getCenteredX(width: number) {
  return (width - rowSizeX) / 2
}

function mustCard(id: number) {
  const card = cardsById.get(id)
  if (card == null) throw new Error(`Missing card ${id}`)
  return card
}

function sameOrder(left: number[], right: number[]) {
  if (left.length !== right.length) return false
  return left.every((id, index) => right[index] === id)
}

function installAutomation() {
  const url = new URL(window.location.href)
  const reportEnabled = url.searchParams.get('report') === '1'
  const scenario = url.searchParams.get('scenario') as ScenarioName | null
  const requestId = url.searchParams.get('requestId')

  if (!reportEnabled || scenario == null || requestId == null) return

  publishReport({
    phase: 'loading',
    requestId,
    scenario,
    orderedIds: [...order],
    draggedId: null,
    lastDraggedId,
    swapHappened: false,
    topVisualCardId: topVisualCardId(),
    releasedCardStillElevated: false,
    releasedCardIsSettling: false,
  })

  requestAnimationFrame(() => {
    void runScenario(requestId, scenario).catch(error => {
      publishReport({
        phase: 'error',
        requestId,
        scenario,
        orderedIds: [...order],
        draggedId: dragState?.draggedId ?? null,
        lastDraggedId,
        swapHappened: false,
        topVisualCardId: topVisualCardId(),
        releasedCardStillElevated: false,
        releasedCardIsSettling: false,
        error: error instanceof Error ? error.message : String(error),
      })
    })
  })
}

async function runScenario(requestId: string, scenario: ScenarioName) {
  publishReport({
    phase: 'running',
    requestId,
    scenario,
    orderedIds: [...order],
    draggedId: dragState?.draggedId ?? null,
    lastDraggedId,
    swapHappened: false,
    topVisualCardId: topVisualCardId(),
    releasedCardStillElevated: false,
    releasedCardIsSettling: false,
  })

  if (scenario === 'swap-down') {
    const snapshot = await runSwapDownScenario()
    publishReport(snapshot)
    return
  }

  if (scenario === 'release-depth') {
    const snapshot = await runReleaseDepthScenario()
    publishReport(snapshot)
    return
  }

  throw new Error(`Unknown scenario ${scenario satisfies never}`)
}

async function runSwapDownScenario(): Promise<ScenarioReport> {
  const request = currentRequest()
  const pointerX = getCenteredX(window.innerWidth) + rowSizeX / 2
  const startY = cardCenterY(1)
  const crossedY = cardMidpoint(2) + 40

  scriptedStartDrag(1, pointerX, startY, 0)
  await nextFrame()
  scriptedMove(pointerX, crossedY, 48)
  await nextFrame()

  return {
    phase: 'ready',
    requestId: request.requestId,
    scenario: request.scenario,
    orderedIds: [...order],
    draggedId: dragState?.draggedId ?? null,
    lastDraggedId,
    swapHappened: sameOrder(order, [0, 2, 1, 3, 4]),
    topVisualCardId: topVisualCardId(),
    releasedCardStillElevated: false,
    releasedCardIsSettling: false,
  }
}

async function runReleaseDepthScenario(): Promise<ScenarioReport> {
  const request = currentRequest()
  const pointerX = getCenteredX(window.innerWidth) + rowSizeX / 2
  const startY = cardCenterY(1)
  const crossedY = cardMidpoint(2) + 55

  scriptedStartDrag(1, pointerX, startY, 0)
  await nextFrame()
  scriptedMove(pointerX, crossedY - 20, 32)
  await nextFrame()
  scriptedMove(pointerX, crossedY, 64)
  await nextFrame()
  scriptedRelease(96)

  await waitFor(() => {
    const card = mustCard(1)
    return dragState == null && lastDraggedId === 1 && (card.y.pos !== card.y.dest || card.y.v !== 0)
  })

  return {
    phase: 'ready',
    requestId: request.requestId,
    scenario: request.scenario,
    orderedIds: [...order],
    draggedId: dragState?.draggedId ?? null,
    lastDraggedId,
    swapHappened: sameOrder(order, [0, 2, 1, 3, 4]),
    topVisualCardId: topVisualCardId(),
    releasedCardStillElevated: topVisualCardId() === 1 && lastDraggedId === 1,
    releasedCardIsSettling: releasedCardIsSettling(1),
  }
}

function scriptedStartDrag(id: number, pageX: number, pageY: number, time: number) {
  startDrag(id, pageX, pageY, time, 'mouse', 1)
}

function scriptedMove(pageX: number, pageY: number, time: number) {
  updateDrag(pageX, pageY, time)
}

function scriptedRelease(time: number) {
  finishDrag(time)
}

function currentRequest() {
  const url = new URL(window.location.href)
  const scenario = url.searchParams.get('scenario') as ScenarioName | null
  const requestId = url.searchParams.get('requestId')
  if (scenario == null || requestId == null) {
    throw new Error('Missing scenario request')
  }
  return { scenario, requestId }
}

function publishReport(report: ScenarioReport) {
  window.location.hash = `report=${encodeURIComponent(JSON.stringify(report))}`
}

function topVisualCardId() {
  let topCard: CardState | null = null
  for (const card of cards) {
    if (topCard == null || getCardZIndex(card) > getCardZIndex(topCard)) {
      topCard = card
    }
  }
  return topCard?.id ?? null
}

function releasedCardIsSettling(id: number) {
  const card = mustCard(id)
  return card.x.pos !== card.x.dest || card.y.pos !== card.y.dest || card.x.v !== 0 || card.y.v !== 0
}

function cardCenterY(id: number) {
  const slot = getStackCards().find(card => card.id === id)
  if (slot == null) throw new Error(`Missing stack slot ${id}`)
  return slot.top + slot.height / 2
}

function cardMidpoint(id: number) {
  const slot = getStackCards().find(card => card.id === id)
  if (slot == null) throw new Error(`Missing stack slot ${id}`)
  return slot.top + slot.height / 2
}

function nextFrame() {
  return new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
}

async function waitFor(check: () => boolean, timeoutMs = 5_000) {
  const deadline = performance.now() + timeoutMs
  while (performance.now() < deadline) {
    if (check()) return
    await nextFrame()
  }
  throw new Error('Timed out waiting for scenario state')
}
