import {
  colors,
  createInitialState,
  findItemAtViewportY,
  HEADER_HEIGHT,
  isVisible,
  ITEM_HEIGHT,
  layoutItems,
  prependItems,
  reconcileAnchor,
  TARGET_SCROLL_TOP,
  type Anchor,
  type DemoState,
  type HeaderLayout,
  type PositionedItem,
} from './scroll-anchor-model'

type Event =
  | {type: 'prepend'; count: number}
  | {type: 'scrollTo'; top: number}

type Report = {
  phase: 'loading' | 'running' | 'ready' | 'error'
  requestId: string
  scenario: string
  referenceItemBefore?: string | null
  referenceItemAfter?: string | null
  anchorBefore?: string | null
  anchorAfter?: string | null
  anchorAfterUserScroll?: string | null
  scrollTopBefore?: number
  scrollTopAfter?: number
  itemCount?: number
  mountedItemCount?: number
  mountedHeaderCount?: number
  message?: string
}

type Snapshot = {
  referenceItemId: string | null
  anchorId: string | null
  scrollTop: number
  itemCount: number
  mountedItemCount: number
  mountedHeaderCount: number
}

type AppState = {
  data: DemoState
  anchor: Anchor | null
  storedScrollTop: number
  events: Event[]
  layout: {
    items: PositionedItem[]
    headers: HeaderLayout[]
    totalHeight: number
  }
  mountedItemCount: number
  mountedHeaderCount: number
  scheduled: boolean
  renderVersion: number
  waiters: {targetVersion: number; resolve: () => void}[]
}

const params = new URLSearchParams(location.search)
const scenario = params.get('scenario') ?? ''
const requestId = params.get('requestId') ?? ''

const dom = makeAppSkeleton()
document.body.append(dom.frame)

const itemDomCache = new Map<string, HTMLDivElement>()
const headerDomCache = new Map<string, HTMLDivElement>()

const st: AppState = {
  data: createInitialState(),
  anchor: null,
  storedScrollTop: 0,
  events: [],
  layout: layoutItems(createInitialState().items),
  mountedItemCount: 0,
  mountedHeaderCount: 0,
  scheduled: false,
  renderVersion: 0,
  waiters: [],
}

dom.scrollToButton.addEventListener('click', () => {
  st.events.push({type: 'scrollTo', top: TARGET_SCROLL_TOP})
  scheduleRender()
})

dom.addAboveButton.addEventListener('click', () => {
  st.events.push({type: 'prepend', count: 3})
  scheduleRender()
})

dom.addRapidButton.addEventListener('click', () => {
  enqueueRapidPrepend()
})

dom.scroller.addEventListener('scroll', () => {
  scheduleRender()
})

window.addEventListener('resize', () => {
  scheduleRender()
})

publishReport({phase: 'loading', requestId, scenario})
scheduleRender()
queueMicrotask(() => {
  if (scenario === '' || requestId === '') return
  runScenario().catch(error => {
    publishReport({
      phase: 'error',
      requestId,
      scenario,
      message: error instanceof Error ? error.message : String(error),
    })
  })
})

function scheduleRender() {
  if (st.scheduled) return
  st.scheduled = true
  requestAnimationFrame(render)
}

function render() {
  st.scheduled = false

  const readScrollTop = dom.scroller.scrollTop
  const viewportHeight = dom.scroller.clientHeight
  let explicitScrollTop: number | undefined

  for (const event of st.events) {
    switch (event.type) {
      case 'prepend':
        st.data = prependItems(st.data, event.count)
        break

      case 'scrollTo':
        explicitScrollTop = event.top
        break
    }
  }
  st.events = []

  const layout = layoutItems(st.data.items)
  const anchorResult = reconcileAnchor({
    readScrollTop,
    storedScrollTop: st.storedScrollTop,
    anchor: st.anchor,
    itemLayouts: layout.items,
    explicitScrollTop,
  })
  const renderScrollTop = anchorResult.requestedScrollTop

  st.layout = layout
  st.anchor = anchorResult.anchor

  dom.surface.textContent = ''
  dom.surface.style.height = `${layout.totalHeight}px`

  st.mountedHeaderCount = 0
  for (const header of layout.headers) {
    if (!isVisible(header.top, header.height, renderScrollTop, viewportHeight)) continue

    const headerNode = getHeaderNode(header.day)
    headerNode.style.top = `${header.top}px`
    dom.surface.append(headerNode)
    st.mountedHeaderCount += 1
  }

  st.mountedItemCount = 0
  for (const item of layout.items) {
    if (!isVisible(item.top, ITEM_HEIGHT, renderScrollTop, viewportHeight)) continue

    const itemNode = getItemNode(item.id, item.label, item.color, item.day)
    itemNode.style.top = `${item.top}px`
    dom.surface.append(itemNode)
    st.mountedItemCount += 1
  }

  const requested = anchorResult.requestedScrollTop
  if (Math.abs(requested - readScrollTop) > 0.001) {
    dom.scroller.scrollTo({
      top: requested,
      behavior: 'instant' as ScrollBehavior,
    })
  }

  st.storedScrollTop = dom.scroller.scrollTop
  const anchorPrevY = st.anchor == null ? 'null' : String(st.anchor.prevY)
  dom.info.textContent =
    `scrollTop=${formatNumber(st.storedScrollTop)} ` +
    `anchor=${st.anchor?.itemId ?? 'null'} ` +
    `prevY=${anchorPrevY} ` +
    `items=${st.data.items.length}`

  if (Math.abs(requested - readScrollTop) > 0.001) scheduleRender()

  st.renderVersion += 1
  flushWaiters()
}

function getHeaderNode(day: string) {
  let node = headerDomCache.get(day)
  if (node != null) return node

  node = document.createElement('div')
  node.style.position = 'absolute'
  node.style.left = '16px'
  node.style.right = '16px'
  node.style.height = `${HEADER_HEIGHT}px`
  node.style.display = 'flex'
  node.style.alignItems = 'center'
  node.style.color = '#f0f6fc'
  node.style.fontSize = '12px'
  node.style.letterSpacing = '0.08em'
  node.style.textTransform = 'uppercase'
  node.style.borderBottom = '1px solid rgba(255, 255, 255, 0.08)'
  node.textContent = day

  headerDomCache.set(day, node)
  return node
}

function getItemNode(id: string, label: string, color: string, day: string) {
  let node = itemDomCache.get(id)
  if (node != null) return node

  node = document.createElement('div')
  node.style.position = 'absolute'
  node.style.left = '16px'
  node.style.right = '16px'
  node.style.height = `${ITEM_HEIGHT}px`
  node.style.padding = '12px 14px'
  node.style.borderRadius = '14px'
  node.style.border = '1px solid rgba(255, 255, 255, 0.08)'
  node.style.background = `linear-gradient(135deg, ${color}, rgba(255, 255, 255, 0.06))`
  node.style.boxShadow = '0 18px 32px rgba(0, 0, 0, 0.22)'
  node.style.display = 'flex'
  node.style.flexDirection = 'column'
  node.style.justifyContent = 'space-between'
  node.style.color = 'white'

  const labelNode = document.createElement('div')
  labelNode.style.fontSize = '24px'
  labelNode.style.fontWeight = '700'
  labelNode.textContent = label

  const metaNode = document.createElement('div')
  metaNode.style.fontSize = '12px'
  metaNode.style.opacity = '0.82'
  metaNode.textContent = `${id} • ${day} • ${colors.length} color cycle`

  node.append(labelNode, metaNode)
  itemDomCache.set(id, node)
  return node
}

function makeAppSkeleton() {
  const scrollToButton = makeButton('Scroll to 700')
  const addAboveButton = makeButton('Add 3 above')
  const addRapidButton = makeButton('Add 1, then 2 rapid')

  const controls = document.createElement('div')
  controls.style.display = 'flex'
  controls.style.gap = '12px'
  controls.style.flexWrap = 'wrap'
  controls.append(scrollToButton, addAboveButton, addRapidButton)

  const scroller = document.createElement('div')
  scroller.style.position = 'relative'
  scroller.style.height = 'min(520px, calc(100vh - 180px))'
  scroller.style.minHeight = '320px'
  scroller.style.overflowY = 'auto'
  scroller.style.background = 'rgba(7, 10, 14, 0.62)'
  scroller.style.border = '1px solid var(--panel-border)'
  scroller.style.borderRadius = '20px'
  scroller.style.boxShadow = '0 30px 80px var(--shadow)'
  scroller.style.scrollbarColor = 'rgba(255, 255, 255, 0.22) transparent'

  const surface = document.createElement('div')
  surface.style.position = 'relative'
  scroller.append(surface)

  const referenceLine = document.createElement('div')
  referenceLine.style.position = 'absolute'
  referenceLine.style.left = '0'
  referenceLine.style.right = '0'
  referenceLine.style.top = '50%'
  referenceLine.style.borderTop = '1px dashed var(--reference)'
  referenceLine.style.pointerEvents = 'none'

  const viewport = document.createElement('div')
  viewport.style.position = 'relative'
  viewport.append(scroller, referenceLine)

  const info = document.createElement('div')
  info.style.color = 'var(--muted)'
  info.style.fontSize = '12px'

  const frame = document.createElement('div')
  frame.style.maxWidth = '900px'
  frame.style.margin = '0 auto'
  frame.style.display = 'grid'
  frame.style.gap = '16px'
  frame.append(controls, viewport, info)

  return {
    frame,
    scrollToButton,
    addAboveButton,
    addRapidButton,
    scroller,
    surface,
    info,
  }
}

function makeButton(label: string) {
  const button = document.createElement('button')
  button.textContent = label
  button.style.border = '1px solid rgba(255, 255, 255, 0.12)'
  button.style.background = 'rgba(255, 255, 255, 0.06)'
  button.style.color = 'var(--text)'
  button.style.padding = '10px 14px'
  button.style.borderRadius = '999px'
  button.style.cursor = 'pointer'
  button.style.backdropFilter = 'blur(8px)'
  return button
}

function enqueueRapidPrepend() {
  st.events.push({type: 'prepend', count: 1})
  scheduleRender()
  setTimeout(() => {
    st.events.push({type: 'prepend', count: 2})
    scheduleRender()
  }, 0)
}

function snapshot(): Snapshot {
  const referenceY = dom.scroller.clientHeight / 2
  return {
    referenceItemId: findItemAtViewportY(st.layout.items, st.storedScrollTop, referenceY)?.id ?? null,
    anchorId: st.anchor?.itemId ?? null,
    scrollTop: st.storedScrollTop,
    itemCount: st.data.items.length,
    mountedItemCount: st.mountedItemCount,
    mountedHeaderCount: st.mountedHeaderCount,
  }
}

function publishReport(report: Report) {
  location.hash = `report=${encodeURIComponent(JSON.stringify(report))}`
}

async function runScenario() {
  publishReport({phase: 'running', requestId, scenario})
  await waitForVersion(st.renderVersion + 1)

  switch (scenario) {
    case 'scroll-to-700-then-add-3-above': {
      await explicitScrollTo(TARGET_SCROLL_TOP)
      const before = snapshot()

      st.events.push({type: 'prepend', count: 3})
      scheduleRender()
      await waitForCondition(() => snapshot().scrollTop === 1024 && st.data.items.length === 20)

      const after = snapshot()
      publishReport({
        phase: 'ready',
        requestId,
        scenario,
        referenceItemBefore: before.referenceItemId,
        referenceItemAfter: after.referenceItemId,
        anchorBefore: before.anchorId,
        anchorAfter: after.anchorId,
        scrollTopBefore: before.scrollTop,
        scrollTopAfter: after.scrollTop,
        itemCount: after.itemCount,
        mountedItemCount: after.mountedItemCount,
        mountedHeaderCount: after.mountedHeaderCount,
      })
      break
    }

    case 'scroll-to-700-then-add-1-then-2-rapid': {
      await explicitScrollTo(TARGET_SCROLL_TOP)
      const before = snapshot()

      enqueueRapidPrepend()
      await waitForCondition(() => snapshot().scrollTop === 1024 && st.data.items.length === 20)

      const after = snapshot()
      publishReport({
        phase: 'ready',
        requestId,
        scenario,
        referenceItemBefore: before.referenceItemId,
        referenceItemAfter: after.referenceItemId,
        anchorBefore: before.anchorId,
        anchorAfter: after.anchorId,
        scrollTopBefore: before.scrollTop,
        scrollTopAfter: after.scrollTop,
        itemCount: after.itemCount,
        mountedItemCount: after.mountedItemCount,
        mountedHeaderCount: after.mountedHeaderCount,
      })
      break
    }

    case 'user-scroll-then-prepend': {
      await explicitScrollTo(TARGET_SCROLL_TOP)
      await syntheticUserScrollTo(920)
      const afterUserScroll = snapshot()

      st.events.push({type: 'prepend', count: 3})
      scheduleRender()
      await waitForCondition(() => snapshot().scrollTop === 1244 && st.data.items.length === 20)

      const after = snapshot()
      publishReport({
        phase: 'ready',
        requestId,
        scenario,
        referenceItemBefore: afterUserScroll.referenceItemId,
        referenceItemAfter: after.referenceItemId,
        anchorBefore: 'V8',
        anchorAfterUserScroll: afterUserScroll.anchorId,
        anchorAfter: after.anchorId,
        scrollTopBefore: afterUserScroll.scrollTop,
        scrollTopAfter: after.scrollTop,
        itemCount: after.itemCount,
        mountedItemCount: after.mountedItemCount,
        mountedHeaderCount: after.mountedHeaderCount,
      })
      break
    }

    default:
      throw new Error(`Unknown scenario: ${scenario}`)
  }
}

async function explicitScrollTo(top: number) {
  st.events.push({type: 'scrollTo', top})
  scheduleRender()
  await waitForCondition(() => snapshot().scrollTop === top)
}

async function syntheticUserScrollTo(top: number) {
  dom.scroller.scrollTop = top
  scheduleRender()
  await waitForCondition(() => snapshot().scrollTop === top && snapshot().anchorId === 'V9')
}

async function waitForCondition(predicate: () => boolean, timeoutMs = 4_000) {
  const deadline = performance.now() + timeoutMs
  while (performance.now() < deadline) {
    if (predicate()) return
    await waitForVersion(st.renderVersion + 1)
  }
  throw new Error('Timed out waiting for condition')
}

function waitForVersion(targetVersion: number) {
  if (st.renderVersion >= targetVersion) return Promise.resolve()
  return new Promise<void>(resolve => {
    st.waiters.push({targetVersion, resolve})
  })
}

function flushWaiters() {
  const remaining: AppState['waiters'] = []
  for (const waiter of st.waiters) {
    if (st.renderVersion >= waiter.targetVersion) waiter.resolve()
    else remaining.push(waiter)
  }
  st.waiters = remaining
}

function formatNumber(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
}
