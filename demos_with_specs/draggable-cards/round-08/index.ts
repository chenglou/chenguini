import {
  cardHeightForIndex,
  cardLightnessForIndex,
  estimateReleaseVelocity,
  msPerAnimationStep,
  positionSpringDamping,
  positionSpringStiffness,
  reorderForPointer,
  rowSizeX,
  scaleSpringDamping,
  scaleSpringStiffness,
  spring,
  springGoToEnd,
  springMostlyDone,
  springStep,
  topPadding,
  type PointerSample,
  type Spring,
} from './model.ts'

type Card = {
  id: string
  label: string
  height: number
  lightness: number
  x: Spring
  y: Spring
  scale: Spring
  node: HTMLDivElement
}

type DragState = {
  cardId: string
  deltaX: number
  deltaY: number
  pointerX: number
  pointerY: number
  pointerSamples: PointerSample[]
}

type ScenarioName = 'swap-down' | 'release-depth'

type AutomationReport = {
  phase: 'loading' | 'running' | 'ready' | 'error'
  requestId: string
  scenario: string
  order: string[]
  cardPositions: { id: string; x: number; y: number }[]
  draggedId: string | null
  lastDraggedId: string | null
  cursor: string
  zOrder: string[]
  swapOccurred: boolean
  settlingTopId: string | null
  settlingLastDraggedId: string | null
  settleFrames: number
  finalLastDraggedId: string | null
  message?: string
}

type Automation = {
  reportEnabled: boolean
  requestId: string
  scenario: ScenarioName | null
  phase: 'idle' | 'preparing' | 'dragging' | 'released' | 'done'
  frame: number
  swapOccurred: boolean
  settlingTopId: string | null
  settlingLastDraggedId: string | null
  settleFrames: number
}

const app = document.querySelector<HTMLDivElement>('#app')

if (app == null) {
  throw new Error('Missing #app')
}

const search = new URLSearchParams(location.search)
const automation: Automation = {
  reportEnabled: search.get('report') === '1',
  requestId: search.get('requestId') ?? '',
  scenario: parseScenario(search.get('scenario')),
  phase: search.get('report') === '1' ? 'preparing' : 'idle',
  frame: 0,
  swapOccurred: false,
  settlingTopId: null,
  settlingLastDraggedId: null,
  settleFrames: 0,
}

const cards = createCards(app)
const cardsById = new Map(cards.map(card => [card.id, card]))
const heights = new Map(cards.map(card => [card.id, card.height]))

let order = cards.map(card => card.id)
let activeDrag: DragState | null = null
let lastDraggedId: string | null = null
let hoveredId: string | null = null
let cursor: 'auto' | 'grab' | 'grabbing' = 'auto'
let animatedUntilTime = performance.now()

layoutCards(true)
publishReport('loading')
render(performance.now())

for (const card of cards) {
  card.node.addEventListener('pointerdown', event => {
    if (event.button !== 0) {
      return
    }
    event.preventDefault()
    card.node.setPointerCapture?.(event.pointerId)
    beginDrag(card.id, event.pageX, event.pageY, event.timeStamp)
  })
}

window.addEventListener('pointermove', event => {
  if (activeDrag == null) {
    updateHover(event.pageX, event.pageY)
    return
  }
  event.preventDefault()
  updateDrag(event.pageX, event.pageY, event.timeStamp)
})

window.addEventListener('mousemove', event => {
  if (activeDrag == null) {
    updateHover(event.pageX, event.pageY)
  }
})

window.addEventListener(
  'touchmove',
  event => {
    const touch = event.touches[0]
    if (touch == null) {
      return
    }
    if (activeDrag != null) {
      event.preventDefault()
      updateDrag(touch.pageX, touch.pageY, event.timeStamp)
      return
    }
    updateHover(touch.pageX, touch.pageY)
  },
  { passive: false },
)

window.addEventListener('pointerup', event => {
  finishDrag(event.pageX, event.pageY, event.timeStamp)
})
window.addEventListener('pointercancel', event => {
  finishDrag(event.pageX, event.pageY, event.timeStamp)
})
window.addEventListener('mouseup', event => {
  finishDrag(event.pageX, event.pageY, event.timeStamp)
})
window.addEventListener('touchend', event => {
  const touch = event.changedTouches[0]
  finishDrag(touch?.pageX, touch?.pageY, event.timeStamp)
})
window.addEventListener('touchcancel', event => {
  const touch = event.changedTouches[0]
  finishDrag(touch?.pageX, touch?.pageY, event.timeStamp)
})

function parseScenario(value: string | null): ScenarioName | null {
  if (value === 'swap-down' || value === 'release-depth') {
    return value
  }
  return null
}

function createCards(container: HTMLDivElement) {
  const nextCards: Card[] = []
  for (let index = 0; index < 5; index++) {
    const height = cardHeightForIndex(index)
    const lightness = cardLightnessForIndex(index)
    const node = document.createElement('div')
    node.className = 'card'
    node.textContent = `Drag Me ${index}`
    node.style.height = `${height}px`
    node.style.background = `linear-gradient(180deg, hsl(210 78% ${lightness + 6}%), hsl(210 70% ${lightness}%))`
    node.style.border = `1px solid hsl(210 75% ${Math.max(25, lightness - 12)}%)`
    node.style.boxShadow = '0 8px 18px rgba(33, 54, 94, 0.14)'
    node.style.cursor = 'auto'
    container.appendChild(node)

    const initialX = getCenteredX()
    const initialY = topPadding + nextCards.reduce((sum, card) => sum + card.height, 0)
    nextCards.push({
      id: `card-${index}`,
      label: `Drag Me ${index}`,
      height,
      lightness,
      x: spring(initialX, initialX, 0, positionSpringStiffness, positionSpringDamping),
      y: spring(initialY, initialY, 0, positionSpringStiffness, positionSpringDamping),
      scale: spring(1, 1, 0, scaleSpringStiffness, scaleSpringDamping),
      node,
    })
  }
  return nextCards
}

function render(now: number) {
  automation.frame++
  runAutomation()
  layoutCards(false)
  stepSprings(now)
  writeCards()
  const phase = automation.reportEnabled ? (automation.phase === 'done' ? 'ready' : 'running') : 'ready'
  publishReport(phase)
  requestAnimationFrame(render)
}

function layoutCards(snap: boolean) {
  const centeredX = getCenteredX()
  let currentY = topPadding

  for (const id of order) {
    const card = cardsById.get(id)!
    const isDragged = activeDrag?.cardId === id
    if (isDragged) {
      const dragX = activeDrag!.pointerX - activeDrag!.deltaX
      const dragY = activeDrag!.pointerY - activeDrag!.deltaY
      const centeredDragX = dragX + (centeredX - dragX) / 1.5
      card.x.pos = centeredDragX
      card.x.dest = centeredDragX
      card.x.v = 0
      card.y.pos = dragY
      card.y.dest = dragY
      card.y.v = 0
      card.scale.dest = 1.1
    } else {
      card.x.dest = centeredX
      card.y.dest = currentY
      card.scale.dest = 1
      if (snap) {
        springGoToEnd(card.x)
        springGoToEnd(card.y)
        springGoToEnd(card.scale)
      }
      currentY += card.height
    }
  }
}

function stepSprings(now: number) {
  let steps = Math.floor((now - animatedUntilTime) / msPerAnimationStep)
  steps = Math.min(300, Math.max(1, steps))
  animatedUntilTime += steps * msPerAnimationStep

  for (let step = 0; step < steps; step++) {
    for (const card of cards) {
      if (activeDrag?.cardId !== card.id) {
        springStep(card.x)
        springStep(card.y)
      }
      springStep(card.scale)
      if (springMostlyDone(card.x)) {
        springGoToEnd(card.x)
      }
      if (springMostlyDone(card.y)) {
        springGoToEnd(card.y)
      }
      if (springMostlyDone(card.scale)) {
        springGoToEnd(card.scale)
      }
    }
  }

  if (lastDraggedId != null && activeDrag == null) {
    const lastDraggedCard = cardsById.get(lastDraggedId)!
    const settled =
      springMostlyDone(lastDraggedCard.x) &&
      springMostlyDone(lastDraggedCard.y) &&
      springMostlyDone(lastDraggedCard.scale)
    if (settled) {
      lastDraggedId = null
    }
  }
}

function writeCards() {
  const zOrder = getZOrder()
  const zIndexById = new Map(zOrder.map((id, index) => [id, 10 + index]))

  for (const card of cards) {
    const isDragged = activeDrag?.cardId === card.id
    const isReleased = lastDraggedId === card.id && activeDrag == null
    const scale = card.scale.pos
    card.node.style.transform = `translate3d(${card.x.pos}px, ${card.y.pos}px, 0) scale(${scale})`
    card.node.style.zIndex = `${zIndexById.get(card.id) ?? 1}`
    card.node.style.opacity = isDragged ? '0.7' : '1'
    card.node.style.boxShadow = isDragged || isReleased ? '0 26px 45px rgba(20, 36, 72, 0.34)' : '0 8px 18px rgba(33, 54, 94, 0.14)'
    card.node.style.cursor = cursorForCard(card.id)
  }

  document.body.style.cursor = cursor
}

function cursorForCard(cardId: string) {
  if (activeDrag?.cardId === cardId) {
    return 'grabbing'
  }
  if (hoveredId === cardId) {
    return 'grab'
  }
  return 'auto'
}

function beginDrag(cardId: string, pointerX: number, pointerY: number, time: number) {
  const card = cardsById.get(cardId)
  if (card == null) {
    return
  }
  activeDrag = {
    cardId,
    deltaX: pointerX - card.x.pos,
    deltaY: pointerY - card.y.pos,
    pointerX,
    pointerY,
    pointerSamples: [{ x: pointerX, y: pointerY, time }],
  }
  hoveredId = cardId
  cursor = 'grabbing'
}

function updateDrag(pointerX: number, pointerY: number, time: number) {
  if (activeDrag == null) {
    return
  }
  activeDrag.pointerX = pointerX
  activeDrag.pointerY = pointerY
  activeDrag.pointerSamples.push({ x: pointerX, y: pointerY, time })
  if (activeDrag.pointerSamples.length > 20) {
    activeDrag.pointerSamples.shift()
  }

  const reordered = reorderForPointer({
    order,
    draggedId: activeDrag.cardId,
    pointerY,
    topPadding,
    heights,
  })
  if (reordered.changed) {
    order = reordered.order
    automation.swapOccurred = true
  }
}

function finishDrag(pointerX: number | undefined, pointerY: number | undefined, time: number) {
  if (activeDrag == null) {
    return
  }

  if (pointerX != null && pointerY != null) {
    updateDrag(pointerX, pointerY, time)
  }

  const card = cardsById.get(activeDrag.cardId)!
  const velocity = estimateReleaseVelocity(activeDrag.pointerSamples)
  card.x.v += velocity.x
  card.y.v += velocity.y
  card.scale.dest = 1

  lastDraggedId = activeDrag.cardId
  activeDrag = null
  cursor = hoveredId != null ? 'grab' : 'auto'
}

function updateHover(pointerX: number, pointerY: number) {
  hoveredId = hitTestCard(pointerX, pointerY)
  cursor = hoveredId != null ? 'grab' : 'auto'
}

function hitTestCard(pointerX: number, pointerY: number) {
  const orderedIds = getZOrder().slice().reverse()
  for (const id of orderedIds) {
    const card = cardsById.get(id)!
    if (
      pointerX >= card.x.pos &&
      pointerX <= card.x.pos + rowSizeX &&
      pointerY >= card.y.pos &&
      pointerY <= card.y.pos + card.height
    ) {
      return id
    }
  }
  return null
}

function getZOrder() {
  const base = order.slice()
  if (lastDraggedId != null && activeDrag == null) {
    return [...base.filter(id => id !== lastDraggedId), lastDraggedId]
  }
  if (activeDrag != null) {
    return [...base.filter(id => id !== activeDrag.cardId), activeDrag.cardId]
  }
  return base
}

function getCenteredX() {
  return (document.documentElement.clientWidth - rowSizeX) / 2
}

function publishReport(phase: AutomationReport['phase']) {
  if (!automation.reportEnabled) {
    return
  }

  const report: AutomationReport = {
    phase,
    requestId: automation.requestId,
    scenario: automation.scenario ?? '',
    order: order.slice(),
    cardPositions: order.map(id => {
      const card = cardsById.get(id)!
      return {
        id,
        x: round2(card.x.pos),
        y: round2(card.y.pos),
      }
    }),
    draggedId: activeDrag?.cardId ?? null,
    lastDraggedId,
    cursor,
    zOrder: getZOrder(),
    swapOccurred: automation.swapOccurred,
    settlingTopId: automation.settlingTopId,
    settlingLastDraggedId: automation.settlingLastDraggedId,
    settleFrames: automation.settleFrames,
    finalLastDraggedId: automation.phase === 'done' ? lastDraggedId : null,
  }

  location.hash = `report=${encodeURIComponent(JSON.stringify(report))}`
}

function publishError(message: string) {
  if (!automation.reportEnabled) {
    throw new Error(message)
  }

  const report = {
    phase: 'error',
    requestId: automation.requestId,
    scenario: automation.scenario ?? '',
    order: order.slice(),
    cardPositions: order.map(id => {
      const card = cardsById.get(id)!
      return { id, x: round2(card.x.pos), y: round2(card.y.pos) }
    }),
    draggedId: activeDrag?.cardId ?? null,
    lastDraggedId,
    cursor,
    zOrder: getZOrder(),
    swapOccurred: automation.swapOccurred,
    settlingTopId: automation.settlingTopId,
    settlingLastDraggedId: automation.settlingLastDraggedId,
    settleFrames: automation.settleFrames,
    finalLastDraggedId: lastDraggedId,
    message,
  }
  location.hash = `report=${encodeURIComponent(JSON.stringify(report))}`
}

function runAutomation() {
  if (!automation.reportEnabled || automation.scenario == null || automation.phase === 'done') {
    return
  }

  try {
    if (automation.phase === 'preparing') {
      if (automation.frame < 2) {
        return
      }
      if (automation.scenario === 'swap-down') {
        const card = cardsById.get('card-1')!
        beginDrag('card-1', card.x.pos + rowSizeX / 2, card.y.pos + card.height / 2, performance.now())
      } else {
        const card = cardsById.get('card-2')!
        beginDrag('card-2', card.x.pos + rowSizeX / 2, card.y.pos + card.height / 2, performance.now())
      }
      automation.phase = 'dragging'
      return
    }

    if (automation.phase === 'dragging') {
      if (activeDrag == null) {
        publishError('Automation lost the active drag')
        automation.phase = 'done'
        return
      }

      const progress = Math.min(1, automation.scenario === 'swap-down' ? (automation.frame - 2) / 18 : (automation.frame - 2) / 10)
      const startX = getCenteredX() + rowSizeX / 2
      const startY = activeDrag.pointerSamples[0]!.y
      const targetY = automation.scenario === 'swap-down' ? getCardTargetY('card-4') - 40 : getCardTargetY('card-4') - 90
      const targetX = startX + (automation.scenario === 'release-depth' ? 60 : 0)
      updateDrag(startX + (targetX - startX) * progress, startY + (targetY - startY) * progress, performance.now())

      const finished = automation.scenario === 'swap-down' ? progress >= 1 : progress >= 1
      if (finished) {
        finishDrag(targetX, targetY, performance.now())
        automation.phase = 'released'
      }
      return
    }

    if (automation.phase === 'released') {
      if (lastDraggedId != null) {
        automation.settleFrames++
        if (automation.settlingTopId == null) {
          automation.settlingTopId = getZOrder()[getZOrder().length - 1] ?? null
          automation.settlingLastDraggedId = lastDraggedId
        }
        return
      }
      hoveredId = null
      cursor = 'auto'
      automation.phase = 'done'
      publishReport('ready')
    }
  } catch (error) {
    automation.phase = 'done'
    publishError(error instanceof Error ? error.message : String(error))
  }
}

function getCardTargetY(id: string) {
  let y = topPadding
  for (const currentId of order) {
    if (currentId === id) {
      return y
    }
    y += cardsById.get(currentId)!.height
  }
  return y
}

function round2(value: number) {
  return Math.round(value * 100) / 100
}
