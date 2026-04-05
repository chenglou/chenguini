import {
  TARGET_SCROLL_TOP,
  applyAnchorDelta,
  createInitialItems,
  createPrependItems,
  didScrollSourceChange,
  getReferenceItem,
  getVisibleEntries,
  layoutItems,
  pickAnchor,
  type Item,
  type LayoutEntry,
  type ScrollAnchor,
} from './scroll-anchor-core'

type Report = {
  phase: 'loading' | 'running' | 'ready' | 'error'
  scenario: string
  requestId: string
  beforeItemId?: string | null
  afterItemId?: string | null
  pickedAnchorId?: string | null
  finalAnchorId?: string | null
  finalScrollTop?: number
  message?: string
}

type Events = {
  prependAboveCount: number
  scrollToTarget: number | null
}

type DomEntry =
  | {kind: 'header'; node: HTMLDivElement}
  | {
      kind: 'item'
      node: HTMLDivElement
      idNode: HTMLDivElement
      labelNode: HTMLDivElement
      dayNode: HTMLDivElement
    }

type ScenarioState = {
  name: string
  requestId: string
  started: boolean
}

const params = new URLSearchParams(location.search)
const scenarioState: ScenarioState = {
  name: params.get('scenario') ?? '',
  requestId: params.get('requestId') ?? '',
  started: false,
}

const dom = makeDemoSkeleton()
document.body.appendChild(dom.app)

const st = {
  items: createInitialItems(),
  nextItemNumber: 18,
  domCache: new Map<string, DomEntry>(),
  events: {
    prependAboveCount: 0,
    scrollToTarget: null,
  } satisfies Events,
  scrollAnchor: null as ScrollAnchor | null,
  storedScrollTop: 0,
  forceAnchorRepick: false,
  renderVersion: 0,
  lastLayout: layoutItems(createInitialItems()),
  lastViewportHeight: 0,
  lastScrollTop: 0,
}

dom.scrollToButton.addEventListener('click', () => {
  st.events.scrollToTarget = TARGET_SCROLL_TOP
  st.forceAnchorRepick = true
  scheduleRender()
})

dom.addAboveButton.addEventListener('click', () => {
  st.events.prependAboveCount += 3
  scheduleRender()
})

dom.addRapidButton.addEventListener('click', () => {
  prependAbove(1)
  scheduleRender()
  queueMicrotask(() => {
    prependAbove(2)
    scheduleRender()
  })
})

dom.scroller.addEventListener('scroll', () => {
  scheduleRender()
})

window.addEventListener('resize', () => {
  scheduleRender()
})

publishReport({
  phase: 'loading',
  scenario: scenarioState.name,
  requestId: scenarioState.requestId,
})

let scheduled = false
function scheduleRender() {
  if (scheduled) return
  scheduled = true

  requestAnimationFrame(render)
}

function render() {
  scheduled = false

  const scrollTop = dom.scroller.scrollTop
  const viewportHeight = dom.scroller.clientHeight
  const currentEvents = st.events
  st.events = {
    prependAboveCount: 0,
    scrollToTarget: null,
  }

  if (currentEvents.prependAboveCount > 0) {
    prependAbove(currentEvents.prependAboveCount)
  }

  const layout = layoutItems(st.items)
  const userScrolled = didScrollSourceChange({
    scrollTop,
    storedScrollTop: st.storedScrollTop,
    explicitScrollAction: st.forceAnchorRepick,
  })

  if (userScrolled) {
    st.scrollAnchor = pickAnchor(layout, scrollTop)
  } else {
    if (st.scrollAnchor == null) st.scrollAnchor = pickAnchor(layout, scrollTop)
  }

  let requestedScrollTop = currentEvents.scrollToTarget
  if (requestedScrollTop == null && !userScrolled && st.scrollAnchor != null) {
    const currentItem = layout.itemMap.get(st.scrollAnchor.id)
    if (currentItem != null) {
      const adjusted = applyAnchorDelta(scrollTop, st.scrollAnchor, currentItem.top)
      requestedScrollTop = adjusted.nextScrollTop
      st.scrollAnchor = adjusted.anchor
    }
  }

  const renderScrollTop = requestedScrollTop ?? scrollTop
  const visibleEntries = getVisibleEntries(layout, renderScrollTop, viewportHeight)

  renderVisibleEntries(visibleEntries)
  dom.content.style.height = `${layout.totalHeight}px`

  dom.info.textContent =
    `scrollTop ${scrollTop.toFixed(0)} | anchor ${st.scrollAnchor?.id ?? 'none'} | prevY ${st.scrollAnchor?.prevY.toFixed(0) ?? 'none'} | item count ${st.items.length}`

  if (requestedScrollTop != null) {
    dom.scroller.scrollTo({top: requestedScrollTop, behavior: 'instant'})
    st.storedScrollTop = dom.scroller.scrollTop
    if (currentEvents.scrollToTarget != null) scheduleRender()
  } else {
    st.storedScrollTop = dom.scroller.scrollTop
  }

  if (userScrolled && currentEvents.scrollToTarget == null) st.forceAnchorRepick = false

  st.lastLayout = layout
  st.lastViewportHeight = viewportHeight
  st.lastScrollTop = dom.scroller.scrollTop
  st.renderVersion += 1

  if (!scenarioState.started && scenarioState.name !== '') {
    scenarioState.started = true
    void runScenario()
  }
}

function renderVisibleEntries(visibleEntries: LayoutEntry[]) {
  dom.content.textContent = ''

  for (const entry of visibleEntries) {
    switch (entry.kind) {
      case 'header': {
        let cached = st.domCache.get(entry.key)
        if (cached == null || cached.kind !== 'header') {
          const node = document.createElement('div')
          node.className = 'header'
          cached = {kind: 'header', node}
          st.domCache.set(entry.key, cached)
        }

        cached.node.textContent = entry.day
        cached.node.style.top = `${entry.top}px`
        dom.content.appendChild(cached.node)
        break
      }

      case 'item': {
        let cached = st.domCache.get(entry.key)
        if (cached == null || cached.kind !== 'item') {
          const node = document.createElement('div')
          node.className = 'item'
          const idNode = document.createElement('div')
          idNode.className = 'item-id'
          const labelNode = document.createElement('div')
          labelNode.className = 'item-label'
          const dayNode = document.createElement('div')
          dayNode.className = 'item-day'
          node.append(idNode, labelNode, dayNode)
          cached = {kind: 'item', node, idNode, labelNode, dayNode}
          st.domCache.set(entry.key, cached)
        }

        cached.node.dataset.itemId = entry.item.id
        cached.node.style.top = `${entry.item.top}px`
        cached.node.style.background = entry.item.color
        cached.idNode.textContent = entry.item.id
        cached.labelNode.textContent = entry.item.label
        cached.dayNode.textContent = entry.item.day
        dom.content.appendChild(cached.node)
        break
      }
    }
  }
}

function prependAbove(count: number) {
  const prepended = createPrependItems({
    count,
    startAt: st.nextItemNumber,
  })
  st.items = [...prepended.items, ...st.items]
  st.nextItemNumber = prepended.nextNumber
}

async function runScenario() {
  publishReport({
    phase: 'running',
    scenario: scenarioState.name,
    requestId: scenarioState.requestId,
  })

  try {
    await waitForIdleFrames(2)

    switch (scenarioState.name) {
      case 'scroll-to-700-then-add-3-above': {
        clickScrollTo700()
        await waitForIdleFrames(2)
        const beforeItem = getReferenceItem(st.lastLayout, st.lastScrollTop, st.lastViewportHeight)
        clickAddAbove()
        await waitForIdleFrames(2)
        const afterItem = getReferenceItem(st.lastLayout, st.lastScrollTop, st.lastViewportHeight)
        publishReport({
          phase: 'ready',
          scenario: scenarioState.name,
          requestId: scenarioState.requestId,
          beforeItemId: beforeItem?.id ?? null,
          afterItemId: afterItem?.id ?? null,
          finalAnchorId: st.scrollAnchor?.id ?? null,
          finalScrollTop: st.lastScrollTop,
        })
        break
      }

      case 'add-1-then-2-rapid': {
        clickScrollTo700()
        await waitForIdleFrames(2)
        const beforeItem = getReferenceItem(st.lastLayout, st.lastScrollTop, st.lastViewportHeight)
        clickAddRapid()
        await waitForIdleFrames(2)
        const afterItem = getReferenceItem(st.lastLayout, st.lastScrollTop, st.lastViewportHeight)
        publishReport({
          phase: 'ready',
          scenario: scenarioState.name,
          requestId: scenarioState.requestId,
          beforeItemId: beforeItem?.id ?? null,
          afterItemId: afterItem?.id ?? null,
          finalAnchorId: st.scrollAnchor?.id ?? null,
          finalScrollTop: st.lastScrollTop,
        })
        break
      }

      case 'user-scroll-then-prepend': {
        simulateUserScroll(790)
        await waitForIdleFrames(2)
        const pickedAnchor = st.scrollAnchor?.id ?? null
        clickAddAbove()
        await waitForIdleFrames(2)
        publishReport({
          phase: 'ready',
          scenario: scenarioState.name,
          requestId: scenarioState.requestId,
          pickedAnchorId: pickedAnchor,
          finalAnchorId: st.scrollAnchor?.id ?? null,
          finalScrollTop: st.lastScrollTop,
        })
        break
      }

      default:
        publishReport({
          phase: 'error',
          scenario: scenarioState.name,
          requestId: scenarioState.requestId,
          message: `Unknown scenario: ${scenarioState.name}`,
        })
        break
    }
  } catch (error) {
    publishReport({
      phase: 'error',
      scenario: scenarioState.name,
      requestId: scenarioState.requestId,
      message: error instanceof Error ? error.message : String(error),
    })
  }
}

function clickScrollTo700() {
  st.events.scrollToTarget = TARGET_SCROLL_TOP
  st.forceAnchorRepick = true
  scheduleRender()
}

function clickAddAbove() {
  st.events.prependAboveCount += 3
  scheduleRender()
}

function clickAddRapid() {
  prependAbove(1)
  scheduleRender()
  queueMicrotask(() => {
    prependAbove(2)
    scheduleRender()
  })
}

function simulateUserScroll(top: number) {
  dom.scroller.scrollTop = top
  scheduleRender()
}

async function waitForIdleFrames(frameCount: number) {
  let stableFrames = 0
  let lastVersion = st.renderVersion

  while (stableFrames < frameCount) {
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
    if (!scheduled && st.renderVersion === lastVersion) stableFrames += 1
    else stableFrames = 0
    lastVersion = st.renderVersion
  }
}

function publishReport(report: Report) {
  if (report.requestId === '' && report.scenario === '') return
  location.hash = `report=${encodeURIComponent(JSON.stringify(report))}`
}

function makeDemoSkeleton() {
  const scrollToButton = document.createElement('button')
  scrollToButton.className = 'control-button'
  scrollToButton.textContent = 'Scroll to 700'

  const addAboveButton = document.createElement('button')
  addAboveButton.className = 'control-button'
  addAboveButton.textContent = 'Add 3 above'

  const addRapidButton = document.createElement('button')
  addRapidButton.className = 'control-button'
  addRapidButton.textContent = 'Add 1, then 2 rapid'

  const controls = document.createElement('div')
  controls.className = 'controls'
  controls.append(scrollToButton, addAboveButton, addRapidButton)

  const scroller = document.createElement('div')
  scroller.className = 'scroller'

  const content = document.createElement('div')
  content.className = 'content'
  scroller.appendChild(content)

  const referenceLine = document.createElement('div')
  referenceLine.className = 'reference-line'

  const viewportShell = document.createElement('div')
  viewportShell.className = 'viewport-shell'
  viewportShell.append(scroller, referenceLine)

  const info = document.createElement('div')
  info.className = 'info'

  const app = document.createElement('div')
  app.className = 'app'
  app.append(controls, viewportShell, info)

  return {
    app,
    scrollToButton,
    addAboveButton,
    addRapidButton,
    viewportShell,
    scroller,
    content,
    info,
  }
}

scheduleRender()
