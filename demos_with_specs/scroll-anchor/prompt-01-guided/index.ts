import {
  HEADER_HEIGHT,
  TARGET_SCROLL_TOP,
  applyAnchorDelta,
  createInitialItems,
  createLayout,
  findReferenceItem,
  pickAnchor,
  prependItemsAbove,
  type Day,
  type Item,
  type Layout,
  type ScrollAnchor,
} from './model.ts'

type Report = {
  phase: 'loading' | 'running' | 'ready' | 'error'
  requestId: string
  scenario: string
  referenceItemIdBefore?: string | null
  referenceItemIdAfter?: string | null
  expectedAnchorIdAfterUserScroll?: string | null
  anchorIdAfterUserScroll?: string | null
  mountedItemCount?: number
  totalItemCount?: number
  message?: string
}

type Snapshot = {
  anchorId: string | null
  anchorPrevY: number | null
  mountedItemCount: number
  referenceItemId: string | null
  scrollTop: number
  totalItemCount: number
}

const params = new URLSearchParams(location.search)
const scenario = params.get('scenario') ?? ''
const requestId = params.get('requestId') ?? ''

const view = makeView()
document.body.append(view.root)

const domCache = {
  headers: new Map<Day, HTMLDivElement>(),
  items: new Map<string, HTMLDivElement>(),
}

const initialItems = createInitialItems()
const st = {
  items: initialItems,
  nextItemNumber: initialItems.length + 1,
  anchor: null as ScrollAnchor | null,
  scrollTopReadback: 0,
  events: {
    scrollTo: null as number | null,
    prependAbove: 0,
  },
  pendingRapidTimers: 0,
  renderRevision: 0,
  lastLayout: createLayout(initialItems),
  lastSnapshot: {
    anchorId: null,
    anchorPrevY: null,
    mountedItemCount: 0,
    referenceItemId: null,
    scrollTop: 0,
    totalItemCount: initialItems.length,
  } satisfies Snapshot,
}

let scheduled = false

window.addEventListener('resize', () => { scheduleRender() })
view.scroller.addEventListener('scroll', () => { scheduleRender() })
view.scrollToButton.addEventListener('click', () => {
  requestScrollTo(TARGET_SCROLL_TOP)
})
view.addThreeButton.addEventListener('click', () => {
  requestPrependAbove(3)
})
view.rapidButton.addEventListener('click', () => {
  requestRapidPrepend()
})

publishReport({phase: 'loading', requestId, scenario})
scheduleRender()
if (scenario !== '' && requestId !== '') void runScenario()
function scheduleRender() {
  if (scheduled) return
  scheduled = true

  requestAnimationFrame(function render() {
    let anchorNext = st.anchor
    let adjustedScrollTop = 0

    const scrollTop = view.scroller.scrollTop
    const requestedScrollTop = st.events.scrollTo
    const viewportWidth = Math.min(760, Math.max(320, window.innerWidth - 48))
    const viewportHeight = Math.min(560, Math.max(320, window.innerHeight - 176))
    const pagePadding = 24
    const shellTop = 88
    const shellLeft = (window.innerWidth - viewportWidth) / 2
    const referenceLineTop = viewportHeight / 2
    const scrollPositionForAnchor = requestedScrollTop ?? scrollTop
    const scrollChanged = requestedScrollTop != null || scrollTop !== st.scrollTopReadback

    if (st.events.prependAbove > 0) {
      const prepended = prependItemsAbove(st.items, st.nextItemNumber, st.events.prependAbove)
      st.items = prepended.items
      st.nextItemNumber = prepended.nextItemNumber
    }

    const layout = createLayout(st.items)
    st.lastLayout = layout

    adjustedScrollTop = scrollPositionForAnchor
    let pickedAnchor = false
    let lastItemAnchor: ScrollAnchor | null = null

    for (const entry of layout.entries) {
      if (entry.kind !== 'item') continue

      lastItemAnchor = {
        id: entry.item.id,
        prevY: entry.top,
      }

      if (scrollChanged) {
        if (!pickedAnchor && entry.top >= scrollPositionForAnchor) {
          anchorNext = {
            id: entry.item.id,
            prevY: entry.top,
          }
          pickedAnchor = true
        }
      } else if (anchorNext != null && entry.item.id === anchorNext.id) {
        const adjusted = applyAnchorDelta(scrollTop, anchorNext, entry.top)
        adjustedScrollTop = adjusted.adjustedScrollTop
        anchorNext = adjusted.anchor
      }
    }

    if (scrollChanged && !pickedAnchor) anchorNext = lastItemAnchor

    // arena-style wipe: bulk-detach all children, re-append only the visible nodes below
    view.display.textContent = ''

    view.root.style.padding = `${pagePadding}px`
    view.controls.style.left = `${shellLeft}px`
    view.controls.style.width = `${viewportWidth}px`
    view.shell.style.left = `${shellLeft}px`
    view.shell.style.top = `${shellTop}px`
    view.shell.style.width = `${viewportWidth}px`
    view.shell.style.height = `${viewportHeight}px`
    view.referenceLine.style.top = `${referenceLineTop}px`
    view.referenceLabel.style.top = `${referenceLineTop - 11}px`
    view.info.style.left = `${shellLeft}px`
    view.info.style.top = `${shellTop + viewportHeight + 14}px`
    view.info.style.width = `${viewportWidth}px`

    view.placeholder.style.height = `${layout.totalHeight}px`

    let mountedItemCount = 0

    for (const entry of layout.entries) {
      const localTop = entry.top - adjustedScrollTop
      const localBottom = localTop + entry.height
      if (localBottom < 0 || localTop > viewportHeight) continue

      if (entry.kind === 'header') {
        let header = domCache.headers.get(entry.day)
        if (header == null) {
          header = document.createElement('div')
          header.style.position = 'absolute'
          header.style.left = '18px'
          header.style.right = '18px'
          header.style.height = `${HEADER_HEIGHT}px`
          header.style.display = 'flex'
          header.style.alignItems = 'center'
          header.style.fontSize = '12px'
          header.style.letterSpacing = '0.12em'
          header.style.textTransform = 'uppercase'
          header.style.color = '#7f96b0'
          domCache.headers.set(entry.day, header)
        }

        header.textContent = entry.day
        header.style.top = `${localTop}px`
        view.display.append(header)
      } else {
        mountedItemCount++

        let item = domCache.items.get(entry.item.id)
        if (item == null) {
          item = document.createElement('div')
          item.dataset.itemId = entry.item.id
          item.style.position = 'absolute'
          item.style.left = '18px'
          item.style.right = '18px'
          item.style.height = '100px'
          item.style.borderRadius = '16px'
          item.style.border = '1px solid rgba(255, 255, 255, 0.08)'
          item.style.boxShadow = '0 20px 40px rgba(0, 0, 0, 0.18)'
          item.style.display = 'flex'
          item.style.alignItems = 'center'
          item.style.justifyContent = 'space-between'
          item.style.padding = '0 18px'
          item.style.fontSize = '18px'

          const left = document.createElement('div')
          left.style.display = 'flex'
          left.style.flexDirection = 'column'
          left.style.gap = '6px'

          const id = document.createElement('div')
          id.dataset.role = 'id'
          id.style.fontSize = '16px'

          const label = document.createElement('div')
          label.dataset.role = 'label'
          label.style.fontSize = '24px'
          label.style.fontWeight = '700'

          left.append(id, label)

          const right = document.createElement('div')
          right.dataset.role = 'day'
          right.style.fontSize = '13px'
          right.style.opacity = '0.78'

          item.append(left, right)
          domCache.items.set(entry.item.id, item)
        }

        item.style.top = `${localTop}px`
        item.style.background = `linear-gradient(135deg, ${entry.item.color} 0%, rgba(255, 255, 255, 0.06) 100%)`
        ;(item.querySelector('[data-role="id"]') as HTMLDivElement).textContent = entry.item.id
        ;(item.querySelector('[data-role="label"]') as HTMLDivElement).textContent = entry.item.label
        ;(item.querySelector('[data-role="day"]') as HTMLDivElement).textContent = entry.item.day
        view.display.append(item)
      }
    }

    const referenceItem = findReferenceItem(layout.entries, adjustedScrollTop, viewportHeight)
    st.lastSnapshot = {
      anchorId: anchorNext?.id ?? null,
      anchorPrevY: anchorNext?.prevY ?? null,
      mountedItemCount,
      referenceItemId: referenceItem?.item.id ?? null,
      scrollTop: adjustedScrollTop,
      totalItemCount: st.items.length,
    }
    st.anchor = anchorNext
    view.info.textContent =
      `scrollTop ${formatNumber(adjustedScrollTop)} | anchor ${anchorNext?.id ?? '-'} | prevY ${anchorNext == null ? '-' : formatNumber(anchorNext.prevY)} | item count ${st.items.length}`

    scheduled = false
    st.events.prependAbove = 0
    st.events.scrollTo = null

    if (Math.abs(adjustedScrollTop - scrollTop) > 0.01) {
      view.scroller.scrollTo({top: adjustedScrollTop, behavior: 'instant' as ScrollBehavior})
    }

    st.scrollTopReadback = view.scroller.scrollTop
    st.renderRevision++
  })
}

function requestScrollTo(top: number) {
  st.events.scrollTo = top
  scheduleRender()
}

function requestPrependAbove(count: number) {
  st.events.prependAbove += count
  scheduleRender()
}

function requestRapidPrepend() {
  requestPrependAbove(1)
  st.pendingRapidTimers++
  setTimeout(() => {
    st.pendingRapidTimers--
    requestPrependAbove(2)
  }, 0)
}

async function runScenario() {
  publishReport({phase: 'running', requestId, scenario})

  try {
    await waitForIdle()

    switch (scenario) {
      case 'scroll-to-700-add-3-above': {
        await scrollToAndWait(TARGET_SCROLL_TOP)
        const before = snapshot()
        requestPrependAbove(3)
        await waitUntil(() => snapshot().totalItemCount === before.totalItemCount + 3)
        await waitForIdle()
        const after = snapshot()
        publishReport({
          phase: 'ready',
          requestId,
          scenario,
          referenceItemIdBefore: before.referenceItemId,
          referenceItemIdAfter: after.referenceItemId,
          mountedItemCount: after.mountedItemCount,
          totalItemCount: after.totalItemCount,
        })
        return
      }

      case 'scroll-to-700-add-1-then-2-rapid': {
        await scrollToAndWait(TARGET_SCROLL_TOP)
        const before = snapshot()
        requestRapidPrepend()
        await waitUntil(() => snapshot().totalItemCount === before.totalItemCount + 3)
        await waitForIdle()
        const after = snapshot()
        publishReport({
          phase: 'ready',
          requestId,
          scenario,
          referenceItemIdBefore: before.referenceItemId,
          referenceItemIdAfter: after.referenceItemId,
          mountedItemCount: after.mountedItemCount,
          totalItemCount: after.totalItemCount,
        })
        return
      }

      case 'user-scroll-then-prepend': {
        await scrollToAndWait(TARGET_SCROLL_TOP)
        await userScrollToAndWait(1060)
        const expectedAnchorIdAfterUserScroll = pickAnchor(st.lastLayout.entries, 1060)?.id ?? null
        const before = snapshot()
        requestPrependAbove(3)
        await waitUntil(() => snapshot().totalItemCount === before.totalItemCount + 3)
        await waitForIdle()
        const after = snapshot()
        publishReport({
          phase: 'ready',
          requestId,
          scenario,
          referenceItemIdBefore: before.referenceItemId,
          referenceItemIdAfter: after.referenceItemId,
          expectedAnchorIdAfterUserScroll,
          anchorIdAfterUserScroll: before.anchorId,
          mountedItemCount: after.mountedItemCount,
          totalItemCount: after.totalItemCount,
        })
        return
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

async function scrollToAndWait(top: number) {
  requestScrollTo(top)
  await waitUntil(() => Math.abs(snapshot().scrollTop - top) < 0.01)
  await waitForIdle()
}

async function userScrollToAndWait(top: number) {
  view.scroller.scrollTop = top
  scheduleRender()
  await waitUntil(() => Math.abs(st.scrollTopReadback - top) < 0.01 && snapshot().anchorId === 'V10')
  await waitForIdle()
}

async function waitForIdle() {
  const startedAt = performance.now()
  let stableFrames = 0
  let revision = st.renderRevision

  while (performance.now() - startedAt < 2_000) {
    await nextFrame()
    if (!scheduled && st.pendingRapidTimers === 0 && st.renderRevision === revision) stableFrames++
    else stableFrames = 0
    revision = st.renderRevision
    if (stableFrames >= 2) return
  }

  throw new Error('Scenario never became idle')
}

async function waitUntil(predicate: () => boolean) {
  const startedAt = performance.now()

  while (performance.now() - startedAt < 2_000) {
    if (predicate()) return
    await nextFrame()
  }

  throw new Error('Scenario predicate never became true')
}

function nextFrame() {
  return new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
}

function snapshot() {
  return st.lastSnapshot
}

function publishReport(report: Report) {
  const node = document.getElementById('__report')
  if (node != null) node.textContent = JSON.stringify(report)
}

function formatNumber(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2)
}

function makeView() {
  const controls = document.createElement('div')
  controls.style.position = 'absolute'
  controls.style.top = '24px'
  controls.style.display = 'flex'
  controls.style.gap = '12px'
  controls.style.alignItems = 'center'

  const title = document.createElement('div')
  title.textContent = 'scroll anchor'
  title.style.marginRight = 'auto'
  title.style.fontSize = '13px'
  title.style.letterSpacing = '0.08em'
  title.style.textTransform = 'uppercase'
  title.style.color = '#90a8c2'

  const scrollToButton = document.createElement('button')
  scrollToButton.textContent = 'Scroll to 700'

  const addThreeButton = document.createElement('button')
  addThreeButton.textContent = 'Add 3 above'

  const rapidButton = document.createElement('button')
  rapidButton.textContent = 'Add 1, then 2 rapid'

  controls.append(title, scrollToButton, addThreeButton, rapidButton)

  const placeholder = document.createElement('div')

  const scroller = document.createElement('div')
  scroller.style.position = 'absolute'
  scroller.style.inset = '0'
  scroller.style.overflowY = 'scroll'
  scroller.style.overflowX = 'hidden'
  scroller.append(placeholder)

  const display = document.createElement('div')
  display.style.position = 'absolute'
  display.style.inset = '0'
  display.style.overflow = 'hidden'
  display.style.pointerEvents = 'none'

  const referenceLine = document.createElement('div')
  referenceLine.style.position = 'absolute'
  referenceLine.style.left = '0'
  referenceLine.style.right = '0'
  referenceLine.style.height = '1px'
  referenceLine.style.background = 'rgba(228, 236, 245, 0.7)'
  referenceLine.style.pointerEvents = 'none'

  const referenceLabel = document.createElement('div')
  referenceLabel.textContent = 'reference line'
  referenceLabel.style.position = 'absolute'
  referenceLabel.style.right = '12px'
  referenceLabel.style.fontSize = '11px'
  referenceLabel.style.color = '#95abc4'
  referenceLabel.style.background = 'rgba(6, 9, 13, 0.86)'
  referenceLabel.style.padding = '2px 6px'
  referenceLabel.style.borderRadius = '999px'
  referenceLabel.style.pointerEvents = 'none'

  const shell = document.createElement('div')
  shell.style.position = 'absolute'
  shell.style.border = '1px solid rgba(142, 168, 194, 0.18)'
  shell.style.borderRadius = '22px'
  shell.style.background = 'rgba(10, 18, 26, 0.82)'
  shell.style.boxShadow = '0 30px 80px rgba(0, 0, 0, 0.38)'
  shell.style.overflow = 'hidden'
  shell.append(scroller, display, referenceLine, referenceLabel)

  const info = document.createElement('div')
  info.style.position = 'absolute'
  info.style.fontSize = '12px'
  info.style.color = '#96afc8'

  const root = document.createElement('div')
  root.style.position = 'relative'
  root.style.width = '100%'
  root.style.height = '100%'
  root.append(controls, shell, info)

  return {
    root,
    controls,
    scrollToButton,
    addThreeButton,
    rapidButton,
    shell,
    scroller,
    placeholder,
    display,
    referenceLine,
    referenceLabel,
    info,
  }
}
