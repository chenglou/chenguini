import {
  getHighResImageUrl,
  getLowResImageUrl,
  photoGalleryData,
  type PhotoData,
} from './data'
import {
  computeDismissScrollTop,
  computeGridLayout,
  computeLineLayout,
  getVisibleGridRows,
  routeLineModeClick,
  GRID_CAPTION_HEIGHT,
  GRID_PAGE_PADDING,
  GRID_TOP_PADDING,
  LINE_CAPTION_HEIGHT,
  LINE_LEFT_STRIP_WIDTH,
  LINE_RIGHT_STRIP_WIDTH,
  type GridLayout,
  type GridCardLayout,
  type LineCardLayout,
} from './layout'
import {
  msPerAnimationStep,
  spring,
  springGoToEnd,
  springMostlyDone,
  springStep,
  type Spring,
} from './springs'

type ScenarioReport = {
  phase: 'loading' | 'running' | 'ready' | 'error'
  requestId: string
  scenario: string
  status?: 'ok' | 'error'
  data?: {
    hashSequence?: string[]
    scrollTopBeforeLock?: number
    scrollTopDuringLock?: number
    dismissedHash?: string
    finalMode?: 'grid' | 'line'
    focusedIndex?: number
    beforeDismissVisible?: boolean
    afterDismissVisible?: boolean
    topOffset?: number
    selectedText?: string
    hashAfterClick?: string
    modeAfterClick?: 'grid' | 'line'
    mountedCount?: number
    itemCount?: number
  }
  message?: string
}

type CardRefs = {
  root: HTMLDivElement
  media: HTMLDivElement
  lowRes: HTMLDivElement
  highRes: HTMLImageElement
  caption: HTMLDivElement
  captionText: HTMLSpanElement
}

type CardSprings = {
  x: Spring
  y: Spring
  width: Spring
  height: Spring
  hoverScale: Spring
  hoverOffsetX: Spring
  hoverOffsetY: Spring
}

type PendingClick = {
  target: EventTarget | null
  clientX: number
  clientY: number
}

const query = new URLSearchParams(window.location.search)
const scenario = query.get('scenario') ?? ''
const requestId = query.get('requestId') ?? ''
const isScenarioMode = scenario !== ''

const appRoot = document.querySelector<HTMLDivElement>('#app')
if (appRoot == null) throw new Error('Missing #app root')

const reportEl = document.querySelector<HTMLScriptElement>('#scenario-report')
if (reportEl == null) throw new Error('Missing #scenario-report node')

class PhotoGalleryApp {
  readonly root: HTMLDivElement
  readonly reportEl: HTMLScriptElement
  readonly items: PhotoData[]
  readonly idToIndex = new Map<string, number>()
  readonly cardRefs = new Map<string, CardRefs>()
  readonly cardSprings = new Map<string, CardSprings>()

  scroller = document.createElement('div')
  gridStage = document.createElement('div')
  lineStage = document.createElement('div')
  lineBackdrop = document.createElement('div')
  leftStrip = document.createElement('div')
  rightStrip = document.createElement('div')
  githubLink = document.createElement('a')

  viewportWidth = window.innerWidth
  viewportHeight = window.innerHeight
  gridLayout: GridLayout
  lineLayout: LineCardLayout[] = []
  focusedId: string | null = null
  previousMode: 'grid' | 'line' = 'grid'
  lockedScrollTop: number | null = null
  pendingScrollTop: number | null = null
  pendingClick: PendingClick | null = null
  pendingKey: KeyboardEvent | null = null
  pointerX = 0
  pointerY = 0
  hoveredId: string | null = null
  mountedCount = 0
  selectedText = ''
  reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  scheduled = false
  lastAnimationTime = performance.now()

  constructor(root: HTMLDivElement, reportEl: HTMLScriptElement, items: PhotoData[]) {
    this.root = root
    this.reportEl = reportEl
    this.items = items
    this.gridLayout = computeGridLayout({
      viewportWidth: this.viewportWidth,
      items: this.items,
    })

    for (let index = 0; index < items.length; index += 1) {
      const item = items[index]
      if (item == null) continue
      this.idToIndex.set(item.id, index)
      const layout = this.gridLayout.cards[index]
      this.cardSprings.set(item.id, {
        x: spring(layout?.x ?? GRID_PAGE_PADDING),
        y: spring(layout?.y ?? GRID_TOP_PADDING),
        width: spring(layout?.cardWidth ?? 220),
        height: spring(layout?.cardHeight ?? 272),
        hoverScale: spring(1),
        hoverOffsetX: spring(0),
        hoverOffsetY: spring(0),
      })
    }
  }

  start() {
    try {
      if (isScenarioMode) this.publishReport({phase: 'loading', requestId, scenario})
      this.installShell()
      this.syncFromHash()
      this.installEvents()
      this.render(performance.now())
      if (isScenarioMode) {
        this.publishReport({phase: 'running', requestId, scenario})
        void this.runScenario(scenario)
      }
    } catch (error) {
      this.publishReport({
        phase: 'error',
        requestId,
        scenario,
        status: 'error',
        message: error instanceof Error ? error.message : 'Bootstrap failed',
      })
    }
  }

  installShell() {
    document.documentElement.style.background =
      'radial-gradient(circle at top, rgba(61, 94, 162, 0.18), transparent 36%), linear-gradient(180deg, #091424 0%, #08111d 60%, #050811 100%)'
    document.body.style.margin = '0'
    document.body.style.background =
      'radial-gradient(circle at top, rgba(61, 94, 162, 0.18), transparent 36%), linear-gradient(180deg, #091424 0%, #08111d 60%, #050811 100%)'
    document.body.style.color = '#edf2ff'
    document.body.style.fontFamily =
      '"Iowan Old Style", "Palatino Linotype", "Book Antiqua", Georgia, serif'
    document.body.style.overflow = 'hidden'
    document.body.style.userSelect = 'none'

    this.root.style.position = 'fixed'
    this.root.style.inset = '0'
    this.root.style.overflow = 'hidden'

    this.scroller.style.position = 'absolute'
    this.scroller.style.inset = '0'
    this.scroller.style.overflowX = 'hidden'
    this.scroller.style.overflowY = 'auto'
    this.scroller.style.setProperty('-webkit-overflow-scrolling', 'touch')
    this.scroller.style.touchAction = 'pan-y'

    this.gridStage.style.position = 'relative'
    this.gridStage.style.width = '100%'

    this.lineStage.style.position = 'fixed'
    this.lineStage.style.inset = '0'
    this.lineStage.style.display = 'none'
    this.lineStage.style.overflow = 'hidden'
    this.lineStage.style.pointerEvents = 'auto'
    this.lineStage.style.background =
      'linear-gradient(180deg, rgba(6, 10, 18, 0.84), rgba(3, 6, 12, 0.96))'
    this.lineStage.style.backdropFilter = 'blur(10px)'

    this.lineBackdrop.style.position = 'absolute'
    this.lineBackdrop.style.inset = '0'
    this.lineBackdrop.style.pointerEvents = 'auto'
    this.lineBackdrop.dataset.lineStrip = 'backdrop'

    this.leftStrip.style.position = 'absolute'
    this.leftStrip.style.inset = '0 auto 0 0'
    this.leftStrip.style.width = `${LINE_LEFT_STRIP_WIDTH}px`
    this.leftStrip.style.pointerEvents = 'auto'
    this.leftStrip.style.background = 'transparent'
    this.leftStrip.dataset.lineStrip = 'left'

    this.rightStrip.style.position = 'absolute'
    this.rightStrip.style.inset = '0 0 0 auto'
    this.rightStrip.style.width = `${LINE_RIGHT_STRIP_WIDTH}px`
    this.rightStrip.style.pointerEvents = 'auto'
    this.rightStrip.style.background = 'transparent'
    this.rightStrip.dataset.lineStrip = 'right'

    this.githubLink.href = 'https://github.com/'
    this.githubLink.target = '_blank'
    this.githubLink.rel = 'noreferrer'
    this.githubLink.setAttribute('aria-label', 'GitHub')
    this.githubLink.style.position = 'fixed'
    this.githubLink.style.top = '24px'
    this.githubLink.style.right = '24px'
    this.githubLink.style.width = '42px'
    this.githubLink.style.height = '42px'
    this.githubLink.style.display = 'grid'
    this.githubLink.style.placeItems = 'center'
    this.githubLink.style.borderRadius = '999px'
    this.githubLink.style.color = '#eef3ff'
    this.githubLink.style.background = 'rgba(255, 255, 255, 0.08)'
    this.githubLink.style.boxShadow = '0 12px 40px rgba(0, 0, 0, 0.3)'
    this.githubLink.innerHTML =
      '<svg viewBox="0 0 24 24" width="19" height="19" aria-hidden="true"><path fill="currentColor" d="M12 .5a12 12 0 0 0-3.79 23.39c.6.1.82-.26.82-.58v-2.03c-3.35.73-4.05-1.42-4.05-1.42-.55-1.37-1.34-1.74-1.34-1.74-1.1-.74.08-.73.08-.73 1.21.09 1.85 1.23 1.85 1.23 1.08 1.83 2.83 1.3 3.52 1 .11-.77.42-1.3.77-1.6-2.68-.3-5.5-1.33-5.5-5.92 0-1.31.47-2.39 1.24-3.23-.13-.3-.54-1.52.12-3.18 0 0 1.01-.32 3.3 1.23a11.6 11.6 0 0 1 6 0c2.28-1.55 3.29-1.23 3.29-1.23.66 1.66.25 2.88.12 3.18.78.84 1.24 1.92 1.24 3.23 0 4.6-2.83 5.61-5.53 5.91.44.38.82 1.11.82 2.24v3.33c0 .32.22.69.83.58A12 12 0 0 0 12 .5"/></svg>'

    this.root.replaceChildren(this.scroller, this.lineStage, this.githubLink)
    this.scroller.append(this.gridStage)
    this.lineStage.append(this.lineBackdrop, this.leftStrip, this.rightStrip)
  }

  installEvents() {
    window.addEventListener('resize', () => {
      this.viewportWidth = window.innerWidth
      this.viewportHeight = window.innerHeight
      this.requestRender()
    })
    window.addEventListener('hashchange', () => {
      this.syncFromHash()
      this.requestRender()
    })
    window.addEventListener('keydown', (event) => {
      this.pendingKey = event
      this.requestRender()
    })
    this.root.addEventListener('pointermove', (event) => {
      this.pointerX = event.clientX
      this.pointerY = event.clientY
      this.requestRender()
    })
    this.root.addEventListener('pointerleave', () => {
      this.hoveredId = null
      this.requestRender()
    })
    this.root.addEventListener('click', (event) => {
      this.pendingClick = {
        target: event.target,
        clientX: event.clientX,
        clientY: event.clientY,
      }
      this.requestRender()
    })
    this.scroller.addEventListener(
      'scroll',
      () => {
        this.requestRender()
      },
      {capture: true},
    )
  }

  syncFromHash() {
    const hash = window.location.hash
    if (hash === '') {
      this.focusedId = null
      return
    }
    const decoded = decodeURIComponent(hash.slice(1))
    this.focusedId = this.idToIndex.has(decoded) ? decoded : null
  }

  requestRender() {
    if (this.scheduled) return
    this.scheduled = true
    requestAnimationFrame((now) => {
      this.scheduled = false
      if (this.render(now)) this.requestRender()
    })
  }

  render(now: number) {
    const mode = this.focusedId == null ? 'grid' : 'line'
    const focusedIndex = this.focusedId == null ? null : this.idToIndex.get(this.focusedId) ?? null
    const currentScrollTop = this.scroller.scrollTop

    this.gridLayout = computeGridLayout({
      viewportWidth: this.viewportWidth,
      items: this.items,
    })
    this.lineLayout = focusedIndex == null
      ? []
      : computeLineLayout({
          viewportWidth: this.viewportWidth,
          viewportHeight: this.viewportHeight,
          items: this.items,
          focusedIndex,
        })

    if (mode === 'line' && this.previousMode === 'grid') {
      this.lockedScrollTop = currentScrollTop
    }
    if (mode === 'grid') {
      this.lockedScrollTop = null
    }

    this.handlePendingInput(mode, focusedIndex, currentScrollTop)

    const renderScrollTop = mode === 'line' && this.lockedScrollTop != null ? this.lockedScrollTop : currentScrollTop
    const visibleRows =
      mode === 'grid'
        ? getVisibleGridRows({
            rowTops: this.gridLayout.rowTops,
            rowHeights: this.gridLayout.rowHeights,
            scrollTop: renderScrollTop,
            viewportHeight: this.viewportHeight,
            overscan: 480,
          })
        : null

    this.mountAndProjectCards({
      mode,
      focusedIndex,
      visibleRows,
    })

    const stillAnimating = this.stepAnimations(now)
    this.applyCardStyles(mode, focusedIndex)
    this.hoveredId = mode === 'grid' ? this.findHoveredGridCard() : null

    this.scroller.style.overflowY = mode === 'line' ? 'hidden' : 'auto'
    this.lineStage.style.display = mode === 'line' ? 'block' : 'none'
    this.root.style.cursor =
      mode === 'grid' && this.hoveredId != null
        ? 'zoom-in'
        : mode === 'line'
          ? 'default'
          : 'auto'

    if (mode === 'line' && this.lockedScrollTop != null && this.scroller.scrollTop !== this.lockedScrollTop) {
      this.scroller.scrollTop = this.lockedScrollTop
    }
    if (this.pendingScrollTop != null && mode === 'grid') {
      this.scroller.scrollTop = this.pendingScrollTop
      this.pendingScrollTop = null
    }

    this.previousMode = mode
    return stillAnimating
  }

  handlePendingInput(mode: 'grid' | 'line', focusedIndex: number | null, currentScrollTop: number) {
    if (this.pendingKey != null) {
      const event = this.pendingKey
      this.pendingKey = null
      if (event.key === 'Escape') {
        this.dismissFocused(focusedIndex, currentScrollTop)
      } else if (event.key === 'ArrowLeft') {
        this.routeLineNavigation('previous', focusedIndex, currentScrollTop)
      } else if (event.key === 'ArrowRight') {
        this.routeLineNavigation('next', focusedIndex, currentScrollTop)
      }
      return
    }

    if (this.pendingClick == null) return
    const click = this.pendingClick
    this.pendingClick = null

    if (!(click.target instanceof HTMLElement)) return
    const caption = click.target.closest<HTMLElement>('[data-card-caption="true"]')
    if (caption != null) {
      this.selectCaption(caption)
      return
    }

    const lineStrip = click.target.closest<HTMLElement>('[data-line-strip="left"], [data-line-strip="right"], [data-line-strip="backdrop"]')
    if (mode === 'line' && lineStrip != null) {
      const direction = routeLineModeClick({
        viewportWidth: this.viewportWidth,
        pointerX: click.clientX,
        hasPrevious: focusedIndex != null && focusedIndex > 0,
        hasNext: focusedIndex != null && focusedIndex < this.items.length - 1,
      })
      this.routeLineNavigation(direction, focusedIndex, currentScrollTop)
      return
    }

    const cardRoot = click.target.closest<HTMLElement>('[data-card-id]')
    if (cardRoot == null) return
    const cardId = cardRoot.dataset.cardId ?? null
    if (cardId == null) return

    if (mode === 'grid') {
      this.openFocusedId(cardId)
    }
  }

  openFocusedId(id: string) {
    const nextHash = `#${encodeURIComponent(id)}`
    if (this.lockedScrollTop == null) {
      this.lockedScrollTop = this.scroller.scrollTop
    }
    if (window.location.hash !== nextHash) {
      window.location.hash = nextHash
    } else {
      this.focusedId = id
      this.requestRender()
    }
  }

  dismissFocused(focusedIndex: number | null, currentScrollTop: number) {
    if (focusedIndex == null) return
    const row = this.gridLayout.cards[focusedIndex]
    if (row == null) return
    this.pendingScrollTop = computeDismissScrollTop({
      currentScrollTop,
      viewportHeight: this.viewportHeight,
      rowTop: row.rowTop,
      rowHeight: row.rowHeight,
    })
    if (window.location.hash !== '') {
      window.location.hash = ''
    } else {
      this.focusedId = null
      this.requestRender()
    }
  }

  routeLineNavigation(direction: 'previous' | 'next' | 'dismiss', focusedIndex: number | null, currentScrollTop: number) {
    if (direction === 'dismiss') {
      this.dismissFocused(focusedIndex, currentScrollTop)
      return
    }

    const nextIndex =
      focusedIndex == null
        ? 0
        : direction === 'previous'
          ? focusedIndex - 1
          : focusedIndex + 1
    const nextItem = this.items[nextIndex]
    if (nextItem == null) {
      this.dismissFocused(focusedIndex, currentScrollTop)
      return
    }
    this.openFocusedId(nextItem.id)
  }

  selectCaption(caption: HTMLElement) {
    const textNode = caption.querySelector<HTMLElement>('[data-card-caption-text="true"]')
    if (textNode == null) return
    const selection = window.getSelection()
    if (selection == null) return
    const range = document.createRange()
    range.selectNodeContents(textNode)
    selection.removeAllRanges()
    selection.addRange(range)
    this.selectedText = selection.toString()
  }

  mountAndProjectCards({
    mode,
    focusedIndex,
    visibleRows,
  }: {
    mode: 'grid' | 'line'
    focusedIndex: number | null
    visibleRows: {firstRow: number; lastRow: number} | null
  }) {
    this.mountedCount = 0
    const gridMounted = new Set<string>()
    if (mode === 'grid' && visibleRows != null) {
      for (let row = visibleRows.firstRow; row <= visibleRows.lastRow; row += 1) {
        const start = row * this.gridLayout.columns
        const end = Math.min(this.items.length, start + this.gridLayout.columns)
        for (let index = start; index < end; index += 1) {
          const item = this.items[index]
          if (item == null) continue
          gridMounted.add(item.id)
        }
      }
    }

    for (let index = 0; index < this.items.length; index += 1) {
      const item = this.items[index]
      if (item == null) continue
      const card = this.ensureCardRefs(item)
      const springState = this.cardSprings.get(item.id)
      if (springState == null) continue

      const gridCard = this.gridLayout.cards[index]
      const lineCard = focusedIndex == null ? null : this.lineLayout[index] ?? null
      const shouldMount = mode === 'line' || gridMounted.has(item.id)

      if (shouldMount) {
        this.mountedCount += 1
        const parent = mode === 'line' ? this.lineStage : this.gridStage
        if (card.root.parentNode !== parent) parent.appendChild(card.root)
      } else if (card.root.parentNode != null) {
        card.root.remove()
      }

      const destination = mode === 'line' && lineCard != null ? lineCard : gridCard
      if (destination == null) continue

      const hovered = mode === 'grid' && this.hitTestCard(destination)
      const hoverScale = hovered ? 1.02 : 1
      const hoverOffsetX = hovered ? this.hoverOffsetX(destination.x, destination.cardWidth) : 0
      const hoverOffsetY = hovered ? this.hoverOffsetY(destination.y, destination.cardHeight) : 0

      this.projectCard(card, springState, destination, hoverScale, hoverOffsetX, hoverOffsetY)
    }

  }

  ensureCardRefs(item: PhotoData) {
    const existing = this.cardRefs.get(item.id)
    if (existing != null) return existing

    const root = document.createElement('div')
    root.dataset.cardId = item.id
    root.style.position = 'absolute'
    root.style.left = '0'
    root.style.top = '0'
    root.style.transformOrigin = 'center top'
    root.style.borderRadius = '26px'
    root.style.overflow = 'hidden'
    root.style.boxShadow = '0 24px 70px rgba(0, 0, 0, 0.35)'
    root.style.background = 'rgba(10, 17, 28, 0.85)'
    root.style.backdropFilter = 'blur(2px)'
    root.style.border = '1px solid rgba(255, 255, 255, 0.06)'
    root.style.willChange = 'transform'

    const media = document.createElement('div')
    media.style.position = 'absolute'
    media.style.inset = '0 0 auto 0'
    media.style.overflow = 'hidden'
    media.style.background = '#091424'

    const lowRes = document.createElement('div')
    lowRes.style.position = 'absolute'
    lowRes.style.inset = '0'
    lowRes.style.backgroundImage = `url(${getLowResImageUrl(item.id)})`
    lowRes.style.backgroundPosition = 'center'
    lowRes.style.backgroundSize = 'cover'
    lowRes.style.filter = 'saturate(0.92) contrast(0.98)'

    const highRes = document.createElement('img')
    highRes.draggable = false
    highRes.alt = ''
    highRes.src = getHighResImageUrl(item.id)
    highRes.style.position = 'absolute'
    highRes.style.inset = '0'
    highRes.style.width = '100%'
    highRes.style.height = '100%'
    highRes.style.objectFit = 'cover'
    highRes.style.opacity = '0'
    highRes.style.transition = 'opacity 120ms linear'
    highRes.style.userSelect = 'none'

    const caption = document.createElement('div')
    caption.dataset.cardCaption = 'true'
    caption.style.position = 'absolute'
    caption.style.left = '0'
    caption.style.right = '0'
    caption.style.bottom = '0'
    caption.style.height = `${GRID_CAPTION_HEIGHT}px`
    caption.style.padding = '8px 16px 10px'
    caption.style.boxSizing = 'border-box'
    caption.style.background = 'linear-gradient(180deg, rgba(8, 14, 24, 0.05), rgba(8, 14, 24, 0.86))'
    caption.style.color = '#f0f4ff'
    caption.style.fontSize = '18px'
    caption.style.lineHeight = `${GRID_CAPTION_HEIGHT - 18}px`
    caption.style.letterSpacing = '0.01em'
    caption.style.userSelect = 'text'
    caption.style.setProperty('-webkit-user-select', 'text')

    const captionText = document.createElement('span')
    captionText.dataset.cardCaptionText = 'true'
    captionText.textContent = item.prompt
    captionText.style.display = 'inline'
    captionText.style.userSelect = 'text'
    captionText.style.setProperty('-webkit-user-select', 'text')

    caption.append(captionText)
    media.append(lowRes, highRes)
    root.append(media, caption)

    const refs = {root, media, lowRes, highRes, caption, captionText}
    this.cardRefs.set(item.id, refs)
    return refs
  }

  projectCard(
    refs: CardRefs,
    springs: CardSprings,
    destination: GridCardLayout | LineCardLayout,
    hoverScale: number,
    hoverOffsetX: number,
    hoverOffsetY: number,
  ) {
    springs.x.dest = destination.x
    springs.y.dest = destination.y
    springs.width.dest = destination.cardWidth
    springs.height.dest = destination.cardHeight
    springs.hoverScale.dest = hoverScale
    springs.hoverOffsetX.dest = hoverOffsetX
    springs.hoverOffsetY.dest = hoverOffsetY

    if (this.reducedMotion) {
      springGoToEnd(springs.x)
      springGoToEnd(springs.y)
      springGoToEnd(springs.width)
      springGoToEnd(springs.height)
      springGoToEnd(springs.hoverScale)
      springGoToEnd(springs.hoverOffsetX)
      springGoToEnd(springs.hoverOffsetY)
    }
  }

  applyCardStyles(mode: 'grid' | 'line', focusedIndex: number | null) {
    const focusedId = focusedIndex == null ? null : this.items[focusedIndex]?.id ?? null
    for (const [id, refs] of this.cardRefs) {
      const springs = this.cardSprings.get(id)
      if (springs == null) continue
      refs.root.style.width = `${springs.width.pos}px`
      refs.root.style.height = `${springs.height.pos}px`
      const captionHeight = mode === 'line' ? LINE_CAPTION_HEIGHT : GRID_CAPTION_HEIGHT
      refs.caption.style.height = `${captionHeight}px`
      refs.caption.style.lineHeight = `${captionHeight - 18}px`
      refs.media.style.height = `${Math.max(0, springs.height.pos - captionHeight)}px`
      refs.root.style.transform = `translate3d(${springs.x.pos + springs.hoverOffsetX.pos}px, ${springs.y.pos + springs.hoverOffsetY.pos}px, 0) scale(${springs.hoverScale.pos})`
      const isFocused = id === focusedId
      const isLineNeighbor = mode === 'line' && focusedIndex != null && id !== focusedId
      refs.root.style.opacity = mode === 'grid' || isFocused || isLineNeighbor ? '1' : '0.95'
      refs.root.style.zIndex = isFocused ? '20' : mode === 'line' ? String(10 + (this.idToIndex.get(id) ?? 0)) : String(1 + (this.idToIndex.get(id) ?? 0))
      refs.caption.style.opacity = isFocused ? '1' : '0.92'
      refs.caption.style.filter = isFocused ? 'none' : 'saturate(0.88)'
      refs.highRes.style.opacity = mode === 'grid' ? '0' : isFocused ? '1' : '0.16'
      refs.highRes.style.filter = isFocused ? 'none' : 'blur(0.2px) saturate(0.88)'
      refs.root.dataset.focused = isFocused ? 'true' : 'false'
      refs.caption.style.background = isFocused
        ? 'linear-gradient(180deg, rgba(8, 14, 24, 0.03), rgba(8, 14, 24, 0.84))'
        : 'linear-gradient(180deg, rgba(8, 14, 24, 0.05), rgba(8, 14, 24, 0.86))'
    }
  }

  stepAnimations(now: number) {
    const elapsed = now - this.lastAnimationTime
    this.lastAnimationTime = now
    const steps = Math.min(300, Math.max(1, Math.floor(elapsed / msPerAnimationStep)))
    let stillAnimating = false

    for (let step = 0; step < steps; step += 1) {
      for (const springs of this.cardSprings.values()) {
        springStep(springs.x)
        springStep(springs.y)
        springStep(springs.width)
        springStep(springs.height)
        springStep(springs.hoverScale)
        springStep(springs.hoverOffsetX)
        springStep(springs.hoverOffsetY)
        stillAnimating =
          stillAnimating ||
          !springMostlyDone(springs.x) ||
          !springMostlyDone(springs.y) ||
          !springMostlyDone(springs.width) ||
          !springMostlyDone(springs.height) ||
          !springMostlyDone(springs.hoverScale) ||
          !springMostlyDone(springs.hoverOffsetX) ||
          !springMostlyDone(springs.hoverOffsetY)
      }
    }

    if (this.reducedMotion) {
      stillAnimating = false
    }

    return stillAnimating
  }

  findHoveredGridCard() {
    if (this.focusedId != null) return null
    for (const card of this.gridLayout.cards) {
      const refs = this.cardRefs.get(card.id)
      if (refs == null || refs.root.parentNode == null) continue
      const rect = refs.root.getBoundingClientRect()
      if (
        this.pointerX >= rect.left &&
        this.pointerX <= rect.right &&
        this.pointerY >= rect.top &&
        this.pointerY <= rect.bottom
      ) {
        return card.id
      }
    }
    return null
  }

  hoverOffsetX(x: number, width: number) {
    const center = x + width / 2
    const delta = (this.pointerX - center) / Math.max(1, width)
    return clamp(delta * 8, -4, 4)
  }

  hoverOffsetY(y: number, height: number) {
    const center = y + height / 2
    const delta = (this.pointerY - center) / Math.max(1, height)
    return clamp(delta * 6, -3, 3)
  }

  hitTestCard(destination: GridCardLayout | LineCardLayout) {
    const rectLeft = destination.x
    const rectTop = destination.y
    const rectRight = destination.x + destination.cardWidth
    const rectBottom = destination.y + destination.cardHeight
    return (
      this.pointerX >= rectLeft &&
      this.pointerX <= rectRight &&
      this.pointerY >= rectTop &&
      this.pointerY <= rectBottom
    )
  }

  publishReport(report: ScenarioReport) {
    this.reportEl.textContent = JSON.stringify(report)
  }

  async runScenario(name: string) {
    try {
      await this.waitForPaint()
      let data: ScenarioReport['data'] = {}

      switch (name) {
        case 'navigation-flow': {
          data = await this.runNavigationFlowScenario()
          break
        }
        case 'dismiss-to-row': {
          data = await this.runDismissToRowScenario()
          break
        }
        case 'caption-selection': {
          data = await this.runCaptionSelectionScenario()
          break
        }
        case 'occlusion': {
          data = await this.runOcclusionScenario()
          break
        }
        default:
          throw new Error(`Unknown scenario: ${name}`)
      }

      this.publishReport({
        phase: 'ready',
        requestId,
        scenario: name,
        status: 'ok',
        data,
      })
    } catch (error) {
      this.publishReport({
        phase: 'error',
        requestId,
        scenario: name,
        status: 'error',
        message: error instanceof Error ? error.message : 'Scenario failed',
      })
    }
  }

  async runNavigationFlowScenario(): Promise<NonNullable<ScenarioReport['data']>> {
    const hashSequence: string[] = []
    this.scroller.scrollTop = 560
    await this.waitForPaint()

    const first = this.getCardRef(this.items[0]!.id)
    const firstId = first.root.dataset.cardId ?? this.items[0]!.id
    this.dispatchClick(first.root)
    await this.waitForCondition(() => window.location.hash === `#${encodeURIComponent(firstId)}`)
    hashSequence.push(window.location.hash)
    await this.waitForCondition(() => this.focusedId === firstId)

    const scrollTopBeforeLock = this.scroller.scrollTop
    this.scroller.scrollTop = scrollTopBeforeLock + 240
    await this.waitForCondition(() => this.scroller.scrollTop === scrollTopBeforeLock)
    const scrollTopDuringLock = this.scroller.scrollTop

    this.dispatchKey('ArrowRight')
    const secondId = this.items[1]!.id
    await this.waitForCondition(() => window.location.hash === `#${encodeURIComponent(secondId)}`)
    hashSequence.push(window.location.hash)

    history.back()
    await this.waitForCondition(() => window.location.hash === `#${encodeURIComponent(firstId)}`)
    hashSequence.push(window.location.hash)

    history.forward()
    await this.waitForCondition(() => window.location.hash === `#${encodeURIComponent(secondId)}`)
    hashSequence.push(window.location.hash)

    this.dispatchKey('Escape')
    await this.waitForCondition(() => window.location.hash === '')
    hashSequence.push(window.location.hash)

    return {
      hashSequence,
      scrollTopBeforeLock,
      scrollTopDuringLock,
      dismissedHash: window.location.hash,
      finalMode: this.focusedId == null ? 'grid' : 'line',
    }
  }

  async runDismissToRowScenario(): Promise<NonNullable<ScenarioReport['data']>> {
    const focusedIndex = 15
    const focusedItem = this.items[focusedIndex]
    if (focusedItem == null) throw new Error('Missing focused gallery item')

    this.scroller.scrollTop = 1200
    await this.waitForPaint()

    const card = this.getCardRef(focusedItem.id)
    this.dispatchClick(card.root)
    await this.waitForCondition(() => window.location.hash === `#${encodeURIComponent(focusedItem.id)}`)

    const beforeDismissVisible = this.isCardVisible(card.root)
    this.dispatchKey('Escape')
    await this.waitForCondition(() => window.location.hash === '')

    const afterDismissVisible = this.isCardVisible(card.root)
    const topOffset = Math.round(card.root.getBoundingClientRect().top)

    return {
      focusedIndex,
      beforeDismissVisible,
      afterDismissVisible,
      topOffset,
    }
  }

  async runCaptionSelectionScenario(): Promise<NonNullable<ScenarioReport['data']>> {
    const captionItem = this.items[1]
    if (captionItem == null) throw new Error('Missing caption item')

    const card = this.getCardRef(captionItem.id)
    const caption = card.caption
    this.dispatchClick(caption)
    await this.waitForCondition(() => this.selectedText === captionItem.prompt)

    return {
      selectedText: this.selectedText,
      hashAfterClick: window.location.hash,
      modeAfterClick: this.focusedId == null ? 'grid' : 'line',
    }
  }

  async runOcclusionScenario(): Promise<NonNullable<ScenarioReport['data']>> {
    this.scroller.scrollTop = 1200
    await this.waitForCondition(() => this.mountedCount < this.items.length)
    return {
      mountedCount: this.mountedCount,
      itemCount: this.items.length,
    }
  }

  getCardRef(id: string) {
    const refs = this.cardRefs.get(id)
    if (refs == null) throw new Error(`Missing card refs for ${id}`)
    return refs
  }

  isCardVisible(root: HTMLDivElement) {
    const rect = root.getBoundingClientRect()
    return rect.bottom > 0 && rect.top < this.viewportHeight
  }

  dispatchClick(target: HTMLElement) {
    target.dispatchEvent(
      new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        view: window,
      }),
    )
  }

  dispatchKey(key: string) {
    window.dispatchEvent(
      new KeyboardEvent('keydown', {
        bubbles: true,
        cancelable: true,
        key,
      }),
    )
  }

  waitForPaint() {
    return new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
    })
  }

  async waitForCondition(predicate: () => boolean) {
    for (let attempt = 0; attempt < 300; attempt += 1) {
      if (predicate()) return
      await this.waitForPaint()
    }
    throw new Error('Timed out waiting for scenario state to settle')
  }
}

const app = new PhotoGalleryApp(appRoot, reportEl, photoGalleryData)
app.start()
