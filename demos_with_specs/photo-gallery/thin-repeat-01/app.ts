import {
  getHighResPhotoUrl,
  getLowResPhotoUrl,
  photoGalleryData,
  type PhotoData,
} from './data'
import {
  buildGridLayout,
  formatFocusedHash,
  getMountedItemIds,
  getVisibleRowRange,
  GRID_CAPTION_VISIBLE_HEIGHT,
  GRID_TOP_PADDING,
  LINE_BOTTOM_GAP,
  LINE_CAPTION_VISIBLE_HEIGHT,
  LINE_CAPTION_TOTAL,
  LINE_GAP,
  LINE_LEFT_STRIP,
  LINE_NEIGHBOR_SCALE,
  LINE_RIGHT_STRIP,
  parseFocusedHash,
  routeLineClick,
  type GridItemLayout,
  type GridLayout,
} from './model'

type GridCardNodes = {
  outer: HTMLDivElement
  image: HTMLImageElement
  caption: HTMLParagraphElement
}

type DomCache = {
  shell: HTMLDivElement
  scrollRoot: HTMLDivElement
  grid: HTMLDivElement
  overlay: HTMLDivElement
  overlayStage: HTMLDivElement
  overlayCaption: HTMLDivElement
  overlayNote: HTMLDivElement
  cards: Map<string, GridCardNodes>
}

type RenderState = {
  viewportWidth: number
  viewportHeight: number
  scrollTop: number
  layout: GridLayout
  focusedPhotoId: string | null
  visibleRowRange: [number, number]
  mountedItemIds: string[]
}

export type PhotoGalleryController = {
  afterNextRender: () => Promise<void>
  dismissLineMode: () => void
  getFocusedPhotoId: () => string | null
  getGridItemLayout: (photoId: string) => GridItemLayout | null
  getLayout: () => GridLayout
  getMode: () => 'grid' | 'line'
  getMountedCount: () => number
  getScrollTop: () => number
  getSelectionText: () => string
  getViewportHeight: () => number
  getVisibleRowRange: () => [number, number]
  openPhoto: (photoId: string) => void
  scrollTo: (top: number) => void
  selectCaption: (photoId: string) => void
}

const photoById = new Map(photoGalleryData.map((photo) => [photo.id, photo]))
const knownPhotoIds = new Set(photoGalleryData.map((photo) => photo.id))

export function mountPhotoGallery(root: HTMLElement): PhotoGalleryController {
  const dom = createDom(root)
  const state: RenderState = {
    viewportWidth: document.documentElement.clientWidth,
    viewportHeight: document.documentElement.clientHeight,
    scrollTop: 0,
    layout: buildGridLayout(photoGalleryData, document.documentElement.clientWidth),
    focusedPhotoId: null,
    visibleRowRange: [0, 0],
    mountedItemIds: [],
  }

  let scheduledRender = false
  let pendingAfterRenderResolvers: Array<() => void> = []

  dom.scrollRoot.addEventListener('scroll', () => {
    scheduleRender()
  })
  window.addEventListener('resize', () => {
    scheduleRender()
  })
  window.addEventListener('hashchange', () => {
    scheduleRender()
  })
  window.addEventListener('popstate', () => {
    scheduleRender()
  })
  dom.grid.addEventListener('click', (event) => {
    if (!(event.target instanceof HTMLElement)) return
    const actionNode = event.target.closest<HTMLElement>('[data-photo-action]')
    if (actionNode == null) return
    const photoId = actionNode.dataset.photoId
    if (photoId == null) return

    switch (actionNode.dataset.photoAction) {
      case 'open-line':
        openPhoto(photoId)
        break
      case 'select-caption':
        selectCaption(photoId)
        break
    }
  })
  dom.overlay.addEventListener('click', (event) => {
    if (!(event instanceof MouseEvent)) return
    const focusedPhotoId = state.focusedPhotoId
    if (focusedPhotoId == null) return
    const focusedItem = state.layout.itemsById.get(focusedPhotoId)
    if (focusedItem == null) return

    const result = routeLineClick({
      clientX: event.clientX,
      viewportWidth: state.viewportWidth,
      focusedIndex: focusedItem.index,
      itemCount: photoGalleryData.length,
    })
    switch (result.kind) {
      case 'previous':
      case 'next':
        openPhoto(photoGalleryData[result.nextIndex]!.id)
        break
      case 'dismiss':
        dismissLineMode()
        break
    }
  })

  scheduleRender()

  return {
    afterNextRender: () =>
      new Promise((resolve) => {
        pendingAfterRenderResolvers.push(resolve)
        scheduleRender()
      }),
    dismissLineMode,
    getFocusedPhotoId: () => state.focusedPhotoId,
    getGridItemLayout: (photoId) => state.layout.itemsById.get(photoId) ?? null,
    getLayout: () => state.layout,
    getMode: () => (state.focusedPhotoId == null ? 'grid' : 'line'),
    getMountedCount: () => state.mountedItemIds.length,
    getScrollTop: () => state.scrollTop,
    getSelectionText: () => window.getSelection()?.toString() ?? '',
    getViewportHeight: () => state.viewportHeight,
    getVisibleRowRange: () => state.visibleRowRange,
    openPhoto,
    scrollTo,
    selectCaption,
  }

  function scheduleRender() {
    if (scheduledRender) return
    scheduledRender = true
    requestAnimationFrame(() => {
      scheduledRender = false
      render()
    })
  }

  function render() {
    state.viewportWidth = document.documentElement.clientWidth
    state.viewportHeight = document.documentElement.clientHeight
    state.scrollTop = dom.scrollRoot.scrollTop
    state.focusedPhotoId = parseFocusedHash(window.location.hash, knownPhotoIds)
    state.layout = buildGridLayout(photoGalleryData, state.viewportWidth)
    state.visibleRowRange = getVisibleRowRange(
      state.layout,
      state.scrollTop,
      state.viewportHeight,
    )
    state.mountedItemIds = getMountedItemIds(state.layout, state.visibleRowRange)

    dom.grid.style.height = `${state.layout.contentHeight}px`

    renderGridCards()
    renderLineMode()

    const resolvers = pendingAfterRenderResolvers
    pendingAfterRenderResolvers = []
    for (const resolve of resolvers) resolve()
  }

  function renderGridCards() {
    const mountedIds = new Set(state.mountedItemIds)
    for (const [photoId, nodes] of dom.cards) {
      if (mountedIds.has(photoId)) continue
      nodes.outer.remove()
      dom.cards.delete(photoId)
    }

    for (const photoId of state.mountedItemIds) {
      const photo = photoById.get(photoId)
      const layoutItem = state.layout.itemsById.get(photoId)
      if (photo == null || layoutItem == null) continue

      let nodes = dom.cards.get(photoId)
      if (nodes == null) {
        nodes = createGridCardNodes(photo)
        dom.cards.set(photoId, nodes)
      }

      renderGridCard(nodes, photo, layoutItem)
      if (nodes.outer.parentNode !== dom.grid) {
        dom.grid.appendChild(nodes.outer)
      } else {
        dom.grid.appendChild(nodes.outer)
      }
    }
  }

  function renderLineMode() {
    const focusedPhotoId = state.focusedPhotoId
    if (focusedPhotoId == null) {
      dom.overlay.className = 'gallery-overlay'
      dom.overlayStage.textContent = ''
      dom.overlayCaption.textContent = ''
      return
    }

    const focusedItem = state.layout.itemsById.get(focusedPhotoId)
    const focusedPhoto = photoById.get(focusedPhotoId)
    if (focusedItem == null || focusedPhoto == null) {
      dom.overlay.className = 'gallery-overlay'
      dom.overlayStage.textContent = ''
      dom.overlayCaption.textContent = ''
      return
    }

    dom.overlay.className = 'gallery-overlay is-visible'

    const stageWidth = Math.max(0, state.viewportWidth - LINE_LEFT_STRIP - LINE_RIGHT_STRIP)
    const topInset = Math.min(64, Math.max(32, state.viewportHeight * 0.06))
    const maxImageHeight = Math.max(
      220,
      state.viewportHeight - topInset - LINE_BOTTOM_GAP - LINE_CAPTION_TOTAL - 32,
    )
    const maxFocusWidth = Math.max(220, stageWidth * 0.5)
    const focusScale = Math.min(maxFocusWidth / focusedPhoto.w, maxImageHeight / focusedPhoto.h)
    const focusWidth = focusedPhoto.w * focusScale
    const focusHeight = focusedPhoto.h * focusScale
    const focusX = LINE_LEFT_STRIP + stageWidth / 2 - focusWidth / 2
    const focusY = topInset + (maxImageHeight - focusHeight) / 2
    const captionTop = focusY + focusHeight + LINE_BOTTOM_GAP

    dom.overlayCaption.textContent = focusedPhoto.prompt
    dom.overlayCaption.style.left = `${LINE_LEFT_STRIP}px`
    dom.overlayCaption.style.top = `${captionTop}px`
    dom.overlayCaption.style.width = `${stageWidth}px`

    dom.overlayStage.textContent = ''

    renderLeftLineItems(focusedItem.index, focusX, focusY + focusHeight, focusScale)
    renderLinePhoto(focusedPhoto, {
      className: 'line-photo is-focused',
      height: focusHeight,
      highRes: true,
      opacity: 1,
      width: focusWidth,
      x: focusX,
      y: focusY,
      zIndex: 200,
    })
    renderRightLineItems(
      focusedItem.index,
      focusX + focusWidth,
      focusY + focusHeight,
      focusScale,
    )
  }

  function renderLeftLineItems(
    focusedIndex: number,
    focusLeftEdge: number,
    focusBottom: number,
    focusScale: number,
  ) {
    let cursorX = focusLeftEdge
    for (let index = focusedIndex - 1; index >= 0; index--) {
      const photo = photoGalleryData[index]!
      const width = photo.w * focusScale * LINE_NEIGHBOR_SCALE
      const height = photo.h * focusScale * LINE_NEIGHBOR_SCALE
      cursorX -= LINE_GAP + width
      renderLinePhoto(photo, {
        className: 'line-photo',
        height,
        highRes: false,
        opacity: index === focusedIndex - 1 ? 0.65 : 0.3,
        width,
        x: cursorX,
        y: focusBottom - height,
        zIndex: 100 - (focusedIndex - index),
      })
    }
  }

  function renderRightLineItems(
    focusedIndex: number,
    focusRightEdge: number,
    focusBottom: number,
    focusScale: number,
  ) {
    let cursorX = focusRightEdge
    for (let index = focusedIndex + 1; index < photoGalleryData.length; index++) {
      const photo = photoGalleryData[index]!
      const width = photo.w * focusScale * LINE_NEIGHBOR_SCALE
      const height = photo.h * focusScale * LINE_NEIGHBOR_SCALE
      cursorX += LINE_GAP
      renderLinePhoto(photo, {
        className: 'line-photo',
        height,
        highRes: false,
        opacity: index === focusedIndex + 1 ? 0.65 : 0.3,
        width,
        x: cursorX,
        y: focusBottom - height,
        zIndex: 100 - (index - focusedIndex),
      })
      cursorX += width
    }
  }

  function renderLinePhoto(
    photo: PhotoData,
    args: {
      className: string
      height: number
      highRes: boolean
      opacity: number
      width: number
      x: number
      y: number
      zIndex: number
    },
  ) {
    const frame = document.createElement('div')
    frame.className = args.className
    frame.style.left = `${args.x}px`
    frame.style.top = `${args.y}px`
    frame.style.width = `${args.width}px`
    frame.style.height = `${args.height}px`
    frame.style.opacity = `${args.opacity}`
    frame.style.zIndex = `${args.zIndex}`

    const image = document.createElement('img')
    image.alt = photo.prompt
    image.className = 'line-image'
    image.draggable = false
    image.loading = 'eager'
    image.src = args.highRes ? getHighResPhotoUrl(photo.id) : getLowResPhotoUrl(photo.id)
    image.onerror = () => {
      image.style.backgroundImage = buildFallbackGradient(photo.id)
      image.removeAttribute('src')
    }

    frame.appendChild(image)
    dom.overlayStage.appendChild(frame)
  }

  function openPhoto(photoId: string) {
    if (!knownPhotoIds.has(photoId)) {
      throw new Error(`Unknown photo id: ${photoId}`)
    }
    writeFocusedHash(photoId)
  }

  function dismissLineMode() {
    const focusedPhotoId = state.focusedPhotoId
    if (focusedPhotoId == null) return
    const item = state.layout.itemsById.get(focusedPhotoId)
    writeFocusedHash(null)
    if (item != null) {
      dom.scrollRoot.scrollTop = Math.max(0, item.rowTop - GRID_TOP_PADDING)
    }
    scheduleRender()
  }

  function scrollTo(top: number) {
    dom.scrollRoot.scrollTop = Math.max(0, top)
    scheduleRender()
  }

  function selectCaption(photoId: string) {
    const nodes = dom.cards.get(photoId)
    if (nodes == null) {
      throw new Error(`Caption for ${photoId} is not mounted.`)
    }

    const selection = window.getSelection()
    if (selection == null) return
    const range = document.createRange()
    range.selectNodeContents(nodes.caption)
    selection.removeAllRanges()
    selection.addRange(range)
  }

  function writeFocusedHash(photoId: string | null) {
    const url = new URL(window.location.href)
    url.hash = photoId == null ? '' : formatFocusedHash(photoId)
    history.replaceState(history.state, '', url)
    scheduleRender()
  }
}

function createDom(root: HTMLElement): DomCache {
  root.textContent = ''

  const shell = document.createElement('div')
  shell.className = 'gallery-shell'

  const scrollRoot = document.createElement('div')
  scrollRoot.className = 'gallery-scroll-root'

  const grid = document.createElement('div')
  grid.className = 'gallery-grid'

  const overlay = document.createElement('div')
  overlay.className = 'gallery-overlay'

  const overlayStage = document.createElement('div')
  overlayStage.className = 'gallery-overlay-stage'

  const overlayCaption = document.createElement('div')
  overlayCaption.className = 'gallery-overlay-caption'

  const overlayNote = document.createElement('div')
  overlayNote.className = 'gallery-overlay-note'
  overlayNote.textContent = 'Left strip previous. Right strip next. Middle returns to the grid.'

  scrollRoot.appendChild(grid)
  overlay.append(overlayStage, overlayCaption, overlayNote)
  shell.append(scrollRoot, overlay)
  root.appendChild(shell)

  return {
    shell,
    scrollRoot,
    grid,
    overlay,
    overlayStage,
    overlayCaption,
    overlayNote,
    cards: new Map(),
  }
}

function createGridCardNodes(photo: PhotoData): GridCardNodes {
  const outer = document.createElement('div')
  outer.className = 'grid-card'

  const image = document.createElement('img')
  image.className = 'grid-photo'
  image.alt = photo.prompt
  image.draggable = false
  image.dataset.photoAction = 'open-line'
  image.dataset.photoId = photo.id
  image.loading = 'lazy'

  const caption = document.createElement('p')
  caption.className = 'grid-caption'
  caption.dataset.photoAction = 'select-caption'
  caption.dataset.photoId = photo.id
  caption.textContent = photo.prompt

  outer.append(image, caption)
  return {outer, image, caption}
}

function renderGridCard(nodes: GridCardNodes, photo: PhotoData, layoutItem: GridItemLayout) {
  nodes.outer.style.left = `${layoutItem.x}px`
  nodes.outer.style.top = `${layoutItem.y}px`
  nodes.outer.style.width = `${layoutItem.cardWidth}px`
  nodes.outer.style.height = `${layoutItem.cardHeight}px`
  nodes.outer.style.zIndex = `${10 + layoutItem.index}`

  nodes.image.style.height = `${layoutItem.imageHeight}px`
  if (nodes.image.getAttribute('src') !== getLowResPhotoUrl(photo.id)) {
    nodes.image.src = getLowResPhotoUrl(photo.id)
  }
  nodes.image.onerror = () => {
    nodes.image.style.backgroundImage = buildFallbackGradient(photo.id)
    nodes.image.removeAttribute('src')
  }
  nodes.caption.style.height = `${GRID_CAPTION_VISIBLE_HEIGHT}px`
  nodes.caption.textContent = photo.prompt
}

function buildFallbackGradient(id: string) {
  const hue = hashStringToHue(id)
  return `linear-gradient(135deg, hsl(${hue} 62% 80%), hsl(${(hue + 44) % 360} 48% 70%))`
}

function hashStringToHue(text: string) {
  let hash = 0
  for (let index = 0; index < text.length; index++) {
    hash = Math.imul(hash ^ text.charCodeAt(index), 16777619)
  }
  return Math.abs(hash) % 360
}
