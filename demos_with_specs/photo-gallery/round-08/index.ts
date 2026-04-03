import {
  getHighResImageUrl,
  getLowResImageUrl,
  photoGalleryData,
  type PhotoData,
} from './data'
import {
  computeGridLayout,
  computeLineLayout,
  formatFocusedHash,
  getScrollAnchorIndex,
  getVisibleGridIndices,
  parseFocusedHash,
  routeLineModeHitArea,
} from './galleryModel'

type NavHover = 'prev' | 'next' | null

type ScenarioReport = {
  phase: 'loading' | 'running' | 'ready' | 'error'
  requestId: string
  scenario: string
  status?: 'ok' | 'error'
  data?: unknown
  message?: string
}

type AppState = {
  viewportWidth: number
  viewportHeight: number
  scrollTop: number
  focusedIndex: number | null
  lockedScrollTop: number | null
  navHover: NavHover
}

const app = document.querySelector<HTMLDivElement>('#app')
const reportNode = document.querySelector<HTMLScriptElement>('#scenario-report')
const debugNode = document.querySelector<HTMLPreElement>('#scenario-debug')

if (app == null || reportNode == null || debugNode == null) {
  throw new Error('Photo gallery root nodes are missing')
}

const searchParams = new URLSearchParams(window.location.search)
const isReportMode = searchParams.get('report') === '1'
const scenarioName = searchParams.get('scenario') ?? ''
const requestId = searchParams.get('requestId') ?? ''
const blankImageUrl = 'data:image/gif;base64,R0lGODlhAQABAAAAACw='

const state: AppState = {
  viewportWidth: window.innerWidth,
  viewportHeight: window.innerHeight,
  scrollTop: window.scrollY,
  focusedIndex: findIndexFromHash(),
  lockedScrollTop: null,
  navHover: null,
}

let gridLayout = computeGridLayout(photoGalleryData, state.viewportWidth)
let renderQueued = false

function escapeHtml(text: string) {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function findIndexById(photoId: string | null) {
  if (photoId == null) {
    return null
  }
  const index = photoGalleryData.findIndex((photo) => photo.id === photoId)
  return index === -1 ? null : index
}

function findIndexFromHash() {
  return findIndexById(parseFocusedHash(window.location.hash))
}

function getMode() {
  return state.focusedIndex == null ? 'grid' : 'line'
}

function recomputeGridLayout() {
  gridLayout = computeGridLayout(photoGalleryData, state.viewportWidth)
}

function publishScenarioReport(report: ScenarioReport) {
  const json = JSON.stringify(report)
  reportNode.textContent = json
  if (isReportMode) {
    debugNode.hidden = false
    debugNode.textContent = json
  }
}

function scheduleRender() {
  if (renderQueued) {
    return
  }
  renderQueued = true
  requestAnimationFrame(() => {
    renderQueued = false
    render()
  })
}

function selectFullText(element: HTMLElement) {
  const range = document.createRange()
  range.selectNodeContents(element)
  const selection = window.getSelection()
  selection?.removeAllRanges()
  selection?.addRange(range)
}

function setBodyCursor(cursor: string) {
  document.body.style.cursor = cursor
}

function clearBodyCursor() {
  document.body.style.cursor = ''
}

function updateScrollLock() {
  if (state.focusedIndex == null) {
    state.lockedScrollTop = null
    document.body.classList.remove('is-line-mode')
    clearBodyCursor()
    return
  }

  if (state.lockedScrollTop == null) {
    state.lockedScrollTop = window.scrollY
  }

  document.body.classList.add('is-line-mode')
  window.scrollTo(0, state.lockedScrollTop)
}

function setFocusedIndex(index: number | null, syncHistory = true) {
  state.focusedIndex = index
  state.navHover = null
  updateScrollLock()
  render()

  if (!syncHistory) {
    return
  }

  const baseUrl = `${window.location.pathname}${window.location.search}`
  if (index == null) {
    window.history.pushState({photoId: null}, '', baseUrl)
    return
  }

  const nextHash = formatFocusedHash(photoGalleryData[index].id)
  window.history.pushState({photoId: photoGalleryData[index].id}, '', `${baseUrl}${nextHash}`)
}

function focusIndex(index: number, syncHistory = true) {
  if (index < 0 || index >= photoGalleryData.length) {
    return
  }
  state.lockedScrollTop = window.scrollY
  setFocusedIndex(index, syncHistory)
}

function ensureGridItemVisible(index: number) {
  const layoutItem = gridLayout.items[index]
  if (layoutItem == null) {
    return
  }

  const viewTop = window.scrollY
  const viewBottom = viewTop + state.viewportHeight
  const itemTop = layoutItem.top
  const itemBottom = layoutItem.top + layoutItem.cardHeight
  const needsScroll = itemTop < viewTop + 40 || itemBottom > viewBottom

  if (needsScroll) {
    window.scrollTo(0, Math.max(0, itemTop - 40))
    state.scrollTop = window.scrollY
  }
}

function dismissLineMode(syncHistory = true) {
  const focusedIndex = state.focusedIndex
  setFocusedIndex(null, syncHistory)
  if (focusedIndex != null) {
    ensureGridItemVisible(focusedIndex)
    render()
  }
}

function moveFocus(delta: number) {
  if (state.focusedIndex == null) {
    focusIndex(0)
    return
  }

  const nextIndex = Math.max(0, Math.min(photoGalleryData.length - 1, state.focusedIndex + delta))
  if (nextIndex !== state.focusedIndex) {
    focusIndex(nextIndex)
  }
}

function syncFocusedIndexFromLocation() {
  const nextIndex = findIndexFromHash()
  if (nextIndex === state.focusedIndex) {
    return
  }

  state.focusedIndex = nextIndex
  updateScrollLock()
  render()
}

function handleScroll() {
  if (state.focusedIndex != null && state.lockedScrollTop != null) {
    if (Math.abs(window.scrollY - state.lockedScrollTop) > 0.5) {
      window.scrollTo(0, state.lockedScrollTop)
    }
    state.scrollTop = state.lockedScrollTop
    return
  }

  state.scrollTop = window.scrollY
  scheduleRender()
}

function handleResize() {
  const oldLayout = gridLayout
  const oldScrollTop = window.scrollY
  const anchorIndex = state.focusedIndex == null ? getScrollAnchorIndex(oldLayout, oldScrollTop) : null
  const anchorTopBefore = anchorIndex == null ? null : oldLayout.items[anchorIndex]?.top ?? null

  state.viewportWidth = window.innerWidth
  state.viewportHeight = window.innerHeight
  recomputeGridLayout()

  if (anchorIndex != null && anchorTopBefore != null) {
    const anchorTopAfter = gridLayout.items[anchorIndex]?.top ?? anchorTopBefore
    window.scrollTo(0, Math.max(0, oldScrollTop + (anchorTopAfter - anchorTopBefore)))
  }

  state.scrollTop = window.scrollY
  updateScrollLock()
  render()
}

function handleKeyDown(event: KeyboardEvent) {
  if (event.key === 'ArrowLeft') {
    event.preventDefault()
    moveFocus(-1)
    return
  }

  if (event.key === 'ArrowRight') {
    event.preventDefault()
    moveFocus(1)
    return
  }

  if (event.key === 'Escape' && state.focusedIndex != null) {
    event.preventDefault()
    dismissLineMode()
  }
}

function getGridCardLeft(photo: PhotoData, index: number) {
  const item = gridLayout.items[index]
  if (item == null) {
    return 0
  }

  const columnWidth = gridLayout.metrics.boxMaxSizeX
  return item.left + (columnWidth - item.cardWidth) / 2
}

function renderGridCard(index: number) {
  const photo = photoGalleryData[index]
  const item = gridLayout.items[index]
  const lowResUrl = isReportMode ? blankImageUrl : getLowResImageUrl(photo.id)
  const left = getGridCardLeft(photo, index)
  const backgroundImage = isReportMode ? 'none' : `url('${lowResUrl}')`

  return `
    <article
      class="grid-card"
      data-grid-card
      data-index="${index}"
      style="
        left:${left}px;
        top:${item.top}px;
        width:${item.cardWidth}px;
        height:${item.cardHeight}px;
      "
    >
      <div
        class="grid-card__frame"
        style="height:${item.imageHeight}px; background-image:${backgroundImage}"
      >
        <img
          class="grid-card__img"
          alt="${escapeHtml(photo.prompt)}"
          src="${lowResUrl}"
          loading="lazy"
          draggable="false"
        />
      </div>
      <div class="grid-card__caption" data-grid-caption data-index="${index}">
        ${escapeHtml(photo.prompt)}
      </div>
    </article>
  `
}

function renderLineCard(index: number) {
  if (state.focusedIndex == null) {
    return ''
  }

  const layoutItem = computeLineLayout(
    photoGalleryData,
    state.focusedIndex,
    state.viewportWidth,
    state.viewportHeight,
  )[index]
  const photo = photoGalleryData[index]
  const isFocused = index === state.focusedIndex
  const isHoverTarget =
    (state.navHover === 'prev' && index === state.focusedIndex - 1) ||
    (state.navHover === 'next' && index === state.focusedIndex + 1)
  const lowResUrl = isReportMode ? blankImageUrl : getLowResImageUrl(photo.id)
  const highResUrl = isReportMode ? blankImageUrl : getHighResImageUrl(photo.id)
  const brightness = isFocused ? 1 : isHoverTarget ? 0.76 : layoutItem.focusDistance === 1 ? 0.58 : 0.42
  const blur = !isFocused && layoutItem.focusDistance === 1 ? 1.6 : 0
  const opacity = isFocused ? 1 : Math.max(0.22, 1 - layoutItem.focusDistance * 0.15)
  const scale = isHoverTarget ? 1.02 : 1
  const imageUrl = isFocused ? highResUrl : lowResUrl
  const backgroundImage = isReportMode ? 'none' : `url('${lowResUrl}')`

  return `
    <article
      class="line-card ${isFocused ? 'line-card--focused' : ''}"
      style="
        left:${layoutItem.left}px;
        top:${layoutItem.top}px;
        width:${layoutItem.cardWidth}px;
        height:${layoutItem.cardHeight}px;
        opacity:${opacity};
        transform:scale(${scale});
        filter:brightness(${brightness}) blur(${blur}px);
        z-index:${photoGalleryData.length - layoutItem.focusDistance};
        pointer-events:none;
      "
    >
      <div
        class="line-card__frame"
        style="
          height:${layoutItem.imageHeight}px;
          background-image:${backgroundImage};
        "
      >
        <img
          class="line-card__img"
          alt="${escapeHtml(photo.prompt)}"
          src="${imageUrl}"
          draggable="false"
        />
      </div>
      <div class="line-card__caption" ${isFocused ? 'data-line-caption' : ''} style="${isFocused ? 'pointer-events:auto;' : ''}">
        ${escapeHtml(photo.prompt)}
      </div>
    </article>
  `
}

function renderLineOverlay() {
  if (state.focusedIndex == null) {
    return ''
  }

  return `
    <div class="line-overlay">
      <div class="line-dismiss-layer" data-line-dismiss></div>
      <div class="line-nav line-nav--left" data-line-nav="left"></div>
      <div class="line-nav line-nav--right" data-line-nav="right"></div>
      ${photoGalleryData.map((_, index) => renderLineCard(index)).join('')}
    </div>
  `
}

function render() {
  const visibleGridIndices = getVisibleGridIndices(gridLayout, state.scrollTop, state.viewportHeight)
  app.innerHTML = `
    <div class="gallery-shell">
      <a class="github-link" href="https://github.com/" target="_blank" rel="noreferrer" aria-label="GitHub">
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path d="M8 0C3.58 0 0 3.67 0 8.2c0 3.63 2.29 6.71 5.47 7.8.4.08.55-.18.55-.4 0-.2-.01-.86-.01-1.57-2.01.38-2.53-.5-2.69-.95-.09-.23-.48-.95-.82-1.14-.28-.16-.68-.57-.01-.58.63-.01 1.08.59 1.23.84.72 1.24 1.87.89 2.33.68.07-.54.28-.89.5-1.1-1.78-.21-3.64-.92-3.64-4.08 0-.9.31-1.63.82-2.2-.08-.21-.36-1.05.08-2.18 0 0 .67-.22 2.2.84A7.4 7.4 0 0 1 8 3.6c.68 0 1.37.09 2.01.27 1.53-1.06 2.2-.84 2.2-.84.44 1.13.16 1.97.08 2.18.51.57.82 1.3.82 2.2 0 3.17-1.87 3.87-3.66 4.08.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .22.14.48.55.4A8.21 8.21 0 0 0 16 8.2C16 3.67 12.42 0 8 0Z"></path>
        </svg>
      </a>
      <div class="grid-surface" style="height:${Math.max(gridLayout.totalHeight, state.viewportHeight)}px">
        ${visibleGridIndices.map((index) => renderGridCard(index)).join('')}
      </div>
      ${renderLineOverlay()}
    </div>
  `

  wireRenderedElements()
}

function attachHoverMagnet(card: HTMLElement) {
  let currentX = 0
  let currentY = 0
  let currentScale = 1
  let targetX = 0
  let targetY = 0
  let targetScale = 1
  let frame = 0

  function tick() {
    if (!card.isConnected) {
      return
    }

    currentX += (targetX - currentX) * 0.18
    currentY += (targetY - currentY) * 0.18
    currentScale += (targetScale - currentScale) * 0.18
    card.style.transform = `translate3d(${currentX}px, ${currentY}px, 0) scale(${currentScale})`

    if (
      Math.abs(targetX - currentX) > 0.1 ||
      Math.abs(targetY - currentY) > 0.1 ||
      Math.abs(targetScale - currentScale) > 0.001
    ) {
      frame = requestAnimationFrame(tick)
    } else {
      frame = 0
    }
  }

  function ensureFrame() {
    if (frame === 0) {
      frame = requestAnimationFrame(tick)
    }
  }

  card.addEventListener('pointerenter', () => {
    targetScale = 1.02
    setBodyCursor('zoom-in')
    ensureFrame()
  })

  card.addEventListener('pointermove', (event) => {
    const rect = card.getBoundingClientRect()
    const normalizedX = (event.clientX - rect.left - rect.width / 2) / rect.width
    const normalizedY = (event.clientY - rect.top - rect.height / 2) / rect.height
    targetX = normalizedX * 12
    targetY = normalizedY * 12
    ensureFrame()
  })

  card.addEventListener('pointerleave', () => {
    targetX = 0
    targetY = 0
    targetScale = 1
    clearBodyCursor()
    ensureFrame()
  })
}

function wireRenderedElements() {
  const gridCards = app.querySelectorAll<HTMLElement>('[data-grid-card]')
  gridCards.forEach(attachHoverMagnet)

  const leftNav = app.querySelector<HTMLElement>('[data-line-nav="left"]')
  const rightNav = app.querySelector<HTMLElement>('[data-line-nav="right"]')

  leftNav?.addEventListener('pointerenter', () => {
    state.navHover = 'prev'
    render()
  })
  leftNav?.addEventListener('pointerleave', () => {
    state.navHover = null
    render()
  })

  rightNav?.addEventListener('pointerenter', () => {
    state.navHover = 'next'
    render()
  })
  rightNav?.addEventListener('pointerleave', () => {
    state.navHover = null
    render()
  })
}

app.addEventListener('click', (event) => {
  const target = event.target as HTMLElement | null
  if (target == null) {
    return
  }

  const gridCaption = target.closest<HTMLElement>('[data-grid-caption]')
  if (gridCaption != null) {
    event.stopPropagation()
    selectFullText(gridCaption)
    return
  }

  const lineCaption = target.closest<HTMLElement>('[data-line-caption]')
  if (lineCaption != null) {
    event.stopPropagation()
    return
  }

  const lineNav = target.closest<HTMLElement>('[data-line-nav]')
  if (lineNav != null && state.focusedIndex != null) {
    const pointerX = lineNav.dataset.lineNav === 'left' ? 0 : state.viewportWidth
    const action = routeLineModeHitArea(
      pointerX,
      state.viewportWidth,
      state.focusedIndex,
      photoGalleryData.length,
    )
    if (action.type === 'focus') {
      focusIndex(action.index)
    } else {
      dismissLineMode()
    }
    return
  }

  const dismissLayer = target.closest<HTMLElement>('[data-line-dismiss]')
  if (dismissLayer != null && state.focusedIndex != null) {
    dismissLineMode()
    return
  }

  const gridCard = target.closest<HTMLElement>('[data-grid-card]')
  if (gridCard != null) {
    const index = Number(gridCard.dataset.index)
    focusIndex(index)
  }
})

window.addEventListener('scroll', handleScroll, {passive: true})
window.addEventListener('resize', handleResize)
window.addEventListener('keydown', handleKeyDown)
window.addEventListener('hashchange', syncFocusedIndexFromLocation)
window.addEventListener('popstate', syncFocusedIndexFromLocation)

function getGridItemViewportTop(index: number) {
  const item = gridLayout.items[index]
  return Math.round(item.top - window.scrollY)
}

function isGridItemVisible(index: number) {
  const item = gridLayout.items[index]
  const top = item.top - window.scrollY
  const bottom = top + item.cardHeight
  return bottom > 0 && top < state.viewportHeight
}

function getCaptionElement(index: number) {
  return app.querySelector<HTMLElement>(`[data-grid-caption][data-index="${index}"]`)
}

async function waitFrames(count = 1) {
  for (let index = 0; index < count; index++) {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
  }
}

async function runScenarioNavigationFlow() {
  window.scrollTo(0, 560)
  state.scrollTop = window.scrollY
  render()
  await waitFrames(2)

  const focusSequence: number[] = []
  const hashSequence: string[] = []

  focusIndex(2)
  await waitFrames(2)
  focusSequence.push(state.focusedIndex ?? -1)
  hashSequence.push(window.location.hash)

  moveFocus(1)
  await waitFrames(2)
  focusSequence.push(state.focusedIndex ?? -1)
  hashSequence.push(window.location.hash)

  moveFocus(1)
  await waitFrames(2)
  focusSequence.push(state.focusedIndex ?? -1)
  hashSequence.push(window.location.hash)

  moveFocus(-1)
  await waitFrames(2)
  focusSequence.push(state.focusedIndex ?? -1)
  hashSequence.push(window.location.hash)

  const scrollTopBeforeLock = window.scrollY
  window.scrollTo(0, 920)
  await waitFrames(2)
  const scrollTopDuringLock = window.scrollY

  dismissLineMode()
  await waitFrames(2)

  return {
    focusSequence,
    hashSequence,
    scrollTopBeforeLock,
    scrollTopDuringLock,
    dismissedHash: window.location.hash,
    finalMode: getMode(),
  }
}

async function runScenarioDismissToRow() {
  window.scrollTo(0, 0)
  state.scrollTop = window.scrollY
  render()
  await waitFrames(2)

  focusIndex(6)
  await waitFrames(2)

  focusIndex(15)
  await waitFrames(2)

  const beforeDismissVisible = isGridItemVisible(15)
  dismissLineMode()
  await waitFrames(3)

  return {
    focusedIndex: 15,
    beforeDismissVisible,
    afterDismissVisible: isGridItemVisible(15),
    topOffset: getGridItemViewportTop(15),
  }
}

async function runScenarioCaptionSelection() {
  window.scrollTo(0, 0)
  state.scrollTop = window.scrollY
  render()
  await waitFrames(2)

  const caption = getCaptionElement(1)
  caption?.dispatchEvent(new MouseEvent('click', {bubbles: true, cancelable: true}))
  await waitFrames(1)

  return {
    selectedText: window.getSelection()?.toString() ?? '',
    hashAfterClick: window.location.hash,
    modeAfterClick: getMode(),
  }
}

async function runScenarioByName(name: string) {
  if (name === 'navigation-flow') {
    return runScenarioNavigationFlow()
  }

  if (name === 'dismiss-to-row') {
    return runScenarioDismissToRow()
  }

  if (name === 'caption-selection') {
    return runScenarioCaptionSelection()
  }

  throw new Error(`Unknown scenario: ${name}`)
}

async function maybeRunScenario() {
  if (!isReportMode || scenarioName === '' || requestId === '') {
    return
  }

  publishScenarioReport({
    phase: 'running',
    requestId,
    scenario: scenarioName,
  })

  try {
    const data = await runScenarioByName(scenarioName)
    publishScenarioReport({
      phase: 'ready',
      requestId,
      scenario: scenarioName,
      status: 'ok',
      data,
    })
  } catch (error) {
    publishScenarioReport({
      phase: 'error',
      requestId,
      scenario: scenarioName,
      status: 'error',
      message: error instanceof Error ? error.message : String(error),
    })
  }
}

recomputeGridLayout()
updateScrollLock()
render()
publishScenarioReport({
  phase: 'loading',
  requestId,
  scenario: scenarioName,
})
void maybeRunScenario()
