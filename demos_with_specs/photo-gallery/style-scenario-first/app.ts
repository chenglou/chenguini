import { photoGalleryData } from './data'
import {
  computeGridLayout,
  decodePhotoId,
  encodePhotoId,
  firstVisibleGridItemId,
  findGridItem,
  focusedGridScrollTop,
  fitPhotoSize,
  gridCaptionHeight,
  gridSidePadding,
  gridTopPadding,
  lineGap,
  lineHitStripWidth,
  lineWindowIndices,
  resolveLineModeClick,
  resolveLineModeKey,
  visibleGridItemIds,
  type GridLayout,
} from './layout'

type PhotoGalleryMode = 'grid' | 'line'

type PhotoGalleryReport = {
  mode: PhotoGalleryMode
  focusedId: string | null
  hash: string
  mountedCount: number
  totalCount: number
  focusedRowTop: number | null
  selectionText: string
}

type GalleryCardDom = {
  root: HTMLElement
  imageButton: HTMLButtonElement
  lowResImage: HTMLImageElement
  highResImage: HTMLImageElement
  caption: HTMLParagraphElement
  captionText: HTMLSpanElement
}

type DomCache = {
  app: HTMLElement
  stage: HTMLElement
  gridLayer: HTMLElement
  lineLayer: HTMLElement
  linePrevZone: HTMLButtonElement
  lineDismissZone: HTMLButtonElement
  lineNextZone: HTMLButtonElement
  githubLink: HTMLAnchorElement
  cards: Map<string, GalleryCardDom>
}

type AppState = {
  pointerX: number | null
  pointerY: number | null
  lastMode: PhotoGalleryMode
  lastGridLayout: GridLayout | null
  lastScrollTop: number
  lastViewportWidth: number
  lastViewportHeight: number
  lastFocusedId: string | null
}

declare global {
  interface Window {
    __photoGalleryReport?: PhotoGalleryReport
  }
}

const lineWindowRadius = 2
const lineBaseCardWidth = 180
const lineBaseCardWidthMax = 260
const hoverDriftFactor = 0.03
const hoverScale = 1.02

export function startPhotoGalleryApp(): void {
  const cache = createDomCache()
  const state: AppState = {
    pointerX: null,
    pointerY: null,
    lastMode: 'grid',
    lastGridLayout: null,
    lastScrollTop: 0,
    lastViewportWidth: window.innerWidth,
    lastViewportHeight: window.innerHeight,
    lastFocusedId: null,
  }

  let scheduledFrame: number | null = null
  let isRunning = false

  function scheduleRender(): void {
    if (scheduledFrame != null) return
    scheduledFrame = window.requestAnimationFrame(() => {
      scheduledFrame = null
      render()
    })
  }

  function setHash(photoId: string | null): void {
    const nextHash = encodePhotoId(photoId)
    if (location.hash === nextHash) return

    if (nextHash === '') {
      location.hash = ''
      return
    }

    location.hash = nextHash.slice(1)
  }

  function handlePointerMove(event: PointerEvent): void {
    state.pointerX = event.clientX
    state.pointerY = event.clientY
    scheduleRender()
  }

  function handlePointerLeave(): void {
    state.pointerX = null
    state.pointerY = null
    scheduleRender()
  }

  function handleGridClick(event: MouseEvent): void {
    const target = event.target
    if (!(target instanceof HTMLElement)) return
    if (target.closest('[data-role="caption"]') != null) return

    const imageButton = target.closest('[data-role="grid-image"]')
    if (!(imageButton instanceof HTMLElement)) return

    const photoId = imageButton.dataset.photoId
    if (photoId == null) return

    setHash(photoId)
  }

  function handleGridPointerDown(event: PointerEvent): void {
    if (event.button !== 0) return
    const target = event.target
    if (!(target instanceof HTMLElement)) return
    const caption = target.closest('[data-role="caption"]')
    if (!(caption instanceof HTMLElement)) return

    event.preventDefault()
    selectCaption(caption)
    scheduleRender()
  }

  function handleLineZoneClick(event: MouseEvent): void {
    const target = event.target
    if (!(target instanceof HTMLElement)) return
    const zone = target.closest('[data-line-zone]')
    if (!(zone instanceof HTMLElement)) return

    const focusedIndex = currentFocusedIndex()
    const route = resolveLineModeClick(window.innerWidth, event.clientX, focusedIndex, photoGalleryData.length)
    switch (route.action) {
      case 'previous':
      case 'next': {
        const nextIndex = route.focusedIndex
        if (nextIndex != null) setHash(photoGalleryData[nextIndex]!.id)
        return
      }
      case 'dismiss':
        setHash(null)
        return
    }
  }

  function handleKeyDown(event: KeyboardEvent): void {
    const route = resolveLineModeKey(event.key, currentFocusedIndex(), photoGalleryData.length)
    switch (route.action) {
      case 'noop':
        return
      case 'dismiss':
        event.preventDefault()
        setHash(null)
        return
      case 'previous':
      case 'next': {
        event.preventDefault()
        const nextIndex = route.focusedIndex
        if (nextIndex != null) setHash(photoGalleryData[nextIndex]!.id)
        return
      }
    }
  }

  function handleHashChange(): void {
    scheduleRender()
  }

  function selectCaption(caption: HTMLElement): void {
    const text = caption.querySelector('[data-role="caption-text"]')
    if (!(text instanceof HTMLElement)) return

    const range = document.createRange()
    range.selectNodeContents(text)

    const selection = window.getSelection()
    if (selection == null) return
    selection.removeAllRanges()
    selection.addRange(range)
  }

  function currentFocusedId(): string | null {
    return decodePhotoId(location.hash)
  }

  function currentFocusedIndex(): number | null {
    const focusedId = currentFocusedId()
    if (focusedId == null) return null
    for (let index = 0; index < photoGalleryData.length; index++) {
      if (photoGalleryData[index]!.id === focusedId) return index
    }
    return null
  }

  function render(): void {
    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight
    const currentScrollTop = document.scrollingElement?.scrollTop ?? document.documentElement.scrollTop ?? 0
    const focusedId = currentFocusedId()
    const mode: PhotoGalleryMode = focusedId == null ? 'grid' : 'line'

    const gridLayout = computeGridLayout(viewportWidth, viewportHeight, photoGalleryData)
    let effectiveScrollTop = currentScrollTop

    if (mode === 'grid' && state.lastGridLayout != null && state.lastMode === 'grid' && state.lastViewportWidth !== viewportWidth) {
      const anchorId = firstVisibleGridItemId(state.lastGridLayout, state.lastScrollTop, state.lastViewportHeight)
      if (anchorId != null) {
        const previousAnchor = findGridItem(state.lastGridLayout, anchorId)
        const nextAnchor = findGridItem(gridLayout, anchorId)
        if (previousAnchor != null && nextAnchor != null) {
          const viewportOffset = previousAnchor.y - state.lastScrollTop
          const targetScrollTop = Math.max(0, nextAnchor.y - viewportOffset)
          if (Math.abs(targetScrollTop - currentScrollTop) > 0.5) {
            window.scrollTo(0, targetScrollTop)
            effectiveScrollTop = targetScrollTop
          }
        }
      }
    }

    if (state.lastMode === 'line' && mode === 'grid' && state.lastFocusedId != null) {
      const restoreScrollTop = focusedGridScrollTop(gridLayout, state.lastFocusedId)
      if (Math.abs(restoreScrollTop - effectiveScrollTop) > 0.5) {
        window.scrollTo(0, restoreScrollTop)
        effectiveScrollTop = restoreScrollTop
      }
    }

    const visibleIds = mode === 'grid'
      ? visibleGridItemIds(gridLayout, effectiveScrollTop, viewportHeight)
      : computeVisibleLineIds(focusedId, photoGalleryData.length)

    const hoveredId = mode === 'grid' ? resolveHoveredGridId(gridLayout, effectiveScrollTop, state.pointerX, state.pointerY) : null
    const mountedIds = mode === 'grid' ? visibleIds : visibleIds

    renderGridLayer(cache, gridLayout, effectiveScrollTop, mode, hoveredId, focusedId, mountedIds)
    renderLineLayer(cache, viewportWidth, viewportHeight, mode, focusedId)
    renderZones(cache, mode, viewportHeight)
    renderPageChrome(cache, mode, hoveredId)

    const selectionText = window.getSelection()?.toString() ?? ''
    const report: PhotoGalleryReport = {
      mode,
      focusedId,
      hash: location.hash,
      mountedCount: mountedIds.length,
      totalCount: photoGalleryData.length,
      focusedRowTop: focusedId != null ? findGridItem(gridLayout, focusedId)?.rowTop ?? null : state.lastFocusedId != null ? findGridItem(gridLayout, state.lastFocusedId)?.rowTop ?? null : null,
      selectionText,
    }
    window.__photoGalleryReport = report

    state.lastMode = mode
    state.lastGridLayout = gridLayout
    state.lastScrollTop = effectiveScrollTop
    state.lastViewportWidth = viewportWidth
    state.lastViewportHeight = viewportHeight
    if (focusedId != null) state.lastFocusedId = focusedId
  }

  function renderPageChrome(cache: DomCache, mode: PhotoGalleryMode, hoveredId: string | null): void {
    cache.app.dataset.mode = mode
    document.body.style.overflow = mode === 'line' ? 'hidden' : 'auto'
    if (mode === 'grid') {
      document.body.style.cursor = hoveredId != null ? 'zoom-in' : 'default'
      return
    }

    const pointerX = state.pointerX
    if (pointerX == null) {
      document.body.style.cursor = 'zoom-out'
      return
    }

    document.body.style.cursor = pointerX < lineHitStripWidth || pointerX > window.innerWidth - lineHitStripWidth ? 'zoom-in' : 'zoom-out'
  }

  function renderZones(cache: DomCache, mode: PhotoGalleryMode, viewportHeight: number): void {
    cache.linePrevZone.style.display = mode === 'line' ? 'block' : 'none'
    cache.lineDismissZone.style.display = mode === 'line' ? 'block' : 'none'
    cache.lineNextZone.style.display = mode === 'line' ? 'block' : 'none'

    cache.linePrevZone.style.width = `${lineHitStripWidth}px`
    cache.linePrevZone.style.height = `${viewportHeight}px`
    cache.lineNextZone.style.width = `${lineHitStripWidth}px`
    cache.lineNextZone.style.height = `${viewportHeight}px`
    cache.lineDismissZone.style.left = `${lineHitStripWidth}px`
    cache.lineDismissZone.style.right = `${lineHitStripWidth}px`
    cache.lineDismissZone.style.height = `${viewportHeight}px`
  }

  function renderGridLayer(
    cache: DomCache,
    layout: GridLayout,
    scrollTop: number,
    mode: PhotoGalleryMode,
    hoveredId: string | null,
    focusedId: string | null,
    mountedIds: string[],
  ): void {
    cache.gridLayer.style.display = mode === 'grid' ? 'block' : 'none'
    cache.gridLayer.style.height = `${layout.totalHeight}px`
    cache.gridLayer.dataset.hovered = hoveredId != null ? 'true' : 'false'

    const mountedSet = new Set(mountedIds)
    for (let index = 0; index < photoGalleryData.length; index++) {
      const photo = photoGalleryData[index]!
      const dom = ensureCardDom(cache, photo)
      if (!mountedSet.has(photo.id) || mode !== 'grid') {
        dom.root.remove()
        continue
      }

      if (dom.root.parentElement !== cache.gridLayer) {
        cache.gridLayer.appendChild(dom.root)
      }

      const item = findGridItem(layout, photo.id)
      if (item == null) continue

      const hovered = hoveredId === photo.id
      const pointerDocX = state.pointerX == null ? null : state.pointerX
      const pointerDocY = state.pointerY == null ? null : state.pointerY + scrollTop
      const centerX = item.x + item.width / 2
      const centerY = item.y + item.rowHeight / 2
      const driftX = hovered && pointerDocX != null ? clamp((pointerDocX + window.scrollX - centerX) * hoverDriftFactor, -8, 8) : 0
      const driftY = hovered && pointerDocY != null ? clamp((pointerDocY - centerY) * hoverDriftFactor, -8, 8) : 0
      const scale = hovered ? hoverScale : 1

      dom.root.style.display = 'block'
      dom.root.style.position = 'absolute'
      dom.root.style.left = `${item.x}px`
      dom.root.style.top = `${item.y}px`
      dom.root.style.width = `${item.width}px`
      dom.root.style.height = `${item.height}px`
      dom.root.style.transform = `translate3d(${driftX}px, ${driftY}px, 0) scale(${scale})`
      dom.root.style.opacity = '1'
      dom.root.style.zIndex = hovered ? '3' : focusedId === photo.id ? '2' : '1'
      dom.root.dataset.hovered = hovered ? 'true' : 'false'
      dom.root.dataset.mode = 'grid'

      dom.imageButton.style.width = `${item.width}px`
      dom.imageButton.style.height = `${item.imageHeight}px`
      dom.lowResImage.style.width = `${item.width}px`
      dom.lowResImage.style.height = `${item.imageHeight}px`
      dom.highResImage.style.display = 'none'
      dom.caption.style.height = `${gridCaptionHeight}px`
    }
  }

  function renderLineLayer(cache: DomCache, viewportWidth: number, viewportHeight: number, mode: PhotoGalleryMode, focusedId: string | null): void {
    cache.lineLayer.style.display = mode === 'line' ? 'flex' : 'none'
    cache.lineLayer.style.paddingTop = `${gridTopPadding}px`
    cache.lineLayer.style.paddingBottom = '28px'
    cache.lineLayer.style.paddingLeft = `${gridSidePadding}px`
    cache.lineLayer.style.paddingRight = `${gridSidePadding}px`
    cache.lineLayer.style.gap = `${lineGap}px`
    cache.lineLayer.style.width = `${viewportWidth}px`
    cache.lineLayer.style.height = `${viewportHeight}px`

    if (mode !== 'line' || focusedId == null) {
      cache.lineLayer.replaceChildren()
      return
    }

    const focusedIndex = currentFocusedIndex()
    if (focusedIndex == null) {
      cache.lineLayer.replaceChildren()
      return
    }

    const lineWidth = Math.min(lineBaseCardWidthMax, Math.max(lineBaseCardWidth, Math.floor((viewportWidth - gridSidePadding * 2 - lineGap * 4) / 5)))
    const visibleIndices = lineWindowIndices(focusedIndex, photoGalleryData.length, lineWindowRadius)
    const fragment = document.createDocumentFragment()

    for (let slot = 0; slot < visibleIndices.length; slot++) {
      const photoIndex = visibleIndices[slot]
      const shell = document.createElement('div')
      shell.className = 'line-slot'
      shell.style.width = `${lineWidth}px`
      shell.style.display = 'flex'
      shell.style.flexDirection = 'column'
      shell.style.alignItems = 'center'
      shell.style.flex = '0 0 auto'

      if (photoIndex == null) {
        shell.style.opacity = '0'
        shell.setAttribute('aria-hidden', 'true')
        shell.style.pointerEvents = 'none'
      } else {
        const photo = photoGalleryData[photoIndex]!
        const dom = ensureCardDom(cache, photo)
        if (dom.root.parentElement !== shell) shell.appendChild(dom.root)

        const imageSize = fitPhotoSize(photo, lineWidth)
        const isFocused = photo.id === focusedId
        const scale = isFocused ? 1.35 : 0.7

        dom.root.style.display = 'block'
        dom.root.style.position = 'relative'
        dom.root.style.left = 'auto'
        dom.root.style.top = 'auto'
        dom.root.style.width = `${lineWidth}px`
        dom.root.style.height = `${imageSize.height + gridCaptionHeight}px`
        dom.root.style.transform = `scale(${scale})`
        dom.root.style.opacity = isFocused ? '1' : '0.72'
        dom.root.style.zIndex = isFocused ? '2' : '1'
        dom.root.dataset.mode = 'line'
        dom.root.dataset.focused = isFocused ? 'true' : 'false'

        dom.imageButton.style.width = `${lineWidth}px`
        dom.imageButton.style.height = `${imageSize.height}px`
        dom.lowResImage.style.width = `${lineWidth}px`
        dom.lowResImage.style.height = `${imageSize.height}px`
        dom.highResImage.style.display = isFocused ? 'block' : 'none'
        dom.highResImage.src = isFocused ? `https://cdn.midjourney.com/${photo.id}.webp` : ''
        dom.caption.style.height = `${gridCaptionHeight}px`
      }

      fragment.appendChild(shell)
    }

    cache.lineLayer.replaceChildren(fragment)
  }

  function computeVisibleLineIds(focusedId: string | null, itemCount: number): string[] {
    if (focusedId == null || itemCount === 0) return []
    const focusedIndex = currentFocusedIndex()
    if (focusedIndex == null) return []
    const indices = lineWindowIndices(focusedIndex, itemCount, lineWindowRadius)
    const ids: string[] = []
    for (let index = 0; index < indices.length; index++) {
      const photoIndex = indices[index]
      if (photoIndex == null) continue
      ids.push(photoGalleryData[photoIndex]!.id)
    }
    return ids
  }

  function resolveHoveredGridId(layout: GridLayout, scrollTop: number, pointerX: number | null, pointerY: number | null): string | null {
    if (pointerX == null || pointerY == null) return null
    const docX = pointerX
    const docY = pointerY + scrollTop
    for (let index = layout.items.length - 1; index >= 0; index--) {
      const item = layout.items[index]!
      if (docX < item.x || docX > item.x + item.width) continue
      if (docY < item.y || docY > item.y + item.height) continue
      return item.id
    }
    return null
  }

  function ensureCardDom(cache: DomCache, photo = photoGalleryData[0]!): GalleryCardDom {
    const existing = cache.cards.get(photo.id)
    if (existing != null) return existing

    const root = document.createElement('article')
    root.className = 'photo-card'
    root.dataset.photoId = photo.id

    const imageButton = document.createElement('button')
    imageButton.type = 'button'
    imageButton.className = 'photo-card__image'
    imageButton.dataset.role = 'grid-image'
    imageButton.dataset.photoId = photo.id

    const lowResImage = document.createElement('img')
    lowResImage.className = 'photo-card__image-layer photo-card__image-layer--low'
    lowResImage.alt = photo.prompt
    lowResImage.draggable = false
    lowResImage.loading = 'eager'
    lowResImage.src = `https://cdn.midjourney.com/${photo.id}_384_N.webp`

    const highResImage = document.createElement('img')
    highResImage.className = 'photo-card__image-layer photo-card__image-layer--high'
    highResImage.alt = photo.prompt
    highResImage.draggable = false
    highResImage.loading = 'eager'

    imageButton.append(lowResImage, highResImage)

    const caption = document.createElement('p')
    caption.className = 'photo-card__caption'
    caption.dataset.role = 'caption'
    caption.dataset.photoId = photo.id

    const captionText = document.createElement('span')
    captionText.className = 'photo-card__caption-text'
    captionText.dataset.role = 'caption-text'
    captionText.textContent = photo.prompt
    caption.appendChild(captionText)

    root.append(imageButton, caption)

    const dom: GalleryCardDom = {root, imageButton, lowResImage, highResImage, caption, captionText}
    cache.cards.set(photo.id, dom)
    return dom
  }

  function createDomCache(): DomCache {
    const app = document.createElement('main')
    app.id = 'gallery-app'

    const stage = document.createElement('div')
    stage.id = 'gallery-stage'

    const gridLayer = document.createElement('section')
    gridLayer.id = 'grid-layer'
    gridLayer.dataset.layer = 'grid'

    const lineLayer = document.createElement('section')
    lineLayer.id = 'line-layer'
    lineLayer.dataset.layer = 'line'

    const linePrevZone = document.createElement('button')
    linePrevZone.type = 'button'
    linePrevZone.className = 'line-zone line-zone--prev'
    linePrevZone.dataset.lineZone = 'previous'
    linePrevZone.dataset.role = 'line-previous-zone'

    const lineDismissZone = document.createElement('button')
    lineDismissZone.type = 'button'
    lineDismissZone.className = 'line-zone line-zone--dismiss'
    lineDismissZone.dataset.lineZone = 'dismiss'
    lineDismissZone.dataset.role = 'line-dismiss-zone'

    const lineNextZone = document.createElement('button')
    lineNextZone.type = 'button'
    lineNextZone.className = 'line-zone line-zone--next'
    lineNextZone.dataset.lineZone = 'next'
    lineNextZone.dataset.role = 'line-next-zone'

    const githubLink = document.createElement('a')
    githubLink.className = 'github-link'
    githubLink.href = 'https://github.com/openai'
    githubLink.target = '_blank'
    githubLink.rel = 'noreferrer'
    githubLink.setAttribute('aria-label', 'Open on GitHub')
    githubLink.innerHTML = `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 2C6.48 2 2 6.57 2 12.22c0 4.52 2.87 8.35 6.84 9.7.5.1.68-.22.68-.48 0-.24-.01-1.02-.01-1.85-2.5.47-3.15-.63-3.35-1.22-.11-.3-.59-1.22-1.01-1.47-.35-.19-.84-.66-.01-.67.78-.01 1.34.74 1.53 1.05.9 1.55 2.34 1.12 2.92.85.09-.67.35-1.12.64-1.38-2.24-.26-4.58-1.15-4.58-5.11 0-1.13.39-2.05 1.03-2.78-.1-.26-.45-1.33.1-2.77 0 0 .84-.27 2.75 1.06a9.1 9.1 0 0 1 2.5-.35c.85 0 1.7.12 2.5.35 1.91-1.33 2.75-1.06 2.75-1.06.55 1.44.2 2.51.1 2.77.64.73 1.03 1.65 1.03 2.78 0 3.97-2.34 4.85-4.59 5.11.36.32.68.93.68 1.88 0 1.36-.01 2.45-.01 2.79 0 .26.18.58.69.48A10.08 10.08 0 0 0 22 12.22C22 6.57 17.52 2 12 2Z"/>
      </svg>
    `

    stage.append(gridLayer, lineLayer, linePrevZone, lineDismissZone, lineNextZone)
    app.append(stage, githubLink)
    document.body.appendChild(app)

    gridLayer.addEventListener('pointerdown', handleGridPointerDown)
    gridLayer.addEventListener('click', handleGridClick)
    linePrevZone.addEventListener('click', handleLineZoneClick)
    lineDismissZone.addEventListener('click', handleLineZoneClick)
    lineNextZone.addEventListener('click', handleLineZoneClick)

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerleave', handlePointerLeave)
    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('resize', scheduleRender)
    window.addEventListener('scroll', scheduleRender, true)
    window.addEventListener('hashchange', handleHashChange)

    return {
      app,
      stage,
      gridLayer,
      lineLayer,
      linePrevZone,
      lineDismissZone,
      lineNextZone,
      githubLink,
      cards: new Map(),
    }
  }

  function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value))
  }

  if (isRunning) return
  isRunning = true
  render()
}
