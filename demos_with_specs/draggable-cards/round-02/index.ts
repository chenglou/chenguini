import {estimateReleaseVelocity, hash, reorderIdsForPointer, type PointerSample} from './dragMath'

const rowSizeX = 320
const topPadding = 50
const cardCount = 5
const msPerAnimationStep = 4
const xYStiffness = 290
const xYDamping = 24
const scaleStiffness = 320
const scaleDamping = 26
const maxPointerSamples = 20

type Spring = {
  pos: number
  dest: number
  v: number
  k: number
  b: number
}

type Card = {
  id: number
  sizeY: number
  lightnessBase: number
  x: Spring
  y: Spring
  scale: Spring
}

type PointerLikeEvent = {
  x: number
  y: number
  time: number
  target: EventTarget | null
  pointerType: 'mouse' | 'touch' | 'pen'
}

type DragState = {
  draggedId: number
  deltaX: number
  deltaY: number
  pointerX: number
  pointerY: number
  samples: PointerSample[]
}

type Report = {
  status: 'loading' | 'running' | 'ready' | 'error'
  requestId: string
  scenario?: string
  order?: number[]
  orderBeforeRelease?: number[]
  draggedId?: number | null
  lastDraggedId?: number | null
  cursor?: string
  swapOccurred?: boolean
  topZId?: number | null
  zOrder?: number[]
  settling?: boolean
  error?: string
}

type State = {
  cards: Card[]
  order: number[]
  drag: DragState | null
  hoverId: number | null
  lastDraggedId: number | null
  animatedUntilTime: number | null
  latestCursor: string
  events: {
    pointerDown: PointerLikeEvent | null
    pointerUp: PointerLikeEvent | null
    mouseMove: PointerLikeEvent | null
    mouseUp: PointerLikeEvent | null
    touchMove: PointerLikeEvent | null
    touchEnd: PointerLikeEvent | null
    touchCancel: PointerLikeEvent | null
  }
}

type DomCache = {
  cards: HTMLDivElement[] // cache lifetime: same as data
}

const query = new URLSearchParams(location.search)
const requestId = query.get('requestId')
const scenario = query.get('scenario')

function spring(position: number, stiffness = xYStiffness, damping = xYDamping): Spring {
  return {pos: position, dest: position, v: 0, k: stiffness, b: damping}
}

function springStep(config: Spring) {
  const t = msPerAnimationStep / 1000
  const forceSpring = -config.k * (config.pos - config.dest)
  const forceDamper = -config.b * config.v
  const acceleration = forceSpring + forceDamper
  config.v += acceleration * t
  config.pos += config.v * t
}

function springMostlyDone(config: Spring): boolean {
  return Math.abs(config.v) < 0.01 && Math.abs(config.dest - config.pos) < 0.01
}

function springGoToEnd(config: Spring) {
  config.pos = config.dest
  config.v = 0
}

function centeredX(windowWidth: number): number {
  return (windowWidth - rowSizeX) / 2
}

function pointerSample(x: number, y: number, time: number): PointerSample {
  return {x, y, time}
}

function pushPointerSample(samples: PointerSample[], sample: PointerSample): PointerSample[] {
  const next = samples.slice()
  next.push(sample)
  if (next.length > maxPointerSamples) next.shift()
  return next
}

function sizeById(cards: Card[]): Record<number, number> {
  const result: Record<number, number> = {}
  for (const card of cards) result[card.id] = card.sizeY
  return result
}

function layoutYForId(order: number[], cards: Card[], id: number): number {
  let y = topPadding
  for (const orderedId of order) {
    if (orderedId === id) return y
    y += cards[orderedId]!.sizeY
  }
  return y
}

function currentZIndex(id: number, order: number[], drag: DragState | null, lastDraggedId: number | null): number {
  if (drag?.draggedId === id) return cardCount + 2
  if (lastDraggedId === id) return cardCount + 1
  return order.indexOf(id) + 1
}

function currentCursor(drag: DragState | null, hoverId: number | null): string {
  if (drag != null) return 'grabbing'
  if (hoverId != null) return 'grab'
  return 'auto'
}

const state: State = {
  cards: [],
  order: [0, 1, 2, 3, 4],
  drag: null,
  hoverId: null,
  lastDraggedId: null,
  animatedUntilTime: null,
  latestCursor: 'auto',
  events: {
    pointerDown: null,
    pointerUp: null,
    mouseMove: null,
    mouseUp: null,
    touchMove: null,
    touchEnd: null,
    touchCancel: null,
  },
}

for (let id = 0; id < cardCount; id++) {
  const sizeY = 30 + hash(id * 2) * 150
  const lightnessBase = hash(id * 2 + 1) * 40 + 40
  const initialX = centeredX(document.documentElement.clientWidth)
  const initialY = layoutYForId(state.order, [...state.cards, {
    id,
    sizeY,
    lightnessBase,
    x: spring(initialX),
    y: spring(0),
    scale: spring(1, scaleStiffness, scaleDamping),
  }], id)
  state.cards.push({
    id,
    sizeY,
    lightnessBase,
    x: spring(initialX),
    y: spring(initialY),
    scale: spring(1, scaleStiffness, scaleDamping),
  })
}

const domCache: DomCache = {
  cards: [],
}

for (const card of state.cards) {
  const node = document.createElement('div')
  node.className = 'card'
  node.textContent = `Drag Me ${card.id}`
  node.dataset.cardId = String(card.id)
  node.style.height = `${card.sizeY}px`
  node.style.background = `linear-gradient(180deg, hsl(208 82% ${Math.min(88, card.lightnessBase + 7)}%), hsl(210 74% ${card.lightnessBase}%))`
  node.style.border = `1px solid hsl(209 68% ${Math.max(28, card.lightnessBase - 22)}%)`
  document.body.appendChild(node)
  domCache.cards[card.id] = node
}

let scheduledRaf: number | null = null

function scheduleRender() {
  if (scheduledRaf != null) return
  scheduledRaf = requestAnimationFrame(function renderAndMaybeScheduleAnotherRender(now) {
    scheduledRaf = null
    if (render(now)) scheduleRender()
  })
}

function publishReport(report: Report) {
  if (requestId == null) return
  location.hash = `report=${encodeURIComponent(JSON.stringify(report))}`
}

function snapshotReport(extra: Partial<Report> = {}): Report {
  const idsByZ = [...state.order].sort((a, b) => {
    return currentZIndex(b, state.order, state.drag, state.lastDraggedId) - currentZIndex(a, state.order, state.drag, state.lastDraggedId)
  })
  return {
    status: 'ready',
    requestId: requestId!,
    scenario: scenario ?? undefined,
    order: state.order.slice(),
    draggedId: state.drag?.draggedId ?? null,
    lastDraggedId: state.lastDraggedId,
    cursor: state.latestCursor,
    topZId: idsByZ[0] ?? null,
    zOrder: idsByZ,
    settling: state.lastDraggedId != null && !releasedCardSettled(state.lastDraggedId),
    ...extra,
  }
}

function releasedCardSettled(id: number): boolean {
  const card = state.cards[id]
  return (
    springMostlyDone(card.x) &&
    springMostlyDone(card.y) &&
    springMostlyDone(card.scale)
  )
}

function findCardAt(x: number, y: number): number | null {
  const idsByZ = [...state.order].sort((a, b) => {
    return currentZIndex(b, state.order, state.drag, state.lastDraggedId) - currentZIndex(a, state.order, state.drag, state.lastDraggedId)
  })
  for (const id of idsByZ) {
    const card = state.cards[id]!
    if (
      x >= card.x.pos &&
      x <= card.x.pos + rowSizeX &&
      y >= card.y.pos &&
      y <= card.y.pos + card.sizeY
    ) {
      return id
    }
  }
  return null
}

function beginDrag(event: PointerLikeEvent) {
  const draggedId = findCardAt(event.x, event.y)
  if (draggedId == null) return
  const card = state.cards[draggedId]!
  state.drag = {
    draggedId,
    deltaX: event.x - card.x.pos,
    deltaY: event.y - card.y.pos,
    pointerX: event.x,
    pointerY: event.y,
    samples: [pointerSample(event.x, event.y, event.time)],
  }
  state.lastDraggedId = null
}

function updateDragFromEvent(event: PointerLikeEvent | null) {
  if (event == null || state.drag == null) return
  state.drag.pointerX = event.x
  state.drag.pointerY = event.y
  state.drag.samples = pushPointerSample(state.drag.samples, pointerSample(event.x, event.y, event.time))
}

function releaseDrag(event: PointerLikeEvent | null) {
  if (state.drag == null) return
  if (event != null) updateDragFromEvent(event)
  const drag = state.drag
  const releasedCard = state.cards[drag.draggedId]!
  const releaseTime = event?.time ?? drag.samples[drag.samples.length - 1]!.time
  const {vx, vy} = estimateReleaseVelocity(drag.samples, releaseTime)
  releasedCard.x.v += vx
  releasedCard.y.v += vy
  state.drag = null
  state.lastDraggedId = releasedCard.id
}

function pointerEventFromMouse(event: MouseEvent): PointerLikeEvent {
  return {
    x: event.pageX,
    y: event.pageY,
    time: event.timeStamp,
    target: event.target,
    pointerType: 'mouse',
  }
}

function pointerEventFromPointer(event: PointerEvent): PointerLikeEvent {
  return {
    x: event.pageX,
    y: event.pageY,
    time: event.timeStamp,
    target: event.target,
    pointerType: event.pointerType === 'touch' ? 'touch' : event.pointerType === 'pen' ? 'pen' : 'mouse',
  }
}

function pointerEventFromTouch(event: TouchEvent): PointerLikeEvent | null {
  const touch = event.touches[0] ?? event.changedTouches[0]
  if (touch == null) return null
  return {
    x: touch.pageX,
    y: touch.pageY,
    time: event.timeStamp,
    target: event.target,
    pointerType: 'touch',
  }
}

window.addEventListener('pointerdown', event => {
  if (event.button !== 0 || !event.isPrimary) return
  state.events.pointerDown = pointerEventFromPointer(event)
  event.preventDefault()
  scheduleRender()
}, {capture: true})

window.addEventListener('pointerup', event => {
  state.events.pointerUp = pointerEventFromPointer(event)
  scheduleRender()
}, {capture: true})

window.addEventListener('mousemove', event => {
  state.events.mouseMove = pointerEventFromMouse(event)
  scheduleRender()
}, {capture: true})

window.addEventListener('mouseup', event => {
  state.events.mouseUp = pointerEventFromMouse(event)
  scheduleRender()
}, {capture: true})

window.addEventListener('touchmove', event => {
  if (state.drag != null) event.preventDefault()
  state.events.touchMove = pointerEventFromTouch(event)
  scheduleRender()
}, {capture: true, passive: false})

window.addEventListener('touchend', event => {
  state.events.touchEnd = pointerEventFromTouch(event)
  scheduleRender()
}, {capture: true})

window.addEventListener('touchcancel', event => {
  state.events.touchCancel = pointerEventFromTouch(event)
  scheduleRender()
}, {capture: true})

window.addEventListener('resize', () => {
  scheduleRender()
})

function render(now: number): boolean {
  if (state.events.pointerDown != null && state.drag == null) {
    beginDrag(state.events.pointerDown)
  }

  if (state.drag == null) {
    const hoverEvent = state.events.mouseMove
    state.hoverId = hoverEvent != null ? findCardAt(hoverEvent.x, hoverEvent.y) : state.hoverId
  }

  updateDragFromEvent(state.events.mouseMove)
  updateDragFromEvent(state.events.touchMove)

  const releaseEvent =
    state.events.touchCancel ??
    state.events.touchEnd ??
    state.events.pointerUp ??
    state.events.mouseUp
  if (releaseEvent != null) {
    releaseDrag(releaseEvent)
  }

  if (state.drag != null) {
    state.order = reorderIdsForPointer(
      state.order,
      state.drag.draggedId,
      state.drag.pointerY,
      topPadding,
      sizeById(state.cards),
    )
  }

  const columnX = centeredX(document.documentElement.clientWidth)
  for (const card of state.cards) {
    const isDragged = state.drag?.draggedId === card.id
    if (isDragged) {
      const rawX = state.drag!.pointerX - state.drag!.deltaX
      const dragX = rawX + (columnX - rawX) / 1.5
      const dragY = state.drag!.pointerY - state.drag!.deltaY
      card.x.pos = card.x.dest = dragX
      card.y.pos = card.y.dest = dragY
      card.x.v = 0
      card.y.v = 0
      card.scale.pos = card.scale.dest = 1.1
      card.scale.v = 0
    } else {
      card.x.dest = columnX
      card.y.dest = layoutYForId(state.order, state.cards, card.id)
      card.scale.dest = 1
    }
  }

  let animatedUntilTime = state.animatedUntilTime ?? now
  const shouldForceFirstStep = state.cards.some(card => {
    const isDragged = state.drag?.draggedId === card.id
    return !isDragged && (!springMostlyDone(card.x) || !springMostlyDone(card.y) || !springMostlyDone(card.scale))
  })
  let steps = Math.floor((now - animatedUntilTime) / msPerAnimationStep)
  if (state.animatedUntilTime == null && shouldForceFirstStep) steps = Math.max(1, steps)
  steps = Math.min(300, Math.max(0, steps))
  animatedUntilTime += steps * msPerAnimationStep

  for (let step = 0; step < steps; step++) {
    for (const card of state.cards) {
      if (state.drag?.draggedId === card.id) continue
      springStep(card.x)
      springStep(card.y)
      springStep(card.scale)
    }
  }

  let stillAnimating = false
  for (const card of state.cards) {
    if (state.drag?.draggedId === card.id) continue
    if (springMostlyDone(card.x)) springGoToEnd(card.x)
    else stillAnimating = true
    if (springMostlyDone(card.y)) springGoToEnd(card.y)
    else stillAnimating = true
    if (springMostlyDone(card.scale)) springGoToEnd(card.scale)
    else stillAnimating = true
  }

  if (state.lastDraggedId != null && releasedCardSettled(state.lastDraggedId)) {
    state.lastDraggedId = null
  }

  state.latestCursor = currentCursor(state.drag, state.hoverId)
  state.animatedUntilTime = stillAnimating ? animatedUntilTime : null

  state.events.pointerDown = null
  state.events.pointerUp = null
  state.events.mouseMove = null
  state.events.mouseUp = null
  state.events.touchMove = null
  state.events.touchEnd = null
  state.events.touchCancel = null

  document.body.style.cursor = state.latestCursor

  for (const card of state.cards) {
    const node = domCache.cards[card.id]!
    const isDragged = state.drag?.draggedId === card.id
    node.style.transform = `translate(${card.x.pos}px, ${card.y.pos}px) scale(${card.scale.pos})`
    node.style.opacity = isDragged ? '0.7' : '1'
    node.style.zIndex = String(currentZIndex(card.id, state.order, state.drag, state.lastDraggedId))
    node.style.boxShadow = isDragged
      ? '0 24px 60px hsl(210 55% 22% / 0.35)'
      : '0 8px 18px hsl(210 35% 26% / 0.16)'
  }

  return stillAnimating
}

function waitFrames(count: number): Promise<void> {
  return new Promise(resolve => {
    let remaining = count
    function onFrame() {
      remaining -= 1
      if (remaining <= 0) {
        resolve()
        return
      }
      requestAnimationFrame(onFrame)
    }
    requestAnimationFrame(onFrame)
  })
}

function dispatchPointerDown(id: number, x: number, y: number) {
  domCache.cards[id]!.dispatchEvent(new PointerEvent('pointerdown', {
    bubbles: true,
    button: 0,
    buttons: 1,
    clientX: x,
    clientY: y,
    pointerId: 1,
    isPrimary: true,
    pointerType: 'mouse',
  }))
}

function dispatchMouseMove(x: number, y: number) {
  window.dispatchEvent(new MouseEvent('mousemove', {
    bubbles: true,
    buttons: 1,
    clientX: x,
    clientY: y,
  }))
}

function dispatchMouseUp(x: number, y: number) {
  window.dispatchEvent(new MouseEvent('mouseup', {
    bubbles: true,
    button: 0,
    clientX: x,
    clientY: y,
  }))
}

async function runDragPath(): Promise<{
  initialOrder: number[]
  orderBeforeRelease: number[]
}> {
  await waitFrames(2)
  const draggedCard = state.cards[1]!
  const startX = draggedCard.x.pos + rowSizeX / 2
  const startY = draggedCard.y.pos + draggedCard.sizeY / 2
  dispatchPointerDown(1, startX, startY)
  await waitFrames(1)

  const nextCard = state.cards[2]!
  const nextMidY = layoutYForId(state.order, state.cards, 2) + nextCard.sizeY / 2 + 24
  dispatchMouseMove(startX, nextMidY)
  await waitFrames(2)

  return {
    initialOrder: [0, 1, 2, 3, 4],
    orderBeforeRelease: state.order.slice(),
  }
}

async function runScenarioIfNeeded() {
  if (requestId == null || scenario == null) return
  publishReport({status: 'loading', requestId, scenario})
  await waitFrames(1)
  try {
    publishReport({status: 'running', requestId, scenario})
    if (scenario === 'drag-reorder') {
      const {initialOrder, orderBeforeRelease} = await runDragPath()
      publishReport(snapshotReport({
        orderBeforeRelease,
        swapOccurred: orderBeforeRelease.join(',') !== initialOrder.join(','),
      }))
      return
    }
    if (scenario === 'release-depth') {
      await runDragPath()
      const draggedCard = state.cards[1]!
      const releaseX = draggedCard.x.pos + rowSizeX / 2
      const releaseY = draggedCard.y.pos + draggedCard.sizeY / 2
      dispatchMouseUp(releaseX, releaseY)
      await waitFrames(2)
      publishReport(snapshotReport())
      return
    }
    publishReport({
      status: 'error',
      requestId,
      scenario,
      error: `unknown scenario: ${scenario}`,
    })
  } catch (error) {
    publishReport({
      status: 'error',
      requestId,
      scenario,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

render(performance.now())
scheduleRender()
void runScenarioIfNeeded()
