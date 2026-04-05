import {
  TARGET_SCROLL_TOP,
  adjustScrollTopForAnchor,
  buildInitialItems,
  computeLayout,
  findItemAtY,
  getVisibleEntries,
  pickAnchor,
  prependItems,
  type Anchor,
  type Item,
  type Layout,
} from './scroll-anchor-core'

type Report = {
  phase: 'loading' | 'running' | 'ready' | 'error'
  requestId: string
  scenario: string
  pickedAnchorId?: string | null
  referenceItemBefore?: string | null
  referenceItemAfter?: string | null
  scrollTopBefore?: number
  scrollTopAfter?: number
  itemCount?: number
  mountedItemCount?: number
  mountedHeaderCount?: number
  message?: string
}

type Event =
  | {kind: 'scrollTo'; top: number}
  | {kind: 'prependAbove'; count: number}

const scrollerHeight = 560

const params = new URLSearchParams(location.search)
const scenario = params.get('scenario') ?? ''
const requestId = params.get('requestId') ?? ''

const app = document.createElement('div')
app.style.minHeight = '100vh'
app.style.display = 'flex'
app.style.flexDirection = 'column'
app.style.alignItems = 'center'
app.style.justifyContent = 'center'
app.style.gap = '16px'
app.style.padding = '24px'

const controls = document.createElement('div')
controls.style.display = 'flex'
controls.style.gap = '12px'
controls.style.flexWrap = 'wrap'
controls.style.justifyContent = 'center'

const scrollShell = document.createElement('div')
scrollShell.style.position = 'relative'
scrollShell.style.width = '640px'
scrollShell.style.height = `${scrollerHeight}px`
scrollShell.style.border = '1px solid #29313a'
scrollShell.style.borderRadius = '14px'
scrollShell.style.overflow = 'hidden'
scrollShell.style.background = 'linear-gradient(180deg, #181c20 0%, #111315 100%)'
scrollShell.style.boxShadow = '0 20px 60px rgba(0, 0, 0, 0.35)'

const scroller = document.createElement('div')
scroller.style.position = 'absolute'
scroller.style.inset = '0'
scroller.style.overflowY = 'scroll'
scroller.style.overflowX = 'hidden'
scroller.style.scrollBehavior = 'auto'

const content = document.createElement('div')
content.style.position = 'relative'
scroller.append(content)

const referenceLine = document.createElement('div')
referenceLine.style.position = 'absolute'
referenceLine.style.left = '0'
referenceLine.style.right = '0'
referenceLine.style.top = '50%'
referenceLine.style.height = '0'
referenceLine.style.borderTop = '1px solid rgba(255, 255, 255, 0.6)'
referenceLine.style.pointerEvents = 'none'

const referenceLabel = document.createElement('div')
referenceLabel.textContent = 'reference'
referenceLabel.style.position = 'absolute'
referenceLabel.style.right = '12px'
referenceLabel.style.top = 'calc(50% - 10px)'
referenceLabel.style.padding = '2px 6px'
referenceLabel.style.background = '#111315'
referenceLabel.style.fontSize = '11px'
referenceLabel.style.letterSpacing = '0.08em'
referenceLabel.style.textTransform = 'uppercase'
referenceLabel.style.color = '#f5f7fb'
referenceLabel.style.pointerEvents = 'none'

const info = document.createElement('div')
info.style.width = '640px'
info.style.padding = '10px 12px'
info.style.borderRadius = '10px'
info.style.border = '1px solid #29313a'
info.style.background = '#171a1e'
info.style.fontSize = '12px'
info.style.color = '#b7c0cb'

scrollShell.append(scroller, referenceLine, referenceLabel)
app.append(controls, scrollShell, info)
document.body.append(app)

const initial = buildInitialItems()
const st = {
  items: initial.items,
  nextNumber: initial.nextNumber,
  events: [] as Event[],
  anchor: null as Anchor | null,
  scrollTopReadBack: 0,
  scheduled: false,
  renderVersion: 0,
  layout: computeLayout(initial.items),
  lastRender: {
    scrollTop: 0,
    referenceItemId: null as string | null,
    mountedItemCount: 0,
    mountedHeaderCount: 0,
  },
  headerCache: new Map<string, HTMLDivElement>(),
  itemCache: new Map<string, HTMLDivElement>(),
}

const scrollTo700Button = makeButton('Scroll to 700', () => {
  enqueueEvent({kind: 'scrollTo', top: TARGET_SCROLL_TOP})
})
const addThreeButton = makeButton('Add 3 above', () => {
  enqueueEvent({kind: 'prependAbove', count: 3})
})
const addRapidButton = makeButton('Add 1, then 2 rapid', () => {
  enqueueEvent({kind: 'prependAbove', count: 1})
  queueMicrotask(() => enqueueEvent({kind: 'prependAbove', count: 2}))
})

controls.append(scrollTo700Button, addThreeButton, addRapidButton)

window.addEventListener('resize', () => scheduleRender())
scroller.addEventListener('scroll', () => scheduleRender())

publishReport({phase: 'loading', requestId, scenario})
scheduleRender()

if (scenario !== '' && requestId !== '') {
  void runScenario().catch(error => {
    publishReport({
      phase: 'error',
      requestId,
      scenario,
      message: error instanceof Error ? error.message : String(error),
    })
  })
}

function enqueueEvent(event: Event) {
  st.events.push(event)
  scheduleRender()
}

function scheduleRender() {
  if (st.scheduled) return
  st.scheduled = true
  requestAnimationFrame(render)
}

function render() {
  st.scheduled = false

  const scrollTopStart = scroller.scrollTop
  const viewportHeight = scroller.clientHeight
  const events = st.events.splice(0)

  let requestedScrollTop: number | null = null
  let prependCount = 0
  for (const event of events) {
    switch (event.kind) {
      case 'scrollTo':
        requestedScrollTop = event.top
        break
      case 'prependAbove':
        prependCount += event.count
        break
    }
  }

  if (prependCount > 0) {
    const next = prependItems(st.items, st.nextNumber, prependCount)
    st.items = next.items
    st.nextNumber = next.nextNumber
  }

  const layout = computeLayout(st.items)
  const userScrolled = requestedScrollTop != null || scrollTopStart !== st.scrollTopReadBack
  if (userScrolled) st.anchor = pickAnchor(layout, requestedScrollTop ?? scrollTopStart)

  let effectiveScrollTop = requestedScrollTop ?? scrollTopStart
  if (!userScrolled) {
    const adjusted = adjustScrollTopForAnchor(st.anchor, layout, scrollTopStart)
    effectiveScrollTop = adjusted.scrollTop
    st.anchor = adjusted.anchor
  }

  st.layout = layout
  renderVisibleEntries(layout, effectiveScrollTop, viewportHeight)

  if (Math.abs(effectiveScrollTop - scrollTopStart) > 0.001) {
    scroller.scrollTo({top: effectiveScrollTop, behavior: 'instant'})
  }

  st.scrollTopReadBack = scroller.scrollTop
  st.renderVersion++

  const referenceItem = findItemAtY(layout, st.scrollTopReadBack + viewportHeight / 2)
  st.lastRender = {
    scrollTop: st.scrollTopReadBack,
    referenceItemId: referenceItem?.id ?? null,
    mountedItemCount: Number(content.dataset.mountedItemCount ?? '0'),
    mountedHeaderCount: Number(content.dataset.mountedHeaderCount ?? '0'),
  }

  info.textContent =
    `scrollTop ${formatNumber(st.scrollTopReadBack)} | ` +
    `anchor ${st.anchor?.id ?? 'none'} | ` +
    `prevY ${formatNumber(st.anchor?.prevY ?? null)} | ` +
    `item count ${st.items.length}`
}

function renderVisibleEntries(layout: Layout, scrollTop: number, viewportHeight: number) {
  const visibleEntries = getVisibleEntries(layout, scrollTop, viewportHeight)
  content.textContent = ''
  content.style.height = `${layout.totalHeight}px`

  let mountedItemCount = 0
  let mountedHeaderCount = 0
  for (const entry of visibleEntries) {
    switch (entry.kind) {
      case 'header': {
        const header = getHeaderNode(entry.day)
        header.style.top = `${entry.top}px`
        content.append(header)
        mountedHeaderCount++
        break
      }

      case 'item': {
        const item = getItemNode(entry.item)
        item.style.top = `${entry.top}px`
        content.append(item)
        mountedItemCount++
        break
      }
    }
  }

  content.dataset.mountedItemCount = String(mountedItemCount)
  content.dataset.mountedHeaderCount = String(mountedHeaderCount)
}

function getHeaderNode(day: string) {
  let node = st.headerCache.get(day)
  if (node != null) return node

  node = document.createElement('div')
  node.textContent = day
  node.style.position = 'absolute'
  node.style.left = '0'
  node.style.right = '0'
  node.style.height = '24px'
  node.style.padding = '4px 16px'
  node.style.color = '#7f8b99'
  node.style.fontSize = '12px'
  node.style.letterSpacing = '0.08em'
  node.style.textTransform = 'uppercase'
  node.style.background = '#111315'
  st.headerCache.set(day, node)
  return node
}

function getItemNode(item: Item) {
  let node = st.itemCache.get(item.id)
  if (node != null) return node

  node = document.createElement('div')
  node.dataset.itemId = item.id
  node.style.position = 'absolute'
  node.style.left = '16px'
  node.style.right = '16px'
  node.style.height = '100px'
  node.style.borderRadius = '12px'
  node.style.padding = '12px 14px'
  node.style.display = 'flex'
  node.style.flexDirection = 'column'
  node.style.justifyContent = 'space-between'
  node.style.boxShadow = 'inset 0 0 0 1px rgba(255, 255, 255, 0.12)'
  node.style.background = item.color
  node.style.color = '#f8f9fb'

  const topLine = document.createElement('div')
  topLine.style.display = 'flex'
  topLine.style.justifyContent = 'space-between'
  topLine.style.fontSize = '12px'
  topLine.style.opacity = '0.88'

  const id = document.createElement('span')
  id.textContent = item.id
  const day = document.createElement('span')
  day.textContent = item.day
  topLine.append(id, day)

  const label = document.createElement('div')
  label.textContent = item.label
  label.style.fontSize = '28px'
  label.style.fontWeight = '700'
  label.style.letterSpacing = '-0.04em'

  node.append(topLine, label)
  st.itemCache.set(item.id, node)
  return node
}

async function runScenario() {
  publishReport({phase: 'running', requestId, scenario})
  await waitForIdle()

  switch (scenario) {
    case 'scroll-to-700-add-3-above': {
      enqueueEvent({kind: 'scrollTo', top: TARGET_SCROLL_TOP})
      await waitForIdle()
      const before = snapshot()

      enqueueEvent({kind: 'prependAbove', count: 3})
      await waitForIdle()
      const after = snapshot()

      publishReport({
        phase: 'ready',
        requestId,
        scenario,
        pickedAnchorId: before.anchorId,
        referenceItemBefore: before.referenceItemId,
        referenceItemAfter: after.referenceItemId,
        scrollTopBefore: before.scrollTop,
        scrollTopAfter: after.scrollTop,
        itemCount: after.itemCount,
        mountedItemCount: after.mountedItemCount,
        mountedHeaderCount: after.mountedHeaderCount,
      })
      return
    }

    case 'add-1-then-2-rapid': {
      enqueueEvent({kind: 'scrollTo', top: TARGET_SCROLL_TOP})
      await waitForIdle()
      const before = snapshot()

      enqueueEvent({kind: 'prependAbove', count: 1})
      queueMicrotask(() => enqueueEvent({kind: 'prependAbove', count: 2}))
      await waitForIdle()
      const after = snapshot()

      publishReport({
        phase: 'ready',
        requestId,
        scenario,
        pickedAnchorId: before.anchorId,
        referenceItemBefore: before.referenceItemId,
        referenceItemAfter: after.referenceItemId,
        scrollTopBefore: before.scrollTop,
        scrollTopAfter: after.scrollTop,
        itemCount: after.itemCount,
        mountedItemCount: after.mountedItemCount,
        mountedHeaderCount: after.mountedHeaderCount,
      })
      return
    }

    case 'user-scroll-then-prepend': {
      enqueueEvent({kind: 'scrollTo', top: TARGET_SCROLL_TOP})
      await waitForIdle()

      scroller.scrollTo({top: 1116, behavior: 'instant'})
      scheduleRender()
      await waitForIdle()
      const before = snapshot()

      enqueueEvent({kind: 'prependAbove', count: 3})
      await waitForIdle()
      const after = snapshot()

      publishReport({
        phase: 'ready',
        requestId,
        scenario,
        pickedAnchorId: before.anchorId,
        referenceItemBefore: before.referenceItemId,
        referenceItemAfter: after.referenceItemId,
        scrollTopBefore: before.scrollTop,
        scrollTopAfter: after.scrollTop,
        itemCount: after.itemCount,
        mountedItemCount: after.mountedItemCount,
        mountedHeaderCount: after.mountedHeaderCount,
      })
      return
    }

    default:
      throw new Error(`Unknown scenario "${scenario}"`)
  }
}

function snapshot() {
  return {
    anchorId: st.anchor?.id ?? null,
    scrollTop: st.lastRender.scrollTop,
    referenceItemId: st.lastRender.referenceItemId,
    itemCount: st.items.length,
    mountedItemCount: st.lastRender.mountedItemCount,
    mountedHeaderCount: st.lastRender.mountedHeaderCount,
  }
}

async function waitForIdle() {
  let stableFrames = 0
  let previousSignature = ''

  for (let i = 0; i < 120; i++) {
    await new Promise(requestAnimationFrame)
    const signature = JSON.stringify({
      scheduled: st.scheduled,
      eventCount: st.events.length,
      renderVersion: st.renderVersion,
      scrollTop: st.lastRender.scrollTop,
      referenceItemId: st.lastRender.referenceItemId,
      itemCount: st.items.length,
    })

    if (!st.scheduled && st.events.length === 0 && signature === previousSignature) {
      stableFrames++
      if (stableFrames >= 2) return
    } else {
      stableFrames = 0
    }

    previousSignature = signature
  }

  throw new Error('Timed out waiting for page idle')
}

function publishReport(report: Report) {
  location.hash = `report=${encodeURIComponent(JSON.stringify(report))}`
}

function makeButton(label: string, onClick: () => void) {
  const button = document.createElement('button')
  button.textContent = label
  button.style.border = '1px solid #38424d'
  button.style.borderRadius = '999px'
  button.style.padding = '10px 14px'
  button.style.background = '#181c20'
  button.style.color = '#f4f7fb'
  button.style.cursor = 'pointer'
  button.addEventListener('click', onClick)
  return button
}

function formatNumber(value: number | null) {
  if (value == null) return 'none'
  return value.toFixed(0)
}
