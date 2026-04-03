import { photoGalleryData, highResUrl, lowResUrl } from './data.js'
import {
  GRID_CAPTION_BOTTOM_PADDING,
  GRID_CAPTION_VISIBLE,
  LINE_BOTTOM_GAP,
  LINE_CARD_GAP,
  LINE_CAPTION_BOTTOM_PADDING,
  LINE_CAPTION_VISIBLE,
  LINE_NEIGHBOR_SCALE,
  LINE_TOP_FLOOR,
  layoutGrid,
  resolveDismissToRow,
  resolveLineClick,
  resolveMountedPhotoIds,
} from './layout.js'

const appRoot = document.getElementById('app')
const reportNode = document.getElementById('report')
const params = new URLSearchParams(window.location.search)
const scenario = params.get('scenario') || ''
const requestId = params.get('requestId') || ''

const byId = new Map(photoGalleryData.map((photo) => [photo.id, photo]))

const state = {
  mode: 'grid',
  focusedId: null,
  hoveredId: null,
  layout: null,
  pendingScrollTop: null,
  mountedCount: 0,
  totalCount: photoGalleryData.length,
  scenario,
  requestId,
  initialized: false,
}

const clamp = (value, min, max) => Math.max(min, Math.min(max, value))

function decodeHash(rawHash) {
  const value = rawHash.startsWith('#') ? rawHash.slice(1) : rawHash
  if (!value) return ''
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

function currentFocusedIndex() {
  if (!state.focusedId) return -1
  return photoGalleryData.findIndex((photo) => photo.id === state.focusedId)
}

function setHashFromFocus(nextFocusedId) {
  const desiredHash = nextFocusedId ? `#${nextFocusedId}` : ''
  if (window.location.hash !== desiredHash) {
    window.location.hash = desiredHash
  }
}

function publishReport(phase, extra = {}) {
  if (!reportNode) return
  const report = {
    phase,
    requestId,
    scenario,
    mode: state.mode,
    focusedId: state.focusedId,
    hash: state.focusedId ? `#${state.focusedId}` : '',
    mountedCount: state.mountedCount,
    totalCount: state.totalCount,
    ...extra,
  }
  reportNode.textContent = JSON.stringify(report)
}

function nextFrame() {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()))
}

function selectText(node) {
  const selection = window.getSelection()
  if (!selection || !node) return ''
  const range = document.createRange()
  range.selectNodeContents(node)
  selection.removeAllRanges()
  selection.addRange(range)
  return selection.toString()
}

function getVisibleRowAnchor(layout) {
  const scrollTop = window.scrollY
  for (const row of layout.rows) {
    if (row.bottom >= scrollTop) {
      return {
        id: layout.items.find((item) => item.rowIndex === row.index)?.id ?? null,
        rowIndex: row.index,
        offset: scrollTop - row.top,
      }
    }
  }

  return null
}

function ensureGridScrollAnchor(prevLayout, nextLayout) {
  if (!prevLayout || !nextLayout || state.mode !== 'grid') return
  const anchor = getVisibleRowAnchor(prevLayout)
  if (!anchor || !anchor.id) return
  const nextItem = nextLayout.items.find((item) => item.id === anchor.id)
  if (!nextItem) return
  window.scrollTo(0, Math.max(0, nextItem.rowTop + anchor.offset))
}

function renderGrid() {
  const viewportHeight = window.innerHeight
  const layout = state.layout

  const mountedIds = resolveMountedPhotoIds(layout, window.scrollY, viewportHeight, 1)
  state.mountedCount = mountedIds.size

  appRoot.className = 'grid-hover'
  appRoot.innerHTML = ''

  const stage = document.createElement('div')
  stage.className = 'grid-stage'
  stage.style.height = `${layout.totalHeight}px`

  const focusedIndex = currentFocusedIndex()

  for (const item of layout.items) {
    if (!mountedIds.has(item.id)) continue
    const card = buildGridCard(item, focusedIndex === item.index)
    stage.appendChild(card)
  }

  appRoot.appendChild(stage)

  state.hoveredId = null
  document.body.classList.remove('line-mode')
  document.documentElement.style.overflow = ''
}

function buildGridCard(item, isFocused) {
  const card = document.createElement('article')
  card.className = 'card'
  card.style.left = `${item.x}px`
  card.style.top = `${item.y}px`
  card.style.width = `${item.cardWidth}px`
  card.style.height = `${item.cardHeight}px`

  const inner = document.createElement('div')
  inner.className = 'card-inner'

  const imageShell = document.createElement('div')
  imageShell.className = 'image-shell'
  imageShell.style.height = `${item.imageHeight}px`

  const bg = document.createElement('div')
  bg.className = 'bg'
  bg.style.backgroundImage = `url(${lowResUrl(item.id)})`

  const hero = document.createElement('img')
  hero.className = 'hero-img'
  hero.alt = item.prompt
  hero.src = isFocused ? highResUrl(item.id) : lowResUrl(item.id)
  hero.loading = 'lazy'
  hero.decoding = 'async'

  imageShell.append(bg, hero)

  imageShell.addEventListener('click', (event) => {
    event.preventDefault()
    openLineAtIndex(item.index)
  })

  imageShell.addEventListener('pointerenter', () => {
    state.hoveredId = item.id
    card.classList.add('hovered')
  })

  imageShell.addEventListener('pointermove', (event) => {
    const rect = card.getBoundingClientRect()
    const dx = clamp(((event.clientX - rect.left - rect.width / 2) / rect.width) * 14, -10, 10)
    const dy = clamp(((event.clientY - rect.top - rect.height / 2) / rect.height) * 10, -8, 8)
    card.style.setProperty('--hover-dx', `${dx}px`)
    card.style.setProperty('--hover-dy', `${dy}px`)
  })

  imageShell.addEventListener('pointerleave', () => {
    if (state.hoveredId === item.id) state.hoveredId = null
    card.classList.remove('hovered')
    card.style.removeProperty('--hover-dx')
    card.style.removeProperty('--hover-dy')
  })

  const caption = document.createElement('p')
  caption.className = 'caption caption-grid'
  caption.textContent = item.prompt
  caption.addEventListener('click', (event) => {
    event.preventDefault()
    event.stopPropagation()
    selectText(caption)
  })

  inner.append(imageShell, caption)
  card.append(inner)
  return card
}

function renderLine() {
  const viewportWidth = window.innerWidth
  const viewportHeight = window.innerHeight
  const focusIndex = Math.max(0, currentFocusedIndex())
  const availableImageHeight = Math.max(
    160,
    viewportHeight - LINE_TOP_FLOOR - LINE_BOTTOM_GAP - LINE_CAPTION_VISIBLE - LINE_CAPTION_BOTTOM_PADDING - 24,
  )
  const focusBaseWidth = clamp(viewportWidth * 0.56, 360, 720)

  const lineItems = photoGalleryData.map((photo, index) => {
    const aspectRatio = photo.w / photo.h
    const baseWidth = focusBaseWidth * (index === focusIndex ? 1 : LINE_NEIGHBOR_SCALE)
    const width = Math.min(photo.w, baseWidth, availableImageHeight * aspectRatio)
    const height = width / aspectRatio
    return {
      ...photo,
      index,
      width,
      height,
      cardHeight: height + LINE_CAPTION_VISIBLE + LINE_CAPTION_BOTTOM_PADDING,
    }
  })

  const totalWidth =
    lineItems.reduce((sum, item) => sum + item.width, 0) + LINE_CARD_GAP * Math.max(0, lineItems.length - 1)
  let cursor = 0
  let focusLeft = 0
  for (const item of lineItems) {
    item.left = cursor
    if (item.index === focusIndex) focusLeft = cursor
    cursor += item.width + LINE_CARD_GAP
  }
  const focusItem = lineItems[focusIndex]
  const offsetX = viewportWidth / 2 - (focusLeft + focusItem.width / 2)

  appRoot.className = ''
  appRoot.innerHTML = ''

  const overlay = document.createElement('div')
  overlay.className = 'line-overlay'

  const stage = document.createElement('div')
  stage.className = 'line-stage'
  stage.style.width = `${totalWidth}px`
  stage.style.transform = `translateX(${offsetX}px)`

  for (const item of lineItems) {
    const card = buildLineCard(item, item.index === focusIndex)
    card.style.left = `${item.left}px`
    card.style.width = `${item.width}px`
    card.style.height = `${item.cardHeight}px`
    stage.appendChild(card)
  }

  const handleClick = (event) => {
    const action = resolveLineClick({
      x: event.clientX,
      width: window.innerWidth,
      focusedIndex: focusIndex,
      total: photoGalleryData.length,
    })

    if (action.type === 'prev' || action.type === 'next') {
      openLineAtIndex(action.nextIndex)
      return
    }

    if (action.type === 'dismiss') {
      dismissLineMode()
    }
  }

  overlay.addEventListener('click', handleClick)

  const leftStrip = document.createElement('div')
  leftStrip.className = 'line-strip left'
  const rightStrip = document.createElement('div')
  rightStrip.className = 'line-strip right'

  overlay.append(stage, leftStrip, rightStrip)
  appRoot.appendChild(overlay)

  document.body.classList.add('line-mode')
  document.documentElement.style.overflow = 'hidden'
}

function buildLineCard(item, isFocused) {
  const card = document.createElement('article')
  card.className = `line-card ${isFocused ? 'focused' : 'dimmed'}`

  const inner = document.createElement('div')
  inner.className = 'card-inner'

  const imageShell = document.createElement('div')
  imageShell.className = 'image-shell'
  imageShell.style.height = `${item.height}px`

  const bg = document.createElement('div')
  bg.className = 'bg'
  bg.style.backgroundImage = `url(${lowResUrl(item.id)})`

  const hero = document.createElement('img')
  hero.className = 'hero-img'
  hero.alt = item.prompt
  hero.src = isFocused ? highResUrl(item.id) : lowResUrl(item.id)
  hero.loading = 'lazy'
  hero.decoding = 'async'

  imageShell.append(bg, hero)

  const caption = document.createElement('p')
  caption.className = 'caption caption-line'
  caption.textContent = item.prompt

  inner.append(imageShell, caption)
  card.append(inner)
  return card
}

function render() {
  state.layout = layoutGrid(photoGalleryData, window.innerWidth)
  if (state.mode === 'line') {
    renderLine()
  } else {
    renderGrid()
  }
  if (scenario) {
    publishReport('running')
  }
}

function openLineAtIndex(index) {
  const nextIndex = clamp(index, 0, photoGalleryData.length - 1)
  const nextPhoto = photoGalleryData[nextIndex]
  if (!nextPhoto) return
  state.mode = 'line'
  state.focusedId = nextPhoto.id
  setHashFromFocus(nextPhoto.id)
  render()
}

function dismissLineMode() {
  const focusedId = state.focusedId
  if (!focusedId || !state.layout) {
    state.mode = 'grid'
    state.focusedId = null
    setHashFromFocus('')
    render()
    return
  }

  const target = resolveDismissToRow({
    layout: state.layout,
    focusedId,
    viewportHeight: window.innerHeight,
  })

  state.mode = 'grid'
  state.focusedId = null
  setHashFromFocus('')
  render()
  window.scrollTo(0, target.scrollTop)
}

function selectCaptionAtIndex(index) {
  const item = photoGalleryData[index]
  if (!item) return ''
  const card = appRoot.querySelectorAll('.card')[index]
  const caption = card?.querySelector('.caption')
  if (!caption) return ''
  return selectText(caption)
}

function handleKeydown(event) {
  if (event.key === 'Escape' && state.mode === 'line') {
    event.preventDefault()
    dismissLineMode()
    return
  }

  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return

  event.preventDefault()
  const focusedIndex = currentFocusedIndex()
  if (focusedIndex < 0) {
    openLineAtIndex(0)
    return
  }

  if (event.key === 'ArrowLeft' && focusedIndex > 0) {
    openLineAtIndex(focusedIndex - 1)
  } else if (event.key === 'ArrowRight' && focusedIndex < photoGalleryData.length - 1) {
    openLineAtIndex(focusedIndex + 1)
  }
}

let resizeTimer = 0
function handleResize() {
  if (resizeTimer) cancelAnimationFrame(resizeTimer)
  resizeTimer = requestAnimationFrame(() => {
    if (state.mode === 'grid') {
      render()
      return
    }
    render()
  })
}

function syncFromHash() {
  const focusedId = decodeHash(window.location.hash)
  if (focusedId && byId.has(focusedId)) {
    state.mode = 'line'
    state.focusedId = focusedId
  } else {
    state.mode = 'grid'
    state.focusedId = null
  }
  render()
}

async function runScenario() {
  if (!scenario) {
    publishReport('ready')
    return
  }

  publishReport('loading')
  await nextFrame()

  try {
    if (scenario === 'navigation') {
      openLineAtIndex(Math.max(0, currentFocusedIndex()) + 1)
      await nextFrame()
      publishReport('ready', {
        focusedId: state.focusedId,
        hash: state.focusedId ? `#${state.focusedId}` : '',
      })
      return
    }

    if (scenario === 'dismiss-restore') {
      const focusedId = state.focusedId
      dismissLineMode()
      await nextFrame()
      await nextFrame()

      const layout = layoutGrid(photoGalleryData, window.innerWidth)
      const focusedIndex = focusedId ? photoGalleryData.findIndex((photo) => photo.id === focusedId) : -1
      const rowIndex = focusedIndex >= 0 ? layout.items[focusedIndex].rowIndex : 0
      const row = layout.rows[rowIndex]
      publishReport('ready', {
        mode: state.mode,
        hash: window.location.hash,
        gapAboveRow: row ? row.top - window.scrollY : 0,
        focusedId,
      })
      return
    }

    if (scenario === 'caption-selection') {
      const text = selectCaptionAtIndex(0)
      await nextFrame()
      publishReport('ready', {
        selectedText: text || window.getSelection()?.toString() || '',
        mode: state.mode,
        hash: window.location.hash,
      })
      return
    }

    if (scenario === 'occlusion') {
      await nextFrame()
      publishReport('ready', {
        mountedCount: state.mountedCount,
        totalCount: state.totalCount,
      })
      return
    }

    publishReport('error', { message: `Unknown scenario: ${scenario}` })
  } catch (error) {
    publishReport('error', {
      message: error instanceof Error ? error.message : String(error),
    })
  }
}

window.__gallery = {
  openLineAtIndex,
  dismissLineMode,
  selectCaptionAtIndex,
  syncFromHash,
}

window.addEventListener('keydown', handleKeydown)
window.addEventListener('scroll', () => {
  if (state.mode === 'grid') render()
})
window.addEventListener('resize', handleResize)
window.addEventListener('hashchange', syncFromHash)

syncFromHash()
state.initialized = true
runScenario()
