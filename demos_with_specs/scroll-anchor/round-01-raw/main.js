import {
  TARGET_SCROLL,
  VIEWPORT_HEIGHT,
  adjustAnchorScrollTop,
  buildInitialItems,
  buildLayout,
  findItemAtY,
  pickAnchor,
  prependItems,
} from './model.js'

const scenario = new URLSearchParams(window.location.search).get('scenario') ?? ''
const requestId = new URLSearchParams(window.location.search).get('requestId') ?? ''

/** @type {HTMLButtonElement} */
const scrollButton = document.querySelector('[data-action="scroll-700"]')
/** @type {HTMLButtonElement} */
const addThreeButton = document.querySelector('[data-action="add-3"]')
/** @type {HTMLButtonElement} */
const rapidButton = document.querySelector('[data-action="rapid-add"]')
/** @type {HTMLDivElement} */
const scroller = document.querySelector('[data-role="scroller"]')
/** @type {HTMLDivElement} */
const content = document.querySelector('[data-role="content"]')
/** @type {HTMLDivElement} */
const info = document.querySelector('[data-role="info"]')

const state = {
  items: buildInitialItems(),
  storedScrollTop: Number.NaN,
  anchor: /** @type {{id: string, prevY: number} | null} */ (null),
  queued: false,
  pendingScrollTop: /** @type {number | null} */ (null),
}

publishReport({phase: 'loading', requestId, scenario})

scrollButton.addEventListener('click', () => {
  state.pendingScrollTop = TARGET_SCROLL
  queueRender()
})

addThreeButton.addEventListener('click', () => {
  state.items = prependItems(state.items, 3)
  queueRender()
})

rapidButton.addEventListener('click', () => {
  state.items = prependItems(state.items, 1)
  queueRender()
  window.setTimeout(() => {
    state.items = prependItems(state.items, 2)
    queueRender()
  }, 24)
})

scroller.addEventListener('scroll', () => {
  if (scroller.scrollTop !== state.storedScrollTop) {
    queueRender()
  }
})

queueRender()
if (scenario) {
  window.setTimeout(() => {
    void runScenario(scenario)
  }, 0)
}

function queueRender() {
  if (state.queued) {
    return
  }

  state.queued = true
  window.requestAnimationFrame(render)
}

function render() {
  state.queued = false

  const scrollTop = scroller.scrollTop
  const pendingScrollTop = state.pendingScrollTop
  const effectiveScrollTop = pendingScrollTop ?? scrollTop
  const userScrolled =
    pendingScrollTop !== null || scrollTop !== state.storedScrollTop
  const layout = buildLayout(state.items)

  if (userScrolled || state.anchor === null) {
    state.anchor = pickAnchor(layout.items, effectiveScrollTop)
  }

  let renderScrollTop = effectiveScrollTop
  if (!userScrolled) {
    renderScrollTop = adjustAnchorScrollTop(scrollTop, state.anchor, layout.items)
  }

  renderVisibleLayout(layout, renderScrollTop)

  if (renderScrollTop !== scrollTop) {
    scroller.scrollTo({top: renderScrollTop, behavior: 'instant'})
  }

  state.pendingScrollTop = null
  state.storedScrollTop = scroller.scrollTop
  updateInfo()
}

/**
 * @param {ReturnType<typeof buildLayout>} layout
 * @param {number} renderScrollTop
 */
function renderVisibleLayout(layout, renderScrollTop) {
  const viewportHeight = scroller.clientHeight
  const minY = Math.max(0, renderScrollTop - 80)
  const maxY = renderScrollTop + viewportHeight + 80
  const nodes = []

  content.style.height = `${layout.totalHeight}px`

  for (const header of layout.headers) {
    if (header.y + 24 < minY || header.y > maxY) {
      continue
    }

    const node = document.createElement('div')
    node.className = 'day-header'
    node.style.top = `${header.y}px`
    node.textContent = header.day
    nodes.push(node)
  }

  for (const item of layout.items) {
    if (item.y + 100 < minY || item.y > maxY) {
      continue
    }

    const node = document.createElement('div')
    node.className = 'card'
    node.style.top = `${item.y}px`
    node.style.background = item.color
    node.dataset.itemId = item.id
    node.innerHTML = `<span class="card-label">${item.label}</span><span class="card-day">${item.day}</span>`
    nodes.push(node)
  }

  content.replaceChildren(...nodes)
}

function updateInfo() {
  const anchorText = state.anchor ? state.anchor.id : 'none'
  const prevYText = state.anchor ? String(state.anchor.prevY) : 'none'
  info.textContent = `scrollTop ${formatNumber(state.storedScrollTop)} | anchor ${anchorText} | prevY ${prevYText} | items ${state.items.length}`
}

/**
 * @param {string} name
 */
async function runScenario(name) {
  publishReport({phase: 'running', requestId, scenario: name})

  try {
    const report = await runNamedScenario(name)
    publishReport({
      phase: 'ready',
      requestId,
      scenario: name,
      beforeItemId: report.beforeItemId,
      afterItemId: report.afterItemId,
      anchorId: report.anchorId,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    publishReport({phase: 'error', requestId, scenario: name, message})
  }
}

/**
 * @param {string} name
 * @returns {Promise<{beforeItemId: string | null, afterItemId: string | null, anchorId: string | null}>}
 */
async function runNamedScenario(name) {
  await waitForFrames(2)

  if (name === 'scroll-to-700-add-3-above') {
    scrollButton.click()
    await waitForFrames(2)
    const beforeItemId = getReferenceItemId()
    addThreeButton.click()
    await waitForFrames(2)
    return {
      beforeItemId,
      afterItemId: getReferenceItemId(),
      anchorId: state.anchor?.id ?? null,
    }
  }

  if (name === 'add-1-then-2-rapid') {
    scroller.scrollTop = 400
    await waitForFrames(2)
    const beforeItemId = getReferenceItemId()
    rapidButton.click()
    await waitForFrames(4)
    return {
      beforeItemId,
      afterItemId: getReferenceItemId(),
      anchorId: state.anchor?.id ?? null,
    }
  }

  if (name === 'user-scroll-then-prepend') {
    scroller.scrollTop = 1300
    await waitForFrames(2)
    const beforeItemId = getReferenceItemId()
    addThreeButton.click()
    await waitForFrames(2)
    return {
      beforeItemId,
      afterItemId: getReferenceItemId(),
      anchorId: state.anchor?.id ?? null,
    }
  }

  throw new Error(`Unknown scenario: ${name}`)
}

function getReferenceItemId() {
  const layout = buildLayout(state.items)
  const referenceY = scroller.scrollTop + scroller.clientHeight / 2
  return findItemAtY(layout.items, referenceY)?.id ?? null
}

/**
 * @param {number} frameCount
 */
function waitForFrames(frameCount) {
  return new Promise((resolve) => {
    let remaining = frameCount
    function step() {
      remaining -= 1
      if (remaining <= 0) {
        resolve(undefined)
        return
      }
      window.requestAnimationFrame(step)
    }
    window.requestAnimationFrame(step)
  })
}

/**
 * @param {number} value
 */
function formatNumber(value) {
  return Number.isFinite(value) ? value.toFixed(1) : 'pending'
}

/**
 * @param {{
 *   phase: 'loading' | 'running' | 'ready' | 'error'
 *   requestId: string
 *   scenario: string
 *   beforeItemId?: string | null
 *   afterItemId?: string | null
 *   anchorId?: string | null
 *   message?: string
 * }} report
 */
function publishReport(report) {
  if (!requestId && !scenario) {
    return
  }

  const encoded = encodeURIComponent(JSON.stringify(report))
  window.location.hash = `report=${encoded}`
}
