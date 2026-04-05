import {
  INITIAL_ITEM_COUNT,
  SCROLL_TARGET,
  VIEWPORT_HEIGHT,
  buildInitialItems,
  buildLayout,
  collectVisibleEntries,
  findReferenceItem,
  prependItemsAbove,
  resolveScrollAnchor,
} from './model.js'

const params = new URLSearchParams(location.search)
const scenario = params.get('scenario') ?? ''
const requestId = params.get('requestId') ?? ''
const reportEnabled = scenario !== '' || requestId !== ''

const container = document.querySelector('#scroll-container')
const content = document.querySelector('#scroll-content')
const info = document.querySelector('#info')
const scrollButton = document.querySelector('#scroll-700')
const addAboveButton = document.querySelector('#add-3-above')
const addRapidButton = document.querySelector('#add-rapid')

const state = {
  items: buildInitialItems(),
  nextCounter: INITIAL_ITEM_COUNT,
  anchor: null,
  storedScrollTop: 0,
  explicitScrollTop: null,
  layout: null,
  renderQueued: false,
  renderPromise: Promise.resolve(),
  resolveRender: null,
}

scrollButton.addEventListener('click', () => {
  void scrollToTarget(SCROLL_TARGET)
})

addAboveButton.addEventListener('click', () => {
  void prependCount(3)
})

addRapidButton.addEventListener('click', () => {
  void addOneThenTwoRapid()
})

container.addEventListener('scroll', () => {
  if (container.scrollTop !== state.storedScrollTop) {
    void scheduleRender()
  }
})

publishReport({ phase: 'loading', requestId, scenario })
await scheduleRender()

if (scenario !== '') {
  void runScenario(scenario)
}

async function runScenario(currentScenario) {
  publishReport({ phase: 'running', requestId, scenario: currentScenario, step: 'start' })

  try {
    if (currentScenario === 'scroll-to-700-then-add-3-above') {
      await scrollToTarget(SCROLL_TARGET)
      const before = snapshot()
      publishReport({ phase: 'running', requestId, scenario: currentScenario, step: 'before-add-3', before })
      await prependCount(3)
      publishReport({ phase: 'ready', requestId, scenario: currentScenario, before, after: snapshot() })
      return
    }

    if (currentScenario === 'scroll-to-700-then-add-1-then-2-rapid') {
      await scrollToTarget(SCROLL_TARGET)
      const before = snapshot()
      publishReport({ phase: 'running', requestId, scenario: currentScenario, step: 'before-rapid', before })
      await addOneThenTwoRapid()
      publishReport({ phase: 'ready', requestId, scenario: currentScenario, before, after: snapshot() })
      return
    }

    if (currentScenario === 'user-scroll-then-prepend') {
      await scrollToTarget(SCROLL_TARGET)
      const afterProgrammaticScroll = snapshot()
      publishReport({
        phase: 'running',
        requestId,
        scenario: currentScenario,
        step: 'after-programmatic-scroll',
        afterProgrammaticScroll,
      })

      await simulateUserScroll(1_010)
      const before = snapshot()
      publishReport({
        phase: 'running',
        requestId,
        scenario: currentScenario,
        step: 'after-user-scroll',
        afterProgrammaticScroll,
        before,
      })

      await prependCount(3)
      publishReport({
        phase: 'ready',
        requestId,
        scenario: currentScenario,
        afterProgrammaticScroll,
        before,
        after: snapshot(),
      })
      return
    }

    throw new Error(`unknown scenario "${currentScenario}"`)
  } catch (error) {
    publishReport({
      phase: 'error',
      requestId,
      scenario: currentScenario,
      message: error instanceof Error ? error.message : String(error),
    })
  }
}

function snapshot() {
  const layout = state.layout ?? buildLayout(state.items)
  const referenceItem = findReferenceItem(layout, state.storedScrollTop, container.clientHeight)

  return {
    scrollTop: round(state.storedScrollTop),
    anchorId: state.anchor?.id ?? null,
    anchorPrevY: state.anchor == null ? null : round(state.anchor.prevY),
    referenceItemId: referenceItem?.id ?? null,
    mountedItemCount: content.querySelectorAll('.item').length,
    totalItemCount: layout.items.length,
  }
}

function publishReport(report) {
  if (!reportEnabled) {
    return
  }

  location.hash = `report=${encodeURIComponent(JSON.stringify(report))}`
}

function scheduleRender() {
  if (state.renderQueued) {
    return state.renderPromise
  }

  state.renderQueued = true
  state.renderPromise = new Promise((resolve) => {
    state.resolveRender = resolve
    requestAnimationFrame(() => {
      state.renderQueued = false
      render()
      const finish = state.resolveRender
      state.resolveRender = null
      finish?.()
    })
  })

  return state.renderPromise
}

function render() {
  const layout = buildLayout(state.items)
  const resolved = resolveScrollAnchor({
    layout,
    scrollTop: container.scrollTop,
    storedScrollTop: state.storedScrollTop,
    explicitScrollTop: state.explicitScrollTop,
    anchor: state.anchor,
  })

  state.layout = layout
  state.anchor = resolved.anchor
  state.explicitScrollTop = null

  const viewportHeight = container.clientHeight || VIEWPORT_HEIGHT
  const visible = collectVisibleEntries(layout, {
    scrollTop: resolved.adjustedScrollTop,
    viewportHeight,
    overscan: 120,
  })

  content.style.height = `${layout.totalHeight}px`
  renderVisibleEntries(visible)

  if (Math.abs(container.scrollTop - resolved.adjustedScrollTop) > 0.01) {
    container.scrollTo({
      top: resolved.adjustedScrollTop,
      behavior: 'instant',
    })
  }

  state.storedScrollTop = container.scrollTop
  info.textContent =
    `scrollTop ${round(state.storedScrollTop)} | ` +
    `anchor ${state.anchor?.id ?? 'none'} | ` +
    `prevY ${state.anchor == null ? 'none' : round(state.anchor.prevY)} | ` +
    `items ${state.items.length}`
}

function renderVisibleEntries(visible) {
  const fragment = document.createDocumentFragment()

  for (const header of visible.headers) {
    const node = document.createElement('div')
    node.className = 'header'
    node.textContent = header.day
    node.style.top = `${header.y}px`
    node.style.height = `${header.height}px`
    fragment.appendChild(node)
  }

  for (const item of visible.items) {
    const node = document.createElement('div')
    node.className = 'item'
    node.style.top = `${item.y}px`
    node.style.height = `${item.height}px`
    node.style.background = item.color

    const label = document.createElement('span')
    label.className = 'item-label'
    label.textContent = item.label

    const day = document.createElement('span')
    day.className = 'item-day'
    day.textContent = item.day

    node.append(label, day)
    fragment.appendChild(node)
  }

  content.replaceChildren(fragment)
}

function scrollToTarget(top) {
  state.explicitScrollTop = top
  return scheduleRender()
}

function prependCount(count) {
  const nextState = prependItemsAbove(state.items, state.nextCounter, count)
  state.items = nextState.items
  state.nextCounter = nextState.nextCounter
  return scheduleRender()
}

async function addOneThenTwoRapid() {
  prependCount(1)
  await Promise.resolve()
  return prependCount(2)
}

function simulateUserScroll(top) {
  container.scrollTop = top
  return scheduleRender()
}

function round(value) {
  return Math.round(value * 100) / 100
}
