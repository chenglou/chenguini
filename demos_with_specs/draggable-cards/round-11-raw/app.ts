import {
  cardWidth,
  createCards,
  dragOpacity,
  dragScale,
  estimateReleaseVelocity,
  getReorderIndex,
  getSlotMidpoints,
  msPerAnimationStep,
  reorderIds,
  springDamping,
  springStiffness,
  topPadding,
  type Card,
  type CardId,
  type PointerSample,
} from "./logic"

type VisualCardState = {
  opacity: number
  scale: number
  vx: number
  vy: number
  x: number
  y: number
}

type DragState = {
  cardId: CardId
  captureElement: HTMLDivElement | null
  deltaX: number
  deltaY: number
  pointerId: number
  pointerX: number
  pointerY: number
  samples: PointerSample[]
}

export type CardFrame = {
  height: number
  width: number
  x: number
  y: number
}

export type DraggableCardsApp = {
  beginScriptedDrag(args: {
    cardId: CardId
    pointerId: number
    pointerX: number
    pointerY: number
    timeMs?: number
  }): void
  cancelScriptedDrag(args: { pointerId: number; pointerX: number; pointerY: number; timeMs?: number }): void
  endScriptedDrag(args: { pointerId: number; pointerX: number; pointerY: number; timeMs?: number }): void
  getCardFrame(cardId: CardId): CardFrame
  getOrderedCardIds(): CardId[]
  getSlotMidpoints(): Array<{ cardId: CardId; midpointY: number }>
  getTopCardId(): CardId | null
  isSettling(): boolean
  moveScriptedDrag(args: { pointerId: number; pointerX: number; pointerY: number; timeMs?: number }): void
  waitForSettle(): Promise<void>
}

export function mountDraggableCards(root: HTMLElement): DraggableCardsApp {
  const cards = createCards()
  const cardById = new Map<CardId, Card>(cards.map((card) => [card.id, card]))
  const cardElements = new Map<CardId, HTMLDivElement>()
  const visualById = new Map<CardId, VisualCardState>()
  const settleWaiters: Array<() => void> = []

  let orderedCardIds = cards.map((card) => card.id)
  let dragState: DragState | null = null
  let settlingCardId: CardId | null = null
  let lastFrameMs = performance.now()
  let accumulatedMs = 0

  root.innerHTML = ""
  root.className = "demo-root"

  for (const card of cards) {
    const cardElement = document.createElement("div")
    cardElement.className = "card"
    cardElement.dataset.cardId = card.id
    cardElement.textContent = card.label
    cardElement.style.height = `${card.sizeY}px`
    cardElement.style.width = `${cardWidth}px`
    cardElement.style.background = `hsl(208 72% ${card.lightnessBase}%)`

    cardElement.addEventListener("pointerdown", (event) => {
      event.preventDefault()
      beginDrag({
        captureElement: cardElement,
        cardId: card.id,
        pointerId: event.pointerId,
        pointerX: event.clientX,
        pointerY: event.clientY,
        timeMs: performance.now(),
      })
    })

    cardElements.set(card.id, cardElement)
    visualById.set(card.id, {
      opacity: 1,
      scale: 1,
      vx: 0,
      vy: 0,
      x: 0,
      y: 0,
    })
    root.append(cardElement)
  }

  window.addEventListener("pointermove", (event) => {
    if (dragState?.pointerId !== event.pointerId) {
      return
    }

    moveDrag({
      pointerId: event.pointerId,
      pointerX: event.clientX,
      pointerY: event.clientY,
      timeMs: performance.now(),
    })
  })

  window.addEventListener("pointerup", (event) => {
    if (dragState?.pointerId !== event.pointerId) {
      return
    }

    endDrag({
      pointerId: event.pointerId,
      pointerX: event.clientX,
      pointerY: event.clientY,
      timeMs: performance.now(),
    })
  })

  window.addEventListener("pointercancel", (event) => {
    if (dragState?.pointerId !== event.pointerId) {
      return
    }

    cancelDrag({
      pointerId: event.pointerId,
      pointerX: event.clientX,
      pointerY: event.clientY,
      timeMs: performance.now(),
    })
  })

  window.addEventListener("resize", syncRootHeight)

  syncVisualsToSlots()
  syncRootHeight()
  render()
  requestAnimationFrame(tick)

  return {
    beginScriptedDrag: beginDrag,
    cancelScriptedDrag: cancelDrag,
    endScriptedDrag: endDrag,
    getCardFrame,
    getOrderedCardIds: () => [...orderedCardIds],
    getSlotMidpoints: () =>
      getCurrentSlotMidpoints().map((midpoint, index) => ({
        cardId: orderedCardIds[index]!,
        midpointY: midpoint,
      })),
    getTopCardId,
    isSettling: () => settlingCardId !== null,
    moveScriptedDrag: moveDrag,
    waitForSettle,
  }

  function beginDrag(args: {
    captureElement?: HTMLDivElement | null
    cardId: CardId
    pointerId: number
    pointerX: number
    pointerY: number
    timeMs?: number
  }) {
    const { cardId, pointerId, pointerX, pointerY } = args
    const captureElement = args.captureElement ?? null
    const timeMs = args.timeMs ?? performance.now()

    if (dragState !== null) {
      cancelDrag({
        pointerId: dragState.pointerId,
        pointerX: dragState.pointerX,
        pointerY: dragState.pointerY,
        timeMs,
      })
    }

    if (settlingCardId === cardId) {
      settlingCardId = null
      maybeResolveSettle()
    }

    const visual = visualById.get(cardId)
    if (visual === undefined) {
      return
    }

    captureElement?.setPointerCapture(pointerId)

    dragState = {
      captureElement,
      cardId,
      deltaX: pointerX - visual.x,
      deltaY: pointerY - visual.y,
      pointerId,
      pointerX,
      pointerY,
      samples: [{ timeMs, x: pointerX, y: pointerY }],
    }

    visual.vx = 0
    visual.vy = 0
    render()
  }

  function moveDrag(args: { pointerId: number; pointerX: number; pointerY: number; timeMs?: number }) {
    if (dragState === null || dragState.pointerId !== args.pointerId) {
      return
    }

    const timeMs = args.timeMs ?? performance.now()
    dragState.pointerX = args.pointerX
    dragState.pointerY = args.pointerY
    dragState.samples.push({ timeMs, x: args.pointerX, y: args.pointerY })
    trimPointerSamples(dragState.samples, timeMs)

    const draggedCard = cardById.get(dragState.cardId)
    if (draggedCard === undefined) {
      return
    }

    const currentIndex = orderedCardIds.indexOf(dragState.cardId)
    if (currentIndex === -1) {
      return
    }

    const draggedCenterY = args.pointerY - dragState.deltaY + draggedCard.sizeY / 2
    const targetIndex = getReorderIndex({
      currentIndex,
      draggedCenterY,
      slotMidpoints: getCurrentSlotMidpoints(),
    })

    if (targetIndex !== currentIndex) {
      orderedCardIds = reorderIds(orderedCardIds, currentIndex, targetIndex)
      syncRootHeight()
    }

    render()
  }

  function endDrag(args: { pointerId: number; pointerX: number; pointerY: number; timeMs?: number }) {
    finishDrag(args, false)
  }

  function cancelDrag(args: { pointerId: number; pointerX: number; pointerY: number; timeMs?: number }) {
    finishDrag(args, true)
  }

  function finishDrag(
    args: { pointerId: number; pointerX: number; pointerY: number; timeMs?: number },
    wasCancelled: boolean,
  ) {
    if (dragState === null || dragState.pointerId !== args.pointerId) {
      return
    }

    const activeDrag = dragState
    const timeMs = args.timeMs ?? performance.now()
    const visual = visualById.get(activeDrag.cardId)

    activeDrag.pointerX = args.pointerX
    activeDrag.pointerY = args.pointerY
    activeDrag.samples.push({ timeMs, x: args.pointerX, y: args.pointerY })
    trimPointerSamples(activeDrag.samples, timeMs)

    releasePointerCapture(activeDrag)

    dragState = null
    settlingCardId = activeDrag.cardId

    if (visual !== undefined) {
      const releaseVelocity = wasCancelled
        ? { x: 0, y: 0 }
        : estimateReleaseVelocity({
            nowMs: timeMs,
            samples: activeDrag.samples,
            windowMs: 100,
          })

      visual.vx = releaseVelocity.x * 1000
      visual.vy = releaseVelocity.y * 1000
    }

    render()
  }

  function releasePointerCapture(activeDrag: DragState) {
    if (
      activeDrag.captureElement !== null &&
      activeDrag.captureElement.hasPointerCapture(activeDrag.pointerId)
    ) {
      activeDrag.captureElement.releasePointerCapture(activeDrag.pointerId)
    }
  }

  function getCurrentSlotMidpoints() {
    return getSlotMidpoints(
      orderedCardIds.map((cardId) => cardById.get(cardId)!.sizeY),
      topPadding,
    )
  }

  function getCardFrame(cardId: CardId): CardFrame {
    const visual = visualById.get(cardId)
    const card = cardById.get(cardId)

    if (visual === undefined || card === undefined) {
      throw new Error(`Unknown card ${cardId}`)
    }

    return {
      height: card.sizeY,
      width: cardWidth,
      x: visual.x,
      y: visual.y,
    }
  }

  function getTopCardId() {
    if (dragState !== null) {
      return dragState.cardId
    }
    if (settlingCardId !== null) {
      return settlingCardId
    }
    return null
  }

  function waitForSettle() {
    if (dragState === null && settlingCardId === null) {
      return Promise.resolve()
    }

    return new Promise<void>((resolve) => {
      settleWaiters.push(resolve)
    })
  }

  function maybeResolveSettle() {
    if (dragState !== null || settlingCardId !== null) {
      return
    }

    while (settleWaiters.length > 0) {
      settleWaiters.shift()?.()
    }
  }

  function syncVisualsToSlots() {
    for (const [index, cardId] of orderedCardIds.entries()) {
      const card = cardById.get(cardId)
      const visual = visualById.get(cardId)
      if (card === undefined || visual === undefined) {
        continue
      }

      visual.x = getCenteredX()
      visual.y = getSlotTop(index)
    }
  }

  function syncRootHeight() {
    const totalHeight = cards.reduce((sum, card) => sum + card.sizeY, 0)
    root.style.minHeight = `${Math.max(window.innerHeight, totalHeight + topPadding * 2)}px`
  }

  function getSlotTop(index: number) {
    let y = topPadding

    for (let slotIndex = 0; slotIndex < index; slotIndex += 1) {
      y += cardById.get(orderedCardIds[slotIndex]!)!.sizeY
    }

    return y
  }

  function getCenteredX() {
    return (window.innerWidth - cardWidth) / 2
  }

  function getDraggedX(activeDrag: DragState) {
    const rawX = activeDrag.pointerX - activeDrag.deltaX
    const centeredX = getCenteredX()
    return rawX + (centeredX - rawX) / 1.5
  }

  function getDraggedY(activeDrag: DragState) {
    return activeDrag.pointerY - activeDrag.deltaY
  }

  function tick(frameMs: number) {
    const deltaMs = Math.min(32, frameMs - lastFrameMs)
    lastFrameMs = frameMs
    accumulatedMs += deltaMs

    while (accumulatedMs >= msPerAnimationStep) {
      step(msPerAnimationStep)
      accumulatedMs -= msPerAnimationStep
    }

    render()
    requestAnimationFrame(tick)
  }

  function step(stepMs: number) {
    const dtSeconds = stepMs / 1000

    for (const [index, cardId] of orderedCardIds.entries()) {
      const card = cardById.get(cardId)
      const visual = visualById.get(cardId)
      if (card === undefined || visual === undefined) {
        continue
      }

      const isDragging = dragState?.cardId === cardId
      const isSettling = settlingCardId === cardId
      const targetX = isDragging && dragState !== null ? getDraggedX(dragState) : getCenteredX()
      const targetY = isDragging && dragState !== null ? getDraggedY(dragState) : getSlotTop(index)
      const targetScale = isDragging ? dragScale : 1
      const targetOpacity = isDragging ? dragOpacity : 1

      if (isDragging) {
        visual.x = targetX
        visual.y = targetY
        visual.vx = 0
        visual.vy = 0
      } else {
        stepSpring(visual, targetX, targetY, dtSeconds)

        if (isSettling && isCardSettled(visual, targetX, targetY)) {
          visual.x = targetX
          visual.y = targetY
          visual.vx = 0
          visual.vy = 0
          settlingCardId = null
          maybeResolveSettle()
        }
      }

      visual.scale += (targetScale - visual.scale) * Math.min(1, stepMs / 24)
      visual.opacity += (targetOpacity - visual.opacity) * Math.min(1, stepMs / 24)
      cardElements.get(card.id)!.style.height = `${card.sizeY}px`
    }
  }

  function stepSpring(visual: VisualCardState, targetX: number, targetY: number, dtSeconds: number) {
    const accelX = (targetX - visual.x) * springStiffness - visual.vx * springDamping
    const accelY = (targetY - visual.y) * springStiffness - visual.vy * springDamping

    visual.vx += accelX * dtSeconds
    visual.vy += accelY * dtSeconds
    visual.x += visual.vx * dtSeconds
    visual.y += visual.vy * dtSeconds
  }

  function isCardSettled(visual: VisualCardState, targetX: number, targetY: number) {
    return (
      Math.abs(targetX - visual.x) < 0.5 &&
      Math.abs(targetY - visual.y) < 0.5 &&
      Math.abs(visual.vx) < 10 &&
      Math.abs(visual.vy) < 10
    )
  }

  function render() {
    for (const [index, cardId] of orderedCardIds.entries()) {
      const cardElement = cardElements.get(cardId)
      const visual = visualById.get(cardId)
      if (cardElement === undefined || visual === undefined) {
        continue
      }

      const layer =
        dragState?.cardId === cardId ? "dragging" : settlingCardId === cardId ? "settling" : "base"

      cardElement.dataset.layer = layer
      cardElement.style.cursor = dragState?.cardId === cardId ? "grabbing" : "grab"
      cardElement.style.opacity = `${visual.opacity}`
      cardElement.style.transform = `translate3d(${visual.x}px, ${visual.y}px, 0) scale(${visual.scale})`
      cardElement.style.zIndex = layer === "dragging" ? "3" : layer === "settling" ? "2" : `${1 + index}`
    }
  }
}

function trimPointerSamples(samples: PointerSample[], timeMs: number) {
  const cutoffMs = timeMs - 100

  while (samples.length > 1 && samples[0]!.timeMs < cutoffMs) {
    samples.shift()
  }
}
