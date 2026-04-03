import {
  CARD_COUNT,
  CARD_WIDTH,
  MS_PER_ANIMATION_STEP,
  centeredCardX,
  createCardSpecs,
  draggedCardX,
  estimateReleaseVelocity,
  layoutCards,
  pushPointerSample,
  reorderDraggedCard,
  spring,
  springMostlyDone,
  springSnap,
  springStep,
  type PointerSample,
  type Spring,
} from './logic'

type CardState = {
  id: number
  label: string
  height: number
  lightnessBase: number
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
}

type PointerInput = {
  x: number
  y: number
  time: number
}

type State = {
  cards: CardState[]
  order: number[]
  drag: DragState | null
  lastDraggedId: number | null
  hoveredCardId: number | null
  hoverPointer: { x: number; y: number } | null
  pointerSamples: PointerSample[]
  animatedUntilTime: number | null
  sawSwapDuringDrag: boolean
  events: {
    pointerDown: PointerInput | null
    pointerMove: PointerInput | null
    pointerUp: PointerInput | null
    hoverMove: PointerInput | null
    clearHover: boolean
  }
}

type DomCache = {
  cards: HTMLDivElement[]
}

type AutomationContext = {
  requestId: string
  scenario: string
}

type BrowserReport = {
  status: 'ready' | 'error'
  requestId: string
  scenario: string
  phase: string
  orderedCardIds?: number[]
  draggedId?: number | null
  lastDraggedId?: number | null
  cursor?: string
  swapTriggered?: boolean
  elevatedWhileSettling?: boolean
  clearedAfterSettle?: boolean
  cardSummaries?: Array<{ id: number; x: number; y: number; zIndex: number }>
  message?: string
}

const semanticReportNode = document.getElementById('semantic-report')

const cardSpecs = createCardSpecs(CARD_COUNT)
const initialCenterX = centeredCardX(document.documentElement.clientWidth)
const heightsById = cardSpecs.map((card) => card.height)
const initialLayouts = layoutCards(cardSpecs.map((card) => card.id), heightsById)

const st: State = {
  cards: cardSpecs.map((card) => ({
    id: card.id,
    label: card.label,
    height: card.height,
    lightnessBase: card.lightnessBase,
    x: spring(initialCenterX),
    y: spring(initialLayouts[card.id]!.y),
    scale: spring(1),
  })),
  order: cardSpecs.map((card) => card.id),
  drag: null,
  lastDraggedId: null,
  hoveredCardId: null,
  hoverPointer: null,
  pointerSamples: [],
  animatedUntilTime: null,
  sawSwapDuringDrag: false,
  events: {
    pointerDown: null,
    pointerMove: null,
    pointerUp: null,
    hoverMove: null,
    clearHover: false,
  },
}

const domCache: DomCache = {
  cards: [],
}

let scheduledRaf: number | null = null

for (let i = 0; i < st.cards.length; i += 1) {
  const card = st.cards[i]!
  const node = document.createElement('div')
  node.className = 'card'
  node.textContent = card.label
  document.body.appendChild(node)
  domCache.cards[card.id] = node
}

const automationContext = readAutomationContext()

window.addEventListener('pointerdown', (event) => {
  if (event.button !== 0) return
  queuePointerDown({ x: event.pageX, y: event.pageY, time: event.timeStamp })
  event.preventDefault()
})

window.addEventListener('pointermove', (event) => {
  queuePointerMove({ x: event.pageX, y: event.pageY, time: event.timeStamp })
})

window.addEventListener('pointerup', (event) => {
  queuePointerUp({ x: event.pageX, y: event.pageY, time: event.timeStamp })
})

window.addEventListener('mouseup', (event) => {
  queuePointerUp({ x: event.pageX, y: event.pageY, time: event.timeStamp })
})

window.addEventListener('mousemove', (event) => {
  queueHoverMove({ x: event.pageX, y: event.pageY, time: event.timeStamp })
})

window.addEventListener('touchmove', (event) => {
  const touch = event.touches[0]
  if (touch == null) return
  queuePointerMove({ x: touch.pageX, y: touch.pageY, time: event.timeStamp })
  if (st.drag != null) event.preventDefault()
}, { passive: false })

window.addEventListener('touchend', (event) => {
  const touch = event.changedTouches[0]
  if (touch == null) return
  queuePointerUp({ x: touch.pageX, y: touch.pageY, time: event.timeStamp })
})

window.addEventListener('touchcancel', (event) => {
  const touch = event.changedTouches[0]
  if (touch == null) return
  queuePointerUp({ x: touch.pageX, y: touch.pageY, time: event.timeStamp })
})

window.addEventListener('blur', () => {
  st.events.clearHover = true
  scheduleRender()
})

window.addEventListener('resize', () => {
  scheduleRender()
})

scheduleRender()
if (automationContext != null) {
  publishPhase({ status: 'ready', requestId: automationContext.requestId, scenario: automationContext.scenario, phase: 'loading' })
  void runAutomationScenario(automationContext)
}

function queuePointerDown(input: PointerInput) {
  st.events.pointerDown = input
  scheduleRender()
}

function queuePointerMove(input: PointerInput) {
  st.events.pointerMove = input
  scheduleRender()
}

function queuePointerUp(input: PointerInput) {
  st.events.pointerUp = input
  scheduleRender()
}

function queueHoverMove(input: PointerInput) {
  st.events.hoverMove = input
  scheduleRender()
}

function scheduleRender() {
  if (scheduledRaf != null) return
  scheduledRaf = window.requestAnimationFrame((now) => {
    scheduledRaf = null
    if (render(now)) scheduleRender()
  })
}

function render(now: number) {
  const windowWidth = document.documentElement.clientWidth

  if (st.events.hoverMove != null) {
    st.hoverPointer = { x: st.events.hoverMove.x, y: st.events.hoverMove.y }
  }
  if (st.events.clearHover) {
    st.hoverPointer = null
  }

  if (st.events.pointerDown != null) {
    const hitId = hitTestCard(st.events.pointerDown.x, st.events.pointerDown.y)
    if (hitId != null) {
      const card = st.cards[hitId]!
      const visualRect = getVisualRect(card)
      st.drag = {
        cardId: hitId,
        deltaX: st.events.pointerDown.x - visualRect.x,
        deltaY: st.events.pointerDown.y - visualRect.y,
        pointerX: st.events.pointerDown.x,
        pointerY: st.events.pointerDown.y,
      }
      st.pointerSamples = [
        {
          x: st.events.pointerDown.x,
          y: st.events.pointerDown.y,
          time: st.events.pointerDown.time,
        },
      ]
      st.lastDraggedId = hitId
      st.sawSwapDuringDrag = false
      st.animatedUntilTime = document.timeline.currentTime ?? now
    }
  }

  if (st.events.pointerMove != null) {
    if (st.drag != null) {
      st.drag.pointerX = st.events.pointerMove.x
      st.drag.pointerY = st.events.pointerMove.y
      st.pointerSamples = pushPointerSample(st.pointerSamples, {
        x: st.events.pointerMove.x,
        y: st.events.pointerMove.y,
        time: st.events.pointerMove.time,
      })
      const layoutsById = currentLayoutsById()
      const reorder = reorderDraggedCard(layoutsById, st.order, st.drag.cardId, st.drag.pointerY)
      if (reorder.didSwap) {
        st.order = reorder.order
        st.sawSwapDuringDrag = true
      }
    } else {
      st.hoverPointer = { x: st.events.pointerMove.x, y: st.events.pointerMove.y }
    }
  }

  if (st.events.pointerUp != null && st.drag != null) {
    const releasedCard = st.cards[st.drag.cardId]!
    st.pointerSamples = pushPointerSample(st.pointerSamples, {
      x: st.events.pointerUp.x,
      y: st.events.pointerUp.y,
      time: st.events.pointerUp.time,
    })
    const velocity = estimateReleaseVelocity(st.pointerSamples, st.events.pointerUp.time)
    releasedCard.x.v += velocity.x
    releasedCard.y.v += velocity.y
    releasedCard.scale.v = 0
    st.lastDraggedId = st.drag.cardId
    st.drag = null
    st.pointerSamples = []
    st.animatedUntilTime = document.timeline.currentTime ?? now
  }

  const centeredX = centeredCardX(windowWidth)
  const destinations = layoutCards(st.order, heightsById)
  for (let i = 0; i < st.cards.length; i += 1) {
    const card = st.cards[i]!
    if (st.drag != null && card.id === st.drag.cardId) {
      card.x.pos = draggedCardX(st.drag.pointerX, st.drag.deltaX, windowWidth)
      card.x.dest = card.x.pos
      card.x.v = 0
      card.y.pos = st.drag.pointerY - st.drag.deltaY
      card.y.dest = card.y.pos
      card.y.v = 0
      card.scale.pos = 1.1
      card.scale.dest = 1.1
      card.scale.v = 0
    } else {
      card.x.dest = centeredX
      card.y.dest = destinations[card.id]!.y
      card.scale.dest = 1
    }
  }

  st.hoveredCardId = st.drag == null && st.hoverPointer != null
    ? hitTestCard(st.hoverPointer.x, st.hoverPointer.y)
    : null

  let stillAnimating = false
  if (st.animatedUntilTime != null) {
    const steps = Math.min(300, Math.floor((now - st.animatedUntilTime) / MS_PER_ANIMATION_STEP))
    st.animatedUntilTime += steps * MS_PER_ANIMATION_STEP
    for (let step = 0; step < steps; step += 1) {
      for (let i = 0; i < st.cards.length; i += 1) {
        const card = st.cards[i]!
        if (st.drag != null && card.id === st.drag.cardId) continue
        springStep(card.x)
        springStep(card.y)
        springStep(card.scale)
      }
    }
  }

  for (let i = 0; i < st.cards.length; i += 1) {
    const card = st.cards[i]!
    if (st.drag != null && card.id === st.drag.cardId) {
      stillAnimating = true
      continue
    }
    if (springMostlyDone(card.x)) springSnap(card.x)
    else stillAnimating = true
    if (springMostlyDone(card.y)) springSnap(card.y)
    else stillAnimating = true
    if (springMostlyDone(card.scale)) springSnap(card.scale)
    else stillAnimating = true
  }

  if (st.drag == null && st.lastDraggedId != null) {
    const lastDraggedCard = st.cards[st.lastDraggedId]!
    if (
      springMostlyDone(lastDraggedCard.x) &&
      springMostlyDone(lastDraggedCard.y) &&
      springMostlyDone(lastDraggedCard.scale)
    ) {
      st.lastDraggedId = null
    } else {
      stillAnimating = true
    }
  }

  st.animatedUntilTime = stillAnimating ? st.animatedUntilTime ?? now : null

  const cursor = st.drag != null ? 'grabbing' : st.hoveredCardId != null ? 'grab' : 'auto'
  document.body.style.cursor = cursor

  for (let i = 0; i < st.cards.length; i += 1) {
    const card = st.cards[i]!
    const node = domCache.cards[card.id]!
    const isDragged = st.drag?.cardId === card.id
    const isLastDragged = st.drag == null && st.lastDraggedId === card.id
    node.style.height = `${card.height}px`
    node.style.transform = `translate(${card.x.pos}px, ${card.y.pos}px) scale(${card.scale.pos})`
    node.style.opacity = isDragged ? '0.7' : '1'
    node.style.zIndex = String(cardZIndex(card.id))
    node.style.boxShadow = isDragged || isLastDragged
      ? '0 28px 55px rgb(13 49 122 / 0.32)'
      : '0 9px 18px rgb(10 32 86 / 0.17)'
    node.style.background = `linear-gradient(180deg, hsl(210 72% ${Math.min(card.lightnessBase + 9, 88)}%), hsl(214 70% ${card.lightnessBase}%))`
    node.style.borderColor = `hsl(214 78% ${Math.max(card.lightnessBase - 12, 20)}%)`
  }

  st.events.pointerDown = null
  st.events.pointerMove = null
  st.events.pointerUp = null
  st.events.hoverMove = null
  st.events.clearHover = false

  return stillAnimating
}

function currentLayoutsById() {
  const layouts = new Array<{ id: number; y: number; height: number }>(st.cards.length)
  for (let i = 0; i < st.cards.length; i += 1) {
    const card = st.cards[i]!
    layouts[card.id] = {
      id: card.id,
      y: card.y.pos,
      height: card.height,
    }
  }
  return layouts
}

function cardZIndex(cardId: number) {
  if (st.drag?.cardId === cardId) return 300
  if (st.drag == null && st.lastDraggedId === cardId) return 200
  return 10 + st.order.indexOf(cardId)
}

function hitTestCard(x: number, y: number) {
  let bestId: number | null = null
  let bestZIndex = -Infinity
  for (let i = 0; i < st.cards.length; i += 1) {
    const card = st.cards[i]!
    const rect = getVisualRect(card)
    if (x < rect.x || x > rect.x + rect.width || y < rect.y || y > rect.y + rect.height) continue
    const zIndex = cardZIndex(card.id)
    if (zIndex > bestZIndex) {
      bestZIndex = zIndex
      bestId = card.id
    }
  }
  return bestId
}

function getVisualRect(card: CardState) {
  const width = CARD_WIDTH * card.scale.pos
  const height = card.height * card.scale.pos
  return {
    x: card.x.pos - (width - CARD_WIDTH) / 2,
    y: card.y.pos - (height - card.height) / 2,
    width,
    height,
  }
}

function readAutomationContext(): AutomationContext | null {
  const search = new URLSearchParams(window.location.search)
  if (search.get('report') !== '1') return null
  const requestId = search.get('requestId')
  const scenario = search.get('scenario')
  if (requestId == null || scenario == null) return null
  return { requestId, scenario }
}

function publishPhase(report: BrowserReport) {
  const encoded = encodeURIComponent(JSON.stringify(report))
  window.location.hash = new URLSearchParams({ report: encoded }).toString()
  if (semanticReportNode != null) {
    semanticReportNode.textContent = JSON.stringify(report)
    semanticReportNode.setAttribute('data-report', encoded)
  }
}

function collectCardSummaries() {
  const summaries: Array<{ id: number; x: number; y: number; zIndex: number }> = []
  for (let i = 0; i < st.cards.length; i += 1) {
    const node = domCache.cards[i]!
    const rect = node.getBoundingClientRect()
    summaries.push({
      id: i,
      x: Math.round(rect.left * 100) / 100,
      y: Math.round(rect.top * 100) / 100,
      zIndex: Number(window.getComputedStyle(node).zIndex),
    })
  }
  return summaries
}

async function runAutomationScenario(context: AutomationContext) {
  try {
    publishPhase({ status: 'ready', requestId: context.requestId, scenario: context.scenario, phase: 'running' })
    await waitForFrames(2)

    switch (context.scenario) {
      case 'swap-down':
        await runSwapDownScenario(context)
        return
      case 'release-depth':
        await runReleaseDepthScenario(context)
        return
      default:
        throw new Error(`Unknown scenario: ${context.scenario}`)
    }
  } catch (error) {
    publishPhase({
      status: 'error',
      requestId: context.requestId,
      scenario: context.scenario,
      phase: 'error',
      message: error instanceof Error ? error.message : String(error),
    })
  }
}

async function runSwapDownScenario(context: AutomationContext) {
  const card = st.cards[1]!
  const centerX = card.x.pos + CARD_WIDTH / 2
  const startY = card.y.pos + card.height / 2
  const targetY = st.cards[2]!.y.pos + st.cards[2]!.height * 0.8
  let time = performance.now()

  queuePointerDown({ x: centerX, y: startY, time })
  await waitForFrames(1)

  for (let i = 1; i <= 6; i += 1) {
    time += 24
    const y = startY + ((targetY - startY) * i) / 6
    queuePointerMove({ x: centerX, y, time })
    await waitForFrames(1)
  }

  time += 18
  queuePointerUp({ x: centerX, y: targetY + 18, time })
  await waitUntil(() => st.lastDraggedId == null, 4000)

  publishPhase({
    status: 'ready',
    requestId: context.requestId,
    scenario: context.scenario,
    phase: 'ready',
    orderedCardIds: st.order.slice(),
    draggedId: st.drag?.cardId ?? null,
    lastDraggedId: st.lastDraggedId,
    cursor: document.body.style.cursor,
    swapTriggered: st.sawSwapDuringDrag,
    cardSummaries: collectCardSummaries(),
  })
}

async function runReleaseDepthScenario(context: AutomationContext) {
  const card = st.cards[3]!
  const centerX = card.x.pos + CARD_WIDTH / 2
  const startY = card.y.pos + card.height / 2
  let time = performance.now()

  queuePointerDown({ x: centerX, y: startY, time })
  await waitForFrames(1)

  for (let i = 1; i <= 4; i += 1) {
    time += 20
    queuePointerMove({
      x: centerX - i * 26,
      y: startY - i * 22,
      time,
    })
    await waitForFrames(1)
  }

  time += 16
  queuePointerUp({ x: centerX - 120, y: startY - 96, time })
  await waitForFrames(1)

  let sawLastDragged = false
  let elevatedWhileSettling = true
  let frames = 0
  while (st.lastDraggedId != null && frames < 180) {
    sawLastDragged = true
    const summaries = collectCardSummaries()
    const topCard = summaries.reduce((best, entry) => (entry.zIndex > best.zIndex ? entry : best), summaries[0]!)
    if (topCard.id !== st.lastDraggedId) elevatedWhileSettling = false
    frames += 1
    await waitForFrames(1)
  }

  publishPhase({
    status: 'ready',
    requestId: context.requestId,
    scenario: context.scenario,
    phase: 'ready',
    elevatedWhileSettling: sawLastDragged && elevatedWhileSettling,
    clearedAfterSettle: st.lastDraggedId == null,
    draggedId: st.drag?.cardId ?? null,
    lastDraggedId: st.lastDraggedId,
    cardSummaries: collectCardSummaries(),
  })
}

async function waitForFrames(count: number) {
  for (let i = 0; i < count; i += 1) {
    await new Promise<void>((resolve) => {
      window.requestAnimationFrame(() => resolve())
    })
  }
}

async function waitUntil(condition: () => boolean, timeoutMs: number) {
  const startedAt = performance.now()
  while (!condition()) {
    if (performance.now() - startedAt > timeoutMs) {
      throw new Error('Timed out waiting for animation to settle')
    }
    await waitForFrames(1)
  }
}
