import {getHighResImageUrl, getLowResImageUrl, photoGalleryData} from './data'
import {
  computeGridLayout,
  computeLineLayout,
  getVisibleGridIndices,
  resolveLineModeClickAction,
  type GridItemLayout,
  type GridLayout,
  type LineItemLayout,
} from './layout'

type Route =
  | {type: 'grid'}
  | {type: 'line'; focusedId: string}

type SemanticStep = {
  mode: 'grid' | 'line'
  focusedId: string | null
  hash: string
}

type DismissReport = {
  dismissedFocusedId: string
  scrollTopBeforeOpen: number
  scrollTopDuringLockAttempt: number
  focusedRowTopAfterDismiss: number | null
}

type HoveredCard =
  | {
      id: string
      localX: number
      localY: number
    }
  | null

type SideHover = 'left' | 'right' | null

type ScalarSpring = {
  pos: number
  dest: number
  v: number
}

type AnimatedCard = {
  x: ScalarSpring
  y: ScalarSpring
  width: ScalarSpring
  height: ScalarSpring
  scale: ScalarSpring
  hoverX: ScalarSpring
  hoverY: ScalarSpring
  dim: ScalarSpring
  blur: ScalarSpring
}

type CardDom = {
  root: HTMLDivElement
  imageShell: HTMLDivElement
  lowRes: HTMLDivElement
  highRes: HTMLImageElement
  caption: HTMLDivElement
}

type Anchor = {
  id: string
  prevY: number
}

type RenderSnapshot = {
  mode: 'grid' | 'line'
  focusedId: string | null
  cursor: string
  visibleIds: string[]
  firstVisibleId: string | null
  scrollTop: number
}

const msPerAnimationStep = 6
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
const cardById = new Map(photoGalleryData.map((photo, index) => [photo.id, index]))
const search = new URLSearchParams(window.location.search)

const app = must(document.getElementById('app'), 'Missing #app')
const gallery = must(document.getElementById('gallery'), 'Missing #gallery')
const backdrop = must(document.getElementById('overlay-backdrop'), 'Missing #overlay-backdrop')
const navLeft = must(document.getElementById('nav-left'), 'Missing #nav-left')
const navRight = must(document.getElementById('nav-right'), 'Missing #nav-right')
const reportNode = must(document.getElementById('semantic-report'), 'Missing #semantic-report')

const domCache = {
  cards: new Map<string, CardDom>(),
}

const state = {
  route: parseRoute(window.location.hash, window.history.state),
  viewportWidth: window.innerWidth,
  viewportHeight: window.innerHeight,
  storedScrollTop: window.scrollY,
  lockedScrollTop: null as number | null,
  hoveredCard: null as HoveredCard,
  navHover: null as SideHover,
  animatedUntilTime: null as number | null,
  gridLayout: null as GridLayout | null,
  previousGridLayout: null as GridLayout | null,
  previousRoute: null as Route | null,
  anchor: null as Anchor | null,
  lastSnapshot: null as RenderSnapshot | null,
  lastDismissReport: null as DismissReport | null,
  pendingDismissMeasurementId: null as string | null,
  scenario: search.get('scenario'),
  requestId: search.get('requestId') ?? '',
  scenarioStarted: false,
  scenarioSteps: [] as SemanticStep[],
  reportStatus: 'loading' as 'loading' | 'ready' | 'error',
  reportMessage: null as string | null,
}

const animatedCards = new Map<string, AnimatedCard>()

let scheduledRaf: number | null = null

window.addEventListener('resize', () => scheduleRender())
window.addEventListener('scroll', () => scheduleRender(), {capture: true})
window.addEventListener('popstate', (event) => {
  const route = parseRoute(window.location.hash, event.state)
  applyRoute(route, {historyMode: 'none'})
})
window.addEventListener('hashchange', () => {
  if (window.history.state == null) {
    applyRoute(parseRoute(window.location.hash, null), {historyMode: 'none'})
  }
})
window.addEventListener('keydown', (event) => {
  switch (event.key) {
    case 'ArrowLeft':
      event.preventDefault()
      if (state.route.type === 'grid') {
        focusIndex(0, 'push')
      } else if (focusedIndex() > 0) {
        focusIndex(focusedIndex() - 1, 'push')
      }
      break
    case 'ArrowRight':
      event.preventDefault()
      if (state.route.type === 'grid') {
        focusIndex(0, 'push')
      } else if (focusedIndex() < photoGalleryData.length - 1) {
        focusIndex(focusedIndex() + 1, 'push')
      }
      break
    case 'Escape':
      if (state.route.type === 'line') {
        event.preventDefault()
        dismissLineMode('push')
      }
      break
  }
})

navLeft.addEventListener('mouseenter', () => {
  state.navHover = 'left'
  scheduleRender()
})
navLeft.addEventListener('mouseleave', () => {
  state.navHover = null
  scheduleRender()
})
navLeft.addEventListener('click', (event) => {
  event.stopPropagation()
  if (state.route.type === 'line' && focusedIndex() > 0) {
    focusIndex(focusedIndex() - 1, 'push')
  }
})

navRight.addEventListener('mouseenter', () => {
  state.navHover = 'right'
  scheduleRender()
})
navRight.addEventListener('mouseleave', () => {
  state.navHover = null
  scheduleRender()
})
navRight.addEventListener('click', (event) => {
  event.stopPropagation()
  if (state.route.type === 'line' && focusedIndex() < photoGalleryData.length - 1) {
    focusIndex(focusedIndex() + 1, 'push')
  }
})

backdrop.addEventListener('mousemove', () => {
  if (state.navHover != null) {
    state.navHover = null
    scheduleRender()
  }
})
backdrop.addEventListener('click', (event) => {
  if (state.route.type !== 'line') return
  const action = resolveLineModeClickAction(event.clientX, state.viewportWidth, focusedIndex(), photoGalleryData.length)
  switch (action.type) {
    case 'previous':
      focusIndex(focusedIndex() - 1, 'push')
      break
    case 'next':
      focusIndex(focusedIndex() + 1, 'push')
      break
    case 'dismiss':
      dismissLineMode('push')
      break
  }
})

function scheduleRender() {
  if (scheduledRaf != null) return
  scheduledRaf = window.requestAnimationFrame((now) => {
    scheduledRaf = null
    if (render(now)) scheduleRender()
  })
}

function render(now: number) {
  const previousGridLayout = state.gridLayout
  const previousRoute = state.previousRoute ?? state.route
  const viewportWidth = window.innerWidth
  const viewportHeight = window.innerHeight
  let scrollTop = window.scrollY

  if (state.lockedScrollTop != null && Math.abs(scrollTop - state.lockedScrollTop) > 0.5) {
    window.scrollTo({top: state.lockedScrollTop, behavior: 'instant'})
    scrollTop = state.lockedScrollTop
  }

  const userScrolled = scrollTop !== state.storedScrollTop
  const nextGridLayout = computeGridLayout(photoGalleryData, viewportWidth)
  state.previousGridLayout = previousGridLayout
  state.gridLayout = nextGridLayout

  if (state.route.type === 'grid') {
    state.anchor = updateGridAnchor(state.anchor, previousGridLayout, nextGridLayout, scrollTop, userScrolled)
  } else {
    state.anchor = null
  }

  let pendingScrollTop: number | null = null
  if (state.route.type === 'grid' && previousGridLayout != null && !userScrolled && viewportWidth !== state.viewportWidth && state.anchor != null) {
    const anchorIndex = cardById.get(state.anchor.id)
    if (anchorIndex != null) {
      const nextAnchor = nextGridLayout.items[anchorIndex]!
      pendingScrollTop = Math.max(0, scrollTop + (nextAnchor.y - state.anchor.prevY))
      state.anchor.prevY = nextAnchor.y
      scrollTop = pendingScrollTop
    }
  }

  let visibleIndices: number[]
  let lineLayout: LineItemLayout[] | null
  switch (state.route.type) {
    case 'grid':
      visibleIndices = getVisibleGridIndices(nextGridLayout, scrollTop, viewportHeight, 720)
      lineLayout = null
      break
    case 'line':
      visibleIndices = photoGalleryData.map((_, index) => index)
      lineLayout = computeLineLayout(photoGalleryData, focusedIndex(), viewportWidth, viewportHeight, scrollTop)
      break
  }

  const visibleIds = visibleIndices.map((index) => photoGalleryData[index]!.id)
  syncMountedCards(new Set(visibleIds))

  const steps = reduceMotion ? 1 : Math.min(300, state.animatedUntilTime == null ? 1 : Math.max(1, Math.floor((now - state.animatedUntilTime) / msPerAnimationStep)))
  let animatedNow = false

  for (let stepIndex = 0; stepIndex < steps; stepIndex++) {
    for (let index = 0; index < visibleIndices.length; index++) {
      const photoIndex = visibleIndices[index]!
      const photo = photoGalleryData[photoIndex]!
      const card = domCache.cards.get(photo.id)
      if (card == null) continue
      const springs = ensureAnimatedCard(photo.id, targetLayoutForIndex(photoIndex, nextGridLayout, lineLayout, scrollTop))
      const target = targetLayoutForIndex(photoIndex, nextGridLayout, lineLayout, scrollTop)
      const navScaleBoost = lineNavigationScaleBoost(photoIndex)
      const hoverOffset = state.hoveredCard?.id === photo.id ? state.hoveredCard : null
      const isFocused = state.route.type === 'line' && state.route.focusedId === photo.id
      const snapGridReflow =
        state.route.type === 'grid' &&
        previousRoute.type === 'grid' &&
        previousGridLayout != null &&
        viewportWidth !== state.viewportWidth &&
        sameGridSlot(previousGridLayout.items[photoIndex], nextGridLayout.items[photoIndex])

      retargetSpring(springs.x, target.x, snapGridReflow)
      retargetSpring(springs.y, target.y, snapGridReflow)
      retargetSpring(springs.width, target.width, snapGridReflow)
      retargetSpring(springs.height, target.height, snapGridReflow)
      retargetSpring(springs.scale, target.scale + navScaleBoost, reduceMotion)
      retargetSpring(springs.hoverX, hoverOffset == null ? 0 : hoverOffset.localX * 12, reduceMotion)
      retargetSpring(springs.hoverY, hoverOffset == null ? 0 : hoverOffset.localY * 12, reduceMotion)
      retargetSpring(springs.dim, target.dim, reduceMotion)
      retargetSpring(springs.blur, target.blur, reduceMotion)

      animatedNow = stepAnimatedCard(springs) || animatedNow
      projectCard(card, photo, springs, target, isFocused)
    }
  }

  const overlayVisible = state.route.type === 'line'
  backdrop.style.pointerEvents = overlayVisible ? 'auto' : 'none'
  backdrop.style.opacity = overlayVisible ? '1' : '0'

  const canGoLeft = state.route.type === 'line' && focusedIndex() > 0
  const canGoRight = state.route.type === 'line' && focusedIndex() < photoGalleryData.length - 1
  navLeft.style.pointerEvents = canGoLeft ? 'auto' : 'none'
  navRight.style.pointerEvents = canGoRight ? 'auto' : 'none'
  navLeft.style.opacity = overlayVisible ? '1' : '0'
  navRight.style.opacity = overlayVisible ? '1' : '0'

  const cursor = overlayVisible
    ? state.navHover == null
      ? 'zoom-out'
      : 'zoom-in'
    : state.hoveredCard == null
      ? 'default'
      : 'zoom-in'
  document.body.style.cursor = cursor
  document.documentElement.style.overflowY = overlayVisible ? 'hidden' : ''
  document.body.style.overflowY = overlayVisible ? 'hidden' : ''
  gallery.style.height = `${Math.max(nextGridLayout.totalHeight, viewportHeight)}px`
  app.style.minHeight = `${Math.max(nextGridLayout.totalHeight, viewportHeight)}px`

  if (pendingScrollTop != null) {
    window.scrollTo({top: pendingScrollTop, behavior: 'instant'})
  }

  if (state.route.type === 'grid' && state.pendingDismissMeasurementId != null) {
    const focusedLayout = itemLayoutForId(nextGridLayout, state.pendingDismissMeasurementId)
    if (focusedLayout != null) {
      const rowTopInViewport = focusedLayout.y - window.scrollY
      const shouldRestore = rowTopInViewport < 32 || rowTopInViewport > viewportHeight - focusedLayout.height - 48
      if (shouldRestore) {
        const restoredScrollTop = Math.max(0, focusedLayout.y - 40)
        window.scrollTo({top: restoredScrollTop, behavior: 'instant'})
      }
      const finalRowTop = focusedLayout.y - window.scrollY
      if (state.lastDismissReport != null) {
        state.lastDismissReport.focusedRowTopAfterDismiss = finalRowTop
      }
      state.pendingDismissMeasurementId = null
    }
  }

  state.previousRoute = state.route
  state.viewportWidth = viewportWidth
  state.viewportHeight = viewportHeight
  state.storedScrollTop = window.scrollY

  const snapshot: RenderSnapshot = {
    mode: state.route.type,
    focusedId: state.route.type === 'line' ? state.route.focusedId : null,
    cursor,
    visibleIds,
    firstVisibleId: visibleIds[0] ?? null,
    scrollTop: window.scrollY,
  }
  state.lastSnapshot = snapshot
  publishReport()
  maybeRunScenario()

  if (animatedNow) {
    state.animatedUntilTime = now
  } else {
    state.animatedUntilTime = null
  }
  return animatedNow
}

function targetLayoutForIndex(index: number, gridLayout: GridLayout, lineLayout: LineItemLayout[] | null, scrollTop: number) {
  if (state.route.type === 'grid' || lineLayout == null) {
    const item = gridLayout.items[index]!
    return {
      x: item.x,
      y: item.y,
      width: item.width,
      height: item.height,
      imageHeight: item.imageHeight,
      scale: state.hoveredCard?.id === item.id ? 1.02 : 1,
      dim: 0,
      blur: 0,
      captionClamp: 2,
      captionScrollable: false,
      imageWidth: item.imageWidth,
      isFocused: false,
      scrollTop,
    }
  }

  const item = lineLayout[index]!
  const distance = Math.abs(index - focusedIndex())
  return {
    x: item.x,
    y: item.y,
    width: item.width,
    height: item.height,
    imageHeight: item.imageHeight,
    scale: 1,
    dim: distance === 0 ? 0 : distance === 1 ? 0.28 : 0.42,
    blur: distance === 1 ? 1.8 : 0,
    captionClamp: 6,
    captionScrollable: true,
    imageWidth: item.width,
    isFocused: item.isFocused,
    scrollTop,
  }
}

function lineNavigationScaleBoost(index: number) {
  if (state.route.type !== 'line') return 0
  if (state.navHover === 'left' && index === focusedIndex() - 1) return 0.035
  if (state.navHover === 'right' && index === focusedIndex() + 1) return 0.035
  return 0
}

function projectCard(card: CardDom, photo: (typeof photoGalleryData)[number], springs: AnimatedCard, target: ReturnType<typeof targetLayoutForIndex>, isFocused: boolean) {
  card.root.style.transform = `translate3d(${(springs.x.pos + springs.hoverX.pos).toFixed(2)}px, ${(springs.y.pos + springs.hoverY.pos).toFixed(2)}px, 0) scale(${springs.scale.pos.toFixed(4)})`
  card.root.style.width = `${springs.width.pos.toFixed(2)}px`
  card.root.style.height = `${springs.height.pos.toFixed(2)}px`
  card.root.style.padding = '10px 10px 0'
  card.root.style.zIndex = String(zIndexForCard(photo.id))
  card.root.dataset.photoId = photo.id
  card.imageShell.style.height = `${target.imageHeight}px`
  card.imageShell.style.filter = `brightness(${(1 - springs.dim.pos).toFixed(3)}) blur(${springs.blur.pos.toFixed(2)}px)`
  card.lowRes.style.backgroundImage = `url("${getLowResImageUrl(photo.id)}")`
  card.caption.textContent = photo.prompt
  card.caption.style.color = target.isFocused ? 'rgba(245, 247, 251, 0.92)' : 'rgba(230, 236, 241, 0.84)'
  card.caption.style.maxHeight = target.captionScrollable ? '72px' : '52px'
  card.caption.style.overflowY = target.captionScrollable ? 'auto' : 'hidden'
  card.caption.style.display = '-webkit-box'
  card.caption.style.webkitLineClamp = target.captionScrollable ? 'unset' : '2'
  card.caption.style.webkitBoxOrient = 'vertical'

  if (state.route.type === 'line' && isFocused) {
    const highResUrl = getHighResImageUrl(photo.id)
    if (card.highRes.src !== highResUrl) {
      card.highRes.src = highResUrl
    }
    card.highRes.style.opacity = '1'
  } else {
    card.highRes.removeAttribute('src')
    card.highRes.style.opacity = '0'
  }
}

function syncMountedCards(nextVisibleIds: Set<string>) {
  for (const [id, card] of domCache.cards) {
    if (!nextVisibleIds.has(id)) {
      card.root.remove()
      domCache.cards.delete(id)
      animatedCards.delete(id)
    }
  }

  for (const id of nextVisibleIds) {
    if (domCache.cards.has(id)) continue
    const card = createCardDom(id)
    domCache.cards.set(id, card)
    gallery.appendChild(card.root)
  }
}

function createCardDom(id: string): CardDom {
  const photo = photoGalleryData[must(cardById.get(id), `Unknown photo id ${id}`)]!
  const root = document.createElement('div')
  root.className = 'gallery-card'
  root.dataset.photoId = id

  const imageShell = document.createElement('div')
  imageShell.className = 'image-shell'

  const lowRes = document.createElement('div')
  lowRes.className = 'image-lowres'

  const highRes = document.createElement('img')
  highRes.className = 'image-highres'
  highRes.alt = photo.prompt
  highRes.draggable = false

  const caption = document.createElement('div')
  caption.className = 'card-caption'
  caption.dataset.role = 'caption'
  caption.textContent = photo.prompt

  caption.addEventListener('pointerdown', (event) => {
    event.stopPropagation()
  })
  caption.addEventListener('click', (event) => {
    event.stopPropagation()
    const selection = window.getSelection()
    if (selection == null) return
    const range = document.createRange()
    range.selectNodeContents(caption)
    selection.removeAllRanges()
    selection.addRange(range)
  })

  root.addEventListener('pointermove', (event) => {
    if (state.route.type !== 'grid') return
    const rect = root.getBoundingClientRect()
    state.hoveredCard = {
      id,
      localX: (event.clientX - rect.left) / rect.width - 0.5,
      localY: (event.clientY - rect.top) / rect.height - 0.5,
    }
    scheduleRender()
  })
  root.addEventListener('pointerleave', () => {
    if (state.hoveredCard?.id === id) {
      state.hoveredCard = null
      scheduleRender()
    }
  })
  root.addEventListener('click', (event) => {
    if (!(event.target instanceof HTMLElement)) return
    if (event.target.closest('[data-role="caption"]') != null) return
    switch (state.route.type) {
      case 'grid':
        applyRoute({type: 'line', focusedId: id}, {historyMode: 'push'})
        break
      case 'line':
        dismissLineMode('push')
        break
    }
  })

  imageShell.append(lowRes, highRes)
  root.append(imageShell, caption)
  return {root, imageShell, lowRes, highRes, caption}
}

function ensureAnimatedCard(id: string, initial: ReturnType<typeof targetLayoutForIndex>) {
  const existing = animatedCards.get(id)
  if (existing != null) return existing
  const created: AnimatedCard = {
    x: spring(initial.x),
    y: spring(initial.y),
    width: spring(initial.width),
    height: spring(initial.height),
    scale: spring(initial.scale),
    hoverX: spring(0),
    hoverY: spring(0),
    dim: spring(initial.dim),
    blur: spring(initial.blur),
  }
  animatedCards.set(id, created)
  return created
}

function spring(position: number): ScalarSpring {
  return {pos: position, dest: position, v: 0}
}

function retargetSpring(s: ScalarSpring, destination: number, snap: boolean) {
  s.dest = destination
  if (snap || reduceMotion) {
    s.pos = destination
    s.v = 0
  }
}

function stepAnimatedCard(card: AnimatedCard) {
  let animating = false
  animating = stepSpring(card.x) || animating
  animating = stepSpring(card.y) || animating
  animating = stepSpring(card.width) || animating
  animating = stepSpring(card.height) || animating
  animating = stepSpring(card.scale) || animating
  animating = stepSpring(card.hoverX) || animating
  animating = stepSpring(card.hoverY) || animating
  animating = stepSpring(card.dim) || animating
  animating = stepSpring(card.blur) || animating
  return animating
}

function stepSpring(config: ScalarSpring) {
  if (reduceMotion) {
    config.pos = config.dest
    config.v = 0
    return false
  }
  const t = msPerAnimationStep / 1000
  const k = 333
  const b = 33
  const force = -k * (config.pos - config.dest) - b * config.v
  const nextV = config.v + force * t
  const nextPos = config.pos + nextV * t
  config.v = nextV
  config.pos = nextPos
  if (Math.abs(config.v) < 0.01 && Math.abs(config.dest - config.pos) < 0.01) {
    config.pos = config.dest
    config.v = 0
    return false
  }
  return true
}

function focusedIndex() {
  if (state.route.type !== 'line') return 0
  return must(cardById.get(state.route.focusedId), `Unknown focused id ${state.route.focusedId}`)
}

function focusIndex(index: number, historyMode: 'push' | 'replace') {
  const photo = photoGalleryData[index]
  if (photo == null) return
  applyRoute({type: 'line', focusedId: photo.id}, {historyMode})
}

function dismissLineMode(historyMode: 'push' | 'replace') {
  if (state.route.type !== 'line') return
  const dismissedFocusedId = state.route.focusedId
  applyRoute({type: 'grid'}, {historyMode})
  state.pendingDismissMeasurementId = dismissedFocusedId
}

function applyRoute(route: Route, options: {historyMode: 'push' | 'replace' | 'none'}) {
  const sanitized = sanitizeRoute(route)
  if (sameRoute(state.route, sanitized) && options.historyMode === 'none') return

  switch (sanitized.type) {
    case 'grid':
      state.lockedScrollTop = null
      if (state.route.type === 'line') {
        state.lastDismissReport = {
          dismissedFocusedId: state.route.focusedId,
          scrollTopBeforeOpen: state.lastDismissReport?.scrollTopBeforeOpen ?? window.scrollY,
          scrollTopDuringLockAttempt: state.lastDismissReport?.scrollTopDuringLockAttempt ?? window.scrollY,
          focusedRowTopAfterDismiss: null,
        }
      }
      break
    case 'line':
      if (state.route.type === 'grid') {
        state.lastDismissReport = {
          dismissedFocusedId: sanitized.focusedId,
          scrollTopBeforeOpen: window.scrollY,
          scrollTopDuringLockAttempt: window.scrollY,
          focusedRowTopAfterDismiss: null,
        }
      }
      state.lockedScrollTop = window.scrollY
      break
  }

  state.route = sanitized
  switch (options.historyMode) {
    case 'push':
      window.history.pushState(sanitized, '', encodeRouteToUrl(sanitized))
      break
    case 'replace':
      window.history.replaceState(sanitized, '', encodeRouteToUrl(sanitized))
      break
    case 'none':
      break
  }
  scheduleRender()
}

function parseRoute(hash: string, historyState: unknown): Route {
  if (historyState != null && typeof historyState === 'object' && 'type' in historyState) {
    const candidate = historyState as Route
    return sanitizeRoute(candidate)
  }
  if (hash.length > 1) {
    return sanitizeRoute({type: 'line', focusedId: decodeURIComponent(hash.slice(1))})
  }
  return {type: 'grid'}
}

function sanitizeRoute(route: Route): Route {
  switch (route.type) {
    case 'grid':
      return route
    case 'line':
      return cardById.has(route.focusedId) ? route : {type: 'grid'}
  }
}

function encodeRouteToUrl(route: Route) {
  const base = `${window.location.pathname}${window.location.search}`
  switch (route.type) {
    case 'grid':
      return base
    case 'line':
      return `${base}#${encodeURIComponent(route.focusedId)}`
  }
}

function sameRoute(a: Route, b: Route) {
  if (a.type !== b.type) return false
  if (a.type === 'grid') return true
  return a.focusedId === b.focusedId
}

function sameGridSlot(previous: GridItemLayout | undefined, next: GridItemLayout | undefined) {
  if (previous == null || next == null) return false
  return previous.row === next.row && previous.column === next.column
}

function itemLayoutForId(layout: GridLayout, id: string) {
  const index = cardById.get(id)
  return index == null ? null : layout.items[index]!
}

function updateGridAnchor(anchor: Anchor | null, previousLayout: GridLayout | null, nextLayout: GridLayout, scrollTop: number, userScrolled: boolean) {
  if (userScrolled || previousLayout == null || anchor == null) {
    const nextAnchor = nextLayout.items.find((item) => item.y + item.height >= scrollTop)
    return nextAnchor == null ? null : {id: nextAnchor.id, prevY: nextAnchor.y}
  }
  const anchorIndex = cardById.get(anchor.id)
  if (anchorIndex == null) return anchor
  return {
    id: anchor.id,
    prevY: previousLayout.items[anchorIndex]!.y,
  }
}

function zIndexForCard(id: string) {
  if (state.route.type === 'grid') {
    return state.hoveredCard?.id === id ? 18 : 10
  }
  const distance = Math.abs(must(cardById.get(id), `Unknown z-index id ${id}`) - focusedIndex())
  return 50 - distance
}

function publishReport() {
  const report = {
    status: state.reportStatus,
    requestId: state.requestId,
    scenario: state.scenario,
    mode: state.route.type,
    focusedId: state.route.type === 'line' ? state.route.focusedId : null,
    hash: window.location.hash,
    cursor: document.body.style.cursor || 'default',
    visibleIds: state.lastSnapshot?.visibleIds ?? [],
    firstVisibleId: state.lastSnapshot?.firstVisibleId ?? null,
    scrollTop: window.scrollY,
    steps: state.scenarioSteps,
    scrollTopBeforeOpen: state.lastDismissReport?.scrollTopBeforeOpen,
    scrollTopDuringLockAttempt: state.lastDismissReport?.scrollTopDuringLockAttempt,
    focusedRowTopAfterDismiss: state.lastDismissReport?.focusedRowTopAfterDismiss,
    dismissedFocusedId: state.lastDismissReport?.dismissedFocusedId,
    message: state.reportMessage,
  }
  const serialized = JSON.stringify(report)
  reportNode.textContent = serialized
  reportNode.setAttribute('data-report', encodeURIComponent(serialized))
}

function recordScenarioStep() {
  state.scenarioSteps.push({
    mode: state.route.type,
    focusedId: state.route.type === 'line' ? state.route.focusedId : null,
    hash: window.location.hash,
  })
}

async function maybeRunScenario() {
  if (state.scenario == null || state.scenarioStarted) return
  state.scenarioStarted = true
  state.reportStatus = 'loading'
  state.reportMessage = null
  try {
    await waitForFrames(4)
    switch (state.scenario) {
      case 'navigation':
        await runNavigationScenario()
        break
      case 'dismiss-to-row':
        await runDismissToRowScenario()
        break
      default:
        throw new Error(`Unknown scenario: ${state.scenario}`)
    }
    state.reportStatus = 'ready'
    publishReport()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    state.reportStatus = 'error'
    state.reportMessage = message
    publishReport()
  }
}

async function runNavigationScenario() {
  state.scenarioSteps = []
  recordScenarioStep()
  clickCard(photoGalleryData[0]!.id)
  await waitForCondition(() => state.route.type === 'line' && state.route.focusedId === photoGalleryData[0]!.id, 'open first photo')
  await waitForFrames(4)
  recordScenarioStep()
  navRight.click()
  await waitForCondition(() => state.route.type === 'line' && state.route.focusedId === photoGalleryData[1]!.id, 'move to second photo')
  await waitForFrames(4)
  recordScenarioStep()
  window.history.back()
  await waitForCondition(() => state.route.type === 'line' && state.route.focusedId === photoGalleryData[0]!.id, 'history back to first photo')
  await waitForFrames(4)
  recordScenarioStep()
  window.history.forward()
  await waitForCondition(() => state.route.type === 'line' && state.route.focusedId === photoGalleryData[1]!.id, 'history forward to second photo')
  await waitForFrames(4)
  recordScenarioStep()
}

async function runDismissToRowScenario() {
  const gridLayout = must(state.gridLayout, 'Grid layout missing for dismiss scenario')
  const startPhoto = photoGalleryData[12]!
  const targetItem = itemLayoutForId(gridLayout, startPhoto.id)
  if (targetItem == null) throw new Error('Target grid item missing for dismiss scenario')
  window.scrollTo({top: Math.max(0, targetItem.y - 160), behavior: 'instant'})
  await waitForCondition(() => window.scrollY > 0, 'scroll to target row')
  if (state.lastDismissReport != null) {
    state.lastDismissReport.scrollTopBeforeOpen = window.scrollY
  }
  clickCard(startPhoto.id)
  await waitForCondition(() => state.route.type === 'line' && state.route.focusedId === startPhoto.id, 'open dismiss scenario photo')
  for (let i = 0; i < 6; i++) {
    navRight.click()
    const nextPhoto = photoGalleryData[13 + i]
    if (nextPhoto == null) break
    await waitForCondition(() => state.route.type === 'line' && state.route.focusedId === nextPhoto.id, `move to ${nextPhoto.id}`)
  }
  const lockedBaseline = window.scrollY
  window.scrollTo({top: lockedBaseline + 420, behavior: 'instant'})
  await waitForCondition(() => Math.abs(window.scrollY - lockedBaseline) < 1, 'restore locked scroll position')
  if (state.lastDismissReport != null) {
    state.lastDismissReport.scrollTopBeforeOpen = lockedBaseline
    state.lastDismissReport.scrollTopDuringLockAttempt = window.scrollY
  }
  clickBackdropCenter()
  await waitForCondition(() => state.route.type === 'grid', 'dismiss back to grid')
  await waitForCondition(() => state.pendingDismissMeasurementId == null, 'measure dismissed row')
  await waitForFrames(4)
}

function clickCard(id: string) {
  const card = domCache.cards.get(id)
  if (card == null) throw new Error(`Missing mounted card ${id}`)
  card.root.click()
}

function clickBackdropCenter() {
  backdrop.dispatchEvent(
    new MouseEvent('click', {
      bubbles: true,
      clientX: state.viewportWidth / 2,
      clientY: state.viewportHeight / 2,
    }),
  )
}

async function waitForSettled() {
  for (let i = 0; i < 80; i++) {
    await nextFrame()
    const waitingForDismissMeasure = state.pendingDismissMeasurementId != null
    if (state.animatedUntilTime == null && !waitingForDismissMeasure) return
  }
  throw new Error('Timed out waiting for the gallery to settle.')
}

async function waitForFrames(count: number) {
  for (let i = 0; i < count; i++) {
    await nextFrame()
  }
}

async function waitForCondition(check: () => boolean, label: string) {
  for (let i = 0; i < 120; i++) {
    await nextFrame()
    if (check()) return
  }
  throw new Error(`Timed out waiting for ${label}.`)
}

function nextFrame() {
  return new Promise<void>((resolve) => {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => resolve())
    })
  })
}

function must<T>(value: T | null | undefined, message: string): T {
  if (value == null) throw new Error(message)
  return value
}

scheduleRender()
