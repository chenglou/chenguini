import {
  CARD_WIDTH,
  TOP_PADDING,
  cardZIndex,
  estimateReleaseVelocity,
  getCenteredX,
  getStackLayout,
  makeCards,
  reorderByMidpoint,
  trimPointerHistory,
} from './model.js'

const MAX_ANIMATION_STEPS = 300
const MS_PER_ANIMATION_STEP = 6
const SPRING_STIFFNESS = 320
const SPRING_DAMPING = 32
const SETTLE_DISTANCE_EPSILON = 0.5
const SETTLE_VELOCITY_EPSILON = 6

function spring(position = 0) {
  return {
    pos: position,
    dest: position,
    v: 0,
    k: SPRING_STIFFNESS,
    b: SPRING_DAMPING,
  }
}

function setSpring(s, position) {
  s.pos = position
  s.dest = position
  s.v = 0
}

function stepSpring(s) {
  const dt = MS_PER_ANIMATION_STEP / 1000
  const springForce = -s.k * (s.pos - s.dest)
  const dampingForce = -s.b * s.v
  const acceleration = springForce + dampingForce
  s.v += acceleration * dt
  s.pos += s.v * dt
}

function isSpringSettled(s) {
  return (
    Math.abs(s.dest - s.pos) <= SETTLE_DISTANCE_EPSILON &&
    Math.abs(s.v) <= SETTLE_VELOCITY_EPSILON
  )
}

function sameOrder(a, b) {
  if (a.length !== b.length) {
    return false
  }
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) {
      return false
    }
  }
  return true
}

function getCard(cards, cardId) {
  for (const card of cards) {
    if (card.id === cardId) {
      return card
    }
  }
  throw new Error(`Missing card ${cardId}`)
}

function makeEventSample(event, cardId = null) {
  return {
    cardId,
    pageX: event.pageX,
    pageY: event.pageY,
    pointerId: event.pointerId,
    time: event.timeStamp,
  }
}

export function mountDemo(root) {
  const cards = makeCards()
  const cardMotion = {}
  for (const card of cards) {
    cardMotion[card.id] = {
      x: spring(),
      y: spring(),
      initialized: false,
    }
  }

  const board = document.createElement('div')
  board.className = 'board'
  root.appendChild(board)

  const caption = document.createElement('div')
  caption.className = 'board-caption'
  caption.textContent = 'Drag a card right away. The order updates as soon as a midpoint is crossed.'
  board.appendChild(caption)

  const cardNodes = {}
  for (const card of cards) {
    const node = document.createElement('div')
    node.className = 'card'
    node.dataset.cardId = card.id
    node.style.height = `${card.sizeY}px`
    node.style.background = `linear-gradient(180deg, hsl(205 48% ${Math.min(card.lightnessBase + 8, 88)}%), hsl(205 38% ${card.lightnessBase}%))`

    const title = document.createElement('h2')
    title.className = 'card-title'
    title.textContent = card.title
    node.appendChild(title)

    const body = document.createElement('p')
    body.className = 'card-body'
    body.textContent = `${Math.round(card.sizeY)}px tall with a seeded tone.`
    node.appendChild(body)

    cardNodes[card.id] = node
    board.appendChild(node)
  }

  const params = new URLSearchParams(window.location.search)
  const scenario = params.get('scenario') ?? ''
  const requestId = params.get('requestId') ?? ''

  const st = {
    cards,
    orderedCardIds: cards.map((card) => card.id),
    drag: null,
    lastDraggedCardId: null,
    animatedUntilTime: null,
    events: {
      pointerDown: null,
      pointerMove: null,
      pointerUp: null,
      resize: false,
    },
  }

  let scheduledRaf = null
  let renderWaiters = []

  function getDraggedCardId() {
    return st.drag == null ? null : st.drag.cardId
  }

  function getLayoutById() {
    const layoutById = {}
    const layout = getStackLayout({
      cards: st.cards,
      orderedCardIds: st.orderedCardIds,
    })
    for (const entry of layout) {
      layoutById[entry.id] = entry
    }
    return layoutById
  }

  function getCardCenter(cardId) {
    const card = getCard(st.cards, cardId)
    const motion = cardMotion[cardId]
    return {
      x: motion.x.pos + CARD_WIDTH / 2,
      y: motion.y.pos + card.sizeY / 2,
    }
  }

  function getTopCardId() {
    const draggedCardId = getDraggedCardId()
    let topCardId = st.cards[0].id
    let topZIndex = -Infinity

    for (const card of st.cards) {
      const zIndex = cardZIndex({
        cardId: card.id,
        orderedCardIds: st.orderedCardIds,
        draggedCardId,
        lastDraggedCardId: st.lastDraggedCardId,
      })
      if (zIndex > topZIndex) {
        topZIndex = zIndex
        topCardId = card.id
      }
    }

    return topCardId
  }

  function getSnapshot() {
    return {
      draggedCardId: getDraggedCardId(),
      lastDraggedCardId: st.lastDraggedCardId,
      orderedCardIds: [...st.orderedCardIds],
      topCardId: getTopCardId(),
    }
  }

  function flushRenderWaiters() {
    const waiters = renderWaiters
    renderWaiters = []
    const snapshot = getSnapshot()
    for (const waiter of waiters) {
      waiter(snapshot)
    }
  }

  function waitForNextRender() {
    return new Promise((resolve) => {
      renderWaiters.push(resolve)
      scheduleRender()
    })
  }

  function scheduleRender() {
    if (scheduledRaf != null) {
      return
    }

    scheduledRaf = requestAnimationFrame((now) => {
      scheduledRaf = null
      if (render(now)) {
        scheduleRender()
      }
    })
  }

  function queuePointerDown(sample) {
    st.events.pointerDown = sample
    scheduleRender()
  }

  function queuePointerMove(sample) {
    st.events.pointerMove = sample
    scheduleRender()
  }

  function queuePointerUp(sample) {
    st.events.pointerUp = sample
    scheduleRender()
  }

  function publishReport(report) {
    if (scenario === '' || requestId === '') {
      return
    }
    window.location.hash = `report=${encodeURIComponent(JSON.stringify(report))}`
  }

  function handlePointerDown(event) {
    if (event.button !== 0) {
      return
    }
    if (!(event.target instanceof Element)) {
      return
    }

    const cardNode = event.target.closest('[data-card-id]')
    if (!(cardNode instanceof HTMLElement)) {
      return
    }

    const cardId = cardNode.dataset.cardId
    if (cardId == null) {
      return
    }

    event.preventDefault()
    queuePointerDown(makeEventSample(event, cardId))
  }

  function handlePointerMove(event) {
    if (st.drag == null || event.pointerId !== st.drag.pointerId) {
      return
    }
    queuePointerMove(makeEventSample(event))
  }

  function handlePointerUp(event) {
    if (st.drag == null || event.pointerId !== st.drag.pointerId) {
      return
    }
    queuePointerUp(makeEventSample(event))
  }

  function render(now) {
    const windowWidth = document.documentElement.clientWidth
    const centeredX = getCenteredX(windowWidth, CARD_WIDTH)
    let releasedCardId = null
    let releasedVelocity = null

    if (st.events.pointerDown != null && st.drag == null) {
      const { cardId, pointerId, pageX, pageY, time } = st.events.pointerDown
      if (cardId != null) {
        const motion = cardMotion[cardId]
        st.drag = {
          cardId,
          pointerId,
          deltaX: pageX - motion.x.pos,
          deltaY: pageY - motion.y.pos,
          pointerX: pageX,
          pointerY: pageY,
          pointerHistory: [{ x: pageX, y: pageY, time }],
        }
        st.lastDraggedCardId = null
      }
    }

    if (st.drag != null && st.events.pointerMove != null && st.events.pointerMove.pointerId === st.drag.pointerId) {
      st.drag.pointerX = st.events.pointerMove.pageX
      st.drag.pointerY = st.events.pointerMove.pageY
      st.drag.pointerHistory = trimPointerHistory(
        [
          ...st.drag.pointerHistory,
          {
            x: st.events.pointerMove.pageX,
            y: st.events.pointerMove.pageY,
            time: st.events.pointerMove.time,
          },
        ],
        st.events.pointerMove.time,
      )
    }

    if (st.drag != null) {
      const draggedCard = getCard(st.cards, st.drag.cardId)
      const draggedY = st.drag.pointerY - st.drag.deltaY
      const draggedCenterY = draggedY + draggedCard.sizeY / 2
      const nextOrder = reorderByMidpoint({
        cards: st.cards,
        orderedCardIds: st.orderedCardIds,
        draggedCardId: st.drag.cardId,
        draggedCenterY,
      })
      if (!sameOrder(nextOrder, st.orderedCardIds)) {
        st.orderedCardIds = nextOrder
      }
    }

    if (st.drag != null && st.events.pointerUp != null && st.events.pointerUp.pointerId === st.drag.pointerId) {
      const drag = st.drag
      const finalHistory = trimPointerHistory(
        [
          ...drag.pointerHistory,
          {
            x: st.events.pointerUp.pageX,
            y: st.events.pointerUp.pageY,
            time: st.events.pointerUp.time,
          },
        ],
        st.events.pointerUp.time,
      )
      releasedCardId = drag.cardId
      releasedVelocity = estimateReleaseVelocity(finalHistory, st.events.pointerUp.time)
      st.drag = null
      st.lastDraggedCardId = releasedCardId
    }

    const layoutById = getLayoutById()
    for (const card of st.cards) {
      const motion = cardMotion[card.id]
      const target = layoutById[card.id]
      if (!motion.initialized) {
        setSpring(motion.x, centeredX)
        setSpring(motion.y, target.y)
        motion.initialized = true
      }
    }

    const draggedCardId = getDraggedCardId()
    for (const card of st.cards) {
      const motion = cardMotion[card.id]
      const target = layoutById[card.id]
      if (draggedCardId === card.id) {
        const rawX = st.drag.pointerX - st.drag.deltaX
        const dragX = rawX + (centeredX - rawX) / 1.5
        const dragY = st.drag.pointerY - st.drag.deltaY
        motion.x.pos = dragX
        motion.x.dest = dragX
        motion.x.v = 0
        motion.y.pos = dragY
        motion.y.dest = dragY
        motion.y.v = 0
      } else {
        motion.x.dest = centeredX
        motion.y.dest = target.y
      }
    }

    if (releasedCardId != null && releasedVelocity != null) {
      const motion = cardMotion[releasedCardId]
      motion.x.v = releasedVelocity.x
      motion.y.v = releasedVelocity.y
    }

    let animatedUntilTime = st.animatedUntilTime ?? now
    const steps = Math.min(
      MAX_ANIMATION_STEPS,
      Math.floor((now - animatedUntilTime) / MS_PER_ANIMATION_STEP),
    )
    animatedUntilTime += steps * MS_PER_ANIMATION_STEP

    for (let step = 0; step < steps; step += 1) {
      for (const card of st.cards) {
        if (draggedCardId === card.id) {
          continue
        }
        const motion = cardMotion[card.id]
        stepSpring(motion.x)
        stepSpring(motion.y)
      }
    }

    let stillAnimating = false
    for (const card of st.cards) {
      if (draggedCardId === card.id) {
        continue
      }
      const motion = cardMotion[card.id]
      if (!isSpringSettled(motion.x) || !isSpringSettled(motion.y)) {
        stillAnimating = true
      }
    }

    if (draggedCardId == null && st.lastDraggedCardId != null) {
      const releasedMotion = cardMotion[st.lastDraggedCardId]
      if (isSpringSettled(releasedMotion.x) && isSpringSettled(releasedMotion.y)) {
        st.lastDraggedCardId = null
      }
    }

    st.animatedUntilTime = stillAnimating ? animatedUntilTime : null
    st.events.pointerDown = null
    st.events.pointerMove = null
    st.events.pointerUp = null
    st.events.resize = false

    for (const card of st.cards) {
      const node = cardNodes[card.id]
      const motion = cardMotion[card.id]
      const zIndex = cardZIndex({
        cardId: card.id,
        orderedCardIds: st.orderedCardIds,
        draggedCardId,
        lastDraggedCardId: st.lastDraggedCardId,
      })
      const raised = draggedCardId === card.id || st.lastDraggedCardId === card.id
      node.style.transform = `translate3d(${motion.x.pos}px, ${motion.y.pos}px, 0)`
      node.style.zIndex = String(zIndex)
      node.style.boxShadow = raised
        ? '0 28px 60px rgba(21, 35, 45, 0.24)'
        : '0 12px 30px rgba(21, 35, 45, 0.14)'
      node.style.cursor = draggedCardId === card.id ? 'grabbing' : 'grab'
    }

    document.body.style.cursor = draggedCardId == null ? 'default' : 'grabbing'
    flushRenderWaiters()
    return stillAnimating
  }

  async function waitUntilSettled(maxFrames = 240) {
    for (let i = 0; i < maxFrames; i += 1) {
      const snapshot = getSnapshot()
      if (snapshot.draggedCardId == null && snapshot.lastDraggedCardId == null) {
        return snapshot
      }
      await waitForNextRender()
    }
    throw new Error('Timed out waiting for the released card to settle')
  }

  async function runReorderBeforeReleaseScenario() {
    let time = 1_000
    await waitForNextRender()

    const start = getCardCenter('card-0')
    const nextCardCenterY = getLayoutById()['card-1'].centerY

    queuePointerDown({
      cardId: 'card-0',
      pointerId: 1,
      pageX: start.x,
      pageY: start.y,
      time,
    })
    await waitForNextRender()

    time += 16
    queuePointerMove({
      pointerId: 1,
      pageX: start.x,
      pageY: nextCardCenterY + 12,
      time,
    })
    const beforeRelease = await waitForNextRender()

    time += 16
    queuePointerUp({
      pointerId: 1,
      pageX: start.x,
      pageY: nextCardCenterY + 12,
      time,
    })
    await waitForNextRender()
    await waitUntilSettled()

    return {
      reorderHappenedBeforeRelease: beforeRelease.orderedCardIds[0] === 'card-1',
      orderedCardIdsBeforeRelease: beforeRelease.orderedCardIds,
      releasedCardId: 'card-0',
    }
  }

  async function runTopUntilSettleScenario() {
    let time = 2_000
    await waitForNextRender()

    const start = getCardCenter('card-0')
    const nextCardCenterY = getLayoutById()['card-1'].centerY

    queuePointerDown({
      cardId: 'card-0',
      pointerId: 1,
      pageX: start.x,
      pageY: start.y,
      time,
    })
    await waitForNextRender()

    time += 16
    queuePointerMove({
      pointerId: 1,
      pageX: start.x,
      pageY: nextCardCenterY - 10,
      time,
    })
    await waitForNextRender()

    time += 16
    queuePointerMove({
      pointerId: 1,
      pageX: start.x,
      pageY: nextCardCenterY + 36,
      time,
    })
    await waitForNextRender()

    time += 16
    queuePointerMove({
      pointerId: 1,
      pageX: start.x,
      pageY: nextCardCenterY + 76,
      time,
    })
    await waitForNextRender()

    time += 16
    queuePointerUp({
      pointerId: 1,
      pageX: start.x,
      pageY: nextCardCenterY + 76,
      time,
    })

    const topCardIdsWhileSettling = []
    for (let i = 0; i < 240; i += 1) {
      const snapshot = await waitForNextRender()
      if (snapshot.lastDraggedCardId == null) {
        break
      }
      topCardIdsWhileSettling.push(snapshot.topCardId)
    }

    const finalSnapshot = await waitUntilSettled()
    return {
      releasedCardId: 'card-0',
      releasedCardStayedOnTop: topCardIdsWhileSettling.every((cardId) => cardId === 'card-0'),
      settlingFrameCount: topCardIdsWhileSettling.length,
      topCardIdsWhileSettling,
      orderedCardIdsAfterSettle: finalSnapshot.orderedCardIds,
    }
  }

  async function runScenario() {
    if (scenario === '' || requestId === '') {
      return
    }

    publishReport({ phase: 'loading', requestId, scenario })
    try {
      const result =
        scenario === 'reorder-before-release'
          ? await runReorderBeforeReleaseScenario()
          : scenario === 'top-until-settle'
            ? await runTopUntilSettleScenario()
            : (() => {
                throw new Error(`Unknown scenario ${scenario}`)
              })()

      publishReport({
        phase: 'ready',
        requestId,
        scenario,
        ...result,
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

  window.addEventListener('pointerdown', handlePointerDown)
  window.addEventListener('pointermove', handlePointerMove)
  window.addEventListener('pointerup', handlePointerUp)
  window.addEventListener('pointercancel', handlePointerUp)
  window.addEventListener('resize', () => {
    st.events.resize = true
    scheduleRender()
  })
  window.addEventListener('dragstart', (event) => event.preventDefault())

  scheduleRender()
  queueMicrotask(() => {
    void runScenario()
  })
}
