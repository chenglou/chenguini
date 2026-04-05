import {
  TARGET_SCROLL,
  applyAnchorAdjustment,
  createInitialState,
  findItemAtReferenceLine,
  getVisibleEntries,
  layoutEntries,
  pickAnchor,
  prependItems,
} from './scroll-anchor-model.js'

const params = new URLSearchParams(location.search)
const scenario = params.get('scenario') ?? ''
const requestId = params.get('requestId') ?? ''

const dom = {
  add3Button: document.getElementById('add-3-above'),
  content: document.getElementById('content'),
  info: document.getElementById('info'),
  rapidButton: document.getElementById('add-rapid'),
  scrollButton: document.getElementById('scroll-to-700'),
  scroller: document.getElementById('scroller'),
}

const initial = createInitialState()
const st = {
  anchor: null,
  domCache: new Map(),
  events: {
    prependCount: 0,
    requestScrollTop: null,
  },
  items: initial.items,
  layout: layoutEntries(initial.items),
  mountedEntryCount: 0,
  nextId: initial.nextId,
  renderWaiters: [],
  scenarioStarted: false,
  storedScrollTop: 0,
}

let scheduled = false

dom.scrollButton.addEventListener('click', () => {
  st.events.requestScrollTop = TARGET_SCROLL
  scheduleRender()
})

dom.add3Button.addEventListener('click', () => {
  st.events.prependCount += 3
  scheduleRender()
})

dom.rapidButton.addEventListener('click', () => {
  st.events.prependCount += 1
  scheduleRender()
  setTimeout(() => {
    st.events.prependCount += 2
    scheduleRender()
  }, 0)
})

dom.scroller.addEventListener('scroll', () => {
  scheduleRender()
})

function scheduleRender() {
  if (scheduled) return
  scheduled = true
  requestAnimationFrame(render)
}

function render() {
  const scrollTopRead = dom.scroller.scrollTop
  const viewportHeight = dom.scroller.clientHeight
  let explicitScrollTop = st.events.requestScrollTop

  if (st.events.prependCount > 0) {
    const prepended = prependItems(st.items, st.nextId, st.events.prependCount)
    st.items = prepended.items
    st.nextId = prepended.nextId
  }

  const layout = layoutEntries(st.items)
  const anchorResult = applyAnchorAdjustment({
    anchor: st.anchor,
    layout,
    scrollTop: scrollTopRead,
    storedScrollTop: st.storedScrollTop,
  })
  let nextAnchor = anchorResult.anchor
  let desiredScrollTop = explicitScrollTop ?? anchorResult.scrollTop

  if (explicitScrollTop != null) {
    nextAnchor = pickAnchor(layout, explicitScrollTop)
  }

  const effectiveScrollTop = desiredScrollTop
  const visibleEntries = getVisibleEntries(layout, effectiveScrollTop, viewportHeight)

  st.layout = layout
  st.anchor = nextAnchor
  st.mountedEntryCount = visibleEntries.length

  dom.content.style.height = `${layout.totalHeight}px`
  dom.content.textContent = ''

  for (const entry of visibleEntries) {
    const node = getNode(entry)
    node.style.top = `${entry.y}px`
    node.style.height = `${entry.height}px`
    dom.content.appendChild(node)
  }

  if (explicitScrollTop != null || Math.abs(desiredScrollTop - scrollTopRead) > 0.001) {
    dom.scroller.scrollTo({top: desiredScrollTop, behavior: 'instant'})
  }

  st.storedScrollTop = dom.scroller.scrollTop
  dom.info.textContent =
    `scrollTop ${formatNumber(st.storedScrollTop)} | anchor ${st.anchor?.itemId ?? 'none'} | ` +
    `prevY ${st.anchor == null ? 'none' : formatNumber(st.anchor.prevY)} | item count ${st.items.length}`

  st.events.prependCount = 0
  st.events.requestScrollTop = null
  scheduled = false
  flushRenderWaiters()

  if (!st.scenarioStarted && scenario !== '' && requestId !== '') {
    st.scenarioStarted = true
    void runScenario()
  }
}

function getNode(entry) {
  const key = entry.kind === 'header' ? entry.key : entry.id
  let node = st.domCache.get(key)
  if (node != null) return node

  if (entry.kind === 'header') {
    node = document.createElement('div')
    node.className = 'header'
    node.textContent = entry.day
  } else {
    node = document.createElement('div')
    node.className = 'item'
    node.style.background = `linear-gradient(135deg, ${entry.color}, rgba(15, 23, 42, 0.92))`

    const label = document.createElement('div')
    label.className = 'item-label'
    label.textContent = entry.label

    const meta = document.createElement('div')
    meta.className = 'item-meta'
    meta.textContent = `${entry.id} · ${entry.day}`

    node.append(label, meta)
  }

  st.domCache.set(key, node)
  return node
}

function flushRenderWaiters() {
  const waiters = st.renderWaiters
  st.renderWaiters = []
  for (const waiter of waiters) waiter()
}

function waitForRender() {
  return new Promise(resolvePromise => {
    st.renderWaiters.push(resolvePromise)
    scheduleRender()
  })
}

async function requestScrollTo(top) {
  st.events.requestScrollTop = top
  scheduleRender()
  await waitForRender()
  await waitForFrames(1)
}

async function requestAddAbove(count) {
  st.events.prependCount += count
  scheduleRender()
  await waitForRender()
}

async function requestRapidAdd() {
  st.events.prependCount += 1
  scheduleRender()
  const firstRender = waitForRender()
  const secondRender = new Promise(resolvePromise => {
    setTimeout(() => {
      st.events.prependCount += 2
      scheduleRender()
      waitForRender().then(() => resolvePromise())
    }, 0)
  })

  await firstRender
  await secondRender
  await waitForFrames(2)
}

async function simulateUserScroll(top) {
  dom.scroller.scrollTo({top, behavior: 'instant'})
  await waitForFrames(2)
}

async function waitForFrames(count) {
  for (let index = 0; index < count; index++) {
    await new Promise(resolvePromise => requestAnimationFrame(() => resolvePromise()))
  }
}

function makeSnapshot(label) {
  const reference = findItemAtReferenceLine(st.layout, dom.scroller.scrollTop, dom.scroller.clientHeight)
  return {
    anchorId: st.anchor?.itemId ?? null,
    anchorPrevY: st.anchor?.prevY ?? null,
    label,
    mountedEntryCount: st.mountedEntryCount,
    referenceItemId: reference?.itemId ?? null,
    referenceOffset: reference == null ? null : roundNumber(reference.offsetWithinItem),
    scrollTop: roundNumber(dom.scroller.scrollTop),
    totalEntryCount: st.layout.entries.length,
  }
}

function publishReport(report) {
  location.hash = `report=${encodeURIComponent(JSON.stringify(report))}`
}

async function runScenario() {
  publishReport({phase: 'loading', requestId, scenario})

  try {
    publishReport({phase: 'running', requestId, scenario})
    await waitForFrames(2)

    let snapshots
    switch (scenario) {
      case 'scroll-to-700-add-3-above':
        await requestScrollTo(TARGET_SCROLL)
        snapshots = [makeSnapshot('before-add')]
        await requestAddAbove(3)
        snapshots.push(makeSnapshot('after-add'))
        break

      case 'add-1-then-2-rapid':
        await requestScrollTo(TARGET_SCROLL)
        snapshots = [makeSnapshot('before-rapid')]
        await requestRapidAdd()
        snapshots.push(makeSnapshot('after-rapid'))
        break

      case 'user-scroll-then-prepend':
        await requestScrollTo(TARGET_SCROLL)
        await simulateUserScroll(980)
        snapshots = [makeSnapshot('after-user-scroll')]
        await requestAddAbove(3)
        snapshots.push(makeSnapshot('after-add'))
        break

      default:
        throw new Error(`Unknown scenario: ${scenario}`)
    }

    publishReport({
      itemCount: st.items.length,
      phase: 'ready',
      requestId,
      scenario,
      snapshots,
    })
  } catch (error) {
    publishReport({
      message: error instanceof Error ? error.message : String(error),
      phase: 'error',
      requestId,
      scenario,
    })
  }
}

function roundNumber(value) {
  return Math.round(value * 100) / 100
}

function formatNumber(value) {
  return roundNumber(value).toFixed(2)
}

scheduleRender()
