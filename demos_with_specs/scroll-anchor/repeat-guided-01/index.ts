import {
  HEADER_HEIGHT,
  ITEM_HEIGHT,
  TARGET_SCROLL,
  createInitialItems,
  findReferenceItem,
  layoutItems,
  listVisibleEntries,
  prependItems,
  resolveScrollAnchor,
} from './model.ts'

const params = new URLSearchParams(location.search)
const scenario = params.get('scenario') ?? ''
const requestId = params.get('requestId') ?? ''

function makeAppSkeleton() {
  const controls = document.createElement('div')
  controls.className = 'controls'

  const scrollButton = document.createElement('button')
  scrollButton.textContent = 'Scroll to 700'

  const prependThreeButton = document.createElement('button')
  prependThreeButton.textContent = 'Add 3 above'

  const rapidButton = document.createElement('button')
  rapidButton.textContent = 'Add 1, then 2 rapid'

  controls.append(scrollButton, prependThreeButton, rapidButton)

  const referenceLine = document.createElement('div')
  referenceLine.className = 'reference-line'

  const content = document.createElement('div')
  content.className = 'content'

  const scroller = document.createElement('div')
  scroller.className = 'scroller'
  scroller.appendChild(content)

  const viewportShell = document.createElement('div')
  viewportShell.className = 'viewport-shell'
  viewportShell.append(scroller, referenceLine)

  const info = document.createElement('div')
  info.className = 'info'

  const root = document.createElement('div')
  root.className = 'app'
  root.append(controls, viewportShell, info)

  return {
    content,
    info,
    prependThreeButton,
    rapidButton,
    referenceLine,
    root,
    scrollButton,
    scroller,
  }
}

function createHeaderNode(day) {
  const node = document.createElement('div')
  node.className = 'day-header'
  node.textContent = day
  return node
}

function createItemNode(item) {
  const node = document.createElement('div')
  node.className = 'item'

  const itemId = document.createElement('div')
  itemId.className = 'item-id'
  itemId.textContent = item.id

  const label = document.createElement('div')
  label.className = 'item-label'
  label.textContent = item.label

  const day = document.createElement('div')
  day.className = 'item-day'
  day.textContent = item.day

  node.append(itemId, label, day)
  return node
}

const view = makeAppSkeleton()
document.body.appendChild(view.root)

const st = {
  anchor: null,
  events: {
    prependCount: 0,
    scrollToTop: null,
  },
  items: createInitialItems(),
  layout: null,
  mountedHeaderDays: [],
  mountedItemIds: [],
  nextItemNumber: 18,
  renderResolvers: [],
  scenarioStarted: false,
  scrollTopReadback: 0,
}

const domCache = {
  headers: new Map(),
  items: new Map(),
}

let scheduled = false

view.scrollButton.addEventListener('click', () => {
  st.events.scrollToTop = TARGET_SCROLL
  scheduleRender()
})

view.prependThreeButton.addEventListener('click', () => {
  st.events.prependCount += 3
  scheduleRender()
})

view.rapidButton.addEventListener('click', () => {
  queueRapidPrepend()
})

view.scroller.addEventListener('scroll', () => {
  scheduleRender()
})

window.addEventListener('resize', () => {
  scheduleRender()
})

publishReport({phase: requestId === '' ? 'ready' : 'loading'})
scheduleRender()
void runScenario()

function scheduleRender() {
  if (scheduled) return
  scheduled = true

  requestAnimationFrame(function render() {
    let scheduleNextRender = false

    const scrollTop = view.scroller.scrollTop

    if (st.events.prependCount > 0) {
      const prepended = prependItems(st.items, st.events.prependCount, st.nextItemNumber)
      st.items = prepended.items
      st.nextItemNumber = prepended.nextItemNumber
    }

    const layout = layoutItems(st.items)
    const anchorResult = resolveScrollAnchor({
      anchor: st.anchor,
      explicitScrollTop: st.events.scrollToTop,
      layout,
      scrollTop,
      storedScrollTop: st.scrollTopReadback,
    })

    st.anchor = anchorResult.anchor
    st.layout = layout

    view.content.textContent = ''
    view.content.style.height = `${layout.totalHeight}px`

    const visible = listVisibleEntries(layout, scrollTop, view.scroller.clientHeight)
    st.mountedHeaderDays = visible.visibleHeaders.map(header => header.day)
    st.mountedItemIds = visible.visibleItems.map(entry => entry.item.id)

    for (const header of visible.visibleHeaders) {
      let node = domCache.headers.get(header.day)
      if (node == null) {
        node = createHeaderNode(header.day)
        domCache.headers.set(header.day, node)
      }

      node.style.top = `${header.top}px`
      node.style.height = `${HEADER_HEIGHT}px`
      view.content.appendChild(node)
    }

    for (const positionedItem of visible.visibleItems) {
      let node = domCache.items.get(positionedItem.item.id)
      if (node == null) {
        node = createItemNode(positionedItem.item)
        domCache.items.set(positionedItem.item.id, node)
      }

      node.style.top = `${positionedItem.top}px`
      node.style.height = `${ITEM_HEIGHT}px`
      node.style.background = `linear-gradient(135deg, ${positionedItem.item.color} 0%, color-mix(in srgb, ${positionedItem.item.color} 68%, white 32%) 100%)`
      view.content.appendChild(node)
    }

    view.info.textContent =
      `scrollTop ${formatNumber(scrollTop)} | anchor ${st.anchor?.id ?? 'none'} | prevY ${formatNumber(st.anchor?.prevY ?? null)} | items ${st.items.length}`

    if (Math.abs(anchorResult.requestedScrollTop - scrollTop) > 0.01) {
      scrollInstant(view.scroller, anchorResult.requestedScrollTop)
    }
    st.scrollTopReadback = view.scroller.scrollTop

    scheduled = false
    st.events.prependCount = 0
    st.events.scrollToTop = null

    flushRenderResolvers()
    if (scheduleNextRender) scheduleRender()
  })
}

async function runScenario() {
  if (requestId === '' || scenario === '' || st.scenarioStarted) return
  st.scenarioStarted = true

  try {
    publishReport({phase: 'running', step: 'boot'})
    await waitForFrames(3)

    switch (scenario) {
      case 'scroll-to-700-add-3-above':
        await runScrollTo700Add3Above()
        break

      case 'add-1-then-2-rapid':
        await runAdd1Then2Rapid()
        break

      case 'user-scroll-then-prepend':
        await runUserScrollThenPrepend()
        break

      default:
        throw new Error(`Unknown scenario: ${scenario}`)
    }
  } catch (error) {
    publishReport({
      phase: 'error',
      message: error instanceof Error ? error.message : String(error),
    })
  }
}

async function runScrollTo700Add3Above() {
  click(view.scrollButton)
  await waitForFrames(4)

  const before = captureSnapshot()
  publishReport({
    phase: 'running',
    step: 'before-add-3-above',
    anchorId: before.anchorId,
    referenceItemId: before.referenceItemId,
  })

  click(view.prependThreeButton)
  await waitForFrames(4)

  const after = captureSnapshot()
  publishReport({
    phase: 'ready',
    afterReferenceItemId: after.referenceItemId,
    anchorAfterActionId: after.anchorId,
    beforeReferenceItemId: before.referenceItemId,
    itemCount: st.items.length,
    mountedHeaderCount: st.mountedHeaderDays.length,
    mountedItemCount: st.mountedItemIds.length,
  })
}

async function runAdd1Then2Rapid() {
  click(view.scrollButton)
  await waitForFrames(4)

  const before = captureSnapshot()
  publishReport({
    phase: 'running',
    step: 'before-rapid-prepend',
    anchorId: before.anchorId,
    referenceItemId: before.referenceItemId,
  })

  click(view.rapidButton)
  await waitForFrames(4)

  const after = captureSnapshot()
  publishReport({
    phase: 'ready',
    afterReferenceItemId: after.referenceItemId,
    anchorAfterActionId: after.anchorId,
    beforeReferenceItemId: before.referenceItemId,
    itemCount: st.items.length,
    mountedHeaderCount: st.mountedHeaderDays.length,
    mountedItemCount: st.mountedItemIds.length,
  })
}

async function runUserScrollThenPrepend() {
  const beforeUserScrollAnchorId = st.anchor?.id ?? null

  scrollInstant(view.scroller, 980)
  scheduleRender()
  await waitForFrames(4)

  const before = captureSnapshot()
  publishReport({
    phase: 'running',
    step: 'before-user-scroll-prepend',
    anchorAfterUserScrollId: before.anchorId,
    anchorBeforeUserScrollId: beforeUserScrollAnchorId,
    referenceItemId: before.referenceItemId,
  })

  click(view.prependThreeButton)
  await waitForFrames(4)

  const after = captureSnapshot()
  publishReport({
    phase: 'ready',
    afterReferenceItemId: after.referenceItemId,
    anchorAfterActionId: after.anchorId,
    anchorAfterUserScrollId: before.anchorId,
    anchorBeforeUserScrollId: beforeUserScrollAnchorId,
    beforeReferenceItemId: before.referenceItemId,
    itemCount: st.items.length,
    mountedHeaderCount: st.mountedHeaderDays.length,
    mountedItemCount: st.mountedItemIds.length,
  })
}

function captureSnapshot() {
  const referenceItem = st.layout == null ? null : findReferenceItem(st.layout, view.scroller.scrollTop, view.scroller.clientHeight)
  return {
    anchorId: st.anchor?.id ?? null,
    referenceItemId: referenceItem?.id ?? null,
  }
}

function queueRapidPrepend() {
  st.events.prependCount += 1
  scheduleRender()

  queueMicrotask(() => {
    st.events.prependCount += 2
    scheduleRender()
  })
}

function click(button) {
  button.dispatchEvent(new MouseEvent('click', {bubbles: true}))
}

function waitForFrames(count) {
  return new Promise(resolve => {
    let remaining = count

    function nextFrame() {
      if (remaining <= 0) {
        resolve(undefined)
        return
      }

      requestAnimationFrame(() => {
        remaining -= 1
        nextFrame()
      })
    }

    nextFrame()
  })
}

function scrollInstant(scroller, top) {
  try {
    scroller.scrollTo({top, behavior: 'instant'})
  } catch {
    scroller.scrollTop = top
  }
}

function publishReport(fields) {
  if (requestId === '') return

  const report = {
    phase: 'loading',
    requestId,
    scenario,
    ...fields,
  }
  location.hash = `report=${encodeURIComponent(JSON.stringify(report))}`
}

function flushRenderResolvers() {
  if (st.renderResolvers.length === 0) return
  const resolvers = st.renderResolvers
  st.renderResolvers = []
  for (const resolve of resolvers) resolve()
}

function formatNumber(value) {
  if (value == null) return 'none'
  return Math.round(value * 100) / 100
}
