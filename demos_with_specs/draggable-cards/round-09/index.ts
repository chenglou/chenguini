import {
  CARD_WIDTH,
  DRAG_OPACITY,
  DRAG_SCALE,
  SCALE_DAMPING,
  SCALE_STIFFNESS,
  centeredColumnX,
  createCards,
  estimateReleaseVelocity,
  reorderCardsDuringDrag,
  snapSpring,
  spring,
  springMostlyDone,
  springStep,
  stackLayouts,
  type CardId,
  type CardLayout,
  type CardModel,
  type PointerSample,
  type Spring,
} from "./logic.ts"

type DragState = {
  cardId: CardId
  deltaX: number
  deltaY: number
}

type CardMotion = {
  x: Spring
  y: Spring
  scale: Spring
}

type CardRuntime = {
  model: CardModel
  element: HTMLDivElement
  motion: CardMotion
}

type ScenarioReport = {
  phase: "loading" | "running" | "ready" | "error"
  requestId: string
  scenario: string
  status?: "ok" | "error"
  message?: string
  orderedIds?: CardId[]
  draggedId?: CardId | null
  lastDraggedId?: CardId | null
  swapHappened?: boolean
  cursor?: string
  highestZId?: CardId | null
  settleSample?: {
    draggedId: CardId | null
    lastDraggedId: CardId | null
    highestZId: CardId | null
    releasedId: CardId
  }
}

type Snapshot = {
  orderedIds: CardId[]
  draggedId: CardId | null
  lastDraggedId: CardId | null
  cursor: string
  highestZId: CardId | null
}

const app = document.querySelector<HTMLDivElement>("#app")
if (!app) {
  throw new Error("App root not found")
}

const cards = createCards()
const cardById = new Map(cards.map((card) => [card.id, card]))
const initialLayoutById = new Map(stackLayouts(cards.map((card) => card.id), cardById).map((layout) => [layout.id, layout]))

let orderedIds = cards.map((card) => card.id)
let draggedCardId: CardId | null = null
let lastDraggedCardId: CardId | null = null
let hoverCardId: CardId | null = null
let dragState: DragState | null = null
let pointerSamples: PointerSample[] = []
let activePointerId: number | null = null

const runtimes = new Map<CardId, CardRuntime>()

for (const card of cards) {
  const element = document.createElement("div")
  element.className = "card"
  element.textContent = card.label
  element.dataset.cardId = card.id

  const centeredX = centeredColumnX(window.innerWidth)
  const initialY = initialLayoutById.get(card.id)?.top ?? 0

  const runtime: CardRuntime = {
    model: card,
    element,
    motion: {
      x: spring(centeredX),
      y: spring(initialY),
      scale: spring(1, SCALE_STIFFNESS, SCALE_DAMPING),
    },
  }

  element.addEventListener("pointerdown", (event) => {
    startDrag(card.id, event.pageX, event.pageY, event.timeStamp, event.pointerId)
    event.preventDefault()
  })
  element.addEventListener("pointerenter", () => {
    if (draggedCardId == null) {
      hoverCardId = card.id
    }
  })
  element.addEventListener("pointerleave", () => {
    if (hoverCardId === card.id) {
      hoverCardId = null
    }
  })

  runtimes.set(card.id, runtime)
  app.append(element)
}

layoutCards()
render()

window.addEventListener("resize", () => {
  layoutCards()
  render()
})

window.addEventListener("pointermove", (event) => {
  moveDrag(event.pageX, event.pageY, event.timeStamp)
})

window.addEventListener("mousemove", (event) => {
  moveDrag(event.pageX, event.pageY, event.timeStamp)
})

window.addEventListener(
  "touchmove",
  (event) => {
    if (dragState == null) return
    const touch = findTrackedTouch(event.changedTouches)
    if (!touch) return
    moveDrag(touch.pageX, touch.pageY, event.timeStamp)
    event.preventDefault()
  },
  { passive: false },
)

window.addEventListener("pointerup", (event) => {
  finishDrag(event.pageX, event.pageY, event.timeStamp)
})

window.addEventListener("pointercancel", (event) => {
  finishDrag(event.pageX, event.pageY, event.timeStamp)
})

window.addEventListener("mouseup", (event) => {
  finishDrag(event.pageX, event.pageY, event.timeStamp)
})

window.addEventListener("touchend", (event) => {
  const touch = findTrackedTouch(event.changedTouches) ?? event.changedTouches[0]
  if (!touch) {
    finishDrag(null, null, event.timeStamp)
    return
  }
  finishDrag(touch.pageX, touch.pageY, event.timeStamp)
})

window.addEventListener("touchcancel", (event) => {
  const touch = findTrackedTouch(event.changedTouches) ?? event.changedTouches[0]
  if (!touch) {
    finishDrag(null, null, event.timeStamp)
    return
  }
  finishDrag(touch.pageX, touch.pageY, event.timeStamp)
})

let animationFrameId = 0
let simulatedUntil = performance.now()

function frame(now: number) {
  animationFrameId = requestAnimationFrame(frame)
  stepWorld(now)
  render()
}

animationFrameId = requestAnimationFrame(frame)

type Controller = {
  startDrag: (cardId: CardId, pointerX: number, pointerY: number, time: number) => void
  moveDrag: (pointerX: number, pointerY: number, time: number) => void
  finishDrag: (pointerX: number | null, pointerY: number | null, time: number) => void
  snapshot: () => Snapshot
  cardRect: (cardId: CardId) => { x: number; y: number; width: number; height: number }
  waitFrames: (count: number) => Promise<void>
  waitUntil: (predicate: () => boolean, timeoutMs?: number) => Promise<void>
}

const controller: Controller = {
  startDrag(cardId, pointerX, pointerY, time) {
    startDrag(cardId, pointerX, pointerY, time, null)
  },
  moveDrag,
  finishDrag,
  snapshot,
  cardRect(cardId) {
    const runtime = runtimes.get(cardId)
    if (!runtime) throw new Error(`Unknown card ${cardId}`)
    return {
      x: runtime.motion.x.pos,
      y: runtime.motion.y.pos,
      width: CARD_WIDTH * runtime.motion.scale.pos,
      height: runtime.model.height * runtime.motion.scale.pos,
    }
  },
  waitFrames,
  waitUntil,
}

const params = new URLSearchParams(location.search)
const requestId = params.get("requestId") ?? ""
const scenario = params.get("scenario") ?? ""
const reportEnabled = params.get("report") === "1"

if (reportEnabled) {
  publishReport({ phase: "loading", requestId, scenario })
  runScenarioIfNeeded().catch((error) => {
    publishReport({
      phase: "error",
      requestId,
      scenario,
      status: "error",
      message: error instanceof Error ? error.message : String(error),
    })
  })
}

async function runScenarioIfNeeded() {
  if (!scenario) {
    publishReport({
      phase: "ready",
      requestId,
      scenario,
      status: "ok",
      ...snapshot(),
    })
    return
  }

  publishReport({ phase: "running", requestId, scenario })

  if (scenario === "swap-down") {
    await runSwapDownScenario()
    publishReport({
      phase: "ready",
      requestId,
      scenario,
      status: "ok",
      swapHappened: true,
      ...snapshot(),
    })
    return
  }

  if (scenario === "release-depth") {
    const settleSample = await runReleaseDepthScenario()
    publishReport({
      phase: "ready",
      requestId,
      scenario,
      status: "ok",
      settleSample,
      ...snapshot(),
    })
    return
  }

  throw new Error(`Unknown scenario ${scenario}`)
}

async function runSwapDownScenario() {
  await controller.waitFrames(2)

  const card0 = controller.cardRect("0")
  const card1 = controller.cardRect("1")
  const pointerX = card0.x + 48
  const startY = card0.y + 24
  let time = performance.now()

  controller.startDrag("0", pointerX, startY, time)

  time += 32
  controller.moveDrag(pointerX, card1.y + card1.height / 2 + 18, time)
  await controller.waitUntil(() => orderedIds.join(",") === "1,0,2,3,4")

  time += 16
  controller.finishDrag(pointerX, card1.y + card1.height / 2 + 18, time)
  await controller.waitUntil(() => draggedCardId == null && lastDraggedCardId == null)
}

async function runReleaseDepthScenario() {
  await controller.waitFrames(2)

  const card0 = controller.cardRect("0")
  const card1 = controller.cardRect("1")
  const startX = card0.x + 42
  const startY = card0.y + 28
  let time = performance.now()

  controller.startDrag("0", startX, startY, time)

  time += 24
  controller.moveDrag(startX + 18, card1.y + card1.height / 2 - 10, time)
  time += 24
  controller.moveDrag(startX + 82, card1.y + card1.height / 2 + 52, time)
  time += 16
  controller.finishDrag(startX + 118, card1.y + card1.height / 2 + 86, time)

  await controller.waitUntil(() => draggedCardId == null && lastDraggedCardId === "0" && !cardSettled("0"))
  const settleSample = {
    draggedId: draggedCardId,
    lastDraggedId: lastDraggedCardId,
    highestZId: snapshot().highestZId,
    releasedId: "0",
  }

  await controller.waitUntil(() => lastDraggedCardId == null)
  return settleSample
}

function publishReport(report: ScenarioReport) {
  if (!reportEnabled) return
  location.hash = `report=${encodeURIComponent(JSON.stringify(report))}`
}

function startDrag(cardId: CardId, pointerX: number, pointerY: number, time: number, pointerId: number | null) {
  if (dragState != null) return
  const runtime = runtimes.get(cardId)
  if (!runtime) return

  dragState = {
    cardId,
    deltaX: pointerX - runtime.motion.x.pos,
    deltaY: pointerY - runtime.motion.y.pos,
  }
  draggedCardId = cardId
  lastDraggedCardId = null
  hoverCardId = cardId
  activePointerId = pointerId
  pointerSamples = [{ x: pointerX, y: pointerY, time }]

  runtime.motion.x.v = 0
  runtime.motion.y.v = 0
  runtime.motion.scale.v = 0
  runtime.motion.scale.pos = DRAG_SCALE
  runtime.motion.scale.dest = DRAG_SCALE

  moveDrag(pointerX, pointerY, time)
}

function moveDrag(pointerX: number, pointerY: number, time: number) {
  if (dragState == null || draggedCardId == null) return

  const runtime = runtimes.get(draggedCardId)
  if (!runtime) return

  pushPointerSample({ x: pointerX, y: pointerY, time })

  const rawX = pointerX - dragState.deltaX
  const centeredX = centeredColumnX(window.innerWidth)
  const draggedX = rawX + (centeredX - rawX) / 1.5
  const draggedY = pointerY - dragState.deltaY

  runtime.motion.x.pos = draggedX
  runtime.motion.x.dest = draggedX
  runtime.motion.x.v = 0
  runtime.motion.y.pos = draggedY
  runtime.motion.y.dest = draggedY
  runtime.motion.y.v = 0
  runtime.motion.scale.pos = DRAG_SCALE
  runtime.motion.scale.dest = DRAG_SCALE

  const currentLayouts = stackLayouts(orderedIds, cardById)
  const nextOrder = reorderCardsDuringDrag({
    orderedIds,
    draggedId: dragState.cardId,
    pointerY,
    layouts: currentLayouts,
  })
  if (nextOrder.swapped) {
    orderedIds = nextOrder.orderedIds
  }

  layoutCards()
  render()
}

function finishDrag(pointerX: number | null, pointerY: number | null, time: number) {
  if (dragState == null || draggedCardId == null) return

  if (pointerX != null && pointerY != null) {
    pushPointerSample({ x: pointerX, y: pointerY, time })
  }

  const releasedId = draggedCardId
  const runtime = runtimes.get(releasedId)
  if (!runtime) return

  const velocity = estimateReleaseVelocity(pointerSamples, time)

  dragState = null
  draggedCardId = null
  lastDraggedCardId = releasedId
  activePointerId = null
  hoverCardId = null
  pointerSamples = []

  runtime.motion.x.v += velocity.x
  runtime.motion.y.v += velocity.y
  runtime.motion.scale.dest = 1

  layoutCards()
  render()
}

function pushPointerSample(sample: PointerSample) {
  pointerSamples.push(sample)
  if (pointerSamples.length > 20) {
    pointerSamples.shift()
  }
}

function layoutCards() {
  const layouts = stackLayouts(orderedIds, cardById)
  const layoutById = new Map(layouts.map((layout) => [layout.id, layout]))
  const centeredX = centeredColumnX(window.innerWidth)

  for (const [cardId, runtime] of runtimes) {
    const layout = layoutById.get(cardId)
    if (!layout) continue

    runtime.motion.scale.dest = cardId === draggedCardId ? DRAG_SCALE : 1

    if (cardId === draggedCardId) continue

    runtime.motion.x.dest = centeredX
    runtime.motion.y.dest = layout.top
  }
}

function stepWorld(now: number) {
  let steps = Math.floor((now - simulatedUntil) / 4)
  steps = Math.min(300, Math.max(0, steps))
  simulatedUntil += steps * 4

  if (steps === 0) return

  for (let step = 0; step < steps; step += 1) {
    for (const [cardId, runtime] of runtimes) {
      if (cardId !== draggedCardId) {
        springStep(runtime.motion.x)
        springStep(runtime.motion.y)
      }
      springStep(runtime.motion.scale)

      if (springMostlyDone(runtime.motion.x)) snapSpring(runtime.motion.x)
      if (springMostlyDone(runtime.motion.y)) snapSpring(runtime.motion.y)
      if (springMostlyDone(runtime.motion.scale)) snapSpring(runtime.motion.scale)
    }

    if (lastDraggedCardId != null && cardSettled(lastDraggedCardId)) {
      lastDraggedCardId = null
    }
  }
}

function cardSettled(cardId: CardId) {
  const runtime = runtimes.get(cardId)
  if (!runtime) return true
  return (
    springMostlyDone(runtime.motion.x) &&
    springMostlyDone(runtime.motion.y) &&
    springMostlyDone(runtime.motion.scale)
  )
}

function render() {
  const cursor = draggedCardId != null ? "grabbing" : hoverCardId != null ? "grab" : "auto"
  document.body.style.cursor = cursor

  for (const [cardId, runtime] of runtimes) {
    const zIndex = cardZIndex(cardId)
    const opacity = cardId === draggedCardId ? DRAG_OPACITY : 1
    const shadow =
      cardId === draggedCardId
        ? "0 28px 60px rgba(29, 78, 216, 0.35)"
        : cardId === lastDraggedCardId
          ? "0 20px 46px rgba(29, 78, 216, 0.2)"
          : "0 10px 24px rgba(15, 23, 42, 0.14)"

    runtime.element.style.height = `${runtime.model.height}px`
    runtime.element.style.transform = `translate3d(${runtime.motion.x.pos}px, ${runtime.motion.y.pos}px, 0) scale(${runtime.motion.scale.pos})`
    runtime.element.style.background = `linear-gradient(180deg, hsl(214 74% ${runtime.model.lightnessBase + 6}%), hsl(214 70% ${runtime.model.lightnessBase - 6}%))`
    runtime.element.style.border = `1px solid hsl(214 80% ${runtime.model.lightnessBase - 18}%)`
    runtime.element.style.boxShadow = shadow
    runtime.element.style.opacity = String(opacity)
    runtime.element.style.zIndex = String(zIndex)
  }
}

function snapshot(): Snapshot {
  let highestZId: CardId | null = null
  let highestZ = -Infinity
  for (const cardId of orderedIds) {
    const zIndex = cardZIndex(cardId)
    if (zIndex > highestZ) {
      highestZ = zIndex
      highestZId = cardId
    }
  }

  return {
    orderedIds: orderedIds.slice(),
    draggedId: draggedCardId,
    lastDraggedId: lastDraggedCardId,
    cursor: document.body.style.cursor || "auto",
    highestZId,
  }
}

function cardZIndex(cardId: CardId) {
  if (draggedCardId === cardId) return 300
  if (draggedCardId == null && lastDraggedCardId === cardId) return 200
  return 10 + orderedIds.indexOf(cardId)
}

function findTrackedTouch(touches: TouchList) {
  if (activePointerId == null) return touches[0] ?? null
  for (let index = 0; index < touches.length; index += 1) {
    const touch = touches[index]
    if (touch.identifier === activePointerId) return touch
  }
  return null
}

function waitFrames(count: number) {
  return new Promise<void>((resolve) => {
    let remaining = count
    const tick = () => {
      remaining -= 1
      if (remaining <= 0) {
        resolve()
        return
      }
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
}

function waitUntil(predicate: () => boolean, timeoutMs = 5_000) {
  return new Promise<void>((resolve, reject) => {
    const deadline = performance.now() + timeoutMs
    const tick = () => {
      if (predicate()) {
        resolve()
        return
      }
      if (performance.now() > deadline) {
        reject(new Error("Scenario timed out"))
        return
      }
      requestAnimationFrame(tick)
    }
    tick()
  })
}

window.addEventListener("beforeunload", () => {
  cancelAnimationFrame(animationFrameId)
})
