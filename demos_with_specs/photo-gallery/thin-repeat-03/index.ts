import {
  buildGridLayout,
  classifyPhotoShape,
  getBoxHeight,
  getLineClickAction,
  getLowResImageUrl,
  getVisibleRowRange,
  photoGalleryData,
  type GridCardLayout,
  type GridLayout,
  type PhotoData,
} from './gallery-model'

const sidePadding = 32
const gridGap = 24
const topPadding = 40
const maxColumns = 7
const minTargetCardWidth = 220
const lineLeftStrip = 100
const lineRightStrip = 100
const lineNeighborScale = 0.7
const lineGap = 52
const lineBottomGap = 28
const gridCaptionVisibleHeight = 44
const gridCaptionBottomGap = 8
const lineCaptionVisibleHeight = 64
const lineCaptionBottomGap = 8

type Route =
  | {type: 'grid'}
  | {type: 'line'; focusedId: string}

type PendingClick = {
  clientX: number
  clientY: number
  target: EventTarget | null
}

type ScenarioReport = {
  phase: 'loading' | 'running' | 'ready' | 'error'
  requestId: string
  scenario: string
  hash: string
  mode: 'grid' | 'line'
  focusedId: string | null
  selectedText: string | null
  mountedCount: number
  totalCount: number
  restoreGap: number | null
  initialFocusedId: string | null
  nextFocusedId: string | null
  focusedRowTop: number | null
  message?: string
}

type GridCardDom = {
  container: HTMLDivElement
  imageHit: HTMLDivElement
  image: HTMLImageElement
  caption: HTMLDivElement
}

type LineItemDom = {
  container: HTMLDivElement
  frame: HTMLDivElement
  image: HTMLImageElement
  caption: HTMLDivElement
}

const rootElement = document.getElementById('gallery-root')
const gridLayerElement = document.getElementById('grid-layer')
const lineOverlayElement = document.getElementById('line-overlay')
const reportNodeElement = document.getElementById('scenario-report')

if (!(rootElement instanceof HTMLDivElement)) throw new Error('Missing #gallery-root')
if (!(gridLayerElement instanceof HTMLDivElement)) throw new Error('Missing #grid-layer')
if (!(lineOverlayElement instanceof HTMLDivElement)) throw new Error('Missing #line-overlay')
if (!(reportNodeElement instanceof HTMLScriptElement)) throw new Error('Missing #scenario-report')

const gridLayer = gridLayerElement
const lineOverlay = lineOverlayElement
const reportNode = reportNodeElement

const photoIndexById = new Map<string, number>()
for (let index = 0; index < photoGalleryData.length; index++) {
  photoIndexById.set(photoGalleryData[index]!.id, index)
}

const params = new URLSearchParams(window.location.search)
const scenarioRequest =
  params.get('scenario') != null && params.get('requestId') != null
    ? {scenario: params.get('scenario')!, requestId: params.get('requestId')!}
    : null

const state = {
  route: parseRoute(window.location.hash, window.history.state),
  pendingClick: null as PendingClick | null,
  scheduledRender: 0,
  pendingSelectionCaptionId: null as string | null,
  pendingRestorePhotoId: null as string | null,
  lastRestoreGap: null as number | null,
  lastLayout: null as GridLayout | null,
  scenarioStarted: false,
}

const domCache = {
  gridCards: new Map<string, GridCardDom>(),
  lineItems: new Map<string, LineItemDom>(),
  leftStrip: createStrip('line-strip line-strip-left'),
  middleStrip: createStrip('line-strip line-strip-middle'),
  rightStrip: createStrip('line-strip line-strip-right'),
}

const lineScrim = document.createElement('div')
lineScrim.className = 'line-scrim'
lineOverlay.appendChild(lineScrim)
lineOverlay.appendChild(domCache.leftStrip)
lineOverlay.appendChild(domCache.middleStrip)
lineOverlay.appendChild(domCache.rightStrip)

publishPhase('loading')

window.addEventListener('resize', scheduleRender)
window.addEventListener(
  'scroll',
  () => {
    scheduleRender()
  },
  true,
)
window.addEventListener('click', (event) => {
  state.pendingClick = {
    clientX: event.clientX,
    clientY: event.clientY,
    target: event.target,
  }
  scheduleRender()
})
window.addEventListener('popstate', (event) => {
  state.route = parseRoute(window.location.hash, event.state)
  scheduleRender()
})

scheduleRender()

if (scenarioRequest != null) {
  void waitForFrames(2).then(runScenario)
}

function scheduleRender() {
  if (state.scheduledRender !== 0) return
  state.scheduledRender = window.requestAnimationFrame(render)
}

function render() {
  state.scheduledRender = 0

  const viewportWidth = document.documentElement.clientWidth
  const viewportHeight = document.documentElement.clientHeight
  const scrollY = window.scrollY
  const layout = buildGridLayout({
    photos: photoGalleryData,
    viewportWidth,
    sidePadding,
    topPadding,
    gap: gridGap,
    gridCaptionVisibleHeight,
    gridCaptionBottomGap,
    maxColumns,
    minTargetCardWidth,
  })
  state.lastLayout = layout

  let nextRoute = state.route
  let nextSelectionCaptionId = state.pendingSelectionCaptionId
  let nextRestorePhotoId = state.pendingRestorePhotoId

  const pendingClick = state.pendingClick
  if (pendingClick != null) {
    switch (state.route.type) {
      case 'grid': {
        const clickTarget = getElementTarget(pendingClick.target)
        const captionId = clickTarget?.closest('[data-grid-caption-id]')?.getAttribute('data-grid-caption-id')
        if (captionId != null && photoIndexById.has(captionId)) {
          nextSelectionCaptionId = captionId
        } else {
          const imageId = clickTarget?.closest('[data-grid-image-id]')?.getAttribute('data-grid-image-id')
          if (imageId != null && photoIndexById.has(imageId)) {
            nextRoute = {type: 'line', focusedId: imageId}
          }
        }
        break
      }
      case 'line': {
        const action = getLineClickAction({
          clientX: pendingClick.clientX,
          viewportWidth,
          sideStripWidth: lineLeftStrip,
        })
        const currentPhotoIndex = photoIndexById.get(state.route.focusedId)
        if (currentPhotoIndex == null) {
          nextRoute = {type: 'grid'}
          break
        }
        switch (action) {
          case 'previous':
            if (currentPhotoIndex > 0) {
              nextRoute = {type: 'line', focusedId: photoGalleryData[currentPhotoIndex - 1]!.id}
            }
            break
          case 'next':
            if (currentPhotoIndex < photoGalleryData.length - 1) {
              nextRoute = {type: 'line', focusedId: photoGalleryData[currentPhotoIndex + 1]!.id}
            }
            break
          case 'dismiss':
            nextRoute = {type: 'grid'}
            nextRestorePhotoId = state.route.focusedId
            break
        }
        break
      }
    }
  }

  state.pendingClick = null
  state.pendingSelectionCaptionId = null

  if (!routesEqual(nextRoute, state.route)) {
    state.route = nextRoute
    const hash = encodeRouteHash(nextRoute)
    const nextUrl = `${window.location.pathname}${window.location.search}${hash}`
    window.history.pushState(nextRoute, '', nextUrl)
  }

  renderGrid(layout, scrollY, viewportHeight)
  renderLineOverlay(viewportWidth, viewportHeight)
  document.body.style.overflowY = 'auto'

  if (nextSelectionCaptionId != null) {
    selectCaptionText(nextSelectionCaptionId)
  }

  if (nextRestorePhotoId != null && state.route.type === 'grid') {
    const card = layout.cards[photoIndexById.get(nextRestorePhotoId) ?? -1]
    if (card != null) {
      const restoreTop = Math.max(0, card.y - 40)
      window.scrollTo(0, restoreTop)
      state.lastRestoreGap = card.y - restoreTop
      nextRestorePhotoId = null
    }
  } else {
    state.lastRestoreGap = null
  }

  state.pendingRestorePhotoId = nextRestorePhotoId
}

function renderGrid(layout: GridLayout, scrollY: number, viewportHeight: number) {
  gridLayer.style.height = `${layout.totalHeight + Math.max(0, viewportHeight - topPadding)}px`

  const visibleRows =
    getVisibleRowRange({
      rows: layout.rows,
      scrollY,
      viewportHeight,
      overscanRows: 0,
    })

  const visibleIds = new Set<string>()
  for (let rowIndex = visibleRows.startRowIndex; rowIndex <= visibleRows.endRowIndex; rowIndex++) {
    const row = layout.rows[rowIndex]
    if (row == null) continue
    for (let photoIndex = row.startPhotoIndex; photoIndex <= row.endPhotoIndex; photoIndex++) {
      const cardLayout = layout.cards[photoIndex]
      if (cardLayout == null) continue
      visibleIds.add(cardLayout.photo.id)
      const cardDom = getOrCreateGridCard(cardLayout.photo)
      projectGridCard(cardDom, cardLayout)
      if (cardDom.container.parentNode == null) {
        gridLayer.appendChild(cardDom.container)
      }
    }
  }

  for (const [photoId, cardDom] of domCache.gridCards) {
    if (!visibleIds.has(photoId)) {
      cardDom.container.remove()
    }
  }
}

function renderLineOverlay(viewportWidth: number, viewportHeight: number) {
  if (state.route.type !== 'line') {
    lineOverlay.style.display = 'none'
    for (const [, lineItem] of domCache.lineItems) {
      lineItem.container.remove()
    }
    return
  }

  lineOverlay.style.display = 'block'

  const focusedPhotoIndex = photoIndexById.get(state.route.focusedId)
  if (focusedPhotoIndex == null) {
    return
  }

  const lineBoxMaxSizeX = Math.min(
    520,
    Math.max(220, viewportWidth - lineLeftStrip - lineRightStrip - 180),
    Math.max(220, (viewportHeight - 180 - lineCaptionVisibleHeight - lineBottomGap) / 1.05),
  )
  const visibleIds = new Set<string>()
  const lineLayouts = buildLineLayouts({
    focusedPhotoIndex,
    viewportWidth,
    viewportHeight,
    lineBoxMaxSizeX,
  })

  for (const lineLayout of lineLayouts) {
    if (lineLayout.x + lineLayout.width < -220) continue
    if (lineLayout.x > viewportWidth + 220) continue
    visibleIds.add(lineLayout.photo.id)
    const lineItem = getOrCreateLineItem(lineLayout.photo)
    projectLineItem(lineItem, lineLayout)
    if (lineItem.container.parentNode == null) {
      lineOverlay.appendChild(lineItem.container)
    }
  }

  for (const [photoId, lineItem] of domCache.lineItems) {
    if (!visibleIds.has(photoId)) {
      lineItem.container.remove()
    }
  }
}

function getOrCreateGridCard(photo: PhotoData) {
  const cached = domCache.gridCards.get(photo.id)
  if (cached != null) return cached

  const container = document.createElement('div')
  container.className = 'grid-card'

  const frame = document.createElement('div')
  frame.className = 'grid-card-frame'

  const imageHit = document.createElement('div')
  imageHit.className = 'grid-card-image-hit'
  imageHit.setAttribute('data-grid-image-id', photo.id)

  const image = document.createElement('img')
  image.className = 'grid-card-image'
  image.alt = photo.prompt
  image.draggable = false
  image.src = getImageUrl(photo)

  const caption = document.createElement('div')
  caption.className = 'grid-card-caption'
  caption.textContent = photo.prompt
  caption.setAttribute('data-grid-caption-id', photo.id)

  imageHit.appendChild(image)
  container.appendChild(frame)
  container.appendChild(imageHit)
  container.appendChild(caption)

  const cardDom = {container, imageHit, image, caption}
  domCache.gridCards.set(photo.id, cardDom)
  return cardDom
}

function getOrCreateLineItem(photo: PhotoData) {
  const cached = domCache.lineItems.get(photo.id)
  if (cached != null) return cached

  const container = document.createElement('div')
  container.className = 'line-item'

  const frame = document.createElement('div')
  frame.className = 'line-item-frame'

  const image = document.createElement('img')
  image.className = 'line-item-image'
  image.alt = photo.prompt
  image.draggable = false
  image.src = getImageUrl(photo)

  const caption = document.createElement('div')
  caption.className = 'line-item-caption'
  caption.textContent = photo.prompt

  frame.appendChild(image)
  container.appendChild(frame)
  container.appendChild(caption)

  const lineItem = {container, frame, image, caption}
  domCache.lineItems.set(photo.id, lineItem)
  return lineItem
}

function projectGridCard(cardDom: GridCardDom, cardLayout: GridCardLayout) {
  cardDom.container.style.left = `${cardLayout.x}px`
  cardDom.container.style.top = `${cardLayout.y}px`
  cardDom.container.style.width = `${cardLayout.width}px`
  cardDom.container.style.height = `${cardLayout.totalHeight}px`

  cardDom.imageHit.style.height = `${cardLayout.boxHeight}px`
  cardDom.caption.style.top = `${cardLayout.boxHeight + 8}px`
  cardDom.caption.style.height = `${gridCaptionVisibleHeight}px`
}

function projectLineItem(
  lineItem: LineItemDom,
  lineLayout: {
    photo: PhotoData
    x: number
    y: number
    width: number
    height: number
    captionY: number
  },
) {
  lineItem.container.style.left = `${lineLayout.x}px`
  lineItem.container.style.top = `${lineLayout.y}px`
  lineItem.container.style.width = `${lineLayout.width}px`
  lineItem.container.style.height = `${lineLayout.height + lineCaptionVisibleHeight + lineCaptionBottomGap}px`
  lineItem.frame.style.width = `${lineLayout.width}px`
  lineItem.frame.style.height = `${lineLayout.height}px`
  lineItem.caption.style.top = `${lineLayout.captionY - lineLayout.y}px`
  lineItem.caption.style.height = `${lineCaptionVisibleHeight}px`
}

function buildLineLayouts(args: {
  focusedPhotoIndex: number
  viewportWidth: number
  viewportHeight: number
  lineBoxMaxSizeX: number
}) {
  const layouts: Array<{
    photo: PhotoData
    x: number
    y: number
    width: number
    height: number
    captionY: number
  }> = []
  const widths = photoGalleryData.map((_, photoIndex) => {
    const scale = photoIndex === args.focusedPhotoIndex ? 1 : lineNeighborScale
    return args.lineBoxMaxSizeX * scale
  })
  const heights = photoGalleryData.map((photo, photoIndex) => {
    const scale = photoIndex === args.focusedPhotoIndex ? 1 : lineNeighborScale
    return getBoxHeight(args.lineBoxMaxSizeX * scale, classifyPhotoShape(photo))
  })
  const focusedWidth = widths[args.focusedPhotoIndex]!
  const focusedX = args.viewportWidth / 2 - focusedWidth / 2
  const xs = new Array<number>(photoGalleryData.length)
  xs[args.focusedPhotoIndex] = focusedX

  for (let photoIndex = args.focusedPhotoIndex - 1; photoIndex >= 0; photoIndex--) {
    xs[photoIndex] = xs[photoIndex + 1]! - lineGap - widths[photoIndex]!
  }
  for (let photoIndex = args.focusedPhotoIndex + 1; photoIndex < photoGalleryData.length; photoIndex++) {
    xs[photoIndex] = xs[photoIndex - 1]! + widths[photoIndex - 1]! + lineGap
  }

  for (let photoIndex = 0; photoIndex < photoGalleryData.length; photoIndex++) {
    const photo = photoGalleryData[photoIndex]!
    const height = heights[photoIndex]!
    const y = Math.max(32, (args.viewportHeight - height - lineCaptionVisibleHeight - lineBottomGap) / 2)
    layouts.push({
      photo,
      x: xs[photoIndex]!,
      y,
      width: widths[photoIndex]!,
      height,
      captionY: y + height + 8,
    })
  }

  return layouts
}

function selectCaptionText(photoId: string) {
  const cardDom = domCache.gridCards.get(photoId)
  if (cardDom == null) return
  const selection = window.getSelection()
  if (selection == null) return
  const range = document.createRange()
  range.selectNodeContents(cardDom.caption)
  selection.removeAllRanges()
  selection.addRange(range)
}

function getImageUrl(photo: PhotoData) {
  if (scenarioRequest != null) {
    return makeScenarioImageUrl(photo)
  }
  return getLowResImageUrl(photo)
}

function makeScenarioImageUrl(photo: PhotoData) {
  const photoIndex = photoIndexById.get(photo.id) ?? 0
  const hue = Math.round(lowBiasHash(photoIndex + 1) * 360)
  const shape = classifyPhotoShape(photo)
  const label = `${shape.toUpperCase()} ${photoIndex + 1}`
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600">
      <defs>
        <linearGradient id="g" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stop-color="hsl(${hue} 66% 72%)" />
          <stop offset="100%" stop-color="hsl(${(hue + 60) % 360} 72% 50%)" />
        </linearGradient>
      </defs>
      <rect width="600" height="600" fill="url(#g)" />
      <circle cx="140" cy="120" r="72" fill="rgba(255,255,255,0.22)" />
      <circle cx="490" cy="460" r="118" fill="rgba(0,0,0,0.16)" />
      <text x="48" y="488" fill="white" font-size="58" font-family="Georgia, serif">${label}</text>
    </svg>
  `
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

function lowBiasHash(n: number) {
  n = Math.imul((n >>> 16) ^ n, 0x21f0aaad)
  n = Math.imul((n >>> 15) ^ n, 0x735a2d97)
  return (((n >>> 15) ^ n) >>> 0) / 0x100000000
}

function parseRoute(hash: string, historyState: unknown): Route {
  if (historyState != null && isRoute(historyState)) {
    return historyState
  }

  const rawHash = hash.startsWith('#') ? hash.slice(1) : hash
  const hashParams = new URLSearchParams(rawHash)
  const focusedId = hashParams.get('photo')
  if (focusedId == null || !photoIndexById.has(focusedId)) {
    return {type: 'grid'}
  }
  return {type: 'line', focusedId}
}

function isRoute(value: unknown): value is Route {
  if (typeof value !== 'object' || value == null) return false
  if (!('type' in value)) return false
  if (value.type === 'grid') return true
  return value.type === 'line' && 'focusedId' in value && typeof value.focusedId === 'string' && photoIndexById.has(value.focusedId)
}

function encodeRouteHash(route: Route) {
  switch (route.type) {
    case 'grid':
      return ''
    case 'line':
      return `#photo=${encodeURIComponent(route.focusedId)}`
  }
}

function routesEqual(a: Route, b: Route) {
  if (a.type !== b.type) return false
  if (a.type === 'grid') return true
  if (b.type === 'grid') return false
  return a.focusedId === b.focusedId
}

function getElementTarget(target: EventTarget | null) {
  return target instanceof Element ? target : null
}

function createStrip(className: string) {
  const strip = document.createElement('div')
  strip.className = className
  return strip
}

function publishPhase(phase: ScenarioReport['phase'], fields: Partial<ScenarioReport> = {}) {
  if (scenarioRequest == null) return

  const selectedText = window.getSelection()?.toString() ?? ''
  const report: ScenarioReport = {
    phase,
    requestId: scenarioRequest.requestId,
    scenario: scenarioRequest.scenario,
    hash: window.location.hash,
    mode: state.route.type,
    focusedId: state.route.type === 'line' ? state.route.focusedId : null,
    selectedText: selectedText === '' ? null : selectedText,
    mountedCount: countMountedGridCards(),
    totalCount: photoGalleryData.length,
    restoreGap: state.lastRestoreGap,
    initialFocusedId: null,
    nextFocusedId: null,
    focusedRowTop: null,
    ...fields,
  }
  reportNode.textContent = JSON.stringify(report)
}

async function runScenario() {
  if (scenarioRequest == null || state.scenarioStarted) return
  state.scenarioStarted = true
  publishPhase('running')

  try {
    switch (scenarioRequest.scenario) {
      case 'hash-sync':
        await runHashSyncScenario()
        break
      case 'caption-selection':
        await runCaptionSelectionScenario()
        break
      case 'dismiss-restore':
        await runDismissRestoreScenario()
        break
      case 'occlusion':
        await runOcclusionScenario()
        break
      default:
        throw new Error(`Unknown scenario: ${scenarioRequest.scenario}`)
    }
  } catch (error) {
    publishPhase('error', {
      message: error instanceof Error ? error.message : String(error),
    })
  }
}

async function runHashSyncScenario() {
  const expectedFirstId = photoGalleryData[0]!.id
  const expectedNextId = photoGalleryData[1]!.id
  await waitFor(() => state.route.type === 'line' && state.route.focusedId === expectedFirstId, 'hash-sync initial route')

  const initialFocusedId = state.route.type === 'line' ? state.route.focusedId : null
  dispatchWindowClick(window.innerWidth - 12, window.innerHeight / 2)
  await waitFor(() => state.route.type === 'line' && state.route.focusedId === expectedNextId, 'hash-sync next route')

  publishPhase('ready', {
    initialFocusedId,
    nextFocusedId: state.route.type === 'line' ? state.route.focusedId : null,
  })
}

async function runCaptionSelectionScenario() {
  window.scrollTo(0, 0)
  await waitForFrames(2)

  const targetPhoto = photoGalleryData[3]!
  const targetCard = domCache.gridCards.get(targetPhoto.id)
  if (targetCard == null) throw new Error('Target caption is not mounted')
  clickElementCenter(targetCard.caption)
  await waitFor(() => window.getSelection()?.toString() === targetPhoto.prompt, 'caption-selection selected text')

  publishPhase('ready')
}

async function runDismissRestoreScenario() {
  const targetPhoto = photoGalleryData[17]!
  await waitFor(() => state.lastLayout != null, 'dismiss-restore initial layout')
  const card = state.lastLayout!.cards[photoIndexById.get(targetPhoto.id) ?? -1]
  if (card == null) throw new Error('Missing target card layout')
  window.scrollTo(0, Math.max(0, card.y - 120))
  await waitForFrames(2)

  const mountedCard = domCache.gridCards.get(targetPhoto.id)
  if (mountedCard == null) throw new Error('Target card is not mounted')
  clickElementCenter(mountedCard.imageHit)
  await waitFor(() => state.route.type === 'line' && state.route.focusedId === targetPhoto.id, 'dismiss-restore entered line mode')

  dispatchWindowClick(window.innerWidth / 2, window.innerHeight / 2)
  await waitFor(() => state.route.type === 'grid' && state.pendingRestorePhotoId == null, 'dismiss-restore returned to grid')

  await waitFor(() => {
    const restored = state.lastLayout?.cards[photoIndexById.get(targetPhoto.id) ?? -1]
    return restored != null && Math.abs((restored.y - window.scrollY) - 40) <= 3
  }, 'dismiss-restore gap settled')

  const restoredCard = state.lastLayout?.cards[photoIndexById.get(targetPhoto.id) ?? -1]
  if (restoredCard == null) throw new Error('Missing restored card layout')
  const focusedRowTop = restoredCard.y - window.scrollY

  publishPhase('ready', {
    restoreGap: focusedRowTop,
    focusedRowTop,
    message: targetPhoto.id,
  })
}

async function runOcclusionScenario() {
  await waitFor(() => state.lastLayout != null, 'occlusion initial layout')
  const targetScroll = Math.max(0, state.lastLayout!.totalHeight / 2 - window.innerHeight / 2)
  window.scrollTo(0, targetScroll)
  await waitForFrames(3)

  publishPhase('ready')
}

async function waitFor(predicate: () => boolean, label: string) {
  const deadline = Date.now() + 8_000
  while (Date.now() < deadline) {
    if (predicate()) return
    await waitForFrames(1)
  }
  throw new Error(`Scenario timed out waiting for page state: ${label}`)
}

async function waitForFrames(count: number) {
  for (let frame = 0; frame < count; frame++) {
    await new Promise<void>((resolve) => {
      window.requestAnimationFrame(() => resolve())
    })
  }
}

function clickElementCenter(element: Element) {
  const rect = element.getBoundingClientRect()
  dispatchElementClick(element, rect.left + rect.width / 2, rect.top + rect.height / 2)
}

function dispatchWindowClick(clientX: number, clientY: number) {
  dispatchElementClick(window, clientX, clientY)
}

function dispatchElementClick(target: EventTarget, clientX: number, clientY: number) {
  const event = new MouseEvent('click', {
    bubbles: true,
    cancelable: true,
    clientX,
    clientY,
  })
  target.dispatchEvent(event)
}

function countMountedGridCards() {
  let mountedCount = 0
  for (const [, card] of domCache.gridCards) {
    if (card.container.parentNode != null) mountedCount++
  }
  return mountedCount
}
