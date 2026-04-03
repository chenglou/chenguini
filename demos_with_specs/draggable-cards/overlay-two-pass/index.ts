import {
  CARD_WIDTH,
  DRAG_OPACITY,
  DRAG_SCALE,
  TOP_PADDING,
  advanceSpringForMs,
  createCardSpecs,
  createSpring,
  estimateReleaseVelocity,
  layoutCards,
  pinSpring,
  reorderIdsByPointerY,
  springIsSettled,
  type CardSpec,
  type PointerSample,
  type Spring,
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
  base: CardSpec
  el: HTMLDivElement
  x: Spring
  y: Spring
  scale: Spring
}

type ActiveDrag = {
  id: number
  deltaX: number
  deltaY: number
  samples: PointerSample[]
  pointerX: number
  pointerY: number
}

const params = new URLSearchParams(location.search)
const requestId = params.get('requestId') ?? crypto.randomUUID()
const scenario = params.get('scenario') ?? ''

const specs = createCardSpecs()
const order = specs.map((spec) => spec.id)
const runtimes = new Map<number, CardRuntime>()

let activeDrag: ActiveDrag | null = null
let settlingId: number | null = null
let scenarioStarted = !scenario
let scenarioFailed = false
let lastReportJson = ''
let lastFrameTime = performance.now()

prepareDocument()
mountCards()
pinInitialLayout()
syncTargets()
publishReport('loading')
requestAnimationFrame(tick)
void queueScenarioStart()

function prepareDocument() {
  document.body.style.margin = '0'
  document.body.style.overflow = 'hidden'
  document.body.style.userSelect = 'none'
  ;(document.body.style as CSSStyleDeclaration & { WebkitUserSelect?: string }).WebkitUserSelect = 'none'
  document.body.style.background =
    'radial-gradient(circle at top, hsl(213 18% 98%), hsl(223 18% 90%) 52%, hsl(226 16% 85%))'
  document.body.style.fontFamily = 'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif'

  const title = document.createElement('div')
  title.textContent = 'Draggable cards'
  title.style.position = 'fixed'
  title.style.left = '24px'
  title.style.top = '20px'
  title.style.fontSize = '14px'
  title.style.letterSpacing = '0.12em'
  title.style.textTransform = 'uppercase'
  title.style.color = 'hsl(220 14% 35%)'
  document.body.appendChild(title)
}

function mountCards() {
  for (const spec of specs) {
    const el = document.createElement('div')
    el.dataset.cardId = String(spec.id)
    el.style.position = 'absolute'
    el.style.width = `${CARD_WIDTH}px`
    el.style.borderRadius = '24px'
    el.style.boxShadow = '0 14px 40px hsl(220 30% 18% / 0.18)'
    el.style.boxSizing = 'border-box'
    el.style.padding = '22px 24px'
    el.style.border = '1px solid hsl(0 0% 100% / 0.55)'
    el.style.backdropFilter = 'blur(8px)'
    el.style.cursor = 'grab'
    el.style.willChange = 'transform, opacity'
    el.style.touchAction = 'none'
    el.style.color = 'hsl(220 18% 18%)'
    el.style.fontWeight = '600'
    el.textContent = `Card ${spec.id + 1}`
    el.addEventListener('pointerdown', onPointerDown)
    document.body.appendChild(el)

    runtimes.set(spec.id, {
      base: spec,
      el,
      x: createSpring(0),
      y: createSpring(0),
      scale: createSpring(1, 1, 0, 340, 26),
    })
  }
}

function pinInitialLayout() {
  const layout = currentLayout()
  const layoutById = new Map(layout.map((spec) => [spec.id, spec]))

  for (const runtime of runtimes.values()) {
    const target = layoutById.get(runtime.base.id)
    if (!target) continue
    pinSpring(runtime.x, target.left)
    pinSpring(runtime.y, target.top)
    pinSpring(runtime.scale, 1)
  }
}

function getRuntime(cardId: number) {
  const runtime = runtimes.get(cardId)
  if (!runtime) throw new Error(`missing runtime for card ${cardId}`)
  return runtime
}

function currentLayout() {
  return layoutCards(order, specs, window.innerWidth, TOP_PADDING)
}

function syncTargets() {
  const layout = currentLayout()
  const layoutById = new Map(layout.map((spec) => [spec.id, spec]))

  for (const cardId of order) {
    const runtime = getRuntime(cardId)
    const target = layoutById.get(cardId)
    if (!target) continue

    if (activeDrag?.id === cardId) {
      updateDraggedCard(runtime)
      continue
    }

    runtime.x.dest = target.left
    runtime.y.dest = target.top
    runtime.scale.dest = 1
  }
}

function updateDraggedCard(runtime: CardRuntime) {
  if (!activeDrag) return

  const rawX = activeDrag.pointerX - activeDrag.deltaX
  const centeredX = (window.innerWidth - CARD_WIDTH) / 2
  const x = rawX + (centeredX - rawX) / 1.5
  const y = activeDrag.pointerY - activeDrag.deltaY

  pinSpring(runtime.x, x)
  pinSpring(runtime.y, y)
  pinSpring(runtime.scale, DRAG_SCALE)
}

function applyDragSample(pointerX: number, pointerY: number, time: number) {
  if (!activeDrag) return

  activeDrag.pointerX = pointerX
  activeDrag.pointerY = pointerY
  activeDrag.samples.push({ x: pointerX, y: pointerY, time })
  if (activeDrag.samples.length > 20) activeDrag.samples.splice(0, activeDrag.samples.length - 20)

  const nextOrder = reorderIdsByPointerY(order, activeDrag.id, pointerY, currentLayout())
  if (nextOrder.join(',') !== order.join(',')) {
    order.splice(0, order.length, ...nextOrder)
  }

  syncTargets()
  publishReport('running')
}

function startDrag(cardId: number, pointerX: number, pointerY: number, time: number) {
  const runtime = getRuntime(cardId)
  const rect = runtime.el.getBoundingClientRect()

  activeDrag = {
    id: cardId,
    deltaX: pointerX - rect.left,
    deltaY: pointerY - rect.top,
    pointerX,
    pointerY,
    samples: [{ x: pointerX, y: pointerY, time }],
  }
  settlingId = null
  syncTargets()
  publishReport('running')
}

function finishDrag(time: number) {
  if (!activeDrag) return

  const draggedId = activeDrag.id
  const runtime = getRuntime(draggedId)
  const { vx, vy } = estimateReleaseVelocity(activeDrag.samples, time)

  activeDrag = null
  settlingId = draggedId

  syncTargets()
  runtime.x.v += vx
  runtime.y.v += vy
  runtime.scale.dest = 1
  publishReport('running')
}

function onPointerDown(event: PointerEvent) {
  if (event.button !== 0 || activeDrag) return
  event.preventDefault()

  const target = event.currentTarget as HTMLElement
  startDrag(Number(target.dataset.cardId), event.clientX, event.clientY, event.timeStamp || performance.now())

  const onMove = (moveEvent: PointerEvent) => {
    if (!activeDrag) return
    moveEvent.preventDefault()
    applyDragSample(moveEvent.clientX, moveEvent.clientY, moveEvent.timeStamp || performance.now())
  }

  const onUp = (upEvent: PointerEvent) => {
    upEvent.preventDefault()
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
    window.removeEventListener('pointercancel', onUp)
    finishDrag(upEvent.timeStamp || performance.now())
  }

  window.addEventListener('pointermove', onMove, { passive: false })
  window.addEventListener('pointerup', onUp, { passive: false })
  window.addEventListener('pointercancel', onUp, { passive: false })
}

function advancePhysics(deltaMs: number) {
  for (const runtime of runtimes.values()) {
    if (activeDrag?.id === runtime.base.id) continue
    advanceSpringForMs(runtime.x, deltaMs)
    advanceSpringForMs(runtime.y, deltaMs)
    advanceSpringForMs(runtime.scale, deltaMs)
  }
}

function maybeClearSettlingId() {
  if (settlingId == null) return

  const runtime = getRuntime(settlingId)
  if (springIsSettled(runtime.x) && springIsSettled(runtime.y) && springIsSettled(runtime.scale)) {
    settlingId = null
  }
}

function render() {
  const topOverlayId = activeDrag?.id ?? settlingId

  for (const runtime of runtimes.values()) {
    const isActive = activeDrag?.id === runtime.base.id
    const isSettling = settlingId === runtime.base.id
    const x = isActive ? runtime.x.value : runtime.x.value
    const y = isActive ? runtime.y.value : runtime.y.value
    const scale = isActive ? DRAG_SCALE : runtime.scale.value

    runtime.el.style.left = '0'
    runtime.el.style.top = '0'
    runtime.el.style.height = `${runtime.base.height}px`
    runtime.el.style.background = `linear-gradient(180deg, hsl(0 0% 100% / 0.72), hsl(0 0% 100% / 0.28)), hsl(212 24% ${runtime.base.lightnessBase}%)`
    runtime.el.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${scale})`
    runtime.el.style.opacity = isActive ? String(DRAG_OPACITY) : '1'
    runtime.el.style.zIndex = String(isActive ? 3 : isSettling ? 2 : 1)
    runtime.el.style.cursor = isActive ? 'grabbing' : 'grab'
  }

  publishReport(computePhase(), topOverlayId)
}

function computePhase(): Report['phase'] {
  if (scenarioFailed) return 'error'
  if (!scenarioStarted) return 'loading'
  if (activeDrag || settlingId != null) return 'running'

  for (const runtime of runtimes.values()) {
    if (!springIsSettled(runtime.x) || !springIsSettled(runtime.y) || !springIsSettled(runtime.scale)) {
      return 'running'
    }
  }

  return 'ready'
}

function publishReport(phase: Report['phase'], topItemId: number | null = activeDrag?.id ?? settlingId) {
  const report: Report = {
    phase,
    requestId,
    scenario,
    orderedCardIds: order.slice(),
    topItemId,
    draggedCardId: activeDrag?.id ?? null,
    lastDraggedId: settlingId,
  }

  const json = JSON.stringify(report)
  if (json === lastReportJson) return
  lastReportJson = json
  location.hash = `report=${encodeURIComponent(json)}`
}

async function queueScenarioStart() {
  if (!scenario) {
    scenarioStarted = true
    return
  }

  await waitFrames(2)
  scenarioStarted = true

  try {
    if (scenario === 'reorder-during-drag') {
      await runReorderDuringDragScenario()
    } else if (scenario === 'release-settle') {
      await runReleaseSettleScenario()
    } else {
      scenarioFailed = true
      publishReport('error')
    }
  } catch (error) {
    scenarioFailed = true
    publishReport('error', null)
    console.error(error)
  }
}

async function runReorderDuringDragScenario() {
  const layout = currentLayout()
  const first = layout[0]
  const second = layout[1]
  if (!first || !second) throw new Error('missing cards for reorder scenario')

  const startX = first.left + first.width / 2
  const startY = first.top + first.height / 2

  startDrag(first.id, startX, startY, performance.now())
  await waitFrames(1)

  const targetY = second.top + second.height / 2 + 12
  applyDragSample(startX, targetY, performance.now())
  await waitFrames(1)

  finishDrag(performance.now())
  await settleAfterScenario()
}

async function runReleaseSettleScenario() {
  const layout = currentLayout()
  const first = layout[0]
  if (!first) throw new Error('missing cards for release scenario')

  const startX = first.left + first.width / 2
  const startY = first.top + first.height / 2

  startDrag(first.id, startX, startY, performance.now())
  await waitFrames(1)

  applyDragSample(startX + 18, startY + 14, performance.now() + 16)
  await waitFrames(1)
  applyDragSample(startX + 26, startY + 22, performance.now() + 32)
  await waitFrames(1)
  finishDrag(performance.now() + 48)
  await settleAfterScenario()
}

async function settleAfterScenario() {
  for (let i = 0; i < 240; i++) {
    if (computePhase() === 'ready') return
    await waitFrames(1)
  }
  throw new Error('scenario did not settle')
}

function waitFrames(count: number) {
  return new Promise<void>((resolve) => {
    const step = (remaining: number) => {
      if (remaining <= 0) {
        resolve()
        return
      }
      requestAnimationFrame(() => step(remaining - 1))
    }
    step(count)
  })
}

function tick(now: number) {
  const deltaMs = Math.min(32, Math.max(0, now - lastFrameTime))
  lastFrameTime = now

  advancePhysics(deltaMs)
  syncTargets()
  maybeClearSettlingId()
  render()

  requestAnimationFrame(tick)
}
