import {
  getHighResPhotoUrl,
  getLowResPhotoUrl,
  photoGalleryData,
  type PhotoData,
} from './data'
import {
  GRID_CAPTION_HEIGHT,
  GRID_OVERSCAN,
  LINE_CAPTION_HEIGHT,
  SCENARIO_REPORT_NODE_ID,
  clamp,
  computeGridLayout,
  computeLineLayout,
  getFocusedPhotoHash,
  getMountedPhotoIds,
  parseFocusedPhotoHash,
  resolveLineClickAction,
  type GridLayout,
  type Route,
} from './gallery'

type ScenarioName =
  | ''
  | 'navigation-hash-sync'
  | 'dismiss-to-row'
  | 'caption-selection'
  | 'grid-occlusion'

type ScenarioReport = {
  phase: 'loading' | 'running' | 'ready' | 'error'
  requestId: string
  scenario: ScenarioName
  message?: string
} & Record<string, number | string | boolean | null>

type GridCardDom = {
  caption: HTMLDivElement
  image: HTMLImageElement
  imageButton: HTMLButtonElement
  root: HTMLArticleElement
}

type LineCardDom = {
  caption: HTMLFigcaptionElement
  image: HTMLImageElement
  root: HTMLFigureElement
}

type DomCache = {
  app: HTMLDivElement
  gridCards: Map<string, GridCardDom>
  gridRoot: HTMLDivElement
  lineCards: Map<string, LineCardDom>
  lineOverlay: HTMLDivElement
  report: HTMLScriptElement
}

type AppState = {
  events: {
    click: MouseEvent | null
  }
  lastGridLayout: GridLayout | null
  lastMountedPhotoIds: string[]
  requestId: string
  route: Route
  scenario: ScenarioName
  scenarioStarted: boolean
}

const NAVIGATION_SCENARIO_TARGET = photoGalleryData[10]!
const DISMISS_SCENARIO_TARGET = photoGalleryData[18]!
const CAPTION_SCENARIO_TARGET = photoGalleryData[5]!

const knownPhotoIds = new Set(photoGalleryData.map((photo) => photo.id))
const photoIndexById = new Map(photoGalleryData.map((photo, index) => [photo.id, index]))

const dom: DomCache = {
  app: requireElement('app', HTMLDivElement),
  gridCards: new Map(),
  gridRoot: requireElement('grid-root', HTMLDivElement),
  lineCards: new Map(),
  lineOverlay: requireElement('line-overlay', HTMLDivElement),
  report: requireElement(SCENARIO_REPORT_NODE_ID, HTMLScriptElement),
}

const st: AppState = {
  events: {
    click: null,
  },
  lastGridLayout: null,
  lastMountedPhotoIds: [],
  requestId: readRequestId(),
  route: parseFocusedPhotoHash(location.hash, knownPhotoIds),
  scenario: readScenario(),
  scenarioStarted: false,
}

let scheduledAnimationFrame: number | null = null

document.body.style.overflowX = 'hidden'
document.body.style.userSelect = 'auto'
document.body.style.webkitUserSelect = 'auto'

window.addEventListener('click', (event) => {
  st.events.click = event
  scheduleRender()
})
window.addEventListener('resize', () => scheduleRender())
window.addEventListener('scroll', () => scheduleRender(), {capture: true})
window.addEventListener('hashchange', () => scheduleRender())
window.addEventListener('popstate', () => scheduleRender())

if (st.scenario !== '' && st.requestId !== '') {
  publishReport({
    phase: 'loading',
    requestId: st.requestId,
    scenario: st.scenario,
  })
}

render()

if (st.scenario !== '' && st.requestId !== '') {
  st.scenarioStarted = true
  void runScenarioAndPublish()
}

function requireElement<T extends typeof HTMLElement>(
  id: string,
  ctor: T,
): InstanceType<T> {
  const element = document.getElementById(id)
  if (!(element instanceof ctor)) {
    throw new Error(`Expected #${id} to be a ${ctor.name}`)
  }
  return element as InstanceType<T>
}

function readScenario(): ScenarioName {
  const rawScenario = new URLSearchParams(location.search).get('scenario')
  switch (rawScenario) {
    case 'navigation-hash-sync':
    case 'dismiss-to-row':
    case 'caption-selection':
    case 'grid-occlusion':
      return rawScenario
    default:
      return ''
  }
}

function readRequestId(): string {
  return new URLSearchParams(location.search).get('requestId') ?? ''
}

function getScrollTop(): number {
  return Math.max(window.scrollY, document.documentElement.scrollTop, document.body.scrollTop)
}

function setScrollTop(scrollTop: number): void {
  window.scrollTo(0, scrollTop)
  document.documentElement.scrollTop = scrollTop
  document.body.scrollTop = scrollTop
}

function requireScrollingElement(): HTMLElement {
  const scrollingElement = document.scrollingElement
  if (!(scrollingElement instanceof HTMLElement)) {
    throw new Error('Expected a scrolling element for the page')
  }
  return scrollingElement
}

function scheduleRender(): void {
  if (scheduledAnimationFrame != null) return
  scheduledAnimationFrame = requestAnimationFrame(() => {
    scheduledAnimationFrame = null
    render()
  })
}

function render(): void {
  const viewportWidth = document.documentElement.clientWidth
  const viewportHeight = document.documentElement.clientHeight
  const scrollTop = getScrollTop()
  const routeFromHash = parseFocusedPhotoHash(location.hash, knownPhotoIds)

  let nextRoute = routeFromHash
  let shouldSyncHash = false
  let captionSelectionPhotoId: string | null = null
  const previousRoute = st.route

  if (st.events.click != null) {
    const clickedCaption = findClosestDataTarget(st.events.click.target, 'data-photo-caption-id')
    const clickedImage = findClosestDataTarget(st.events.click.target, 'data-photo-image-id')
    const clickedOverlay = findClosestDataTarget(st.events.click.target, 'data-line-overlay')

    if (previousRoute.type === 'grid' && clickedCaption != null) {
      captionSelectionPhotoId = clickedCaption.getAttribute('data-photo-caption-id')
      nextRoute = {type: 'grid'}
    } else if (previousRoute.type === 'grid' && clickedImage != null) {
      const photoId = clickedImage.getAttribute('data-photo-image-id')
      if (photoId != null && knownPhotoIds.has(photoId)) {
        nextRoute = {type: 'line', photoId}
        shouldSyncHash = true
      }
    } else if (previousRoute.type === 'line' && clickedOverlay != null) {
      const action = resolveLineClickAction({
        clientX: st.events.click.clientX,
        viewportWidth,
      })
      switch (action) {
        case 'prev': {
          const currentIndex = photoIndexById.get(previousRoute.photoId)
          if (currentIndex != null && currentIndex > 0) {
            nextRoute = {type: 'line', photoId: photoGalleryData[currentIndex - 1]!.id}
            shouldSyncHash = true
          } else {
            nextRoute = previousRoute
          }
          break
        }
        case 'next': {
          const currentIndex = photoIndexById.get(previousRoute.photoId)
          if (currentIndex != null && currentIndex < photoGalleryData.length - 1) {
            nextRoute = {type: 'line', photoId: photoGalleryData[currentIndex + 1]!.id}
            shouldSyncHash = true
          } else {
            nextRoute = previousRoute
          }
          break
        }
        case 'dismiss':
          nextRoute = {type: 'grid'}
          shouldSyncHash = true
          break
      }
    }
  }

  const layout = computeGridLayout({
    photos: photoGalleryData,
    viewportWidth,
  })
  const mountedPhotoIds = getMountedPhotoIds({
    layout,
    overscan: GRID_OVERSCAN,
    scrollTop,
    viewportHeight,
  })

  let restoreScrollTop: number | null = null
  if (previousRoute.type === 'line' && nextRoute.type === 'grid') {
    const focusedCard = layout.cardsById.get(previousRoute.photoId)
    if (focusedCard != null) {
      const rowTop = focusedCard.top
      const rowBottom = focusedCard.top + focusedCard.rowHeight
      if (rowTop < scrollTop + 40 || rowBottom > scrollTop + viewportHeight) {
        restoreScrollTop = clamp(rowTop - 40, 0, Math.max(0, layout.totalHeight - viewportHeight))
      }
    }
  }

  st.route = nextRoute
  st.lastGridLayout = layout
  st.lastMountedPhotoIds = mountedPhotoIds
  st.events.click = null

  dom.gridRoot.style.height = `${layout.totalHeight}px`
  requireScrollingElement().style.overflowY = nextRoute.type === 'line' ? 'hidden' : 'auto'
  document.body.style.overflowY = nextRoute.type === 'line' ? 'hidden' : 'auto'

  renderGrid(layout, mountedPhotoIds)
  renderLineOverlay(nextRoute, viewportWidth, viewportHeight)

  if (shouldSyncHash) {
    syncLocationToRoute(nextRoute)
  }
  if (restoreScrollTop != null) {
    setScrollTop(restoreScrollTop)
  }
  if (captionSelectionPhotoId != null) {
    selectCaptionText(captionSelectionPhotoId)
  }
}

function renderGrid(layout: GridLayout, mountedPhotoIds: string[]): void {
  const mountedPhotoIdSet = new Set(mountedPhotoIds)

  for (const photo of photoGalleryData) {
    const cardLayout = layout.cardsById.get(photo.id)!
    if (!mountedPhotoIdSet.has(photo.id)) continue

    let cardDom = dom.gridCards.get(photo.id)
    if (cardDom == null) {
      cardDom = createGridCardDom(photo)
      dom.gridCards.set(photo.id, cardDom)
    }
    if (cardDom.root.parentNode == null) {
      dom.gridRoot.appendChild(cardDom.root)
    }

    cardDom.root.style.width = `${cardLayout.cardWidth}px`
    cardDom.root.style.height = `${cardLayout.cardHeight}px`
    cardDom.root.style.transform = `translate3d(${cardLayout.left}px, ${cardLayout.top}px, 0)`
    cardDom.imageButton.style.height = `${cardLayout.imageHeight}px`
    cardDom.image.style.width = `${cardLayout.imageWidth}px`
    cardDom.image.style.height = `${cardLayout.imageHeight}px`
    cardDom.image.style.marginLeft = `${cardLayout.imageLeft}px`
    cardDom.image.style.marginRight = `${cardLayout.imageLeft}px`
  }

  for (const [photoId, cardDom] of dom.gridCards) {
    if (!mountedPhotoIdSet.has(photoId)) {
      cardDom.root.remove()
      dom.gridCards.delete(photoId)
    }
  }
}

function renderLineOverlay(route: Route, viewportWidth: number, viewportHeight: number): void {
  if (route.type === 'grid') {
    dom.lineOverlay.style.display = 'none'
    return
  }

  dom.lineOverlay.style.display = 'block'
  const lineLayout = computeLineLayout({
    focusedPhotoId: route.photoId,
    photos: photoGalleryData,
    viewportHeight,
    viewportWidth,
  })

  for (const photo of photoGalleryData) {
    const cardLayout = lineLayout.get(photo.id)
    let cardDom = dom.lineCards.get(photo.id)
    if (cardDom == null) {
      cardDom = createLineCardDom(photo)
      dom.lineCards.set(photo.id, cardDom)
    }
    if (cardDom.root.parentNode == null) {
      dom.lineOverlay.appendChild(cardDom.root)
    }

    if (cardLayout == null || isLineCardFarOutsideViewport(cardLayout, viewportWidth)) {
      cardDom.root.style.display = 'none'
      continue
    }

    cardDom.root.style.display = 'block'
    cardDom.root.style.width = `${cardLayout.cardWidth}px`
    cardDom.root.style.height = `${cardLayout.cardHeight}px`
    cardDom.root.style.transform = `translate3d(${cardLayout.left}px, ${cardLayout.top}px, 0) scale(${cardLayout.scale})`
    cardDom.root.style.zIndex = cardLayout.scale === 1 ? '3' : '2'
    cardDom.image.style.width = `${cardLayout.imageWidth}px`
    cardDom.image.style.height = `${cardLayout.imageHeight}px`
  }
}

function findClosestDataTarget(target: EventTarget | null, attribute: string): HTMLElement | null {
  if (!(target instanceof HTMLElement)) return null
  return target.closest<HTMLElement>(`[${attribute}]`)
}

function createGridCardDom(photo: PhotoData): GridCardDom {
  const root = document.createElement('article')
  root.dataset.gridCard = 'true'
  root.dataset.photoId = photo.id
  root.style.position = 'absolute'
  root.style.display = 'flex'
  root.style.flexDirection = 'column'
  root.style.borderRadius = '24px'
  root.style.overflow = 'hidden'
  root.style.background = 'var(--card-bg)'
  root.style.border = '1px solid var(--card-border)'
  root.style.boxShadow = '0 18px 40px rgba(1, 6, 18, 0.28)'

  const imageButton = document.createElement('button')
  imageButton.type = 'button'
  imageButton.dataset.photoImageId = photo.id
  imageButton.style.display = 'block'
  imageButton.style.width = '100%'
  imageButton.style.padding = '0'
  imageButton.style.border = '0'
  imageButton.style.background = 'transparent'
  imageButton.style.cursor = 'pointer'

  const image = document.createElement('img')
  image.alt = photo.prompt
  image.src = resolvePhotoUrl(photo, 'grid')
  image.loading = 'lazy'
  image.decoding = 'async'
  image.draggable = false
  image.style.display = 'block'
  image.style.objectFit = 'cover'
  image.style.borderRadius = '20px 20px 0 0'
  image.style.background = 'rgba(18, 28, 50, 0.9)'

  imageButton.appendChild(image)

  const caption = document.createElement('div')
  caption.dataset.photoCaptionId = photo.id
  caption.textContent = photo.prompt
  caption.style.boxSizing = 'border-box'
  caption.style.height = `${GRID_CAPTION_HEIGHT}px`
  caption.style.padding = '12px 14px 8px'
  caption.style.color = 'var(--caption-muted)'
  caption.style.fontSize = '14px'
  caption.style.lineHeight = '18px'
  caption.style.cursor = 'text'
  caption.style.userSelect = 'text'
  caption.style.webkitUserSelect = 'text'
  caption.style.display = '-webkit-box'
  caption.style.webkitLineClamp = '2'
  caption.style.webkitBoxOrient = 'vertical'
  caption.style.overflow = 'hidden'

  root.append(imageButton, caption)

  return {
    caption,
    image,
    imageButton,
    root,
  }
}

function createLineCardDom(photo: PhotoData): LineCardDom {
  const root = document.createElement('figure')
  root.style.position = 'absolute'
  root.style.margin = '0'
  root.style.pointerEvents = 'none'
  root.style.transformOrigin = 'center top'

  const image = document.createElement('img')
  image.alt = photo.prompt
  image.src = resolvePhotoUrl(photo, 'line')
  image.decoding = 'async'
  image.draggable = false
  image.style.display = 'block'
  image.style.borderRadius = '28px'
  image.style.boxShadow = '0 28px 80px rgba(0, 0, 0, 0.28)'
  image.style.objectFit = 'cover'
  image.style.background = 'rgba(18, 28, 50, 0.9)'

  const caption = document.createElement('figcaption')
  caption.textContent = photo.prompt
  caption.style.boxSizing = 'border-box'
  caption.style.height = `${LINE_CAPTION_HEIGHT}px`
  caption.style.padding = '16px 18px 8px'
  caption.style.color = 'var(--caption)'
  caption.style.fontSize = '18px'
  caption.style.lineHeight = '22px'
  caption.style.textAlign = 'center'
  caption.style.display = '-webkit-box'
  caption.style.webkitLineClamp = '3'
  caption.style.webkitBoxOrient = 'vertical'
  caption.style.overflow = 'hidden'
  caption.style.textWrap = 'pretty'

  root.append(image, caption)

  return {
    caption,
    image,
    root,
  }
}

function resolvePhotoUrl(photo: PhotoData, mode: 'grid' | 'line'): string {
  if (st.scenario !== '') {
    return makeScenarioPlaceholderUrl(photo, mode)
  }
  return mode === 'grid' ? getLowResPhotoUrl(photo.id) : getHighResPhotoUrl(photo.id)
}

function makeScenarioPlaceholderUrl(photo: PhotoData, mode: 'grid' | 'line'): string {
  const hue = hashTextToHue(photo.id)
  const promptLine = escapeSvgText(photo.prompt.slice(0, 68))
  const label = mode === 'grid' ? 'grid' : 'focus'
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 900">
      <defs>
        <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stop-color="hsl(${hue} 55% 56%)" />
          <stop offset="100%" stop-color="hsl(${(hue + 42) % 360} 68% 34%)" />
        </linearGradient>
      </defs>
      <rect width="1200" height="900" fill="url(#bg)" />
      <rect x="54" y="54" width="1092" height="792" rx="48" fill="rgba(6,12,26,0.18)" stroke="rgba(255,255,255,0.18)" />
      <text x="90" y="126" fill="rgba(255,255,255,0.86)" font-family="Avenir Next, Helvetica Neue, sans-serif" font-size="34">${label.toUpperCase()}</text>
      <text x="90" y="200" fill="rgba(255,255,255,0.96)" font-family="Avenir Next, Helvetica Neue, sans-serif" font-size="56">${promptLine}</text>
    </svg>
  `
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

function escapeSvgText(text: string): string {
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
}

function hashTextToHue(text: string): number {
  let hash = 0
  for (let index = 0; index < text.length; index += 1) {
    hash = Math.imul(hash + text.charCodeAt(index), 0x9e3779b9)
  }
  return Math.abs(hash % 360)
}

function isLineCardFarOutsideViewport(cardLayout: {
  cardWidth: number
  left: number
  scale: number
}, viewportWidth: number): boolean {
  const scaledWidth = cardLayout.cardWidth * cardLayout.scale
  const visualLeft = cardLayout.left + (cardLayout.cardWidth - scaledWidth) / 2
  const visualRight = visualLeft + scaledWidth
  return visualRight < -240 || visualLeft > viewportWidth + 240
}

function syncLocationToRoute(route: Route): void {
  const nextHash = route.type === 'line' ? getFocusedPhotoHash(route.photoId) : ''
  if (location.hash === nextHash) return
  const url = `${location.pathname}${location.search}${nextHash}`
  history.pushState(null, '', url)
}

function selectCaptionText(photoId: string): void {
  const cardDom = dom.gridCards.get(photoId)
  if (cardDom == null) return
  const selection = window.getSelection()
  if (selection == null) return
  const range = document.createRange()
  range.selectNodeContents(cardDom.caption)
  selection.removeAllRanges()
  selection.addRange(range)
}

function publishReport(report: ScenarioReport): void {
  dom.report.textContent = JSON.stringify(report)
}

async function runScenarioAndPublish(): Promise<void> {
  publishReport({
    phase: 'running',
    requestId: st.requestId,
    scenario: st.scenario,
  })
  await afterPaint()

  try {
    switch (st.scenario) {
      case 'navigation-hash-sync': {
        const report = await runNavigationHashSyncScenario()
        publishReport({
          ...report,
          phase: 'ready',
          requestId: st.requestId,
          scenario: st.scenario,
        })
        return
      }
      case 'dismiss-to-row': {
        const report = await runDismissToRowScenario()
        publishReport({
          ...report,
          phase: 'ready',
          requestId: st.requestId,
          scenario: st.scenario,
        })
        return
      }
      case 'caption-selection': {
        const report = await runCaptionSelectionScenario()
        publishReport({
          ...report,
          phase: 'ready',
          requestId: st.requestId,
          scenario: st.scenario,
        })
        return
      }
      case 'grid-occlusion': {
        const report = await runGridOcclusionScenario()
        publishReport({
          ...report,
          phase: 'ready',
          requestId: st.requestId,
          scenario: st.scenario,
        })
        return
      }
      case '':
        return
    }
  } catch (error) {
    publishReport({
      phase: 'error',
      message: error instanceof Error ? error.message : 'Unknown scenario error',
      requestId: st.requestId,
      scenario: st.scenario,
    })
  }
}

async function runNavigationHashSyncScenario(): Promise<Record<string, boolean | string | null>> {
  setScrollTop(0)
  scheduleRender()
  await afterPaint()

  const cardDom = dom.gridCards.get(NAVIGATION_SCENARIO_TARGET.id)
  if (cardDom == null) {
    throw new Error('Navigation scenario target card is not mounted')
  }

  dispatchClick(cardDom.imageButton)
  await afterPaint()

  return {
    focusedId: st.route.type === 'line' ? st.route.photoId : null,
    hash: location.hash,
    lineModeOpen: st.route.type === 'line',
    scrollLockActive: getComputedStyle(requireScrollingElement()).overflowY === 'hidden',
  }
}

async function runDismissToRowScenario(): Promise<Record<string, boolean | number | string | null>> {
  setScrollTop(0)
  scheduleRender()
  await afterPaint()

  history.pushState(null, '', `${location.pathname}${location.search}${getFocusedPhotoHash(DISMISS_SCENARIO_TARGET.id)}`)
  scheduleRender()
  await afterPaint()

  dispatchClick(dom.lineOverlay, document.documentElement.clientWidth / 2, document.documentElement.clientHeight / 2)
  await afterPaint()
  await afterPaint()

  const layout = st.lastGridLayout
  if (layout == null) {
    throw new Error('Dismiss scenario did not compute grid layout')
  }
  const card = layout.cardsById.get(DISMISS_SCENARIO_TARGET.id)
  if (card == null) {
    throw new Error('Dismiss scenario target is missing from the grid layout')
  }

  const scrollTop = getScrollTop()
  const rowTopGap = card.top - scrollTop
  const rowBottom = card.top + card.rowHeight

  return {
    hash: location.hash,
    lineModeOpen: st.route.type === 'line',
    restoredRowInView: card.top >= scrollTop && rowBottom <= scrollTop + document.documentElement.clientHeight,
    restoredRowTopGap: rowTopGap,
  }
}

async function runCaptionSelectionScenario(): Promise<Record<string, boolean | string>> {
  setScrollTop(0)
  scheduleRender()
  await afterPaint()

  const cardDom = dom.gridCards.get(CAPTION_SCENARIO_TARGET.id)
  if (cardDom == null) {
    throw new Error('Caption scenario target card is not mounted')
  }

  dispatchClick(cardDom.caption)
  await afterPaint()

  return {
    hash: location.hash,
    lineModeOpen: st.route.type === 'line',
    selectedText: window.getSelection()?.toString() ?? '',
  }
}

async function runGridOcclusionScenario(): Promise<Record<string, number>> {
  const layout = st.lastGridLayout
  if (layout == null) {
    throw new Error('Occlusion scenario did not compute grid layout')
  }
  const middleRowIndex = Math.min(layout.rowTops.length - 1, Math.floor(layout.rowTops.length / 2))
  const middleRowTop = layout.rowTops[middleRowIndex] ?? 0

  setScrollTop(Math.max(0, middleRowTop - 80))
  scheduleRender()
  await afterPaint()

  return {
    mountedCount: st.lastMountedPhotoIds.length,
    totalCount: photoGalleryData.length,
  }
}

function dispatchClick(target: HTMLElement, clientX?: number, clientY?: number): void {
  const rect = target.getBoundingClientRect()
  target.dispatchEvent(
    new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      clientX: clientX ?? rect.left + rect.width / 2,
      clientY: clientY ?? rect.top + rect.height / 2,
      view: window,
    }),
  )
}

async function afterPaint(): Promise<void> {
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve())
    })
  })
}
