import {
  computeGridLayout,
  findGridItem,
  getVisibleGridPhotoIds,
  GRID_CAPTION_BOTTOM_GAP,
  GRID_CAPTION_VISIBLE_HEIGHT,
} from './layout'
import {
  computeLineLayout,
  LINE_CAPTION_BOTTOM_GAP,
  LINE_CAPTION_VISIBLE_HEIGHT,
  routeLineStripClick,
} from './line-mode'
import {
  getPhotoUrl,
  photoGalleryData,
  type PhotoData,
} from './photo-data'

type Route =
  | { type: 'grid' }
  | { type: 'line'; photoId: string }

type ScenarioReport = {
  phase: 'loading' | 'running' | 'ready' | 'error'
  requestId: string
  scenario: string
  mode?: 'grid' | 'line'
  focusedId?: string | null
  selectedText?: string
  mountedCount?: number
  totalCount?: number
  restoreGap?: number
  hash?: string
  message?: string
}

type GridCardDom = {
  root: HTMLDivElement
  frame: HTMLDivElement
  image: HTMLImageElement
  caption: HTMLDivElement
}

type LineCardDom = {
  root: HTMLDivElement
  frame: HTMLDivElement
  image: HTMLImageElement
}

type State = {
  route: Route
  pendingExternalRoute: Route | null
  pendingClick: MouseEvent | null
  pendingCaptionSelectionId: string | null
  pendingRestorePhotoId: string | null
  scenario: string
  requestId: string
  scenarioStarted: boolean
  mountedCount: number
  dismissRestoreGap: number | null
}

type DomCache = {
  app: HTMLDivElement
  gridRoot: HTMLDivElement
  lineOverlay: HTMLDivElement
  lineTrack: HTMLDivElement
  lineCaption: HTMLDivElement
  reportNode: HTMLScriptElement
  gridCards: Map<string, GridCardDom>
  lineCards: Map<string, LineCardDom>
}

type UrlMutation = 'none' | 'push'

const query = new URLSearchParams(window.location.search)
const scenario = query.get('scenario') ?? ''
const requestId = query.get('requestId') ?? ''
const usePlaceholderImages = scenario !== ''

const app = document.querySelector('#app')
const gridRoot = document.querySelector('#grid-root')
const lineOverlay = document.querySelector('#line-overlay')
const lineTrack = document.querySelector('#line-track')
const lineCaption = document.querySelector('#line-caption')
const reportNode = document.querySelector('#scenario-report')

if (!(app instanceof HTMLDivElement)) {
  throw new Error('Expected #app root')
}
if (!(gridRoot instanceof HTMLDivElement)) {
  throw new Error('Expected #grid-root')
}
if (!(lineOverlay instanceof HTMLDivElement)) {
  throw new Error('Expected #line-overlay')
}
if (!(lineTrack instanceof HTMLDivElement)) {
  throw new Error('Expected #line-track')
}
if (!(lineCaption instanceof HTMLDivElement)) {
  throw new Error('Expected #line-caption')
}
if (!(reportNode instanceof HTMLScriptElement)) {
  throw new Error('Expected #scenario-report')
}

const domCache: DomCache = {
  app,
  gridRoot,
  lineOverlay,
  lineTrack,
  lineCaption,
  reportNode,
  gridCards: new Map(),
  lineCards: new Map(),
}

const state: State = {
  route: sanitizeRoute(parseRoute(window.location.hash, window.history.state)),
  pendingExternalRoute: null,
  pendingClick: null,
  pendingCaptionSelectionId: null,
  pendingRestorePhotoId: null,
  scenario,
  requestId,
  scenarioStarted: false,
  mountedCount: 0,
  dismissRestoreGap: null,
}

window.history.replaceState(state.route, '', encodeRoute(state.route))

window.addEventListener('resize', () => {
  scheduleRender()
})
window.addEventListener(
  'scroll',
  () => {
    scheduleRender()
  },
  true,
)
window.addEventListener('click', (event) => {
  state.pendingClick = event
  scheduleRender()
})
window.addEventListener('popstate', (event) => {
  state.pendingExternalRoute = sanitizeRoute(parseRoute(window.location.hash, event.state))
  scheduleRender()
})
window.addEventListener('hashchange', () => {
  state.pendingExternalRoute = sanitizeRoute(parseRoute(window.location.hash, window.history.state))
  scheduleRender()
})

if (state.scenario !== '' && state.requestId !== '') {
  publishReport({
    phase: 'loading',
    requestId: state.requestId,
    scenario: state.scenario,
  })
}

let scheduledAnimationFrame: number | null = null

function scheduleRender(): void {
  if (scheduledAnimationFrame != null) {
    return
  }

  scheduledAnimationFrame = window.requestAnimationFrame(() => {
    scheduledAnimationFrame = null
    render()
  })
}

function render(): void {
  const viewportWidth = document.documentElement.clientWidth
  const viewportHeight = document.documentElement.clientHeight
  const scrollTop = window.scrollY

  let route = state.route
  let pendingCaptionSelectionId = state.pendingCaptionSelectionId
  let pendingRestorePhotoId = state.pendingRestorePhotoId
  let dismissRestoreGap = state.dismissRestoreGap
  let urlMutation: UrlMutation = 'none'

  if (state.pendingExternalRoute != null) {
    route = state.pendingExternalRoute
    state.pendingExternalRoute = null
  }

  const gridLayout = computeGridLayout(photoGalleryData, viewportWidth)

  if (state.pendingClick != null) {
    const clickEvent = state.pendingClick
    const target = clickEvent.target

    if (target instanceof HTMLElement) {
      switch (route.type) {
        case 'grid': {
          const captionTarget = target.closest('[data-grid-caption-photo-id]')
          if (captionTarget instanceof HTMLElement) {
            const photoId = captionTarget.dataset.gridCaptionPhotoId
            if (typeof photoId === 'string') {
              pendingCaptionSelectionId = photoId
            }
            break
          }

          const photoTarget = target.closest('[data-grid-photo-id]')
          if (photoTarget instanceof HTMLElement) {
            const photoId = photoTarget.dataset.gridPhotoId
            if (typeof photoId === 'string') {
              route = { type: 'line', photoId }
              urlMutation = 'push'
            }
          }
          break
        }
        case 'line': {
          const focusedIndex = getPhotoIndex(route.photoId)
          const clickAction = routeLineStripClick(viewportWidth, clickEvent.clientX)
          if (clickAction === 'previous' && focusedIndex > 0) {
            const previousPhoto = photoGalleryData[focusedIndex - 1]
            if (previousPhoto != null) {
              route = { type: 'line', photoId: previousPhoto.id }
              urlMutation = 'push'
            }
          } else if (
            clickAction === 'next' &&
            focusedIndex >= 0 &&
            focusedIndex < photoGalleryData.length - 1
          ) {
            const nextPhoto = photoGalleryData[focusedIndex + 1]
            if (nextPhoto != null) {
              route = { type: 'line', photoId: nextPhoto.id }
              urlMutation = 'push'
            }
          } else if (clickAction === 'dismiss') {
            pendingRestorePhotoId = route.photoId
            dismissRestoreGap = null
            route = { type: 'grid' }
            urlMutation = 'push'
          }
          break
        }
      }
    }
  }

  route = sanitizeRoute(route)
  const focusedId = route.type === 'line' ? route.photoId : null
  const visiblePhotoIds = getVisibleGridPhotoIds(
    gridLayout,
    scrollTop,
    viewportHeight,
  )
  const visiblePhotoSet = new Set(visiblePhotoIds)

  state.route = route
  state.pendingClick = null
  state.pendingCaptionSelectionId = pendingCaptionSelectionId
  state.pendingRestorePhotoId = pendingRestorePhotoId
  state.dismissRestoreGap = dismissRestoreGap
  state.mountedCount = visiblePhotoIds.length

  renderGrid(gridLayout, visiblePhotoSet)
  renderLineOverlay(route, viewportWidth, viewportHeight)

  domCache.app.style.minHeight = `${gridLayout.totalHeight}px`
  domCache.gridRoot.style.height = `${gridLayout.totalHeight}px`
  domCache.lineOverlay.style.display = route.type === 'line' ? 'block' : 'none'
  domCache.lineOverlay.setAttribute(
    'aria-hidden',
    route.type === 'line' ? 'false' : 'true',
  )
  document.body.style.overflowY = route.type === 'line' ? 'hidden' : 'auto'
  document.body.style.overflowX = 'hidden'

  if (urlMutation === 'push') {
    window.history.pushState(route, '', encodeRoute(route))
  }

  if (state.pendingCaptionSelectionId != null) {
    const card = domCache.gridCards.get(state.pendingCaptionSelectionId)
    if (card != null && card.caption.parentNode != null) {
      selectNodeText(card.caption)
      state.pendingCaptionSelectionId = null
    }
  }

  if (state.pendingRestorePhotoId != null && state.route.type === 'grid') {
    const targetItem = findGridItem(gridLayout, state.pendingRestorePhotoId)
    if (targetItem != null) {
      const targetScrollTop = Math.max(0, targetItem.y - 40)
      window.scrollTo({ top: targetScrollTop, behavior: 'instant' as ScrollBehavior })
      state.dismissRestoreGap = targetItem.y - targetScrollTop
      state.pendingRestorePhotoId = null
      scheduleRender()
    }
  }

  if (state.scenario !== '' && state.requestId !== '' && !state.scenarioStarted) {
    state.scenarioStarted = true
    publishReport({
      phase: 'running',
      requestId: state.requestId,
      scenario: state.scenario,
      mode: route.type,
      focusedId,
      hash: window.location.hash,
    })
    void runScenario()
  }
}

function renderGrid(
  gridLayout: ReturnType<typeof computeGridLayout>,
  visiblePhotoSet: Set<string>,
): void {
  for (let index = 0; index < photoGalleryData.length; index += 1) {
    const photo = photoGalleryData[index]
    const item = gridLayout.items[index]

    if (photo == null || item == null) {
      continue
    }

    if (visiblePhotoSet.has(photo.id)) {
      let card = domCache.gridCards.get(photo.id)
      if (card == null) {
        card = createGridCardDom(photo)
        domCache.gridCards.set(photo.id, card)
      }

      if (card.root.parentNode == null) {
        domCache.gridRoot.appendChild(card.root)
      }

      card.root.style.transform = `translate(${item.x}px, ${item.y}px)`
      card.root.style.width = `${item.width}px`
      card.root.style.height = `${item.cardHeight}px`

      card.frame.style.width = `${item.width}px`
      card.frame.style.height = `${item.imageHeight}px`

      card.caption.style.top = `${item.imageHeight}px`
      card.caption.style.height = `${GRID_CAPTION_VISIBLE_HEIGHT}px`
      card.caption.style.paddingBottom = `${GRID_CAPTION_BOTTOM_GAP}px`
    } else {
      const card = domCache.gridCards.get(photo.id)
      if (card != null && card.root.parentNode != null) {
        card.root.remove()
      }
    }
  }
}

function renderLineOverlay(
  route: Route,
  viewportWidth: number,
  viewportHeight: number,
): void {
  if (route.type === 'grid') {
    domCache.lineCaption.textContent = ''
    for (const card of domCache.lineCards.values()) {
      if (card.root.parentNode != null) {
        card.root.remove()
      }
    }
    return
  }

  const lineLayout = computeLineLayout(
    photoGalleryData,
    route.photoId,
    viewportWidth,
    viewportHeight,
  )
  const focusedPhoto = photoGalleryData[lineLayout.focusIndex]
  if (focusedPhoto == null) {
    throw new Error(`Focused photo missing at index ${lineLayout.focusIndex}`)
  }

  domCache.lineCaption.textContent = focusedPhoto.prompt
  domCache.lineCaption.style.top = `${lineLayout.captionTop}px`
  domCache.lineCaption.style.height = `${LINE_CAPTION_VISIBLE_HEIGHT}px`
  domCache.lineCaption.style.paddingBottom = `${LINE_CAPTION_BOTTOM_GAP}px`

  for (let index = 0; index < lineLayout.items.length; index += 1) {
    const item = lineLayout.items[index]
    const photo = photoGalleryData[index]
    if (item == null || photo == null) {
      continue
    }

    let card = domCache.lineCards.get(photo.id)
    if (card == null) {
      card = createLineCardDom(photo)
      domCache.lineCards.set(photo.id, card)
    }

    if (card.root.parentNode == null) {
      domCache.lineTrack.appendChild(card.root)
    }

    card.root.dataset.focused = String(photo.id === route.photoId)
    card.root.style.transform = `translate(${item.x}px, ${item.y}px)`
    card.root.style.width = `${item.width}px`
    card.root.style.height = `${item.height}px`
    card.root.style.opacity = photo.id === route.photoId ? '1' : '0.82'

    card.frame.style.width = `${item.width}px`
    card.frame.style.height = `${item.height}px`
  }
}

function createGridCardDom(photo: PhotoData): GridCardDom {
  const root = document.createElement('div')
  root.className = 'grid-card'

  const frame = document.createElement('div')
  frame.className = 'grid-frame'
  frame.dataset.gridPhotoId = photo.id

  const image = document.createElement('img')
  image.alt = photo.prompt
  image.src = getPhotoUrl(photo, 'low', usePlaceholderImages)
  image.draggable = false
  image.loading = 'lazy'
  frame.appendChild(image)

  const caption = document.createElement('div')
  caption.className = 'grid-caption'
  caption.dataset.gridCaptionPhotoId = photo.id
  caption.textContent = photo.prompt

  root.append(frame, caption)

  return {
    root,
    frame,
    image,
    caption,
  }
}

function createLineCardDom(photo: PhotoData): LineCardDom {
  const root = document.createElement('div')
  root.className = 'line-card'

  const frame = document.createElement('div')
  frame.className = 'line-frame'

  const image = document.createElement('img')
  image.alt = photo.prompt
  image.src = getPhotoUrl(photo, 'high', usePlaceholderImages)
  image.draggable = false
  frame.appendChild(image)

  root.appendChild(frame)

  return {
    root,
    frame,
    image,
  }
}

function parseRoute(hash: string, historyState: unknown): Route {
  if (historyState != null) {
    return historyState as Route
  }

  const params = new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash)
  const photoId = params.get('photo')

  if (typeof photoId === 'string' && photoId !== '') {
    return { type: 'line', photoId }
  }

  return { type: 'grid' }
}

function sanitizeRoute(route: Route): Route {
  if (route.type === 'grid') {
    return route
  }

  return getPhotoIndex(route.photoId) === -1 ? { type: 'grid' } : route
}

function encodeRoute(route: Route): string {
  const base = `${window.location.pathname}${window.location.search}`
  if (route.type === 'grid') {
    return base
  }

  return `${base}#photo=${encodeURIComponent(route.photoId)}`
}

function getPhotoIndex(photoId: string): number {
  return photoGalleryData.findIndex((photo) => photo.id === photoId)
}

function selectNodeText(node: Node): void {
  const selection = window.getSelection()
  if (selection == null) {
    return
  }

  const range = document.createRange()
  range.selectNodeContents(node)
  selection.removeAllRanges()
  selection.addRange(range)
}

async function runScenario(): Promise<void> {
  try {
    switch (state.scenario) {
      case 'hash-sync': {
        await waitForFrames(2)
        publishReadyReport({
          mode: state.route.type,
          focusedId: state.route.type === 'line' ? state.route.photoId : null,
          hash: window.location.hash,
        })
        return
      }
      case 'caption-selection': {
        const captionPhotoId = '7b5301ca-ef01-44bd-8bcc-4473c945aaaf/0_0'
        await waitForFrames(2)
        const card = domCache.gridCards.get(captionPhotoId)
        if (card == null || card.caption.parentNode == null) {
          throw new Error('Caption card missing for selection scenario')
        }

        clickElement(card.caption)
        await waitForFrames(2)
        publishReadyReport({
          mode: state.route.type,
          selectedText: window.getSelection()?.toString() ?? '',
          hash: window.location.hash,
        })
        return
      }
      case 'dismiss-restore': {
        const startPhotoId = '11048abd-2c7e-42de-929b-bad5d810b3a3/0_0'
        await scrollPhotoNearTop(startPhotoId, 96)
        await waitForFrames(2)

        const startCard = domCache.gridCards.get(startPhotoId)
        if (startCard == null || startCard.frame.parentNode == null) {
          throw new Error('Start photo missing for dismiss restore scenario')
        }

        clickElement(startCard.frame)
        await waitForCondition(() => state.route.type === 'line')

        clickOverlayAt(
          document.documentElement.clientWidth - 50,
          document.documentElement.clientHeight / 2,
        )
        await waitForFrames(2)

        const focusedId =
          state.route.type === 'line' ? state.route.photoId : null
        if (focusedId == null) {
          throw new Error('Expected focused photo after line navigation')
        }

        clickOverlayAt(
          document.documentElement.clientWidth / 2,
          document.documentElement.clientHeight / 2,
        )
        await waitForCondition(() => state.route.type === 'grid')

        publishReadyReport({
          mode: state.route.type,
          focusedId,
          restoreGap: state.dismissRestoreGap ?? undefined,
          hash: window.location.hash,
        })
        return
      }
      case 'occlusion': {
        const targetPhotoId = 'fb622e95-814d-4f74-8ac0-04d266c8387d/0_0'
        await scrollPhotoNearTop(targetPhotoId, 120)
        await waitForFrames(2)
        publishReadyReport({
          mode: state.route.type,
          mountedCount: state.mountedCount,
          totalCount: photoGalleryData.length,
          hash: window.location.hash,
        })
        return
      }
      default: {
        throw new Error(`Unknown scenario: ${state.scenario}`)
      }
    }
  } catch (error) {
    publishReport({
      phase: 'error',
      requestId: state.requestId,
      scenario: state.scenario,
      mode: state.route.type,
      focusedId: state.route.type === 'line' ? state.route.photoId : null,
      hash: window.location.hash,
      message: error instanceof Error ? error.message : String(error),
    })
  }
}

function publishReadyReport(
  fields: Omit<ScenarioReport, 'phase' | 'requestId' | 'scenario'>,
): void {
  publishReport({
    phase: 'ready',
    requestId: state.requestId,
    scenario: state.scenario,
    ...fields,
  })
}

function publishReport(report: ScenarioReport): void {
  domCache.reportNode.textContent = JSON.stringify(report)
}

function clickElement(element: HTMLElement): void {
  const rect = element.getBoundingClientRect()
  element.dispatchEvent(
    new MouseEvent('click', {
      bubbles: true,
      clientX: rect.left + rect.width / 2,
      clientY: rect.top + rect.height / 2,
    }),
  )
}

function clickOverlayAt(clientX: number, clientY: number): void {
  domCache.lineOverlay.dispatchEvent(
    new MouseEvent('click', {
      bubbles: true,
      clientX,
      clientY,
    }),
  )
}

async function scrollPhotoNearTop(photoId: string, gap: number): Promise<void> {
  const gridLayout = computeGridLayout(
    photoGalleryData,
    document.documentElement.clientWidth,
  )
  const item = findGridItem(gridLayout, photoId)
  if (item == null) {
    throw new Error(`Photo missing from grid layout: ${photoId}`)
  }

  const targetScrollTop = Math.max(0, item.y - gap)
  window.scrollTo({ top: targetScrollTop, behavior: 'instant' as ScrollBehavior })
  scheduleRender()
}

async function waitForFrames(count: number): Promise<void> {
  for (let index = 0; index < count; index += 1) {
    await new Promise<void>((resolve) => {
      window.requestAnimationFrame(() => resolve())
    })
  }
}

async function waitForCondition(
  condition: () => boolean,
  timeoutMs = 5_000,
): Promise<void> {
  const deadline = performance.now() + timeoutMs

  while (!condition()) {
    if (performance.now() > deadline) {
      throw new Error('Timed out waiting for scenario condition')
    }
    await waitForFrames(1)
  }
}

scheduleRender()
