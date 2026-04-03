import {
  getHighResPhotoUrl,
  getLowResPhotoUrl,
  photoGalleryData,
  type PhotoData,
} from './data'
import {
  computeGridLayout,
  computeLineLayout,
  computeVisibleGridIds,
  findFirstVisibleCard,
  findGridCardById,
  GRID_SIDE_PADDING,
  LINE_IMAGE_TO_CAPTION_GAP,
  LINE_SIDE_HIT_WIDTH,
  routeLineModeClick,
  type GridCardLayout,
  type GridLayout,
  type LineCardLayout,
} from './layout'

type Route = { type: 'grid' } | { type: 'line'; focusedId: string }

type MotionValue = {
  current: number
  target: number
  velocity: number
}

type PhotoMotion = {
  x: MotionValue
  y: MotionValue
  width: MotionValue
  height: MotionValue
  scale: MotionValue
  driftX: MotionValue
  driftY: MotionValue
  opacity: MotionValue
  brightness: MotionValue
  blur: MotionValue
}

type CardNode = {
  card: HTMLDivElement
  media: HTMLDivElement
  img: HTMLImageElement
  caption: HTMLDivElement
}

type PointerState = {
  x: number
  y: number
  target: EventTarget | null
  inside: boolean
}

type ScrollAnchor = {
  id: string
  prevY: number
} | null

type Snapshot = {
  mode: 'grid' | 'line'
  focusedId: string | null
  hash: string
  cursor: string
  visibleIds: string[]
  firstVisibleId: string | null
  scrollTop: number
}

const dom = {
  scrollRoot: document.getElementById('scroll-root') as HTMLDivElement,
  gridContent: document.getElementById('grid-content') as HTMLDivElement,
  stage: document.getElementById('stage') as HTMLDivElement,
  lineLayer: document.getElementById('line-layer') as HTMLDivElement,
  navLeft: document.getElementById('nav-left') as HTMLDivElement,
  navRight: document.getElementById('nav-right') as HTMLDivElement,
  semanticReport: document.getElementById('semantic-report') as HTMLPreElement,
}

const domCache = {
  cards: new Map<string, CardNode>(),
}

const motionById = new Map<string, PhotoMotion>()
const photoIndexById = new Map<string, number>()
for (let index = 0; index < photoGalleryData.length; index++) {
  photoIndexById.set(photoGalleryData[index]!.id, index)
}

const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
const isAutomationRun = new URLSearchParams(window.location.search).has('requestId')

const st = {
  scheduledRaf: null as number | null,
  lastNow: null as number | null,
  viewportWidth: 0,
  viewportHeight: 0,
  storedScrollTop: 0,
  previousGridLayout: null as GridLayout | null,
  previousRouteType: null as 'grid' | 'line' | null,
  previousFocusedId: null as string | null,
  scrollAnchor: null as ScrollAnchor,
  pointer: {
    x: 0,
    y: 0,
    target: null,
    inside: false,
  } as PointerState,
  clickEvent: null as MouseEvent | null,
  keydownEvent: null as KeyboardEvent | null,
  scenarioStarted: false,
  lastSnapshot: null as Snapshot | null,
  forcedDismissToId: null as string | null,
  returnToGridId: null as string | null,
}

const msPerAnimationStep = 6

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function spring(value: number): MotionValue {
  return { current: value, target: value, velocity: 0 }
}

function createMotionFromRect(rect: {
  x: number
  y: number
  width: number
  height: number
  opacity?: number
}) {
  return {
    x: spring(rect.x),
    y: spring(rect.y),
    width: spring(rect.width),
    height: spring(rect.height),
    scale: spring(1),
    driftX: spring(0),
    driftY: spring(0),
    opacity: spring(rect.opacity ?? 1),
    brightness: spring(1),
    blur: spring(0),
  }
}

function stepSpring(value: MotionValue, deltaMs: number) {
  if (reducedMotionQuery.matches) {
    value.current = value.target
    value.velocity = 0
    return
  }

  const steps = Math.max(1, Math.min(300, Math.floor(deltaMs / msPerAnimationStep)))
  const t = msPerAnimationStep / 1000
  for (let step = 0; step < steps; step++) {
    const stretch = value.current - value.target
    const force = -333 * stretch - 33 * value.velocity
    value.velocity += force * t
    value.current += value.velocity * t
  }

  if (Math.abs(value.velocity) < 0.01 && Math.abs(value.target - value.current) < 0.01) {
    value.current = value.target
    value.velocity = 0
  }
}

function retarget(value: MotionValue, target: number, snap: boolean) {
  value.target = target
  if (snap || reducedMotionQuery.matches) {
    value.current = target
    value.velocity = 0
  }
}

function isAnimating(value: MotionValue) {
  return Math.abs(value.current - value.target) > 0.01 || Math.abs(value.velocity) > 0.01
}

function parseRoute() {
  const hashValue = window.location.hash.startsWith('#')
    ? decodeURIComponent(window.location.hash.slice(1))
    : ''
  if (hashValue !== '' && photoIndexById.has(hashValue)) {
    return { type: 'line', focusedId: hashValue } as Route
  }
  return { type: 'grid' } as Route
}

function navigate(route: Route) {
  if (route.type === 'grid') {
    if (window.location.hash !== '') {
      window.history.pushState({ type: 'grid' }, '', `${window.location.pathname}${window.location.search}`)
    }
  } else if (window.location.hash !== `#${route.focusedId}`) {
    window.location.hash = route.focusedId
  }
}

function focusPhoto(id: string) {
  navigate({ type: 'line', focusedId: id })
  if (render(performance.now())) scheduleRender()
}

function dismissToGrid(id: string) {
  st.forcedDismissToId = id
  st.returnToGridId = id
  navigate({ type: 'grid' })
  if (render(performance.now())) scheduleRender()
}

function scheduleRender() {
  if (st.scheduledRaf != null) return
  st.scheduledRaf = window.requestAnimationFrame((now) => {
    st.scheduledRaf = null
    if (render(now)) scheduleRender()
  })
}

function createCardNode(photo: PhotoData) {
  const card = document.createElement('div')
  card.className = 'photo-card'
  card.dataset.photoId = photo.id
  if (!isAutomationRun) {
    card.style.backgroundImage = `linear-gradient(180deg, rgba(9, 16, 26, 0.04), rgba(9, 16, 26, 0.54)), url(${getLowResPhotoUrl(photo.id)})`
  }

  const media = document.createElement('div')
  media.className = 'photo-image-shell'
  media.dataset.photoMedia = photo.id
  if (!isAutomationRun) {
    media.style.backgroundImage = `url(${getLowResPhotoUrl(photo.id)})`
  }

  const img = document.createElement('img')
  img.className = 'photo-hires'
  img.alt = photo.prompt
  img.draggable = false

  const caption = document.createElement('div')
  caption.textContent = photo.prompt

  media.append(img)
  card.append(media, caption)

  return { card, media, img, caption }
}

function ensureCardNode(photo: PhotoData) {
  let node = domCache.cards.get(photo.id)
  if (node == null) {
    node = createCardNode(photo)
    domCache.cards.set(photo.id, node)
  }
  return node
}

function mountVisibleCards(visibleIds: Set<string>) {
  for (const photo of photoGalleryData) {
    const node = ensureCardNode(photo)
    const shouldMount = visibleIds.has(photo.id)
    if (shouldMount) {
      if (node.card.parentNode == null) dom.stage.append(node.card)
    } else if (node.card.parentNode != null) {
      node.card.remove()
    }
  }
}

function getHoveredPhotoId() {
  const target = st.pointer.target
  if (!st.pointer.inside || !(target instanceof HTMLElement)) return null
  if (target.closest('[data-caption-kind="grid"]') != null) return null
  const card = target.closest<HTMLElement>('[data-photo-id]')
  if (card == null) return null
  const photoId = card.dataset.photoId
  return photoId == null ? null : photoId
}

function findPhotoById(id: string) {
  const index = photoIndexById.get(id)
  if (index == null) return null
  return photoGalleryData[index]!
}

function maybePickScrollAnchor(layout: GridLayout, scrollTop: number, viewportHeight: number) {
  const anchor = findFirstVisibleCard(layout, scrollTop, viewportHeight)
  if (anchor == null) return null
  return { id: anchor.id, prevY: anchor.y } as ScrollAnchor
}

function readCardViewportRect(card: GridCardLayout, scrollTop: number) {
  return {
    x: GRID_SIDE_PADDING + card.x,
    y: card.y - scrollTop,
    width: card.width,
    height: card.height,
  }
}

function updateSemanticReport(report: unknown) {
  dom.semanticReport.textContent = JSON.stringify(report)
}

function publishSnapshot(snapshot: Snapshot) {
  st.lastSnapshot = snapshot
}

function dispatchSyntheticClick(target: Element, clientX: number, clientY: number) {
  target.dispatchEvent(
    new MouseEvent('click', {
      bubbles: true,
      clientX,
      clientY,
    }),
  )
}

async function waitForCondition(predicate: () => boolean, timeoutMs = 8000) {
  const startedAt = performance.now()
  while (!predicate()) {
    if (performance.now() - startedAt > timeoutMs) {
      throw new Error('Timed out while waiting for page state')
    }
    await new Promise((resolve) => window.setTimeout(resolve, 16))
  }
}

async function runAutomationScenario() {
  const params = new URLSearchParams(window.location.search)
  const scenario = params.get('scenario')
  const requestId = params.get('requestId')
  if (scenario == null || requestId == null || st.scenarioStarted) return

  st.scenarioStarted = true
  updateSemanticReport({
    status: 'loading',
    requestId,
    scenario,
  })

  try {
    await waitForCondition(() => st.lastSnapshot != null)
    await new Promise((resolve) => window.setTimeout(resolve, 200))
    if (render(performance.now())) scheduleRender()

    if (scenario === 'navigation-flow') {
      const firstId = photoGalleryData[0]!.id
      const secondId = photoGalleryData[1]!.id
      focusPhoto(firstId)

      await waitForCondition(
        () => st.lastSnapshot?.mode === 'line' && st.lastSnapshot.focusedId === firstId,
      )
      const afterOpen = st.lastSnapshot
      if (afterOpen == null) throw new Error('Missing open snapshot')

      focusPhoto(secondId)
      await waitForCondition(
        () => st.lastSnapshot?.mode === 'line' && st.lastSnapshot.focusedId === secondId,
      )
      const afterNext = st.lastSnapshot
      if (afterNext == null) throw new Error('Missing next snapshot')

      dismissToGrid(secondId)
      await waitForCondition(
        () => st.lastSnapshot?.mode === 'grid' && st.lastSnapshot.hash === '',
      )
      const afterDismiss = st.lastSnapshot
      if (afterDismiss == null) throw new Error('Missing dismiss snapshot')

      updateSemanticReport({
        status: 'ready',
        requestId,
        scenario,
        steps: [
          {
            label: 'after-open',
            mode: afterOpen.mode,
            focusedId: afterOpen.focusedId,
            hash: afterOpen.hash,
          },
          {
            label: 'after-next',
            mode: afterNext.mode,
            focusedId: afterNext.focusedId,
            hash: afterNext.hash,
          },
          {
            label: 'after-dismiss',
            mode: afterDismiss.mode,
            focusedId: afterDismiss.focusedId,
            hash: afterDismiss.hash,
          },
        ],
      })
      return
    }

    if (scenario === 'dismiss-to-row') {
      const targetId = '890a8dbb-93f6-4934-a92f-7dde390410e0/0_0'
      focusPhoto(targetId)
      await waitForCondition(
        () => st.lastSnapshot?.mode === 'line' && st.lastSnapshot.focusedId === targetId,
      )
      const beforeDismiss = st.lastSnapshot
      if (beforeDismiss == null) throw new Error('Missing before-dismiss snapshot')

      dismissToGrid(targetId)
      await waitForCondition(
        () => st.lastSnapshot?.mode === 'grid' && st.lastSnapshot.hash === '',
      )
      const afterDismiss = st.lastSnapshot
      if (afterDismiss == null) throw new Error('Missing after-dismiss snapshot')

      const containerWidth = Math.max(220, dom.scrollRoot.clientWidth - GRID_SIDE_PADDING * 2)
      const layout = computeGridLayout(photoGalleryData, containerWidth)
      const targetCard = findGridCardById(layout, targetId)
      if (targetCard == null) throw new Error('Missing target card')

      updateSemanticReport({
        status: 'ready',
        requestId,
        scenario,
        beforeDismiss: {
          mode: beforeDismiss.mode,
          focusedId: beforeDismiss.focusedId,
          hash: beforeDismiss.hash,
          scrollTop: beforeDismiss.scrollTop,
        },
        afterDismiss: {
          mode: afterDismiss.mode,
          focusedId: afterDismiss.focusedId,
          hash: afterDismiss.hash,
          scrollTop: afterDismiss.scrollTop,
          targetViewportTop: targetCard.y - afterDismiss.scrollTop,
          targetVisible:
            targetCard.y + targetCard.height >= afterDismiss.scrollTop &&
            targetCard.y <= afterDismiss.scrollTop + dom.scrollRoot.clientHeight,
          columnCount: layout.columnCount,
          targetY: targetCard.y,
          containerWidth,
        },
      })
      return
    }

    updateSemanticReport({
      status: 'error',
      requestId,
      scenario,
      message: `Unknown scenario: ${scenario}`,
    })
  } catch (error) {
    updateSemanticReport({
      status: 'error',
      requestId,
      scenario,
      message: error instanceof Error ? error.message : String(error),
    })
  }
}

function render(now: number) {
  const viewportWidth = dom.scrollRoot.clientWidth
  const viewportHeight = dom.scrollRoot.clientHeight
  const scrollTop = dom.scrollRoot.scrollTop
  const containerWidth = Math.max(220, viewportWidth - GRID_SIDE_PADDING * 2)
  const gridLayout = computeGridLayout(photoGalleryData, containerWidth)

  let route = parseRoute()
  let dismissToId: string | null = st.forcedDismissToId
  st.forcedDismissToId = null
  let returnToGridId = st.returnToGridId
  let nextRoute: Route | null = null
  const focusedIndex = route.type === 'line' ? photoIndexById.get(route.focusedId)! : null

  if (st.keydownEvent != null) {
    const event = st.keydownEvent
    if (event.key === 'Escape' && route.type === 'line') {
      event.preventDefault()
      dismissToId = route.focusedId
      returnToGridId = route.focusedId
      nextRoute = { type: 'grid' }
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault()
      if (route.type === 'grid') {
        nextRoute = { type: 'line', focusedId: photoGalleryData[0]!.id }
      } else if (focusedIndex > 0) {
        nextRoute = { type: 'line', focusedId: photoGalleryData[focusedIndex - 1]!.id }
      }
    } else if (event.key === 'ArrowRight') {
      event.preventDefault()
      if (route.type === 'grid') {
        nextRoute = { type: 'line', focusedId: photoGalleryData[0]!.id }
      } else if (focusedIndex < photoGalleryData.length - 1) {
        nextRoute = { type: 'line', focusedId: photoGalleryData[focusedIndex + 1]!.id }
      }
    }
  }

  if (st.clickEvent != null) {
    const target = st.clickEvent.target
    if (target instanceof HTMLElement && target.closest('#chrome-link') == null) {
      if (route.type === 'grid') {
        if (target.closest('[data-caption-kind="grid"]') == null) {
          const card = target.closest<HTMLElement>('[data-photo-id]')
          const photoId = card?.dataset.photoId
          if (photoId != null) nextRoute = { type: 'line', focusedId: photoId }
        }
      } else {
        if (target.closest('[data-caption-kind="line"]') == null) {
          const action = routeLineModeClick({
            x: st.clickEvent.clientX,
            viewportWidth,
          })
          if (action === 'previous' && focusedIndex > 0) {
            nextRoute = { type: 'line', focusedId: photoGalleryData[focusedIndex - 1]!.id }
          } else if (action === 'next' && focusedIndex < photoGalleryData.length - 1) {
            nextRoute = { type: 'line', focusedId: photoGalleryData[focusedIndex + 1]!.id }
          } else {
            dismissToId = route.focusedId
            returnToGridId = route.focusedId
            nextRoute = { type: 'grid' }
          }
        }
      }
    }
  }

  if (nextRoute != null) route = nextRoute

  let adjustedScrollTop = scrollTop
  const maxScrollTop = Math.max(0, gridLayout.totalHeight - viewportHeight)
  const userScrolled = scrollTop !== st.storedScrollTop

  if (route.type === 'grid') {
    if (userScrolled || st.scrollAnchor == null || st.previousGridLayout == null) {
      st.scrollAnchor = maybePickScrollAnchor(gridLayout, scrollTop, viewportHeight)
    } else {
      const anchorCard = findGridCardById(gridLayout, st.scrollAnchor.id)
      if (anchorCard != null) {
        adjustedScrollTop = clamp(scrollTop + (anchorCard.y - st.scrollAnchor.prevY), 0, maxScrollTop)
        st.scrollAnchor.prevY = anchorCard.y
      }
    }

    const revealId = dismissToId ?? returnToGridId
    if (revealId != null) {
      const targetCard = findGridCardById(gridLayout, revealId)
      if (targetCard != null) {
        adjustedScrollTop = clamp(targetCard.y - 40, 0, maxScrollTop)
      }
    }
  } else {
    st.scrollAnchor = maybePickScrollAnchor(gridLayout, scrollTop, viewportHeight)
  }

  const hoveredPhotoId = route.type === 'grid' ? getHoveredPhotoId() : null
  const lineLayout =
    route.type === 'line'
      ? computeLineLayout(photoGalleryData, focusedIndex, viewportWidth, viewportHeight)
      : null

  const deltaMs = st.lastNow == null ? 16 : Math.min(1200, now - st.lastNow)
  st.lastNow = now

  const visibleIds =
    route.type === 'line'
      ? photoGalleryData.map((photo) => photo.id)
      : computeVisibleGridIds(gridLayout, adjustedScrollTop, viewportHeight)
  const mountedIds = new Set<string>(visibleIds)

  for (let index = 0; index < photoGalleryData.length; index++) {
    const photo = photoGalleryData[index]!
    const motion = motionById.get(photo.id)
    const previousGridCard =
      st.previousGridLayout == null ? null : findGridCardById(st.previousGridLayout, photo.id)
    const currentGridCard = findGridCardById(gridLayout, photo.id)

    let initialRect: { x: number; y: number; width: number; height: number; opacity?: number } | null =
      null

    if (route.type === 'grid') {
      if (currentGridCard != null) {
        initialRect = readCardViewportRect(currentGridCard, adjustedScrollTop)
      }
    } else if (lineLayout != null) {
      const lineCard = lineLayout.cards[index]!
      initialRect = {
        x: lineCard.x,
        y: lineCard.y,
        width: lineCard.width,
        height: lineCard.height,
      }
    }

    const nextMotion = motion ?? createMotionFromRect(initialRect ?? { x: 0, y: 0, width: 10, height: 10, opacity: 0 })
    motionById.set(photo.id, nextMotion)

    let targetX = nextMotion.x.target
    let targetY = nextMotion.y.target
    let targetWidth = nextMotion.width.target
    let targetHeight = nextMotion.height.target
    let targetScale = 1
    let targetDriftX = 0
    let targetDriftY = 0
    let targetOpacity = 1
    let targetBrightness = 1
    let targetBlur = 0
    let snapBox = false

    if (route.type === 'grid') {
      if (currentGridCard == null) {
        targetOpacity = 0
      } else {
        const viewportRect = readCardViewportRect(currentGridCard, adjustedScrollTop)
        targetX = viewportRect.x
        targetY = viewportRect.y
        targetWidth = viewportRect.width
        targetHeight = viewportRect.height
        targetOpacity = mountedIds.has(photo.id) ? 1 : 0

        if (
          st.previousRouteType === 'grid' &&
          previousGridCard != null &&
          previousGridCard.rowIndex === currentGridCard.rowIndex &&
          previousGridCard.columnIndex === currentGridCard.columnIndex &&
          st.previousGridLayout?.columnCount === gridLayout.columnCount
        ) {
          snapBox = true
        }

        if (hoveredPhotoId === photo.id) {
          const centerX = targetX + targetWidth / 2
          const centerY = targetY + currentGridCard.imageHeight / 2
          targetScale = 1.02
          targetDriftX = clamp((st.pointer.x - centerX) * 0.06, -12, 12)
          targetDriftY = clamp((st.pointer.y - centerY) * 0.06, -10, 10)
        }

        if (st.previousRouteType === 'line' && st.previousFocusedId === photo.id) {
          snapBox = false
        }
      }
    } else if (lineLayout != null) {
      const lineCard = lineLayout.cards[index]!
      const distance = Math.abs(index - focusedIndex)
      const navHover =
        st.pointer.inside && st.pointer.x < LINE_SIDE_HIT_WIDTH
          ? 'previous'
          : st.pointer.inside && st.pointer.x > viewportWidth - LINE_SIDE_HIT_WIDTH
            ? 'next'
            : null

      targetX = lineCard.x
      targetY = lineCard.y
      targetWidth = lineCard.width
      targetHeight = lineCard.height
      targetOpacity = 1
      targetBrightness = index === focusedIndex ? 1 : distance === 1 ? 0.72 : 0.58
      targetBlur = distance === 1 ? 0.8 : 0

      if (navHover === 'previous' && index === focusedIndex - 1) {
        targetScale = 1.04
        targetBrightness = 0.9
      } else if (navHover === 'next' && index === focusedIndex + 1) {
        targetScale = 1.04
        targetBrightness = 0.9
      }
    }

    retarget(nextMotion.x, targetX, snapBox)
    retarget(nextMotion.y, targetY, snapBox)
    retarget(nextMotion.width, targetWidth, snapBox)
    retarget(nextMotion.height, targetHeight, snapBox)
    retarget(nextMotion.scale, targetScale, false)
    retarget(nextMotion.driftX, targetDriftX, false)
    retarget(nextMotion.driftY, targetDriftY, false)
    retarget(nextMotion.opacity, targetOpacity, false)
    retarget(nextMotion.brightness, targetBrightness, false)
    retarget(nextMotion.blur, targetBlur, false)

    stepSpring(nextMotion.x, deltaMs)
    stepSpring(nextMotion.y, deltaMs)
    stepSpring(nextMotion.width, deltaMs)
    stepSpring(nextMotion.height, deltaMs)
    stepSpring(nextMotion.scale, deltaMs)
    stepSpring(nextMotion.driftX, deltaMs)
    stepSpring(nextMotion.driftY, deltaMs)
    stepSpring(nextMotion.opacity, deltaMs)
    stepSpring(nextMotion.brightness, deltaMs)
    stepSpring(nextMotion.blur, deltaMs)
  }

  mountVisibleCards(mountedIds)

  let stillAnimating = false
  for (let index = 0; index < photoGalleryData.length; index++) {
    const photo = photoGalleryData[index]!
    const node = ensureCardNode(photo)
    const motion = motionById.get(photo.id)!
    const lineCard = route.type === 'line' ? lineLayout!.cards[index]! : null
    const gridCard = findGridCardById(gridLayout, photo.id)
    const isMounted = node.card.parentNode != null

    if (!isMounted) continue

    const showHighRes = route.type === 'line' && route.focusedId === photo.id
    if (showHighRes && node.img.src === '' && !isAutomationRun) {
      node.img.src = getHighResPhotoUrl(photo.id)
      node.img.decoding = 'async'
      node.img.loading = 'eager'
    }

    node.card.style.transform = `translate(${motion.x.current + motion.driftX.current}px, ${motion.y.current + motion.driftY.current}px) scale(${motion.scale.current})`
    node.card.style.width = `${motion.width.current}px`
    node.card.style.height = `${motion.height.current}px`
    node.card.style.opacity = String(motion.opacity.current)
    node.card.style.filter = `brightness(${motion.brightness.current}) blur(${motion.blur.current}px)`
    node.card.style.zIndex =
      route.type === 'line'
        ? String(100 + (route.focusedId === photo.id ? 10 : 0) - Math.abs(index - focusedIndex))
        : String(10 + index)

    if (route.type === 'line' && lineCard != null) {
      node.media.style.left = '0px'
      node.media.style.top = '0px'
      node.media.style.width = `${lineCard.imageWidth}px`
      node.media.style.height = `${lineCard.imageHeight}px`

      node.caption.dataset.captionKind = 'line'
      node.caption.className = 'line-caption'
      node.caption.style.left = '0px'
      node.caption.style.top = `${lineCard.imageHeight + LINE_IMAGE_TO_CAPTION_GAP}px`
      node.caption.style.width = `${lineCard.width}px`
      node.caption.style.height = '64px'
      node.caption.style.color = route.focusedId === photo.id ? 'rgba(244, 239, 230, 0.96)' : 'rgba(244, 239, 230, 0.72)'

      if (route.focusedId === photo.id) {
        node.img.style.opacity = '1'
      } else {
        node.img.style.opacity = '0'
      }
    } else if (gridCard != null) {
      node.media.style.left = '0px'
      node.media.style.top = '0px'
      node.media.style.width = `${gridCard.imageWidth}px`
      node.media.style.height = `${gridCard.imageHeight}px`

      node.caption.dataset.captionKind = 'grid'
      node.caption.className = 'grid-caption'
      node.caption.style.left = '18px'
      node.caption.style.top = ''
      node.caption.style.width = ''
      node.caption.style.height = '44px'
      node.caption.style.color = 'rgba(234, 231, 223, 0.9)'
      node.img.style.opacity = '0'
    }

    stillAnimating =
      stillAnimating ||
      isAnimating(motion.x) ||
      isAnimating(motion.y) ||
      isAnimating(motion.width) ||
      isAnimating(motion.height) ||
      isAnimating(motion.scale) ||
      isAnimating(motion.driftX) ||
      isAnimating(motion.driftY) ||
      isAnimating(motion.opacity) ||
      isAnimating(motion.brightness) ||
      isAnimating(motion.blur)
  }

  const navHover =
    route.type === 'line' &&
    ((st.pointer.inside && st.pointer.x < LINE_SIDE_HIT_WIDTH && focusedIndex > 0) ||
      (st.pointer.inside && st.pointer.x > viewportWidth - LINE_SIDE_HIT_WIDTH && focusedIndex < photoGalleryData.length - 1))
  const cursor =
    route.type === 'grid'
      ? hoveredPhotoId == null
        ? 'auto'
        : 'zoom-in'
      : navHover
        ? 'zoom-in'
        : 'zoom-out'

  document.body.style.cursor = cursor
  dom.lineLayer.dataset.visible = route.type === 'line' ? 'true' : 'false'
  dom.gridContent.style.height = `${gridLayout.totalHeight}px`
  dom.scrollRoot.style.overflowY = 'auto'

  if (Math.abs(dom.scrollRoot.scrollTop - adjustedScrollTop) > 0.5) {
    dom.scrollRoot.scrollTop = adjustedScrollTop
  }
  st.storedScrollTop = dom.scrollRoot.scrollTop

  const snapshot: Snapshot = {
    mode: route.type,
    focusedId: route.type === 'line' ? route.focusedId : null,
    hash: window.location.hash,
    cursor,
    visibleIds,
    firstVisibleId: findFirstVisibleCard(gridLayout, st.storedScrollTop, viewportHeight)?.id ?? null,
    scrollTop: st.storedScrollTop,
  }
  publishSnapshot(snapshot)

  if (route.type === 'grid' && returnToGridId != null) {
    const targetCard = findGridCardById(gridLayout, returnToGridId)
    if (targetCard != null) {
      const targetViewportTop = targetCard.y - snapshot.scrollTop
      if (targetViewportTop >= 20 && targetViewportTop <= 90) {
        st.returnToGridId = null
      } else {
        st.returnToGridId = returnToGridId
        stillAnimating = true
      }
    }
  } else {
    st.returnToGridId = null
  }

  st.viewportWidth = viewportWidth
  st.viewportHeight = viewportHeight
  st.previousGridLayout = gridLayout
  st.previousRouteType = route.type
  st.previousFocusedId = route.type === 'line' ? route.focusedId : dismissToId
  st.clickEvent = null
  st.keydownEvent = null

  if (nextRoute != null) navigate(nextRoute)

  void runAutomationScenario()

  return stillAnimating
}

window.addEventListener('resize', () => scheduleRender())
window.addEventListener('hashchange', () => scheduleRender())
window.addEventListener('popstate', () => scheduleRender())
window.addEventListener('pointermove', (event) => {
  st.pointer.x = event.clientX
  st.pointer.y = event.clientY
  st.pointer.target = event.target
  st.pointer.inside = true
  scheduleRender()
})
window.addEventListener('mouseout', (event) => {
  if (event.relatedTarget == null) {
    st.pointer.inside = false
    st.pointer.target = null
    scheduleRender()
  }
})
window.addEventListener('click', (event) => {
  st.clickEvent = event
  scheduleRender()
})
window.addEventListener('keydown', (event) => {
  st.keydownEvent = event
  scheduleRender()
})
dom.scrollRoot.addEventListener('scroll', () => scheduleRender())
reducedMotionQuery.addEventListener('change', () => scheduleRender())

scheduleRender()
