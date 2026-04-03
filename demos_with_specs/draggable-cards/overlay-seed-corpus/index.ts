import {
  buildCards,
  CARD_WIDTH,
  computeDraggedX,
  estimateReleaseVelocity,
  isSettled,
  measureFlow,
  reorderByMidpoint,
  springToward,
  TOP_PADDING,
  type CardSpec,
  type PointerSample,
} from './logic'

type Report = {
  phase: 'loading' | 'running' | 'ready' | 'error'
  requestId: string
  scenario: string
  orderedCardIds: string[]
  topCardId: string | null
  settled: boolean
  message?: string
}

type CardState = CardSpec & {
  x: number
  y: number
  vx: number
  vy: number
  element: HTMLDivElement
}

type DragState = {
  id: number
  grabOffsetX: number
  grabOffsetY: number
  pointerX: number
  pointerY: number
  samples: PointerSample[]
}

type PointerLike = {
  clientX: number
  clientY: number
}

const FRAME_VELOCITY_SCALE = 16.667

const app = document.getElementById('app')
const reportNode = document.getElementById('report')

if (!app || !reportNode) {
  throw new Error('missing app root')
}

const params = new URLSearchParams(location.search)
const scenario = params.get('scenario') ?? 'interactive'
const requestId = params.get('requestId') ?? crypto.randomUUID()

class DraggableCardsDemo {
  private readonly cards = buildCards()
  private readonly cardsById = new Map<number, CardState>()
  private ordered = this.cards.map((card) => card.id)
  private drag: DragState | null = null
  private settlingCardId: number | null = null
  private settlingStartedAt: number | null = null
  private settleResolve: (() => void) | null = null
  private phase: Report['phase'] = 'loading'

  constructor(private readonly host: HTMLElement) {
    this.host.classList.add('stack')
    this.renderChrome()
    this.renderCards()
    this.snapToTargets()
    this.renderFrame(0)
    this.publish('loading')
    window.addEventListener('resize', this.onResize)
    requestAnimationFrame(this.tick)
  }

  private renderChrome() {
    const chrome = document.createElement('div')
    chrome.className = 'chrome'
    chrome.innerHTML = `
      <div class="eyebrow">Overlay seed corpus</div>
      <div class="title">Draggable cards</div>
    `
    this.host.append(chrome)
  }

  private renderCards() {
    for (const card of this.cards) {
      const element = document.createElement('div')
      element.className = 'card'
      element.dataset.cardId = String(card.id)
      element.style.height = `${card.sizeY}px`
      element.style.background = `linear-gradient(180deg, hsl(220 70% ${card.lightnessBase + 12}%), hsl(220 55% ${card.lightnessBase}%))`
      element.innerHTML = `
        <div class="card-body">
          <div class="card-id">Card ${card.id}</div>
          <div class="card-size">${Math.round(card.sizeY)} px tall</div>
        </div>
        <div class="card-pill">Drag me</div>
      `
      element.addEventListener('pointerdown', (event) => {
        event.preventDefault()
        event.stopPropagation()
        element.setPointerCapture(event.pointerId)
        this.handlePointerDown(card.id, { clientX: event.clientX, clientY: event.clientY })
      })
      this.host.append(element)
      this.cardsById.set(card.id, {
        ...card,
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        element,
      })
    }
  }

  private onResize = () => {
    this.renderFrame(0)
  }

  private handlePointerDown(cardId: number, event: PointerLike, time = performance.now()) {
    const card = this.cardsById.get(cardId)
    if (!card) {
      return
    }

    this.drag = {
      id: cardId,
      grabOffsetX: event.clientX - card.x,
      grabOffsetY: event.clientY - card.y,
      pointerX: event.clientX,
      pointerY: event.clientY,
      samples: [{ x: event.clientX, y: event.clientY, time }],
    }
    this.settlingCardId = cardId

    window.addEventListener('pointermove', this.onPointerMove)
    window.addEventListener('pointerup', this.onPointerUp)
    window.addEventListener('pointercancel', this.onPointerUp)
  }

  private handlePointerMove(event: PointerLike, time = performance.now()) {
    if (!this.drag) {
      return
    }

    this.drag.pointerX = event.clientX
    this.drag.pointerY = event.clientY
    this.drag.samples = [...this.drag.samples, { x: event.clientX, y: event.clientY, time }]
    this.ordered = reorderByMidpoint(this.ordered, this.drag.id, event.clientY, this.cards)
    this.renderFrame(1 / 60)
  }

  private handlePointerUp(event: PointerLike, time = performance.now()) {
    if (!this.drag) {
      return
    }

    const releasedId = this.drag.id
    const releaseVelocity = estimateReleaseVelocity(this.drag.samples, time)
    const card = this.cardsById.get(releasedId)
    if (!card) {
      this.drag = null
      return
    }

    card.vx = releaseVelocity.x * FRAME_VELOCITY_SCALE
    card.vy = releaseVelocity.y * FRAME_VELOCITY_SCALE
    card.x = computeDraggedX(event.clientX, this.drag.grabOffsetX, window.innerWidth)
    card.y = event.clientY - this.drag.grabOffsetY
    this.settlingCardId = releasedId
    this.settlingStartedAt = performance.now()
    this.drag = null
    this.publish('running')

    window.removeEventListener('pointermove', this.onPointerMove)
    window.removeEventListener('pointerup', this.onPointerUp)
    window.removeEventListener('pointercancel', this.onPointerUp)
  }

  private onPointerMove = (event: PointerEvent) => {
    this.handlePointerMove({ clientX: event.clientX, clientY: event.clientY }, performance.now())
  }

  private onPointerUp = (event: PointerEvent) => {
    this.handlePointerUp({ clientX: event.clientX, clientY: event.clientY }, performance.now())
  }

  private cardTargets(excludeId: number | null = this.drag?.id ?? null) {
    const ordered = excludeId === null ? this.ordered : this.ordered.filter((id) => id !== excludeId)
    return measureFlow(ordered, this.cards, TOP_PADDING).map((card) => ({
      id: card.id,
      x: (window.innerWidth - CARD_WIDTH) / 2,
      y: card.top,
      midpoint: card.midpoint,
    }))
  }

  private snapToTargets(excludeId: number | null = null) {
    for (const target of this.cardTargets(excludeId)) {
      const card = this.cardsById.get(target.id)
      if (!card) {
        continue
      }

      card.x = target.x
      card.y = target.y
      card.vx = 0
      card.vy = 0
    }
  }

  private renderFrame(dtSeconds: number, now = performance.now()) {
    const draggedId = this.drag?.id ?? null
    const targets = this.cardTargets(draggedId)

    for (const target of targets) {
      const card = this.cardsById.get(target.id)
      if (!card) {
        continue
      }

      if (draggedId === card.id && this.drag) {
        card.x = computeDraggedX(this.drag.pointerX, this.drag.grabOffsetX, window.innerWidth)
        card.y = this.drag.pointerY - this.drag.grabOffsetY
        card.vx = 0
        card.vy = 0
        continue
      }

      const nextX = target.x
      const nextY = target.y
      const springX = springToward(card.x, card.vx, nextX, dtSeconds)
      const springY = springToward(card.y, card.vy, nextY, dtSeconds)
      card.x = springX.value
      card.vx = springX.velocity
      card.y = springY.value
      card.vy = springY.velocity
    }

    for (const card of this.cardsById.values()) {
      const zIndex = draggedId === card.id || this.settlingCardId === card.id ? 20 : 1 + this.ordered.indexOf(card.id)
      card.element.style.zIndex = String(zIndex)
      card.element.style.transform = `translate3d(${card.x}px, ${card.y}px, 0)`
    }

    if (!this.drag && this.settlingCardId !== null) {
      const settlingCard = this.cardsById.get(this.settlingCardId)
      const target = this.cardTargets(null).find((item) => item.id === this.settlingCardId)
      const timedOut = this.settlingStartedAt !== null && now - this.settlingStartedAt > 900
      if (
        settlingCard &&
        target &&
        (timedOut || isSettled(settlingCard.x, settlingCard.y, settlingCard.vx, settlingCard.vy, target.x, target.y))
      ) {
        settlingCard.x = target.x
        settlingCard.y = target.y
        settlingCard.vx = 0
        settlingCard.vy = 0
        this.settlingCardId = null
        this.settlingStartedAt = null
        this.snapToTargets(null)
        this.publish('ready')
        this.settleResolve?.()
        this.settleResolve = null
      }
    }

    if (this.phase === 'loading' && !this.drag) {
      this.publish('ready')
    }
  }

  private tick = () => {
    this.renderFrame(1 / 60, performance.now())
    requestAnimationFrame(this.tick)
  }

  private snapshot(phase: Report['phase']): Report {
    return {
      phase,
      requestId,
      scenario,
      orderedCardIds: this.ordered.map(String),
      topCardId: this.settlingCardId === null ? null : String(this.settlingCardId),
      settled: phase === 'ready',
    }
  }

  private publish(phase: Report['phase']) {
    this.phase = phase
    reportNode.textContent = JSON.stringify(this.snapshot(phase))
  }

  async runScenario(name: string) {
    try {
      if (name === 'reorder-before-release') {
        await this.runReorderBeforeReleaseScenario()
      } else if (name === 'top-until-settle') {
        await this.runTopUntilSettleScenario()
      } else {
        this.publish('ready')
      }
    } catch (error) {
      this.publish('error')
      reportNode.textContent = JSON.stringify({
        ...this.snapshot('error'),
        message: error instanceof Error ? error.message : String(error),
      })
    }
  }

  private async runReorderBeforeReleaseScenario() {
    const start = this.cardCenter(2)
    this.handlePointerDown(2, start, 0)
    this.handlePointerMove({ clientX: start.x + 18, clientY: this.flowMidpointFor(1, 2) - 2 }, 40)
    this.publish('running')
    await this.nextFrame()
    this.handlePointerUp({ clientX: start.x + 18, clientY: this.flowMidpointFor(1, 2) - 2 }, 80)
    await this.waitForSettle()
  }

  private async runTopUntilSettleScenario() {
    const start = this.cardCenter(2)
    this.handlePointerDown(2, start, 0)
    this.publish('running')
    this.handlePointerMove({ clientX: start.x + 14, clientY: start.y + 40 }, 40)
    this.handlePointerMove({ clientX: start.x + 34, clientY: start.y + 120 }, 80)
    this.handlePointerUp({ clientX: start.x + 34, clientY: start.y + 120 }, 120)
    await this.waitForSettle()
  }

  private async nextFrame() {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
  }

  private async waitForSettle() {
    if (this.settlingCardId === null) {
      return
    }

    await new Promise<void>((resolve) => {
      this.settleResolve = resolve
    })
  }

  private cardCenter(cardId: number) {
    const target = this.cardTargets(null).find((item) => item.id === cardId)
    if (!target) {
      throw new Error(`missing target for card ${cardId}`)
    }

    const card = this.cardsById.get(cardId)
    if (!card) {
      throw new Error(`missing card ${cardId}`)
    }

    return {
      x: target.x + CARD_WIDTH / 2,
      y: target.y + card.sizeY / 2,
    }
  }

  private flowMidpointFor(cardId: number, draggedId: number) {
    const flow = measureFlow(this.ordered.filter((id) => id !== draggedId), this.cards, TOP_PADDING)
    const card = flow.find((item) => item.id === cardId)
    if (!card) {
      throw new Error(`missing flow midpoint for card ${cardId}`)
    }

    return card.midpoint
  }
}

const demo = new DraggableCardsDemo(app)
void demo.runScenario(scenario)
