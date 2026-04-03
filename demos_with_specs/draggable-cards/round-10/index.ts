import {
  CARD_WIDTH,
  SCALE_DAMPING,
  SCALE_STIFFNESS,
  TOP_PADDING,
  advanceSpringForMs,
  computeStackLayout,
  createCardSpecs,
  createSpring,
  estimateReleaseVelocity,
  pinSpring,
  reorderIdsByPointerY,
  springIsSettled,
  type CardSpec,
  type PointerSample,
} from './logic.ts'

type Report = {
  phase: 'loading' | 'running' | 'ready' | 'error'
  requestId: string
  scenario: string
  orderedCardIds: number[]
  topItemId: number | null
  draggedCardId: number | null
  lastDraggedId: number | null
  message?: string
}

type CardRuntime = {
  spec: CardSpec
  el: HTMLDivElement
  x: ReturnType<typeof createSpring>
  y: ReturnType<typeof createSpring>
  scale: ReturnType<typeof createSpring>
}

type ActiveDrag = {
  id: number
  deltaX: number
  deltaY: number
  samples: PointerSample[]
  kind: 'pointer' | 'mouse' | 'touch'
}

const params = new URLSearchParams(location.search)
const requestId = params.get('requestId') ?? crypto.randomUUID()
const scenario = params.get('scenario') ?? ''

const specs = createCardSpecs()
const order = specs.map((spec) => spec.id)
const runtimes = new Map<number, CardRuntime>()

let activeDrag: ActiveDrag | null = null
let lastDraggedId: number | null = null
let hoveredId: number | null = null
let lastFrameTime = performance.now()
let lastReportJson = ''
let scenarioStarted = false

prepareDocument()
mountCards()
syncTargets()
publishReport('loading')
requestAnimationFrame(tick)
queueScenarioStart()

function prepareDocument() {
  document.body.style.margin = '0'
  document.body.style.position = 'relative'
  document.body.style.overflow = 'hidden'
  document.body.style.userSelect = 'none'
  ;(document.body.style as CSSStyleDeclaration & { WebkitUserSelect?: string }).WebkitUserSelect = 'none'
  document.body.style.background = 'hsl(220 10% 94%)'
  document.body.style.fontFamily = 'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
}

function mountCards() {
  for (const spec of specs) {
    const el = document.createElement('div')
    el.textContent = spec.label ?? `Drag Me ${spec.id}`
    el.dataset.cardId = String(spec.id)
    el.addEventListener('pointerdown', onPointerDown)
    el.addEventListener('mousedown', onMouseDown)
    el.addEventListener('touchstart', onTouchStart, { passive: false })
    document.body.appendChild(el)
    runtimes.set(spec.id, {
      spec,
      el,
      x: createSpring(0, 0),
      y: createSpring(0, 0),
      scale: createSpring(1, 1, 0, SCALE_STIFFNESS, SCALE_DAMPING),
    })
  }

  const initialLayout = currentLayout()
  for (const runtime of runtimes.values()) {
    const target = initialLayout.get(runtime.spec.id)
    if (!target) continue
    pinSpring(runtime.x, target.x)
    pinSpring(runtime.y, target.y)
    pinSpring(runtime.scale, 1)
  }
}

function queueScenarioStart() {
  if (!scenario) {
    scenarioStarted = true
    publishReport('running')
    return
  }

  const startScenario = async () => {
    if (scenarioStarted) return
    scenarioStarted = true
    await waitForFrames(2)

    if (scenario === 'reorder') {
      await runReorderScenario()
    } else if (scenario === 'release-depth') {
      await runReleaseDepthScenario()
    } else {
      publishReport('error', `unknown scenario: ${scenario}`)
    }
  }

  void startScenario()
}

function getRuntime(cardId: number) {
  const runtime = runtimes.get(cardId)
  if (!runtime) throw new Error(`missing card ${cardId}`)
  return runtime
}

function currentLayout() {
  return computeStackLayout(order, specs, window.innerWidth, TOP_PADDING)
}

function syncTargets() {
  const layout = currentLayout()

  for (const cardId of order) {
    const runtime = getRuntime(cardId)
    const target = layout.get(cardId)
    if (!target) continue

    if (activeDrag?.id === cardId) {
      updateDraggedCard(runtime)
      continue
    }

    runtime.x.dest = target.x
    runtime.y.dest = target.y
    runtime.scale.dest = 1
  }
}

function updateDraggedCard(runtime: CardRuntime) {
  if (!activeDrag) return

  const pointer = activeDrag.samples[activeDrag.samples.length - 1]
  const rawX = pointer.x - activeDrag.deltaX
  const centeredX = (window.innerWidth - CARD_WIDTH) / 2
  const dragX = rawX + (centeredX - rawX) / 1.5
  const dragY = pointer.y - activeDrag.deltaY

  pinSpring(runtime.x, dragX)
  pinSpring(runtime.y, dragY)
  pinSpring(runtime.scale, 1.1)
}

function applyDragSample(x: number, y: number, time: number) {
  if (!activeDrag) return

  activeDrag.samples.push({ x, y, time })
  if (activeDrag.samples.length > 20) activeDrag.samples.splice(0, activeDrag.samples.length - 20)

  const nextOrder = reorderIdsByPointerY(order, activeDrag.id, y, specs)
  if (nextOrder.join(',') !== order.join(',')) {
    order.splice(0, order.length, ...nextOrder)
  }

  syncTargets()
}

function finishDrag(time: number) {
  if (!activeDrag) return

  const draggedId = activeDrag.id
  const dragged = getRuntime(draggedId)
  const { vx, vy } = estimateReleaseVelocity(activeDrag.samples, time)

  activeDrag = null
  lastDraggedId = draggedId

  dragged.x.v += vx
  dragged.y.v += vy
  dragged.scale.dest = 1
  dragged.scale.v = 0

  syncTargets()
  publishReport('running')
}

function onPointerDown(event: PointerEvent) {
  if (event.button !== 0 || activeDrag) return
  event.preventDefault()
  startDragFromEvent(
    event.currentTarget as HTMLElement,
    event.pageX,
    event.pageY,
    event.timeStamp || performance.now(),
    'pointer',
  )
}

function onMouseDown(event: MouseEvent) {
  if (activeDrag || event.button !== 0) return
  event.preventDefault()
  startDragFromEvent(
    event.currentTarget as HTMLElement,
    event.pageX,
    event.pageY,
    event.timeStamp || performance.now(),
    'mouse',
  )
}

function onTouchStart(event: TouchEvent) {
  if (activeDrag) return
  const touch = event.touches[0]
  if (!touch) return
  event.preventDefault()
  startDragFromEvent(
    event.currentTarget as HTMLElement,
    touch.pageX,
    touch.pageY,
    event.timeStamp || performance.now(),
    'touch',
  )
}

function startDragFromEvent(
  target: HTMLElement,
  pageX: number,
  pageY: number,
  time: number,
  kind: ActiveDrag['kind'],
) {
  const cardId = Number(target.dataset.cardId)
  const runtime = getRuntime(cardId)
  const rect = runtime.el.getBoundingClientRect()

  activeDrag = {
    id: cardId,
    deltaX: pageX - (rect.left + window.scrollX),
    deltaY: pageY - (rect.top + window.scrollY),
    samples: [{ x: pageX, y: pageY, time }],
    kind,
  }

  lastDraggedId = null
  hoveredId = cardId
  syncTargets()
  publishReport('running')
}

function moveFromEvent(pageX: number, pageY: number, time: number) {
  if (activeDrag) {
    applyDragSample(pageX, pageY, time)
    return
  }

  hoveredId = hitTest(pageX, pageY)
}

function endFromEvent(pageX: number, pageY: number, time: number) {
  if (!activeDrag) return
  applyDragSample(pageX, pageY, time)
  finishDrag(time)
}

function hitTest(pageX: number, pageY: number) {
  for (let i = order.length - 1; i >= 0; i -= 1) {
    const cardId = order[i]
    const runtime = getRuntime(cardId)
    const rect = runtime.el.getBoundingClientRect()
    const left = rect.left + window.scrollX
    const top = rect.top + window.scrollY
    const width = rect.width
    const height = rect.height

    if (pageX >= left && pageX <= left + width && pageY >= top && pageY <= top + height) {
      return cardId
    }
  }
  return null
}

function normalizeMoveEvent(event: MouseEvent | PointerEvent | TouchEvent) {
  if ('pageX' in event && 'pageY' in event) {
    return { x: event.pageX, y: event.pageY, time: event.timeStamp || performance.now() }
  }

  const touch = 'touches' in event ? event.touches[0] ?? event.changedTouches[0] : null
  if (!touch) return null
  return { x: touch.pageX, y: touch.pageY, time: event.timeStamp || performance.now() }
}

function onPointerMove(event: PointerEvent) {
  if (!activeDrag || activeDrag.kind !== 'pointer') return
  const point = normalizeMoveEvent(event)
  if (point) moveFromEvent(point.x, point.y, point.time)
}

function onMouseMove(event: MouseEvent) {
  if (!activeDrag || activeDrag.kind !== 'mouse') return
  const point = normalizeMoveEvent(event)
  if (point) moveFromEvent(point.x, point.y, point.time)
}

function onTouchMove(event: TouchEvent) {
  if (!activeDrag || activeDrag.kind !== 'touch') return
  event.preventDefault()
  const point = normalizeMoveEvent(event)
  if (point) moveFromEvent(point.x, point.y, point.time)
}

function onPointerEnd(event: PointerEvent) {
  if (!activeDrag || activeDrag.kind !== 'pointer') return
  const point = normalizeMoveEvent(event)
  if (point) endFromEvent(point.x, point.y, point.time)
}

function onMouseUp(event: MouseEvent) {
  if (!activeDrag || activeDrag.kind !== 'mouse') return
  const point = normalizeMoveEvent(event)
  if (point) endFromEvent(point.x, point.y, point.time)
}

function onTouchEnd(event: TouchEvent) {
  if (!activeDrag || activeDrag.kind !== 'touch') return
  const point = normalizeMoveEvent(event)
  if (point) endFromEvent(point.x, point.y, point.time)
}

window.addEventListener('pointermove', onPointerMove)
window.addEventListener('pointerup', onPointerEnd)
window.addEventListener('pointercancel', onPointerEnd)
window.addEventListener('mousemove', onMouseMove)
window.addEventListener('mouseup', onMouseUp)
window.addEventListener('touchmove', onTouchMove, { passive: false })
window.addEventListener('touchend', onTouchEnd)
window.addEventListener('touchcancel', onTouchEnd)
window.addEventListener('resize', () => {
  syncTargets()
  publishReport('running')
})

function tick(now: number) {
  const elapsed = now - lastFrameTime
  lastFrameTime = now

  if (activeDrag) {
    const dragged = getRuntime(activeDrag.id)
    updateDraggedCard(dragged)
  }

  for (const runtime of runtimes.values()) {
    if (activeDrag?.id === runtime.spec.id) continue
    advanceSpringForMs(runtime.x, elapsed)
    advanceSpringForMs(runtime.y, elapsed)
    advanceSpringForMs(runtime.scale, elapsed)
  }

  if (lastDraggedId != null) {
    const lastDragged = getRuntime(lastDraggedId)
    if (
      activeDrag == null &&
      springIsSettled(lastDragged.x) &&
      springIsSettled(lastDragged.y) &&
      springIsSettled(lastDragged.scale)
    ) {
      lastDraggedId = null
    }
  }

  renderCards()
  publishReport(determinePhase())
  requestAnimationFrame(tick)
}

function renderCards() {
  const layout = currentLayout()

  for (const runtime of runtimes.values()) {
    const target = layout.get(runtime.spec.id)
    if (!target) continue

    if (activeDrag?.id !== runtime.spec.id) {
      runtime.x.dest = target.x
      runtime.y.dest = target.y
    }

    runtime.el.style.position = 'absolute'
    runtime.el.style.left = '0px'
    runtime.el.style.top = '0px'
    runtime.el.style.width = `${CARD_WIDTH}px`
    runtime.el.style.height = `${runtime.spec.height}px`
    runtime.el.style.display = 'flex'
    runtime.el.style.alignItems = 'center'
    runtime.el.style.justifyContent = 'center'
    runtime.el.style.boxSizing = 'border-box'
    runtime.el.style.border = '3px solid'
    runtime.el.style.borderColor = runtime.spec.outlineColor ?? 'hsl(216 75% 36%)'
    runtime.el.style.background = runtime.spec.backgroundColor ?? 'hsl(216 72% 66%)'
    runtime.el.style.color = runtime.spec.textColor ?? 'hsl(220 35% 14%)'
    runtime.el.style.fontSize = '18px'
    runtime.el.style.fontWeight = '700'
    runtime.el.style.letterSpacing = '-0.02em'
    runtime.el.style.borderRadius = '16px'
    runtime.el.style.boxShadow = shadowFor(runtime.spec.id)
    runtime.el.style.transformOrigin = 'top left'
    runtime.el.style.transform = `translate3d(${runtime.x.pos}px, ${runtime.y.pos}px, 0) scale(${runtime.scale.pos})`
    runtime.el.style.cursor = cursorFor(runtime.spec.id)
    runtime.el.style.zIndex = String(zIndexFor(runtime.spec.id))
    runtime.el.style.opacity = opacityFor(runtime.spec.id)
  }
}

function shadowFor(cardId: number) {
  if (activeDrag?.id === cardId) return '0 28px 70px rgba(26, 43, 84, 0.4)'
  if (lastDraggedId === cardId) return '0 20px 48px rgba(26, 43, 84, 0.28)'
  return '0 8px 20px rgba(26, 43, 84, 0.18)'
}

function cursorFor(cardId: number) {
  if (activeDrag?.id === cardId) return 'grabbing'
  if (hoveredId === cardId) return 'grab'
  return 'auto'
}

function opacityFor(cardId: number) {
  if (activeDrag?.id === cardId) return '0.7'
  return '1'
}

function zIndexFor(cardId: number) {
  if (activeDrag?.id === cardId) return '300'
  if (activeDrag == null && lastDraggedId === cardId) return '200'
  const index = order.indexOf(cardId)
  return String(10 + Math.max(index, 0))
}

function determinePhase(): Report['phase'] {
  if (activeDrag || lastDraggedId != null) return 'running'
  return allCardsSettled() ? 'ready' : 'running'
}

function allCardsSettled() {
  for (const runtime of runtimes.values()) {
    if (!springIsSettled(runtime.x) || !springIsSettled(runtime.y) || !springIsSettled(runtime.scale)) {
      return false
    }
  }
  return true
}

function publishReport(phase: Report['phase'], message?: string) {
  const report: Report = {
    phase,
    requestId,
    scenario,
    orderedCardIds: [...order],
    topItemId: topItemId(),
    draggedCardId: activeDrag?.id ?? null,
    lastDraggedId,
    ...(message ? { message } : {}),
  }

  const json = JSON.stringify(report)
  if (json === lastReportJson) return
  lastReportJson = json
  history.replaceState(null, '', `${location.pathname}${location.search}#report=${encodeURIComponent(json)}`)
}

function topItemId() {
  if (activeDrag) return activeDrag.id
  if (lastDraggedId != null) return lastDraggedId
  return order[order.length - 1] ?? null
}

async function waitForFrames(count: number) {
  for (let i = 0; i < count; i += 1) {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
  }
}

function getCardCenter(cardId: number) {
  const runtime = getRuntime(cardId)
  const rect = runtime.el.getBoundingClientRect()
  return {
    x: rect.left + rect.width / 2 + window.scrollX,
    y: rect.top + rect.height / 2 + window.scrollY,
  }
}

function dispatchPointer(type: 'pointerdown' | 'pointermove' | 'pointerup', target: EventTarget, x: number, y: number) {
  const event = new PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    composed: true,
    clientX: x,
    clientY: y,
    pointerId: 1,
    pointerType: 'mouse',
    isPrimary: true,
    button: type === 'pointerup' ? 0 : 0,
    buttons: type === 'pointerup' ? 0 : 1,
  })
  target.dispatchEvent(event)
}

async function runReorderScenario() {
  const cardId = 0
  const start = getCardCenter(cardId)
  const cardOne = getRuntime(1)
  const cardOneRect = cardOne.el.getBoundingClientRect()
  const targetY = cardOneRect.top + cardOneRect.height / 2 + window.scrollY + 12

  dispatchPointer('pointerdown', getRuntime(cardId).el, start.x, start.y)
  await waitForFrames(1)
  dispatchPointer('pointermove', window, start.x, targetY)
  await waitForFrames(2)
  dispatchPointer('pointerup', window, start.x, targetY)
}

async function runReleaseDepthScenario() {
  const cardId = 1
  const start = getCardCenter(cardId)
  const firstMove = start.y + 42
  const secondMove = start.y + 94
  const thirdMove = start.y + 128

  dispatchPointer('pointerdown', getRuntime(cardId).el, start.x, start.y)
  await waitForFrames(1)
  dispatchPointer('pointermove', window, start.x, firstMove)
  await waitForFrames(1)
  dispatchPointer('pointermove', window, start.x, secondMove)
  await waitForFrames(1)
  dispatchPointer('pointermove', window, start.x, thirdMove)
  await waitForFrames(1)
  dispatchPointer('pointerup', window, start.x, thirdMove)
}
