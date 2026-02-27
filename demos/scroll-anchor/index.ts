// === constant layout metrics
const itemHeight = 100
const headerHeight = 24
const headerGapFirst = 0
const headerGapRest = 32
const headerGapBottom = 8
const itemGap = 8
const targetScroll = 700

const colors = [
  '#c0392b', '#2980b9', '#27ae60', '#8e44ad',
  '#d35400', '#16a085', '#2c3e50', '#f39c12',
]

// === generic scheduler
let scheduledRender = false
function scheduleRender() {
  if (scheduledRender) return
  scheduledRender = true
  requestAnimationFrame(function renderOnFrame() { // named for profiler
    scheduledRender = false
    render()
  })
}

// === state
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

type State = {
  counter: number
  items: Item[]
  anchor: Anchor | null
  storedScrollY: number // read-back value from last frame's scrollTo
  events: {
    scrollTo: number | null
    addAbove: number | null
  }
}

let st: State = {
  counter: 0,
  items: [],
  anchor: null,
  storedScrollY: 0,
  events: {scrollTo: null, addAbove: null},
}

function makeItem(day: string): Item {
  const n = st.counter++
  return {id: 'V' + n, day, label: '#' + n, color: colors[n % colors.length]!}
}

function makeInitialItems() {
  const result: Item[] = []
  for (let i = 0; i < 8; i++) result.push(makeItem('Today'))
  for (let i = 0; i < 1; i++) result.push(makeItem('Yesterday'))
  for (let i = 0; i < 8; i++) result.push(makeItem('2 Days Ago'))
  return result
}

// cache lifetime: same as data
const domCache = {
  container: document.getElementById('container')! as HTMLDivElement,
  spacer: document.getElementById('spacer')! as HTMLDivElement,
  info: document.getElementById('info')! as HTMLDivElement,
  nodes: new Map<string, HTMLDivElement>(), // items + headers, JIT created
}

// === events
domCache.container.addEventListener('scroll', () => scheduleRender())
window.addEventListener('resize', () => scheduleRender())

document.getElementById('btn-scroll')!.addEventListener('click', () => {
  st.events.scrollTo = targetScroll; scheduleRender()
})
document.getElementById('btn-add')!.addEventListener('click', () => {
  st.events.addAbove = 3; scheduleRender()
})
document.getElementById('btn-rapid')!.addEventListener('click', () => {
  // Two separate data changes in quick succession (simulates rapid async updates).
  // Whether they land in one render or two depends on timing — works
  // either way. If one render: sees all 3, adjusts once. If two
  // renders: each adjusts for its new items, prevY updated between.
  st.events.addAbove = 1; scheduleRender()
  setTimeout(function addTwoMore() {
    st.events.addAbove = 2; scheduleRender()
  }, 0)
})

// === render
function render() {
  // === DOM reads
  const currentScrollY = domCache.container.scrollTop
  const viewportH = domCache.container.clientHeight

  // === handle inputs
  if (st.events.addAbove != null) {
    for (let i = 0; i < st.events.addAbove; i++) st.items.unshift(makeItem('Today'))
  }

  // Detect user scroll: if currentScrollY differs from what we stored last
  // frame, something external changed the scroll position -> pick a new anchor.
  // A scrollTo event also counts as external (we'll apply it as a side effect).
  const userScrolled = st.events.scrollTo != null || currentScrollY !== st.storedScrollY

  // === layout (pure arithmetic, no DOM writes)
  let y = 0
  let adjustedScrollTop = st.events.scrollTo ?? currentScrollY
  let newAnchor: Anchor | null = null
  let isFirstSession = true
  let idx = 0

  while (idx < st.items.length) {
    const sessionDay = st.items[idx]!.day
    const gapTop = isFirstSession ? headerGapFirst : headerGapRest
    y += gapTop + headerHeight + headerGapBottom

    let firstInSession = true
    while (idx < st.items.length && st.items[idx]!.day === sessionDay) {
      const item = st.items[idx]!
      if (!firstInSession) y += itemGap
      firstInSession = false

      // Pick new anchor: first item below scrollTop
      if (userScrolled && newAnchor == null && y > adjustedScrollTop) {
        newAnchor = {id: item.id, prevY: y}
      }

      // Anchor adjustment: compute scroll delta
      if (!userScrolled && st.anchor != null && item.id === st.anchor.id && adjustedScrollTop > 40) {
        adjustedScrollTop = adjustedScrollTop + (y - st.anchor.prevY)
        st.anchor.prevY = y
      }

      y += itemHeight
      idx++
    }
    isFirstSession = false
  }

  const totalHeight = y

  // === commit state
  if (userScrolled && newAnchor != null) {
    st.anchor = newAnchor
  }
  st.events.scrollTo = st.events.addAbove = null

  // === DOM writes
  const visibleTop = adjustedScrollTop
  const visibleBottom = adjustedScrollTop + viewportH

  y = 0
  isFirstSession = true
  idx = 0

  while (idx < st.items.length) {
    const sessionDay = st.items[idx]!.day
    const gapTop = isFirstSession ? headerGapFirst : headerGapRest
    const headerY = y + gapTop
    y += gapTop + headerHeight + headerGapBottom

    if (headerY + headerHeight > visibleTop && headerY < visibleBottom) {
      let headerNode = domCache.nodes.get(sessionDay)
      if (headerNode == null) {
        headerNode = document.createElement('div')
        headerNode.className = 'day-header'
        domCache.nodes.set(sessionDay, headerNode)
      }
      headerNode.style.top = headerY + 'px'
      headerNode.style.height = headerHeight + 'px'
      headerNode.textContent = sessionDay
      if (headerNode.parentNode == null) domCache.spacer.appendChild(headerNode)
    } else {
      const headerNode = domCache.nodes.get(sessionDay)
      if (headerNode?.parentNode != null) domCache.spacer.removeChild(headerNode)
    }

    let firstInSession = true
    while (idx < st.items.length && st.items[idx]!.day === sessionDay) {
      const item = st.items[idx]!
      if (!firstInSession) y += itemGap
      firstInSession = false

      if (y + itemHeight > visibleTop && y < visibleBottom) {
        let node = domCache.nodes.get(item.id)
        if (node == null) {
          node = document.createElement('div')
          node.className = 'item'
          domCache.nodes.set(item.id, node)
        }
        node.style.top = y + 'px'
        node.style.height = itemHeight + 'px'
        node.style.background = item.color
        node.textContent = item.label + ' \u2014 ' + item.day
        if (node.parentNode == null) domCache.spacer.appendChild(node)
      } else {
        const node = domCache.nodes.get(item.id)
        if (node?.parentNode != null) domCache.spacer.removeChild(node)
      }

      y += itemHeight
      idx++
    }
    isFirstSession = false
  }

  domCache.spacer.style.height = totalHeight + 'px'
  domCache.info.textContent =
    'scrollTop: ' + Math.round(domCache.container.scrollTop) +
    ' | anchor: ' + (st.anchor != null ? st.anchor.id : 'none') +
    ' (prevY: ' + (st.anchor != null ? Math.round(st.anchor.prevY) : '-') + ')' +
    ' | items: ' + st.items.length

  // === side effects
  if (adjustedScrollTop !== currentScrollY) {
    domCache.container.scrollTo({top: adjustedScrollTop, behavior: 'instant' as ScrollBehavior})
    // Read back actual value after scrollTo. Do NOT store the requested
    // value — browser truncation (Chrome: 0.5, Safari/Firefox: integers)
    // would cause a false mismatch on the next frame, making us think
    // the user scrolled when they didn't. (Scrolling.md points 3-4)
    st.storedScrollY = domCache.container.scrollTop
  } else {
    st.storedScrollY = currentScrollY
  }
}

// === init
st.items = makeInitialItems()
scheduleRender()
