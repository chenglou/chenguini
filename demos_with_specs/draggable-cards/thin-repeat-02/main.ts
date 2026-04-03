import {
  buildStackMetrics,
  CARD_WIDTH,
  createCards,
  estimateReleaseVelocity,
  getCenteredX,
  getDraggedX,
  getReorderIndex,
  moveItem,
  type Card,
  type PointerSample,
  type Velocity,
} from './drag-demo'

type Report = {
  phase: 'loading' | 'running' | 'ready' | 'error'
  requestId: string
  scenario: string
  initialOrder?: string[]
  orderedCardIdsAtRelease?: string[]
  reorderedDuringDrag?: boolean
  releasedCardId?: string | null
  topCardIdDuringSettle?: string | null
  topCardStayedReleasedDuringSettle?: boolean
  releaseVelocityY?: number
  message?: string
}

type VisualState = {
  x: number
  y: number
}

type DragState = {
  cardId: string
  pointerId: number
  deltaX: number
  deltaY: number
  x: number
  y: number
  history: PointerSample[]
}

type ReleaseState = {
  cardId: string
  x: number
  y: number
  vx: number
  vy: number
  lastFrameMs: number
}

const cards = createCards()
const cardById = new Map(cards.map((card) => [card.id, card]))
const app = document.querySelector<HTMLElement>('#app')

if (app === null) {
  throw new Error('Expected #app root')
}

document.body.style.margin = '0'
document.body.style.minHeight = '100vh'
document.body.style.background =
  'radial-gradient(circle at top, hsl(30 90% 95%), hsl(27 42% 88%) 38%, hsl(25 45% 82%))'
document.body.style.fontFamily = '"Avenir Next", "Segoe UI", sans-serif'
document.body.style.color = 'hsl(22 35% 18%)'

const stage = document.createElement('div')
stage.style.position = 'relative'
stage.style.minHeight = '100vh'
stage.style.padding = '0 24px 72px'
stage.style.boxSizing = 'border-box'

const heading = document.createElement('div')
heading.style.width = 'min(640px, calc(100vw - 48px))'
heading.style.margin = '24px auto 0'
heading.innerHTML = `
  <p style="margin:0 0 8px;font-size:12px;letter-spacing:0.12em;text-transform:uppercase;opacity:0.7;">Thin Repeat 02</p>
  <h1 style="margin:0;font-size:clamp(30px, 6vw, 52px);line-height:0.95;font-weight:700;">Immediate drag. Midpoint reorder. One card that keeps the spotlight until it settles.</h1>
`

stage.append(heading)

const stackRoot = document.createElement('div')
stackRoot.style.position = 'relative'
stackRoot.style.margin = '0 auto'
stackRoot.style.width = `${CARD_WIDTH}px`

stage.append(stackRoot)
app.append(stage)

const cardElements = new Map<string, HTMLDivElement>()
let order = cards.map((card) => card.id)
let drag: DragState | null = null
let release: ReleaseState | null = null
let animationFrame = 0
let isScenarioRunning = false

const visuals = new Map<string, VisualState>()
for (const positionedCard of buildStackMetrics(order, cards)) {
  visuals.set(positionedCard.id, {
    x: getCenteredX(window.innerWidth),
    y: positionedCard.top,
  })
}

for (const card of cards) {
  const element = document.createElement('article')
  element.dataset.cardId = card.id
  element.style.position = 'absolute'
  element.style.left = '0'
  element.style.top = '0'
  element.style.width = `${CARD_WIDTH}px`
  element.style.height = `${card.sizeY}px`
  element.style.boxSizing = 'border-box'
  element.style.padding = '22px'
  element.style.borderRadius = '24px'
  element.style.border = '1px solid hsl(24 30% 32% / 0.14)'
  element.style.background = `linear-gradient(135deg, hsl(22 70% ${Math.min(card.lightnessBase + 14, 95)}%), hsl(18 74% ${card.lightnessBase}%))`
  element.style.boxShadow = '0 14px 35px hsl(20 40% 22% / 0.12)'
  element.style.touchAction = 'none'
  element.style.userSelect = 'none'
  element.style.cursor = 'grab'
  element.style.willChange = 'transform'
  element.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;height:100%;">
      <div>
        <div style="font-size:12px;letter-spacing:0.12em;text-transform:uppercase;opacity:0.6;">${card.id}</div>
        <div style="margin-top:12px;font-size:28px;line-height:1;font-weight:700;">${card.label}</div>
      </div>
      <div style="font-size:12px;letter-spacing:0.08em;text-transform:uppercase;opacity:0.7;">${Math.round(card.sizeY)}px</div>
    </div>
  `
  element.addEventListener('pointerdown', (event) => {
    if (isScenarioRunning) return
    beginDrag(card.id, event.pointerId, event.clientX, event.clientY, event.timeStamp)
    element.setPointerCapture(event.pointerId)
  })
  element.addEventListener('pointermove', (event) => {
    if (drag?.pointerId !== event.pointerId) return
    updateDrag(event.pointerId, event.clientX, event.clientY, event.timeStamp)
  })
  element.addEventListener('pointerup', (event) => {
    if (drag?.pointerId !== event.pointerId) return
    endDrag(event.pointerId, event.timeStamp)
    if (element.hasPointerCapture(event.pointerId)) {
      element.releasePointerCapture(event.pointerId)
    }
  })
  element.addEventListener('pointercancel', (event) => {
    if (drag?.pointerId !== event.pointerId) return
    endDrag(event.pointerId, event.timeStamp)
    if (element.hasPointerCapture(event.pointerId)) {
      element.releasePointerCapture(event.pointerId)
    }
  })
  stackRoot.append(element)
  cardElements.set(card.id, element)
}

window.addEventListener('resize', () => {
  ensureAnimation()
})

render()

const params = new URLSearchParams(window.location.search)
const scenario = params.get('scenario') ?? ''
const requestId = params.get('requestId') ?? ''

if (scenario && requestId) {
  publishReport({phase: 'loading', requestId, scenario})
  void runScenario(scenario, requestId)
}

function beginDrag(cardId: string, pointerId: number, clientX: number, clientY: number, timeMs: number) {
  const visual = visuals.get(cardId)
  if (visual === undefined) {
    throw new Error(`Missing visual state for ${cardId}`)
  }

  release = release?.cardId === cardId ? null : release
  drag = {
    cardId,
    pointerId,
    deltaX: clientX - visual.x,
    deltaY: clientY - visual.y,
    x: visual.x,
    y: visual.y,
    history: [{timeMs, x: clientX, y: clientY}],
  }
  ensureAnimation()
}

function updateDrag(pointerId: number, clientX: number, clientY: number, timeMs: number) {
  if (drag === null || drag.pointerId !== pointerId) return

  drag.history.push({timeMs, x: clientX, y: clientY})
  drag.history = drag.history.filter((sample) => timeMs - sample.timeMs <= 140)
  drag.x = getDraggedX(clientX, drag.deltaX, window.innerWidth)
  drag.y = clientY - drag.deltaY

  const currentIndex = order.indexOf(drag.cardId)
  const targetIndex = getReorderIndex(order, cards, drag.cardId, drag.y)

  if (currentIndex !== -1 && targetIndex !== currentIndex) {
    order = moveItem(order, currentIndex, targetIndex)
  }

  ensureAnimation()
}

function endDrag(pointerId: number, timeMs: number): Velocity {
  if (drag === null || drag.pointerId !== pointerId) {
    return {x: 0, y: 0}
  }

  drag.history.push({
    timeMs,
    x: drag.x + drag.deltaX,
    y: drag.y + drag.deltaY,
  })

  const velocity = estimateReleaseVelocity(drag.history)
  release = {
    cardId: drag.cardId,
    x: drag.x,
    y: drag.y,
    vx: velocity.x * 1000,
    vy: velocity.y * 1000,
    lastFrameMs: performance.now(),
  }
  drag = null
  ensureAnimation()
  return velocity
}

function ensureAnimation() {
  if (animationFrame !== 0) return
  animationFrame = window.requestAnimationFrame(step)
}

function step(now: number) {
  animationFrame = 0

  const centeredX = getCenteredX(window.innerWidth)
  const layout = buildStackMetrics(order, cards)
  const slotById = new Map(layout.map((card) => [card.id, card.top]))
  let isStillAnimating = false

  for (const card of cards) {
    const visual = visuals.get(card.id)
    if (visual === undefined) continue

    if (drag?.cardId === card.id) {
      visual.x = drag.x
      visual.y = drag.y
      isStillAnimating = true
      continue
    }

    if (release?.cardId === card.id) {
      const deltaTimeSeconds = Math.min(0.034, Math.max(0.008, (now - release.lastFrameMs) / 1000))
      const targetX = centeredX
      const targetY = slotById.get(card.id) ?? release.y
      const springX = 54
      const springY = 64
      const damping = 12

      release.vx += ((targetX - release.x) * springX - release.vx * damping) * deltaTimeSeconds
      release.vy += ((targetY - release.y) * springY - release.vy * damping) * deltaTimeSeconds
      release.x += release.vx * deltaTimeSeconds
      release.y += release.vy * deltaTimeSeconds
      release.lastFrameMs = now

      visual.x = release.x
      visual.y = release.y

      const closeEnough =
        Math.abs(targetX - release.x) < 0.5 &&
        Math.abs(targetY - release.y) < 0.5 &&
        Math.abs(release.vx) < 8 &&
        Math.abs(release.vy) < 8

      if (closeEnough) {
        visual.x = targetX
        visual.y = targetY
        release = null
      } else {
        isStillAnimating = true
      }

      continue
    }

    const targetY = slotById.get(card.id)
    if (targetY === undefined) continue

    const nextX = lerp(visual.x, centeredX, 0.22)
    const nextY = lerp(visual.y, targetY, 0.22)
    if (Math.abs(nextX - centeredX) > 0.4 || Math.abs(nextY - targetY) > 0.4) {
      isStillAnimating = true
    }
    visual.x = Math.abs(nextX - centeredX) < 0.4 ? centeredX : nextX
    visual.y = Math.abs(nextY - targetY) < 0.4 ? targetY : nextY
  }

  render()

  if (isStillAnimating) {
    ensureAnimation()
  }
}

function render() {
  const layout = buildStackMetrics(order, cards)
  const lastCard = layout.at(-1)
  const stackHeight = lastCard === undefined ? 0 : lastCard.top + lastCard.sizeY + 64

  stackRoot.style.height = `${stackHeight}px`
  stackRoot.style.marginTop = '18px'
  stage.style.minHeight = `${Math.max(window.innerHeight, stackHeight + 140)}px`

  for (const cardId of order) {
    const card = cardById.get(cardId)
    const element = cardElements.get(cardId)
    const visual = visuals.get(cardId)
    if (card === undefined || element === undefined || visual === undefined) continue

    const isActive = drag?.cardId === cardId
    const isReleased = release?.cardId === cardId
    const layoutIndex = order.indexOf(cardId)
    const zIndex = isActive || isReleased ? 100 : layoutIndex + 1
    const scale = isActive ? 1.015 : 1
    const rotate = isActive ? 1.4 : isReleased ? 0.4 : 0

    element.style.transform = `translate3d(${visual.x}px, ${visual.y}px, 0) scale(${scale}) rotate(${rotate}deg)`
    element.style.zIndex = String(zIndex)
    element.style.cursor = isActive ? 'grabbing' : 'grab'
    element.style.boxShadow = isActive || isReleased ? '0 30px 70px hsl(20 40% 18% / 0.22)' : '0 14px 35px hsl(20 40% 22% / 0.12)'
    element.style.opacity = card.sizeY < 60 ? '0.96' : '1'
  }
}

function publishReport(report: Report) {
  window.location.hash = `report=${encodeURIComponent(JSON.stringify(report))}`
}

async function runScenario(scenario: string, requestId: string) {
  isScenarioRunning = true
  publishReport({phase: 'running', requestId, scenario})

  try {
    if (scenario !== 'midpoint-release') {
      throw new Error(`Unknown scenario "${scenario}"`)
    }

    await nextFrame()
    const initialOrder = [...order]
    const draggedId = initialOrder[1]
    const nextId = initialOrder[2]

    if (draggedId === undefined || nextId === undefined) {
      throw new Error('Expected at least three cards for the scenario')
    }

    const draggedMetrics = getCurrentStackCard(draggedId)
    const nextMetrics = getCurrentStackCard(nextId)
    const startX = getCenteredX(window.innerWidth) + CARD_WIDTH / 2
    const startY = draggedMetrics.top + draggedMetrics.sizeY / 2
    const crossTop = nextMetrics.midpointY - draggedMetrics.sizeY / 2 + 18

    beginDrag(draggedId, 1, startX, startY, performance.now())
    await wait(24)
    updateDrag(1, startX + 28, startY + 36, performance.now())
    await wait(36)
    updateDrag(1, startX + 56, crossTop + draggedMetrics.sizeY / 2, performance.now())
    await wait(32)
    updateDrag(1, startX + 72, crossTop + draggedMetrics.sizeY / 2 + 54, performance.now())
    await wait(24)

    const orderedCardIdsAtRelease = [...order]
    const reorderedDuringDrag = orderedCardIdsAtRelease.join(',') !== initialOrder.join(',')
    const velocity = endDrag(1, performance.now())
    const releasedCardId = draggedId

    let topCardIdDuringSettle: string | null = null
    let topCardStayedReleasedDuringSettle = true
    const deadline = performance.now() + 2_000

    while (release !== null) {
      if (performance.now() > deadline) {
        throw new Error('Release animation did not settle within 2 seconds')
      }

      await nextFrame()
      if (release === null) {
        break
      }
      const currentTopCardId = getTopLayerCardId()
      if (topCardIdDuringSettle === null) {
        topCardIdDuringSettle = currentTopCardId
      }
      if (currentTopCardId !== releasedCardId) {
        topCardStayedReleasedDuringSettle = false
      }
    }

    publishReport({
      phase: 'ready',
      requestId,
      scenario,
      initialOrder,
      orderedCardIdsAtRelease,
      reorderedDuringDrag,
      releasedCardId,
      topCardIdDuringSettle,
      topCardStayedReleasedDuringSettle,
      releaseVelocityY: velocity.y,
    })
  } catch (error) {
    publishReport({
      phase: 'error',
      requestId,
      scenario,
      message: error instanceof Error ? error.message : String(error),
    })
  } finally {
    isScenarioRunning = false
  }
}

function getCurrentStackCard(cardId: string) {
  const stackCard = buildStackMetrics(order, cards).find((card) => card.id === cardId)
  if (stackCard === undefined) {
    throw new Error(`Missing stack card ${cardId}`)
  }
  return stackCard
}

function getTopLayerCardId(): string | null {
  if (drag !== null) return drag.cardId
  if (release !== null) return release.cardId
  return order.at(-1) ?? null
}

function wait(durationMs: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, durationMs))
}

function nextFrame() {
  return new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()))
}

function lerp(from: number, to: number, amount: number) {
  return from + (to - from) * amount
}
