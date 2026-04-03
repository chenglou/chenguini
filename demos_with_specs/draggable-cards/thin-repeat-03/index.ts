import {
  buildCards,
  CARD_WIDTH,
  getReleaseVelocity,
  reorderByMidpoint,
  TOP_PADDING,
  type CardId,
  type PointerHistorySample,
} from './drag-physics'

type Report = {
  phase: 'loading' | 'running' | 'ready' | 'error'
  requestId: string
  scenario: string
  orderedCardIds?: CardId[]
  reorderedBeforeRelease?: boolean
  releasedCardId?: CardId | null
  releasedCardStayedOnTop?: boolean
  topCardIdsDuringSettle?: CardId[]
  message?: string
}

type DragState = {
  id: CardId
  pointerId: number
  deltaX: number
  deltaY: number
  pointerX: number
  pointerY: number
  history: PointerHistorySample[]
}

type SettlingState = {
  id: CardId
  x: number
  y: number
  velocityY: number
  topCardIdsDuringSettle: CardId[]
  sawOverlap: boolean
}

type SettleResult = {
  orderedCardIds: CardId[]
  reorderedBeforeRelease: boolean
  releasedCardId: CardId
  releasedCardStayedOnTop: boolean
  topCardIdsDuringSettle: CardId[]
}

const cards = buildCards(5)
const heightsById = Object.fromEntries(cards.map((card) => [card.id, card.sizeY])) as Record<CardId, number>
const app = document.querySelector<HTMLDivElement>('#app')

if (app === null) {
  throw new Error('Missing app root.')
}

const shell = document.createElement('main')
shell.className = 'shell'
const intro = document.createElement('section')
intro.className = 'intro'
intro.innerHTML = `
  <p class="eyebrow">Thin Repeat 03</p>
  <h1>Drag straight away. The stack flips as soon as a center crosses a midpoint.</h1>
  <p>Grab any card, reorder it live, then let the release carry a little momentum before it settles back into the pile.</p>
`
const stack = document.createElement('div')
stack.className = 'stack'
shell.append(intro, stack)
app.append(shell)

const order: CardId[] = cards.map((card) => card.id)
const cardElements = new Map<CardId, HTMLElement>()
const positions = new Map<CardId, { x: number; y: number }>()
const settleWaiters: Array<(result: SettleResult) => void> = []

let activeDrag: DragState | null = null
let settling: SettlingState | null = null
let reorderedBeforeRelease = false
let lastSettleResult: SettleResult | null = null
let lastFrameTime = performance.now()

for (const card of cards) {
  const cardElement = document.createElement('article')
  cardElement.className = 'card'
  cardElement.dataset.cardId = card.id
  cardElement.style.height = `${card.sizeY}px`
  cardElement.style.setProperty('--card-lightness', `${card.lightnessBase}%`)
  cardElement.innerHTML = `
    <p class="card-label">${card.label}</p>
    <h2>${Math.round(card.sizeY)}px of warm stack space.</h2>
    <p>Immediate drag start, midpoint reorder, and a release that keeps the moved card above the rest while it settles.</p>
    <p class="card-note">Lightness ${Math.round(card.lightnessBase)}</p>
  `
  cardElement.addEventListener('pointerdown', (event) => {
    event.preventDefault()
    startDrag(card.id, event.pointerId, event.clientX, event.clientY, event.timeStamp)
  })
  stack.append(cardElement)
  cardElements.set(card.id, cardElement)
}

function getCenteredX() {
  const rowSizeX = CARD_WIDTH
  const windowWidth = window.innerWidth
  return (windowWidth - rowSizeX) / 2
}

function getTotalHeight() {
  return TOP_PADDING * 2 + cards.reduce((sum, card) => sum + card.sizeY, 0)
}

function getTargetTopMap(currentOrder: CardId[]) {
  const tops = new Map<CardId, number>()
  let nextTop = TOP_PADDING

  for (const id of currentOrder) {
    tops.set(id, nextTop)
    nextTop += heightsById[id]
  }

  return tops
}

function sameOrder(left: CardId[], right: CardId[]) {
  return left.length === right.length && left.every((id, index) => id === right[index])
}

function getDragPresentation(drag: DragState) {
  const rawX = drag.pointerX - drag.deltaX
  const centeredX = getCenteredX()
  return {
    x: rawX + (centeredX - rawX) / 1.5,
    y: drag.pointerY - drag.deltaY,
  }
}

function pushHistorySample(history: PointerHistorySample[], sample: PointerHistorySample) {
  history.push(sample)
  const recentWindowStart = sample.time - 100

  while (history.length > 1 && history[0]!.time < recentWindowStart) {
    history.shift()
  }
}

function snapCurrentSettleIntoLayout() {
  if (settling === null) {
    return
  }

  const targetTop = getTargetTopMap(order).get(settling.id)
  const position = positions.get(settling.id)
  if (targetTop !== undefined && position !== undefined) {
    position.x = getCenteredX()
    position.y = targetTop
  }

  settling = null
}

function startDrag(id: CardId, pointerId: number, pointerX: number, pointerY: number, sampleTime: number) {
  const element = cardElements.get(id)
  if (element === undefined) {
    return
  }

  snapCurrentSettleIntoLayout()
  lastSettleResult = null
  reorderedBeforeRelease = false

  const rect = element.getBoundingClientRect()
  activeDrag = {
    id,
    pointerId,
    deltaX: pointerX - rect.left,
    deltaY: pointerY - rect.top,
    pointerX,
    pointerY,
    history: [{ time: sampleTime, y: pointerY }],
  }
}

function moveDrag(pointerId: number, pointerX: number, pointerY: number, sampleTime: number) {
  if (activeDrag === null || activeDrag.pointerId !== pointerId) {
    return
  }

  activeDrag.pointerX = pointerX
  activeDrag.pointerY = pointerY
  pushHistorySample(activeDrag.history, { time: sampleTime, y: pointerY })

  const nextOrder = reorderByMidpoint(order, heightsById, activeDrag.id, pointerY - activeDrag.deltaY, TOP_PADDING)
  if (!sameOrder(order, nextOrder)) {
    order.splice(0, order.length, ...nextOrder)
    reorderedBeforeRelease = true
  }
}

function waitForNextSettleResult() {
  if (lastSettleResult !== null && settling === null) {
    return Promise.resolve(lastSettleResult)
  }

  return new Promise<SettleResult>((resolve) => {
    settleWaiters.push(resolve)
  })
}

function endDrag(pointerId: number, pointerX: number, pointerY: number, sampleTime: number) {
  if (activeDrag === null || activeDrag.pointerId !== pointerId) {
    return
  }

  moveDrag(pointerId, pointerX, pointerY, sampleTime)
  const releasedDrag = activeDrag
  const presentation = getDragPresentation(releasedDrag)
  const velocityY = Math.max(-2.2, Math.min(2.2, getReleaseVelocity(releasedDrag.history, sampleTime)))

  settling = {
    id: releasedDrag.id,
    x: presentation.x,
    y: presentation.y,
    velocityY,
    topCardIdsDuringSettle: [],
    sawOverlap: false,
  }
  activeDrag = null
}

function nudge(current: number, target: number, dt: number) {
  const factor = Math.min(1, 0.22 * (dt / 16.6667))
  return current + (target - current) * factor
}

function render() {
  stack.style.height = `${getTotalHeight()}px`

  for (const [index, id] of order.entries()) {
    const element = cardElements.get(id)
    const position = positions.get(id)
    if (element === undefined || position === undefined) {
      continue
    }

    const isActive = activeDrag?.id === id
    const isSettling = settling?.id === id
    element.dataset.active = String(isActive)
    element.style.zIndex = isActive ? '30' : isSettling ? '25' : String(index + 1)
    element.style.transform = `translate3d(${position.x}px, ${position.y}px, 0)`
  }
}

function sampleTopCardInOverlap(releasedCardId: CardId) {
  if (settling === null) {
    return
  }

  const releasedElement = cardElements.get(releasedCardId)
  if (releasedElement === undefined) {
    return
  }

  const releasedRect = releasedElement.getBoundingClientRect()

  for (const card of cards) {
    if (card.id === releasedCardId) {
      continue
    }

    const otherElement = cardElements.get(card.id)
    if (otherElement === undefined) {
      continue
    }

    const otherRect = otherElement.getBoundingClientRect()
    const left = Math.max(releasedRect.left, otherRect.left)
    const top = Math.max(releasedRect.top, otherRect.top)
    const right = Math.min(releasedRect.right, otherRect.right)
    const bottom = Math.min(releasedRect.bottom, otherRect.bottom)
    if (right - left < 4 || bottom - top < 4) {
      continue
    }

    const sampleX = (left + right) / 2
    const sampleY = (top + bottom) / 2
    const topElement = document.elementFromPoint(sampleX, sampleY)?.closest('[data-card-id]') as HTMLElement | null
    const topCardId = topElement?.dataset.cardId as CardId | undefined
    if (topCardId !== undefined) {
      settling.sawOverlap = true
      settling.topCardIdsDuringSettle.push(topCardId)
    }
    return
  }
}

function finishSettling() {
  if (settling === null) {
    return
  }

  const currentSettling = settling
  const targetTop = getTargetTopMap(order).get(currentSettling.id)
  const position = positions.get(currentSettling.id)
  if (targetTop !== undefined && position !== undefined) {
    position.x = getCenteredX()
    position.y = targetTop
  }

  const result: SettleResult = {
    orderedCardIds: [...order],
    reorderedBeforeRelease,
    releasedCardId: currentSettling.id,
    releasedCardStayedOnTop:
      currentSettling.sawOverlap &&
      currentSettling.topCardIdsDuringSettle.every((topCardId) => topCardId === currentSettling.id),
    topCardIdsDuringSettle: [...currentSettling.topCardIdsDuringSettle],
  }

  settling = null
  lastSettleResult = result

  for (const resolve of settleWaiters.splice(0)) {
    resolve(result)
  }
}

function tick(now: number) {
  const dt = Math.min(32, Math.max(8, now - lastFrameTime || 16.6667))
  lastFrameTime = now
  const targetTops = getTargetTopMap(order)
  const centeredX = getCenteredX()
  let shouldFinishSettling = false

  for (const card of cards) {
    const position = positions.get(card.id)
    if (position === undefined) {
      continue
    }

    if (activeDrag?.id === card.id) {
      const dragPresentation = getDragPresentation(activeDrag)
      position.x = dragPresentation.x
      position.y = dragPresentation.y
      continue
    }

    if (settling?.id === card.id) {
      const targetTop = targetTops.get(card.id)
      if (targetTop === undefined) {
        continue
      }

      settling.velocityY += (targetTop - settling.y) * 0.0031 * dt
      settling.velocityY *= Math.pow(0.92, dt / 16.6667)
      settling.y += settling.velocityY * dt
      settling.x = nudge(settling.x, centeredX, dt)
      position.x = settling.x
      position.y = settling.y

      shouldFinishSettling =
        Math.abs(targetTop - settling.y) < 0.5 &&
        Math.abs(centeredX - settling.x) < 0.5 &&
        Math.abs(settling.velocityY) < 0.03
      continue
    }

    const targetTop = targetTops.get(card.id)
    if (targetTop === undefined) {
      continue
    }

    position.x = nudge(position.x, centeredX, dt)
    position.y = nudge(position.y, targetTop, dt)
  }

  render()

  if (settling !== null) {
    sampleTopCardInOverlap(settling.id)
    if (shouldFinishSettling) {
      finishSettling()
    }
  }

  requestAnimationFrame(tick)
}

window.addEventListener('pointermove', (event) => {
  moveDrag(event.pointerId, event.clientX, event.clientY, event.timeStamp)
})

window.addEventListener('pointerup', (event) => {
  endDrag(event.pointerId, event.clientX, event.clientY, event.timeStamp)
})

window.addEventListener('pointercancel', (event) => {
  endDrag(event.pointerId, event.clientX, event.clientY, event.timeStamp)
})

const initialTops = getTargetTopMap(order)
for (const id of order) {
  positions.set(id, {
    x: getCenteredX(),
    y: initialTops.get(id) ?? TOP_PADDING,
  })
}

render()
requestAnimationFrame(tick)

const params = new URLSearchParams(location.search)
const scenario = params.get('scenario') ?? ''
const requestId = params.get('requestId') ?? ''

function publishReport(report: Report) {
  location.hash = `report=${encodeURIComponent(JSON.stringify(report))}`
}

function waitForFrames(frameCount: number) {
  let remainingFrames = frameCount

  return new Promise<void>((resolve) => {
    function step() {
      if (remainingFrames <= 0) {
        resolve()
        return
      }

      remainingFrames -= 1
      requestAnimationFrame(step)
    }

    requestAnimationFrame(step)
  })
}

function getCardCenter(cardId: CardId) {
  const element = cardElements.get(cardId)
  if (element === undefined) {
    throw new Error(`Missing card element for ${cardId}.`)
  }

  const rect = element.getBoundingClientRect()
  return {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
  }
}

async function runReleaseTopLayerScenario() {
  const releasedCardId = 'card-2'
  const start = getCardCenter(releasedCardId)
  const targetTops = getTargetTopMap(order)
  const card4Midpoint = (targetTops.get('card-4') ?? 0) + heightsById['card-4'] / 2
  const endX = start.x + 90
  const endY = card4Midpoint + 42
  const steps = [
    { dt: 32, progress: 0.14 },
    { dt: 32, progress: 0.32 },
    { dt: 24, progress: 0.56 },
    { dt: 16, progress: 0.8 },
    { dt: 16, progress: 1 },
  ]

  let sampleTime = performance.now()
  startDrag(releasedCardId, 1, start.x, start.y, sampleTime)

  for (const step of steps) {
    sampleTime += step.dt
    moveDrag(
      1,
      start.x + (endX - start.x) * step.progress,
      start.y + (endY - start.y) * step.progress,
      sampleTime,
    )
    await waitForFrames(1)
  }

  sampleTime += 16
  endDrag(1, endX, endY, sampleTime)
  return waitForNextSettleResult()
}

async function runScenario() {
  publishReport({ phase: 'loading', requestId, scenario })

  try {
    publishReport({ phase: 'running', requestId, scenario })

    if (scenario !== 'release-top-layer') {
      throw new Error(`Unknown scenario "${scenario}".`)
    }

    await waitForFrames(2)
    const result = await runReleaseTopLayerScenario()
    publishReport({
      phase: 'ready',
      requestId,
      scenario,
      orderedCardIds: result.orderedCardIds,
      reorderedBeforeRelease: result.reorderedBeforeRelease,
      releasedCardId: result.releasedCardId,
      releasedCardStayedOnTop: result.releasedCardStayedOnTop,
      topCardIdsDuringSettle: result.topCardIdsDuringSettle,
    })
  } catch (error) {
    publishReport({
      phase: 'error',
      requestId,
      scenario,
      message: error instanceof Error ? error.message : String(error),
    })
  }
}

if (scenario !== '' && requestId !== '') {
  void runScenario()
}
