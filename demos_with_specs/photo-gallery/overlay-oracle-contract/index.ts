import {
  GRID_CAPTION_HEIGHT,
  GRID_GAP,
  GRID_SIDE_PADDING,
  GRID_TOP_PADDING,
  LINE_CAPTION_HEIGHT,
  LINE_CARD_GAP,
  LINE_IMAGE_TO_BOTTOM_GAP,
  LINE_NEIGHBOR_SCALE,
  LINE_TOP_PADDING_FLOOR,
  computeGridLayout,
  resolveLineHitArea,
} from './layout'
import { photoGalleryData, type PhotoData } from './data'

type Report = {
  phase: 'loading' | 'ready' | 'error'
  requestId: string
  scenario: string
  focusedId: string | null
  hash: string
  scrollLocked: boolean
  selectedText: string | null
  restoredId: string | null
  restoredRowTop: number | null
  mountedCount: number
  totalCount: number
  message?: string
}

const params = new URLSearchParams(location.search)
const requestId = params.get('requestId') ?? ''
const scenario = params.get('scenario') ?? ''

const app = document.querySelector<HTMLDivElement>('#app')
const reportNode = document.querySelector<HTMLScriptElement>('#oracle-report')

if (!app || !reportNode) {
  throw new Error('missing app mount')
}

const state = {
  focusedId: decodeHash(location.hash),
  selectedText: null as string | null,
  restoredId: null as string | null,
  restoredRowTop: null as number | null,
  message: undefined as string | undefined,
}

let renderQueued = false

function decodeHash(hash: string) {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash
  return raw ? decodeURIComponent(raw) : null
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function photoById(id: string | null) {
  return id ? photoGalleryData.find(photo => photo.id === id) ?? null : null
}

function focusedIndex() {
  return photoGalleryData.findIndex(photo => photo.id === state.focusedId)
}

function currentGridLayout() {
  return computeGridLayout(photoGalleryData, {
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
    scrollTop: window.scrollY,
  })
}

function setBodyMode() {
  document.body.dataset.mode = state.focusedId ? 'line' : 'grid'
  document.body.style.overflow = state.focusedId ? 'hidden' : ''
}

function publishReport(phase: Report['phase'] = 'ready') {
  const layout = currentGridLayout()
  const report: Report = {
    phase,
    requestId,
    scenario,
    focusedId: state.focusedId,
    hash: location.hash,
    scrollLocked: Boolean(state.focusedId),
    selectedText: state.selectedText,
    restoredId: state.restoredId,
    restoredRowTop: state.restoredRowTop,
    mountedCount: layout.mountedIds.length,
    totalCount: photoGalleryData.length,
    message: state.message,
  }

  reportNode.textContent = JSON.stringify(report)
}

function injectStyles() {
  const style = document.createElement('style')
  style.textContent = `
    :root {
      color-scheme: dark;
      font-family: "Avenir Next", "Trebuchet MS", "Segoe UI", sans-serif;
    }

    html, body {
      margin: 0;
      min-height: 100%;
      background: #071222;
      color: #edf4ff;
    }

    body {
      overflow-y: auto;
    }

    #app {
      min-height: 100vh;
    }

    .gallery-shell {
      position: relative;
      min-height: 100vh;
    }

    .grid-shell {
      position: relative;
      width: 100%;
    }

    .grid-row {
      position: absolute;
      left: ${GRID_SIDE_PADDING}px;
      right: ${GRID_SIDE_PADDING}px;
      display: grid;
      gap: ${GRID_GAP}px;
      align-items: start;
    }

    .photo-card {
      background: #0d1c31;
      border-radius: 22px;
      overflow: hidden;
      box-shadow: 0 20px 48px rgba(0, 0, 0, 0.28);
      min-width: 0;
    }

    .photo-image-button {
      all: unset;
      display: block;
      width: 100%;
      cursor: pointer;
      background: #09111d;
    }

    .photo-image-button img {
      display: block;
      width: var(--image-width);
      height: var(--image-height);
      margin: 0 auto;
      object-fit: cover;
      border-radius: 16px 16px 0 0;
    }

    .photo-caption {
      box-sizing: border-box;
      height: ${GRID_CAPTION_HEIGHT}px;
      padding: 0 16px 8px;
      font-size: 44px;
      line-height: 44px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      cursor: text;
      user-select: text;
    }

    .line-overlay {
      position: fixed;
      inset: 0;
      z-index: 10;
      background: rgba(7, 18, 34, 0.94);
      display: flex;
      align-items: flex-start;
      justify-content: center;
      padding: ${LINE_TOP_PADDING_FLOOR}px 24px 24px;
      overflow: hidden;
    }

    .line-track {
      display: flex;
      align-items: flex-start;
      gap: ${LINE_CARD_GAP}px;
      max-width: 100%;
    }

    .line-card {
      background: #0d1c31;
      border-radius: 24px;
      overflow: hidden;
      box-shadow: 0 22px 56px rgba(0, 0, 0, 0.34);
      min-width: 0;
      flex: 0 0 auto;
    }

    .line-card[data-focused="true"] {
      width: min(680px, calc(100vw - 240px));
    }

    .line-card[data-focused="false"] {
      transform: scale(${LINE_NEIGHBOR_SCALE});
      transform-origin: top center;
      opacity: 0.82;
    }

    .line-card img {
      display: block;
      width: 100%;
      height: auto;
    }

    .line-caption {
      box-sizing: border-box;
      height: ${LINE_CAPTION_HEIGHT + LINE_IMAGE_TO_BOTTOM_GAP}px;
      padding: 0 20px 8px;
      font-size: 64px;
      line-height: 64px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    #oracle-report {
      display: none;
    }
  `
  document.head.append(style)
}

function renderGrid(layout = currentGridLayout()) {
  const visibleRows = layout.rows.filter(row => layout.mountedIds.some(id => row.itemIds.includes(id)))
  const rows = visibleRows.length > 0 ? visibleRows : layout.rows.slice(0, 1)

  app.innerHTML = `
    <main class="gallery-shell">
      <div class="grid-shell" style="height:${layout.totalHeight}px">
        ${rows
          .map(row => {
            const rowItems = row.itemIds
              .map(id => {
                const photo = photoGalleryData.find(item => item.id === id)
                const item = layout.items.find(value => value.id === id)

                if (!photo || !item) {
                  return ''
                }

                return renderGridCard(photo, item)
              })
              .join('')

            return `
              <section
                class="grid-row"
                data-grid-row="${row.rowIndex}"
                style="top:${row.top}px;height:${row.height}px;grid-template-columns:repeat(${layout.columns}, minmax(0, 1fr));"
              >
                ${rowItems}
              </section>
            `
          })
          .join('')}
      </div>
      ${state.focusedId ? renderLineOverlay() : ''}
    </main>
  `

  setBodyMode()
  bindGridHandlers()
  bindLineHandler()
  publishReport('ready')
}

function renderGridCard(photo: PhotoData, item: { sizeX: number; imageHeight: number; sizeY: number }) {
  return `
    <article class="photo-card" data-photo-id="${photo.id}" style="height:${item.sizeY}px">
      <button
        type="button"
        class="photo-image-button"
        data-photo-image
        data-photo-id="${photo.id}"
        style="--image-width:${item.sizeX}px;--image-height:${item.imageHeight}px;"
        aria-label="Open ${escapeHtml(photo.prompt)}"
      >
        <img src="https://cdn.midjourney.com/${photo.id}_384_N.webp" width="${photo.w}" height="${photo.h}" alt="${escapeHtml(photo.prompt)}" />
      </button>
      <div class="photo-caption" data-photo-caption data-photo-id="${photo.id}">${escapeHtml(photo.prompt)}</div>
    </article>
  `
}

function renderLineCard(photo: PhotoData, focused: boolean) {
  const lineWidth = focused ? Math.min(680, Math.max(360, window.innerWidth - 280)) : Math.max(240, Math.round(Math.min(680, Math.max(360, window.innerWidth - 280)) * LINE_NEIGHBOR_SCALE))

  return `
    <section class="line-card" data-focused="${focused ? 'true' : 'false'}" style="width:${lineWidth}px">
      <img src="https://cdn.midjourney.com/${photo.id}.webp" width="${photo.w}" height="${photo.h}" alt="${escapeHtml(photo.prompt)}" />
      <div class="line-caption">${escapeHtml(photo.prompt)}</div>
    </section>
  `
}

function renderLineOverlay() {
  const index = focusedIndex()
  const previous = index > 0 ? photoGalleryData[index - 1] : null
  const focused = photoById(state.focusedId)
  const next = index >= 0 && index < photoGalleryData.length - 1 ? photoGalleryData[index + 1] : null

  if (!focused) {
    return ''
  }

  return `
    <section class="line-overlay" data-line-overlay aria-label="Focused image overlay">
      <div class="line-track">
        ${previous ? renderLineCard(previous, false) : ''}
        ${renderLineCard(focused, true)}
        ${next ? renderLineCard(next, false) : ''}
      </div>
    </section>
  `
}

function bindGridHandlers() {
  app.querySelectorAll<HTMLButtonElement>('[data-photo-image]').forEach(button => {
    button.addEventListener('click', event => {
      event.preventDefault()
      const photoId = button.dataset.photoId ?? null
      if (!photoId) {
        return
      }

      openFocusedPhoto(photoId)
    })
  })

  app.querySelectorAll<HTMLDivElement>('[data-photo-caption]').forEach(caption => {
    caption.addEventListener('click', event => {
      event.preventDefault()
      event.stopPropagation()
      selectCaption(caption)
    })
  })
}

function bindLineHandler() {
  const overlay = app.querySelector<HTMLElement>('[data-line-overlay]')
  if (!overlay) {
    return
  }

  overlay.addEventListener('click', event => {
    const zone = resolveLineHitArea(event.clientX, window.innerWidth)

    if (zone === 'previous') {
      stepFocusedPhoto(-1)
      return
    }

    if (zone === 'next') {
      stepFocusedPhoto(1)
      return
    }

    dismissFocusedPhoto()
  })
}

function selectCaption(caption: HTMLDivElement) {
  const selection = window.getSelection()
  if (!selection) {
    return
  }

  const range = document.createRange()
  range.selectNodeContents(caption)
  selection.removeAllRanges()
  selection.addRange(range)
  state.selectedText = caption.textContent ?? ''
  state.restoredId = null
  state.restoredRowTop = null
  publishReport('ready')
}

function openFocusedPhoto(photoId: string) {
  if (location.hash === `#${photoId}` && state.focusedId === photoId) {
    return
  }

  state.selectedText = null
  location.hash = photoId
  syncFocusedPhotoFromHash()
}

function stepFocusedPhoto(delta: -1 | 1) {
  const index = focusedIndex()
  if (index === -1) {
    return
  }

  const nextIndex = Math.min(photoGalleryData.length - 1, Math.max(0, index + delta))
  const nextPhoto = photoGalleryData[nextIndex]
  if (!nextPhoto || nextPhoto.id === state.focusedId) {
    return
  }

  state.selectedText = null
  location.hash = nextPhoto.id
  syncFocusedPhotoFromHash()
}

function dismissFocusedPhoto() {
  const photoId = state.focusedId
  if (!photoId) {
    return
  }

  const layout = currentGridLayout()
  const row = layout.rows.find(rowLayout => rowLayout.itemIds.includes(photoId))
  const targetTop = row ? Math.max(0, row.top - GRID_TOP_PADDING) : 0

  history.replaceState(null, '', `${location.pathname}${location.search}`)
  state.focusedId = null
  state.selectedText = null
  state.restoredId = photoId
  state.restoredRowTop = null
  setBodyMode()
  renderGrid()

  requestAnimationFrame(() => {
    window.scrollTo({ top: targetTop })
    requestAnimationFrame(() => {
      state.restoredRowTop = row ? row.top - window.scrollY : null
      publishReport('ready')
    })
  })
}

function syncFocusedPhotoFromHash() {
  const photoId = decodeHash(location.hash)
  const nextFocusedId = photoGalleryData.some(photo => photo.id === photoId) ? photoId : null

  if (state.focusedId === nextFocusedId) {
    publishReport('ready')
    return
  }

  state.focusedId = nextFocusedId
  state.restoredId = null
  state.restoredRowTop = null
  state.selectedText = null
  setBodyMode()
  renderGrid()
}

function queueRender() {
  if (renderQueued) {
    return
  }

  renderQueued = true
  requestAnimationFrame(() => {
    renderQueued = false
    renderGrid()
  })
}

function installGlobalListeners() {
  window.addEventListener('hashchange', syncFocusedPhotoFromHash)
  window.addEventListener('resize', queueRender)
  window.addEventListener('scroll', queueRender, { passive: true })
}

function installLineModeClasses() {
  if (state.focusedId) {
    document.body.dataset.mode = 'line'
  }
}

function boot() {
  injectStyles()
  installGlobalListeners()
  installLineModeClasses()
  publishReport('loading')
  syncFocusedPhotoFromHash()
  if (!app.innerHTML) {
    renderGrid()
  }
}

try {
  boot()
} catch (error) {
  state.message = error instanceof Error ? error.message : String(error)
  publishReport('error')
  throw error
}
