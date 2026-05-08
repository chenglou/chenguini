import {
  computeAnchorLayout,
  headerHeight,
  itemHeight,
  type AnchorResult,
} from './anchor-layout'

const targetScroll = 700

const colors = [
  '#c0392b', '#2980b9', '#27ae60', '#8e44ad',
  '#d35400', '#16a085', '#2c3e50', '#f39c12',
]

// === generic scheduler
let scheduledRaf: number | null = null
function scheduleRender() {
  if (scheduledRaf != null) return
  scheduledRaf = requestAnimationFrame(function renderOnFrame() { // named for profiler
    scheduledRaf = null
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

type State = {
  counter: number
  items: Item[]
  anchor: AnchorResult
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

  const layout = computeAnchorLayout(
    st.items,
    currentScrollY,
    st.events.scrollTo,
    st.anchor == null ? null : st.anchor.id,
    st.anchor == null ? 0 : st.anchor.prevY,
    userScrolled,
  )

  // === commit state
  if (userScrolled && layout.newAnchor != null) {
    st.anchor = layout.newAnchor
  } else if (userScrolled === false && st.anchor != null) {
    st.anchor.prevY = layout.anchorPrevY
  }
  st.events.scrollTo = st.events.addAbove = null

  // === DOM writes
  const visibleTop = layout.adjustedScrollTop
  const visibleBottom = layout.adjustedScrollTop + viewportH

  for (const header of layout.headerPositions) {
    if (header.y + headerHeight > visibleTop && header.y < visibleBottom) {
      let headerNode = domCache.nodes.get(header.day)
      if (headerNode == null) {
        headerNode = document.createElement('div')
        headerNode.className = 'day-header'
        domCache.nodes.set(header.day, headerNode)
      }
      headerNode.style.top = header.y + 'px'
      headerNode.style.height = headerHeight + 'px'
      headerNode.textContent = header.day
      if (headerNode.parentNode == null) domCache.spacer.appendChild(headerNode)
    } else {
      const headerNode = domCache.nodes.get(header.day)
      if (headerNode?.parentNode != null) domCache.spacer.removeChild(headerNode)
    }
  }

  for (let itemIndex = 0; itemIndex < layout.itemPositions.length; itemIndex++) {
    const itemPosition = layout.itemPositions[itemIndex]!
    const item = st.items[itemIndex]!
    if (itemPosition.y + itemHeight > visibleTop && itemPosition.y < visibleBottom) {
      let node = domCache.nodes.get(item.id)
      if (node == null) {
        node = document.createElement('div')
        node.className = 'item'
        domCache.nodes.set(item.id, node)
      }
      node.style.top = itemPosition.y + 'px'
      node.style.height = itemHeight + 'px'
      node.style.background = item.color
      node.textContent = item.label + ' \u2014 ' + item.day
      if (node.parentNode == null) domCache.spacer.appendChild(node)
    } else {
      const node = domCache.nodes.get(item.id)
      if (node?.parentNode != null) domCache.spacer.removeChild(node)
    }
  }

  domCache.spacer.style.height = layout.totalHeight + 'px'
  domCache.info.textContent =
    'scrollTop: ' + Math.round(domCache.container.scrollTop) +
    ' | anchor: ' + (st.anchor != null ? st.anchor.id : 'none') +
    ' (prevY: ' + (st.anchor != null ? Math.round(st.anchor.prevY) : '-') + ')' +
    ' | items: ' + st.items.length

  // === side effects
  if (layout.adjustedScrollTop !== currentScrollY) {
    domCache.container.scrollTo({top: layout.adjustedScrollTop, behavior: 'instant' as ScrollBehavior})
    // Read back actual value after scrollTo. Do NOT store the requested
    // value — browser truncation (Chrome: 0.5, Safari/Firefox: integers)
    // would cause a false mismatch on the next frame, making us think
    // the user scrolled when they didn't. (Scrolling.md points 3-4)
    // This can force layout, so keep it at the end of the frame and don't
    // do more DOM writes after it.
    st.storedScrollY = domCache.container.scrollTop
  } else {
    st.storedScrollY = currentScrollY
  }
}

// === init
st.items = makeInitialItems()
scheduleRender()
