import {
  CARD_COUNT,
  CARD_WIDTH,
  MAX_ANIMATION_STEPS,
  ROW_SIZE_X,
  TOP_PADDING,
  cardZIndex,
  computeCards,
  computeLayoutTargets,
  createMotion,
  draggedXForPointer,
  estimateReleaseVelocity,
  motionMostlyDone,
  pushPointerSample,
  reorderByDraggedCenter,
  stepMotion,
} from './model.js'

export function createDraggableCardsApp(root) {
  const cards = computeCards(CARD_COUNT)
  const cardById = Object.fromEntries(cards.map((card) => [card.id, card]))
  const state = {
    orderedCardIds: cards.map((card) => card.id),
    motionsByCardId: {},
    queuedInputs: [],
    activeDrag: null,
    lastReleasedCardId: null,
    latestReleaseVelocity: { x: 0, y: 0 },
    animatedUntilTime: null,
  }
  const domCache = {
    scene: document.createElement('main'),
    subtitle: document.createElement('p'),
    stack: document.createElement('section'),
    cardNodesById: new Map(),
  }

  let queuedPointerId = null
  let scheduledRaf = null
  const renderWaiters = []

  const initialLayout = computeLayoutTargets(cards, state.orderedCardIds, document.documentElement.clientWidth)
  for (const card of cards) {
    const target = initialLayout.targetByCardId.get(card.id)
    state.motionsByCardId[card.id] = {
      x: createMotion(target?.x ?? 0),
      y: createMotion(target?.y ?? TOP_PADDING),
    }
  }

  root.textContent = ''
  root.append(domCache.scene)
  domCache.scene.className = 'scene'
  domCache.subtitle.className = 'scene__subtitle'
  domCache.subtitle.textContent = 'Five cards. Grab one and drag through the next midpoint.'
  domCache.stack.className = 'card-stack'
  domCache.stack.style.isolation = 'isolate'
  domCache.scene.append(domCache.subtitle, domCache.stack)

  for (const card of cards) {
    const cardNode = document.createElement('article')
    const heading = document.createElement('h2')
    const caption = document.createElement('p')
    const accent = document.createElement('span')

    cardNode.className = 'card'
    cardNode.dataset.cardId = card.id
    cardNode.style.width = `${CARD_WIDTH}px`
    cardNode.style.touchAction = 'none'
    heading.className = 'card__title'
    caption.className = 'card__caption'
    accent.className = 'card__accent'

    heading.textContent = `Card ${card.index + 1}`
    caption.textContent = `${Math.round(card.sizeY)}px tall`
    accent.textContent = `${Math.round(card.lightnessBase)}`

    cardNode.append(heading, caption, accent)
    cardNode.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return
      event.preventDefault()
      queuedPointerId = event.pointerId
      cardNode.setPointerCapture(event.pointerId)
      queueInput({
        type: 'pointerdown',
        cardId: card.id,
        pointerId: event.pointerId,
        pageX: event.pageX,
        pageY: event.pageY,
        timeStamp: event.timeStamp,
      })
    })

    domCache.cardNodesById.set(card.id, cardNode)
    domCache.stack.append(cardNode)
  }

  window.addEventListener('pointermove', (event) => {
    if (queuedPointerId !== event.pointerId) return
    queueInput({
      type: 'pointermove',
      pointerId: event.pointerId,
      pageX: event.pageX,
      pageY: event.pageY,
      timeStamp: event.timeStamp,
    })
  })

  window.addEventListener('pointerup', (event) => {
    if (queuedPointerId !== event.pointerId) return
    queueInput({
      type: 'pointerup',
      pointerId: event.pointerId,
      pageX: event.pageX,
      pageY: event.pageY,
      timeStamp: event.timeStamp,
    })
    queuedPointerId = null
  })

  window.addEventListener('pointercancel', (event) => {
    if (queuedPointerId !== event.pointerId) return
    queueInput({
      type: 'pointerup',
      pointerId: event.pointerId,
      pageX: event.pageX,
      pageY: event.pageY,
      timeStamp: event.timeStamp,
    })
    queuedPointerId = null
  })

  window.addEventListener('resize', () => {
    scheduleRender()
  })

  function queueInput(input) {
    state.queuedInputs.push(input)
    scheduleRender()
  }

  function scheduleRender() {
    if (scheduledRaf != null) return
    scheduledRaf = requestAnimationFrame(renderFrame)
  }

  function waitForNextRender() {
    return new Promise((resolve) => {
      renderWaiters.push(resolve)
    })
  }

  function resolveRenderWaiters() {
    const snapshot = getSnapshot()
    while (renderWaiters.length > 0) {
      const resolve = renderWaiters.shift()
      resolve?.(snapshot)
    }
  }

  function getSnapshot() {
    const topCardId = cards.reduce(
      (bestCardId, card) => {
        if (bestCardId == null) return card.id
        const currentZ = cardZIndex(
          state.orderedCardIds,
          state.activeDrag?.cardId ?? null,
          state.lastReleasedCardId,
          card.id,
        )
        const bestZ = cardZIndex(
          state.orderedCardIds,
          state.activeDrag?.cardId ?? null,
          state.lastReleasedCardId,
          bestCardId,
        )
        return currentZ > bestZ ? card.id : bestCardId
      },
      null,
    )

    return {
      activeDragCardId: state.activeDrag?.cardId ?? null,
      lastReleasedCardId: state.lastReleasedCardId,
      latestReleaseVelocity: { ...state.latestReleaseVelocity },
      orderedCardIds: [...state.orderedCardIds],
      topCardId,
      cardStates: Object.fromEntries(
        cards.map((card) => [
          card.id,
          {
            sizeY: card.sizeY,
            x: state.motionsByCardId[card.id].x.pos,
            y: state.motionsByCardId[card.id].y.pos,
          },
        ]),
      ),
    }
  }

  function processInput(input, windowWidth) {
    switch (input.type) {
      case 'pointerdown': {
        const motion = state.motionsByCardId[input.cardId]
        state.activeDrag = {
          cardId: input.cardId,
          pointerId: input.pointerId,
          deltaX: input.pageX - motion.x.pos,
          deltaY: input.pageY - motion.y.pos,
          history: [{ x: input.pageX, y: input.pageY, time: input.timeStamp }],
          pointerX: input.pageX,
          pointerY: input.pageY,
        }
        state.lastReleasedCardId = null
        motion.x.v = 0
        motion.y.v = 0
        return
      }
      case 'pointermove': {
        if (state.activeDrag == null || state.activeDrag.pointerId !== input.pointerId) return
        const draggedCard = cardById[state.activeDrag.cardId]
        state.activeDrag.pointerX = input.pageX
        state.activeDrag.pointerY = input.pageY
        state.activeDrag.history = pushPointerSample(state.activeDrag.history, {
          x: input.pageX,
          y: input.pageY,
          time: input.timeStamp,
        })
        const dragCenterY = input.pageY - state.activeDrag.deltaY + draggedCard.sizeY / 2
        state.orderedCardIds = reorderByDraggedCenter(cards, state.orderedCardIds, draggedCard.id, dragCenterY)
        const motion = state.motionsByCardId[draggedCard.id]
        motion.x.pos = motion.x.dest = draggedXForPointer(input.pageX, state.activeDrag.deltaX, windowWidth)
        motion.y.pos = motion.y.dest = input.pageY - state.activeDrag.deltaY
        return
      }
      case 'pointerup': {
        if (state.activeDrag == null || state.activeDrag.pointerId !== input.pointerId) return
        const draggedCard = cardById[state.activeDrag.cardId]
        state.activeDrag.pointerX = input.pageX
        state.activeDrag.pointerY = input.pageY
        state.activeDrag.history = pushPointerSample(state.activeDrag.history, {
          x: input.pageX,
          y: input.pageY,
          time: input.timeStamp,
        })
        const dragCenterY = input.pageY - state.activeDrag.deltaY + draggedCard.sizeY / 2
        state.orderedCardIds = reorderByDraggedCenter(cards, state.orderedCardIds, draggedCard.id, dragCenterY)
        state.latestReleaseVelocity = estimateReleaseVelocity(state.activeDrag.history, input.timeStamp)

        const motion = state.motionsByCardId[draggedCard.id]
        motion.x.pos = draggedXForPointer(input.pageX, state.activeDrag.deltaX, windowWidth)
        motion.y.pos = input.pageY - state.activeDrag.deltaY
        motion.x.v = state.latestReleaseVelocity.x
        motion.y.v = state.latestReleaseVelocity.y
        state.lastReleasedCardId = draggedCard.id
        state.activeDrag = null
        state.animatedUntilTime = null
        return
      }
      default:
        return
    }
  }

  function hasUnsettledMotions() {
    for (const card of cards) {
      if (state.activeDrag?.cardId === card.id) continue
      const motion = state.motionsByCardId[card.id]
      if (!motionMostlyDone(motion.x) || !motionMostlyDone(motion.y)) {
        return true
      }
    }

    return false
  }

  function render(now) {
    const windowWidth = document.documentElement.clientWidth

    while (state.queuedInputs.length > 0) {
      const input = state.queuedInputs.shift()
      if (input != null) processInput(input, windowWidth)
    }

    const layout = computeLayoutTargets(cards, state.orderedCardIds, windowWidth)
    for (const card of cards) {
      const motion = state.motionsByCardId[card.id]
      const target = layout.targetByCardId.get(card.id)
      if (target == null) continue

      if (state.activeDrag?.cardId === card.id) {
        motion.x.pos = motion.x.dest = draggedXForPointer(state.activeDrag.pointerX, state.activeDrag.deltaX, windowWidth)
        motion.y.pos = motion.y.dest = state.activeDrag.pointerY - state.activeDrag.deltaY
        motion.x.v = 0
        motion.y.v = 0
      } else {
        motion.x.dest = target.x
        motion.y.dest = target.y
      }
    }

    let animatedUntilTime = state.animatedUntilTime ?? now
    const animationSteps = Math.min(MAX_ANIMATION_STEPS, Math.floor((now - animatedUntilTime) / 6))
    if (animationSteps > 0) {
      animatedUntilTime += animationSteps * 6
      for (const card of cards) {
        if (state.activeDrag?.cardId === card.id) continue
        const motion = state.motionsByCardId[card.id]
        stepMotion(motion.x, 'x', animationSteps)
        stepMotion(motion.y, 'y', animationSteps)
      }
    }

    if (state.lastReleasedCardId != null) {
      const releasedMotion = state.motionsByCardId[state.lastReleasedCardId]
      if (motionMostlyDone(releasedMotion.x) && motionMostlyDone(releasedMotion.y)) {
        releasedMotion.x.pos = releasedMotion.x.dest
        releasedMotion.y.pos = releasedMotion.y.dest
        releasedMotion.x.v = 0
        releasedMotion.y.v = 0
        state.lastReleasedCardId = null
      }
    }

    domCache.stack.style.height = `${layout.totalHeight + TOP_PADDING}px`
    domCache.scene.style.minHeight = `${layout.totalHeight + TOP_PADDING + 72}px`
    document.body.style.cursor = state.activeDrag == null ? 'grab' : 'grabbing'

    for (const card of cards) {
      const cardNode = domCache.cardNodesById.get(card.id)
      const motion = state.motionsByCardId[card.id]
      if (cardNode == null) continue

      const hue = 24 + card.index * 18
      const tilt = (card.index - 2) * 0.25
      const isActive = state.activeDrag?.cardId === card.id
      const isReleased = state.activeDrag == null && state.lastReleasedCardId === card.id
      cardNode.style.height = `${card.sizeY}px`
      cardNode.style.transform = `translate3d(${motion.x.pos}px, ${motion.y.pos}px, 0) rotate(${tilt}deg)`
      cardNode.style.zIndex = String(
        cardZIndex(state.orderedCardIds, state.activeDrag?.cardId ?? null, state.lastReleasedCardId, card.id),
      )
      cardNode.style.boxShadow = isActive || isReleased ? '0 28px 60px rgba(30, 24, 16, 0.24)' : '0 16px 40px rgba(30, 24, 16, 0.16)'
      cardNode.style.background = `linear-gradient(135deg, hsl(${hue} 84% ${Math.min(card.lightnessBase + 10, 92)}%), hsl(${hue + 18} 72% ${Math.max(card.lightnessBase - 8, 28)}%))`
      cardNode.style.opacity = isActive ? '0.98' : '1'
    }

    const stillAnimating = hasUnsettledMotions()
    state.animatedUntilTime = stillAnimating ? animatedUntilTime : null
    return stillAnimating
  }

  function renderFrame(now) {
    scheduledRaf = null
    if (render(now)) scheduleRender()
    resolveRenderWaiters()
  }

  async function waitForCondition(predicate, timeoutMs) {
    const deadline = performance.now() + timeoutMs
    while (performance.now() < deadline) {
      const snapshot = getSnapshot()
      if (predicate(snapshot)) return snapshot
      scheduleRender()
      await waitForNextRender()
    }

    throw new Error('Timed out while waiting for a scenario condition.')
  }

  function publishReport(report) {
    location.hash = `report=${encodeURIComponent(JSON.stringify(report))}`
  }

  async function runDragSecondCardDownScenario() {
    scheduleRender()
    await waitForNextRender()

    const initialSnapshot = getSnapshot()
    const draggedCardId = 'card-1'
    const draggedCard = initialSnapshot.cardStates[draggedCardId]
    const nextCard = initialSnapshot.cardStates['card-2']
    const startX = draggedCard.x + ROW_SIZE_X / 2
    const startY = draggedCard.y + draggedCard.sizeY / 2
    const moveX = startX + 120
    const moveY = nextCard.y + nextCard.sizeY / 2 + 8

    queueInput({
      type: 'pointerdown',
      cardId: draggedCardId,
      pointerId: 1,
      pageX: startX,
      pageY: startY,
      timeStamp: 0,
    })
    await waitForNextRender()

    queueInput({
      type: 'pointermove',
      pointerId: 1,
      pageX: startX + 64,
      pageY: startY + 36,
      timeStamp: 36,
    })
    await waitForNextRender()

    queueInput({
      type: 'pointermove',
      pointerId: 1,
      pageX: moveX,
      pageY: moveY,
      timeStamp: 92,
    })
    await waitForNextRender()

    const beforeRelease = getSnapshot()

    queueInput({
      type: 'pointerup',
      pointerId: 1,
      pageX: moveX,
      pageY: moveY,
      timeStamp: 108,
    })

    const whileSettling = await waitForCondition(
      (snapshot) => snapshot.lastReleasedCardId === draggedCardId && snapshot.topCardId === draggedCardId,
      5_000,
    )
    const afterSettle = await waitForCondition((snapshot) => snapshot.lastReleasedCardId == null, 8_000)

    return {
      orderBeforeRelease: beforeRelease.orderedCardIds,
      releasedCardId: draggedCardId,
      topCardIdAfterSettle: afterSettle.topCardId,
      topCardIdWhileSettling: whileSettling.topCardId,
    }
  }

  async function runScenario(scenario, requestId) {
    publishReport({ phase: 'loading', requestId, scenario })
    scheduleRender()
    await waitForNextRender()
    publishReport({ phase: 'running', requestId, scenario })

    try {
      switch (scenario) {
        case 'drag-second-card-down': {
          const result = await runDragSecondCardDownScenario()
          publishReport({
            phase: 'ready',
            requestId,
            scenario,
            ...result,
          })
          return
        }
        default:
          throw new Error(`Unknown scenario: ${scenario}`)
      }
    } catch (error) {
      publishReport({
        phase: 'error',
        requestId,
        scenario,
        message: error instanceof Error ? error.message : String(error),
      })
    }
  }

  render(document.timeline.currentTime ?? 0)

  return {
    getSnapshot,
    runScenario,
  }
}
