import {
  clampScrollTop,
  computeLayout,
  createInitialItems,
  headerHeight,
  isVisible,
  itemAtReferenceLine,
  itemHeight,
  prependItems,
  resolveAnchoredScroll,
  scrollerHeight,
  targetScrollTop,
  type Anchor,
  type Item,
} from './model'

type Report = {
  phase: 'loading' | 'running' | 'ready' | 'error'
  requestId: string
  scenario: string
  message?: string
  referenceItemBefore?: string | null
  referenceItemAfter?: string | null
  anchorBefore?: string | null
  anchorAfter?: string | null
  mountedItemCount?: number
  mountedHeaderCount?: number
  itemCount?: number
}

type Snapshot = {
  anchorId: string | null
  anchorPrevY: number | null
  mountedHeaderCount: number
  mountedItemCount: number
  itemCount: number
  referenceItemId: string | null
  scrollTop: number
}

function makeView() {
  const scrollToButton = document.createElement('button')
  scrollToButton.textContent = 'Scroll to 700'

  const addAboveButton = document.createElement('button')
  addAboveButton.textContent = 'Add 3 above'

  const addRapidButton = document.createElement('button')
  addRapidButton.textContent = 'Add 1, then 2 rapid'

  const controls = document.createElement('div')
  controls.className = 'controls'
  controls.append(scrollToButton, addAboveButton, addRapidButton)

  const content = document.createElement('div')
  content.className = 'content'

  const scroller = document.createElement('div')
  scroller.className = 'scroller'
  scroller.appendChild(content)

  const referenceLine = document.createElement('div')
  referenceLine.className = 'reference-line'

  const referenceLineLabel = document.createElement('div')
  referenceLineLabel.className = 'reference-line-label'
  referenceLineLabel.textContent = 'reference'

  const scrollerShell = document.createElement('div')
  scrollerShell.className = 'scroller-shell'
  scrollerShell.append(scroller, referenceLine, referenceLineLabel)

  const info = document.createElement('div')
  info.className = 'info'

  const app = document.createElement('div')
  app.className = 'app'
  app.append(controls, scrollerShell, info)

  return {
    addAboveButton,
    addRapidButton,
    app,
    content,
    info,
    referenceLine,
    referenceLineLabel,
    scrollToButton,
    scroller,
    scrollerShell,
  }
}

function makeHeaderNode(day: string) {
  const node = document.createElement('div')
  node.className = 'header'
  node.dataset.day = day
  node.textContent = day
  return node
}

function makeItemNode(item: Item) {
  const id = document.createElement('div')
  id.className = 'item-id'
  id.textContent = item.id

  const label = document.createElement('div')
  label.className = 'item-label'
  label.textContent = item.label

  const node = document.createElement('div')
  node.className = 'item'
  node.dataset.itemId = item.id
  node.append(id, label)
  return node
}

const dom = makeView()
document.body.appendChild(dom.app)

const params = new URLSearchParams(location.search)
const scenario = params.get('scenario') ?? ''
const requestId = params.get('requestId') ?? ''

const initial = createInitialItems()
const st = {
  anchor: null as Anchor | null,
  domCache: {
    headers: new Map<string, HTMLDivElement>(),
    items: new Map<string, HTMLDivElement>(),
  },
  events: {
    explicitScrollTop: null as number | null,
    prependCount: 0,
  },
  items: initial.items,
  nextItemNumber: initial.nextItemNumber,
  pendingTimers: 0,
  scheduled: false,
  snapshot: {
    anchorId: null,
    anchorPrevY: null,
    mountedHeaderCount: 0,
    mountedItemCount: 0,
    itemCount: initial.items.length,
    referenceItemId: null,
    scrollTop: 0,
  } satisfies Snapshot,
  storedScrollTop: 0,
}

function publishReport(report: Report) {
  location.hash = `report=${encodeURIComponent(JSON.stringify(report))}`
}

function queuePrepend(count: number) {
  st.events.prependCount += count
  scheduleRender()
}

function queueScrollTo(top: number) {
  st.events.explicitScrollTop = top
  scheduleRender()
}

function addOneThenTwoRapid() {
  queuePrepend(1)
  st.pendingTimers++
  window.setTimeout(() => {
    st.pendingTimers--
    queuePrepend(2)
  }, 0)
}

dom.scrollToButton.addEventListener('click', () => { queueScrollTo(targetScrollTop) })
dom.addAboveButton.addEventListener('click', () => { queuePrepend(3) })
dom.addRapidButton.addEventListener('click', () => { addOneThenTwoRapid() })
dom.scroller.addEventListener('scroll', () => { scheduleRender() })
window.addEventListener('resize', () => { scheduleRender() })

function scheduleRender() {
  if (st.scheduled) return
  st.scheduled = true

  requestAnimationFrame(() => {
    const currentScrollTop = dom.scroller.scrollTop
    const viewportHeight = dom.scroller.clientHeight

    if (st.events.prependCount > 0) {
      const next = prependItems(st.items, st.nextItemNumber, st.events.prependCount)
      st.items = next.items
      st.nextItemNumber = next.nextItemNumber
      st.events.prependCount = 0
    }

    const layout = computeLayout(st.items)
    const anchored = resolveAnchoredScroll({
      anchor: st.anchor,
      currentScrollTop,
      explicitScrollTop: st.events.explicitScrollTop,
      layout,
      storedScrollTop: st.storedScrollTop,
    })

    st.anchor = anchored.anchor

    const adjustedScrollTop = clampScrollTop(layout.totalHeight, viewportHeight, anchored.adjustedScrollTop)
    const visibleHeaders = layout.headerBoxes.filter((header) => isVisible(header.top, headerHeight, adjustedScrollTop, viewportHeight))
    const visibleItems = layout.itemBoxes.filter((item) => isVisible(item.top, itemHeight, adjustedScrollTop, viewportHeight))

    dom.content.textContent = ''
    dom.content.style.height = `${layout.totalHeight}px`

    for (const header of visibleHeaders) {
      let node = st.domCache.headers.get(header.day)
      if (node == null) {
        node = makeHeaderNode(header.day)
        st.domCache.headers.set(header.day, node)
      }
      node.style.top = `${header.top}px`
      dom.content.appendChild(node)
    }

    for (const item of visibleItems) {
      let node = st.domCache.items.get(item.id)
      if (node == null) {
        node = makeItemNode(item)
        st.domCache.items.set(item.id, node)
      }
      node.style.top = `${item.top}px`
      node.style.background = `linear-gradient(135deg, ${item.color} 0%, rgba(255, 255, 255, 0.08) 180%)`
      dom.content.appendChild(node)
    }

    if (Math.abs(adjustedScrollTop - currentScrollTop) > 0.01 || st.events.explicitScrollTop != null) {
      dom.scroller.scrollTo({top: adjustedScrollTop, behavior: 'instant'})
    }

    const readBackScrollTop = dom.scroller.scrollTop
    st.storedScrollTop = readBackScrollTop
    st.events.explicitScrollTop = null

    st.snapshot = {
      anchorId: st.anchor?.id ?? null,
      anchorPrevY: st.anchor?.prevY ?? null,
      mountedHeaderCount: visibleHeaders.length,
      mountedItemCount: visibleItems.length,
      itemCount: st.items.length,
      referenceItemId: itemAtReferenceLine(layout, readBackScrollTop, viewportHeight),
      scrollTop: readBackScrollTop,
    }

    dom.info.textContent =
      `scrollTop: ${Math.round(st.snapshot.scrollTop)} | anchor: ${st.snapshot.anchorId ?? 'none'} | prevY: ${
        st.snapshot.anchorPrevY == null ? 'none' : Math.round(st.snapshot.anchorPrevY)
      } | items: ${st.snapshot.itemCount}`

    st.scheduled = false
  })
}

function waitForIdle() {
  return new Promise<void>((resolve) => {
    function poll() {
      if (
        !st.scheduled &&
        st.pendingTimers === 0 &&
        st.events.prependCount === 0 &&
        st.events.explicitScrollTop == null
      ) {
        requestAnimationFrame(() => {
          if (
            !st.scheduled &&
            st.pendingTimers === 0 &&
            st.events.prependCount === 0 &&
            st.events.explicitScrollTop == null
          ) resolve()
          else poll()
        })
        return
      }
      requestAnimationFrame(poll)
    }
    poll()
  })
}

function takeSnapshot() {
  return {
    anchorId: st.snapshot.anchorId,
    mountedHeaderCount: st.snapshot.mountedHeaderCount,
    mountedItemCount: st.snapshot.mountedItemCount,
    itemCount: st.snapshot.itemCount,
    referenceItemId: st.snapshot.referenceItemId,
  }
}

async function runScenario() {
  publishReport({phase: 'loading', requestId, scenario})

  try {
    await waitForIdle()
    publishReport({phase: 'running', requestId, scenario})

    if (scenario === 'scroll-to-700-add-3-above') {
      dom.scrollToButton.click()
      await waitForIdle()
      const before = takeSnapshot()

      dom.addAboveButton.click()
      await waitForIdle()
      const after = takeSnapshot()

      publishReport({
        phase: 'ready',
        requestId,
        scenario,
        anchorAfter: after.anchorId,
        anchorBefore: before.anchorId,
        itemCount: after.itemCount,
        mountedHeaderCount: after.mountedHeaderCount,
        mountedItemCount: after.mountedItemCount,
        referenceItemAfter: after.referenceItemId,
        referenceItemBefore: before.referenceItemId,
      })
      return
    }

    if (scenario === 'add-1-then-2-rapid') {
      const before = takeSnapshot()

      dom.addRapidButton.click()
      await waitForIdle()
      const after = takeSnapshot()

      publishReport({
        phase: 'ready',
        requestId,
        scenario,
        anchorAfter: after.anchorId,
        anchorBefore: before.anchorId,
        itemCount: after.itemCount,
        mountedHeaderCount: after.mountedHeaderCount,
        mountedItemCount: after.mountedItemCount,
        referenceItemAfter: after.referenceItemId,
        referenceItemBefore: before.referenceItemId,
      })
      return
    }

    if (scenario === 'user-scroll-then-prepend') {
      dom.scroller.scrollTo({top: 460, behavior: 'instant'})
      await waitForIdle()
      const before = takeSnapshot()

      dom.addAboveButton.click()
      await waitForIdle()
      const after = takeSnapshot()

      publishReport({
        phase: 'ready',
        requestId,
        scenario,
        anchorAfter: after.anchorId,
        anchorBefore: before.anchorId,
        itemCount: after.itemCount,
        mountedHeaderCount: after.mountedHeaderCount,
        mountedItemCount: after.mountedItemCount,
        referenceItemAfter: after.referenceItemId,
        referenceItemBefore: before.referenceItemId,
      })
      return
    }

    throw new Error(`Unknown scenario: ${scenario}`)
  } catch (error) {
    publishReport({
      phase: 'error',
      requestId,
      scenario,
      message: error instanceof Error ? error.message : String(error),
    })
  }
}

scheduleRender()

if (scenario !== '' && requestId !== '') void runScenario()
