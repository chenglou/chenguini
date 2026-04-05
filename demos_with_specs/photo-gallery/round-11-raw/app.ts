import {
  getHighResPhotoUrl,
  getLowResPhotoUrl,
  photoGalleryData,
  type PhotoData,
} from './data'
import {
  computeGridLayout,
  DISMISS_RESTORE_GAP,
  fitPhotoIntoBox,
  LINE_NEIGHBOR_SCALE,
  LINE_SIDE_STRIP_WIDTH,
  routeLineModeHit,
} from './layout'

type GalleryMode = 'grid' | 'line'

type ScenarioReport = {
  phase: 'loading' | 'running' | 'ready' | 'error'
  requestId: string
  scenario: string
  hash?: string
  mode?: GalleryMode
  focusedId?: string | null
  selectedText?: string
  mountedCount?: number
  totalCount?: number
  rowTop?: number
  gapAboveRow?: number
  message?: string
}

const params = new URLSearchParams(window.location.search)
const scenario = params.get('scenario') ?? ''
const requestId = params.get('requestId') ?? ''
const photoById = new Map(photoGalleryData.map(photo => [photo.id, photo]))

type State = {
  focusedId: string | null
  lastDismissedFocusedId: string | null
}

const state: State = {
  focusedId: readFocusedIdFromHash(),
  lastDismissedFocusedId: null,
}

export function startPhotoGalleryApp(): void {
  const root = document.querySelector<HTMLElement>('#app')
  const reportNode = document.querySelector<HTMLScriptElement>('#scenario-report')

  if (root === null || reportNode === null) {
    throw new Error('Photo gallery root nodes are missing')
  }

  root.innerHTML = `
    <a
      class="github-link"
      href="https://github.com/chenglou/vibescript"
      target="_blank"
      rel="noreferrer"
    >
      View on GitHub
    </a>
    <div class="gallery-scroll" data-mode="grid"></div>
    <div class="line-overlay" hidden></div>
  `

  const scrollContainer = root.querySelector<HTMLDivElement>('.gallery-scroll')
  const overlay = root.querySelector<HTMLDivElement>('.line-overlay')

  if (scrollContainer === null || overlay === null) {
    throw new Error('Photo gallery containers are missing')
  }

  scrollContainer.addEventListener('scroll', () => {
    render(root, scrollContainer, overlay)
  })

  scrollContainer.addEventListener('click', event => {
    handleGridClick(event)
  })

  overlay.addEventListener('click', event => {
    if (state.focusedId === null) {
      return
    }

    const action = routeLineModeHit({
      viewportWidth: overlay.clientWidth || window.innerWidth,
      pointerX: event.clientX,
    })

    if (action === 'dismiss') {
      dismissLineMode(scrollContainer, root, overlay)
      return
    }

    moveFocusBy(action === 'previous' ? -1 : 1)
  })

  window.addEventListener('hashchange', () => {
    state.focusedId = readFocusedIdFromHash()
    render(root, scrollContainer, overlay)
  })

  window.addEventListener('resize', () => {
    render(root, scrollContainer, overlay)
  })

  render(root, scrollContainer, overlay)

  if (scenario !== '') {
    publishReport(reportNode, {
      phase: 'loading',
      requestId,
      scenario,
      hash: window.location.hash,
      mode: getMode(),
      focusedId: state.focusedId,
    })
    void runScenario({root, scrollContainer, overlay, reportNode})
  }
}

async function runScenario({
  root,
  scrollContainer,
  overlay,
  reportNode,
}: {
  root: HTMLElement
  scrollContainer: HTMLDivElement
  overlay: HTMLDivElement
  reportNode: HTMLScriptElement
}): Promise<void> {
  publishReport(reportNode, {
    phase: 'running',
    requestId,
    scenario,
    hash: window.location.hash,
    mode: getMode(),
    focusedId: state.focusedId,
  })

  try {
    await waitForPaint()

    switch (scenario) {
      case 'hash-navigation': {
        clickImageButton(photoGalleryData[5]!.id)
        await waitForPaint()
        dispatchOverlayClick(overlay, 'next')
        await waitForPaint()
        publishReport(reportNode, {
          phase: 'ready',
          requestId,
          scenario,
          hash: window.location.hash,
          mode: getMode(),
          focusedId: state.focusedId,
        })
        return
      }

      case 'caption-selection': {
        clickCaptionButton(photoGalleryData[4]!.id)
        await waitForPaint()
        publishReport(reportNode, {
          phase: 'ready',
          requestId,
          scenario,
          hash: window.location.hash,
          mode: getMode(),
          focusedId: state.focusedId,
          selectedText: window.getSelection()?.toString() ?? '',
        })
        return
      }

      case 'dismiss-restore': {
        scrollContainer.scrollTop = getLayout(scrollContainer).totalHeight
        render(root, scrollContainer, overlay)
        await waitForPaint()
        clickImageButton(photoGalleryData[23]!.id)
        await waitForPaint()
        focusPhoto(photoGalleryData[16]!.id)
        await waitForPaint()
        dispatchOverlayClick(overlay, 'dismiss')
        await waitForPaint()
        const layout = getLayout(scrollContainer)
        const focusedCard = findCardById(layout.cards, photoGalleryData[16]!.id)
        publishReport(reportNode, {
          phase: 'ready',
          requestId,
          scenario,
          hash: window.location.hash,
          mode: getMode(),
          focusedId: photoGalleryData[16]!.id,
          gapAboveRow: focusedCard.y - scrollContainer.scrollTop,
          rowTop: focusedCard.y,
        })
        return
      }

      case 'occlusion': {
        scrollContainer.scrollTop = 700
        render(root, scrollContainer, overlay)
        await waitForPaint()
        const layout = getLayout(scrollContainer)
        publishReport(reportNode, {
          phase: 'ready',
          requestId,
          scenario,
          hash: window.location.hash,
          mode: getMode(),
          focusedId: state.focusedId,
          mountedCount: layout.mountedPhotoIds.length,
          totalCount: photoGalleryData.length,
        })
        return
      }

      default: {
        throw new Error(`Unknown scenario: ${scenario}`)
      }
    }
  } catch (error) {
    publishReport(reportNode, {
      phase: 'error',
      requestId,
      scenario,
      hash: window.location.hash,
      mode: getMode(),
      focusedId: state.focusedId,
      message: error instanceof Error ? error.message : String(error),
    })
  }
}

function render(root: HTMLElement, scrollContainer: HTMLDivElement, overlay: HTMLDivElement): void {
  const layout = getLayout(scrollContainer)
  const mountedPhotoIds = new Set(layout.mountedPhotoIds)
  scrollContainer.dataset['mode'] = getMode()
  scrollContainer.style.overflowY = state.focusedId === null ? 'auto' : 'hidden'
  scrollContainer.innerHTML = `
    <div class="grid-spacer" style="height:${layout.totalHeight}px">
      ${layout.cards
        .filter(card => mountedPhotoIds.has(card.id))
        .map(card => renderGridCard(card))
        .join('')}
    </div>
  `

  if (state.focusedId === null) {
    overlay.hidden = true
    overlay.innerHTML = ''
    root.dataset['mode'] = 'grid'
    return
  }

  overlay.hidden = false
  overlay.innerHTML = renderLineMode(state.focusedId, overlay.clientWidth || window.innerWidth)
  root.dataset['mode'] = 'line'
}

function renderGridCard(card: {
  id: string
  x: number
  y: number
  width: number
  height: number
  imageWidth: number
  imageHeight: number
}): string {
  const photo = photoById.get(card.id)
  if (photo === undefined) {
    throw new Error(`Missing photo ${card.id}`)
  }

  const photoUrl = getPhotoUrl(photo, 'grid')

  return `
    <article
      class="grid-card"
      data-photo-id="${escapeHtml(photo.id)}"
      style="left:${card.x}px; top:${card.y}px; width:${card.width}px; height:${card.height}px;"
    >
      <button
        class="grid-image-button"
        type="button"
        data-photo-id="${escapeHtml(photo.id)}"
        data-role="image-button"
        aria-label="Open ${escapeHtml(photo.prompt)}"
      >
        <span class="grid-image-frame" style="height:${card.imageHeight}px;">
          <img
            class="grid-image"
            src="${escapeHtml(photoUrl)}"
            alt="${escapeHtml(photo.prompt)}"
            draggable="false"
            loading="lazy"
            style="width:${card.imageWidth}px; height:${card.imageHeight}px;"
          />
        </span>
      </button>
      <button
        class="grid-caption-button"
        type="button"
        data-photo-id="${escapeHtml(photo.id)}"
        data-role="caption-button"
      >
        <span class="grid-caption-text">${escapeHtml(photo.prompt)}</span>
      </button>
    </article>
  `
}

function renderLineMode(focusedId: string, viewportWidth: number): string {
  const focusedIndex = photoGalleryData.findIndex(photo => photo.id === focusedId)
  if (focusedIndex === -1) {
    throw new Error(`Missing focused photo ${focusedId}`)
  }

  const focusedPhoto = photoGalleryData[focusedIndex]!
  const previousPhoto = photoGalleryData[focusedIndex - 1] ?? null
  const nextPhoto = photoGalleryData[focusedIndex + 1] ?? null
  const mainStageWidth = Math.max(320, viewportWidth - LINE_SIDE_STRIP_WIDTH * 2)
  const focusedBoxMaxWidth = Math.min(560, mainStageWidth * 0.42)
  const neighborBoxMaxWidth = focusedBoxMaxWidth * LINE_NEIGHBOR_SCALE

  return `
    <div class="line-hit-zones" aria-hidden="true">
      <div class="line-hit-zone line-hit-zone-left">Prev</div>
      <div class="line-hit-zone line-hit-zone-middle">Close</div>
      <div class="line-hit-zone line-hit-zone-right">Next</div>
    </div>
    <div class="line-stage">
      <div class="line-track">
        ${renderLineCard(previousPhoto, neighborBoxMaxWidth, false)}
        ${renderLineCard(focusedPhoto, focusedBoxMaxWidth, true)}
        ${renderLineCard(nextPhoto, neighborBoxMaxWidth, false)}
      </div>
    </div>
  `
}

function renderLineCard(photo: PhotoData | null, boxMaxWidth: number, focused: boolean): string {
  if (photo === null) {
    return '<div class="line-card line-card-empty" aria-hidden="true"></div>'
  }

  const fittedPhoto = fitPhotoIntoBox({
    naturalWidth: photo.w,
    naturalHeight: photo.h,
    boxMaxWidth,
  })

  const photoUrl = getPhotoUrl(photo, focused ? 'line' : 'grid')

  return `
    <article class="line-card${focused ? ' is-focused' : ''}">
      <div class="line-image-frame">
        <img
          class="line-image"
          src="${escapeHtml(photoUrl)}"
          alt="${escapeHtml(photo.prompt)}"
          draggable="false"
          style="width:${fittedPhoto.width}px; height:${fittedPhoto.height}px;"
        />
      </div>
      <div class="line-caption">${escapeHtml(photo.prompt)}</div>
    </article>
  `
}

function handleGridClick(event: Event): void {
  const target = event.target
  if (!(target instanceof HTMLElement)) {
    return
  }

  const imageButton = target.closest<HTMLElement>('[data-role="image-button"]')
  if (imageButton !== null) {
    event.preventDefault()
    const photoId = imageButton.dataset['photoId']
    if (photoId === undefined) {
      throw new Error('Image button is missing a photo id')
    }
    focusPhoto(photoId)
    return
  }

  const captionButton = target.closest<HTMLElement>('[data-role="caption-button"]')
  if (captionButton !== null) {
    event.preventDefault()
    const selectionTarget = captionButton.querySelector<HTMLElement>('.grid-caption-text') ?? captionButton
    selectText(selectionTarget)
  }
}

function focusPhoto(photoId: string): void {
  if (state.focusedId === photoId) {
    return
  }

  window.location.hash = photoId
}

function dismissLineMode(
  scrollContainer: HTMLDivElement,
  root: HTMLElement,
  overlay: HTMLDivElement,
): void {
  const dismissedId = state.focusedId
  if (dismissedId === null) {
    return
  }

  state.lastDismissedFocusedId = dismissedId
  clearFocusedHash()
  restoreFocusedRow(scrollContainer, dismissedId)
  render(root, scrollContainer, overlay)
}

function moveFocusBy(offset: number): void {
  if (state.focusedId === null) {
    return
  }

  const currentIndex = photoGalleryData.findIndex(photo => photo.id === state.focusedId)
  if (currentIndex === -1) {
    return
  }

  const nextIndex = Math.min(Math.max(currentIndex + offset, 0), photoGalleryData.length - 1)
  focusPhoto(photoGalleryData[nextIndex]!.id)
}

function restoreFocusedRow(scrollContainer: HTMLDivElement, photoId: string): void {
  const layout = getLayout(scrollContainer)
  const focusedCard = findCardById(layout.cards, photoId)
  const rowTop = focusedCard.y
  const rowBottom = focusedCard.y + layout.rowHeights[focusedCard.row]!
  const viewportTop = scrollContainer.scrollTop
  const viewportBottom = viewportTop + scrollContainer.clientHeight

  if (rowTop < viewportTop + DISMISS_RESTORE_GAP || rowBottom > viewportBottom) {
    scrollContainer.scrollTop = Math.max(0, rowTop - DISMISS_RESTORE_GAP)
  }
}

function getLayout(scrollContainer: HTMLDivElement) {
  return computeGridLayout({
    photos: photoGalleryData,
    viewportWidth: scrollContainer.clientWidth || window.innerWidth,
    viewportHeight: scrollContainer.clientHeight || window.innerHeight,
    scrollTop: scrollContainer.scrollTop,
  })
}

function getMode(): GalleryMode {
  return state.focusedId === null ? 'grid' : 'line'
}

function readFocusedIdFromHash(): string | null {
  const hashValue = window.location.hash.slice(1)
  if (hashValue === '') {
    return null
  }

  const focusedId = decodeURIComponent(hashValue)
  return photoById.has(focusedId) ? focusedId : null
}

function clearFocusedHash(): void {
  const nextUrl = new URL(window.location.href)
  nextUrl.hash = ''
  history.replaceState(null, '', nextUrl.toString())
  state.focusedId = null
}

function clickImageButton(photoId: string): void {
  const button = document.querySelector<HTMLElement>(
    `[data-role="image-button"][data-photo-id="${photoId}"]`,
  )
  if (button === null) {
    throw new Error(`Missing image button for ${photoId}`)
  }
  button.click()
}

function clickCaptionButton(photoId: string): void {
  const button = document.querySelector<HTMLElement>(
    `[data-role="caption-button"][data-photo-id="${photoId}"]`,
  )
  if (button === null) {
    throw new Error(`Missing caption button for ${photoId}`)
  }
  button.click()
}

function dispatchOverlayClick(
  overlay: HTMLDivElement,
  action: 'previous' | 'dismiss' | 'next',
): void {
  const rect = overlay.getBoundingClientRect()
  const clientX =
    action === 'previous'
      ? LINE_SIDE_STRIP_WIDTH / 2
      : action === 'next'
        ? rect.width - LINE_SIDE_STRIP_WIDTH / 2
        : rect.width / 2

  overlay.dispatchEvent(
    new MouseEvent('click', {
      bubbles: true,
      clientX,
      clientY: rect.height / 2,
    }),
  )
}

function selectText(element: HTMLElement): void {
  const selection = window.getSelection()
  if (selection === null) {
    return
  }

  const range = document.createRange()
  range.selectNodeContents(element)
  selection.removeAllRanges()
  selection.addRange(range)
}

function publishReport(reportNode: HTMLScriptElement, report: ScenarioReport): void {
  reportNode.textContent = JSON.stringify(report)
}

function getPhotoUrl(photo: PhotoData, mode: 'grid' | 'line'): string {
  if (scenario !== '') {
    return createPlaceholderPhotoUrl(photo)
  }

  return mode === 'grid' ? getLowResPhotoUrl(photo) : getHighResPhotoUrl(photo)
}

function createPlaceholderPhotoUrl(photo: PhotoData): string {
  const accent = `hsl(${hashText(photo.id) % 360} 74% 62%)`
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 900">
      <defs>
        <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stop-color="#16243b" />
          <stop offset="100%" stop-color="#09111f" />
        </linearGradient>
      </defs>
      <rect width="1200" height="900" fill="url(#bg)" rx="46" />
      <circle cx="960" cy="180" r="180" fill="${accent}" opacity="0.42" />
      <circle cx="220" cy="710" r="240" fill="${accent}" opacity="0.18" />
      <text
        x="96"
        y="150"
        fill="#f5f7fb"
        font-family="Avenir Next, Segoe UI, sans-serif"
        font-size="48"
        font-weight="600"
      >
        ${escapeSvgText(photo.prompt)}
      </text>
    </svg>
  `

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

function findCardById<
  TCard extends {
    id: string
  },
>(cards: TCard[], photoId: string): TCard {
  const card = cards.find(entry => entry.id === photoId)
  if (card === undefined) {
    throw new Error(`Missing card layout for ${photoId}`)
  }
  return card
}

function waitForPaint(): Promise<void> {
  return new Promise(resolve => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        resolve()
      })
    })
  })
}

function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function escapeSvgText(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}

function hashText(text: string): number {
  let hash = 0
  for (const character of text) {
    hash = (hash * 33 + character.charCodeAt(0)) >>> 0
  }
  return hash
}
