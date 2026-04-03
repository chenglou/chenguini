import {
  GRID_CAPTION_VISIBLE,
  GRID_TOP_PADDING,
  LINE_BOTTOM_GAP,
  LINE_CAPTION_BOTTOM,
  LINE_CAPTION_VISIBLE,
  LINE_GAP,
  LINE_LEFT_STRIP,
  LINE_NEIGHBOR_SCALE,
  createGridLayout,
  getOccludedItemIds,
  getRowTopForPhoto,
  hashForPhoto,
  parsePhotoIdFromHash,
  routeLineClick,
  type GridLayout,
} from './gallery'
import {highResImageUrl, lowResImageUrl, photoGalleryData, type PhotoData} from './data'

type GridCardDom = {
  root: HTMLArticleElement
  imageHit: HTMLButtonElement
  frame: HTMLDivElement
  img: HTMLImageElement
  caption: HTMLDivElement
  captionText: HTMLSpanElement
}

type ViewSnapshot = {
  layout: GridLayout
  visibleIds: string[]
  viewportWidth: number
  viewportHeight: number
  scrollTop: number
}

type AutomationReport = {
  phase: 'loading' | 'running' | 'ready' | 'error'
  requestId: string
  scenario: string
  message?: string
  selectedText?: string
  focusedId?: string | null
  initialFocusedId?: string | null
  finalHash?: string
  mode?: 'grid' | 'line'
  rowGapPx?: number
  mountedCount?: number
  itemCount?: number
}

type AppState = {
  click: MouseEvent | null
  focusedId: string | null
  hashChangeVersion: number
  handledHashChangeVersion: number
  pendingCaptionSelectionId: string | null
  pendingDismissScrollTop: number | null
  scenarioStarted: boolean
}

type LineCardLayout = {
  id: string
  x: number
  y: number
  width: number
  height: number
  focused: boolean
  opacity: number
  zIndex: number
}

const gridRoot = requireElement<HTMLDivElement>('grid-root')
const lineOverlay = requireElement<HTMLDivElement>('line-overlay')
const reportNode = requireElement<HTMLScriptElement>('automation-report')
const lineStage = document.createElement('div')
lineStage.className = 'line-stage'
lineOverlay.append(lineStage)

const params = new URLSearchParams(location.search)
const scenario = params.get('scenario') ?? ''
const requestId = params.get('requestId') ?? ''
const photoIndexById = new Map<string, number>()
for (let index = 0; index < photoGalleryData.length; index += 1) {
  photoIndexById.set(photoGalleryData[index]!.id, index)
}

const domCache = {
  gridCards: new Map<string, GridCardDom>(), // cache lifetime: on visibility changes
}

const st: AppState = {
  click: null,
  focusedId: normalizeFocusedId(parsePhotoIdFromHash(location.hash)),
  hashChangeVersion: 0,
  handledHashChangeVersion: 0,
  pendingCaptionSelectionId: null,
  pendingDismissScrollTop: null,
  scenarioStarted: false,
}

let scheduledRaf: number | null = null
let viewSnapshot: ViewSnapshot | null = null

if (scenario !== '') {
  publishReport({phase: 'loading', requestId, scenario})
}

window.addEventListener('resize', () => scheduleRender())
window.addEventListener('scroll', () => scheduleRender(), {passive: true})
window.addEventListener('click', (event) => {
  st.click = event
  scheduleRender()
})
window.addEventListener('hashchange', () => {
  st.hashChangeVersion += 1
  scheduleRender()
})

scheduleRender()

function scheduleRender() {
  if (scheduledRaf != null) return
  scheduledRaf = requestAnimationFrame(() => {
    scheduledRaf = null
    render()
  })
}

function render() {
  const viewportWidth = document.documentElement.clientWidth
  const viewportHeight = document.documentElement.clientHeight
  const scrollTop = readScrollTop()
  let focusedId = st.focusedId
  let pendingCaptionSelectionId = st.pendingCaptionSelectionId
  let pendingDismissScrollTop = st.pendingDismissScrollTop

  if (st.handledHashChangeVersion !== st.hashChangeVersion) {
    focusedId = normalizeFocusedId(parsePhotoIdFromHash(location.hash))
    st.handledHashChangeVersion = st.hashChangeVersion
  }

  const layout = createGridLayout(photoGalleryData, viewportWidth)
  const visibleIds = getOccludedItemIds(layout, scrollTop, viewportHeight)

  if (st.click != null) {
    const click = st.click
    st.click = null
    const target = click.target
    if (target instanceof HTMLElement) {
      if (focusedId == null) {
        const caption = target.closest<HTMLElement>('[data-photo-hit="caption"]')
        const image = target.closest<HTMLElement>('[data-photo-hit="image"]')
        if (caption != null) {
          pendingCaptionSelectionId = caption.dataset.photoId ?? null
        } else if (image != null) {
          focusedId = normalizeFocusedId(image.dataset.photoId ?? null)
        }
      } else if (lineOverlay.contains(target)) {
        switch (routeLineClick(click.clientX, viewportWidth)) {
          case 'previous':
            focusedId = offsetFocusedPhoto(focusedId, -1)
            break
          case 'dismiss':
            pendingDismissScrollTop = Math.max(getRowTopForPhoto(layout, focusedId) - GRID_TOP_PADDING, 0)
            focusedId = null
            break
          case 'next':
            focusedId = offsetFocusedPhoto(focusedId, 1)
            break
        }
      }
    }
  }

  st.focusedId = focusedId
  st.pendingCaptionSelectionId = pendingCaptionSelectionId
  st.pendingDismissScrollTop = pendingDismissScrollTop
  viewSnapshot = {
    layout,
    visibleIds,
    viewportWidth,
    viewportHeight,
    scrollTop,
  }

  renderGrid(layout, visibleIds, focusedId)
  renderLineOverlay(focusedId, viewportWidth, viewportHeight)

  const desiredHash = hashForPhoto(focusedId)
  if (desiredHash !== location.hash) {
    replaceHash(desiredHash)
  }

  if (st.pendingCaptionSelectionId != null) {
    selectCaptionText(st.pendingCaptionSelectionId)
    st.pendingCaptionSelectionId = null
  }

  if (st.pendingDismissScrollTop != null) {
    const targetScrollTop = st.pendingDismissScrollTop
    st.pendingDismissScrollTop = null
    window.scrollTo({top: targetScrollTop})
    scheduleRender()
  }

  maybeStartScenario()
}

function renderGrid(layout: GridLayout, visibleIds: string[], focusedId: string | null) {
  gridRoot.style.height = `${layout.totalHeight}px`
  gridRoot.dataset.dimmed = focusedId == null ? 'false' : 'true'
  const visibleSet = new Set(visibleIds)
  const itemsById = new Map<string, GridLayout['items'][number]>()
  for (let index = 0; index < layout.items.length; index += 1) {
    const item = layout.items[index]!
    itemsById.set(item.id, item)
  }

  for (let index = 0; index < photoGalleryData.length; index += 1) {
    const photo = photoGalleryData[index]!
    if (!visibleSet.has(photo.id)) continue
    const item = itemsById.get(photo.id)
    if (item == null) continue
    let card = domCache.gridCards.get(photo.id)
    if (card == null) {
      card = createGridCard(photo)
      domCache.gridCards.set(photo.id, card)
    }

    card.root.style.transform = `translate3d(${item.x}px, ${item.y}px, 0)`
    card.root.style.width = `${item.width}px`
    card.root.style.height = `${item.height}px`
    card.imageHit.style.height = `${item.imageHeight}px`
    card.frame.style.height = `${item.imageHeight}px`
    if (card.root.parentNode == null) {
      gridRoot.append(card.root)
    }
  }

  for (const [photoId, card] of domCache.gridCards) {
    if (visibleSet.has(photoId)) continue
    card.root.remove()
    domCache.gridCards.delete(photoId)
  }
}

function renderLineOverlay(focusedId: string | null, viewportWidth: number, viewportHeight: number) {
  lineOverlay.dataset.visible = focusedId == null ? 'false' : 'true'
  lineOverlay.setAttribute('aria-hidden', focusedId == null ? 'true' : 'false')
  if (focusedId == null) {
    lineStage.textContent = ''
    return
  }

  lineStage.textContent = ''
  const lineCards = createLineLayout(focusedId, viewportWidth, viewportHeight)
  for (let index = 0; index < lineCards.length; index += 1) {
    const cardLayout = lineCards[index]!
    const photo = photoGalleryData[photoIndexById.get(cardLayout.id)!]!
    const root = document.createElement('article')
    root.className = 'line-card'
    root.dataset.focused = cardLayout.focused ? 'true' : 'false'
    root.style.transform = `translate3d(${cardLayout.x}px, ${cardLayout.y}px, 0)`
    root.style.width = `${cardLayout.width}px`
    root.style.height = `${cardLayout.height + LINE_BOTTOM_GAP + LINE_CAPTION_VISIBLE + LINE_CAPTION_BOTTOM}px`
    root.style.opacity = `${cardLayout.opacity}`
    root.style.zIndex = String(cardLayout.zIndex)

    const frame = document.createElement('div')
    frame.className = 'line-card-frame'
    frame.style.height = `${cardLayout.height}px`

    const image = document.createElement('img')
    image.className = 'line-card-image'
    image.alt = photo.prompt
    image.decoding = 'async'
    image.draggable = false
    image.loading = cardLayout.focused ? 'eager' : 'lazy'
    image.src = cardLayout.focused ? highResImageUrl(photo.id) : lowResImageUrl(photo.id)
    frame.append(image)

    const caption = document.createElement('div')
    caption.className = 'line-card-caption'
    caption.style.marginTop = `${LINE_BOTTOM_GAP}px`
    caption.style.height = `${LINE_CAPTION_VISIBLE}px`
    caption.style.paddingBottom = `${LINE_CAPTION_BOTTOM}px`

    const captionText = document.createElement('span')
    captionText.className = 'line-card-caption-text'
    captionText.textContent = photo.prompt
    caption.append(captionText)

    root.append(frame, caption)
    lineStage.append(root)
  }
}

function createGridCard(photo: PhotoData): GridCardDom {
  const root = document.createElement('article')
  root.className = 'gallery-card'
  root.dataset.cardId = photo.id

  const imageHit = document.createElement('button')
  imageHit.type = 'button'
  imageHit.className = 'gallery-card-image-hit'
  imageHit.dataset.photoHit = 'image'
  imageHit.dataset.photoId = photo.id
  imageHit.setAttribute('aria-label', `Open ${photo.prompt}`)

  const frame = document.createElement('div')
  frame.className = 'gallery-card-frame'

  const img = document.createElement('img')
  img.className = 'gallery-card-image'
  img.alt = photo.prompt
  img.src = lowResImageUrl(photo.id)
  img.decoding = 'async'
  img.loading = 'lazy'
  img.draggable = false
  frame.append(img)
  imageHit.append(frame)

  const caption = document.createElement('div')
  caption.className = 'gallery-card-caption'
  caption.dataset.photoHit = 'caption'
  caption.dataset.photoId = photo.id
  caption.style.height = `${GRID_CAPTION_VISIBLE}px`

  const captionText = document.createElement('span')
  captionText.className = 'gallery-card-caption-text'
  captionText.textContent = photo.prompt
  caption.append(captionText)

  root.append(imageHit, caption)
  return {root, imageHit, frame, img, caption, captionText}
}

function createLineLayout(
  focusedId: string,
  viewportWidth: number,
  viewportHeight: number,
): LineCardLayout[] {
  const focusedIndex = photoIndexById.get(focusedId)
  if (focusedIndex == null) {
    throw new Error(`unknown focused photo: ${focusedId}`)
  }
  const focusedPhoto = photoGalleryData[focusedIndex]!
  const captionBlockHeight = LINE_BOTTOM_GAP + LINE_CAPTION_VISIBLE + LINE_CAPTION_BOTTOM
  const maxWidth = Math.max(280, Math.min(viewportWidth - LINE_LEFT_STRIP * 2 - 120, 820))
  const maxHeight = Math.max(220, Math.min(viewportHeight - captionBlockHeight - 110, viewportHeight * 0.68))
  const focusedSize = fitPhotoIntoBox(focusedPhoto, maxWidth, maxHeight)
  const focusedTop = Math.max(36, (viewportHeight - (focusedSize.height + captionBlockHeight)) / 2)
  const lineCenterY = focusedTop + focusedSize.height / 2
  const layouts: LineCardLayout[] = []
  const focusX = viewportWidth / 2 - focusedSize.width / 2

  layouts.push({
    id: focusedPhoto.id,
    x: focusX,
    y: focusedTop,
    width: focusedSize.width,
    height: focusedSize.height,
    focused: true,
    opacity: 1,
    zIndex: photoGalleryData.length + 20,
  })

  let nextLeftEdge = focusX - LINE_GAP
  for (let index = focusedIndex - 1; index >= 0; index -= 1) {
    const photo = photoGalleryData[index]!
    const size = fitPhotoIntoBox(photo, maxWidth * LINE_NEIGHBOR_SCALE, maxHeight * LINE_NEIGHBOR_SCALE)
    const x = nextLeftEdge - size.width
    const distance = focusedIndex - index
    layouts.push({
      id: photo.id,
      x,
      y: lineCenterY - size.height / 2,
      width: size.width,
      height: size.height,
      focused: false,
      opacity: Math.max(0.18, 1 - distance * 0.14),
      zIndex: photoGalleryData.length - distance,
    })
    nextLeftEdge = x - LINE_GAP
  }

  let nextRightEdge = focusX + focusedSize.width + LINE_GAP
  for (let index = focusedIndex + 1; index < photoGalleryData.length; index += 1) {
    const photo = photoGalleryData[index]!
    const size = fitPhotoIntoBox(photo, maxWidth * LINE_NEIGHBOR_SCALE, maxHeight * LINE_NEIGHBOR_SCALE)
    const distance = index - focusedIndex
    layouts.push({
      id: photo.id,
      x: nextRightEdge,
      y: lineCenterY - size.height / 2,
      width: size.width,
      height: size.height,
      focused: false,
      opacity: Math.max(0.18, 1 - distance * 0.14),
      zIndex: photoGalleryData.length - distance,
    })
    nextRightEdge += size.width + LINE_GAP
  }

  return layouts
}

function fitPhotoIntoBox(photo: PhotoData, maxWidth: number, maxHeight: number) {
  const scale = Math.min(maxWidth / photo.w, maxHeight / photo.h)
  return {
    width: photo.w * scale,
    height: photo.h * scale,
  }
}

function offsetFocusedPhoto(currentId: string, delta: number): string {
  const currentIndex = photoIndexById.get(currentId)
  if (currentIndex == null) return currentId
  const nextIndex = Math.max(0, Math.min(photoGalleryData.length - 1, currentIndex + delta))
  return photoGalleryData[nextIndex]!.id
}

function normalizeFocusedId(photoId: string | null): string | null {
  if (photoId == null) return null
  return photoIndexById.has(photoId) ? photoId : null
}

function readScrollTop(): number {
  return window.scrollY
}

function replaceHash(hash: string) {
  const baseUrl = `${location.pathname}${location.search}`
  history.replaceState(history.state, '', hash === '' ? baseUrl : `${baseUrl}${hash}`)
}

function selectCaptionText(photoId: string) {
  const card = domCache.gridCards.get(photoId)
  if (card == null) return
  const selection = window.getSelection()
  if (selection == null) return
  const range = document.createRange()
  range.selectNodeContents(card.captionText)
  selection.removeAllRanges()
  selection.addRange(range)
}

function maybeStartScenario() {
  if (scenario === '' || st.scenarioStarted || viewSnapshot == null) return
  st.scenarioStarted = true
  publishReport({phase: 'running', requestId, scenario})
  void runScenario(scenario).catch((error: unknown) => {
    publishReport({
      phase: 'error',
      requestId,
      scenario,
      message: error instanceof Error ? error.message : String(error),
    })
  })
}

async function runScenario(currentScenario: string) {
  switch (currentScenario) {
    case 'hash-sync':
      await runHashSyncScenario()
      return
    case 'caption-selection':
      await runCaptionSelectionScenario()
      return
    case 'dismiss-restore':
      await runDismissRestoreScenario()
      return
    case 'occlusion':
      await runOcclusionScenario()
      return
    default:
      throw new Error(`unknown scenario: ${currentScenario}`)
  }
}

async function runHashSyncScenario() {
  await waitFor('initial focused photo from the hash', () => st.focusedId != null)
  const initialFocusedId = st.focusedId
  if (initialFocusedId == null) {
    throw new Error('hash-sync scenario never received an initial focused photo')
  }
  clickPoint(lineOverlay, viewSnapshot!.viewportWidth - 40, viewSnapshot!.viewportHeight / 2)
  const expectedFocusedId = offsetFocusedPhoto(initialFocusedId, 1)
  await waitFor('next focused photo after right-strip click', () => st.focusedId === expectedFocusedId)
  publishReady({
    initialFocusedId,
    focusedId: st.focusedId,
    finalHash: location.hash,
    mode: snapshotMode(),
  })
}

async function runCaptionSelectionScenario() {
  const targetPhoto = photoGalleryData[2]!
  await waitFor('caption card to mount', () => domCache.gridCards.has(targetPhoto.id))
  const card = requireGridCard(targetPhoto.id)
  clickCentered(card.caption)
  await waitFor('caption text selection', () => window.getSelection()?.toString() === targetPhoto.prompt)
  publishReady({
    selectedText: window.getSelection()?.toString() ?? '',
    focusedId: st.focusedId,
    finalHash: location.hash,
    mode: snapshotMode(),
  })
}

async function runDismissRestoreScenario() {
  const targetPhoto = photoGalleryData[15]!
  const targetRowTop = getRowTopForPhoto(viewSnapshot!.layout, targetPhoto.id)
  const startingScrollTop = Math.max(targetRowTop - 180, 0)
  window.scrollTo({top: startingScrollTop})
  await waitFor('target row to scroll into view', () => {
    if (viewSnapshot == null) return false
    return Math.abs(viewSnapshot.scrollTop - startingScrollTop) < 6 && domCache.gridCards.has(targetPhoto.id)
  })
  clickCentered(requireGridCard(targetPhoto.id).imageHit)
  await waitFor('line mode for the target photo', () => st.focusedId === targetPhoto.id)
  clickPoint(lineOverlay, viewSnapshot!.viewportWidth / 2, viewSnapshot!.viewportHeight / 2)
  await waitFor('grid mode after dismiss', () => st.focusedId == null)
  await waitFor('dismiss restore settles near 40px', () => {
    if (viewSnapshot == null) return false
    const gap = getRowTopForPhoto(viewSnapshot.layout, targetPhoto.id) - viewSnapshot.scrollTop
    return gap >= 34 && gap <= 46
  })
  const rowGapPx = getRowTopForPhoto(viewSnapshot!.layout, targetPhoto.id) - viewSnapshot!.scrollTop
  publishReady({
    focusedId: st.focusedId,
    finalHash: location.hash,
    mode: snapshotMode(),
    rowGapPx,
  })
}

async function runOcclusionScenario() {
  const targetScrollTop = Math.max(viewSnapshot!.layout.totalHeight * 0.5, 0)
  window.scrollTo({top: targetScrollTop})
  await waitFor('occluded scroll position', () => {
    if (viewSnapshot == null) return false
    return Math.abs(viewSnapshot.scrollTop - targetScrollTop) < 8
  })
  publishReady({
    finalHash: location.hash,
    mode: snapshotMode(),
    mountedCount: domCache.gridCards.size,
    itemCount: photoGalleryData.length,
  })
}

function publishReady(extra: Omit<AutomationReport, 'phase' | 'requestId' | 'scenario'>) {
  publishReport({
    phase: 'ready',
    requestId,
    scenario,
    ...extra,
  })
}

function publishReport(report: AutomationReport) {
  reportNode.textContent = JSON.stringify(report)
}

function snapshotMode(): 'grid' | 'line' {
  return st.focusedId == null ? 'grid' : 'line'
}

async function waitFor(label: string, predicate: () => boolean, timeoutMs = 8_000) {
  const startedAt = performance.now()
  while (performance.now() - startedAt < timeoutMs) {
    if (predicate()) return
    await nextFrame()
  }
  throw new Error(`timed out waiting for ${label}`)
}

function nextFrame(): Promise<void> {
  scheduleRender()
  return new Promise((resolve) => {
    requestAnimationFrame(() => resolve())
  })
}

function clickCentered(target: HTMLElement) {
  const rect = target.getBoundingClientRect()
  clickPoint(target, rect.left + rect.width / 2, rect.top + rect.height / 2)
}

function clickPoint(target: EventTarget, clientX: number, clientY: number) {
  target.dispatchEvent(
    new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      composed: true,
      clientX,
      clientY,
    }),
  )
}

function requireGridCard(photoId: string): GridCardDom {
  const card = domCache.gridCards.get(photoId)
  if (card == null) {
    throw new Error(`missing mounted grid card: ${photoId}`)
  }
  return card
}

function requireElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id)
  if (!(element instanceof HTMLElement)) {
    throw new Error(`missing required element #${id}`)
  }
  return element as T
}
