import {getHighResImageUrl, getLowResImageUrl, photoGalleryData} from './data'
import {
  clamp,
  computeGridLayout,
  computeLineLayout,
  getMountedItemIds,
  gridCaptionHeight,
  lineCaptionHeight,
} from './gallery-model'

type CardDom = {
  article: HTMLElement
  image: HTMLElement
  highRes: HTMLImageElement
  caption: HTMLElement
  captionText: HTMLElement
}

type Spring = {
  pos: number
  dest: number
  velocity: number
}

type AnimatedCard = {
  x: Spring
  y: Spring
  width: Spring
  height: Spring
  opacity: Spring
  brightness: Spring
  blur: Spring
  hoverScale: Spring
  hoverX: Spring
  hoverY: Spring
}

type ScenarioPhase = 'loading' | 'running' | 'ready' | 'error'

type ScenarioReport = {
  status: 'ok' | 'error'
  phase: ScenarioPhase
  requestId: string
  scenario: string
  details?: Record<string, unknown>
  message?: string
}

const gallerySurface = document.querySelector<HTMLElement>('#gallery-surface')
const lineDismissSurface = document.querySelector<HTMLElement>('#line-dismiss-surface')
const lineNavLeft = document.querySelector<HTMLElement>('#line-nav-left')
const lineNavRight = document.querySelector<HTMLElement>('#line-nav-right')
const lineCaptionScroll = document.querySelector<HTMLElement>('#line-caption-scroll')
const scenarioReportNode = document.querySelector<HTMLScriptElement>('#scenario-report')

if (
  gallerySurface == null ||
  lineDismissSurface == null ||
  lineNavLeft == null ||
  lineNavRight == null ||
  lineCaptionScroll == null ||
  scenarioReportNode == null
) {
  throw new Error('Photo gallery root nodes are missing.')
}

const params = new URLSearchParams(window.location.search)
const scenarioName = params.get('scenario') ?? 'manual'
const scenarioRequestId = params.get('requestId') ?? ''
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
const springStiffness = 0.18
const springDamping = 0.78

const cardDomById = new Map<string, CardDom>()
const animationById = new Map<string, AnimatedCard>()

let gridLayout = computeGridLayout(photoGalleryData, window.innerWidth)
let focusedId = parseFocusedIdFromHash()
let scrollTop = window.scrollY
let storedScrollTop = scrollTop
let lineHoverSide: 'left' | 'right' | null = null
let hoverCardId: string | null = null
let hoverPointer = {x: 0, y: 0}
let animationFrame = 0
let lastFrameTime = performance.now()
let previousMode: 'grid' | 'line' = focusedId == null ? 'grid' : 'line'

function parseFocusedIdFromHash(): string | null {
  const rawHash = window.location.hash.slice(1)
  if (rawHash === '') return null
  const decoded = decodeURIComponent(rawHash)
  return photoGalleryData.some(photo => photo.id === decoded) ? decoded : null
}

function publishScenarioReport(report: ScenarioReport): void {
  scenarioReportNode.textContent = JSON.stringify(report)
}

publishScenarioReport({
  status: 'ok',
  phase: 'loading',
  requestId: scenarioRequestId,
  scenario: scenarioName,
})

function createSpring(value: number): Spring {
  return {pos: value, dest: value, velocity: 0}
}

function springTo(spring: Spring, value: number, snap: boolean): void {
  spring.dest = value
  if (snap || prefersReducedMotion) {
    spring.pos = value
    spring.velocity = 0
  }
}

function springDone(spring: Spring): boolean {
  return Math.abs(spring.dest - spring.pos) < 0.1 && Math.abs(spring.velocity) < 0.1
}

function stepSpring(spring: Spring, dtMs: number): void {
  if (prefersReducedMotion) {
    spring.pos = spring.dest
    spring.velocity = 0
    return
  }
  const dt = Math.min(32, dtMs) / 16.6667
  const force = (spring.dest - spring.pos) * springStiffness
  spring.velocity = (spring.velocity + force * dt) * springDamping
  spring.pos += spring.velocity * dt
  if (springDone(spring)) {
    spring.pos = spring.dest
    spring.velocity = 0
  }
}

function getFocusedIndex(): number {
  if (focusedId == null) return -1
  return photoGalleryData.findIndex(photo => photo.id === focusedId)
}

function getGridItem(id: string) {
  return gridLayout.items.find(item => item.id === id) ?? null
}

function ensureCardDom(photoId: string): CardDom {
  const existing = cardDomById.get(photoId)
  if (existing != null) return existing

  const photo = photoGalleryData.find(entry => entry.id === photoId)
  if (photo == null) {
    throw new Error(`Unknown photo id ${photoId}`)
  }

  const article = document.createElement('article')
  article.className = 'gallery-card'
  article.dataset.photoId = photo.id

  const image = document.createElement('div')
  image.className = 'card-image'
  image.style.backgroundImage = `url("${getLowResImageUrl(photo.id)}")`

  const highRes = document.createElement('img')
  highRes.alt = photo.prompt
  highRes.decoding = 'async'
  highRes.loading = 'lazy'
  image.append(highRes)

  const caption = document.createElement('div')
  caption.className = 'card-caption'
  caption.dataset.caption = 'true'

  const captionText = document.createElement('div')
  captionText.className = 'card-caption-text'
  captionText.textContent = photo.prompt
  caption.append(captionText)

  caption.addEventListener('click', event => {
    event.stopPropagation()
  })
  caption.addEventListener('pointerdown', event => {
    event.stopPropagation()
  })

  article.append(image, caption)
  article.addEventListener('click', event => {
    if ((event.target as HTMLElement | null)?.closest('[data-caption="true"]') != null) {
      return
    }
    focusPhoto(photo.id, true)
  })
  article.addEventListener('mouseenter', () => {
    hoverCardId = photo.id
    document.body.style.cursor = focusedId == null ? 'zoom-in' : document.body.style.cursor
    requestAnimation()
  })
  article.addEventListener('mouseleave', () => {
    if (hoverCardId === photo.id) {
      hoverCardId = null
    }
    if (focusedId == null) {
      document.body.style.cursor = ''
    }
    requestAnimation()
  })
  article.addEventListener('pointermove', event => {
    hoverPointer = {x: event.clientX, y: event.clientY}
    hoverCardId = photo.id
    requestAnimation()
  })

  gallerySurface.append(article)

  const animation: AnimatedCard = {
    x: createSpring(0),
    y: createSpring(0),
    width: createSpring(100),
    height: createSpring(100),
    opacity: createSpring(1),
    brightness: createSpring(1),
    blur: createSpring(0),
    hoverScale: createSpring(1),
    hoverX: createSpring(0),
    hoverY: createSpring(0),
  }
  animationById.set(photo.id, animation)

  const dom = {article, image, highRes, caption, captionText}
  cardDomById.set(photo.id, dom)
  return dom
}

function removeUnusedCards(mountedIds: Set<string>): void {
  for (const [photoId, dom] of cardDomById) {
    if (mountedIds.has(photoId)) continue
    dom.article.remove()
    cardDomById.delete(photoId)
    animationById.delete(photoId)
  }
}

function lockScroll(isLocked: boolean): void {
  document.body.dataset.lineMode = String(isLocked)
  document.documentElement.style.overflowY = isLocked ? 'hidden' : ''
  document.body.style.overflowY = isLocked ? 'hidden' : ''
}

function writeHash(photoId: string | null, pushHistory: boolean): void {
  const nextUrl = photoId == null
    ? `${window.location.pathname}${window.location.search}`
    : `${window.location.pathname}${window.location.search}#${encodeURIComponent(photoId)}`
  const state = {focusedId: photoId}
  if (pushHistory) {
    window.history.pushState(state, '', nextUrl)
  } else {
    window.history.replaceState(state, '', nextUrl)
  }
}

function focusPhoto(photoId: string, pushHistory: boolean): void {
  if (focusedId === photoId) return
  focusedId = photoId
  previousMode = 'line'
  lockScroll(true)
  writeHash(photoId, pushHistory)
  syncLayout({modeChanged: true})
  requestAnimation()
}

function dismissLineMode(pushHistory: boolean): void {
  if (focusedId == null) return
  const dismissedId = focusedId
  focusedId = null
  lockScroll(false)
  writeHash(null, pushHistory)
  syncLayout({modeChanged: true})
  let pendingScrollTop: number | null = null
  const dismissedItem = getGridItem(dismissedId)
  if (dismissedItem != null) {
    const row = gridLayout.rows[dismissedItem.row]
    if (row != null) {
      const visibleTop = scrollTop
      const visibleBottom = scrollTop + window.innerHeight
      if (row.y < visibleTop || row.y + row.height > visibleBottom) {
        pendingScrollTop = Math.max(0, row.y - 40)
      }
    }
  }
  previousMode = 'grid'
  if (pendingScrollTop != null) {
    window.requestAnimationFrame(() => {
      window.scrollTo({top: pendingScrollTop!})
      scrollTop = window.scrollY
      storedScrollTop = scrollTop
      rerender({modeChanged: false})
    })
  }
  requestAnimation()
}

function navigateBy(delta: -1 | 1): void {
  const focusedIndex = getFocusedIndex()
  if (focusedIndex < 0) {
    focusPhoto(photoGalleryData[0]!.id, true)
    return
  }
  const nextIndex = clamp(focusedIndex + delta, 0, photoGalleryData.length - 1)
  focusPhoto(photoGalleryData[nextIndex]!.id, true)
}

function updateCaption(): void {
  if (focusedId == null) {
    lineCaptionScroll.textContent = ''
    return
  }
  const photo = photoGalleryData.find(entry => entry.id === focusedId)
  lineCaptionScroll.textContent = photo?.prompt ?? ''
}

function setCardImageMode(photoId: string, isLineMode: boolean, isFocusedCard: boolean): void {
  const dom = ensureCardDom(photoId)
  dom.article.dataset.mode = isLineMode ? 'line' : 'grid'
  dom.highRes.src = isLineMode && !isFocusedCard ? '' : getHighResImageUrl(photoId)
}

function syncLayout(options: {modeChanged: boolean; fromResize?: boolean}): void {
  const viewportWidth = window.innerWidth
  const viewportHeight = window.innerHeight
  gridLayout = computeGridLayout(photoGalleryData, viewportWidth)
  gallerySurface.style.height = `${Math.max(gridLayout.totalHeight + 220, viewportHeight)}px`

  const isLineMode = focusedId != null
  const lineLayout =
    isLineMode && getFocusedIndex() >= 0
      ? computeLineLayout(photoGalleryData, getFocusedIndex(), viewportWidth, viewportHeight, scrollTop)
      : null
  const mountedIds = isLineMode
    ? new Set(photoGalleryData.map(photo => photo.id))
    : getMountedItemIds(gridLayout, scrollTop, viewportHeight, 1)

  for (const photoId of mountedIds) {
    ensureCardDom(photoId)
  }
  removeUnusedCards(mountedIds)

  updateCaption()

  for (const photo of photoGalleryData) {
    if (!mountedIds.has(photo.id)) continue
    const dom = ensureCardDom(photo.id)
    const animation = animationById.get(photo.id)!
    const gridItem = getGridItem(photo.id)
    const lineItem = lineLayout?.items[photoGalleryData.findIndex(entry => entry.id === photo.id)] ?? null
    const target = isLineMode ? lineItem : gridItem
    if (target == null) continue
    const shouldSnap = !isLineMode && !options.modeChanged
    springTo(animation.x, target.x, shouldSnap)
    springTo(animation.y, target.y, shouldSnap)
    springTo(animation.width, target.width, shouldSnap)
    springTo(animation.height, target.height, shouldSnap)
    springTo(animation.opacity, 1, shouldSnap)

    const focusedIndex = getFocusedIndex()
    const photoIndex = photoGalleryData.findIndex(entry => entry.id === photo.id)
    const neighborDistance =
      focusedIndex >= 0 ? Math.abs(photoIndex - focusedIndex) : Number.POSITIVE_INFINITY

    let brightness = 1
    let blur = 0
    let hoverScale = 1
    if (isLineMode) {
      if (photo.id !== focusedId) {
        brightness = 0.56
      }
      if (neighborDistance === 1 && photo.id !== focusedId) {
        blur = 0.8
      }
      if (lineHoverSide === 'left' && photoIndex === focusedIndex - 1) {
        brightness = 0.72
        hoverScale = 1.03
      }
      if (lineHoverSide === 'right' && photoIndex === focusedIndex + 1) {
        brightness = 0.72
        hoverScale = 1.03
      }
    } else if (hoverCardId === photo.id) {
      hoverScale = 1.02
      const rect = dom.article.getBoundingClientRect()
      const dx = clamp((hoverPointer.x - (rect.left + rect.width / 2)) * 0.04, -8, 8)
      const dy = clamp((hoverPointer.y - (rect.top + rect.height / 2)) * 0.04, -8, 8)
      springTo(animation.hoverX, dx, false)
      springTo(animation.hoverY, dy, false)
      document.body.style.cursor = 'zoom-in'
    } else {
      springTo(animation.hoverX, 0, false)
      springTo(animation.hoverY, 0, false)
    }

    if (hoverCardId !== photo.id || isLineMode) {
      springTo(animation.hoverX, 0, false)
      springTo(animation.hoverY, 0, false)
    }

    springTo(animation.brightness, brightness, false)
    springTo(animation.blur, blur, false)
    springTo(animation.hoverScale, hoverScale, false)

    dom.caption.style.height = `${isLineMode ? lineCaptionHeight : gridCaptionHeight}px`
    setCardImageMode(photo.id, isLineMode, photo.id === focusedId)
  }

  if (!isLineMode) {
    lineHoverSide = null
  }
}

function paintCards(): boolean {
  let keepAnimating = false
  const now = performance.now()
  const dt = now - lastFrameTime
  lastFrameTime = now

  for (const [photoId, dom] of cardDomById) {
    const animation = animationById.get(photoId)!
    stepSpring(animation.x, dt)
    stepSpring(animation.y, dt)
    stepSpring(animation.width, dt)
    stepSpring(animation.height, dt)
    stepSpring(animation.opacity, dt)
    stepSpring(animation.brightness, dt)
    stepSpring(animation.blur, dt)
    stepSpring(animation.hoverScale, dt)
    stepSpring(animation.hoverX, dt)
    stepSpring(animation.hoverY, dt)

    const width = animation.width.pos
    const height = animation.height.pos
    const captionHeight = dom.article.dataset.mode === 'line' ? 0 : gridCaptionHeight
    dom.article.style.width = `${width}px`
    dom.article.style.height = `${height}px`
    dom.article.style.transform = `translate3d(${animation.x.pos + animation.hoverX.pos}px, ${animation.y.pos + animation.hoverY.pos}px, 0) scale(${animation.hoverScale.pos})`
    dom.article.style.opacity = `${animation.opacity.pos}`
    dom.image.style.height = `${Math.max(48, height - captionHeight)}px`
    dom.image.style.filter = `brightness(${animation.brightness.pos}) blur(${animation.blur.pos}px)`

    keepAnimating =
      keepAnimating ||
      !springDone(animation.x) ||
      !springDone(animation.y) ||
      !springDone(animation.width) ||
      !springDone(animation.height) ||
      !springDone(animation.opacity) ||
      !springDone(animation.brightness) ||
      !springDone(animation.blur) ||
      !springDone(animation.hoverScale) ||
      !springDone(animation.hoverX) ||
      !springDone(animation.hoverY)
  }

  return keepAnimating
}

function requestAnimation(): void {
  if (animationFrame !== 0) return
  animationFrame = window.requestAnimationFrame(tick)
}

function tick(): void {
  animationFrame = 0
  const keepAnimating = paintCards()
  if (keepAnimating) {
    requestAnimation()
  }
}

function rerender(options: {modeChanged: boolean; fromResize?: boolean}): void {
  syncLayout(options)
  requestAnimation()
}

function applyResizeAnchor(): void {
  if (focusedId != null) {
    rerender({modeChanged: false, fromResize: true})
    return
  }

  const anchorItem =
    gridLayout.items.find(item => item.y + item.height >= scrollTop + 40) ?? gridLayout.items[0] ?? null
  const anchorOffset = anchorItem == null ? 0 : scrollTop - anchorItem.y
  const anchorId = anchorItem?.id ?? null
  rerender({modeChanged: false, fromResize: true})
  if (anchorId != null) {
    const nextAnchor = getGridItem(anchorId)
    if (nextAnchor != null) {
      window.scrollTo({top: Math.max(0, nextAnchor.y + anchorOffset)})
      scrollTop = window.scrollY
      storedScrollTop = scrollTop
    }
  }
}

window.addEventListener('scroll', () => {
  if (focusedId != null) return
  scrollTop = window.scrollY
  if (scrollTop === storedScrollTop) return
  storedScrollTop = scrollTop
  rerender({modeChanged: false})
})

window.addEventListener('resize', () => {
  applyResizeAnchor()
})

window.addEventListener('popstate', () => {
  const nextFocusedId = parseFocusedIdFromHash()
  const wasFocused = focusedId != null
  focusedId = nextFocusedId
  lockScroll(focusedId != null)
  rerender({modeChanged: wasFocused !== (focusedId != null)})
})

window.addEventListener('keydown', event => {
  if (event.key === 'Escape') {
    dismissLineMode(true)
    return
  }
  if (event.key === 'ArrowLeft') {
    event.preventDefault()
    navigateBy(-1)
    return
  }
  if (event.key === 'ArrowRight') {
    event.preventDefault()
    navigateBy(1)
  }
})

lineDismissSurface.addEventListener('click', () => {
  dismissLineMode(true)
})
lineNavLeft.addEventListener('mouseenter', () => {
  lineHoverSide = 'left'
  requestAnimation()
})
lineNavLeft.addEventListener('mouseleave', () => {
  if (lineHoverSide === 'left') lineHoverSide = null
  requestAnimation()
})
lineNavLeft.addEventListener('click', event => {
  event.stopPropagation()
  if (getFocusedIndex() > 0) navigateBy(-1)
})
lineNavRight.addEventListener('mouseenter', () => {
  lineHoverSide = 'right'
  requestAnimation()
})
lineNavRight.addEventListener('mouseleave', () => {
  if (lineHoverSide === 'right') lineHoverSide = null
  requestAnimation()
})
lineNavRight.addEventListener('click', event => {
  event.stopPropagation()
  if (getFocusedIndex() < photoGalleryData.length - 1) navigateBy(1)
})

writeHash(focusedId, false)
lockScroll(focusedId != null)
rerender({modeChanged: focusedId != null})

async function waitFor(condition: () => boolean, timeoutMs = 3_000): Promise<void> {
  const startedAt = performance.now()
  while (performance.now() - startedAt < timeoutMs) {
    if (condition()) return
    await new Promise(resolve => window.requestAnimationFrame(() => resolve(undefined)))
  }
  throw new Error('Timed out waiting for scenario condition.')
}

function clickElement(element: Element): void {
  const rect = element.getBoundingClientRect()
  const eventInit = {
    bubbles: true,
    clientX: rect.left + rect.width / 2,
    clientY: rect.top + rect.height / 2,
  }
  element.dispatchEvent(new MouseEvent('pointerdown', eventInit))
  element.dispatchEvent(new MouseEvent('mousedown', eventInit))
  element.dispatchEvent(new MouseEvent('mouseup', eventInit))
  element.dispatchEvent(new MouseEvent('click', eventInit))
}

async function runNavigationScenario(): Promise<Record<string, unknown>> {
  const targetId = photoGalleryData[2]!.id
  const targetCard = document.querySelector<HTMLElement>(`[data-photo-id="${CSS.escape(targetId)}"]`)
  if (targetCard == null) {
    throw new Error('Could not find the third card for the navigation scenario.')
  }

  const startedInGrid = focusedId == null
  clickElement(targetCard)
  await waitFor(() => focusedId === targetId)
  const focusedAfterOpen = focusedId
  const hashAfterOpen = window.location.hash
  const scrollLockedWhileFocused = getComputedStyle(document.documentElement).overflowY === 'hidden'

  window.dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowRight', bubbles: true}))
  await waitFor(() => focusedId === photoGalleryData[3]!.id)
  const focusedAfterRight = focusedId

  window.dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowLeft', bubbles: true}))
  await waitFor(() => focusedId === targetId)
  const focusedAfterLeft = focusedId

  window.dispatchEvent(new KeyboardEvent('keydown', {key: 'Escape', bubbles: true}))
  await waitFor(() => focusedId == null)

  return {
    startedInGrid,
    focusedAfterOpen,
    focusedAfterRight,
    focusedAfterLeft,
    focusedAfterEscape: focusedId,
    hashAfterOpen,
    hashAfterEscape: window.location.hash,
    scrollLockedWhileFocused,
  }
}

async function runDismissScenario(): Promise<Record<string, unknown>> {
  const focusedIndex = 17
  const targetId = photoGalleryData[focusedIndex]!.id
  window.scrollTo({top: 0})
  scrollTop = window.scrollY
  storedScrollTop = scrollTop
  rerender({modeChanged: false})
  await waitFor(() => window.scrollY === 0)

  focusPhoto(targetId, true)
  await waitFor(() => focusedId === targetId)
  dismissLineMode(true)
  await waitFor(() => focusedId == null)
  await waitFor(() => {
    const item = getGridItem(targetId)
    if (item == null) return false
    const row = gridLayout.rows[item.row]
    if (row == null) return false
    const rowOffset = row.y - window.scrollY
    return rowOffset >= 20 && rowOffset <= 80
  })

  const item = getGridItem(targetId)
  if (item == null) {
    throw new Error('Dismiss scenario could not resolve the target grid item.')
  }
  const row = gridLayout.rows[item.row]
  if (row == null) {
    throw new Error('Dismiss scenario could not resolve the target grid row.')
  }
  const rowOffsetAfterDismiss = row.y - window.scrollY
  return {
    focusedIndex,
    rowOffsetAfterDismiss,
    rowVisibleAfterDismiss: rowOffsetAfterDismiss >= 0 && rowOffsetAfterDismiss <= window.innerHeight - row.height,
  }
}

async function runScenario(): Promise<void> {
  if (scenarioName === 'manual') {
    publishScenarioReport({
      status: 'ok',
      phase: 'ready',
      requestId: scenarioRequestId,
      scenario: scenarioName,
      details: {
        focusedId,
      },
    })
    return
  }

  publishScenarioReport({
    status: 'ok',
    phase: 'running',
    requestId: scenarioRequestId,
    scenario: scenarioName,
  })

  try {
    await waitFor(() => cardDomById.size > 0)
    const details =
      scenarioName === 'navigation'
        ? await runNavigationScenario()
        : scenarioName === 'dismiss-to-row'
          ? await runDismissScenario()
          : (() => {
              throw new Error(`Unknown scenario "${scenarioName}"`)
            })()

    publishScenarioReport({
      status: 'ok',
      phase: 'ready',
      requestId: scenarioRequestId,
      scenario: scenarioName,
      details,
    })
  } catch (error) {
    publishScenarioReport({
      status: 'error',
      phase: 'error',
      requestId: scenarioRequestId,
      scenario: scenarioName,
      message: error instanceof Error ? error.message : String(error),
    })
  }
}

void runScenario()
