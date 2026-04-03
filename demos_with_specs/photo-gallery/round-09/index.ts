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
  type GridCardLayout,
  type GridLayout,
  type LineCardLayout,
} from './layout'

type ScenarioReport = {
  phase: 'loading' | 'running' | 'ready' | 'error'
  requestId: string
  scenario: string
  status?: 'ok' | 'error'
  selectedText?: string
  focusedId?: string | null
  hashes?: string[]
  scrollTopBeforeDismiss?: number
  scrollTopAfterDismiss?: number
  focusedRowTopAfterDismiss?: number
  bodyOverflow?: string
  mountedCount?: number
  itemCount?: number
  message?: string
}

type CardRefs = {
  root: HTMLDivElement
  image: HTMLImageElement
  caption: HTMLDivElement
}

type OverlayRefs = {
  root: HTMLDivElement
  image: HTMLImageElement
  caption: HTMLDivElement
}

const query = new URLSearchParams(window.location.search)
const scenario = query.get('scenario') ?? ''
const requestId = query.get('requestId') ?? ''
const isScenarioMode = scenario !== ''

const appRoot = document.querySelector<HTMLDivElement>('#app')
if (appRoot == null) {
  throw new Error('Missing #app root')
}

class PhotoGalleryApp {
  root: HTMLDivElement
  scroller = document.createElement('div')
  scene = document.createElement('div')
  overlay = document.createElement('div')
  navHint = document.createElement('div')
  githubLink = document.createElement('a')
  reportEl = document.querySelector<HTMLScriptElement>('#scenario-report')
  items: PhotoData[]
  options: {scenario: string; requestId: string; isScenarioMode: boolean}
  layout: GridLayout
  overlayLayout: LineCardLayout[] = []
  viewportWidth = window.innerWidth
  viewportHeight = window.innerHeight
  focusedId: string | null = null
  hoveredId: string | null = null
  hoverPoint = {x: 0, y: 0}
  cardRefs = new Map<string, CardRefs>()
  overlayRefs = new Map<string, OverlayRefs>()
  mountedIds = new Set<string>()
  frameRequested = false
  hashes: string[] = []
  scrollTopBeforeDismiss = 0
  lineModeOverflow = ''
  lastSelectedText = ''

  constructor(
    root: HTMLDivElement,
    items: PhotoData[],
    options: {scenario: string; requestId: string; isScenarioMode: boolean},
  ) {
    this.root = root
    this.items = items
    this.options = options
    this.layout = computeGridLayout({
      viewportWidth: this.viewportWidth,
      items: this.items,
    })
  }

  start() {
    this.installShell()
    this.syncFocusFromHash()
    this.render()
    this.installEvents()
    if (this.options.isScenarioMode) {
      this.publishReport({phase: 'running'})
      void this.runScenario()
    }
  }

  installShell() {
    document.documentElement.style.background = '#08111f'
    document.body.style.margin = '0'
    document.body.style.background = '#08111f'
    document.body.style.color = '#edf2ff'
    document.body.style.fontFamily =
      '"Iowan Old Style", "Palatino Linotype", "Book Antiqua", Georgia, serif'
    document.body.style.overflow = 'hidden'

    this.root.innerHTML = ''
    this.root.style.position = 'fixed'
    this.root.style.inset = '0'
    this.root.style.background =
      'radial-gradient(circle at top, rgba(61, 94, 162, 0.22), transparent 38%), linear-gradient(180deg, #0a1323 0%, #09101d 55%, #050811 100%)'

    this.scroller.className = 'gallery-scroller'
    this.scroller.style.position = 'absolute'
    this.scroller.style.inset = '0'
    this.scroller.style.overflowX = 'hidden'
    this.scroller.style.overflowY = 'auto'
    this.scroller.style.scrollBehavior = 'auto'

    this.scene.className = 'gallery-scene'
    this.scene.style.position = 'relative'
    this.scene.style.minHeight = '100%'

    this.overlay.className = 'line-overlay'
    this.overlay.style.position = 'absolute'
    this.overlay.style.inset = '0'
    this.overlay.style.pointerEvents = 'none'
    this.overlay.style.opacity = '0'
    this.overlay.style.background =
      'linear-gradient(180deg, rgba(6, 11, 21, 0.8), rgba(6, 10, 18, 0.94))'
    this.overlay.style.backdropFilter = 'blur(10px)'

    this.navHint.style.position = 'absolute'
    this.navHint.style.right = '24px'
    this.navHint.style.bottom = '24px'
    this.navHint.style.padding = '10px 14px'
    this.navHint.style.borderRadius = '999px'
    this.navHint.style.fontSize = '12px'
    this.navHint.style.letterSpacing = '0.08em'
    this.navHint.style.textTransform = 'uppercase'
    this.navHint.style.background = 'rgba(255, 255, 255, 0.08)'
    this.navHint.style.color = 'rgba(240, 244, 255, 0.72)'
    this.navHint.textContent = 'Click image cards. Esc dismisses.'

    this.githubLink.href = 'https://github.com/'
    this.githubLink.target = '_blank'
    this.githubLink.rel = 'noreferrer'
    this.githubLink.setAttribute('aria-label', 'GitHub')
    this.githubLink.innerHTML =
      '<svg viewBox="0 0 24 24" width="19" height="19" aria-hidden="true"><path fill="currentColor" d="M12 .5a12 12 0 0 0-3.79 23.39c.6.1.82-.26.82-.58v-2.03c-3.35.73-4.05-1.42-4.05-1.42-.55-1.37-1.34-1.74-1.34-1.74-1.1-.74.08-.73.08-.73 1.21.09 1.85 1.23 1.85 1.23 1.08 1.83 2.83 1.3 3.52 1 .11-.77.42-1.3.77-1.6-2.68-.3-5.5-1.33-5.5-5.92 0-1.31.47-2.39 1.24-3.23-.13-.3-.54-1.52.12-3.18 0 0 1.01-.32 3.3 1.23a11.6 11.6 0 0 1 6 0c2.28-1.55 3.29-1.23 3.29-1.23.66 1.66.25 2.88.12 3.18.78.84 1.24 1.92 1.24 3.23 0 4.6-2.83 5.61-5.53 5.91.44.38.82 1.11.82 2.24v3.33c0 .32.22.69.83.58A12 12 0 0 0 12 .5"/></svg>'
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

    this.root.append(this.scroller, this.overlay, this.githubLink)
    this.scroller.append(this.scene, this.navHint)
  }

  installEvents() {
    this.scroller.addEventListener('scroll', () => this.requestRender(), {
      passive: true,
    })
    window.addEventListener('resize', () => this.onResize())
    window.addEventListener('hashchange', () => {
      this.syncFocusFromHash()
      this.requestRender()
    })
    window.addEventListener('keydown', (event) => this.onKeyDown(event))

    this.overlay.addEventListener('click', (event) => {
      if (this.focusedId == null) return
      const focusedIndex = this.getFocusedIndex()
      const action = routeLineModeClick({
        viewportWidth: this.viewportWidth,
        pointerX: event.clientX,
        hasPrevious: focusedIndex > 0,
        hasNext: focusedIndex < this.items.length - 1,
      })
      if (action === 'previous') this.focusRelative(-1)
      else if (action === 'next') this.focusRelative(1)
      else this.dismissLineMode()
    })

    this.overlay.addEventListener('mousemove', (event) => {
      if (this.focusedId == null) return
      const focusedIndex = this.getFocusedIndex()
      const action = routeLineModeClick({
        viewportWidth: this.viewportWidth,
        pointerX: event.clientX,
        hasPrevious: focusedIndex > 0,
        hasNext: focusedIndex < this.items.length - 1,
      })
      this.overlay.style.cursor = action === 'dismiss' ? 'zoom-out' : 'zoom-in'
    })
  }

  onResize() {
    const previousWidth = this.viewportWidth
    const previousLayout = this.layout
    const previousScrollTop = this.scroller.scrollTop
    const previousAnchor = this.getAnchorCard(previousLayout, previousScrollTop)

    this.viewportWidth = window.innerWidth
    this.viewportHeight = window.innerHeight
    this.layout = computeGridLayout({
      viewportWidth: this.viewportWidth,
      items: this.items,
    })

    if (this.focusedId == null && previousAnchor != null && previousWidth !== this.viewportWidth) {
      const nextAnchor = this.layout.cards[previousAnchor.index]
      const nextScrollTop = nextAnchor.y + previousAnchor.offset
      this.scroller.scrollTo({top: Math.max(0, nextScrollTop), behavior: 'instant'})
    }

    this.requestRender()
  }

  onKeyDown(event: KeyboardEvent) {
    if (event.key === 'ArrowLeft') {
      event.preventDefault()
      if (this.focusedId == null) this.openLineMode(this.items[0].id)
      else this.focusRelative(-1)
      return
    }
    if (event.key === 'ArrowRight') {
      event.preventDefault()
      if (this.focusedId == null) this.openLineMode(this.items[0].id)
      else this.focusRelative(1)
      return
    }
    if (event.key === 'Escape' && this.focusedId != null) {
      event.preventDefault()
      this.dismissLineMode()
    }
  }

  syncFocusFromHash() {
    const rawHash = window.location.hash.startsWith('#')
      ? decodeURIComponent(window.location.hash.slice(1))
      : ''
    const nextFocusedId =
      rawHash !== '' && this.items.some((item) => item.id === rawHash) ? rawHash : null
    this.focusedId = nextFocusedId
    this.applyScrollLock()
  }

  applyScrollLock() {
    const locked = this.focusedId != null
    this.scroller.style.overflowY = locked ? 'hidden' : 'auto'
    document.body.style.overflow = locked ? 'hidden' : 'hidden'
    if (locked) this.lineModeOverflow = this.scroller.style.overflowY
  }

  requestRender() {
    if (this.frameRequested) return
    this.frameRequested = true
    requestAnimationFrame(() => {
      this.frameRequested = false
      this.render()
    })
  }

  render() {
    this.layout = computeGridLayout({
      viewportWidth: this.viewportWidth,
      items: this.items,
    })

    this.scene.style.height = `${this.layout.totalHeight}px`
    this.renderGrid()
    this.renderOverlay()
  }

  renderGrid() {
    const {firstRow, lastRow} = getVisibleGridRows({
      rowTops: this.layout.rowTops,
      rowHeights: this.layout.rowHeights,
      scrollTop: this.scroller.scrollTop,
      viewportHeight: this.viewportHeight,
      overscan: 520,
    })
    const visibleIds = new Set<string>()

    for (const card of this.layout.cards) {
      if (card.row < firstRow || card.row > lastRow) continue
      visibleIds.add(card.id)
      const refs = this.ensureGridCard(card)
      this.updateGridCard(refs, card)
    }

    for (const [id, refs] of this.cardRefs) {
      if (visibleIds.has(id)) continue
      refs.root.remove()
      this.cardRefs.delete(id)
    }

    this.mountedIds = visibleIds
  }

  ensureGridCard(card: GridCardLayout) {
    let refs = this.cardRefs.get(card.id)
    if (refs != null) return refs

    const root = document.createElement('div')
    root.className = 'photo-card'
    root.dataset.photoId = card.id
    root.style.position = 'absolute'
    root.style.borderRadius = '24px'
    root.style.background = 'rgba(7, 13, 25, 0.92)'
    root.style.boxShadow = '0 18px 40px rgba(0, 0, 0, 0.32)'
    root.style.overflow = 'clip'
    root.style.cursor = 'zoom-in'
    root.style.willChange = 'transform'
    root.style.transformOrigin = 'center center'

    const image = document.createElement('img')
    image.alt = ''
    image.draggable = false
    image.style.display = 'block'
    image.style.width = '100%'
    image.style.height = '100%'
    image.style.objectFit = 'cover'
    image.style.borderRadius = '18px 18px 0 0'

    const imageWrap = document.createElement('div')
    imageWrap.style.position = 'relative'
    imageWrap.style.overflow = 'hidden'
    imageWrap.style.borderRadius = '18px 18px 0 0'
    imageWrap.append(image)

    const caption = document.createElement('div')
    caption.dataset.captionId = card.id
    caption.style.padding = '12px 14px 8px'
    caption.style.fontSize = '14px'
    caption.style.lineHeight = '22px'
    caption.style.color = 'rgba(238, 242, 255, 0.94)'
    caption.style.maxHeight = '44px'
    caption.style.overflow = 'hidden'
    caption.style.display = '-webkit-box'
    caption.style.webkitLineClamp = '2'
    caption.style.webkitBoxOrient = 'vertical'
    caption.style.userSelect = 'text'

    root.addEventListener('pointerenter', () => {
      this.hoveredId = card.id
      document.body.style.cursor = 'zoom-in'
      this.requestRender()
    })
    root.addEventListener('pointerleave', () => {
      if (this.hoveredId === card.id) {
        this.hoveredId = null
        document.body.style.cursor = ''
        this.requestRender()
      }
    })
    root.addEventListener('pointermove', (event) => {
      this.hoverPoint = {x: event.clientX, y: event.clientY}
      if (this.hoveredId === card.id) this.requestRender()
    })
    root.addEventListener('click', () => {
      this.openLineMode(card.id)
    })
    caption.addEventListener('click', (event) => {
      event.stopPropagation()
      this.selectCaption(caption)
    })

    root.append(imageWrap, caption)
    this.scene.append(root)
    refs = {root, image, caption}
    this.cardRefs.set(card.id, refs)
    return refs
  }

  updateGridCard(refs: CardRefs, card: GridCardLayout) {
    const item = this.items[card.index]
    refs.root.style.left = `${card.x}px`
    refs.root.style.top = `${card.y}px`
    refs.root.style.width = `${card.cardWidth}px`
    refs.root.style.height = `${card.cardHeight}px`
    refs.root.style.padding = '0'
    refs.root.style.backgroundImage = `url("${this.getImageSource(item.id, 'low')}")`
    refs.root.style.backgroundSize = 'cover'
    refs.root.style.backgroundPosition = 'center'
    refs.root.style.backgroundRepeat = 'no-repeat'

    const imageWrap = refs.image.parentElement as HTMLDivElement
    imageWrap.style.width = `${card.cardWidth}px`
    imageWrap.style.height = `${card.imageHeight}px`

    refs.image.src = this.getImageSource(item.id, 'high')
    refs.image.loading = 'lazy'
    refs.caption.textContent = item.prompt

    const hoverTransform =
      this.hoveredId === card.id
        ? this.getHoverTransform(card)
        : 'translate3d(0px, 0px, 0px) scale(1)'
    refs.root.style.transform = hoverTransform
  }

  getHoverTransform(card: GridCardLayout) {
    const centerX = card.x + card.cardWidth / 2
    const centerY =
      card.y - this.scroller.scrollTop + Math.min(card.imageHeight, 180) / 2
    const shiftX = clamp((this.hoverPoint.x - centerX) * 0.04, -6, 6)
    const shiftY = clamp((this.hoverPoint.y - centerY) * 0.04, -6, 6)
    return `translate3d(${shiftX}px, ${shiftY}px, 0px) scale(1.02)`
  }

  renderOverlay() {
    if (this.focusedId == null) {
      this.overlay.style.opacity = '0'
      this.overlay.style.pointerEvents = 'none'
      for (const [, refs] of this.overlayRefs) refs.root.remove()
      this.overlayRefs.clear()
      return
    }

    this.overlay.style.opacity = '1'
    this.overlay.style.pointerEvents = 'auto'

    const focusedIndex = this.getFocusedIndex()
    this.overlayLayout = computeLineLayout({
      viewportWidth: this.viewportWidth,
      viewportHeight: this.viewportHeight,
      items: this.items,
      focusedIndex,
    })

    const visibleIds = new Set<string>()
    for (const card of this.overlayLayout) {
      const refs = this.ensureOverlayCard(card)
      this.updateOverlayCard(refs, card)
      visibleIds.add(card.id)
    }
    for (const [id, refs] of this.overlayRefs) {
      if (visibleIds.has(id)) continue
      refs.root.remove()
      this.overlayRefs.delete(id)
    }
  }

  ensureOverlayCard(card: LineCardLayout) {
    let refs = this.overlayRefs.get(card.id)
    if (refs != null) return refs

    const root = document.createElement('div')
    root.style.position = 'absolute'
    root.style.borderRadius = '26px'
    root.style.background = 'rgba(10, 15, 28, 0.94)'
    root.style.boxShadow = '0 24px 90px rgba(0, 0, 0, 0.45)'
    root.style.overflow = 'clip'

    const image = document.createElement('img')
    image.alt = ''
    image.draggable = false
    image.style.display = 'block'
    image.style.width = '100%'
    image.style.height = '100%'
    image.style.objectFit = 'cover'
    image.style.filter = 'saturate(1.02)'

    const imageWrap = document.createElement('div')
    imageWrap.style.overflow = 'hidden'
    imageWrap.style.borderRadius = '20px 20px 0 0'
    imageWrap.append(image)

    const caption = document.createElement('div')
    caption.style.padding = '16px 18px 8px'
    caption.style.fontSize = '15px'
    caption.style.lineHeight = '24px'
    caption.style.maxHeight = '64px'
    caption.style.overflowY = 'auto'
    caption.style.color = 'rgba(245, 247, 255, 0.92)'

    root.append(imageWrap, caption)
    this.overlay.append(root)
    refs = {root, image, caption}
    this.overlayRefs.set(card.id, refs)
    return refs
  }

  updateOverlayCard(refs: OverlayRefs, card: LineCardLayout) {
    const item = this.items[card.index]
    refs.root.style.left = `${card.x}px`
    refs.root.style.top = `${card.y}px`
    refs.root.style.width = `${card.cardWidth}px`
    refs.root.style.height = `${card.cardHeight}px`
    refs.root.style.opacity = card.isFocused ? '1' : '0.82'
    refs.root.style.transform = card.isFocused ? 'scale(1)' : 'scale(0.985)'

    const imageWrap = refs.image.parentElement as HTMLDivElement
    imageWrap.style.width = `${card.cardWidth}px`
    imageWrap.style.height = `${card.imageHeight}px`
    imageWrap.style.backgroundImage = `url("${this.getImageSource(item.id, 'low')}")`
    imageWrap.style.backgroundSize = 'cover'
    imageWrap.style.backgroundPosition = 'center'

    refs.image.src = card.isFocused
      ? this.getImageSource(item.id, 'high')
      : this.getImageSource(item.id, 'low')
    refs.image.style.opacity = card.isFocused ? '1' : '0.72'
    refs.image.style.filter = card.isFocused
      ? 'brightness(1)'
      : `brightness(0.7) ${Math.abs(card.index - this.getFocusedIndex()) === 1 ? 'blur(1px)' : ''}`
    refs.caption.textContent = item.prompt
  }

  openLineMode(id: string) {
    if (this.focusedId === id) return
    this.setFocusedHash(id)
  }

  dismissLineMode() {
    if (this.focusedId == null) return
    const focusedCard = this.layout.cards[this.getFocusedIndex()]
    const nextScrollTop = computeDismissScrollTop({
      currentScrollTop: this.scroller.scrollTop,
      viewportHeight: this.viewportHeight,
      rowTop: focusedCard.rowTop,
      rowHeight: focusedCard.rowHeight,
    })
    this.setFocusedHash(null)
    this.scroller.scrollTo({top: nextScrollTop, behavior: 'instant'})
  }

  focusRelative(delta: number) {
    const index = this.getFocusedIndex()
    const nextIndex = clamp(index + delta, 0, this.items.length - 1)
    if (nextIndex === index) return
    this.setFocusedHash(this.items[nextIndex].id)
  }

  setFocusedHash(nextId: string | null) {
    if (nextId == null) {
      history.pushState(null, '', `${window.location.pathname}${window.location.search}`)
      this.hashes.push(window.location.hash)
    } else {
      window.location.hash = encodeURIComponent(nextId)
      this.hashes.push(window.location.hash)
    }
    this.syncFocusFromHash()
    this.requestRender()
  }

  selectCaption(captionEl: HTMLDivElement) {
    const selection = window.getSelection()
    if (selection == null) return
    const range = document.createRange()
    range.selectNodeContents(captionEl)
    selection.removeAllRanges()
    selection.addRange(range)
    this.lastSelectedText = captionEl.textContent ?? ''
  }

  getFocusedIndex() {
    return Math.max(
      0,
      this.items.findIndex((item) => item.id === this.focusedId),
    )
  }

  getImageSource(id: string, quality: 'low' | 'high') {
    if (this.options.isScenarioMode) return scenarioPlaceholderImage
    return quality === 'low' ? getLowResImageUrl(id) : getHighResImageUrl(id)
  }

  getAnchorCard(layout: GridLayout, scrollTop: number) {
    const anchor = layout.cards.find(
      (card) => card.y + card.rowHeight > scrollTop + 1,
    )
    if (anchor == null) return null
    return {
      index: anchor.index,
      offset: scrollTop - anchor.y,
    }
  }

  async runScenario() {
    try {
      if (this.options.scenario === 'caption-selection') {
        await this.runCaptionSelectionScenario()
      } else if (this.options.scenario === 'navigation-flow') {
        await this.runNavigationScenario()
      } else if (this.options.scenario === 'dismiss-to-row') {
        await this.runDismissScenario()
      } else {
        throw new Error(`Unknown scenario "${this.options.scenario}"`)
      }
    } catch (error) {
      this.publishReport({
        phase: 'error',
        status: 'error',
        message: error instanceof Error ? error.message : String(error),
      })
    }
  }

  async runCaptionSelectionScenario() {
    await this.waitForStableFrame()
    const firstId = this.items[0].id
    const caption = this.cardRefs.get(firstId)?.caption
    if (caption == null) throw new Error('Missing first caption for scenario')
    caption.dispatchEvent(new MouseEvent('click', {bubbles: true, cancelable: true}))
    await this.waitForStableFrame()
    this.publishReport({
      phase: 'ready',
      status: 'ok',
      selectedText:
        document.getSelection()?.toString() || this.lastSelectedText,
      focusedId: this.focusedId,
    })
  }

  async runNavigationScenario() {
    await this.waitForStableFrame()
    const firstId = this.items[0].id
    this.cardRefs.get(firstId)?.root.dispatchEvent(
      new MouseEvent('click', {bubbles: true, cancelable: true}),
    )
    await this.waitForStableFrame()

    this.overlay.dispatchEvent(
      new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        clientX: window.innerWidth - 36,
        clientY: window.innerHeight / 2,
      }),
    )
    await this.waitForStableFrame()

    history.back()
    await this.waitForHash('#d228330c-7364-497b-994f-a37467ae436a%2F0_0')
    history.forward()
    await this.waitForHash('#7b5301ca-ef01-44bd-8bcc-4473c945aaaf%2F0_0')

    this.overlay.dispatchEvent(
      new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        clientX: window.innerWidth / 2,
        clientY: window.innerHeight / 2,
      }),
    )
    await this.waitForHash('')

    this.publishReport({
      phase: 'ready',
      status: 'ok',
      hashes: this.hashes,
      bodyOverflow: this.lineModeOverflow,
    })
  }

  async runDismissScenario() {
    this.scroller.scrollTo({top: 1160, behavior: 'instant'})
    await this.waitForStableFrame()

    const startingId = this.items[15].id
    this.cardRefs.get(startingId)?.root.dispatchEvent(
      new MouseEvent('click', {bubbles: true, cancelable: true}),
    )
    await this.waitForStableFrame()

    for (let steps = 0; steps < 13; steps += 1) {
      this.focusRelative(-1)
      await this.waitForStableFrame()
    }

    this.scrollTopBeforeDismiss = this.scroller.scrollTop
    this.overlay.dispatchEvent(
      new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        clientX: window.innerWidth / 2,
        clientY: window.innerHeight / 2,
      }),
    )
    await this.waitForStableFrame()

    const focusedCard = this.layout.cards[2]
    this.publishReport({
      phase: 'ready',
      status: 'ok',
      scrollTopBeforeDismiss: this.scrollTopBeforeDismiss,
      scrollTopAfterDismiss: this.scroller.scrollTop,
      focusedRowTopAfterDismiss: focusedCard.rowTop - this.scroller.scrollTop,
      mountedCount: this.mountedIds.size,
      itemCount: this.items.length,
    })
  }

  waitForStableFrame() {
    return new Promise<void>((resolve) => {
      requestAnimationFrame(() => {
        this.render()
        requestAnimationFrame(() => resolve())
      })
    })
  }

  waitForHash(expectedHash: string) {
    return new Promise<void>((resolve, reject) => {
      const started = performance.now()
      const check = () => {
        if (window.location.hash === expectedHash) {
          this.syncFocusFromHash()
          this.render()
          this.hashes.push(window.location.hash)
          resolve()
          return
        }
        if (performance.now() - started > 2000) {
          reject(new Error(`Timed out waiting for hash ${expectedHash}`))
          return
        }
        requestAnimationFrame(check)
      }
      check()
    })
  }

  publishReport(partial: Partial<ScenarioReport>) {
    if (this.reportEl == null) return
    const report: ScenarioReport = {
      phase: partial.phase ?? 'loading',
      requestId: this.options.requestId,
      scenario: this.options.scenario,
      ...partial,
    }
    this.reportEl.textContent = JSON.stringify(report)
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

const app = new PhotoGalleryApp(appRoot, photoGalleryData, {
  scenario,
  requestId,
  isScenarioMode,
})

app.start()
