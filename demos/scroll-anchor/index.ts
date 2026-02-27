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

// cache lifetime: same as data
const domCache = new Map<string, HTMLDivElement>()

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
  const viewportH = container.clientHeight

  // Step 2: Detect user scroll
  // If currentScrollY differs from what we stored last frame, something
  // external changed the scroll position. Pick a new anchor.
  const userScrolled = currentScrollY !== storedScrollY

  // Step 3: Compute layout (pure arithmetic — no DOM writes)
  // Pass 1: iterate all items for y positions, total height, and anchor
  let y = 0
  let adjustedScrollTop = currentScrollY
  let newAnchor: Anchor | null = null
  let isFirstSession = true
  let idx = 0

  while (idx < items.length) {
    const sessionDay = items[idx]!.day
    const gapTop = isFirstSession ? HEADER_GAP_FIRST : HEADER_GAP_REST
    y += gapTop + HEADER_HEIGHT + HEADER_GAP_BOTTOM

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

      y += ITEM_HEIGHT
      idx++
    }
    isFirstSession = false
  }

  const totalHeight = y

  // Update anchor
  if (userScrolled && newAnchor != null) {
    anchor = newAnchor
  }

  // Step 4: DOM writes
  // Pass 2: iterate items again, check visibility, JIT create + attach/detach
  const visibleTop = adjustedScrollTop
  const visibleBottom = adjustedScrollTop + viewportH

  y = 0
  isFirstSession = true
  idx = 0

  while (idx < items.length) {
    const sessionDay = items[idx]!.day
    const gapTop = isFirstSession ? HEADER_GAP_FIRST : HEADER_GAP_REST
    const headerY = y + gapTop
    y += gapTop + HEADER_HEIGHT + HEADER_GAP_BOTTOM

    // Header: visible if it overlaps viewport
    if (headerY + HEADER_HEIGHT > visibleTop && headerY < visibleBottom) {
      let headerNode = domCache.get(sessionDay)
      if (headerNode == null) {
        headerNode = document.createElement('div')
        headerNode.className = 'day-header'
        domCache.set(sessionDay, headerNode)
      }
      headerNode.style.top = headerY + 'px'
      headerNode.style.height = HEADER_HEIGHT + 'px'
      headerNode.textContent = sessionDay
      if (headerNode.parentNode == null) spacer.appendChild(headerNode)
    } else {
      const headerNode = domCache.get(sessionDay)
      if (headerNode != null && headerNode.parentNode != null) spacer.removeChild(headerNode)
    }

    let firstInSession = true
    while (idx < items.length && items[idx]!.day === sessionDay) {
      const item = items[idx]!
      if (!firstInSession) y += ITEM_GAP
      firstInSession = false

      // Item: visible if it overlaps viewport
      if (y + ITEM_HEIGHT > visibleTop && y < visibleBottom) {
        let node = domCache.get(item.id)
        if (node == null) {
          node = document.createElement('div')
          node.className = 'item'
          domCache.set(item.id, node)
        }
        node.style.top = y + 'px'
        node.style.height = ITEM_HEIGHT + 'px'
        node.style.background = item.color
        node.textContent = item.label + ' \u2014 ' + item.day
        if (node.parentNode == null) spacer.appendChild(node)
      } else {
        const node = domCache.get(item.id)
        if (node != null && node.parentNode != null) spacer.removeChild(node)
      }

      y += ITEM_HEIGHT
      idx++
    }
    isFirstSession = false
  }

  spacer.style.height = totalHeight + 'px'

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
  // Clear DOM cache and wipe spacer children
  domCache.clear()
  spacer.textContent = ''
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
