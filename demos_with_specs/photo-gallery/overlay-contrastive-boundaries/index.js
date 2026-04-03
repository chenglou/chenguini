import { photoGalleryData } from './data.js'
import {
  getDismissScrollTop,
  layoutConfig,
  measureGridLayout,
  routeLineClick,
} from './layout.js'

const root = document.getElementById('app')
if (!root) {
  throw new Error('Missing #app root')
}

const requestId =
  new URLSearchParams(window.location.search).get('requestId') ||
  `${Date.now()}-${Math.random().toString(36).slice(2)}`

const photoIndexById = new Map(photoGalleryData.map((photo, index) => [photo.id, index]))

const state = {
  mode: 'grid',
  focusId: null,
  layout: null,
}

const shell = document.createElement('div')
shell.className = 'app-shell'

const topbar = document.createElement('header')
topbar.className = 'topbar'
topbar.innerHTML = `
  <div class="topbar-copy">
    <div class="title">Photo Gallery</div>
    <div class="subtitle">Grid mode, focused line mode, hash routing, and row restore</div>
  </div>
  <a class="github-link" href="https://github.com/" aria-label="Open source on GitHub">↗</a>
`

const scrollShell = document.createElement('main')
scrollShell.className = 'scroll-shell'
scrollShell.dataset.scrollShell = 'true'

const gridCanvas = document.createElement('div')
gridCanvas.className = 'grid-canvas'

const overlay = document.createElement('div')
overlay.className = 'line-overlay'
overlay.hidden = true

const lineStage = document.createElement('div')
lineStage.className = 'line-stage'

const lineTrack = document.createElement('div')
lineTrack.className = 'line-track'

const prevZone = document.createElement('button')
prevZone.type = 'button'
prevZone.className = 'line-zone line-zone-prev'
prevZone.setAttribute('aria-label', 'Previous image')

const dismissZone = document.createElement('button')
dismissZone.type = 'button'
dismissZone.className = 'line-zone line-zone-dismiss'
dismissZone.dataset.lineDismissZone = 'true'
dismissZone.setAttribute('aria-label', 'Return to grid')

const nextZone = document.createElement('button')
nextZone.type = 'button'
nextZone.className = 'line-zone line-zone-next'
nextZone.setAttribute('aria-label', 'Next image')

lineStage.append(lineTrack, prevZone, dismissZone, nextZone)
overlay.append(lineStage)

const reportNode = document.createElement('script')
reportNode.id = 'gallery-report'
reportNode.type = 'application/json'
reportNode.textContent = JSON.stringify({
  phase: 'loading',
  requestId,
  mode: state.mode,
  focusId: state.focusId,
})

shell.append(topbar, scrollShell, overlay, reportNode)
scrollShell.append(gridCanvas)
root.replaceChildren(shell)

function getSelectedText() {
  const selection = window.getSelection()
  return selection && !selection.isCollapsed ? selection.toString() : null
}

function clearSelection() {
  const selection = window.getSelection()
  if (selection) {
    selection.removeAllRanges()
  }
}

function syncModeFromHash() {
  const hash = window.location.hash.slice(1)
  const focusId = hash ? decodeURIComponent(hash) : ''
  if (focusId && photoIndexById.has(focusId)) {
    state.mode = 'line'
    state.focusId = focusId
    return
  }
  state.mode = 'grid'
  state.focusId = null
}

function updateHash(focusId) {
  window.history.pushState(
    null,
    '',
    `${window.location.pathname}${window.location.search}#${encodeURIComponent(focusId)}`,
  )
}

function clearHash() {
  window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`)
}

function getLayout() {
  const width = Math.max(320, scrollShell.clientWidth)
  const nextLayout = measureGridLayout(photoGalleryData, width)
  state.layout = nextLayout
  return nextLayout
}

function renderGridCards(layout) {
  const [startIndex, endIndex] = layout.getMountedRange(scrollShell.scrollTop, scrollShell.clientHeight)
  gridCanvas.innerHTML = ''

  if (endIndex < startIndex) {
    return { mountedCount: 0, visibleRowRange: [0, -1] }
  }

  const fragment = document.createDocumentFragment()

  for (let index = startIndex; index <= endIndex; index += 1) {
    const photo = photoGalleryData[index]
    const rect = layout.getItemRect(index)
    if (!photo || !rect) continue

    fragment.append(renderPhotoCard(photo, rect, 'grid'))
  }

  gridCanvas.append(fragment)
  return {
    mountedCount: endIndex - startIndex + 1,
    visibleRowRange: layout.getVisibleRowRange(scrollShell.scrollTop, scrollShell.clientHeight),
  }
}

function renderLineOverlay(layout) {
  overlay.hidden = state.mode !== 'line'
  lineTrack.innerHTML = ''
  if (state.mode !== 'line' || !state.focusId) {
    return 0
  }

  const focusIndex = photoIndexById.get(state.focusId)
  if (focusIndex == null) {
    return 0
  }

  const focusWidth = Math.min(420, Math.max(260, Math.round(scrollShell.clientWidth * 0.32)))
  const items = [
    { index: focusIndex - 1, kind: 'neighbor' },
    { index: focusIndex, kind: 'focus' },
    { index: focusIndex + 1, kind: 'neighbor' },
  ].filter((item) => item.index >= 0 && item.index < photoGalleryData.length)

  const fragment = document.createDocumentFragment()
  for (const item of items) {
    const photo = photoGalleryData[item.index]
    const card = renderPhotoCard(photo, null, 'line', {
      kind: item.kind,
      width: focusWidth,
    })
    fragment.append(card)
  }

  lineTrack.append(fragment)
  return items.length
}

function renderPhotoCard(photo, rect, mode, options = {}) {
  const card = document.createElement('article')
  card.className = `photo-card${mode === 'line' ? ` line-card is-${options.kind}` : ''}`
  card.dataset.photoCard = 'true'
  card.dataset.photoId = photo.id

  if (rect) {
    card.style.left = `${Math.round(rect.left)}px`
    card.style.top = `${Math.round(rect.top)}px`
    card.style.width = `${Math.round(rect.width)}px`
    card.style.height = `${Math.round(rect.height)}px`
  } else if (mode === 'line') {
    card.style.width = `${options.width}px`
  }

  const imageButton = document.createElement(mode === 'grid' ? 'button' : 'div')
  imageButton.className = mode === 'grid' ? 'photo-image-button' : 'photo-image-button'
  if (mode === 'grid') {
    imageButton.type = 'button'
    imageButton.dataset.photoImage = 'true'
    imageButton.setAttribute('aria-label', `Open ${photo.prompt}`)
    imageButton.addEventListener('click', () => enterLineMode(photo.id))
  }

  const imageFrame = document.createElement('div')
  imageFrame.className = 'photo-image-frame'

  const img = document.createElement('img')
  img.className = 'photo-image'
  img.alt = photo.prompt
  img.decoding = 'async'
  img.loading = 'lazy'
  img.src = `https://cdn.midjourney.com/${photo.id}_384_N.webp`
  img.srcset = `https://cdn.midjourney.com/${photo.id}_384_N.webp 1x, https://cdn.midjourney.com/${photo.id}.webp 2x`
  imageFrame.append(img)
  imageButton.append(imageFrame)

  const caption = document.createElement('p')
  caption.className = 'photo-caption'
  caption.dataset.photoCaption = 'true'
  caption.textContent = photo.prompt
  caption.addEventListener('click', (event) => {
    event.preventDefault()
    event.stopPropagation()
    selectCaptionText(caption)
    if (mode === 'grid') {
      state.mode = 'grid'
      state.focusId = null
      clearHash()
      publishReport()
    }
  })

  card.append(imageButton, caption)
  return card
}

function selectCaptionText(element) {
  const selection = window.getSelection()
  if (!selection) return
  const range = document.createRange()
  range.selectNodeContents(element)
  selection.removeAllRanges()
  selection.addRange(range)
}

function enterLineMode(id) {
  clearSelection()
  state.mode = 'line'
  state.focusId = id
  updateHash(id)
  render()
}

function dismissToGrid() {
  const focusId = state.focusId
  const focusIndex = focusId == null ? null : photoIndexById.get(focusId) ?? null
  const focusRow = focusIndex == null ? null : state.layout?.getRowForItemIndex(focusIndex) ?? null
  if (focusRow) {
    const nextScrollTop = getDismissScrollTop({
      rowTop: focusRow.top,
      rowBottom: focusRow.bottom,
      scrollTop: scrollShell.scrollTop,
      viewportHeight: scrollShell.clientHeight,
    })
    if (nextScrollTop !== scrollShell.scrollTop) {
      scrollShell.scrollTop = nextScrollTop
    }
  }

  state.mode = 'grid'
  state.focusId = null
  clearHash()
  render()
}

function moveFocus(delta) {
  if (!state.focusId) return
  const focusIndex = photoIndexById.get(state.focusId)
  if (focusIndex == null) return
  const nextIndex = focusIndex + delta
  if (nextIndex < 0 || nextIndex >= photoGalleryData.length) return
  enterLineMode(photoGalleryData[nextIndex].id)
}

function renderLineZones() {
  prevZone.onclick = () => moveFocus(-1)
  dismissZone.onclick = () => dismissToGrid()
  nextZone.onclick = () => moveFocus(1)
}

function publishReport() {
  const layout = state.layout ?? getLayout()
  const [visibleStartRow, visibleEndRow] = layout.getVisibleRowRange(
    scrollShell.scrollTop,
    scrollShell.clientHeight,
  )
  const [mountedStartIndex, mountedEndIndex] = layout.getMountedRange(
    scrollShell.scrollTop,
    scrollShell.clientHeight,
  )
  const focusIndex = state.focusId == null ? null : photoIndexById.get(state.focusId) ?? null
  const focusRow = focusIndex == null ? null : layout.getRowForItemIndex(focusIndex)
  const mountedCount =
    mountedEndIndex >= mountedStartIndex ? mountedEndIndex - mountedStartIndex + 1 : 0
  const lineMountedCount = overlay.hidden ? 0 : lineTrack.querySelectorAll('[data-photo-card]').length

  reportNode.textContent = JSON.stringify({
    phase: 'ready',
    requestId,
    mode: state.mode,
    focusId: state.focusId,
    selectedText: getSelectedText(),
    mountedCount: mountedCount + lineMountedCount,
    totalCount: photoGalleryData.length,
    visibleRowRange: [visibleStartRow, visibleEndRow],
    scrollTop: scrollShell.scrollTop,
    focusedRowTop: focusRow?.top ?? null,
    focusedRowBottom: focusRow?.bottom ?? null,
  })
}

function render() {
  const layout = getLayout()
  gridCanvas.style.height = `${layout.contentHeight}px`
  renderGridCards(layout)
  renderLineOverlay(layout)
  renderLineZones()
  publishReport()
}

scrollShell.addEventListener('scroll', () => {
  render()
})

window.addEventListener('resize', () => {
  render()
})

window.addEventListener('hashchange', () => {
  syncModeFromHash()
  render()
})

const resizeObserver = new ResizeObserver(() => {
  render()
})
resizeObserver.observe(scrollShell)

syncModeFromHash()
render()
