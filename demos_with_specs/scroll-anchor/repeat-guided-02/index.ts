import {
  HEADER_HEIGHT,
  ITEM_HEIGHT,
  TARGET_SCROLL_TOP,
  adjustScrollForAnchor,
  createInitialFeed,
  findEntryAtY,
  layoutFeed,
  prependItems,
  resolveAnchorForRender,
  type FeedLayout,
  type LayoutEntry,
  type ScrollAnchor,
  type ScrollAnchorReport,
} from './model.ts'

const params = new URLSearchParams(location.search)
const scenario = params.get('scenario') ?? ''
const requestId = params.get('requestId') ?? ''

const app = makeAppSkeleton()
document.body.append(app.root)

const initialFeed = createInitialFeed()
const domCache = {
  headers: new Map<string, HTMLDivElement>(),
  items: new Map<string, HTMLDivElement>(),
}

const st = {
  items: initialFeed.items,
  nextItemNumber: initialFeed.nextItemNumber,
  anchor: null as ScrollAnchor | null,
  storedScrollTop: 0,
  lastScrollTop: 0,
  lastLayout: null as FeedLayout | null,
  lastReferenceEntry: null as LayoutEntry | null,
  renderVersion: 0,
  events: {
    scrollToTop: null as number | null,
    prependBatches: [] as number[],
  },
}

app.scrollToTargetButton.addEventListener('click', () => {
  st.events.scrollToTop = TARGET_SCROLL_TOP
  scheduleRender()
})

app.addAboveButton.addEventListener('click', () => {
  st.events.prependBatches.push(3)
  scheduleRender()
})

app.addRapidButton.addEventListener('click', () => {
  st.events.prependBatches.push(1)
  scheduleRender()
  queueMicrotask(() => {
    st.events.prependBatches.push(2)
    scheduleRender()
  })
})

window.addEventListener('resize', () => {
  scheduleRender()
})

app.scroller.addEventListener('scroll', () => {
  scheduleRender()
})

let scheduled = false
function scheduleRender() {
  if (scheduled) return
  scheduled = true

  requestAnimationFrame(() => {
    let items = st.items
    let nextItemNumber = st.nextItemNumber

    const readScrollTop = app.scroller.scrollTop

    for (const batchSize of st.events.prependBatches) {
      const prepended = prependItems(items, nextItemNumber, batchSize)
      items = prepended.items
      nextItemNumber = prepended.nextItemNumber
    }
    st.items = items
    st.nextItemNumber = nextItemNumber

    const layout = layoutFeed(st.items)
    const anchorPlan = resolveAnchorForRender({
      layout,
      readScrollTop,
      storedScrollTop: st.storedScrollTop,
      explicitScrollToTop: st.events.scrollToTop,
      previousAnchor: st.anchor,
    })

    let viewScrollTop = anchorPlan.effectiveScrollTop
    let anchor = anchorPlan.anchor
    if (!anchorPlan.didRebaseAnchor) {
      const adjusted = adjustScrollForAnchor(viewScrollTop, anchor, layout)
      viewScrollTop = adjusted.adjustedScrollTop
      anchor = adjusted.anchor
    }

    st.anchor = anchor
    st.lastLayout = layout

    const viewportHeight = app.scroller.clientHeight
    const visibleTop = viewScrollTop
    const visibleBottom = viewScrollTop + viewportHeight

    app.content.textContent = ''
    app.content.style.height = `${layout.totalHeight}px`

    for (const entry of layout.entries) {
      if (entry.bottom < visibleTop || entry.top > visibleBottom) continue
      if (entry.kind === 'header') {
        const node = getHeaderNode(entry.day)
        node.style.top = `${entry.top}px`
        node.style.height = `${HEADER_HEIGHT}px`
        app.content.append(node)
      } else {
        const node = getItemNode(entry)
        node.style.top = `${entry.top}px`
        node.style.height = `${ITEM_HEIGHT}px`
        app.content.append(node)
      }
    }

    let finalScrollTop = readScrollTop
    if (Math.abs(viewScrollTop - readScrollTop) > 0.001) {
      app.scroller.scrollTo({top: viewScrollTop, behavior: 'instant' as ScrollBehavior})
      finalScrollTop = app.scroller.scrollTop
    } else {
      finalScrollTop = readScrollTop
    }

    st.storedScrollTop = finalScrollTop
    st.lastScrollTop = finalScrollTop

    const referenceEntry = findEntryAtY(layout, finalScrollTop + viewportHeight / 2)
    st.lastReferenceEntry = referenceEntry
    app.info.textContent =
      `scrollTop: ${Math.round(finalScrollTop)} | anchor: ${anchor?.id ?? 'none'} | prevY: ${anchor?.prevY ?? 'none'} | items: ${st.items.length}`

    scheduled = false
    st.events.scrollToTop = null
    st.events.prependBatches.length = 0
    st.renderVersion += 1
  })
}

scheduleRender()
if (scenario !== '' && requestId !== '') {
  publishReport({phase: 'loading', scenario, requestId})
  queueMicrotask(() => {
    void runScenario()
  })
}

async function runScenario() {
  publishReport({phase: 'running', scenario, requestId})

  try {
    await waitForSettledRender()

    let report: ScrollAnchorReport
    switch (scenario) {
      case 'scroll-to-700-then-add-3-above':
        report = await runScrollTo700ThenAdd3AboveScenario()
        break

      case 'add-1-then-2-rapid':
        report = await runAdd1Then2RapidScenario()
        break

      case 'user-scroll-then-prepend':
        report = await runUserScrollThenPrependScenario()
        break

      default:
        throw new Error(`Unknown scenario "${scenario}"`)
    }

    publishReport(report)
  } catch (error) {
    publishReport({
      phase: 'error',
      scenario,
      requestId,
      message: error instanceof Error ? error.message : String(error),
    })
  }
}

async function runScrollTo700ThenAdd3AboveScenario(): Promise<ScrollAnchorReport> {
  requestScrollTo(TARGET_SCROLL_TOP)
  await waitForSettledRender()
  const before = readSnapshot('before add-3-above')

  requestPrepend(3)
  await waitForSettledRender()
  const after = readSnapshot('after add-3-above')

  return {
    phase: 'ready',
    scenario,
    requestId,
    beforeLineItemId: before.lineItemId,
    afterLineItemId: after.lineItemId,
    anchorBeforeId: before.anchorId,
    anchorAfterId: after.anchorId,
  }
}

async function runAdd1Then2RapidScenario(): Promise<ScrollAnchorReport> {
  const steps = [
    await runRapidStep('coalesced'),
    await runRapidStep('split'),
  ]

  return {
    phase: 'ready',
    scenario,
    requestId,
    steps,
  }
}

async function runRapidStep(mode: 'coalesced' | 'split') {
  resetDemo()
  await waitForSettledRender()

  requestScrollTo(TARGET_SCROLL_TOP)
  await waitForSettledRender()
  const before = readSnapshot(`before ${mode} rapid prepend`)

  if (mode === 'coalesced') {
    requestPrepend(1)
    queueMicrotask(() => {
      requestPrepend(2)
    })
    await waitForSettledRender()
  } else {
    requestPrepend(1)
    await waitForSettledRender()
    requestPrepend(2)
    await waitForSettledRender()
  }

  const after = readSnapshot(`after ${mode} rapid prepend`)
  return {
    mode,
    beforeLineItemId: before.lineItemId,
    afterLineItemId: after.lineItemId,
    anchorBeforeId: before.anchorId,
    anchorAfterId: after.anchorId,
  }
}

async function runUserScrollThenPrependScenario(): Promise<ScrollAnchorReport> {
  requestScrollTo(TARGET_SCROLL_TOP)
  await waitForSettledRender()
  const beforeUserScroll = readSnapshot('before user scroll')

  scrollOutOfBand(880)
  await waitForSettledRender()
  const afterUserScroll = readSnapshot('after user scroll')

  requestPrepend(3)
  await waitForSettledRender()
  const afterPrepend = readSnapshot('after prepend')

  return {
    phase: 'ready',
    scenario,
    requestId,
    anchorBeforeId: beforeUserScroll.anchorId,
    anchorAfterUserScrollId: afterUserScroll.anchorId,
    beforeLineItemId: afterUserScroll.lineItemId,
    afterLineItemId: afterPrepend.lineItemId,
  }
}

function requestScrollTo(top: number) {
  st.events.scrollToTop = top
  scheduleRender()
}

function requestPrepend(count: number) {
  st.events.prependBatches.push(count)
  scheduleRender()
}

function scrollOutOfBand(top: number) {
  app.scroller.scrollTop = top
  scheduleRender()
}

function readSnapshot(label: string) {
  const lineItemId = st.lastReferenceEntry?.kind === 'item' ? st.lastReferenceEntry.id : null
  if (lineItemId == null) throw new Error(`${label} did not keep an item at the reference line`)

  return {
    lineItemId,
    anchorId: st.anchor?.id ?? null,
  }
}

function resetDemo() {
  const resetFeed = createInitialFeed()
  st.items = resetFeed.items
  st.nextItemNumber = resetFeed.nextItemNumber
  st.anchor = null
  st.storedScrollTop = 0
  st.lastScrollTop = 0
  st.lastLayout = null
  st.lastReferenceEntry = null
  st.events.scrollToTop = null
  st.events.prependBatches.length = 0
  domCache.headers.clear()
  domCache.items.clear()
  app.scroller.scrollTop = 0
  scheduleRender()
}

function publishReport(report: ScrollAnchorReport) {
  location.hash = `report=${encodeURIComponent(JSON.stringify(report))}`
}

async function waitForSettledRender() {
  let stableFrames = 0
  let lastVersion = st.renderVersion

  for (let attempts = 0; attempts < 60; attempts++) {
    await nextFrame()
    if (!scheduled && st.renderVersion === lastVersion) stableFrames += 1
    else {
      stableFrames = 0
      lastVersion = st.renderVersion
    }
    if (stableFrames >= 2) return
  }

  throw new Error('Render did not settle')
}

function nextFrame() {
  return new Promise<void>(resolve => {
    requestAnimationFrame(() => resolve())
  })
}

function getHeaderNode(day: string) {
  let node = domCache.headers.get(day)
  if (node != null) return node

  node = document.createElement('div')
  node.className = 'day-header'
  node.textContent = day
  domCache.headers.set(day, node)
  return node
}

function getItemNode(item: Extract<LayoutEntry, {kind: 'item'}>) {
  let node = domCache.items.get(item.id)
  if (node != null) return node

  node = document.createElement('div')
  node.className = 'feed-item'
  node.dataset.itemId = item.id

  const label = document.createElement('div')
  label.className = 'feed-item-label'
  const day = document.createElement('div')
  day.className = 'feed-item-day'
  node.append(label, day)

  domCache.items.set(item.id, node)
  updateItemNode(node, item)
  return node
}

function updateItemNode(node: HTMLDivElement, item: Extract<LayoutEntry, {kind: 'item'}>) {
  node.style.background = item.color
  ;(node.children[0] as HTMLDivElement).textContent = `${item.id} ${item.label}`
  ;(node.children[1] as HTMLDivElement).textContent = item.day
}

function makeAppSkeleton() {
  const root = document.createElement('div')
  root.className = 'app'

  const controls = document.createElement('div')
  controls.className = 'controls'

  const scrollToTargetButton = document.createElement('button')
  scrollToTargetButton.textContent = 'Scroll to 700'

  const addAboveButton = document.createElement('button')
  addAboveButton.textContent = 'Add 3 above'

  const addRapidButton = document.createElement('button')
  addRapidButton.textContent = 'Add 1, then 2 rapid'

  controls.append(scrollToTargetButton, addAboveButton, addRapidButton)

  const scrollerShell = document.createElement('div')
  scrollerShell.className = 'scroller-shell'

  const scroller = document.createElement('div')
  scroller.className = 'scroller'

  const content = document.createElement('div')
  content.className = 'content'
  scroller.append(content)

  const referenceLine = document.createElement('div')
  referenceLine.className = 'reference-line'
  scrollerShell.append(scroller, referenceLine)

  const info = document.createElement('div')
  info.className = 'info'

  root.append(controls, scrollerShell, info)
  return {
    root,
    scrollToTargetButton,
    addAboveButton,
    addRapidButton,
    scroller,
    content,
    info,
  }
}
