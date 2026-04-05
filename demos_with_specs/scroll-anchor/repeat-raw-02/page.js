import {
  SCROLLER_HEIGHT,
  TARGET_SCROLL_TOP,
  computeLayout,
  computeRenderPlan,
  createInitialState,
  findReferenceItem,
  getVisibleEntries,
  pickAnchor,
  prependItems,
} from './logic.js'

const params = new URLSearchParams(location.search)
const scenario = params.get('scenario') ?? ''
const requestId = params.get('requestId') ?? ''

const scroller = document.querySelector('#scroller')
const content = document.querySelector('#content')
const info = document.querySelector('#info')
const scrollButton = document.querySelector('#scroll-700')
const addThreeButton = document.querySelector('#add-three')
const rapidButton = document.querySelector('#add-rapid')

let dataState = createInitialState()
let scrollAnchor = null
let storedScrollTop = 0
let forceAnchorRepick = false
let renderQueued = false
let latestLayout = computeLayout(dataState.items)

publishReport({
  phase: 'loading',
  requestId,
  scenario,
})

scrollButton.addEventListener('click', () => {
  scrollToTop(TARGET_SCROLL_TOP)
})

addThreeButton.addEventListener('click', () => {
  addItemsAbove(3)
})

rapidButton.addEventListener('click', async () => {
  addItemsAbove(1)
  await Promise.resolve()
  addItemsAbove(2)
})

scroller.addEventListener('scroll', () => {
  if (scroller.scrollTop !== storedScrollTop) {
    scheduleRender()
  }
})

render()

queueMicrotask(() => {
  if (!scenario || !requestId) {
    return
  }
  runScenario().catch((error) => {
    publishReport({
      phase: 'error',
      requestId,
      scenario,
      message: error instanceof Error ? error.message : String(error),
    })
  })
})

function scheduleRender() {
  if (renderQueued) {
    return
  }
  renderQueued = true
  requestAnimationFrame(() => {
    renderQueued = false
    render()
  })
}

function render() {
  const scrollTop = scroller.scrollTop
  latestLayout = computeLayout(dataState.items)

  const plan = computeRenderPlan({
    layout: latestLayout,
    scrollTop,
    storedScrollTop,
    anchor: scrollAnchor,
    forceAnchorRepick,
  })

  scrollAnchor = plan.anchor
  forceAnchorRepick = false

  const viewportHeight = scroller.clientHeight || SCROLLER_HEIGHT
  const visibleEntries = getVisibleEntries(
    latestLayout,
    plan.adjustedScrollTop,
    viewportHeight,
  )

  content.style.height = `${latestLayout.totalHeight}px`
  content.replaceChildren(
    ...visibleEntries.headers.map(renderHeader),
    ...visibleEntries.items.map(renderItem),
  )

  if (Math.abs(plan.adjustedScrollTop - scrollTop) > 0.01) {
    scrollElementTo(plan.adjustedScrollTop)
  }

  storedScrollTop = scroller.scrollTop
  info.textContent = [
    `scrollTop ${formatNumber(storedScrollTop)}`,
    `anchor ${scrollAnchor?.id ?? 'none'}`,
    `prevY ${scrollAnchor ? formatNumber(scrollAnchor.prevY) : 'none'}`,
    `items ${dataState.items.length}`,
  ].join(' | ')
}

function renderHeader(header) {
  const element = document.createElement('div')
  element.className = 'header'
  element.textContent = header.day
  element.style.top = `${header.top}px`
  return element
}

function renderItem(item) {
  const element = document.createElement('div')
  element.className = 'item'
  element.dataset.itemId = item.id
  element.style.top = `${item.top}px`
  element.style.background = item.color
  element.innerHTML = `<span class="item-id">${item.id}</span><span class="item-label">${item.label}</span>`
  return element
}

function addItemsAbove(count) {
  dataState = prependItems(dataState, count)
  scheduleRender()
}

function scrollToTop(top) {
  forceAnchorRepick = true
  scrollElementTo(top)
  scheduleRender()
}

function scrollElementTo(top) {
  try {
    scroller.scrollTo({
      top,
      behavior: 'instant',
    })
  } catch {
    scroller.scrollTop = top
  }
}

async function runScenario() {
  publishReport({
    phase: 'running',
    requestId,
    scenario,
  })

  if (scenario === 'scroll-to-700-add-3-above') {
    await resetDemo()
    scrollToTop(TARGET_SCROLL_TOP)
    await settle()

    const before = captureSemantic()
    addItemsAbove(3)
    await settle()

    const after = captureSemantic()
    publishReport({
      phase: 'ready',
      requestId,
      scenario,
      beforeReferenceItemId: before.referenceItemId,
      afterReferenceItemId: after.referenceItemId,
    })
    return
  }

  if (scenario === 'rapid-prepend') {
    const variants = []

    await resetDemo()
    scrollToTop(TARGET_SCROLL_TOP)
    await settle()

    const sameFrameBefore = captureSemantic()
    addItemsAbove(1)
    addItemsAbove(2)
    await settle()
    const sameFrameAfter = captureSemantic()
    variants.push({
      mode: 'same-frame',
      beforeReferenceItemId: sameFrameBefore.referenceItemId,
      afterReferenceItemId: sameFrameAfter.referenceItemId,
    })

    await resetDemo()
    scrollToTop(TARGET_SCROLL_TOP)
    await settle()

    const splitFrameBefore = captureSemantic()
    addItemsAbove(1)
    await settle()
    addItemsAbove(2)
    await settle()
    const splitFrameAfter = captureSemantic()
    variants.push({
      mode: 'split-frame',
      beforeReferenceItemId: splitFrameBefore.referenceItemId,
      afterReferenceItemId: splitFrameAfter.referenceItemId,
    })

    publishReport({
      phase: 'ready',
      requestId,
      scenario,
      variants,
    })
    return
  }

  if (scenario === 'user-scroll-then-prepend') {
    await resetDemo()
    scrollToTop(TARGET_SCROLL_TOP)
    await settle()
    const anchorBeforeScrollId = scrollAnchor?.id ?? null

    scrollToTop(980)
    await settle()

    const before = captureSemantic()
    const anchorAfterScrollId = scrollAnchor?.id ?? null
    const expectedAnchorAfterScrollId =
      pickAnchor(latestLayout, storedScrollTop)?.id ?? null

    addItemsAbove(3)
    await settle()

    const after = captureSemantic()
    publishReport({
      phase: 'ready',
      requestId,
      scenario,
      beforeReferenceItemId: before.referenceItemId,
      afterReferenceItemId: after.referenceItemId,
      anchorBeforeScrollId,
      anchorAfterScrollId,
      expectedAnchorAfterScrollId,
    })
    return
  }

  publishReport({
    phase: 'error',
    requestId,
    scenario,
    message: `Unknown scenario: ${scenario}`,
  })
}

async function resetDemo() {
  dataState = createInitialState()
  scrollAnchor = null
  storedScrollTop = 0
  forceAnchorRepick = false
  scrollElementTo(0)
  scheduleRender()
  await settle()
}

function captureSemantic() {
  const viewportHeight = scroller.clientHeight || SCROLLER_HEIGHT
  const referenceItem = findReferenceItem(latestLayout, storedScrollTop, viewportHeight)

  return {
    referenceItemId: referenceItem?.id ?? null,
    anchorId: scrollAnchor?.id ?? null,
    prevY: scrollAnchor?.prevY ?? null,
    scrollTop: storedScrollTop,
  }
}

function publishReport(report) {
  location.hash = `report=${encodeURIComponent(JSON.stringify(report))}`
}

function formatNumber(value) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
}

function nextFrame() {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()))
}

async function settle() {
  await nextFrame()
  await nextFrame()
}
