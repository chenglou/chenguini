import {
  buildCards,
  CARD_WIDTH,
  type CardId,
  type CardSpec,
  estimateReleaseVelocity,
  getCardTopById,
  getCenteredX,
  getDepthTier,
  getDraggedCardPosition,
  getReorderedCardIds,
  isNearlySettled,
  keepRecentPointerSamples,
  MS_PER_ANIMATION_STEP,
  stepSpringAxis,
  TOP_PADDING,
} from "./drag-logic"

type Point = {
  x: number
  y: number
}

type VisualState = {
  x: number
  y: number
  vx: number
  vy: number
  scale: number
  opacity: number
}

type DragState = {
  cardId: CardId
  deltaX: number
  deltaY: number
  pointerSamples: PointSample[]
  lastPointer: PointSample
}

type PointSample = Point & {
  timeMs: number
}

type SemanticSnapshot = {
  orderedCardIds: CardId[]
  topItemId: CardId | null
  draggedCardId: CardId | null
  settlingCardId: CardId | null
}

type CardSnapshot = {
  id: CardId
  height: number
  slotTop: number
  x: number
  y: number
}

type DemoApp = {
  getSemanticSnapshot(): SemanticSnapshot
  getCardSnapshot(cardId: CardId): CardSnapshot
  dispatchPointerToCard(cardId: CardId, type: string, point: Point): void
  dispatchWindowPointer(type: string, point: Point): void
  waitForNextFrame(): Promise<void>
  waitForSettle(timeoutMs: number): Promise<void>
}

const cards = buildCards()
const cardHeightsById = Object.fromEntries(cards.map((card) => [card.id, card.height])) as Record<
  CardId,
  number
>

const rootElement = document.querySelector<HTMLDivElement>("#app")

if (!rootElement) {
  throw new Error("Missing #app")
}

function createDemo(appElement: HTMLDivElement, cards: readonly CardSpec[]): void {
  const orderedCardIds = cards.map((card) => card.id)
  const cardElementsById = new Map<CardId, HTMLButtonElement>()
  const visualsById = new Map<CardId, VisualState>()

  let draggedCardId: CardId | null = null
  let settlingCardId: CardId | null = null
  let dragState: DragState | null = null
  let frameHandle = 0
  let lastFrameMs = performance.now()

  for (const card of cards) {
    const topById = getCardTopById({
      orderedCardIds,
      cardHeightsById,
      topPadding: TOP_PADDING,
    })

    visualsById.set(card.id, {
      x: getCenteredX(window.innerWidth, CARD_WIDTH),
      y: topById[card.id],
      vx: 0,
      vy: 0,
      scale: 1,
      opacity: 1,
    })
  }

  cards.forEach((card) => {
    const button = document.createElement("button")
    button.className = "card"
    button.type = "button"
    button.textContent = card.label
    button.dataset.cardId = card.id
    button.style.height = `${card.height}px`
    button.style.background = `linear-gradient(180deg, hsl(210 78% ${card.lightnessBase + 6}%), hsl(210 72% ${card.lightnessBase}%))`
    button.addEventListener("pointerdown", (event) => {
      beginDrag(card.id, {
        x: event.clientX,
        y: event.clientY,
        timeMs: performance.now(),
      })

      try {
        button.setPointerCapture(event.pointerId)
      } catch {}

      event.preventDefault()
    })

    cardElementsById.set(card.id, button)
    appElement.append(button)
  })

  window.addEventListener("pointermove", (event) => {
    if (!dragState) {
      return
    }

    updateDrag({
      x: event.clientX,
      y: event.clientY,
      timeMs: performance.now(),
    })
    event.preventDefault()
  })

  window.addEventListener("pointerup", (event) => {
    finishDrag(getPointSampleFromMouseLikeEvent(event))
  })

  window.addEventListener("pointercancel", (event) => {
    finishDrag(getPointSampleFromMouseLikeEvent(event))
  })

  window.addEventListener("mouseup", (event) => {
    finishDrag(getPointSampleFromMouseLikeEvent(event))
  })

  window.addEventListener("touchend", (event) => {
    finishDrag(getPointSampleFromTouchEvent(event))
  })

  window.addEventListener("touchcancel", (event) => {
    finishDrag(getPointSampleFromTouchEvent(event))
  })

  window.addEventListener("blur", () => {
    finishDrag(null)
  })

  window.addEventListener("resize", () => {
    appElement.style.minHeight = `${getBoardHeight() + 80}px`
    ensureAnimationLoop()
  })

  appElement.style.minHeight = `${getBoardHeight() + 80}px`
  render()
  ensureAnimationLoop()

  const app: DemoApp = {
    getSemanticSnapshot() {
      return {
        orderedCardIds: [...orderedCardIds],
        topItemId: draggedCardId ?? settlingCardId,
        draggedCardId,
        settlingCardId,
      }
    },

    getCardSnapshot(cardId) {
      const visual = getVisual(cardId)
      const slotTop = getCardTopById({
        orderedCardIds,
        cardHeightsById,
        topPadding: TOP_PADDING,
      })[cardId]

      return {
        id: cardId,
        height: cardHeightsById[cardId],
        slotTop,
        x: visual.x,
        y: visual.y,
      }
    },

    dispatchPointerToCard(cardId, type, point) {
      const element = cardElementsById.get(cardId)

      if (!element) {
        throw new Error(`Missing card element for ${cardId}`)
      }

      element.dispatchEvent(
        new PointerEvent(type, {
          bubbles: true,
          cancelable: true,
          clientX: point.x,
          clientY: point.y,
          pointerId: 1,
          pointerType: "mouse",
          buttons: type === "pointerdown" || type === "pointermove" ? 1 : 0,
        }),
      )
    },

    dispatchWindowPointer(type, point) {
      window.dispatchEvent(
        new PointerEvent(type, {
          bubbles: true,
          cancelable: true,
          clientX: point.x,
          clientY: point.y,
          pointerId: 1,
          pointerType: "mouse",
          buttons: type === "pointermove" ? 1 : 0,
        }),
      )
    },

    waitForNextFrame() {
      return new Promise<void>((resolve) => {
        requestAnimationFrame(() => resolve())
      })
    },

    async waitForSettle(timeoutMs) {
      const startedAt = performance.now()

      while (performance.now() - startedAt <= timeoutMs) {
        if (isFullySettled()) {
          return
        }

        await app.waitForNextFrame()
      }

      throw new Error("Timed out waiting for settle")
    },
  }

  void runScenarioFromQuery(app)

  function beginDrag(cardId: CardId, point: PointSample): void {
    const visual = getVisual(cardId)

    draggedCardId = cardId
    settlingCardId = settlingCardId === cardId ? null : settlingCardId
    dragState = {
      cardId,
      deltaX: point.x - visual.x,
      deltaY: point.y - visual.y,
      pointerSamples: [point],
      lastPointer: point,
    }

    updateDraggedVisual(point)
    ensureAnimationLoop()
  }

  function updateDrag(point: PointSample): void {
    if (!dragState) {
      return
    }

    dragState.pointerSamples = keepRecentPointerSamples(
      [...dragState.pointerSamples, point],
      point.timeMs,
    )
    dragState.lastPointer = point

    updateDraggedVisual(point)
    ensureAnimationLoop()
  }

  function finishDrag(point: PointSample | null): void {
    if (!dragState) {
      return
    }

    const finalPoint = point ?? dragState.lastPointer
    const recentPointerSamples = keepRecentPointerSamples(
      dragState.pointerSamples,
      finalPoint.timeMs,
    )
    const { xPxPerMs, yPxPerMs } = estimateReleaseVelocity({
      nowMs: finalPoint.timeMs,
      pointerSamples: recentPointerSamples,
    })
    const releasedCardId = dragState.cardId
    const releasedVisual = getVisual(releasedCardId)

    releasedVisual.vx = xPxPerMs * 1000
    releasedVisual.vy = yPxPerMs * 1000
    releasedVisual.scale = 1.08
    releasedVisual.opacity = 0.78

    draggedCardId = null
    settlingCardId = releasedCardId
    dragState = null

    ensureAnimationLoop()
  }

  function updateDraggedVisual(point: PointSample): void {
    if (!dragState) {
      return
    }

    const visual = getVisual(dragState.cardId)
    const draggedPosition = getDraggedCardPosition({
      pointerX: point.x,
      pointerY: point.y,
      deltaX: dragState.deltaX,
      deltaY: dragState.deltaY,
      rowSizeX: CARD_WIDTH,
      windowWidth: window.innerWidth,
    })

    visual.x = draggedPosition.x
    visual.y = draggedPosition.y
    visual.vx = 0
    visual.vy = 0
    visual.scale = 1.1
    visual.opacity = 0.7

    const reordered = getReorderedCardIds({
      orderedCardIds,
      draggedCardId: dragState.cardId,
      draggedMidpointY: draggedPosition.y + cardHeightsById[dragState.cardId] / 2,
      topPadding: TOP_PADDING,
      cardHeightsById,
    })

    orderedCardIds.splice(0, orderedCardIds.length, ...reordered)
  }

  function animate(nowMs: number): void {
    frameHandle = 0
    const elapsedMs = Math.max(1, Math.min(32, nowMs - lastFrameMs))
    lastFrameMs = nowMs
    const targetX = getCenteredX(window.innerWidth, CARD_WIDTH)
    const topById = getCardTopById({
      orderedCardIds,
      cardHeightsById,
      topPadding: TOP_PADDING,
    })

    for (let simulatedMs = 0; simulatedMs < elapsedMs; simulatedMs += MS_PER_ANIMATION_STEP) {
      const dtMs = Math.min(MS_PER_ANIMATION_STEP, elapsedMs - simulatedMs)

      for (const card of cards) {
        if (card.id === draggedCardId) {
          continue
        }

        const visual = getVisual(card.id)
        const nextX = stepSpringAxis({
          position: visual.x,
          velocity: visual.vx,
          target: targetX,
          dtMs,
        })
        const nextY = stepSpringAxis({
          position: visual.y,
          velocity: visual.vy,
          target: topById[card.id],
          dtMs,
        })

        visual.x = nextX.position
        visual.vx = nextX.velocity
        visual.y = nextY.position
        visual.vy = nextY.velocity
      }

      for (const card of cards) {
        const visual = getVisual(card.id)
        const targetScale = card.id === draggedCardId ? 1.1 : 1
        const targetOpacity = card.id === draggedCardId ? 0.7 : 1
        const easing = Math.min(1, dtMs / 70)

        visual.scale += (targetScale - visual.scale) * easing
        visual.opacity += (targetOpacity - visual.opacity) * easing
      }
    }

    if (settlingCardId) {
      const visual = getVisual(settlingCardId)

      if (
        isNearlySettled({
          position: visual.x,
          velocity: visual.vx,
          target: targetX,
        }) &&
        isNearlySettled({
          position: visual.y,
          velocity: visual.vy,
          target: topById[settlingCardId],
        }) &&
        Math.abs(visual.scale - 1) < 0.01 &&
        Math.abs(visual.opacity - 1) < 0.01
      ) {
        visual.x = targetX
        visual.y = topById[settlingCardId]
        visual.vx = 0
        visual.vy = 0
        visual.scale = 1
        visual.opacity = 1
        settlingCardId = null
      }
    }

    render()

    if (!isFullySettled()) {
      ensureAnimationLoop()
    }
  }

  function ensureAnimationLoop(): void {
    if (frameHandle !== 0) {
      return
    }

    frameHandle = requestAnimationFrame(animate)
  }

  function render(): void {
    for (const card of cards) {
      const element = cardElementsById.get(card.id)

      if (!element) {
        continue
      }

      const visual = getVisual(card.id)
      const tier = getDepthTier({
        cardId: card.id,
        draggedCardId,
        settlingCardId,
      })

      element.style.transform = `translate(${visual.x}px, ${visual.y}px) scale(${visual.scale})`
      element.style.opacity = `${visual.opacity}`
      element.style.zIndex = String(tier * 10)
      element.style.boxShadow =
        tier >= 2
          ? "0 28px 44px rgba(15, 23, 42, 0.18), 0 8px 14px rgba(15, 23, 42, 0.1)"
          : "0 18px 32px rgba(15, 23, 42, 0.12), 0 6px 10px rgba(15, 23, 42, 0.08)"
    }
  }

  function getBoardHeight(): number {
    const totalHeight = cards.reduce((sum, card) => sum + card.height, 0)
    return TOP_PADDING + totalHeight
  }

  function getVisual(cardId: CardId): VisualState {
    const visual = visualsById.get(cardId)

    if (!visual) {
      throw new Error(`Missing visual for ${cardId}`)
    }

    return visual
  }

  function isFullySettled(): boolean {
    if (draggedCardId || dragState || settlingCardId) {
      return false
    }

    const targetX = getCenteredX(window.innerWidth, CARD_WIDTH)
    const topById = getCardTopById({
      orderedCardIds,
      cardHeightsById,
      topPadding: TOP_PADDING,
    })

    return cards.every((card) => {
      const visual = getVisual(card.id)

      return (
        isNearlySettled({
          position: visual.x,
          velocity: visual.vx,
          target: targetX,
        }) &&
        isNearlySettled({
          position: visual.y,
          velocity: visual.vy,
          target: topById[card.id],
        }) &&
        Math.abs(visual.scale - 1) < 0.01 &&
        Math.abs(visual.opacity - 1) < 0.01
      )
    })
  }
}

async function runScenarioFromQuery(app: DemoApp): Promise<void> {
  const params = new URLSearchParams(window.location.search)
  const scenario = params.get("scenario")
  const requestId = params.get("requestId")

  if (!scenario || !requestId) {
    return
  }

  publishScenarioReport({
    phase: "booting",
    requestId,
    scenario,
  })

  try {
    const handler = scenarioHandlers[scenario]

    if (!handler) {
      throw new Error(`Unknown scenario: ${scenario}`)
    }

    await app.waitForNextFrame()
    await app.waitForNextFrame()

    publishScenarioReport({
      phase: "running",
      requestId,
      scenario,
    })

    const semanticResult = await Promise.race([
      handler(app),
      new Promise<Record<string, unknown>>((_, reject) => {
        window.setTimeout(() => reject(new Error(`Scenario timed out: ${scenario}`)), 8_000)
      }),
    ])

    publishScenarioReport({
      phase: "ready",
      requestId,
      scenario,
      semanticResult,
    })
  } catch (error) {
    publishScenarioReport({
      phase: "error",
      requestId,
      scenario,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

const scenarioHandlers: Record<string, (app: DemoApp) => Promise<Record<string, unknown>>> = {
  async "reorder-before-release"(app) {
    const firstCard = app.getCardSnapshot("0")
    const secondCard = app.getCardSnapshot("1")
    const grabPoint = {
      x: firstCard.x + CARD_WIDTH / 2,
      y: firstCard.y + firstCard.height / 2,
    }
    const pastMidpointPoint = {
      x: grabPoint.x,
      y: secondCard.slotTop + secondCard.height / 2 + 18,
    }

    app.dispatchPointerToCard("0", "pointerdown", grabPoint)
    await app.waitForNextFrame()
    app.dispatchWindowPointer("pointermove", pastMidpointPoint)
    await app.waitForNextFrame()
    await app.waitForNextFrame()

    const orderedCardIdsBeforeRelease = app.getSemanticSnapshot().orderedCardIds

    app.dispatchWindowPointer("pointerup", pastMidpointPoint)
    await app.waitForSettle(5_000)

    return {
      orderedCardIdsBeforeRelease,
      finalOrderedCardIds: app.getSemanticSnapshot().orderedCardIds,
    }
  },

  async "release-depth"(app) {
    const card = app.getCardSnapshot("1")
    const grabPoint = {
      x: card.x + CARD_WIDTH / 2,
      y: card.y + card.height / 2,
    }
    const movePoints = [40, 110, 190].map((offsetY) => ({
      x: grabPoint.x + 140,
      y: grabPoint.y + offsetY,
    }))

    app.dispatchPointerToCard("1", "pointerdown", grabPoint)

    for (const point of movePoints) {
      await app.waitForNextFrame()
      app.dispatchWindowPointer("pointermove", point)
    }

    await app.waitForNextFrame()
    app.dispatchWindowPointer("pointerup", movePoints[movePoints.length - 1])

    const topItemIdsWhileSettling: CardId[] = []

    while (!app.getSemanticSnapshot().settlingCardId) {
      await app.waitForNextFrame()
    }

    while (topItemIdsWhileSettling.length < 3) {
      const snapshot = app.getSemanticSnapshot()

      if (!snapshot.settlingCardId || !snapshot.topItemId) {
        throw new Error("Release settled before collecting depth samples")
      }

      topItemIdsWhileSettling.push(snapshot.topItemId)
      await app.waitForNextFrame()
    }

    await app.waitForSettle(5_000)

    return {
      releasedCardId: "1",
      topItemIdsWhileSettling,
      settled: app.getSemanticSnapshot().settlingCardId === null,
    }
  },
}

function publishScenarioReport(report: {
  phase: "booting" | "running" | "ready" | "error"
  requestId: string
  scenario: string
  semanticResult?: Record<string, unknown>
  error?: string
}): void {
  window.location.hash = encodeURIComponent(JSON.stringify(report))
}

function getPointSampleFromMouseLikeEvent(event: MouseEvent | PointerEvent): PointSample {
  return {
    x: event.clientX,
    y: event.clientY,
    timeMs: performance.now(),
  }
}

function getPointSampleFromTouchEvent(event: TouchEvent): PointSample | null {
  const touch = event.changedTouches[0] ?? event.touches[0]

  if (!touch) {
    return null
  }

  return {
    x: touch.clientX,
    y: touch.clientY,
    timeMs: performance.now(),
  }
}

createDemo(rootElement, cards)
