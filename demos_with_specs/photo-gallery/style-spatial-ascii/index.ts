import { photoGalleryData } from './data'
import {
  computeGridLayout,
  computeLineLayout,
  getVisibleGridIndices,
  GRID_HOVER_SCALE,
  GRID_VISIBLE_BUFFER,
  LINE_NEIGHBOR_SCALE,
  routeLineModeHitArea,
} from './layout'
import { msPerAnimationStep, spring, springMostlyDone, springSnap, springStep, type Spring } from './springs'

type Mode = 'grid' | 'line'

type CardDom = {
  root: HTMLDivElement
  media: HTMLDivElement
  lowImage: HTMLImageElement
  highImage: HTMLImageElement
  caption: HTMLDivElement
}

type CardMotion = {
  x: Spring
  y: Spring
  width: Spring
  height: Spring
  scale: Spring
  initialized: boolean
}

type ScenarioReport = {
  phase: 'loading' | 'running' | 'ready' | 'error'
  requestId: string
  scenario: string
  hashSequence?: string[]
  scrollTopAfterDismiss?: number
  rowTop?: number
  selectedText?: string
  mode?: Mode
  mountedGridCount?: number
  totalPhotoCount?: number
  message?: string
}

const app = document.getElementById('app')
const reportNode = document.getElementById('scenario-report')
if (!(app instanceof HTMLElement)) {
  throw new Error('Missing app root')
}
if (!(reportNode instanceof HTMLScriptElement)) {
  throw new Error('Missing report node')
}

const query = new URLSearchParams(location.search)
const scenario = query.get('scenario') ?? ''
const requestId = query.get('requestId') ?? ''

function publishReport(report: ScenarioReport): void {
  reportNode.textContent = JSON.stringify(report)
}

publishReport({phase: 'loading', requestId, scenario})

const root = app as HTMLDivElement
root.innerHTML = `
  <div class="shell">
    <div class="chrome">
      <a class="github-link" href="https://github.com/chenglou/vibescript/tree/main/demos_with_specs/photo-gallery/style-spatial-ascii" target="_blank" rel="noreferrer">
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path d="M8 0C3.58 0 0 3.58 0 8.07c0 3.58 2.29 6.62 5.47 7.69.4.08.55-.18.55-.39 0-.19-.01-.82-.01-1.49-2 .36-2.53-.5-2.69-.96-.09-.24-.48-.96-.82-1.15-.28-.15-.68-.52-.01-.53.63-.01 1.08.59 1.23.84.73 1.24 1.89.89 2.35.68.07-.54.28-.89.51-1.1-1.78-.21-3.65-.91-3.65-4.05 0-.89.31-1.62.82-2.19-.08-.21-.36-1.05.08-2.18 0 0 .67-.22 2.2.84.64-.18 1.33-.27 2.02-.27s1.38.09 2.02.27c1.53-1.06 2.2-.84 2.2-.84.44 1.13.16 1.97.08 2.18.51.57.82 1.3.82 2.19 0 3.15-1.88 3.84-3.67 4.05.29.25.54.73.54 1.48 0 1.1-.01 1.98-.01 2.25 0 .21.15.47.55.39C13.71 14.69 16 11.65 16 8.07 16 3.58 12.42 0 8 0z"/>
        </svg>
        <span>Source</span>
      </a>
    </div>
    <div class="spacer" data-spacer="true"></div>
    <div class="gallery-layer" data-gallery-layer="true"></div>
    <div class="nav-overlay" data-nav-overlay="true">
      <div class="nav-strip" data-side="left"><button type="button" data-nav="previous" aria-label="Previous photo"></button></div>
      <div class="nav-dim" data-nav="dismiss"></div>
      <div class="nav-strip" data-side="right"><button type="button" data-nav="next" aria-label="Next photo"></button></div>
    </div>
  </div>
`

const spacer = root.querySelector('[data-spacer="true"]')
const galleryLayer = root.querySelector('[data-gallery-layer="true"]')
const navOverlay = root.querySelector('[data-nav-overlay="true"]')
if (!(spacer instanceof HTMLDivElement)) throw new Error('Missing spacer')
if (!(galleryLayer instanceof HTMLDivElement)) throw new Error('Missing gallery layer')
if (!(navOverlay instanceof HTMLDivElement)) throw new Error('Missing nav overlay')

const domCache = new Map<string, CardDom>() // cache lifetime: same as photo data
const motionCache = new Map<string, CardMotion>() // cache lifetime: same as photo data

let renderQueued = false
let lastAnimationTime = performance.now()
let hoveredId: string | null = null
let pointerX = 0
let pointerY = 0
let lastScrollTop = 0
let lastViewportWidth = 0
let lastViewportHeight = 0
let anchorId: string | null = null
let anchorOffset = 40
let activeReport: ScenarioReport = {phase: 'loading', requestId, scenario}

function parseFocusedId(): string | null {
  const hash = location.hash
  if (hash.length <= 1) return null
  return decodeURIComponent(hash.slice(1))
}

function setFocusedId(id: string | null): void {
  const currentId = parseFocusedId()
  if (currentId === id) return
  if (id == null) {
    location.hash = ''
  } else {
    location.hash = encodeURIComponent(id)
  }
}

function cardMotionFor(id: string): CardMotion {
  let motion = motionCache.get(id)
  if (motion != null) return motion
  motion = {
    x: spring(0),
    y: spring(0),
    width: spring(0),
    height: spring(0),
    scale: spring(1),
    initialized: false,
  }
  motionCache.set(id, motion)
  return motion
}

function cardDomFor(id: string): CardDom {
  let cached = domCache.get(id)
  if (cached != null) return cached

  const rootEl = document.createElement('div')
  rootEl.className = 'photo-card'
  rootEl.dataset.photoCard = 'true'
  rootEl.dataset.photoId = id

  const media = document.createElement('div')
  media.className = 'photo-media'
  media.dataset.photoMedia = 'true'

  const lowImage = document.createElement('img')
  lowImage.className = 'low-res'
  lowImage.alt = ''
  lowImage.draggable = false
  lowImage.decoding = 'async'
  lowImage.loading = 'lazy'

  const highImage = document.createElement('img')
  highImage.className = 'high-res'
  highImage.alt = ''
  highImage.draggable = false
  highImage.decoding = 'async'
  highImage.loading = 'eager'

  const caption = document.createElement('div')
  caption.className = 'photo-caption'
  caption.dataset.photoCaption = 'true'

  media.append(lowImage, highImage)
  rootEl.append(media, caption)
  galleryLayer.append(rootEl)

  cached = {root: rootEl, media, lowImage, highImage, caption}
  domCache.set(id, cached)
  return cached
}

function ensureCardMounted(id: string): CardDom {
  const dom = cardDomFor(id)
  if (dom.root.parentNode !== galleryLayer) {
    galleryLayer.append(dom.root)
  }
  return dom
}

function removeUnneededCards(keepIds: Set<string>): void {
  for (const [id, dom] of domCache) {
    if (keepIds.has(id)) continue
    if (dom.root.parentNode === galleryLayer) {
      dom.root.remove()
    }
  }
}

function scheduleRender(): void {
  if (renderQueued) return
  renderQueued = true
  requestAnimationFrame((now) => {
    renderQueued = false
    render(now)
  })
}

function setHighRes(dom: CardDom, id: string, enabled: boolean): void {
  if (enabled) {
    dom.highImage.src = `https://cdn.midjourney.com/${id}.webp`
    dom.highImage.dataset.visible = 'true'
    return
  }
  dom.highImage.removeAttribute('src')
  dom.highImage.dataset.visible = 'false'
}

function updateGridSelection(id: string): void {
  const dom = domCache.get(id)
  if (dom == null) return
  const selection = window.getSelection()
  if (selection == null) return
  const range = document.createRange()
  range.selectNodeContents(dom.caption)
  selection.removeAllRanges()
  selection.addRange(range)
}

function setMotionTarget(motion: CardMotion, x: number, y: number, width: number, height: number, scale: number): void {
  motion.x.dest = x
  motion.y.dest = y
  motion.width.dest = width
  motion.height.dest = height
  motion.scale.dest = scale
}

function syncCardStyle(dom: CardDom, motion: CardMotion, mode: Mode, zIndex: number, imageHeight: number, captionHeight: number): void {
  dom.root.dataset.mode = mode
  dom.root.dataset.mounted = 'true'
  dom.root.style.transform = `translate3d(${motion.x.pos}px, ${motion.y.pos}px, 0) scale(${motion.scale.pos})`
  dom.root.style.width = `${motion.width.pos}px`
  dom.root.style.height = `${motion.height.pos}px`
  dom.root.style.zIndex = `${zIndex}`
  dom.root.style.pointerEvents = mode === 'grid' ? 'auto' : 'none'
  dom.media.style.height = `${imageHeight}px`
  dom.caption.style.height = `${captionHeight}px`
  dom.caption.dataset.mode = mode
}

function render(now: number): void {
  const viewportWidth = document.documentElement.clientWidth
  const viewportHeight = document.documentElement.clientHeight
  const scrollTop = window.scrollY
  const focusedId = parseFocusedId()
  const mode: Mode = focusedId == null ? 'grid' : 'line'
  const focusedIndex = focusedId == null ? -1 : photoGalleryData.findIndex((photo) => photo.id === focusedId)
  const gridLayout = computeGridLayout(photoGalleryData, viewportWidth)

  spacer.style.height = `${gridLayout.totalHeight}px`
  navOverlay.dataset.open = String(mode === 'line')
  document.body.style.overflowY = mode === 'line' ? 'hidden' : 'auto'
  document.documentElement.style.overflowY = mode === 'line' ? 'hidden' : 'auto'

  const mountedIds = new Set<string>()
  let desiredScrollTop: number | null = null

  if (mode === 'grid') {
    const visibleIndices = getVisibleGridIndices(gridLayout, scrollTop, viewportHeight, GRID_VISIBLE_BUFFER)
    const layoutChanged = viewportWidth !== lastViewportWidth || viewportHeight !== lastViewportHeight
    const userScrolled = scrollTop !== lastScrollTop

    if (anchorId == null || userScrolled) {
      const anchorIndex = visibleIndices[0]
      if (anchorIndex != null) {
        const anchorItem = gridLayout.items[anchorIndex]!
        anchorId = anchorItem.id
        anchorOffset = scrollTop - anchorItem.y
      }
    } else if (layoutChanged && anchorId != null) {
      const anchorIndex = gridLayout.items.findIndex((item) => item.id === anchorId)
      if (anchorIndex >= 0) {
        const anchorItem = gridLayout.items[anchorIndex]!
        desiredScrollTop = anchorItem.y + anchorOffset
      }
    }

    for (let i = 0; i < visibleIndices.length; i++) {
      const index = visibleIndices[i]!
      const item = gridLayout.items[index]!
      mountedIds.add(item.id)
      const dom = ensureCardMounted(item.id)
      const motion = cardMotionFor(item.id)
      const hovered = hoveredId === item.id
      const nudgeX = hovered ? Math.max(-8, Math.min(8, (pointerX - (item.x + item.width / 2)) * 0.02)) : 0
      const nudgeY = hovered ? Math.max(-8, Math.min(8, (pointerY - (item.y - scrollTop + item.height / 2)) * 0.02)) : 0
      setMotionTarget(motion, item.x + nudgeX, item.y - scrollTop + nudgeY, item.width, item.height, hovered ? GRID_HOVER_SCALE : 1)
      if (!motion.initialized) {
        springSnap(motion.x)
        springSnap(motion.y)
        springSnap(motion.width)
        springSnap(motion.height)
        springSnap(motion.scale)
        motion.initialized = true
      }
      syncCardStyle(dom, motion, 'grid', 10 + item.rowIndex, item.imageHeight, item.captionHeight)
      dom.lowImage.src = `https://cdn.midjourney.com/${item.id}_384_N.webp`
      dom.caption.textContent = photoGalleryData[item.index]!.prompt
      setHighRes(dom, item.id, hovered)
    }

    removeUnneededCards(mountedIds)
  } else if (focusedIndex >= 0) {
    const lineLayout = computeLineLayout(photoGalleryData, viewportWidth, viewportHeight, focusedIndex)
    const start = Math.max(0, focusedIndex - 3)
    const end = Math.min(photoGalleryData.length - 1, focusedIndex + 3)

    for (let index = start; index <= end; index++) {
      const item = lineLayout[index]!
      mountedIds.add(item.id)
      const dom = ensureCardMounted(item.id)
      const motion = cardMotionFor(item.id)
      const focused = index === focusedIndex
      const scale = focused ? 1 : LINE_NEIGHBOR_SCALE
      const imageHeight = item.imageHeight
      const captionHeight = item.captionHeight
      setMotionTarget(motion, item.x, item.y, item.width, item.height, scale)
      if (!motion.initialized) {
        springSnap(motion.x)
        springSnap(motion.y)
        springSnap(motion.width)
        springSnap(motion.height)
        springSnap(motion.scale)
        motion.initialized = true
      }
      syncCardStyle(dom, motion, 'line', focused ? 200 : 100 + Math.abs(index - focusedIndex), imageHeight, captionHeight)
      dom.lowImage.src = `https://cdn.midjourney.com/${item.id}_384_N.webp`
      dom.caption.textContent = photoGalleryData[index]!.prompt
      setHighRes(dom, item.id, focused)
    }

    removeUnneededCards(mountedIds)
    anchorId = focusedId
    anchorOffset = 40
  }

  if (desiredScrollTop != null) {
    window.scrollTo(0, desiredScrollTop)
  }

  let stillAnimating = false
  const stepCount = Math.min(300, Math.floor((now - lastAnimationTime) / msPerAnimationStep))
  lastAnimationTime += stepCount * msPerAnimationStep

  for (const motion of motionCache.values()) {
    for (let i = 0; i < stepCount; i++) {
      springStep(motion.x)
      springStep(motion.y)
      springStep(motion.width)
      springStep(motion.height)
      springStep(motion.scale)
    }
    if (!springMostlyDone(motion.x) || !springMostlyDone(motion.y) || !springMostlyDone(motion.width) || !springMostlyDone(motion.height) || !springMostlyDone(motion.scale)) {
      stillAnimating = true
    } else {
      springSnap(motion.x)
      springSnap(motion.y)
      springSnap(motion.width)
      springSnap(motion.height)
      springSnap(motion.scale)
    }
  }

  lastScrollTop = scrollTop
  lastViewportWidth = viewportWidth
  lastViewportHeight = viewportHeight

  if (mode === 'grid') {
    activeReport = {
      ...activeReport,
      phase: activeReport.phase === 'loading' ? 'loading' : activeReport.phase,
      mode: 'grid',
      mountedGridCount: mountedIds.size,
      totalPhotoCount: photoGalleryData.length,
    }
  } else {
    activeReport = {
      ...activeReport,
      mode: 'line',
    }
  }

  publishReport(activeReport)

  if (stillAnimating) scheduleRender()
}

function selectCardById(id: string): void {
  setFocusedId(id)
}

function openPrevious(): void {
  const focusedId = parseFocusedId()
  if (focusedId == null) {
    setFocusedId(photoGalleryData[0]!.id)
    return
  }
  const index = photoGalleryData.findIndex((photo) => photo.id === focusedId)
  setFocusedId(photoGalleryData[Math.max(0, index - 1)]!.id)
}

function openNext(): void {
  const focusedId = parseFocusedId()
  if (focusedId == null) {
    setFocusedId(photoGalleryData[0]!.id)
    return
  }
  const index = photoGalleryData.findIndex((photo) => photo.id === focusedId)
  setFocusedId(photoGalleryData[Math.min(photoGalleryData.length - 1, index + 1)]!.id)
}

function dismissLineMode(): void {
  const focusedId = parseFocusedId()
  if (focusedId == null) return
  const layout = computeGridLayout(photoGalleryData, document.documentElement.clientWidth)
  const index = photoGalleryData.findIndex((photo) => photo.id === focusedId)
  const item = layout.items[index]!
  const targetScrollTop = Math.max(0, item.y - 40)
  setFocusedId(null)
  window.scrollTo(0, targetScrollTop)
  anchorId = item.id
  anchorOffset = 40
}

function onClick(event: MouseEvent): void {
  const target = event.target
  if (!(target instanceof Element)) return
  const caption = target.closest('[data-photo-caption="true"]')
  if (caption instanceof HTMLElement) {
    const card = caption.closest('[data-photo-card="true"]')
    if (!(card instanceof HTMLElement)) return
    const id = card.dataset.photoId
    if (id == null) return
    updateGridSelection(id)
    event.preventDefault()
    return
  }

  const nav = target.closest('[data-nav-overlay="true"]')
  if (nav instanceof HTMLElement && parseFocusedId() != null) {
    const navAction = routeLineModeHitArea(event.clientX, document.documentElement.clientWidth)
    if (navAction === 'previous') {
      openPrevious()
    } else if (navAction === 'next') {
      openNext()
    } else {
      dismissLineMode()
    }
    return
  }

  const card = target.closest('[data-photo-card="true"]')
  if (!(card instanceof HTMLElement)) return
  const id = card.dataset.photoId
  if (id == null) return
  if (parseFocusedId() == null) {
    selectCardById(id)
    return
  }
  if (parseFocusedId() === id) {
    dismissLineMode()
    return
  }
  selectCardById(id)
}

function onKeyDown(event: KeyboardEvent): void {
  if (event.key === 'ArrowLeft') {
    openPrevious()
    event.preventDefault()
  } else if (event.key === 'ArrowRight') {
    openNext()
    event.preventDefault()
  } else if (event.key === 'Escape') {
    dismissLineMode()
    event.preventDefault()
  }
}

function onPointerMove(event: PointerEvent): void {
  pointerX = event.clientX
  pointerY = event.clientY
  const target = event.target
  if (!(target instanceof Element)) {
    hoveredId = null
  } else {
    const card = target.closest('[data-photo-card="true"]')
    hoveredId = card instanceof HTMLElement ? card.dataset.photoId ?? null : null
  }
  scheduleRender()
}

function onHashChange(): void {
  scheduleRender()
}

window.addEventListener('click', onClick)
window.addEventListener('keydown', onKeyDown)
window.addEventListener('pointermove', onPointerMove)
window.addEventListener('resize', scheduleRender)
window.addEventListener('scroll', scheduleRender, true)
window.addEventListener('hashchange', onHashChange)

async function nextFrame(): Promise<void> {
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
}

async function settleFrames(count = 2): Promise<void> {
  for (let i = 0; i < count; i++) {
    await nextFrame()
  }
}

async function runScenario(name: string): Promise<void> {
  activeReport = {phase: 'running', requestId, scenario}
  publishReport(activeReport)

  try {
    if (name === 'navigation-hash-sync') {
      await settleFrames(2)
      const firstCard = root.querySelector('[data-photo-card="true"]')
      if (!(firstCard instanceof HTMLElement)) throw new Error('Missing first card')
      const firstMedia = firstCard.querySelector('[data-photo-media="true"]')
      if (!(firstMedia instanceof HTMLElement)) throw new Error('Missing first card media')
      firstMedia.dispatchEvent(new MouseEvent('click', {bubbles: true, cancelable: true, view: window}))
      await settleFrames()
      const hashSequence = [location.hash]

      window.dispatchEvent(new KeyboardEvent('keydown', {bubbles: true, cancelable: true, key: 'ArrowRight'}))
      await settleFrames()
      hashSequence.push(location.hash)

      window.dispatchEvent(new KeyboardEvent('keydown', {bubbles: true, cancelable: true, key: 'Escape'}))
      await settleFrames()
      hashSequence.push(location.hash)

      history.back()
      await settleFrames(3)
      hashSequence.push(location.hash)

      history.forward()
      await settleFrames(3)
      hashSequence.push(location.hash)

      activeReport = {
        phase: 'ready',
        requestId,
        scenario,
        hashSequence,
      }
    } else if (name === 'dismiss-to-row') {
      await settleFrames(2)
      const focusedId = parseFocusedId()
      if (focusedId == null) throw new Error('Scenario expected a focused hash')
      const index = photoGalleryData.findIndex((photo) => photo.id === focusedId)
      const layout = computeGridLayout(photoGalleryData, document.documentElement.clientWidth)
      const rowTop = layout.items[index]!.y
      window.dispatchEvent(new KeyboardEvent('keydown', {bubbles: true, cancelable: true, key: 'Escape'}))
      await settleFrames(3)
      activeReport = {
        phase: 'ready',
        requestId,
        scenario,
        rowTop,
        scrollTopAfterDismiss: window.scrollY,
      }
    } else if (name === 'caption-selection') {
      await settleFrames(2)
      const firstCard = root.querySelector('[data-photo-card="true"]')
      const firstCaption = firstCard instanceof HTMLElement ? firstCard.querySelector('[data-photo-caption="true"]') : null
      if (!(firstCaption instanceof HTMLElement)) throw new Error('Missing caption')
      firstCaption.dispatchEvent(new MouseEvent('click', {bubbles: true, cancelable: true, view: window}))
      await settleFrames()
      activeReport = {
        phase: 'ready',
        requestId,
        scenario,
        selectedText: window.getSelection()?.toString() ?? '',
        mode: parseFocusedId() == null ? 'grid' : 'line',
      }
    } else if (name === 'mounted-count') {
      await settleFrames()
      activeReport = {
        phase: 'ready',
        requestId,
        scenario,
        mountedGridCount: root.querySelectorAll('[data-photo-card="true"]').length,
        totalPhotoCount: photoGalleryData.length,
      }
    } else {
      throw new Error(`Unknown scenario: ${name}`)
    }
  } catch (error) {
    activeReport = {
      phase: 'error',
      requestId,
      scenario,
      message: error instanceof Error ? error.message : String(error),
    }
  }

  publishReport(activeReport)
}

scheduleRender()
if (scenario.length > 0) {
  void runScenario(scenario)
}
