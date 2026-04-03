import {photoGalleryData, type PhotoData} from './data'
import {
  GRID_CAPTION_HEIGHT,
  GRID_GAP,
  GRID_TOP_PADDING,
  LINE_NAV_WIDTH,
  computeGridLayout,
  routeLineModeClick,
  type GridLayout,
  type GridLayoutItem,
} from './layout'
import {
  msPerAnimationStep,
  retargetSpring,
  spring,
  springGoToEnd,
  springMostlyDone,
  springStep,
  type Spring,
} from './springs'

const GRID_OVERSCAN = 520
const LINE_OVERSCAN = 420
const LINE_GAP = 52
const LINE_TOP_PADDING = 40
const LINE_CAPTION_HEIGHT = 72
const LINE_BOTTOM_GAP = 28
const NEIGHBOR_SCALE = 0.7
const LINE_TARGET_WIDTH_RATIO = 0.56
const NAV_HOVER_BUMP = 0.04

type CardMotion = {
  x: Spring
  y: Spring
  cardWidth: Spring
  cardHeight: Spring
  imageHeight: Spring
  scale: Spring
  opacity: Spring
  magnetX: Spring
  magnetY: Spring
  blur: Spring
  brightness: Spring
}

type CardDom = {
  node: HTMLDivElement
  media: HTMLDivElement
  image: HTMLImageElement
  caption: HTMLDivElement
  captionText: HTMLDivElement
}

type ScrollAnchor = {
  photoId: string
  prevY: number
}

type ScenarioSnapshot = {
  focusedId: string | null
  hash: string
  scrollTop: number
  scrollLocked: boolean
}

function lowResUrl(id: string) {
  return `https://cdn.midjourney.com/${id}_384_N.webp`
}

function highResUrl(id: string) {
  return `https://cdn.midjourney.com/${id}.webp`
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function selectNodeText(node: HTMLElement) {
  const selection = document.getSelection()
  if (selection == null) return
  const range = document.createRange()
  range.selectNodeContents(node)
  selection.removeAllRanges()
  selection.addRange(range)
}

function focusFromHash() {
  const rawHash = window.location.hash.startsWith('#')
    ? window.location.hash.slice(1)
    : window.location.hash
  const decoded = decodeURIComponent(rawHash)
  return photoGalleryData.some((photo) => photo.id === decoded) ? decoded : null
}

function fitSize(photo: PhotoData, maxWidth: number, maxHeight: number) {
  const scale = Math.min(maxWidth / photo.w, maxHeight / photo.h)
  return {
    width: Math.max(40, photo.w * scale),
    height: Math.max(40, photo.h * scale),
  }
}

function injectStyles() {
  const style = document.createElement('style')
  style.textContent = `
    :root {
      --bg-0: #081423;
      --bg-1: #10233a;
      --bg-2: rgba(6, 17, 31, 0.92);
      --card: rgba(12, 22, 37, 0.92);
      --card-edge: rgba(151, 176, 214, 0.12);
      --card-shadow: 0 20px 60px rgba(0, 0, 0, 0.34);
      --caption: rgba(224, 234, 248, 0.88);
      --caption-muted: rgba(202, 214, 229, 0.76);
      --chrome: rgba(240, 245, 255, 0.92);
      --chrome-bg: rgba(12, 18, 28, 0.62);
      --backdrop: rgba(4, 8, 15, 0.78);
    }

    * {
      box-sizing: border-box;
    }

    html {
      color-scheme: dark;
      overflow-x: hidden;
      background:
        radial-gradient(circle at top left, rgba(32, 62, 96, 0.55), transparent 38%),
        radial-gradient(circle at 82% 14%, rgba(22, 58, 83, 0.42), transparent 26%),
        linear-gradient(180deg, #081423 0%, #06101b 56%, #040912 100%);
    }

    body {
      margin: 0;
      min-height: 100vh;
      overflow-x: hidden;
      font-family: "Avenir Next", "Trebuchet MS", "Segoe UI", sans-serif;
      color: var(--caption);
      background: transparent;
    }

    a {
      color: inherit;
    }

    #app-root {
      position: relative;
      min-height: 100vh;
    }

    .gallery-scene {
      position: relative;
      width: 100%;
    }

    .gallery-card {
      position: absolute;
      left: 0;
      top: 0;
      display: flex;
      flex-direction: column;
      gap: 0;
      border-radius: 26px;
      overflow: hidden;
      border: 1px solid var(--card-edge);
      background: linear-gradient(180deg, rgba(18, 32, 50, 0.94), rgba(10, 20, 35, 0.98));
      box-shadow: var(--card-shadow);
      transform-origin: center center;
      will-change: auto;
      user-select: none;
      touch-action: manipulation;
    }

    .gallery-card[data-mode="grid"] {
      cursor: zoom-in;
    }

    .gallery-card[data-mode="line"] {
      user-select: none;
      pointer-events: none;
    }

    .gallery-media {
      position: relative;
      width: 100%;
      background-position: center center;
      background-size: cover;
      background-repeat: no-repeat;
      overflow: hidden;
    }

    .gallery-media::after {
      content: "";
      position: absolute;
      inset: 0;
      background:
        linear-gradient(180deg, rgba(255, 255, 255, 0.04), transparent 25%, transparent 70%, rgba(0, 0, 0, 0.16)),
        linear-gradient(180deg, transparent, rgba(0, 0, 0, 0.18));
      pointer-events: none;
    }

    .gallery-image {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      object-fit: cover;
      object-position: center center;
      display: block;
      opacity: 1;
      transition: opacity 120ms linear;
      pointer-events: none;
    }

    .gallery-caption {
      position: relative;
      width: 100%;
      padding: 14px 16px 8px;
      color: var(--caption-muted);
      font-size: 13px;
      line-height: 1.33;
      letter-spacing: 0.01em;
      background:
        linear-gradient(180deg, rgba(11, 18, 29, 0.12), rgba(8, 12, 20, 0.26)),
        linear-gradient(180deg, rgba(255, 255, 255, 0.02), rgba(255, 255, 255, 0));
    }

    .gallery-caption[data-mode="grid"] {
      cursor: text;
      overflow: hidden;
    }

    .gallery-caption[data-mode="grid"] .gallery-caption-text {
      display: -webkit-box;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 2;
      overflow: hidden;
    }

    .gallery-caption[data-mode="line"] {
      pointer-events: auto;
      overflow-y: auto;
      color: var(--caption);
      scrollbar-width: thin;
    }

    .gallery-caption-text {
      user-select: text;
      white-space: normal;
    }

    .gallery-backdrop {
      position: fixed;
      inset: 0;
      background: linear-gradient(180deg, rgba(4, 7, 14, 0.84), rgba(4, 7, 14, 0.74));
      opacity: 0;
      pointer-events: none;
      transition: opacity 120ms linear;
      backdrop-filter: blur(22px) saturate(110%);
    }

    .gallery-backdrop[data-visible="true"] {
      pointer-events: auto;
    }

    .gallery-dismiss-surface {
      position: fixed;
      inset: 0;
      pointer-events: none;
    }

    .gallery-dismiss-surface[data-visible="true"] {
      pointer-events: auto;
    }

    .gallery-nav {
      position: fixed;
      top: 0;
      bottom: 0;
      width: ${LINE_NAV_WIDTH}px;
      pointer-events: none;
    }

    .gallery-nav[data-visible="true"] {
      pointer-events: auto;
    }

    .gallery-nav-left {
      left: 0;
    }

    .gallery-nav-right {
      right: 0;
    }

    .github-chrome {
      position: fixed;
      top: 18px;
      right: 20px;
      z-index: 50;
      width: 44px;
      height: 44px;
      display: grid;
      place-items: center;
      border-radius: 999px;
      border: 1px solid rgba(232, 240, 255, 0.12);
      background: var(--chrome-bg);
      color: var(--chrome);
      box-shadow: 0 16px 36px rgba(0, 0, 0, 0.22);
      backdrop-filter: blur(16px);
    }

    .github-chrome svg {
      width: 20px;
      height: 20px;
      fill: currentColor;
    }
  `
  document.head.appendChild(style)
}

function createGithubChrome() {
  const link = document.createElement('a')
  link.className = 'github-chrome'
  link.href = 'https://github.com/'
  link.target = '_blank'
  link.rel = 'noreferrer'
  link.setAttribute('aria-label', 'Open GitHub')
  link.innerHTML =
    '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 0C3.58 0 0 3.67 0 8.2c0 3.63 2.29 6.7 5.47 7.79.4.08.55-.18.55-.4 0-.2-.01-.86-.01-1.56-2.01.38-2.53-.5-2.69-.96-.09-.24-.48-.97-.82-1.17-.28-.15-.68-.53-.01-.54.63-.01 1.08.59 1.23.84.72 1.25 1.87.9 2.33.69.07-.53.28-.9.51-1.11-1.78-.21-3.64-.92-3.64-4.08 0-.9.31-1.63.82-2.2-.08-.21-.36-1.05.08-2.18 0 0 .67-.22 2.2.84a7.36 7.36 0 0 1 4 0c1.53-1.06 2.2-.84 2.2-.84.44 1.13.16 1.97.08 2.18.51.57.82 1.29.82 2.2 0 3.17-1.87 3.87-3.65 4.08.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .22.15.49.55.4A8.24 8.24 0 0 0 16 8.2C16 3.67 12.42 0 8 0Z"></path></svg>'
  return link
}

export class PhotoGalleryApp {
  private readonly root: HTMLElement
  private readonly disableRemoteImages: boolean
  private readonly scene = document.createElement('div')
  private readonly backdrop = document.createElement('div')
  private readonly dismissSurface = document.createElement('div')
  private readonly navLeft = document.createElement('div')
  private readonly navRight = document.createElement('div')
  private readonly githubChrome = createGithubChrome()
  private readonly cardDom = new Map<string, CardDom>()
  private readonly cardMotion = new Map<string, CardMotion>()
  private readonly photoById = new Map(photoGalleryData.map((photo) => [photo.id, photo]))
  private readonly photoIndexById = new Map(photoGalleryData.map((photo, index) => [photo.id, index]))
  private scheduledFrame = 0
  private reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  private lastRenderTime = 0
  private appliedScrollTop = window.scrollY
  private gridLayout: GridLayout | null = null
  private scrollAnchor: ScrollAnchor | null = null
  private focusedId: string | null = focusFromHash()
  private hoveredId: string | null = null
  private pointerClientX = 0
  private pointerClientY = 0
  private navHover: 'left' | 'right' | null = null
  private pendingDismissScrollTop: number | null = null
  private isAlive = true

  constructor(root: HTMLElement, options?: {disableRemoteImages?: boolean}) {
    injectStyles()
    this.root = root
    this.disableRemoteImages = options?.disableRemoteImages === true
    this.scene.className = 'gallery-scene'
    this.backdrop.className = 'gallery-backdrop'
    this.dismissSurface.className = 'gallery-dismiss-surface'
    this.navLeft.className = 'gallery-nav gallery-nav-left'
    this.navRight.className = 'gallery-nav gallery-nav-right'

    this.root.append(this.scene, this.backdrop, this.dismissSurface, this.navLeft, this.navRight, this.githubChrome)

    window.addEventListener('mousemove', this.onPointerMove, {passive: true})
    window.addEventListener('mouseleave', this.onPointerLeave)
    window.addEventListener('scroll', this.onScroll, {passive: true})
    window.addEventListener('resize', this.onResize, {passive: true})
    window.addEventListener('keydown', this.onKeyDown)
    window.addEventListener('hashchange', this.onHashChange)
    window.addEventListener('popstate', this.onHashChange)

    this.dismissSurface.addEventListener('click', this.onDismissSurfaceClick)
    this.navLeft.addEventListener('click', () => this.focusRelative(-1))
    this.navRight.addEventListener('click', () => this.focusRelative(1))
    this.navLeft.addEventListener('mouseenter', () => {
      this.navHover = 'left'
      this.scheduleRender()
    })
    this.navRight.addEventListener('mouseenter', () => {
      this.navHover = 'right'
      this.scheduleRender()
    })
    this.navLeft.addEventListener('mouseleave', () => {
      this.navHover = null
      this.scheduleRender()
    })
    this.navRight.addEventListener('mouseleave', () => {
      this.navHover = null
      this.scheduleRender()
    })

    this.scheduleRender()
  }

  destroy() {
    this.isAlive = false
    if (this.scheduledFrame !== 0) cancelAnimationFrame(this.scheduledFrame)
    window.removeEventListener('mousemove', this.onPointerMove)
    window.removeEventListener('mouseleave', this.onPointerLeave)
    window.removeEventListener('scroll', this.onScroll)
    window.removeEventListener('resize', this.onResize)
    window.removeEventListener('keydown', this.onKeyDown)
    window.removeEventListener('hashchange', this.onHashChange)
    window.removeEventListener('popstate', this.onHashChange)
  }

  getSnapshot(): ScenarioSnapshot {
    return {
      focusedId: this.focusedId,
      hash: window.location.hash,
      scrollTop: window.scrollY,
      scrollLocked: getComputedStyle(document.body).overflow === 'hidden',
    }
  }

  getCardNode(photoId: string) {
    return this.cardDom.get(photoId)?.node ?? null
  }

  getCaptionNode(photoId: string) {
    return this.cardDom.get(photoId)?.captionText ?? null
  }

  getNavElement(side: 'left' | 'right') {
    return side === 'left' ? this.navLeft : this.navRight
  }

  getDismissSurface() {
    return this.dismissSurface
  }

  scrollPhotoIntoView(photoId: string, extraTopPeek = 120) {
    const item = this.gridLayout?.items.find((entry) => entry.photoId === photoId) ?? null
    if (item == null) return
    window.scrollTo({top: Math.max(0, item.y - extraTopPeek), behavior: 'instant'})
    this.appliedScrollTop = window.scrollY
    this.scheduleRender()
  }

  focusPhoto(photoId: string | null, pushHash = true) {
    if (photoId === this.focusedId) return
    const previousFocusedId = this.focusedId
    this.focusedId = photoId
    if (photoId == null && previousFocusedId != null) {
      const layout = this.gridLayout
      const focusedItem = layout?.items.find((item) => item.photoId === previousFocusedId) ?? null
      if (focusedItem != null) this.pendingDismissScrollTop = Math.max(0, focusedItem.y - 40)
    }

    if (pushHash) this.syncHashWithFocus()
    this.scheduleRender()
  }

  focusRelative(delta: number) {
    if (this.focusedId == null) {
      if (delta !== 0) this.focusPhoto(photoGalleryData[0]?.id ?? null)
      return
    }
    const currentIndex = this.photoIndexById.get(this.focusedId)
    if (currentIndex == null) return
    const nextIndex = clamp(currentIndex + delta, 0, photoGalleryData.length - 1)
    if (nextIndex !== currentIndex) {
      this.focusPhoto(photoGalleryData[nextIndex]!.id)
    }
  }

  waitFor(predicate: () => boolean, timeoutMs = 4_000) {
    const startedAt = performance.now()
    return new Promise<void>((resolve, reject) => {
      const check = () => {
        if (predicate()) {
          resolve()
          return
        }
        if (performance.now() - startedAt > timeoutMs) {
          reject(new Error('Timed out waiting for gallery condition'))
          return
        }
        requestAnimationFrame(check)
      }
      check()
    })
  }

  async waitForIdle(timeoutMs = 4_000) {
    await this.waitFor(() => !this.isAnimating(), timeoutMs)
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
  }

  waitForFrames(frameCount: number) {
    return new Promise<void>((resolve) => {
      let remaining = frameCount
      const step = () => {
        remaining -= 1
        if (remaining <= 0) {
          resolve()
          return
        }
        requestAnimationFrame(step)
      }
      requestAnimationFrame(step)
    })
  }

  private syncHashWithFocus() {
    const targetUrl =
      this.focusedId == null
        ? `${window.location.pathname}${window.location.search}`
        : `#${encodeURIComponent(this.focusedId)}`

    if (this.focusedId == null) {
      if (window.location.hash !== '') {
        history.pushState({focusedId: null}, '', targetUrl)
      }
      return
    }

    if (window.location.hash !== targetUrl) window.location.hash = encodeURIComponent(this.focusedId)
  }

  private readonly onPointerMove = (event: MouseEvent) => {
    this.pointerClientX = event.clientX
    this.pointerClientY = event.clientY
    const target = event.target instanceof HTMLElement ? event.target : null
    const hoveredCard = target?.closest<HTMLElement>('[data-photo-id]')
    this.hoveredId =
      this.focusedId == null && hoveredCard != null ? hoveredCard.dataset.photoId ?? null : null
    this.scheduleRender()
  }

  private readonly onPointerLeave = () => {
    this.hoveredId = null
    this.navHover = null
    this.scheduleRender()
  }

  private readonly onScroll = () => {
    if (this.focusedId != null) return
    this.scheduleRender()
  }

  private readonly onResize = () => {
    this.scheduleRender()
  }

  private readonly onHashChange = () => {
    const nextFocusedId = focusFromHash()
    if (nextFocusedId !== this.focusedId) {
      this.focusedId = nextFocusedId
      this.scheduleRender()
    }
  }

  private readonly onDismissSurfaceClick = (event: MouseEvent) => {
    const action = routeLineModeClick(
      event.clientX,
      document.documentElement.clientWidth,
      this.hasPrevious(),
      this.hasNext(),
    )
    if (action === 'previous') this.focusRelative(-1)
    else if (action === 'next') this.focusRelative(1)
    else this.focusPhoto(null)
  }

  private readonly onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'ArrowLeft') {
      event.preventDefault()
      this.focusRelative(-1)
    } else if (event.key === 'ArrowRight') {
      event.preventDefault()
      this.focusRelative(1)
    } else if (event.key === 'Escape') {
      if (this.focusedId != null) {
        event.preventDefault()
        this.focusPhoto(null)
      }
    }
  }

  private hasPrevious() {
    if (this.focusedId == null) return false
    const index = this.photoIndexById.get(this.focusedId) ?? 0
    return index > 0
  }

  private hasNext() {
    if (this.focusedId == null) return false
    const index = this.photoIndexById.get(this.focusedId) ?? 0
    return index < photoGalleryData.length - 1
  }

  private scheduleRender() {
    if (!this.isAlive || this.scheduledFrame !== 0) return
    this.scheduledFrame = requestAnimationFrame((now) => {
      this.scheduledFrame = 0
      const stillAnimating = this.render(now)
      if (stillAnimating) this.scheduleRender()
    })
  }

  private ensureCardMotion(photoId: string, seedX: number, seedY: number, width: number, height: number) {
    let motion = this.cardMotion.get(photoId)
    if (motion != null) return motion
    motion = {
      x: spring(seedX),
      y: spring(seedY),
      cardWidth: spring(width),
      cardHeight: spring(height),
      imageHeight: spring(Math.max(1, height - GRID_CAPTION_HEIGHT)),
      scale: spring(1),
      opacity: spring(1),
      magnetX: spring(0),
      magnetY: spring(0),
      blur: spring(0),
      brightness: spring(1),
    }
    this.cardMotion.set(photoId, motion)
    return motion
  }

  private ensureCardNode(photo: PhotoData) {
    let dom = this.cardDom.get(photo.id)
    if (dom != null) return dom

    const node = document.createElement('div')
    const media = document.createElement('div')
    const image = document.createElement('img')
    const caption = document.createElement('div')
    const captionText = document.createElement('div')

    node.className = 'gallery-card'
    node.dataset.photoId = photo.id
    media.className = 'gallery-media'
    image.className = 'gallery-image'
    caption.className = 'gallery-caption'
    captionText.className = 'gallery-caption-text'

    image.alt = photo.prompt
    image.draggable = false
    image.loading = 'lazy'
    image.decoding = 'async'
    captionText.textContent = photo.prompt
    caption.append(captionText)
    node.append(media, caption)
    media.append(image)

    node.addEventListener('click', () => {
      if (this.focusedId == null) this.focusPhoto(photo.id)
    })
    caption.addEventListener('click', (event) => {
      if (this.focusedId != null) return
      event.stopPropagation()
      selectNodeText(captionText)
    })
    caption.addEventListener('mousedown', (event) => {
      if (this.focusedId == null) {
        event.stopPropagation()
      }
    })

    this.cardDom.set(photo.id, {node, media, image, caption, captionText})
    return this.cardDom.get(photo.id)!
  }

  private render(now: number) {
    const viewportWidth = document.documentElement.clientWidth
    const viewportHeight = document.documentElement.clientHeight
    const actualScrollTop = window.scrollY
    const nextGridLayout = computeGridLayout(photoGalleryData, viewportWidth)
    const previousGridLayout = this.gridLayout
    const layoutBeforeUpdate = previousGridLayout ?? nextGridLayout
    const userScrolled = Math.abs(actualScrollTop - this.appliedScrollTop) > 0.5

    let targetScrollTop = actualScrollTop
    if (this.focusedId == null) {
      if (userScrolled || this.scrollAnchor == null) {
        const anchorItem =
          layoutBeforeUpdate.items.find(
            (item) => item.y + item.cardHeight > actualScrollTop + 12,
          ) ?? layoutBeforeUpdate.items[0] ?? null
        this.scrollAnchor =
          anchorItem == null ? null : {photoId: anchorItem.photoId, prevY: anchorItem.y}
      }
      if (!userScrolled && this.scrollAnchor != null) {
        const anchorItem =
          nextGridLayout.items.find((item) => item.photoId === this.scrollAnchor?.photoId) ?? null
        if (anchorItem != null) {
          targetScrollTop += anchorItem.y - this.scrollAnchor.prevY
          this.scrollAnchor = {photoId: anchorItem.photoId, prevY: anchorItem.y}
        }
      }
    }

    if (this.pendingDismissScrollTop != null && this.focusedId == null) {
      targetScrollTop = this.pendingDismissScrollTop
      this.pendingDismissScrollTop = null
    }

    this.gridLayout = nextGridLayout

    const visibleIds =
      this.focusedId == null
        ? this.getVisibleGridIds(nextGridLayout, actualScrollTop, viewportHeight)
        : this.getVisibleLineIds(viewportWidth, viewportHeight, actualScrollTop)

    const activeIds = new Set(visibleIds)
    if (this.focusedId != null) activeIds.add(this.focusedId)

    for (const photoId of activeIds) {
      const photo = this.photoById.get(photoId)
      if (photo == null) continue
      const dom = this.ensureCardNode(photo)
      if (dom.node.parentNode == null) this.scene.append(dom.node)
      this.updateStaticCardAssets(dom, photo)
    }

    for (const [photoId, dom] of this.cardDom) {
      if (!activeIds.has(photoId)) dom.node.remove()
    }

    const lineLayout = this.focusedId == null ? null : this.computeLineLayout(viewportWidth, viewportHeight, actualScrollTop)

    let hasAnimatingSprings = false
    const steps =
      this.lastRenderTime === 0
        ? 1
        : Math.min(300, Math.max(1, Math.floor((now - this.lastRenderTime) / msPerAnimationStep)))
    this.lastRenderTime =
      this.lastRenderTime === 0 ? now : this.lastRenderTime + steps * msPerAnimationStep

    for (const photo of photoGalleryData) {
      if (!activeIds.has(photo.id)) continue
      const dom = this.cardDom.get(photo.id)!
      const gridItem =
        nextGridLayout.items.find((item) => item.photoId === photo.id) ??
        nextGridLayout.items[0]!
      const target =
        lineLayout?.get(photo.id) ??
        this.getGridTarget(gridItem, photo.id, previousGridLayout, nextGridLayout)
      const motion = this.ensureCardMotion(
        photo.id,
        target.x,
        target.y,
        target.cardWidth,
        target.cardHeight,
      )
      const shouldSnap = target.snap || this.reducedMotion

      retargetSpring(motion.x, target.x)
      retargetSpring(motion.y, target.y)
      retargetSpring(motion.cardWidth, target.cardWidth)
      retargetSpring(motion.cardHeight, target.cardHeight)
      retargetSpring(motion.imageHeight, target.imageHeight)
      retargetSpring(motion.scale, target.scale)
      retargetSpring(motion.opacity, target.opacity)
      retargetSpring(motion.magnetX, target.magnetX)
      retargetSpring(motion.magnetY, target.magnetY)
      retargetSpring(motion.blur, target.blur)
      retargetSpring(motion.brightness, target.brightness)

      if (shouldSnap) {
        springGoToEnd(motion.x)
        springGoToEnd(motion.y)
        springGoToEnd(motion.cardWidth)
        springGoToEnd(motion.cardHeight)
        springGoToEnd(motion.imageHeight)
        springGoToEnd(motion.scale)
        springGoToEnd(motion.opacity)
        springGoToEnd(motion.magnetX)
        springGoToEnd(motion.magnetY)
        springGoToEnd(motion.blur)
        springGoToEnd(motion.brightness)
      } else {
        for (let i = 0; i < steps; i++) {
          springStep(motion.x)
          springStep(motion.y)
          springStep(motion.cardWidth)
          springStep(motion.cardHeight)
          springStep(motion.imageHeight)
          springStep(motion.scale)
          springStep(motion.opacity)
          springStep(motion.magnetX)
          springStep(motion.magnetY)
          springStep(motion.blur)
          springStep(motion.brightness)
        }
      }

      hasAnimatingSprings =
        hasAnimatingSprings ||
        !springMostlyDone(motion.x) ||
        !springMostlyDone(motion.y) ||
        !springMostlyDone(motion.cardWidth) ||
        !springMostlyDone(motion.cardHeight) ||
        !springMostlyDone(motion.imageHeight) ||
        !springMostlyDone(motion.scale) ||
        !springMostlyDone(motion.opacity) ||
        !springMostlyDone(motion.magnetX) ||
        !springMostlyDone(motion.magnetY) ||
        !springMostlyDone(motion.blur) ||
        !springMostlyDone(motion.brightness)

      const imageHeight = Math.max(40, motion.imageHeight.pos)
      const captionHeight = Math.max(48, motion.cardHeight.pos - imageHeight)

      dom.node.dataset.mode = this.focusedId == null ? 'grid' : 'line'
      dom.caption.dataset.mode = this.focusedId == null ? 'grid' : 'line'
      dom.node.style.width = `${motion.cardWidth.pos}px`
      dom.node.style.height = `${motion.cardHeight.pos}px`
      dom.node.style.transform = `translate3d(${motion.x.pos + motion.magnetX.pos}px, ${motion.y.pos + motion.magnetY.pos}px, 0) scale(${motion.scale.pos})`
      dom.node.style.opacity = `${motion.opacity.pos}`
      dom.node.style.zIndex = this.focusedId === photo.id ? '40' : this.focusedId == null ? '2' : '30'
      dom.media.style.height = `${imageHeight}px`
      dom.media.style.filter = `brightness(${motion.brightness.pos}) blur(${motion.blur.pos}px)`
      dom.caption.style.height = `${captionHeight}px`
      dom.caption.style.maxHeight = `${captionHeight}px`
      dom.caption.style.pointerEvents =
        this.focusedId == null || this.focusedId === photo.id ? 'auto' : 'none'
      dom.image.style.display =
        this.focusedId == null || this.focusedId === photo.id ? 'block' : 'none'
    }

    this.scene.style.height = `${Math.max(nextGridLayout.contentHeight, actualScrollTop + viewportHeight + 80)}px`

    const lineVisible = this.focusedId != null
    this.backdrop.dataset.visible = lineVisible ? 'true' : 'false'
    this.dismissSurface.dataset.visible = lineVisible ? 'true' : 'false'
    this.navLeft.dataset.visible = lineVisible ? 'true' : 'false'
    this.navRight.dataset.visible = lineVisible ? 'true' : 'false'
    this.backdrop.style.opacity = lineVisible ? '1' : '0'
    this.backdrop.style.zIndex = lineVisible ? '20' : '0'
    this.dismissSurface.style.zIndex = lineVisible ? '24' : '0'
    this.navLeft.style.zIndex = lineVisible ? '26' : '0'
    this.navRight.style.zIndex = lineVisible ? '26' : '0'

    document.body.style.overflow = lineVisible ? 'hidden' : ''
    document.body.style.cursor = this.computeCursor(viewportWidth)

    if (Math.abs(targetScrollTop - actualScrollTop) > 0.5 && this.focusedId == null) {
      window.scrollTo({top: targetScrollTop, behavior: 'instant'})
    }
    this.appliedScrollTop = window.scrollY

    return hasAnimatingSprings
  }

  private computeCursor(viewportWidth: number) {
    if (this.focusedId != null) {
      if (
        (this.pointerClientX <= LINE_NAV_WIDTH && this.hasPrevious()) ||
        (this.pointerClientX >= viewportWidth - LINE_NAV_WIDTH && this.hasNext())
      ) {
        return 'zoom-in'
      }
      return 'zoom-out'
    }
    return this.hoveredId != null ? 'zoom-in' : 'auto'
  }

  private isAnimating() {
    for (const motion of this.cardMotion.values()) {
      if (
        !springMostlyDone(motion.x) ||
        !springMostlyDone(motion.y) ||
        !springMostlyDone(motion.cardWidth) ||
        !springMostlyDone(motion.cardHeight) ||
        !springMostlyDone(motion.imageHeight) ||
        !springMostlyDone(motion.scale) ||
        !springMostlyDone(motion.opacity) ||
        !springMostlyDone(motion.magnetX) ||
        !springMostlyDone(motion.magnetY) ||
        !springMostlyDone(motion.blur) ||
        !springMostlyDone(motion.brightness)
      ) {
        return true
      }
    }
    return false
  }

  private updateStaticCardAssets(dom: CardDom, photo: PhotoData) {
    dom.media.style.backgroundImage = this.disableRemoteImages
      ? 'linear-gradient(180deg, rgba(87, 122, 166, 0.28), rgba(18, 33, 52, 0.82))'
      : `url("${lowResUrl(photo.id)}")`
    if (this.disableRemoteImages) {
      dom.image.removeAttribute('src')
      dom.image.dataset.highRes = ''
      return
    }
    if (dom.image.dataset.highRes !== photo.id) {
      dom.image.dataset.highRes = photo.id
      dom.image.src = highResUrl(photo.id)
    }
  }

  private getVisibleGridIds(layout: GridLayout, scrollTop: number, viewportHeight: number) {
    const minY = scrollTop - GRID_OVERSCAN
    const maxY = scrollTop + viewportHeight + GRID_OVERSCAN
    return layout.items
      .filter((item) => item.y + item.cardHeight >= minY && item.y <= maxY)
      .map((item) => item.photoId)
  }

  private getVisibleLineIds(viewportWidth: number, viewportHeight: number, scrollTop: number) {
    const lineLayout = this.computeLineLayout(viewportWidth, viewportHeight, scrollTop)
    const minX = -LINE_OVERSCAN
    const maxX = viewportWidth + LINE_OVERSCAN
    const ids: string[] = []
    for (const [photoId, item] of lineLayout) {
      if (item.x + item.cardWidth >= minX && item.x <= maxX) ids.push(photoId)
    }
    return ids
  }

  private getGridTarget(
    gridItem: GridLayoutItem,
    photoId: string,
    previousGridLayout: GridLayout | null,
    nextGridLayout: GridLayout,
  ) {
    const previousItem =
      previousGridLayout?.items.find((item) => item.photoId === photoId) ?? null
    const hovered = this.hoveredId === photoId
    const pointerDocX = this.pointerClientX + window.scrollX
    const pointerDocY = this.pointerClientY + window.scrollY
    const centerX = gridItem.x + gridItem.cardWidth / 2
    const centerY = gridItem.y + gridItem.cardHeight / 2
    const magnetX = hovered ? clamp((pointerDocX - centerX) * 0.06, -10, 10) : 0
    const magnetY = hovered ? clamp((pointerDocY - centerY) * 0.06, -8, 8) : 0

    return {
      x: gridItem.x,
      y: gridItem.y,
      cardWidth: gridItem.cardWidth,
      cardHeight: gridItem.cardHeight,
      imageHeight: gridItem.imageHeight,
      scale: hovered ? 1.02 : 1,
      opacity: 1,
      magnetX,
      magnetY,
      blur: 0,
      brightness: 1,
      snap:
        previousItem != null &&
        previousGridLayout?.columnCount === nextGridLayout.columnCount &&
        previousItem.column === gridItem.column &&
        previousItem.stackIndex === gridItem.stackIndex,
    }
  }

  private computeLineLayout(viewportWidth: number, viewportHeight: number, scrollTop: number) {
    const layout = new Map<
      string,
      {
        x: number
        y: number
        cardWidth: number
        cardHeight: number
        imageHeight: number
        scale: number
        opacity: number
        magnetX: number
        magnetY: number
        blur: number
        brightness: number
        snap: boolean
      }
    >()
    if (this.focusedId == null) return layout
    const focusedIndex = this.photoIndexById.get(this.focusedId) ?? 0
    const imageAreaHeight = Math.max(
      220,
      viewportHeight - LINE_TOP_PADDING - LINE_CAPTION_HEIGHT - LINE_BOTTOM_GAP,
    )
    const focusedPhoto = photoGalleryData[focusedIndex]!
    const focusedSize = fitSize(
      focusedPhoto,
      viewportWidth * LINE_TARGET_WIDTH_RATIO,
      imageAreaHeight,
    )
    const focusedCardHeight = focusedSize.height + LINE_CAPTION_HEIGHT
    const focusedY = scrollTop + LINE_TOP_PADDING + (imageAreaHeight - focusedSize.height) / 2
    const focusedX = viewportWidth / 2 - focusedSize.width / 2

    const focusedBrightness = 1.02
    layout.set(focusedPhoto.id, {
      x: focusedX,
      y: focusedY,
      cardWidth: focusedSize.width,
      cardHeight: focusedCardHeight,
      imageHeight: focusedSize.height,
      scale: 1,
      opacity: 1,
      magnetX: 0,
      magnetY: 0,
      blur: 0,
      brightness: focusedBrightness,
      snap: false,
    })

    let currentLeft = focusedX - LINE_GAP
    for (let index = focusedIndex - 1; index >= 0; index--) {
      const photo = photoGalleryData[index]!
      const size = fitSize(
        photo,
        viewportWidth * LINE_TARGET_WIDTH_RATIO * NEIGHBOR_SCALE,
        imageAreaHeight * NEIGHBOR_SCALE,
      )
      const scaleBoost = this.navHover === 'left' && index === focusedIndex - 1 ? NAV_HOVER_BUMP : 0
      const scale = NEIGHBOR_SCALE + scaleBoost
      const cardHeight = size.height + LINE_CAPTION_HEIGHT
      const x = currentLeft - size.width
      layout.set(photo.id, {
        x,
        y: scrollTop + LINE_TOP_PADDING + (imageAreaHeight - size.height) / 2,
        cardWidth: size.width,
        cardHeight,
        imageHeight: size.height,
        scale,
        opacity: index === focusedIndex - 1 ? 0.82 : 0.56,
        magnetX: 0,
        magnetY: 0,
        blur: index === focusedIndex - 1 ? 1.4 : 0.2,
        brightness: this.navHover === 'left' && index === focusedIndex - 1 ? 0.82 : 0.62,
        snap: false,
      })
      currentLeft = x - LINE_GAP
    }

    let currentRight = focusedX + focusedSize.width + LINE_GAP
    for (let index = focusedIndex + 1; index < photoGalleryData.length; index++) {
      const photo = photoGalleryData[index]!
      const size = fitSize(
        photo,
        viewportWidth * LINE_TARGET_WIDTH_RATIO * NEIGHBOR_SCALE,
        imageAreaHeight * NEIGHBOR_SCALE,
      )
      const scaleBoost = this.navHover === 'right' && index === focusedIndex + 1 ? NAV_HOVER_BUMP : 0
      const scale = NEIGHBOR_SCALE + scaleBoost
      const cardHeight = size.height + LINE_CAPTION_HEIGHT
      const x = currentRight
      layout.set(photo.id, {
        x,
        y: scrollTop + LINE_TOP_PADDING + (imageAreaHeight - size.height) / 2,
        cardWidth: size.width,
        cardHeight,
        imageHeight: size.height,
        scale,
        opacity: index === focusedIndex + 1 ? 0.82 : 0.56,
        magnetX: 0,
        magnetY: 0,
        blur: index === focusedIndex + 1 ? 1.4 : 0.2,
        brightness: this.navHover === 'right' && index === focusedIndex + 1 ? 0.82 : 0.62,
        snap: false,
      })
      currentRight = x + size.width + LINE_GAP
    }

    return layout
  }
}
