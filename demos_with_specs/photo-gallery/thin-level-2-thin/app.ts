import { getPhotoSrc, type PhotoData } from './data'
import {
  GRID,
  LINE,
  computeGridLayout,
  computeLineLayout,
  getVisibleRowRange,
  hashForPhoto,
  parsePhotoHash,
  type LineAction,
  type VisibleRowRange,
} from './model'

export type PhotoGalleryApp = ReturnType<typeof createPhotoGalleryApp>

type AppSnapshot = {
  mode: 'grid' | 'line'
  focusId: string | null
  mountedCount: number
  totalCount: number
  visibleRowRange: VisibleRowRange
}

type AppOptions = {
  reportMode: boolean
}

export function createPhotoGalleryApp(root: HTMLElement, photos: PhotoData[], options: AppOptions) {
  let layout = computeGridLayout(photos, window.innerWidth)
  let focusId = findFocusableId(parsePhotoHash(window.location.hash), photos)
  let lastFocusedRow = focusId === null ? null : getRowForPhoto(focusId)
  let visibleRowRange = getVisibleRowRange(layout, window.scrollY, window.innerHeight)
  let renderQueued = false

  function getRowForPhoto(id: string): number | null {
    const item = layout.items.find((candidate) => candidate.photo.id === id)
    return item?.row ?? null
  }

  function findFocusableId(id: string | null, candidates: PhotoData[]): string | null {
    if (id === null) {
      return null
    }

    return candidates.some((photo) => photo.id === id) ? id : null
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

  function replaceHash(nextHash: string) {
    history.replaceState(null, '', `${window.location.pathname}${window.location.search}${nextHash}`)
  }

  function applyFocus(nextFocusId: string | null) {
    focusId = nextFocusId
    if (nextFocusId !== null) {
      lastFocusedRow = getRowForPhoto(nextFocusId)
      replaceHash(hashForPhoto(nextFocusId))
    } else {
      replaceHash('')
    }

    document.body.classList.toggle('line-open', nextFocusId !== null)
    scheduleRender()
  }

  function updateLayout() {
    layout = computeGridLayout(photos, window.innerWidth)
    visibleRowRange = getVisibleRowRange(layout, window.scrollY, window.innerHeight)
  }

  function syncFocusFromHash() {
    const nextFocusId = findFocusableId(parsePhotoHash(window.location.hash), photos)
    focusId = nextFocusId
    if (nextFocusId !== null) {
      lastFocusedRow = getRowForPhoto(nextFocusId)
    }

    document.body.classList.toggle('line-open', nextFocusId !== null)
    scheduleRender()
  }

  function openPhoto(id: string) {
    applyFocus(id)
  }

  function dismissLine() {
    const row = focusId === null ? lastFocusedRow : getRowForPhoto(focusId)
    applyFocus(null)
    if (row !== null) {
      const rowTop = layout.rowTops[row] ?? 0
      window.scrollTo({top: Math.max(0, rowTop - GRID.topPadding)})
    }
  }

  function moveFocus(direction: -1 | 1) {
    if (focusId === null) {
      return
    }

    const index = photos.findIndex((photo) => photo.id === focusId)
    if (index === -1) {
      return
    }

    const nextIndex = Math.min(Math.max(index + direction, 0), photos.length - 1)
    openPhoto(photos[nextIndex]!.id)
  }

  function handleLineAction(action: LineAction) {
    if (action === 'previous') {
      moveFocus(-1)
      return
    }

    if (action === 'next') {
      moveFocus(1)
      return
    }

    dismissLine()
  }

  function selectText(element: HTMLElement) {
    const selection = window.getSelection()
    if (selection === null) {
      return
    }

    const range = document.createRange()
    range.selectNodeContents(element)
    selection.removeAllRanges()
    selection.addRange(range)
  }

  function renderGridCard(track: HTMLElement, photo: PhotoData) {
    const item = layout.items.find((candidate) => candidate.photo.id === photo.id)
    if (item === undefined) {
      return
    }

    const card = document.createElement('article')
    card.className = 'grid-card'
    card.dataset.gridCard = photo.id
    card.style.left = `${item.x}px`
    card.style.top = `${item.y}px`
    card.style.width = `${item.width}px`
    card.style.height = `${item.totalHeight}px`

    const imageButton = document.createElement('button')
    imageButton.type = 'button'
    imageButton.className = 'grid-image-button'
    imageButton.dataset.gridImageButton = photo.id
    imageButton.style.height = `${item.height}px`
    imageButton.addEventListener('click', (event) => {
      event.preventDefault()
      event.stopPropagation()
      openPhoto(photo.id)
    })

    const image = document.createElement('img')
    image.className = 'photo-image'
    image.src = getPhotoSrc(photo, 'grid', options.reportMode)
    image.alt = photo.prompt
    image.loading = 'lazy'
    imageButton.append(image)

    const caption = document.createElement('div')
    caption.className = 'grid-caption'
    caption.dataset.gridCaption = photo.id
    caption.textContent = photo.prompt
    caption.title = photo.prompt
    caption.addEventListener('click', (event) => {
      event.preventDefault()
      event.stopPropagation()
      selectText(caption)
    })

    card.append(imageButton, caption)
    track.append(card)
  }

  function renderLineMode(container: HTMLElement, currentFocusId: string) {
    const focusIndex = photos.findIndex((photo) => photo.id === currentFocusId)
    if (focusIndex === -1) {
      return
    }

    const overlay = document.createElement('section')
    overlay.className = 'line-overlay'

    const mode = computeLineLayout(photos, focusIndex, window.innerWidth, window.innerHeight)
    const lineTrack = document.createElement('div')
    lineTrack.className = 'line-track'

    for (const item of mode.items) {
      const figure = document.createElement('figure')
      figure.className = item.isFocused ? 'line-card is-focused' : 'line-card'
      figure.style.left = `${item.left}px`
      figure.style.top = `${item.top}px`
      figure.style.width = `${item.width}px`
      figure.style.height = `${item.height + LINE.captionVisible + LINE.captionBottom}px`

      const image = document.createElement('img')
      image.className = 'photo-image'
      image.src = getPhotoSrc(item.photo, 'line', options.reportMode)
      image.alt = item.photo.prompt
      image.style.height = `${item.height}px`

      const caption = document.createElement('figcaption')
      caption.className = 'line-caption'
      caption.textContent = item.photo.prompt
      caption.title = item.photo.prompt

      figure.append(image, caption)
      lineTrack.append(figure)
    }

    overlay.append(lineTrack)

    for (const action of ['previous', 'dismiss', 'next'] as const) {
      const button = document.createElement('button')
      button.type = 'button'
      button.className = `line-zone line-zone-${action}`
      button.dataset.lineZone = action
      button.ariaLabel = action
      button.addEventListener('click', (event) => {
        event.preventDefault()
        handleLineAction(action)
      })
      overlay.append(button)
    }

    container.append(overlay)
  }

  function render() {
    visibleRowRange = getVisibleRowRange(layout, window.scrollY, window.innerHeight)
    const shell = document.createElement('main')
    shell.className = 'gallery-shell'
    shell.dataset.mode = focusId === null ? 'grid' : 'line'

    const gridTrack = document.createElement('div')
    gridTrack.className = 'grid-track'
    gridTrack.style.height = `${layout.totalHeight}px`
    shell.append(gridTrack)

    for (const photo of photos) {
      const item = layout.items.find((candidate) => candidate.photo.id === photo.id)
      if (item === undefined || visibleRowRange === null) {
        continue
      }

      if (item.row < visibleRowRange[0] || item.row > visibleRowRange[1]) {
        continue
      }

      renderGridCard(gridTrack, photo)
    }

    if (focusId !== null) {
      renderLineMode(shell, focusId)
    }

    root.replaceChildren(shell)
  }

  function onResize() {
    updateLayout()
    scheduleRender()
  }

  function onScroll() {
    visibleRowRange = getVisibleRowRange(layout, window.scrollY, window.innerHeight)
    scheduleRender()
  }

  window.addEventListener('resize', onResize)
  window.addEventListener('scroll', onScroll, {passive: true})
  window.addEventListener('hashchange', syncFocusFromHash)

  updateLayout()
  render()

  async function waitForPaint() {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
  }

  function clickGridImage(id: string) {
    const button = root.querySelector<HTMLButtonElement>(`[data-grid-image-button="${CSS.escape(id)}"]`)
    if (button === null) {
      throw new Error(`Grid image button for ${id} is not mounted`)
    }
    button.click()
  }

  function clickGridCaption(id: string) {
    const caption = root.querySelector<HTMLElement>(`[data-grid-caption="${CSS.escape(id)}"]`)
    if (caption === null) {
      throw new Error(`Grid caption for ${id} is not mounted`)
    }
    caption.click()
  }

  function clickLineZone(action: LineAction) {
    const zone = root.querySelector<HTMLButtonElement>(`[data-line-zone="${action}"]`)
    if (zone === null) {
      throw new Error(`Line zone ${action} is not mounted`)
    }
    zone.click()
  }

  async function scrollPhotoRowIntoView(id: string, viewportOffset: number) {
    const item = layout.items.find((candidate) => candidate.photo.id === id)
    if (item === undefined) {
      throw new Error(`Photo ${id} is missing from the grid layout`)
    }

    window.scrollTo({top: Math.max(0, item.y - viewportOffset)})
    await waitForPaint()
  }

  function getGridCardTop(id: string): number {
    const card = root.querySelector<HTMLElement>(`[data-grid-card="${CSS.escape(id)}"]`)
    if (card === null) {
      throw new Error(`Grid card for ${id} is not mounted`)
    }

    return card.getBoundingClientRect().top
  }

  function getSnapshot(): AppSnapshot {
    return {
      mode: focusId === null ? 'grid' : 'line',
      focusId,
      mountedCount: root.querySelectorAll('[data-grid-card]').length,
      totalCount: photos.length,
      visibleRowRange,
    }
  }

  return {
    getSnapshot,
    clickGridImage,
    clickGridCaption,
    clickLineZone,
    scrollPhotoRowIntoView,
    getGridCardTop,
    waitForPaint,
  }
}
