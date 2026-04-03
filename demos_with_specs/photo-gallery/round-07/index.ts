import {
  computeGridLayout,
  computeLineLayout,
  getRowForPhoto,
  GRID_CAPTION_HEIGHT,
  LINE_SIDE_HIT_WIDTH,
  routeLineModePointer,
  type GridItemLayout,
  type GridLayout,
  type LineItemLayout,
} from './gallery'
import {
  getHighResUrl,
  getLowResUrl,
  photoGalleryData,
} from './data'

type ScenarioName =
  | ''
  | 'navigation-flow'
  | 'dismiss-to-row'
  | 'caption-selection'

type Report = {
  phase: 'loading' | 'running' | 'ready' | 'error'
  status: 'ok' | 'error'
  scenario: ScenarioName
  requestId: string
  message?: string
  focusSequence?: Array<string | null>
  hashSequence?: string[]
  bodyOverflowWhileLineMode?: string
  gridMountedCount?: number
  rowVisibleAfterDismiss?: boolean
  rowTopAfterDismiss?: number
  selectedText?: string
  focusedId?: string | null
  hash?: string
}

type OverlayCardState = {
  node: HTMLDivElement
  imageShell: HTMLDivElement
  caption: HTMLParagraphElement
  highResImg: HTMLImageElement
  x: number
  y: number
  width: number
  height: number
  opacity: number
  brightness: number
  blur: number
  scale: number
  vx: number
  vy: number
  vWidth: number
  vHeight: number
  vOpacity: number
  target: OverlayTarget
}

type OverlayTarget = {
  x: number
  y: number
  width: number
  height: number
  opacity: number
  brightness: number
  blur: number
  scale: number
  focused: boolean
}

type State = {
  scrollTop: number
  storedScrollTop: number
  viewportWidth: number
  viewportHeight: number
  focusedId: string | null
  gridLayout: GridLayout
  hoveredId: string | null
  hoverOffsetX: number
  hoverOffsetY: number
  lineHoverSide: 'left' | 'right' | null
  pendingAnchor:
    | {
        photoId: string
        previousTop: number
      }
    | null
  selectedCaptionText: string
}

const app = document.querySelector('#app')
const gridStage = document.querySelector<HTMLDivElement>('#grid-stage')
const lineLayer = document.querySelector<HTMLDivElement>('#line-layer')
const lineBackdrop = document.querySelector<HTMLDivElement>('#line-backdrop')
const navLeft = document.querySelector<HTMLDivElement>('#nav-left')
const navRight = document.querySelector<HTMLDivElement>('#nav-right')
const scenarioStatus = document.querySelector<HTMLDivElement>('#scenario-status')
const scenarioReportNode = document.querySelector<HTMLScriptElement>('#scenario-report')
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

if (
  app == null ||
  gridStage == null ||
  lineLayer == null ||
  lineBackdrop == null ||
  navLeft == null ||
  navRight == null ||
  scenarioStatus == null ||
  scenarioReportNode == null
) {
  throw new Error('Missing app shell')
}

const photoById = new Map(photoGalleryData.map((photo) => [photo.id, photo]))
const overlayCards = new Map<string, OverlayCardState>()

const params = new URLSearchParams(window.location.search)
const scenario = (params.get('scenario') ?? '') as ScenarioName
const requestId = params.get('requestId') ?? ''

let animationFrame = 0
let lineFocusRect: DOMRect | null = null
let currentLineLayout: ReturnType<typeof computeLineLayout> | null = null

const state: State = {
  scrollTop: window.scrollY,
  storedScrollTop: window.scrollY,
  viewportWidth: window.innerWidth,
  viewportHeight: window.innerHeight,
  focusedId: parseHash(),
  gridLayout: computeGridLayout({
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
    scrollTop: window.scrollY,
    photos: photoGalleryData,
  }),
  hoveredId: null,
  hoverOffsetX: 0,
  hoverOffsetY: 0,
  lineHoverSide: null,
  pendingAnchor: null,
  selectedCaptionText: '',
}

publishReport({
  phase: 'loading',
  status: 'ok',
  scenario,
  requestId,
})

bindEvents()
render()

void maybeRunScenario()

function bindEvents() {
  window.addEventListener('scroll', () => {
    if (state.focusedId != null) return
    state.scrollTop = window.scrollY
    state.storedScrollTop = window.scrollY
    renderGrid()
  })

  window.addEventListener('resize', () => {
    const anchor = pickAnchorItem()
    state.pendingAnchor =
      anchor == null
        ? null
        : {
            photoId: anchor.id,
            previousTop: anchor.y - state.scrollTop,
          }
    state.viewportWidth = window.innerWidth
    state.viewportHeight = window.innerHeight
    render()
  })

  window.addEventListener('hashchange', () => {
    syncFocusFromHash()
  })

  document.addEventListener('keydown', (event) => {
    if (
      (event.key === 'ArrowLeft' || event.key === 'ArrowRight') &&
      state.focusedId == null
    ) {
      event.preventDefault()
      setFocusedId(photoGalleryData[0]?.id ?? null, 'hash')
      return
    }

    if (state.focusedId == null) return
    const focusedIndex = photoGalleryData.findIndex(
      (photo) => photo.id === state.focusedId,
    )
    if (event.key === 'Escape') {
      event.preventDefault()
      dismissLineMode()
      return
    }
    if (event.key === 'ArrowLeft' && focusedIndex > 0) {
      event.preventDefault()
      setFocusedId(photoGalleryData[focusedIndex - 1]?.id ?? null, 'hash')
      return
    }
    if (
      event.key === 'ArrowRight' &&
      focusedIndex >= 0 &&
      focusedIndex < photoGalleryData.length - 1
    ) {
      event.preventDefault()
      setFocusedId(photoGalleryData[focusedIndex + 1]?.id ?? null, 'hash')
    }
  })

  lineBackdrop.addEventListener('click', () => {
    dismissLineMode()
  })

  navLeft.addEventListener('mouseenter', () => {
    state.lineHoverSide = 'left'
    renderLineOverlay()
  })
  navLeft.addEventListener('mouseleave', () => {
    state.lineHoverSide = null
    renderLineOverlay()
  })
  navLeft.addEventListener('click', (event) => {
    event.stopPropagation()
    const focusedIndex = getFocusedIndex()
    if (focusedIndex > 0) {
      setFocusedId(photoGalleryData[focusedIndex - 1]?.id ?? null, 'hash')
      return
    }
    dismissLineMode()
  })

  navRight.addEventListener('mouseenter', () => {
    state.lineHoverSide = 'right'
    renderLineOverlay()
  })
  navRight.addEventListener('mouseleave', () => {
    state.lineHoverSide = null
    renderLineOverlay()
  })
  navRight.addEventListener('click', (event) => {
    event.stopPropagation()
    const focusedIndex = getFocusedIndex()
    if (focusedIndex >= 0 && focusedIndex < photoGalleryData.length - 1) {
      setFocusedId(photoGalleryData[focusedIndex + 1]?.id ?? null, 'hash')
      return
    }
    dismissLineMode()
  })

  lineLayer.addEventListener('mousemove', (event) => {
    const action = routeLineModePointer({
      viewportWidth: state.viewportWidth,
      pointerX: event.clientX,
      focusedIndex: Math.max(0, getFocusedIndex()),
      photoCount: photoGalleryData.length,
    })
    lineLayer.style.cursor =
      action.kind === 'focus' && isWithinStrip(event.clientX)
        ? 'zoom-in'
        : 'zoom-out'
  })
}

function render() {
  state.gridLayout = computeGridLayout({
    viewportWidth: state.viewportWidth,
    viewportHeight: state.viewportHeight,
    scrollTop: state.scrollTop,
    photos: photoGalleryData,
  })
  gridStage.style.height = `${state.gridLayout.totalHeight}px`
  renderGrid()
  if (state.pendingAnchor != null && state.focusedId == null) {
    const item = state.gridLayout.items.find(
      (entry) => entry.id === state.pendingAnchor?.photoId,
    )
    if (item != null) {
      window.scrollTo(0, item.y - state.pendingAnchor.previousTop)
      state.scrollTop = window.scrollY
      state.storedScrollTop = window.scrollY
    }
    state.pendingAnchor = null
  }
  renderLineOverlay()
}

function renderGrid() {
  state.gridLayout = computeGridLayout({
    viewportWidth: state.viewportWidth,
    viewportHeight: state.viewportHeight,
    scrollTop: state.scrollTop,
    photos: photoGalleryData,
  })
  gridStage.style.height = `${state.gridLayout.totalHeight}px`
  const visible = new Set(state.gridLayout.visibleItemIds)
  const markup = state.gridLayout.items
    .filter((item) => visible.has(item.id))
    .map((item) => {
      const photo = photoById.get(item.id)
      if (photo == null) return ''
      const hoverScale = state.hoveredId === item.id ? 1.02 : 1
      const hoverX = state.hoveredId === item.id ? state.hoverOffsetX : 0
      const hoverY = state.hoveredId === item.id ? state.hoverOffsetY : 0
      return `
        <article
          class="grid-card"
          data-photo-id="${item.id}"
          style="
            left:${item.x}px;
            top:${item.y}px;
            width:${item.width}px;
            height:${item.height}px;
            transform: translate3d(${hoverX}px, ${hoverY}px, 0) scale(${hoverScale});
          "
        >
          <div class="grid-card-inner">
            <div
              class="grid-image-shell"
              style="
                width:${item.width}px;
                height:${item.imageHeight}px;
                background-image:url('${getLowResUrl(item.id)}');
              "
            ></div>
            <p class="grid-caption" data-caption-for="${item.id}">${escapeHtml(photo.prompt)}</p>
          </div>
        </article>
      `
    })
    .join('')
  gridStage.innerHTML = markup

  for (const item of state.gridLayout.items) {
    const node = gridStage.querySelector<HTMLElement>(
      `[data-photo-id="${CSS.escape(item.id)}"]`,
    )
    const caption = gridStage.querySelector<HTMLElement>(
      `[data-caption-for="${CSS.escape(item.id)}"]`,
    )
    if (node != null) {
      node.addEventListener('mouseenter', () => {
        state.hoveredId = item.id
        document.body.style.cursor = 'zoom-in'
      })
      node.addEventListener('mouseleave', () => {
        state.hoveredId = null
        state.hoverOffsetX = 0
        state.hoverOffsetY = 0
        document.body.style.cursor = ''
        renderGrid()
      })
      node.addEventListener('mousemove', (event) => {
        const rect = node.getBoundingClientRect()
        state.hoveredId = item.id
        state.hoverOffsetX = ((event.clientX - rect.left) / rect.width - 0.5) * 8
        state.hoverOffsetY = ((event.clientY - rect.top) / rect.height - 0.5) * 8
        renderGrid()
      })
      node.addEventListener('click', (event) => {
        if ((event.target as HTMLElement).closest('.grid-caption') != null) {
          return
        }
        openFromGrid(item)
      })
    }
    if (caption != null) {
      caption.addEventListener('click', (event) => {
        event.stopPropagation()
        selectCaptionText(caption, item.id)
      })
      caption.addEventListener('mousedown', (event) => {
        event.stopPropagation()
      })
    }
  }
}

function renderLineOverlay() {
  const focusedIndex = getFocusedIndex()
  if (focusedIndex < 0) {
    lineLayer.style.display = 'none'
    lineLayer.style.cursor = ''
    document.body.style.overflowY = ''
    currentLineLayout = null
    for (const card of overlayCards.values()) {
      card.node.remove()
    }
    overlayCards.clear()
    cancelAnimationFrame(animationFrame)
    return
  }

  currentLineLayout = computeLineLayout({
    viewportWidth: state.viewportWidth,
    viewportHeight: state.viewportHeight,
    photos: photoGalleryData,
    focusedIndex,
  })
  lineLayer.style.display = 'block'
  document.body.style.overflowY = 'hidden'
  const visibleItems = currentLineLayout.items.filter(
    (item) => item.visible || item.isFocused,
  )
  const nextIds = new Set(visibleItems.map((item) => item.id))

  for (const [id, card] of overlayCards) {
    if (!nextIds.has(id)) {
      card.target.opacity = 0
    }
  }

  for (const item of visibleItems) {
    const photo = photoById.get(item.id)
    if (photo == null) continue
    const target = getOverlayTarget(item)
    let entry = overlayCards.get(item.id)
    if (entry == null) {
      entry = createOverlayCard(item, photo.prompt)
      overlayCards.set(item.id, entry)
      lineLayer.append(entry.node)
    }
    entry.caption.textContent = photo.prompt
    entry.imageShell.style.backgroundImage = `url('${getLowResUrl(item.id)}')`
    entry.highResImg.src = item.isFocused ? getHighResUrl(item.id) : ''
    entry.highResImg.style.display = item.isFocused ? 'block' : 'none'
    entry.target = target
  }

  animateOverlay()
}

function getOverlayTarget(item: LineItemLayout): OverlayTarget {
  const focusIndex = getFocusedIndex()
  const distance = Math.abs(item.index - focusIndex)
  const isHoveredNeighbor =
    (state.lineHoverSide === 'left' && item.index === focusIndex - 1) ||
    (state.lineHoverSide === 'right' && item.index === focusIndex + 1)

  return {
    x: item.x,
    y: item.y,
    width: item.width,
    height: item.height,
    opacity: 1,
    brightness: item.isFocused ? 1 : isHoveredNeighbor ? 0.76 : 0.56,
    blur: item.isFocused ? 0 : distance === 1 ? 1.2 : 0.4,
    scale: item.isFocused ? 1 : isHoveredNeighbor ? 1.04 : 1,
    focused: item.isFocused,
  }
}

function animateOverlay() {
  cancelAnimationFrame(animationFrame)

  const step = () => {
    let keepGoing = false
    for (const [id, card] of overlayCards) {
      card.x = springValue(card.x, card.target.x, 'x', card)
      card.y = springValue(card.y, card.target.y, 'y', card)
      card.width = springValue(card.width, card.target.width, 'width', card)
      card.height = springValue(card.height, card.target.height, 'height', card)
      card.opacity = springValue(card.opacity, card.target.opacity, 'opacity', card)
      card.brightness = springScalar(card.brightness, card.target.brightness)
      card.blur = springScalar(card.blur, card.target.blur)
      card.scale = springScalar(card.scale, card.target.scale)

      applyOverlayCardStyle(card)

      if (
        !isClose(card.x, card.target.x) ||
        !isClose(card.y, card.target.y) ||
        !isClose(card.width, card.target.width) ||
        !isClose(card.height, card.target.height) ||
        !isClose(card.opacity, card.target.opacity)
      ) {
        keepGoing = true
      }

      if (card.opacity < 0.01 && card.target.opacity === 0) {
        card.node.remove()
        overlayCards.delete(id)
      }
    }

    if (keepGoing && !reduceMotion) {
      animationFrame = requestAnimationFrame(step)
    } else {
      for (const card of overlayCards.values()) {
        card.x = card.target.x
        card.y = card.target.y
        card.width = card.target.width
        card.height = card.target.height
        card.opacity = card.target.opacity
        card.brightness = card.target.brightness
        card.blur = card.target.blur
        card.scale = card.target.scale
        applyOverlayCardStyle(card)
      }
    }
  }

  animationFrame = requestAnimationFrame(step)
}

function createOverlayCard(item: LineItemLayout, prompt: string) {
  const node = document.createElement('article')
  node.className = 'line-card'
  node.dataset.photoId = item.id

  const imageShell = document.createElement('div')
  imageShell.className = 'line-image-shell'

  const highResImg = document.createElement('img')
  highResImg.className = 'line-high-res'
  highResImg.alt = prompt
  imageShell.append(highResImg)

  const caption = document.createElement('p')
  caption.className = 'line-caption'
  caption.textContent = prompt

  node.append(imageShell, caption)

  const sourceRect = getSourceRect(item.id)
  const stateForCard: OverlayCardState = {
    node,
    imageShell,
    caption,
    highResImg,
    x: sourceRect.x,
    y: sourceRect.y,
    width: sourceRect.width,
    height: sourceRect.height,
    opacity: 0.96,
    brightness: 1,
    blur: 0,
    scale: 1,
    vx: 0,
    vy: 0,
    vWidth: 0,
    vHeight: 0,
    vOpacity: 0,
    target: {
      x: item.x,
      y: item.y,
      width: item.width,
      height: item.height,
      opacity: 1,
      brightness: item.isFocused ? 1 : 0.56,
      blur: item.isFocused ? 0 : 1,
      scale: 1,
      focused: item.isFocused,
    },
  }
  applyOverlayCardStyle(stateForCard)
  return stateForCard
}

function getSourceRect(photoId: string) {
  const gridNode = gridStage.querySelector<HTMLElement>(
    `[data-photo-id="${CSS.escape(photoId)}"]`,
  )
  if (gridNode != null) {
    const rect = gridNode.getBoundingClientRect()
    return {
      x: rect.left,
      y: rect.top,
      width: rect.width,
      height: rect.height,
    }
  }
  const gridItem = state.gridLayout.items.find((item) => item.id === photoId)
  if (gridItem != null) {
    return {
      x: gridItem.x,
      y: gridItem.y - state.scrollTop,
      width: gridItem.width,
      height: gridItem.height,
    }
  }
  if (lineFocusRect != null) {
    return {
      x: lineFocusRect.left,
      y: lineFocusRect.top,
      width: lineFocusRect.width,
      height: lineFocusRect.height,
    }
  }
  return {
    x: state.viewportWidth / 2 - 120,
    y: state.viewportHeight / 2 - 120,
    width: 240,
    height: 240,
  }
}

function applyOverlayCardStyle(card: OverlayCardState) {
  const imageHeight = Math.max(120, card.height - lineImageToCaptionSpace())
  card.node.style.left = `${card.x}px`
  card.node.style.top = `${card.y}px`
  card.node.style.width = `${card.width}px`
  card.node.style.height = `${card.height}px`
  card.node.style.opacity = `${card.opacity}`
  card.node.style.transform = `scale(${card.scale})`
  card.node.style.filter = `brightness(${card.brightness}) blur(${card.blur}px)`
  card.imageShell.style.height = `${imageHeight}px`
  card.imageShell.style.width = '100%'
}

function openFromGrid(item: GridItemLayout) {
  lineFocusRect = gridStage
    .querySelector<HTMLElement>(`[data-photo-id="${CSS.escape(item.id)}"]`)
    ?.getBoundingClientRect() ?? null
  setFocusedId(item.id, 'hash')
}

function setFocusedId(photoId: string | null, source: 'hash' | 'state') {
  if (source === 'hash') {
    const nextHash = photoId == null ? '' : `#${photoId}`
    if (window.location.hash !== nextHash) {
      window.location.hash = nextHash
      return
    }
  }

  if (state.focusedId === photoId) return
  state.focusedId = photoId
  render()
}

function dismissLineMode() {
  const focusedId = state.focusedId
  if (focusedId == null) return

  const row = getRowForPhoto(state.gridLayout, focusedId)
  if (row != null) {
    const rowTopInViewport = row.y - window.scrollY
    if (
      rowTopInViewport > state.viewportHeight - row.height ||
      rowTopInViewport < 40
    ) {
      window.scrollTo({
        top: Math.max(0, row.y - 40),
        behavior: 'auto',
      })
      state.scrollTop = window.scrollY
      state.storedScrollTop = window.scrollY
    }
  }
  lineFocusRect = lineLayer
    .querySelector<HTMLElement>(`[data-photo-id="${CSS.escape(focusedId)}"]`)
    ?.getBoundingClientRect() ?? null
  setFocusedId(null, 'hash')
}

function syncFocusFromHash() {
  setFocusedId(parseHash(), 'state')
}

function parseHash() {
  const hash = window.location.hash.replace(/^#/, '')
  return photoById.has(hash) ? hash : null
}

function getFocusedIndex() {
  if (state.focusedId == null) return -1
  return photoGalleryData.findIndex((photo) => photo.id === state.focusedId)
}

function pickAnchorItem() {
  return state.gridLayout.items.find(
    (item) => item.y + item.height >= state.scrollTop + 8,
  )
}

function selectCaptionText(caption: HTMLElement, photoId: string) {
  const selection = window.getSelection()
  const range = document.createRange()
  range.selectNodeContents(caption)
  selection?.removeAllRanges()
  selection?.addRange(range)
  state.selectedCaptionText = selection?.toString() ?? caption.textContent ?? ''
  setFocusedId(null, 'state')
  publishReport({
    phase: 'running',
    status: 'ok',
    scenario,
    requestId,
    selectedText: state.selectedCaptionText,
    focusedId: state.focusedId,
    hash: window.location.hash,
  })
}

async function maybeRunScenario() {
  if (scenario === '') return
  await waitForFrames(3)
  publishReport({
    phase: 'running',
    status: 'ok',
    scenario,
    requestId,
  })

  try {
    if (scenario === 'navigation-flow') {
      await runNavigationFlowScenario()
      return
    }
    if (scenario === 'dismiss-to-row') {
      await runDismissToRowScenario()
      return
    }
    if (scenario === 'caption-selection') {
      await runCaptionSelectionScenario()
      return
    }
  } catch (error) {
    publishReport({
      phase: 'error',
      status: 'error',
      scenario,
      requestId,
      message: String(error),
    })
    throw error
  }
}

async function runNavigationFlowScenario() {
  const focusSequence: Array<string | null> = [state.focusedId]
  const hashSequence = [window.location.hash]

  const gridCard = gridStage.querySelector<HTMLElement>(
    `[data-photo-id="${CSS.escape(photoGalleryData[6]?.id ?? '')}"]`,
  )
  gridCard?.click()
  await waitForFrames(6)
  focusSequence.push(state.focusedId)
  hashSequence.push(window.location.hash)
  const bodyOverflowWhileLineMode = getComputedStyle(document.body).overflowY

  navRight.click()
  await waitForFrames(6)
  focusSequence.push(state.focusedId)
  hashSequence.push(window.location.hash)

  document.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }),
  )
  await waitForFrames(6)
  focusSequence.push(state.focusedId)
  hashSequence.push(window.location.hash)

  document.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
  )
  await waitForFrames(6)
  focusSequence.push(state.focusedId)
  hashSequence.push(window.location.hash)

  publishReport({
    phase: 'ready',
    status: 'ok',
    scenario,
    requestId,
    focusSequence,
    hashSequence,
    bodyOverflowWhileLineMode,
    gridMountedCount: gridStage.querySelectorAll('[data-photo-id]').length,
  })
}

async function runDismissToRowScenario() {
  const targetId = photoGalleryData[18]?.id
  if (targetId == null) {
    throw new Error('Missing target photo')
  }

  window.location.hash = `#${targetId}`
  await waitForFrames(8)
  dismissLineMode()
  await waitForFrames(8)

  const row = getRowForPhoto(state.gridLayout, targetId)
  if (row == null) {
    throw new Error('Missing target row')
  }
  const rowTopAfterDismiss = row.y - window.scrollY

  publishReport({
    phase: 'ready',
    status: 'ok',
    scenario,
    requestId,
    rowVisibleAfterDismiss:
      rowTopAfterDismiss >= 0 && rowTopAfterDismiss <= state.viewportHeight - 44,
    rowTopAfterDismiss,
  })
}

async function runCaptionSelectionScenario() {
  const targetId = photoGalleryData[3]?.id
  if (targetId == null) {
    throw new Error('Missing caption target')
  }

  const caption = gridStage.querySelector<HTMLElement>(
    `[data-caption-for="${CSS.escape(targetId)}"]`,
  )
  caption?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
  caption?.click()
  await waitForFrames(4)

  publishReport({
    phase: 'ready',
    status: 'ok',
    scenario,
    requestId,
    selectedText: window.getSelection()?.toString() ?? '',
    focusedId: state.focusedId,
    hash: window.location.hash,
  })
}

function publishReport(report: Report) {
  scenarioStatus.textContent = `${report.phase}:${report.scenario || 'idle'}`
  scenarioReportNode.textContent = JSON.stringify(report)
}

function waitForFrames(frameCount: number) {
  return new Promise<void>((resolve) => {
    let remaining = frameCount
    const tick = () => {
      remaining -= 1
      if (remaining <= 0) {
        resolve()
        return
      }
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
}

function springValue(
  current: number,
  target: number,
  axis: 'x' | 'y' | 'width' | 'height' | 'opacity',
  card: OverlayCardState,
) {
  if (reduceMotion) return target
  const velocityKey =
    axis === 'x'
      ? 'vx'
      : axis === 'y'
        ? 'vy'
        : axis === 'width'
          ? 'vWidth'
          : axis === 'height'
            ? 'vHeight'
            : 'vOpacity'
  const velocity = card[velocityKey]
  const nextVelocity = velocity * 0.7 + (target - current) * 0.18
  card[velocityKey] = nextVelocity
  return current + nextVelocity
}

function springScalar(current: number, target: number) {
  if (reduceMotion) return target
  return current + (target - current) * 0.18
}

function isClose(a: number, b: number) {
  return Math.abs(a - b) < 0.5
}

function isWithinStrip(pointerX: number) {
  return (
    pointerX <= LINE_SIDE_HIT_WIDTH ||
    pointerX >= state.viewportWidth - LINE_SIDE_HIT_WIDTH
  )
}

function lineImageToCaptionSpace() {
  return GRID_CAPTION_HEIGHT + 20
}

function escapeHtml(text: string) {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}
