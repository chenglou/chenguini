import { formatGalleryHash, parseGalleryHash, type BrowserReport } from './gallery-hash'
import {
  computeGridLayout,
  computeLineLayout,
  computeMountedRowRange,
  type GridLayout,
  type LineHitArea,
} from './gallery-layout'
import {
  getHighResPhotoUrl,
  getLowResPhotoUrl,
  photoGalleryData,
  type PhotoData,
} from './photo-gallery-data'

type GalleryMode = 'grid' | 'line'

export type PhotoGalleryApp = {
  getMode(): GalleryMode
  getFocusedId(): string | null
  getHashFocusId(): string | null
  getPhotoCount(): number
  getMountedCount(): number
  getVisibleRowRange(): [number, number] | null
  getRowTop(photoId: string): number
  getRowViewportTop(photoId: string): number
  getCardImageButton(photoId: string): HTMLButtonElement | null
  getCardCaption(photoId: string): HTMLElement | null
  getLineHitTarget(area: LineHitArea): HTMLButtonElement
  getScrollViewport(): HTMLDivElement
  nextFrame(): Promise<void>
  publishReport(report: BrowserReport | null): void
}

type GalleryState = {
  focusedId: string | null
  report: BrowserReport | null
  scrollTop: number
  layout: GridLayout
  mountedPhotoIds: string[]
  visibleRowRange: [number, number] | null
}

const photosById = new Map(photoGalleryData.map((photo) => [photo.id, photo]))

function createElement<K extends keyof HTMLElementTagNameMap>(
  tagName: K,
  className?: string,
) {
  const element = document.createElement(tagName)
  if (className !== undefined) {
    element.className = className
  }
  return element
}

function selectElementText(element: HTMLElement) {
  const selection = window.getSelection()
  if (selection === null) {
    return
  }

  const range = document.createRange()
  range.selectNodeContents(element)
  selection.removeAllRanges()
  selection.addRange(range)
}

function syncHash(focusedId: string | null, report: BrowserReport | null) {
  const nextHash = formatGalleryHash({
    focusId: focusedId,
    report,
  })

  if (window.location.hash === nextHash) {
    return
  }

  const nextUrl = `${window.location.pathname}${window.location.search}${nextHash}`
  window.history.replaceState(null, '', nextUrl)
}

export function createPhotoGalleryApp(root: HTMLElement): PhotoGalleryApp {
  const initialHash = parseGalleryHash(window.location.hash)

  const shell = createElement('div', 'gallery-app')
  const githubLink = createElement('a', 'github-link')
  githubLink.href = 'https://github.com/chenglou/vibescript'
  githubLink.target = '_blank'
  githubLink.rel = 'noreferrer'
  githubLink.textContent = 'View on GitHub'

  const scrollViewport = createElement('div', 'gallery-scroll')
  const scrollContent = createElement('div', 'gallery-grid')
  scrollViewport.append(scrollContent)

  const lineOverlay = createElement('div', 'line-overlay')
  const lineBackdrop = createElement('div', 'line-overlay__backdrop')
  const lineStage = createElement('div', 'line-overlay__stage')
  const lineCaption = createElement('p', 'line-overlay__caption')

  const previousHit = createElement('button', 'line-hit line-hit--previous')
  previousHit.type = 'button'
  previousHit.dataset.lineHit = 'previous'
  previousHit.ariaLabel = 'Focus previous photo'

  const dismissHit = createElement('button', 'line-hit line-hit--dismiss')
  dismissHit.type = 'button'
  dismissHit.dataset.lineHit = 'dismiss'
  dismissHit.ariaLabel = 'Dismiss focused line mode'

  const nextHit = createElement('button', 'line-hit line-hit--next')
  nextHit.type = 'button'
  nextHit.dataset.lineHit = 'next'
  nextHit.ariaLabel = 'Focus next photo'

  lineOverlay.append(lineBackdrop, lineStage, lineCaption, previousHit, dismissHit, nextHit)
  shell.append(githubLink, scrollViewport, lineOverlay)
  root.replaceChildren(shell)

  const state: GalleryState = {
    focusedId: initialHash.focusId !== null && photosById.has(initialHash.focusId) ? initialHash.focusId : null,
    report: initialHash.report,
    scrollTop: 0,
    layout: computeGridLayout({
      photos: photoGalleryData,
      viewportWidth: window.innerWidth,
    }),
    mountedPhotoIds: [],
    visibleRowRange: null,
  }

  function getFocusedIndex() {
    if (state.focusedId === null) {
      return -1
    }
    return photoGalleryData.findIndex((photo) => photo.id === state.focusedId)
  }

  function setFocusedId(nextFocusedId: string | null) {
    if (nextFocusedId !== null && !photosById.has(nextFocusedId)) {
      return
    }

    state.focusedId = nextFocusedId
    syncHash(state.focusedId, state.report)
    render()
  }

  function focusAdjacent(delta: -1 | 1) {
    const currentIndex = getFocusedIndex()
    if (currentIndex === -1) {
      return
    }

    const nextPhoto = photoGalleryData[currentIndex + delta]
    if (nextPhoto !== undefined) {
      setFocusedId(nextPhoto.id)
    }
  }

  function dismissFocusedMode() {
    if (state.focusedId === null) {
      return
    }

    const focusedLayout = state.layout.itemsById[state.focusedId]
    const restoreTop = Math.max(0, focusedLayout.top - 40)

    state.focusedId = null
    syncHash(state.focusedId, state.report)
    render()
    scrollViewport.scrollTop = restoreTop
    state.scrollTop = restoreTop
    renderGrid()
  }

  function publishReport(report: BrowserReport | null) {
    state.report = report
    syncHash(state.focusedId, state.report)
  }

  function renderGrid() {
    const mountedRange = computeMountedRowRange({
      rows: state.layout.rows,
      scrollTop: state.scrollTop,
      viewportHeight: scrollViewport.clientHeight,
    })

    scrollContent.style.height = `${state.layout.totalHeight}px`

    if (mountedRange === null) {
      scrollContent.replaceChildren()
      state.mountedPhotoIds = []
      state.visibleRowRange = null
      return
    }

    const mountedPhotoIds: string[] = []
    const fragment = document.createDocumentFragment()

    for (let rowIndex = mountedRange.mountedStartRow; rowIndex <= mountedRange.mountedEndRow; rowIndex += 1) {
      const row = state.layout.rows[rowIndex]
      for (const photoId of row.itemIds) {
        const photo = photosById.get(photoId)
        const item = state.layout.itemsById[photoId]

        if (photo === undefined) {
          continue
        }

        const card = createElement('article', 'grid-card')
        card.dataset.photoCard = photoId
        card.style.left = `${item.left}px`
        card.style.top = `${item.top}px`
        card.style.width = `${item.width}px`
        card.style.height = `${item.cardHeight}px`

        const imageButton = createElement('button', 'grid-card__image-button')
        imageButton.type = 'button'
        imageButton.dataset.photoImageButton = photoId
        imageButton.ariaLabel = `Focus ${photo.prompt}`
        imageButton.style.height = `${item.imageHeight}px`
        imageButton.addEventListener('click', () => {
          window.getSelection()?.removeAllRanges()
          setFocusedId(photoId)
        })

        const image = createElement('img', 'grid-card__image')
        image.src = getLowResPhotoUrl(photoId)
        image.alt = photo.prompt
        image.loading = 'lazy'
        image.decoding = 'async'
        image.style.width = `${item.imageWidth}px`
        image.style.height = `${item.imageHeight}px`
        imageButton.append(image)

        const caption = createElement('p', 'grid-card__caption')
        caption.dataset.photoCaption = photoId
        caption.textContent = photo.prompt
        caption.title = photo.prompt
        caption.addEventListener('click', (event) => {
          event.stopPropagation()
          selectElementText(caption)
        })

        card.append(imageButton, caption)
        fragment.append(card)
        mountedPhotoIds.push(photoId)
      }
    }

    scrollContent.replaceChildren(fragment)
    state.mountedPhotoIds = mountedPhotoIds
    state.visibleRowRange = [mountedRange.visibleStartRow, mountedRange.visibleEndRow]
  }

  function renderLine() {
    const focusedIndex = getFocusedIndex()
    if (focusedIndex === -1) {
      lineOverlay.hidden = true
      lineStage.replaceChildren()
      lineCaption.textContent = ''
      previousHit.disabled = true
      nextHit.disabled = true
      return
    }

    const focusedPhoto = photoGalleryData[focusedIndex]
    const lineLayout = computeLineLayout({
      photos: photoGalleryData,
      focusedIndex,
      viewportWidth: scrollViewport.clientWidth,
      viewportHeight: scrollViewport.clientHeight,
    })

    const fragment = document.createDocumentFragment()
    for (const item of lineLayout.items) {
      const photo = photosById.get(item.id) as PhotoData
      const visual = createElement('figure', 'line-item')
      visual.dataset.linePhoto = item.id
      visual.style.left = `${item.left}px`
      visual.style.top = `${item.top}px`
      visual.style.width = `${item.width}px`
      visual.style.height = `${item.height}px`
      visual.style.opacity = `${item.opacity}`

      const image = createElement('img', 'line-item__image')
      image.src = item.isFocused ? getHighResPhotoUrl(item.id) : getLowResPhotoUrl(item.id)
      image.alt = photo.prompt
      image.decoding = 'async'

      visual.append(image)
      fragment.append(visual)
    }

    lineOverlay.hidden = false
    lineStage.replaceChildren(fragment)
    lineCaption.textContent = focusedPhoto.prompt
    lineCaption.style.top = `${lineLayout.captionTop}px`
    lineCaption.style.width = `${lineLayout.captionWidth}px`

    previousHit.disabled = focusedIndex === 0
    nextHit.disabled = focusedIndex === photoGalleryData.length - 1
  }

  function render() {
    state.layout = computeGridLayout({
      photos: photoGalleryData,
      viewportWidth: scrollViewport.clientWidth,
    })

    shell.dataset.mode = state.focusedId === null ? 'grid' : 'line'
    scrollViewport.classList.toggle('gallery-scroll--locked', state.focusedId !== null)
    renderGrid()
    renderLine()
  }

  previousHit.addEventListener('click', () => {
    focusAdjacent(-1)
  })
  nextHit.addEventListener('click', () => {
    focusAdjacent(1)
  })
  dismissHit.addEventListener('click', () => {
    dismissFocusedMode()
  })

  scrollViewport.addEventListener('scroll', () => {
    state.scrollTop = scrollViewport.scrollTop
    renderGrid()
  })

  window.addEventListener('resize', () => {
    render()
  })

  window.addEventListener('hashchange', () => {
    const hashState = parseGalleryHash(window.location.hash)
    state.focusedId = hashState.focusId !== null && photosById.has(hashState.focusId) ? hashState.focusId : null
    state.report = hashState.report
    render()
  })

  render()

  return {
    getMode() {
      return state.focusedId === null ? 'grid' : 'line'
    },
    getFocusedId() {
      return state.focusedId
    },
    getHashFocusId() {
      return parseGalleryHash(window.location.hash).focusId
    },
    getPhotoCount() {
      return photoGalleryData.length
    },
    getMountedCount() {
      return state.mountedPhotoIds.length
    },
    getVisibleRowRange() {
      return state.visibleRowRange
    },
    getRowTop(photoId: string) {
      return state.layout.itemsById[photoId].top
    },
    getRowViewportTop(photoId: string) {
      const item = state.layout.itemsById[photoId]
      return item.top - scrollViewport.scrollTop
    },
    getCardImageButton(photoId: string) {
      return scrollContent.querySelector<HTMLButtonElement>(`[data-photo-image-button="${CSS.escape(photoId)}"]`)
    },
    getCardCaption(photoId: string) {
      return scrollContent.querySelector<HTMLElement>(`[data-photo-caption="${CSS.escape(photoId)}"]`)
    },
    getLineHitTarget(area: LineHitArea) {
      return lineOverlay.querySelector<HTMLButtonElement>(`[data-line-hit="${area}"]`)! 
    },
    getScrollViewport() {
      return scrollViewport
    },
    async nextFrame() {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
    },
    publishReport,
  }
}
