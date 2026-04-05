import {
  ITEM_HEIGHT,
  TARGET_SCROLL_TOP,
  buildLayout,
  createInitialState,
  findItemAtReferenceLine,
  pickAnchor,
  prependAbove,
  type Anchor,
  type Day,
  type ItemState,
  type LayoutHeader,
  type LayoutItem,
} from './model.ts'

type Event =
  | {kind: 'scrollTo'; top: number}
  | {kind: 'prependAbove'; count: number}

type Report = {
  phase: 'loading' | 'running' | 'ready' | 'error'
  requestId: string
  scenario: string
  itemCount?: number
  anchorId?: string | null
  anchorBeforePrependId?: string | null
  referenceItemBeforeId?: string | null
  referenceItemAfterId?: string | null
  scrollTopBefore?: number
  scrollTopAfter?: number
  message?: string
}

type Snapshot = {
  anchorId: string | null
  referenceItemId: string | null
  scrollTop: number
}

const params = new URLSearchParams(location.search)
const scenario = params.get('scenario') ?? ''
const requestId = params.get('requestId') ?? ''

function publishReport(report: Report) {
  if (requestId === '') return
  location.hash = `report=${encodeURIComponent(JSON.stringify(report))}`
}

const dom = makeDom()
document.body.append(dom.app)

const st = {
  itemState: createInitialState() as ItemState,
  scrollTopReadBack: 0,
  anchor: null as Anchor | null,
  domCache: {
    headers: new Map<Day, HTMLDivElement>(),
    items: new Map<string, HTMLDivElement>(),
  },
  events: [] as Event[],
  renderCount: 0,
  scheduled: false,
}

dom.scrollToButton.addEventListener('click', () => {
  st.events.push({kind: 'scrollTo', top: TARGET_SCROLL_TOP})
  scheduleRender()
})

dom.addThreeButton.addEventListener('click', () => {
  st.events.push({kind: 'prependAbove', count: 3})
  scheduleRender()
})

dom.addRapidButton.addEventListener('click', () => {
  st.events.push({kind: 'prependAbove', count: 1})
  scheduleRender()
  setTimeout(() => {
    st.events.push({kind: 'prependAbove', count: 2})
    scheduleRender()
  }, 0)
})

window.addEventListener('resize', () => {
  scheduleRender()
})
dom.scroller.addEventListener('scroll', () => {
  scheduleRender()
})

if (requestId !== '') publishReport({phase: 'loading', requestId, scenario})

scheduleRender()
void runScenario()

function scheduleRender() {
  if (st.scheduled) return
  st.scheduled = true

  requestAnimationFrame(() => {
    const scrollTop = dom.scroller.scrollTop
    const viewportHeight = dom.viewport.clientHeight
    const viewportWidth = dom.viewport.clientWidth
    let requestedScrollTop: number | null = null
    let explicitAnchorTop: number | null = null

    for (const event of st.events) {
      switch (event.kind) {
        case 'scrollTo':
          requestedScrollTop = event.top
          explicitAnchorTop = event.top
          break

        case 'prependAbove':
          prependAbove(st.itemState, event.count)
          break
      }
    }

    const layout = buildLayout(st.itemState.items)
    const userScrolled = explicitAnchorTop == null && scrollTop !== st.scrollTopReadBack
    const anchorMissing =
      st.anchor != null &&
      !layout.items.some(item => item.id === st.anchor?.id)
    const shouldPickAnchor = st.anchor == null || userScrolled || explicitAnchorTop != null || anchorMissing

    if (shouldPickAnchor) {
      st.anchor = pickAnchor(layout.items, explicitAnchorTop ?? scrollTop)
    }

    if (st.anchor != null) {
      const anchorItem = layout.items.find(item => item.id === st.anchor?.id)
      if (anchorItem != null) {
        if (shouldPickAnchor) {
          st.anchor = {id: anchorItem.id, prevY: anchorItem.top}
        } else {
          requestedScrollTop = scrollTop + (anchorItem.top - st.anchor.prevY)
          st.anchor = {id: anchorItem.id, prevY: anchorItem.top}
        }
      } else {
        st.anchor = null
      }
    }

    renderViewport(layout.headers, layout.items, layout.totalHeight, viewportWidth, viewportHeight, scrollTop)

    if (requestedScrollTop != null) {
      dom.scroller.scrollTo({top: requestedScrollTop, behavior: 'instant'})
    }

    const scrollTopReadBack = dom.scroller.scrollTop
    st.scrollTopReadBack = scrollTopReadBack
    dom.info.textContent =
      `scrollTop ${formatNumber(scrollTopReadBack)} | anchor ${st.anchor?.id ?? 'none'} | prevY ${formatNumber(st.anchor?.prevY ?? 0)} | item count ${st.itemState.items.length}`

    st.renderCount++
    st.scheduled = false
    st.events = []

    if (requestedScrollTop != null && scrollTopReadBack !== scrollTop) {
      scheduleRender()
    }
  })
}

function renderViewport(
  headers: LayoutHeader[],
  items: LayoutItem[],
  totalHeight: number,
  viewportWidth: number,
  viewportHeight: number,
  scrollTop: number,
) {
  const localInset = viewportWidth < 520 ? 10 : 14
  dom.display.textContent = ''
  dom.placeholder.style.height = `${totalHeight}px`

  for (const header of headers) {
    if (!isVisible(header.top, header.bottom, scrollTop, viewportHeight)) continue
    const node = getHeaderNode(header.day)
    node.style.top = `${header.top - scrollTop}px`
    node.style.left = `${localInset}px`
    node.style.width = `${Math.max(0, viewportWidth - localInset * 2)}px`
    dom.display.appendChild(node)
  }

  for (const item of items) {
    if (!isVisible(item.top, item.bottom, scrollTop, viewportHeight)) continue
    const node = getItemNode(item.id)
    node.style.top = `${item.top - scrollTop}px`
    node.style.left = `${localInset}px`
    node.style.width = `${Math.max(0, viewportWidth - localInset * 2)}px`
    node.style.height = `${ITEM_HEIGHT}px`
    node.style.background = item.color
    node.children[0]!.textContent = item.id
    node.children[1]!.textContent = item.label
    dom.display.appendChild(node)
  }
}

function getHeaderNode(day: Day) {
  let node = st.domCache.headers.get(day)
  if (node != null) return node

  node = document.createElement('div')
  node.style.position = 'absolute'
  node.style.height = '24px'
  node.style.display = 'flex'
  node.style.alignItems = 'center'
  node.style.padding = '0 10px'
  node.style.border = '1px solid rgba(148, 163, 184, 0.28)'
  node.style.borderRadius = '999px'
  node.style.background = 'rgba(15, 23, 42, 0.88)'
  node.style.color = '#93c5fd'
  node.style.fontSize = '12px'
  node.style.letterSpacing = '0.08em'
  node.style.textTransform = 'uppercase'
  node.textContent = day

  st.domCache.headers.set(day, node)
  return node
}

function getItemNode(id: string) {
  let node = st.domCache.items.get(id)
  if (node != null) return node

  node = document.createElement('div')
  node.style.position = 'absolute'
  node.style.borderRadius = '16px'
  node.style.border = '1px solid rgba(255, 255, 255, 0.18)'
  node.style.boxShadow = '0 14px 36px rgba(0, 0, 0, 0.28)'
  node.style.display = 'flex'
  node.style.alignItems = 'center'
  node.style.justifyContent = 'space-between'
  node.style.padding = '0 18px'
  node.style.color = 'white'
  node.style.fontSize = '24px'
  node.style.fontWeight = '700'

  const idLabel = document.createElement('div')
  idLabel.style.fontSize = '14px'
  idLabel.style.opacity = '0.82'

  const itemLabel = document.createElement('div')

  node.append(idLabel, itemLabel)
  st.domCache.items.set(id, node)
  return node
}

function isVisible(top: number, bottom: number, scrollTop: number, viewportHeight: number) {
  const localTop = top - scrollTop
  const localBottom = bottom - scrollTop
  return localTop <= viewportHeight && localBottom >= 0
}

function makeDom() {
  const app = document.createElement('div')
  app.style.minHeight = '100vh'
  app.style.display = 'flex'
  app.style.alignItems = 'center'
  app.style.justifyContent = 'center'
  app.style.padding = '16px'

  const frame = document.createElement('div')
  frame.style.width = 'min(960px, 100%)'
  frame.style.height = 'min(860px, calc(100vh - 32px))'
  frame.style.display = 'grid'
  frame.style.gridTemplateRows = 'auto minmax(320px, 1fr) auto'
  frame.style.gap = '14px'
  frame.style.padding = '18px'
  frame.style.border = '1px solid rgba(148, 163, 184, 0.22)'
  frame.style.borderRadius = '24px'
  frame.style.background = 'rgba(10, 14, 22, 0.88)'
  frame.style.boxShadow = '0 24px 80px rgba(0, 0, 0, 0.36)'

  const controls = document.createElement('div')
  controls.style.display = 'flex'
  controls.style.flexWrap = 'wrap'
  controls.style.gap = '10px'

  const scrollToButton = makeButton('Scroll to 700')
  const addThreeButton = makeButton('Add 3 above')
  const addRapidButton = makeButton('Add 1, then 2 rapid')
  controls.append(scrollToButton, addThreeButton, addRapidButton)

  const viewport = document.createElement('div')
  viewport.style.position = 'relative'
  viewport.style.minHeight = '320px'
  viewport.style.height = 'min(560px, 100%)'
  viewport.style.borderRadius = '22px'
  viewport.style.border = '1px solid rgba(148, 163, 184, 0.2)'
  viewport.style.background = 'rgba(5, 8, 14, 0.98)'
  viewport.style.overflow = 'hidden'

  const scroller = document.createElement('div')
  scroller.style.position = 'absolute'
  scroller.style.inset = '0'
  scroller.style.overflowY = 'auto'
  scroller.style.scrollBehavior = 'auto'
  scroller.style.scrollbarColor = '#334155 #0f172a'
  const placeholder = document.createElement('div')
  scroller.appendChild(placeholder)

  const display = document.createElement('div')
  display.style.position = 'absolute'
  display.style.inset = '0'
  display.style.pointerEvents = 'none'
  display.style.overflow = 'hidden'

  const referenceLine = document.createElement('div')
  referenceLine.style.position = 'absolute'
  referenceLine.style.left = '0'
  referenceLine.style.right = '0'
  referenceLine.style.top = '50%'
  referenceLine.style.borderTop = '1px solid rgba(248, 250, 252, 0.95)'
  referenceLine.style.boxShadow = '0 0 0 1px rgba(248, 250, 252, 0.18)'
  referenceLine.style.pointerEvents = 'none'

  const info = document.createElement('div')
  info.style.minHeight = '20px'
  info.style.fontSize = '13px'
  info.style.color = '#cbd5e1'

  viewport.append(scroller, display, referenceLine)
  frame.append(controls, viewport, info)
  app.appendChild(frame)

  return {
    app,
    scrollToButton,
    addThreeButton,
    addRapidButton,
    viewport,
    scroller,
    placeholder,
    display,
    info,
  }
}

function makeButton(label: string) {
  const button = document.createElement('button')
  button.type = 'button'
  button.textContent = label
  button.style.border = '1px solid rgba(125, 211, 252, 0.35)'
  button.style.borderRadius = '999px'
  button.style.padding = '10px 14px'
  button.style.background = 'linear-gradient(180deg, rgba(15, 23, 42, 0.95), rgba(12, 18, 31, 0.95))'
  button.style.color = '#f8fafc'
  button.style.cursor = 'pointer'
  return button
}

function formatNumber(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
}

function getSnapshot(): Snapshot {
  const layout = buildLayout(st.itemState.items)
  const scrollTop = dom.scroller.scrollTop
  const referenceItem = findItemAtReferenceLine(layout.items, scrollTop, dom.viewport.clientHeight)
  return {
    anchorId: st.anchor?.id ?? null,
    referenceItemId: referenceItem?.id ?? null,
    scrollTop,
  }
}

function nextFrame() {
  return new Promise<void>(resolvePromise => {
    requestAnimationFrame(() => resolvePromise())
  })
}

async function waitForSettledRender() {
  let lastRenderCount = -1
  let stableFrames = 0
  const deadline = performance.now() + 5_000

  while (performance.now() < deadline) {
    await nextFrame()
    if (!st.scheduled && st.renderCount === lastRenderCount) stableFrames++
    else stableFrames = 0
    lastRenderCount = st.renderCount
    if (stableFrames >= 2) return
  }

  throw new Error('Timed out waiting for the page to settle')
}

async function runScenario() {
  if (scenario === '' || requestId === '') return

  try {
    await waitForSettledRender()
    publishReport({phase: 'running', requestId, scenario})

    switch (scenario) {
      case 'scroll-to-700-add-3-above': {
        st.events.push({kind: 'scrollTo', top: TARGET_SCROLL_TOP})
        scheduleRender()
        await waitForSettledRender()

        const before = getSnapshot()
        st.events.push({kind: 'prependAbove', count: 3})
        scheduleRender()
        await waitForSettledRender()
        const after = getSnapshot()

        publishReport({
          phase: 'ready',
          requestId,
          scenario,
          itemCount: st.itemState.items.length,
          anchorId: before.anchorId,
          referenceItemBeforeId: before.referenceItemId,
          referenceItemAfterId: after.referenceItemId,
          scrollTopBefore: before.scrollTop,
          scrollTopAfter: after.scrollTop,
        })
        break
      }

      case 'add-1-then-2-rapid-merged': {
        st.events.push({kind: 'scrollTo', top: TARGET_SCROLL_TOP})
        scheduleRender()
        await waitForSettledRender()
        const before = getSnapshot()

        st.events.push({kind: 'prependAbove', count: 1})
        st.events.push({kind: 'prependAbove', count: 2})
        scheduleRender()
        await waitForSettledRender()
        const after = getSnapshot()

        publishReport({
          phase: 'ready',
          requestId,
          scenario,
          itemCount: st.itemState.items.length,
          referenceItemBeforeId: before.referenceItemId,
          referenceItemAfterId: after.referenceItemId,
          scrollTopBefore: before.scrollTop,
          scrollTopAfter: after.scrollTop,
        })
        break
      }

      case 'add-1-then-2-rapid-split': {
        st.events.push({kind: 'scrollTo', top: TARGET_SCROLL_TOP})
        scheduleRender()
        await waitForSettledRender()
        const before = getSnapshot()

        st.events.push({kind: 'prependAbove', count: 1})
        scheduleRender()
        await waitForSettledRender()

        st.events.push({kind: 'prependAbove', count: 2})
        scheduleRender()
        await waitForSettledRender()
        const after = getSnapshot()

        publishReport({
          phase: 'ready',
          requestId,
          scenario,
          itemCount: st.itemState.items.length,
          referenceItemBeforeId: before.referenceItemId,
          referenceItemAfterId: after.referenceItemId,
          scrollTopBefore: before.scrollTop,
          scrollTopAfter: after.scrollTop,
        })
        break
      }

      case 'user-scroll-then-prepend': {
        dom.scroller.scrollTop = 860
        scheduleRender()
        await waitForSettledRender()
        const before = getSnapshot()

        st.events.push({kind: 'prependAbove', count: 3})
        scheduleRender()
        await waitForSettledRender()
        const after = getSnapshot()

        publishReport({
          phase: 'ready',
          requestId,
          scenario,
          itemCount: st.itemState.items.length,
          anchorBeforePrependId: before.anchorId,
          referenceItemBeforeId: before.referenceItemId,
          referenceItemAfterId: after.referenceItemId,
          scrollTopBefore: before.scrollTop,
          scrollTopAfter: after.scrollTop,
        })
        break
      }

      default:
        throw new Error(`Unknown scenario ${scenario}`)
    }
  } catch (error) {
    publishReport({
      phase: 'error',
      requestId,
      scenario,
      message: error instanceof Error ? error.message : String(error),
    })
  }
}
