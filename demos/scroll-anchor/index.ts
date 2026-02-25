// Layout constants (same as React repro)
const ITEM_HEIGHT = 100
const HEADER_HEIGHT = 24
const HEADER_GAP_FIRST = 0
const HEADER_GAP_REST = 32
const HEADER_GAP_BOTTOM = 8
const ITEM_GAP = 8
const TARGET_SCROLL = 700

const COLORS = [
  '#c0392b', '#2980b9', '#27ae60', '#8e44ad',
  '#d35400', '#16a085', '#2c3e50', '#f39c12',
]

// === State ===
type Item = {
  id: string
  day: string
  label: string
  color: string
}

type Anchor = {
  id: string
  prevY: number
}

let counter = 0
let items: Item[] = []
let anchor: Anchor | null = null
let storedScrollY = 0 // read-back value from last frame's scrollTo

const container = document.getElementById('container')!
const spacer = document.getElementById('spacer')!
const info = document.getElementById('info')!

// DOM node pool (reuse instead of recreate)
const domNodes: HTMLDivElement[] = []

function makeItem(day: string): Item {
  const n = counter++
  return { id: 'V' + n, day, label: '#' + n, color: COLORS[n % COLORS.length]! }
}

function makeInitialItems() {
  const result: Item[] = []
  for (let i = 0; i < 8; i++) result.push(makeItem('Today'))
  for (let i = 0; i < 1; i++) result.push(makeItem('Yesterday'))
  for (let i = 0; i < 8; i++) result.push(makeItem('2 Days Ago'))
  return result
}

// === Scheduler ===
let scheduled = false
function scheduleRender() {
  if (scheduled) return
  scheduled = true
  requestAnimationFrame(render)
}

// === Events ===
// All events just schedule a render. No state mutation, no flags.
container.addEventListener('scroll', scheduleRender)
window.addEventListener('resize', scheduleRender)

// === Render ===
function render() {
  scheduled = false

  // Step 1: Read DOM (batched reads, no writes yet)
  const currentScrollY = container.scrollTop

  // Step 2: Detect user scroll
  // If currentScrollY differs from what we stored last frame, something
  // external changed the scroll position. Pick a new anchor.
  const userScrolled = currentScrollY !== storedScrollY

  // Step 3: Compute layout
  let y = 0
  let adjustedScrollTop = currentScrollY
  let newAnchor: Anchor | null = null
  let isFirstSession = true
  let idx = 0
  // Track which DOM nodes we need
  let nodeIdx = 0

  while (idx < items.length) {
    const sessionDay = items[idx]!.day
    const gapTop = isFirstSession ? HEADER_GAP_FIRST : HEADER_GAP_REST
    const headerY = y + gapTop
    y += gapTop + HEADER_HEIGHT + HEADER_GAP_BOTTOM

    // Header
    const headerNode = getOrCreateNode(nodeIdx++, 'day-header')
    headerNode.style.top = headerY + 'px'
    headerNode.style.height = HEADER_HEIGHT + 'px'
    headerNode.textContent = sessionDay

    let firstInSession = true
    while (idx < items.length && items[idx]!.day === sessionDay) {
      const item = items[idx]!
      if (!firstInSession) y += ITEM_GAP
      firstInSession = false

      // Pick new anchor: first item below scrollTop
      if (userScrolled && newAnchor == null && y > currentScrollY) {
        newAnchor = { id: item.id, prevY: y }
      }

      // Anchor adjustment: compute scroll delta
      if (!userScrolled && anchor != null && item.id === anchor.id && currentScrollY > 40) {
        adjustedScrollTop = currentScrollY + (y - anchor.prevY)
        anchor.prevY = y
      }

      // Item
      const itemNode = getOrCreateNode(nodeIdx++, 'item')
      itemNode.style.top = y + 'px'
      itemNode.style.height = ITEM_HEIGHT + 'px'
      itemNode.style.background = item.color
      itemNode.textContent = item.label + ' \u2014 ' + item.day

      y += ITEM_HEIGHT
      idx++
    }
    isFirstSession = false
  }

  // Remove excess DOM nodes
  while (nodeIdx < domNodes.length) {
    const node = domNodes.pop()!
    node.remove()
  }

  // Update anchor
  if (userScrolled && newAnchor != null) {
    anchor = newAnchor
  }

  // Step 4: Write DOM (batched writes)
  spacer.style.height = y + 'px'

  if (adjustedScrollTop !== currentScrollY) {
    container.scrollTo({ top: adjustedScrollTop, behavior: 'instant' as ScrollBehavior })
    // Read back actual value after scrollTo. Do NOT store the requested
    // value — browser truncation (Chrome: 0.5, Safari/Firefox: integers)
    // would cause a false mismatch on the next frame, making us think
    // the user scrolled when they didn't. (Scrolling.md points 3-4)
    storedScrollY = container.scrollTop
  } else {
    storedScrollY = currentScrollY
  }

  // Update info
  info.textContent =
    'scrollTop: ' + Math.round(container.scrollTop) +
    ' | anchor: ' + (anchor != null ? anchor.id : 'none') +
    ' (prevY: ' + (anchor != null ? Math.round(anchor.prevY) : '-') + ')' +
    ' | items: ' + items.length
}

// === DOM node pool ===
function getOrCreateNode(idx: number, className: string) {
  if (idx < domNodes.length) {
    const node = domNodes[idx]!
    if (node.className !== className) node.className = className
    return node
  }
  const node = document.createElement('div')
  node.className = className
  spacer.appendChild(node)
  domNodes.push(node)
  return node
}

// === Actions ===
function scrollToTarget() {
  container.scrollTo({ top: TARGET_SCROLL, behavior: 'instant' as ScrollBehavior })
  // The scroll event fires and calls scheduleRender(). The next render
  // sees currentScrollY !== storedScrollY and picks a new anchor.
}

function addItemsAbove(n: number) {
  for (let i = 0; i < n; i++) items.unshift(makeItem('Today'))
  scheduleRender()
}

function addOneThenTwo() {
  // Two separate data changes in quick succession (simulates rapid async updates).
  // Whether they land in one render or two depends on timing — works
  // either way. If one render: sees all 3, adjusts once. If two
  // renders: each adjusts for its new items, prevY updated between.
  items.unshift(makeItem('Today'))
  scheduleRender()
  setTimeout(function() {
    items.unshift(makeItem('Today'), makeItem('Today'))
    scheduleRender()
  }, 0)
}

function resetAll() {
  counter = 0
  anchor = null
  items = makeInitialItems()
  // Scroll to 0 synchronously (spacer is still tall from last render)
  container.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior })
  storedScrollY = 0
  scheduleRender()
}

// === Button wiring (module scope, no inline onclick) ===
document.getElementById('btn-scroll')!.addEventListener('click', scrollToTarget)
document.getElementById('btn-add')!.addEventListener('click', () => addItemsAbove(3))
document.getElementById('btn-rapid')!.addEventListener('click', addOneThenTwo)
document.getElementById('btn-reset')!.addEventListener('click', resetAll)

// === Init ===
items = makeInitialItems()
scheduleRender()
