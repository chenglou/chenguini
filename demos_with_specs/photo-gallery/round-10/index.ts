import {
  getHighResImageUrl,
  getLowResImageUrl,
  photoGalleryData,
  scenarioPlaceholderImage,
  type PhotoData,
} from './data'
import {
  computeDismissScrollTop,
  computeGridLayout,
  computeLineLayout,
  getVisibleGridRows,
  routeLineModeClick,
  GRID_GAP,
  GRID_PAGE_PADDING,
  GRID_TOP_PADDING,
  LINE_NAV_WIDTH,
  LINE_CAPTION_HEIGHT,
  type GridLayout,
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
  image: HTMLImageElement
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

type ScenarioName = 'navigation-flow' | 'dismiss-to-row' | 'caption-selection' | 'occlusion'

type HoverState =
  | {kind: 'grid'; cardId: string | null; pointerX: number; pointerY: number}
  | {kind: 'line'; side: 'previous' | 'next' | null}

const query = new URLSearchParams(window.location.search)
const scenario = query.get('scenario') ?? ''
const requestId = query.get('requestId') ?? ''
const isScenarioMode = scenario !== ''

const appRoot = document.querySelector<HTMLDivElement>('#app')
if (appRoot == null) {
  throw new Error('Missing #app root')
}

const reportEl = document.querySelector<HTMLScriptElement>('#scenario-report')
if (reportEl == null) {
  throw new Error('Missing #scenario-report node')
}

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
  lineBackplate = document.createElement('div')
  leftStrip = document.createElement('div')
  rightStrip = document.createElement('div')
  githubLink = document.createElement('a')

  viewportWidth = window.innerWidth
  viewportHeight = window.innerHeight
  gridLayout: GridLayout
  lineLayout: LineCardLayout[] = []
  mode: 'grid' | 'line' = 'grid'
  focusedId: string | null = null
  hoveredCard: HoverState | null = null
  pendingScrollTop: number | null = null
  pendingResizeAnchor: {id: string; offset: number} | null = null
  lineLockedScrollTop: number | null = null
  selectedText = ''
  mountedCount = 0
  didInitialPaint = false
  reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  scheduled = false
  lastAnimationTime = performance.now()
  scenarioRun = false

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
      const x = layout?.x ?? GRID_PAGE_PADDING
      const y = layout?.y ?? GRID_TOP_PADDING
      const width = layout?.cardWidth ?? 220
      const height = layout?.cardHeight ?? 272
      this.cardSprings.set(item.id, {
        x: spring(x),
        y: spring(y),
        width: spring(width),
        height: spring(height),
        hoverScale: spring(1),
        hoverOffsetX: spring(0),
        hoverOffsetY: spring(0),
      })
    }
  }

  start() {
    try {
      if (isScenarioMode) {
        this.publishReport({phase: 'loading', requestId, scenario})
      }
      this.installShell()
      this.syncFromHash()
      this.render(performance.now())
      this.installEvents()
      if (isScenarioMode) {
        this.publishReport({phase: 'running', requestId, scenario})
        this.runScenario(scenario as ScenarioName)
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
    document.documentElement.style.background = '#06101d'
    document.body.style.margin = '0'
    document.body.style.background = '#06101d'
    document.body.style.color = '#edf2ff'
    document.body.style.fontFamily =
      '"Iowan Old Style", "Palatino Linotype", "Book Antiqua", Georgia, serif'
    document.body.style.overflow = 'hidden'
    document.body.style.userSelect = 'none'

    this.root.style.position = 'fixed'
    this.root.style.inset = '0'
    this.root.style.background =
      'radial-gradient(circle at top, rgba(61, 94, 162, 0.18), transparent 36%), linear-gradient(180deg, #091424 0%, #08111d 60%, #050811 100%)'
    this.root.style.color = '#edf2ff'

    this.scroller.style.position = 'absolute'
    this.scroller.style.inset = '0'
    this.scroller.style.overflowX = 'hidden'
    this.scroller.style.overflowY = 'auto'
    this.scroller.style.webkitOverflowScrolling = 'touch'

    this.gridStage.style.position = 'relative'
    this.gridStage.style.width = '100%'

    this.lineStage.style.position = 'fixed'
    this.lineStage.style.inset = '0'
    this.lineStage.style.display = 'none'
    this.lineStage.style.pointerEvents = 'auto'
    this.lineStage.style.background =
      'linear-gradient(180deg, rgba(6, 10, 18, 0.78), rgba(3, 6, 12, 0.95))'
    this.lineStage.style.backdropFilter = 'blur(10px)'

    this.lineBackplate.style.position = 'absolute'
    this.lineBackplate.style.inset = '0'
    this.lineBackplate.style.pointerEvents = 'auto'

    this.leftStrip.style.position = 'absolute'
    this.leftStrip.style.inset = '0 auto 0 0'
    this.leftStrip.style.width = `${LINE_NAV_WIDTH}px`
    this.leftStrip.style.pointerEvents = 'auto'
    this.leftStrip.style.background = 'transparent'

    this.rightStrip.style.position = 'absolute'
    this.rightStrip.style.inset = '0 0 0 auto'
    this.rightStrip.style.width = `${LINE_NAV_WIDTH}px`
    this.rightStrip.style.pointerEvents = 'auto'
    this.rightStrip.style.background = 'transparent'

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

    this.root.innerHTML = ''
    this.root.append(this.scroller, this.lineStage, this.githubLink)
    this.scroller.append(this.gridStage)
    this.lineStage.append(this.lineBackplate, this.leftStrip, this.rightStrip)
  }

  installEvents() {
    window.addEventListener('resize', () => this.onResize())
    window.addEventListener('hashchange', () => {
      this.syncFromHash()
      this.requestRender()
    })
    window.addEventListener('keydown', (event) => this.onKeyDown(event))
    this.root.addEventListener('pointermove', (event) => this.onPointerMove(event))
    this.root.addEventListener('pointerleave', () => {
      this.hoveredCard = null
      this.requestRender()
    })
    this.scroller.addEventListener(
      'scroll',
      () => {
        if (this.mode === 'grid') this.requestRender()
      },
      {passive: true},
    )
    this.gridStage.addEventListener('click', (event) => this.onGridClick(event))
    this.lineBackplate.addEventListener('click', () => this.dismissLineMode())
    this.rightStrip.addEventListener('click', (event) => {
      event.preventDefault()
      event.stopPropagation()
      this.focusRelative(1)
    })
    this.leftStrip.addEventListener('click', (event) => {
      event.preventDefault()
      event.stopPropagation()
      this.focusRelative(-1)
    })
  }

  onResize() {
    if (this.mode === 'grid') {
      const anchor = this.captureGridAnchor(this.scroller.scrollTop)
      if (anchor != null) this.pendingResizeAnchor = anchor
    }
    this.viewportWidth = window.innerWidth
    this.viewportHeight = window.innerHeight
    this.requestRender()
  }

  onKeyDown(event: KeyboardEvent) {
    if (event.key === 'ArrowLeft') {
      event.preventDefault()
      this.focusRelative(-1)
      return
    }
    if (event.key === 'ArrowRight') {
      event.preventDefault()
      this.focusRelative(1)
      return
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      this.dismissLineMode()
    }
  }

  onPointerMove(event: PointerEvent) {
    if (this.mode === 'grid') {
      const cardId = this.hitTestGridCard(event.clientX, event.clientY)
      this.hoveredCard = {
        kind: 'grid',
        cardId,
        pointerX: event.clientX,
        pointerY: event.clientY,
      }
      this.requestRender()
      return
    }

    const action = routeLineModeClick({
      viewportWidth: this.viewportWidth,
      pointerX: event.clientX,
      hasPrevious: this.getFocusedIndex() > 0,
      hasNext: this.getFocusedIndex() < this.items.length - 1,
    })
    this.hoveredCard = {
      kind: 'line',
      side: action === 'previous' || action === 'next' ? action : null,
    }
    this.requestRender()
  }

  onGridClick(event: MouseEvent) {
    const target = event.target
    if (!(target instanceof HTMLElement)) return
    const cardNode = target.closest<HTMLElement>('[data-photo-id]')
    if (cardNode == null) return
    const photoId = cardNode.dataset.photoId
    if (photoId == null) return

    const caption = target.closest<HTMLElement>('[data-caption]')
    if (caption != null) {
      event.preventDefault()
      event.stopPropagation()
      this.selectCaption(photoId)
      return
    }

    this.focusId(photoId)
  }

  syncFromHash() {
    const rawHash = window.location.hash.startsWith('#')
      ? window.location.hash.slice(1)
      : ''
    if (rawHash === '') {
      this.focusedId = null
      this.mode = 'grid'
      this.lineLockedScrollTop = null
      return
    }

    let focusedId = ''
    try {
      focusedId = decodeURIComponent(rawHash)
    } catch {
      this.focusedId = null
      this.mode = 'grid'
      return
    }

    if (!this.idToIndex.has(focusedId)) {
      this.focusedId = null
      this.mode = 'grid'
      return
    }

    this.focusedId = focusedId
    this.mode = 'line'
    if (this.lineLockedScrollTop == null) {
      this.lineLockedScrollTop = this.scroller.scrollTop
    }
  }

  focusId(photoId: string) {
    if (!this.idToIndex.has(photoId)) return
    this.focusedId = photoId
    this.mode = 'line'
    this.lineLockedScrollTop = this.scroller.scrollTop
    const encoded = encodeURIComponent(photoId)
    if (window.location.hash !== `#${encoded}`) {
      window.location.hash = encoded
    }
    this.requestRender()
  }

  focusRelative(delta: number) {
    const currentIndex = this.getFocusedIndex()
    let nextIndex = 0
    if (currentIndex >= 0) {
      nextIndex = clampIndex(currentIndex + delta, 0, this.items.length - 1)
    }
    this.focusId(this.items[nextIndex]!.id)
  }

  dismissLineMode() {
    if (this.focusedId == null) return
    const focusedIndex = this.getFocusedIndex()
    if (focusedIndex < 0) return

    const focusedCard = this.gridLayout.cards[focusedIndex]
    if (focusedCard != null) {
      const nextScrollTop = computeDismissScrollTop({
        currentScrollTop: this.scroller.scrollTop,
        viewportHeight: this.viewportHeight,
        rowTop: focusedCard.rowTop,
        rowHeight: focusedCard.rowHeight,
      })
      this.pendingScrollTop = nextScrollTop
    }
    this.focusedId = null
    this.mode = 'grid'
    this.lineLockedScrollTop = null
    if (window.location.hash !== '') {
      window.location.hash = ''
    }
    this.requestRender()
  }

  selectCaption(photoId: string) {
    const refs = this.cardRefs.get(photoId)
    if (refs == null) return

    const selection = window.getSelection()
    if (selection == null) return
    const range = document.createRange()
    range.selectNodeContents(refs.captionText)
    selection.removeAllRanges()
    selection.addRange(range)
    this.selectedText = selection.toString()
    this.mode = 'grid'
    this.focusedId = null
    this.requestRender()
  }

  requestRender() {
    if (this.scheduled) return
    this.scheduled = true
    requestAnimationFrame((now) => {
      this.scheduled = false
      const stillAnimating = this.render(now)
      if (stillAnimating) this.requestRender()
    })
  }

  render(now: number) {
    this.viewportWidth = window.innerWidth
    this.viewportHeight = window.innerHeight
    this.gridLayout = computeGridLayout({
      viewportWidth: this.viewportWidth,
      items: this.items,
    })
    const focusedIndex = this.getFocusedIndex()
    this.lineLayout =
      this.mode === 'line' && focusedIndex >= 0
        ? computeLineLayout({
            viewportWidth: this.viewportWidth,
            viewportHeight: this.viewportHeight,
            items: this.items,
            focusedIndex,
          })
        : []

    if (this.pendingResizeAnchor != null && this.mode === 'grid') {
      const anchorIndex = this.idToIndex.get(this.pendingResizeAnchor.id)
      if (anchorIndex != null) {
        const card = this.gridLayout.cards[anchorIndex]
        if (card != null) {
          this.pendingScrollTop = Math.max(0, card.rowTop + this.pendingResizeAnchor.offset)
        }
      }
      this.pendingResizeAnchor = null
    }

    if (this.mode === 'line' && this.lineLockedScrollTop != null) {
      this.pendingScrollTop = this.lineLockedScrollTop
    }

    const mountedIds = this.projectCards(focusedIndex)
    this.mountedCount = mountedIds.size

    if (this.pendingScrollTop != null) {
      this.scroller.scrollTop = this.pendingScrollTop
      this.pendingScrollTop = null
    }

    let cursor = 'default'
    if (this.mode === 'grid') {
      cursor = this.hoveredCard?.kind === 'grid' && this.hoveredCard.cardId != null ? 'zoom-in' : 'default'
    } else {
      cursor = this.hoveredCard?.kind === 'line' && this.hoveredCard.side != null ? 'zoom-in' : 'zoom-out'
    }
    document.body.style.cursor = cursor

    if (!this.didInitialPaint || this.reducedMotion) {
      for (const springState of this.cardSprings.values()) {
        springGoToEnd(springState.x)
        springGoToEnd(springState.y)
        springGoToEnd(springState.width)
        springGoToEnd(springState.height)
        springGoToEnd(springState.hoverScale)
        springGoToEnd(springState.hoverOffsetX)
        springGoToEnd(springState.hoverOffsetY)
      }
      this.applyCardStyles(focusedIndex)
      this.didInitialPaint = true
      this.publishScenarioIfReady()
      return false
    }

    const steps = Math.min(300, Math.floor((now - this.lastAnimationTime) / msPerAnimationStep))
    this.lastAnimationTime += steps * msPerAnimationStep
    let stillAnimating = false
    const animationSteps = steps > 0 ? steps : 1
    for (let step = 0; step < animationSteps; step += 1) {
      for (const springState of this.cardSprings.values()) {
        springStep(springState.x)
        springStep(springState.y)
        springStep(springState.width)
        springStep(springState.height)
        springStep(springState.hoverScale)
        springStep(springState.hoverOffsetX)
        springStep(springState.hoverOffsetY)
      }
    }
    for (const springState of this.cardSprings.values()) {
      stillAnimating =
        stillAnimating ||
        !springMostlyDone(springState.x) ||
        !springMostlyDone(springState.y) ||
        !springMostlyDone(springState.width) ||
        !springMostlyDone(springState.height) ||
        !springMostlyDone(springState.hoverScale) ||
        !springMostlyDone(springState.hoverOffsetX) ||
        !springMostlyDone(springState.hoverOffsetY)
    }

    this.applyCardStyles(focusedIndex)
    this.didInitialPaint = true
    this.publishScenarioIfReady()
    return stillAnimating
  }

  projectCards(focusedIndex: number) {
    const mountedIds = new Set<string>()
    if (this.mode === 'grid') {
      const visibleRows = getVisibleGridRows({
        rowTops: this.gridLayout.rowTops,
        rowHeights: this.gridLayout.rowHeights,
        scrollTop: this.scroller.scrollTop,
        viewportHeight: this.viewportHeight,
        overscan: GRID_GAP * 2,
      })
      for (let index = 0; index < this.items.length; index += 1) {
        const item = this.items[index]
        const layout = this.gridLayout.cards[index]
        if (item == null || layout == null) continue
        const shouldMount = layout.row >= visibleRows.firstRow && layout.row <= visibleRows.lastRow
        if (!shouldMount) {
          const refs = this.cardRefs.get(item.id)
          refs?.root.remove()
          continue
        }
        const refs = this.ensureCard(item)
        this.gridStage.appendChild(refs.root)
        mountedIds.add(item.id)
        this.updateCardTarget(item, layout.x, layout.y, layout.cardWidth, layout.cardHeight)
        this.updateCardChrome(item.id, focusedIndex, layout)
      }
      return mountedIds
    }

    const lineVisibleMinX = -160
    const lineVisibleMaxX = this.viewportWidth + 160
    for (let index = 0; index < this.items.length; index += 1) {
      const item = this.items[index]
      const layout = this.lineLayout[index]
      if (item == null || layout == null) continue
      const shouldMount =
        layout.x + layout.cardWidth >= lineVisibleMinX && layout.x <= lineVisibleMaxX
      if (!shouldMount) {
        const refs = this.cardRefs.get(item.id)
        refs?.root.remove()
        continue
      }
      const refs = this.ensureCard(item)
      this.lineStage.appendChild(refs.root)
      mountedIds.add(item.id)
      this.updateCardTarget(item, layout.x, layout.y, layout.cardWidth, layout.cardHeight)
      this.updateCardChrome(item.id, focusedIndex, layout)
    }
    return mountedIds
  }

  updateCardTarget(
    item: PhotoData,
    x: number,
    y: number,
    width: number,
    height: number,
  ) {
    const springs = this.cardSprings.get(item.id)
    if (springs == null) return
    springs.x.dest = x
    springs.y.dest = y
    springs.width.dest = width
    springs.height.dest = height
  }

  updateCardChrome(itemId: string, focusedIndex: number, layout: GridLayout['cards'][number] | LineCardLayout) {
    const refs = this.cardRefs.get(itemId)
    const springs = this.cardSprings.get(itemId)
    if (refs == null || springs == null) return

    const currentIndex = this.idToIndex.get(itemId)
    if (currentIndex == null) return

    let opacity = 1
    let blur = 0
    let hoverScale = 1
    let hoverOffsetX = 0
    let hoverOffsetY = 0
    let cursor = 'default'

    if (this.mode === 'grid') {
      cursor = 'zoom-in'
      if (this.hoveredCard?.kind === 'grid' && this.hoveredCard.cardId === itemId) {
        const pointerX = this.hoveredCard.pointerX
        const pointerY = this.hoveredCard.pointerY
        const centerX = layout.x + layout.cardWidth / 2
        const centerY = layout.y + layout.cardHeight / 2
        hoverScale = 1.02
        hoverOffsetX = clampNumber((pointerX - centerX) * 0.08, -8, 8)
        hoverOffsetY = clampNumber((pointerY - centerY) * 0.08, -8, 8)
      }
    } else {
      const distance = Math.abs(currentIndex - focusedIndex)
      if (distance === 0) {
        opacity = 1
        blur = 0
      } else if (distance === 1) {
        opacity = 0.7
        blur = 1
      } else {
        opacity = 0.38
        blur = 2.5
      }

      if (this.hoveredCard?.kind === 'line') {
        const targetIndex =
          this.hoveredCard.side === 'previous'
            ? focusedIndex - 1
            : this.hoveredCard.side === 'next'
              ? focusedIndex + 1
              : -1
        if (targetIndex === currentIndex) {
          opacity = 1
          blur = 0
          hoverScale = 1.04
        }
      }
      cursor = this.hoveredCard?.kind === 'line' && this.hoveredCard.side != null ? 'zoom-in' : 'zoom-out'
    }

    springs.hoverScale.dest = hoverScale
    springs.hoverOffsetX.dest = hoverOffsetX
    springs.hoverOffsetY.dest = hoverOffsetY
    refs.root.style.opacity = `${opacity}`
    refs.root.style.filter = `brightness(${Math.max(0.55, 1 - blur * 0.08)}) saturate(${Math.max(0.4, 1 - blur * 0.12)}) blur(${blur}px)`
    refs.root.style.cursor = cursor
    refs.root.style.zIndex =
      this.mode === 'line'
        ? `${100 + Math.max(0, 10 - Math.abs(currentIndex - focusedIndex))}`
        : this.hoveredCard?.kind === 'grid' && this.hoveredCard.cardId === itemId
          ? '40'
          : '10'

    const lowResUrl = isScenarioMode ? scenarioPlaceholderImage : getLowResImageUrl(itemId)
    refs.media.style.backgroundImage = `url("${lowResUrl}")`
    refs.media.style.backgroundSize = 'cover'
    refs.media.style.backgroundPosition = 'center'
    refs.media.style.backgroundColor = '#0d1525'

    const shouldShowHighRes = this.mode === 'line' && currentIndex === focusedIndex
    refs.image.style.display = shouldShowHighRes ? 'block' : 'none'
    if (shouldShowHighRes) {
      const nextSrc = isScenarioMode ? scenarioPlaceholderImage : getHighResImageUrl(itemId)
      if (refs.image.src !== nextSrc) refs.image.src = nextSrc
    }

    refs.caption.style.height = this.mode === 'line' ? `${LINE_CAPTION_HEIGHT}px` : '52px'
    refs.caption.style.maxHeight = this.mode === 'line' ? `${LINE_CAPTION_HEIGHT}px` : '52px'
    refs.caption.style.overflowY = this.mode === 'line' ? 'auto' : 'hidden'
    refs.caption.style.webkitLineClamp = this.mode === 'line' ? 'unset' : '2'
    refs.captionText.textContent = this.items[currentIndex]?.prompt ?? ''
  }

  applyCardStyles(focusedIndex: number) {
    for (const [itemId, refs] of this.cardRefs) {
      const springs = this.cardSprings.get(itemId)
      if (springs == null) continue
      const currentIndex = this.idToIndex.get(itemId)
      if (currentIndex == null) continue

      const width = springs.width.pos
      const height = springs.height.pos
      const x = springs.x.pos
      const y = springs.y.pos
      const hoverScale = springs.hoverScale.pos
      const hoverOffsetX = springs.hoverOffsetX.pos
      const hoverOffsetY = springs.hoverOffsetY.pos

      refs.root.style.left = `${x}px`
      refs.root.style.top = `${y}px`
      refs.root.style.width = `${width}px`
      refs.root.style.height = `${height}px`
      refs.root.style.transform = `translate(${hoverOffsetX}px, ${hoverOffsetY}px) scale(${hoverScale})`
      refs.root.style.transformOrigin = '50% 50%'
      refs.root.style.position = 'absolute'
      refs.root.style.pointerEvents = this.mode === 'line' ? 'none' : 'auto'
      refs.root.style.borderRadius = this.mode === 'line' ? '22px' : '18px'
      refs.root.style.overflow = 'hidden'
      refs.root.style.boxShadow =
        this.mode === 'line'
          ? '0 18px 50px rgba(0, 0, 0, 0.34)'
          : '0 12px 38px rgba(0, 0, 0, 0.28)'
      refs.root.style.border = '1px solid rgba(255, 255, 255, 0.06)'
      refs.root.style.background = '#0d1525'
      refs.root.style.color = '#f2f5ff'
      refs.root.style.userSelect = 'none'

      refs.media.style.position = 'relative'
      refs.media.style.height = `${Math.max(1, height - (this.mode === 'line' ? LINE_CAPTION_HEIGHT : 52))}px`
      refs.media.style.borderBottom = '1px solid rgba(255, 255, 255, 0.05)'

      refs.image.style.position = 'absolute'
      refs.image.style.inset = '0'
      refs.image.style.width = '100%'
      refs.image.style.height = '100%'
      refs.image.style.objectFit = 'cover'
      refs.image.style.objectPosition = 'center'
      refs.image.style.pointerEvents = 'none'
      refs.image.style.opacity = currentIndex === focusedIndex && this.mode === 'line' ? '1' : '0'
      refs.image.style.transition = 'none'

      refs.caption.style.position = 'relative'
      refs.caption.style.boxSizing = 'border-box'
      refs.caption.style.padding = this.mode === 'line' ? '12px 14px 8px' : '10px 12px 8px'
      refs.caption.style.fontSize = this.mode === 'line' ? '15px' : '14px'
      refs.caption.style.lineHeight = this.mode === 'line' ? '1.35' : '1.3'
      refs.caption.style.letterSpacing = '0.01em'
      refs.caption.style.background =
        this.mode === 'line'
          ? 'linear-gradient(180deg, rgba(13, 21, 37, 0.88), rgba(13, 21, 37, 0.96))'
          : 'linear-gradient(180deg, rgba(13, 21, 37, 0.9), rgba(13, 21, 37, 0.98))'
      refs.caption.style.color = '#edf2ff'
      refs.caption.style.borderTop = '1px solid rgba(255, 255, 255, 0.04)'
      refs.caption.style.userSelect = 'text'
      refs.caption.style.overflowX = 'hidden'
      refs.caption.style.overflowY = this.mode === 'line' ? 'auto' : 'hidden'
      refs.caption.style.display = this.mode === 'line' ? 'block' : '-webkit-box'
      refs.caption.style.webkitBoxOrient = this.mode === 'line' ? 'initial' : 'vertical'
      refs.caption.style.webkitLineClamp = this.mode === 'line' ? 'unset' : '2'
      refs.caption.style.maxHeight = this.mode === 'line' ? `${LINE_CAPTION_HEIGHT}px` : '52px'

      refs.captionText.style.display = 'block'
      refs.captionText.textContent = this.items[currentIndex]?.prompt ?? ''
    }

    this.lineStage.style.display = this.mode === 'line' ? 'block' : 'none'
    this.gridStage.style.pointerEvents = this.mode === 'grid' ? 'auto' : 'none'
    this.scroller.style.overflowY = this.mode === 'grid' ? 'auto' : 'hidden'
    this.gridStage.style.height = `${this.gridLayout.totalHeight}px`
    this.leftStrip.style.cursor =
      this.mode === 'line' && this.getFocusedIndex() > 0 ? 'zoom-in' : 'zoom-out'
    this.rightStrip.style.cursor =
      this.mode === 'line' && this.getFocusedIndex() < this.items.length - 1 ? 'zoom-in' : 'zoom-out'
    this.lineBackplate.style.cursor = this.mode === 'line' ? 'zoom-out' : 'default'
  }

  ensureCard(item: PhotoData) {
    const existing = this.cardRefs.get(item.id)
    if (existing != null) return existing

    const root = document.createElement('article')
    root.dataset.photoId = item.id
    root.style.position = 'absolute'
    root.style.borderRadius = '18px'
    root.style.overflow = 'hidden'
    root.style.border = '1px solid rgba(255, 255, 255, 0.06)'
    root.style.boxShadow = '0 12px 38px rgba(0, 0, 0, 0.28)'
    root.style.background = '#0d1525'
    root.style.color = '#edf2ff'
    root.style.userSelect = 'none'
    root.style.cursor = 'zoom-in'

    const media = document.createElement('div')
    media.style.position = 'relative'
    media.style.width = '100%'
    media.style.overflow = 'hidden'

    const image = document.createElement('img')
    image.alt = ''
    image.draggable = false
    image.decoding = 'async'
    image.loading = 'eager'
    image.style.position = 'absolute'
    image.style.inset = '0'
    image.style.width = '100%'
    image.style.height = '100%'
    image.style.objectFit = 'cover'
    image.style.objectPosition = 'center'
    image.style.pointerEvents = 'none'

    const caption = document.createElement('div')
    caption.dataset.caption = 'true'
    caption.style.position = 'relative'
    caption.style.boxSizing = 'border-box'
    caption.style.padding = '10px 12px 8px'
    caption.style.fontSize = '14px'
    caption.style.lineHeight = '1.3'
    caption.style.letterSpacing = '0.01em'
    caption.style.background = 'linear-gradient(180deg, rgba(13, 21, 37, 0.9), rgba(13, 21, 37, 0.98))'
    caption.style.borderTop = '1px solid rgba(255, 255, 255, 0.04)'
    caption.style.overflow = 'hidden'
    caption.style.userSelect = 'text'
    caption.style.display = '-webkit-box'
    caption.style.webkitBoxOrient = 'vertical'
    caption.style.webkitLineClamp = '2'

    const captionText = document.createElement('span')
    captionText.textContent = item.prompt
    caption.append(captionText)
    media.append(image)
    root.append(media, caption)
    root.addEventListener('click', (event) => {
      const target = event.target
      if (!(target instanceof HTMLElement)) return
      if (this.mode !== 'grid') return
      if (target.closest('[data-caption]') != null) return
      this.focusId(item.id)
    })
    caption.addEventListener('click', (event) => {
      event.preventDefault()
      event.stopPropagation()
      this.selectCaption(item.id)
    })

    const refs = {root, media, image, caption, captionText}
    this.cardRefs.set(item.id, refs)
    this.gridStage.append(root)
    return refs
  }

  hitTestGridCard(pointerX: number, pointerY: number) {
    for (let index = 0; index < this.gridLayout.cards.length; index += 1) {
      const card = this.gridLayout.cards[index]
      if (card == null) continue
      const width = this.cardSprings.get(card.id)?.width.pos ?? card.cardWidth
      const height = this.cardSprings.get(card.id)?.height.pos ?? card.cardHeight
      const x = this.cardSprings.get(card.id)?.x.pos ?? card.x
      const y = this.cardSprings.get(card.id)?.y.pos ?? card.y
      if (
        pointerX >= x &&
        pointerX <= x + width &&
        pointerY >= y &&
        pointerY <= y + height
      ) {
        return card.id
      }
    }
    return null
  }

  captureGridAnchor(scrollTop: number) {
    for (let index = 0; index < this.gridLayout.cards.length; index += 1) {
      const card = this.gridLayout.cards[index]
      if (card == null) continue
      if (card.y + card.cardHeight > scrollTop) {
        return {id: card.id, offset: scrollTop - card.rowTop}
      }
    }
    const last = this.gridLayout.cards[this.gridLayout.cards.length - 1]
    if (last == null) return null
    return {id: last.id, offset: scrollTop - last.rowTop}
  }

  getFocusedIndex() {
    if (this.focusedId == null) return -1
    const index = this.idToIndex.get(this.focusedId)
    return index == null ? -1 : index
  }

  publishReport(report: ScenarioReport) {
    this.reportEl.textContent = JSON.stringify(report)
  }

  publishScenarioIfReady() {}

  runScenario(name: ScenarioName) {
    this.scenarioRun = true
    try {
      switch (name) {
        case 'navigation-flow':
          this.runNavigationFlowScenario()
          break
        case 'dismiss-to-row':
          this.runDismissToRowScenario()
          break
        case 'caption-selection':
          this.runCaptionSelectionScenario()
          break
        case 'occlusion':
          this.runOcclusionScenario()
          break
      }
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

  runNavigationFlowScenario() {
    this.scroller.scrollTop = 560
    this.render(performance.now())

    const hashSequence: string[] = []
    this.focusId(this.items[0]!.id)
    this.render(performance.now())
    hashSequence.push(window.location.hash)

    this.focusRelative(1)
    this.render(performance.now())
    hashSequence.push(window.location.hash)

    this.focusId(this.items[0]!.id)
    this.render(performance.now())
    hashSequence.push(window.location.hash)

    this.focusId(this.items[1]!.id)
    this.render(performance.now())
    hashSequence.push(window.location.hash)

    const scrollTopBeforeLock = this.scroller.scrollTop
    this.scroller.scrollTop = scrollTopBeforeLock + 240
    this.render(performance.now())
    const scrollTopDuringLock = this.scroller.scrollTop

    this.dismissLineMode()
    this.render(performance.now())
    hashSequence.push(window.location.hash)

    this.publishReport({
      phase: 'ready',
      requestId,
      scenario: 'navigation-flow',
      status: 'ok',
      data: {
        hashSequence,
        scrollTopBeforeLock,
        scrollTopDuringLock,
        dismissedHash: window.location.hash,
        finalMode: this.mode,
      },
    })
  }

  runDismissToRowScenario() {
    const focusedIndex = 15
    this.focusId(this.items[focusedIndex]!.id)
    this.render(performance.now())

    const beforeDismissVisible = this.isRowVisible(focusedIndex)
    this.dismissLineMode()
    this.render(performance.now())
    const afterDismissVisible = this.isRowVisible(focusedIndex)
    const focusedCard = this.gridLayout.cards[focusedIndex]
    const topOffset = focusedCard == null ? 0 : Math.round(focusedCard.rowTop - this.scroller.scrollTop)

    this.publishReport({
      phase: 'ready',
      requestId,
      scenario: 'dismiss-to-row',
      status: 'ok',
      data: {
        focusedIndex,
        beforeDismissVisible,
        afterDismissVisible,
        topOffset,
      },
    })
  }

  runCaptionSelectionScenario() {
    this.selectCaption(this.items[1]!.id)
    this.render(performance.now())
    this.publishReport({
      phase: 'ready',
      requestId,
      scenario: 'caption-selection',
      status: 'ok',
      data: {
        selectedText: this.selectedText,
        hashAfterClick: window.location.hash,
        modeAfterClick: this.mode,
      },
    })
  }

  runOcclusionScenario() {
    this.render(performance.now())
    this.publishReport({
      phase: 'ready',
      requestId,
      scenario: 'occlusion',
      status: 'ok',
      data: {
        mountedCount: this.mountedCount,
        itemCount: this.items.length,
      },
    })
  }

  isRowVisible(index: number) {
    if (index < 0) return false
    const focusedCard = this.gridLayout.cards[index]
    if (focusedCard == null) return false
    return (
      focusedCard.rowTop + focusedCard.rowHeight > this.scroller.scrollTop &&
      focusedCard.rowTop < this.scroller.scrollTop + this.viewportHeight
    )
  }

  requestedAnimation() {
    for (const springState of this.cardSprings.values()) {
      if (
        !springMostlyDone(springState.x) ||
        !springMostlyDone(springState.y) ||
        !springMostlyDone(springState.width) ||
        !springMostlyDone(springState.height) ||
        !springMostlyDone(springState.hoverScale) ||
        !springMostlyDone(springState.hoverOffsetX) ||
        !springMostlyDone(springState.hoverOffsetY)
      ) {
        return true
      }
    }
    return false
  }
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function clampIndex(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

async function nextFrame() {
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
}

const app = new PhotoGalleryApp(appRoot, reportEl, photoGalleryData)
app.start()
