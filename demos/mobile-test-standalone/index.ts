// === spring physics (from MidUI.ts)
const msPerStep = 6

type Spring = {
  pos: number
  dest: number
  v: number
  k: number
  b: number
}

function spring(pos: number): Spring { return { pos: pos, dest: pos, v: 0, k: 333, b: 33 } }
function springStep(s: Spring) {
  const t = msPerStep / 1000
  const F = -s.k * (s.pos - s.dest) - s.b * s.v
  s.v += F * t
  s.pos += s.v * t
}
function springGoToEnd(s: Spring) { s.pos = s.dest; s.v = 0 }
/** @fit
 * result == (b - a) / 2
 */
function center(a: number, b: number) { return (b - a) / 2 }
/** @fit
 * result >= 0
 * result <= maxW
 * result <= maxH * ar
 */
function fit(
  ar: number, // @fit 0..10
  maxW: number, // @fit 0..10000
  maxH: number, // @fit 0..10000
) { return Math.min(maxW, maxH * ar) }
function remap(v: number, oMin: number, oMax: number, nMin: number, nMax: number) {
  if (oMin === oMax) return (nMin + nMax) / 2
  return (v - oMin) / (oMax - oMin) * (nMax - nMin) + nMin
}
function insideInclusive(x1: number, y1: number, x2: number, y2: number, sx: number, sy: number) { return x2 <= x1 && x1 <= x2 + sx && y2 <= y1 && y1 <= y2 + sy }
function overlapInclusive(x1: number, y1: number, sx1: number, sy1: number, x2: number, y2: number, sx2: number, sy2: number) { return x1 <= x2 + sx2 && x2 <= x1 + sx1 && y1 <= y2 + sy2 && y2 <= y1 + sy1 }
function lessEqual(a: number, b: number, c: number) { return a <= b && b <= c }
/** @fit
 * given max >= min
 * result >= min
 * result <= max
 */
function clamp(
  min: number, // @fit -100000..100000
  v: number, // @fit -100000..100000
  max: number, // @fit -100000..100000
) { return v > max ? max : v < min ? min : v }

// === scheduler
let scheduledRaf: number | null = null
function scheduleRender() {
  if (scheduledRaf != null) return
  scheduledRaf = requestAnimationFrame(function(now) {
    scheduledRaf = null
    if (render(now)) scheduleRender()
  })
}

// === layout constants
const headerGapTop = 28, headerGapBottom = 8
const composerGapX = 0
const chevronGapLeft = 20, chevronSize = 28
const regularImagesGap = 12
const lightboxImagesGapX = 16, lightboxImageGapY = 20
const lightboxHitAreaSizeX = 12
const imageBoxShadowAsBorder = '0 0px 2px 0 rgba(255, 255, 255, 0.2)'
const imageBoxShadowCollapsed = '0 4px 4px 0 rgba(0, 0, 0, 0.2)'

type FakeJob = {
  id: string
  prompt: string
  enqueue_time: string
  event: { width: number; height: number; batchSize: number }
}

// === fake jobs
const fakeJobs: FakeJob[] = [
  { id: 'aaa11111', prompt: 'A cozy cabin in the woods, morning light filtering through trees', enqueue_time: '2023-06-15T10:00:00Z', event: { width: 1344, height: 896, batchSize: 4 } },
  { id: 'bbb22222', prompt: 'Neon cyberpunk cityscape at night, rain reflections', enqueue_time: '2023-06-15T09:55:00Z', event: { width: 1024, height: 1024, batchSize: 4 } },
  { id: 'ccc33333', prompt: 'Underwater coral reef, tropical fish, volumetric light rays', enqueue_time: '2023-06-15T09:50:00Z', event: { width: 896, height: 1344, batchSize: 4 } },
  { id: 'ddd44444', prompt: 'Abstract geometric patterns, bold colors, bauhaus style', enqueue_time: '2023-06-15T09:45:00Z', event: { width: 1424, height: 848, batchSize: 4 } },
  { id: 'eee55555', prompt: 'Mountain landscape at golden hour, dramatic clouds', enqueue_time: '2023-06-15T09:40:00Z', event: { width: 1344, height: 896, batchSize: 2 } },
  { id: 'fff66666', prompt: 'Vintage Japanese woodblock print, waves and moon', enqueue_time: '2023-06-15T09:35:00Z', event: { width: 1024, height: 1024, batchSize: 4 } },
]
function jobImageUrl(job: FakeJob, index: number) {
  const seed = job.id.slice(0, 8) + index
  const w = 400
  return 'https://picsum.photos/seed/' + seed + '/' + w + '/' + Math.round(w * job.event.height / job.event.width)
}

function colsF(containerSizeY: number, containerSizeX: number, ar: number, count: number) {
  const maxTotalSizeY = containerSizeY > containerSizeX ? containerSizeY * 3/4 : containerSizeY / 2
  const maxTotalSizeX = containerSizeY > containerSizeX ? containerSizeX : containerSizeX * 3/4
  if (count === 1) return { cols: 1, maxTotalSizeX: maxTotalSizeX, maxTotalSizeY: maxTotalSizeY }
  const col1SizeX = fit(ar / count, maxTotalSizeX, maxTotalSizeY)
  const col2SizeX = fit(ar, maxTotalSizeX, maxTotalSizeY)
  const col4SizeX = fit(ar * count, maxTotalSizeX, maxTotalSizeY)
  const col1SizeXY = col1SizeX * col1SizeX / ar * count
  const col2SizeXY = col2SizeX * col2SizeX / ar
  const col4SizeXY = col4SizeX * col4SizeX / ar / count
  const cols = col1SizeXY > col2SizeXY ? (col1SizeXY > col4SizeXY ? 1 : count) : (col2SizeXY > col4SizeXY ? 2 : count)
  return { cols: cols, maxTotalSizeX: maxTotalSizeX, maxTotalSizeY: maxTotalSizeY }
}

// === DOM setup
const parentContainer = document.getElementById('container')!
const useTouch = 'ontouchstart' in document.documentElement

const dummyPlaceholder = document.createElement('div')
dummyPlaceholder.style.cssText = 'position:absolute;width:1px;'

const composer = document.createElement('div')
composer.className = 'composer'

const chevron = document.createElement('button')
chevron.className = 'chevron'
chevron.style.marginLeft = chevronGapLeft + 'px'
chevron.style.width = chevron.style.height = chevronSize + 'px'
chevron.innerHTML = '<svg fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="rgb(255, 246, 240)" aria-hidden="true" height="20" width="16"><path stroke-linecap="round" stroke-linejoin="round" d="M5 15l7-7 7 7"></path></svg>'

const input = document.createElement('input')
input.className = 'input'
input.placeholder = 'Imagine anything\u2026'

const inputForm = document.createElement('form')
inputForm.style.display = 'flex'
inputForm.style.flex = '1'
inputForm.appendChild(input)

const container = document.createElement('div')
container.className = 'container_'

composer.append(chevron, inputForm)
container.append(dummyPlaceholder)
parentContainer.append(composer, container)

// === state
type NodeData = {
  x: Spring
  y: Spring
  sizeY: Spring
  rotation: Spring
  node: HTMLDivElement
}

type RowData = {
  job: FakeJob
  ar: number
  header: HTMLDivElement
  headerSizeY: number
  headerX: Spring
  headerY: Spring
  nodes: NodeData[]
}

type ViewRegular = { type: 'regular' }
type ViewCollapsed = { type: 'collapsed'; savedScrollTop: number }
type ViewLightbox = { type: 'lightbox'; row: number; count: number; savedScrollTop: number }
type View = ViewRegular | ViewCollapsed | ViewLightbox

type PointerInput = {
  state: 'down' | 'move' | 'up'
  x: number
  y: number
  target: EventTarget | null
  time: number
}

type PrevInput = {
  x: number
  y: number
  time: number
}

type TouchDown = {
  x: number
  y: number
  time: number
  scrollLock: 'none' | 'x' | 'y'
}

let animatedUntilTime: number | null = null
let containerSizeX = parentContainer.clientWidth
let prevScrollTop = 0
let prevInnerSizeY: number | null = null
const inputs: { key: string | null; pointer: PointerInput[] } = { key: null, pointer: [] }
const prevInputs: PrevInput[] = []
let touchDown: TouchDown | null = null

let view: View = { type: 'regular' } // 'regular' | 'collapsed' | 'lightbox'
let anchorRow: number | null = null
const data: RowData[] = [] // { job, ar, header, headerSizeY, headerX, headerY, nodes: [{ x, y, sizeY, rotation, node }] }

let firstRender = true

// create data from fakeJobs
function initData() {
  for (let i = 0; i < fakeJobs.length; i++) {
    const job = fakeJobs[i]!
    const header = document.createElement('div')
    header.className = 'header'
    header.style.width = containerSizeX + 'px'
    header.innerText = job.prompt
    container.appendChild(header)

    const nodes: NodeData[] = []
    for (let j = 0; j < job.event.batchSize; j++) {
      const node = document.createElement('div')
      node.className = 'image'
      node.style.backgroundImage = 'url(' + jobImageUrl(job, j) + ')'
      const img = document.createElement('img')
      node.append(img)
      nodes.push({ x: spring(NaN), y: spring(NaN), sizeY: spring(NaN), rotation: spring(0), node: node })
    }

    data.push({
      job: job,
      ar: job.event.width / job.event.height,
      header: header,
      headerSizeY: header.getBoundingClientRect().height,
      headerX: spring(0),
      headerY: spring(NaN),
      nodes: nodes,
    })
  }
  anchorRow = data.length - 1
}
initData()

function springForEach(data: RowData[], f: (s: Spring) => void) {
  for (let i = 0; i < data.length; i++) {
    f(data[i]!.headerX); f(data[i]!.headerY)
    for (let j = 0; j < data[i]!.nodes.length; j++) {
      f(data[i]!.nodes[j]!.sizeY); f(data[i]!.nodes[j]!.x); f(data[i]!.nodes[j]!.y); f(data[i]!.nodes[j]!.rotation)
    }
  }
}

function prevFocus(data: RowData[], current: ViewLightbox): ViewLightbox | null {
  if (current.count > 0) return { type: 'lightbox', row: current.row, count: current.count - 1, savedScrollTop: current.savedScrollTop }
  if (current.row === 0) return null
  return { type: 'lightbox', row: current.row - 1, count: data[current.row - 1]!.nodes.length - 1, savedScrollTop: current.savedScrollTop }
}
function nextFocus(data: RowData[], current: ViewLightbox): ViewLightbox | null {
  if (current.count < data[current.row]!.nodes.length - 1) return { type: 'lightbox', row: current.row, count: current.count + 1, savedScrollTop: current.savedScrollTop }
  if (current.row === data.length - 1) return null
  return { type: 'lightbox', row: current.row + 1, count: 0, savedScrollTop: current.savedScrollTop }
}

// === events
window.addEventListener('resize', scheduleRender)
window.addEventListener('scroll', scheduleRender, true)
window.addEventListener('focus', scheduleRender, true)
window.addEventListener('blur', scheduleRender, true)
window.addEventListener('input', scheduleRender)
window.addEventListener('keydown', function(e: KeyboardEvent) {
  if (e.code === 'Escape' || e.code === 'ArrowLeft' || e.code === 'ArrowRight') { inputs.key = e.code; scheduleRender() }
})
inputForm.addEventListener('submit', function(e: Event) { e.preventDefault() })
if (useTouch) {
  window.addEventListener('touchstart', function(e: TouchEvent) { const t = e.touches[0]!; inputs.pointer.push({ state: 'down', x: t.pageX, y: t.pageY, target: e.target, time: e.timeStamp }); scheduleRender() })
  window.addEventListener('touchmove', function(e: TouchEvent) { const t = e.touches[0]!; inputs.pointer.push({ state: 'move', x: t.pageX, y: t.pageY, target: e.target, time: e.timeStamp }); scheduleRender() })
  function onTouchEnd(e: TouchEvent) {
    const t = e.changedTouches[0]
    if (t == null) return
    inputs.pointer.push({ state: 'up', x: t.pageX, y: t.pageY, target: e.target, time: e.timeStamp }); scheduleRender()
  }
  window.addEventListener('touchend', onTouchEnd)
  window.addEventListener('touchcancel', onTouchEnd)
} else {
  window.addEventListener('mousemove', function(e: MouseEvent) { inputs.pointer.push({ state: 'move', x: e.pageX, y: e.pageY, target: e.target, time: e.timeStamp }); scheduleRender() })
  window.addEventListener('click', function(e: MouseEvent) { inputs.pointer.push({ state: 'up', x: e.pageX, y: e.pageY, target: e.target, time: e.timeStamp }); scheduleRender() })
}

// === hit testing
function hitTestChevron(px: number, py: number, composerX: number, composerY: number, containerSizeY: number, composerSizeY: number) {
  const lx = px - composerX, ly = py - composerY
  return insideInclusive(lx, ly, 0, containerSizeY, chevronGapLeft + chevronSize, composerSizeY)
}
function hitTestRegular(data: RowData[], px: number, py: number, containerX: number, containerY: number, scrollTop: number): ViewLightbox | null {
  const lx = px - containerX, ly = py - containerY + scrollTop
  for (let i = 0; i < data.length; i++) {
    for (let j = 0; j < data[i]!.nodes.length; j++) {
      const n = data[i]!.nodes[j]!
      if (insideInclusive(lx, ly, n.x.dest, n.y.dest, n.sizeY.dest * data[i]!.ar, n.sizeY.dest))
        return { type: 'lightbox', row: i, count: j, savedScrollTop: scrollTop }
    }
  }
  return null
}
function hitTestLightbox(data: RowData[], focused: ViewLightbox, pointerX: number, containerX: number): ViewLightbox | null {
  const px = pointerX - containerX
  for (let i = 0; i < data.length; i++) {
    for (let j = 0; j < data[i]!.nodes.length; j++) {
      const n = data[i]!.nodes[j]!
      if (lessEqual(n.x.dest, px, n.x.dest + n.sizeY.dest * data[i]!.ar)) {
        if (i === focused.row && j === focused.count) return null
        return { type: 'lightbox', row: i, count: j, savedScrollTop: focused.savedScrollTop }
      }
    }
  }
  return null
}
function hitTestCollapsed(data: RowData[], px: number, py: number, containerX: number, containerY: number, scrollTop: number): ViewLightbox | null {
  const lx = px - containerX, ly = py - containerY + scrollTop
  for (let i = 0; i < data.length; i++) {
    for (let j = 0; j < data[i]!.nodes.length; j++) {
      const n = data[i]!.nodes[j]!
      if (insideInclusive(lx, ly, n.x.dest, n.y.dest, n.sizeY.dest * data[i]!.ar, n.sizeY.dest))
        return { type: 'lightbox', row: i, count: j, savedScrollTop: scrollTop }
    }
  }
  return null
}

// === processed input types
type ProcessedInputTouchNothing = { state: 'touchnothing' }
type ProcessedInputTouchStart = { state: 'touchstart'; x: number; y: number; time: number }
type ProcessedInputTouchDrag = { state: 'touchdrag'; x: number; y: number; deltaX: number; deltaY: number; time: number }
type ProcessedInputTouchEnd = { state: 'touchend'; x: number; y: number; deltaX: number; deltaY: number; time: number; target: EventTarget | null; deltaVX: number; deltaVY: number }
type ProcessedInputMouseNotInitialized = { state: 'mouseNotInitialized' }
type ProcessedInputMouseDownOrHovering = { state: 'mouseDownOrHovering'; x: number; y: number }
type ProcessedInputMouseClick = { state: 'mouseClick'; x: number; y: number; target: EventTarget | null }
type ProcessedInput = ProcessedInputTouchNothing | ProcessedInputTouchStart | ProcessedInputTouchDrag | ProcessedInputTouchEnd | ProcessedInputMouseNotInitialized | ProcessedInputMouseDownOrHovering | ProcessedInputMouseClick

// === main render loop
function render(now: number) {
  const parentRect = parentContainer.getBoundingClientRect()
  const newContainerSizeX = parentRect.width
  const windowSizeY = document.documentElement.clientHeight
  const innerSizeY = window.innerHeight
  const inputFocused = document.activeElement === input
  const composerGapBottom = (window.navigator as Navigator & { standalone?: boolean }).standalone === true && !inputFocused ? 21 : 0
  const composerSizeY = 56 + composerGapBottom
  const containerX = parentRect.left, containerY = parentRect.top
  const composerX = parentRect.left
  const containerSizeY_ = windowSizeY - composerSizeY
  const currentScrollTop = container.scrollTop
  let newAdjustedScrollTop = currentScrollTop
  let newView: View = view
  let inputShouldBlur = false

  // keys
  if (inputFocused) {
    if (inputs.key === 'Escape') inputShouldBlur = true
  } else {
    if (view.type === 'regular') {
      if (inputs.key === 'Escape') newView = { type: 'collapsed', savedScrollTop: currentScrollTop }
      else if (inputs.key === 'ArrowLeft' || inputs.key === 'ArrowRight') newView = { type: 'lightbox', row: 0, count: 0, savedScrollTop: currentScrollTop }
    } else if (view.type === 'collapsed') {
      if (inputs.key === 'ArrowLeft' || inputs.key === 'ArrowRight') newView = { type: 'lightbox', row: 0, count: 0, savedScrollTop: currentScrollTop }
    } else {
      if (inputs.key === 'Escape') newView = { type: 'regular' }
      else if (inputs.key === 'ArrowLeft') { const p = prevFocus(data, view); newView = p ?? view }
      else if (inputs.key === 'ArrowRight') { const n = nextFocus(data, view); newView = n ?? view }
    }
  }

  // process pointer
  const pointer = inputs.pointer
  pointer.sort(function(a: PointerInput, b: PointerInput) { return (a.state === 'up' ? -1 : a.state === 'down' ? 0 : 1) - (b.state === 'up' ? -1 : b.state === 'down' ? 0 : 1) })
  let processedInput: ProcessedInput
  let newTouchDown = touchDown
  let inputToAddToPrevInputs: PrevInput | null = null

  if (useTouch) {
    if (pointer.length === 0) {
      if (touchDown == null) processedInput = { state: 'touchnothing' }
      else { const pp = prevInputs[prevInputs.length - 1]!; processedInput = { state: 'touchdrag', x: pp.x, y: pp.y, deltaX: pp.x - touchDown.x, deltaY: pp.y - touchDown.y, time: pp.time } }
    } else {
      const p = pointer[0]!
      inputToAddToPrevInputs = { x: p.x, y: p.y, time: p.time }
      if (p.state === 'up') {
        const td = touchDown!
        let ii = prevInputs.length - 1; while (ii > 0 && prevInputs[ii]!.time > td.time && p.time - prevInputs[ii]!.time <= 40) ii--
        const pLast = prevInputs[prevInputs.length - 1]!, pI = prevInputs[ii]!
        const dt = p.time - pI.time
        processedInput = { state: 'touchend', x: p.x, y: p.y, deltaX: p.x - td.x, deltaY: p.y - td.y, time: p.time, target: p.target, deltaVX: dt > 0 ? (pLast.x - pI.x) / dt * 1000 : 0, deltaVY: dt > 0 ? (pLast.y - pI.y) / dt * 1000 : 0 }
        newTouchDown = null
      } else if (p.state === 'down') {
        processedInput = { state: 'touchstart', x: p.x, y: p.y, time: p.time }
        newTouchDown = { x: p.x, y: p.y, time: p.time, scrollLock: 'none' }
      } else {
        const td = touchDown!
        processedInput = { state: 'touchdrag', x: p.x, y: p.y, deltaX: p.x - td.x, deltaY: p.y - td.y, time: p.time }
        if (td.scrollLock === 'none') {
          const dx = p.x - td.x, dy = p.y - td.y
          newTouchDown = Math.abs(dx) * 1.7 > Math.abs(dy) ? { x: td.x, y: td.y, time: td.time, scrollLock: 'x' as const } : { x: td.x, y: td.y, time: td.time, scrollLock: 'y' as const }
        }
      }
    }
  } else {
    if (pointer.length === 0) {
      processedInput = prevInputs.length === 0 ? { state: 'mouseNotInitialized' } : { state: 'mouseDownOrHovering', x: prevInputs[prevInputs.length - 1]!.x, y: prevInputs[prevInputs.length - 1]!.y }
    } else {
      const p = pointer[0]!
      inputToAddToPrevInputs = { x: p.x, y: p.y, time: p.time }
      processedInput = p.state === 'up' ? { state: 'mouseClick', x: p.x, y: p.y, target: p.target } : { state: 'mouseDownOrHovering', x: p.x, y: p.y }
    }
  }

  // view transitions from input
  if (newView.type === 'regular') {
    if (processedInput.state === 'mouseClick' || processedInput.state === 'touchend') {
      if (processedInput.target === input) { /* noop */ }
      else if (hitTestChevron(processedInput.x, processedInput.y, composerX, containerY, containerSizeY_, composerSizeY))
        newView = { type: 'collapsed', savedScrollTop: currentScrollTop }
      else {
        const h = hitTestRegular(data, processedInput.x, processedInput.y, containerX, containerY, currentScrollTop)
        if (h != null) newView = h
      }
    }
  } else if (newView.type === 'collapsed') {
    if (processedInput.state === 'mouseClick' || processedInput.state === 'touchend') {
      if (processedInput.target === input) { /* noop */ }
      else if (hitTestChevron(processedInput.x, processedInput.y, composerX, containerY, containerSizeY_, composerSizeY)) {
        newAdjustedScrollTop = newView.savedScrollTop
        newView = { type: 'regular' }
      } else {
        const ss = view.type === 'lightbox' ? view.savedScrollTop : currentScrollTop
        const h = hitTestCollapsed(data, processedInput.x, processedInput.y, containerX, containerY, ss)
        if (h != null) newView = h
      }
    }
  } else if (newView.type === 'lightbox') { // oxlint-disable-line no-unnecessary-condition
    if (processedInput.state === 'mouseClick') {
      if (processedInput.target === input) { /* noop */ }
      else if (hitTestChevron(processedInput.x, processedInput.y, composerX, containerY, containerSizeY_, composerSizeY)) {
        const ss = view.type === 'lightbox' ? view.savedScrollTop : currentScrollTop
        newView = { type: 'collapsed', savedScrollTop: ss }
      } else {
        const h = hitTestLightbox(data, newView, processedInput.x, containerX)
        newView = h ?? { type: 'regular' }
      }
    } else if (processedInput.state === 'touchend') {
      if (processedInput.target === input) { /* noop */ }
      else if (hitTestChevron(processedInput.x, processedInput.y, composerX, containerY, containerSizeY_, composerSizeY)) {
        const ss = view.type === 'lightbox' ? view.savedScrollTop : currentScrollTop
        newView = { type: 'collapsed', savedScrollTop: ss }
      } else {
        const td = touchDown
        if (td != null) {
          if (td.scrollLock === 'x') {
            if (processedInput.deltaX > 50) { const pf = prevFocus(data, newView); if (pf != null) newView = pf }
            else if (processedInput.deltaX < -50) { const nf = nextFocus(data, newView); if (nf != null) newView = nf }
          } else if (td.scrollLock === 'y') {
            if (Math.abs(processedInput.deltaY) > 50) newView = { type: 'regular' }
          }
        }
      }
    }
  }

  inputShouldBlur = inputShouldBlur || (prevInnerSizeY != null && innerSizeY > prevInnerSizeY)

  // === layout
  const containerGapTop = 0
  const regularImagesSizeY: number[] = [], rowsTop: number[] = [containerGapTop + headerGapTop]
  for (let i = 0; i < data.length; i++) {
    const d = data[i]!
    const cf = colsF(containerSizeY_, newContainerSizeX, d.ar, d.nodes.length)
    const rows = d.nodes.length / cf.cols
    const sizeX = fit(d.ar, (cf.maxTotalSizeX - (cf.cols + 1) * regularImagesGap) / cf.cols, (cf.maxTotalSizeY - (rows - 1) * regularImagesGap) / rows)
    regularImagesSizeY.push(sizeX / d.ar)
    rowsTop.push(rowsTop[rowsTop.length - 1]! + headerGapBottom + d.headerSizeY + (sizeX / d.ar) * rows + regularImagesGap * (rows - 1) + headerGapTop)
  }

  let cursor = 'auto'
  const hoverDelta = 4
  let newAnchorRow = anchorRow

  if (newView.type === 'regular') {
    const hoverInput = processedInput.state === 'mouseDownOrHovering' ? processedInput : null
    const hit = hoverInput != null ? hitTestRegular(data, hoverInput.x, hoverInput.y, containerX, containerY, newAdjustedScrollTop) : null
    for (let i = 0; i < data.length; i++) {
      const d = data[i]!, rowTop = rowsTop[i]!, sizeY = regularImagesSizeY[i]!, sizeX = sizeY * d.ar
      const cf = colsF(containerSizeY_, newContainerSizeX, d.ar, d.nodes.length)
      d.headerX.dest = 0; d.headerY.dest = rowTop
      for (let j = 0; j < d.nodes.length; j++) {
        const nd = d.nodes[j]!
        let x: number, y: number
        if (cf.cols === 1) { x = regularImagesGap; y = rowTop + d.headerSizeY + headerGapBottom + (sizeY + regularImagesGap) * j }
        else if (cf.cols === 2) { x = regularImagesGap + (sizeX + regularImagesGap) * (j % 2); y = rowTop + d.headerSizeY + headerGapBottom + (sizeY + regularImagesGap) * Math.floor(j / 2) }
        else { x = regularImagesGap + (sizeX + regularImagesGap) * j; y = rowTop + d.headerSizeY + headerGapBottom }
        nd.x.dest = x; nd.y.dest = y
        if (view.type === 'lightbox' && view.row === i && processedInput.state === 'touchend') { nd.x.v = processedInput.deltaVX * 10; nd.y.v = processedInput.deltaVY * 10 }
        nd.rotation.dest = 0
        if (hit != null && hoverInput != null && hit.row === i && hit.count === j) {
          const as = sizeY * 1.02; nd.sizeY.dest = as
          nd.x.dest += remap(hoverInput.x - containerX, x, x + sizeX, -hoverDelta, hoverDelta) - center(sizeX, as * d.ar)
          nd.y.dest += remap(hoverInput.y - containerY + newAdjustedScrollTop, y, y + sizeY, -hoverDelta, hoverDelta) - center(sizeY, as)
        } else { nd.sizeY.dest = sizeY }
      }
    }
    if (view.type === 'lightbox') {
      const focusedJobID = data[view.row]!.job.id
      newAnchorRow = data.findIndex(function(d: RowData) { return d.job.id === focusedJobID })
      if (newAnchorRow === -1) newAnchorRow = Math.min(data.length - 1, view.row + 1)
      const nn = data[newAnchorRow]!.nodes[view.count]!
      const top = rowsTop[newAnchorRow]!, bottom = nn.y.dest + nn.sizeY.dest
      if (top < newAdjustedScrollTop || bottom > containerSizeY_ + newAdjustedScrollTop) newAdjustedScrollTop = top
      else newAdjustedScrollTop = view.savedScrollTop
    } else if (newContainerSizeX !== containerSizeX) {
      if (newAnchorRow != null) newAdjustedScrollTop = rowsTop[newAnchorRow + 1]! - containerSizeY_
    } else if (newAdjustedScrollTop !== prevScrollTop) {
      for (let i = 0; i < rowsTop.length - 1; i++) {
        if (lessEqual(rowsTop[i]!, containerSizeY_ + newAdjustedScrollTop, rowsTop[i + 1]! + 20)) { newAnchorRow = i; break }
      }
    } else if (newAnchorRow != null && anchorRow == null) {
      newAdjustedScrollTop = rowsTop[newAnchorRow + 1]! - containerSizeY_
    }
    if (hit != null) cursor = 'zoom-in'
    if (view.type === 'lightbox') newAdjustedScrollTop = clamp(0, newAdjustedScrollTop, Math.max(0, rowsTop[rowsTop.length - 1]! - containerSizeY_) + 1)
    const scrollDelta = newAdjustedScrollTop - currentScrollTop
    if (firstRender) {
      // depoison NaN-initialized springs (same as justLoadedOldJobs path in the original)
      springForEach(data, springGoToEnd)
    } else {
      for (let i = 0; i < data.length; i++) {
        data[i]!.headerY.pos += scrollDelta
        for (let j = 0; j < data[i]!.nodes.length; j++) data[i]!.nodes[j]!.y.pos += scrollDelta
      }
    }
  } else if (newView.type === 'lightbox') {
    const focusedD = data[newView.row]!
    const lightboxGapTop = focusedD.headerSizeY + lightboxImageGapY
    const focusedImageMaxSizeX = newContainerSizeX - lightboxImagesGapX * 2 - lightboxHitAreaSizeX * 2
    const focusedImageMaxSizeY = containerSizeY_ - lightboxGapTop - lightboxImageGapY
    const focusedImageSizeX = fit(focusedD.ar, focusedImageMaxSizeX, focusedImageMaxSizeY)
    const nonFocusedImageMaxSizeX = newContainerSizeX * 0.85
    const nonFocusedImageMaxSizeY = containerSizeY_ * 0.85

    const currentLefts: number[] = [0]
    for (let i = 0; i < data.length; i++) {
      const d = data[i]!, nfsx = fit(d.ar, nonFocusedImageMaxSizeX, nonFocusedImageMaxSizeY)
      for (let j = 0; j < d.nodes.length; j++) {
        const isx = (i === newView.row && j === newView.count) ? focusedImageSizeX : nfsx
        currentLefts.push(currentLefts[currentLefts.length - 1]! + isx + lightboxImagesGapX)
      }
      currentLefts[currentLefts.length - 1] = currentLefts[currentLefts.length - 1]! + 160
    }
    let focusedIdx = 0
    for (let i = 0; i < data.length; i++) { for (let j = 0; j < data[i]!.nodes.length; j++) { if (newView.row === i && newView.count === j) break; focusedIdx++ } if (newView.row === i) break }
    const offset = currentLefts[focusedIdx]! - center(focusedImageSizeX, newContainerSizeX)

    const edgeRubberV = (inputs.key === 'ArrowLeft' && view.type === 'lightbox' && prevFocus(data, view) == null) ? 2000
      : (inputs.key === 'ArrowRight' && view.type === 'lightbox' && nextFocus(data, view) == null) ? -2000 : 0
    const hoverInput = processedInput.state === 'mouseDownOrHovering' ? processedInput : null
    const hit = hoverInput != null ? hitTestLightbox(data, newView, hoverInput.x, containerX) : null
    let deltaX = 0, deltaY = 0
    if (processedInput.state === 'touchdrag' && newTouchDown != null) {
      deltaX = processedInput.deltaX; deltaY = (newTouchDown.scrollLock === 'x') ? 0 : processedInput.deltaY
    }

    let cli = 0
    for (let i = 0; i < data.length; i++) {
      const d = data[i]!, nfsx = fit(d.ar, nonFocusedImageMaxSizeX, nonFocusedImageMaxSizeY), idx = cli
      d.headerX.dest = (i === newView.row) ? 0 : currentLefts[cli]! - offset
      for (let j = 0; j < d.nodes.length; j++) {
        const nd = d.nodes[j]!, isFocused = (i === newView.row && j === newView.count)
        const sx = isFocused ? focusedImageSizeX : nfsx, sy = sx / d.ar
        const x = currentLefts[cli]! - offset + deltaX
        const y = lightboxGapTop + center(sy, containerSizeY_ - lightboxGapTop - lightboxImageGapY) + newAdjustedScrollTop + deltaY
        nd.x.dest = x; nd.x.v += edgeRubberV / (isFocused ? 1 : 4); nd.y.dest = y; nd.rotation.dest = 0
        if (hit != null && hoverInput != null && hit.row === i && hit.count === j) {
          const as = sy * 1.005; nd.sizeY.dest = as
          nd.x.dest += remap(hoverInput.x - containerX, x, x + sx, -hoverDelta, hoverDelta) - center(sx, as * d.ar)
          nd.y.dest += remap(hoverInput.y - containerY + newAdjustedScrollTop, y, y + sy, -hoverDelta, hoverDelta) - center(sy, as)
        } else { nd.sizeY.dest = sy }
        if (processedInput.state === 'touchstart') { nd.x.dest = nd.x.pos; nd.y.dest = nd.y.pos }
        else if (processedInput.state === 'touchend') {
          const td2 = touchDown
          if (td2 != null) { nd.x.v = processedInput.deltaVX; if (td2.scrollLock !== 'x') nd.y.v = processedInput.deltaVY }
        }
        cli++
      }
      if (i === newView.row) {
        d.headerX.dest = 0
        d.headerY.dest = Math.min(0, d.nodes[0]!.y.pos - newAdjustedScrollTop - d.headerSizeY - 12) + newAdjustedScrollTop
        if (processedInput.state === 'touchstart' || processedInput.state === 'touchdrag')
          d.headerY.pos = Math.min(d.headerY.pos, d.nodes[0]!.y.pos - d.headerSizeY - 12)
      } else {
        d.headerX.dest = currentLefts[idx]! - offset; d.headerY.dest = newAdjustedScrollTop
      }
    }
    cursor = hit == null ? 'zoom-out' : 'zoom-in'
    const scrollDelta = newAdjustedScrollTop - currentScrollTop
    for (let i = 0; i < data.length; i++) { for (let j = 0; j < data[i]!.nodes.length; j++) data[i]!.nodes[j]!.y.pos += scrollDelta; data[i]!.headerY.pos += scrollDelta }
  } else if (newView.type === 'collapsed') { // oxlint-disable-line no-unnecessary-condition
    const imageMaxSize = 44
    let left = composerGapX + chevronGapLeft
    const hoverInput = processedInput.state === 'mouseDownOrHovering' ? processedInput : null
    const hit = hoverInput != null ? hitTestCollapsed(data, hoverInput.x, hoverInput.y, containerX, containerY, newAdjustedScrollTop) : null
    for (let i = 0; i < data.length; i++) {
      const d = data[i]!, show = i >= data.length - 3
      const sx = fit(d.ar, d.ar === 1 ? imageMaxSize * 0.8 : imageMaxSize, imageMaxSize), sy = sx / d.ar
      const x = left + center(sx, imageMaxSize), y = containerSizeY_ - imageMaxSize - 16 + center(sy, imageMaxSize)
      d.headerX.dest = 0; d.headerY.dest = y - d.headerSizeY
      for (let j = 0; j < d.nodes.length; j++) {
        const nd = d.nodes[j]!; nd.y.dest = y; nd.sizeY.dest = sy
        if (show) {
          nd.rotation.dest = remap(j, 0, d.nodes.length - 1, -30, 30); nd.x.dest = x
          if (hit != null && hoverInput != null && hit.row === i) {
            const as = sy * 1.02; nd.sizeY.dest = as
            nd.x.dest += remap(hoverInput.x - containerX, x, x + sx, -hoverDelta, hoverDelta) - center(sx, as * d.ar)
            nd.y.dest += remap(hoverInput.y - containerY + newAdjustedScrollTop, y, y + sy, -hoverDelta, hoverDelta) - center(sy, as)
          }
        } else { nd.x.dest = -newContainerSizeX * 2; nd.rotation.dest = 0 }
      }
      if (show) left += imageMaxSize + 12
    }
    if (hit != null) cursor = 'zoom-in'
    newAdjustedScrollTop = 0
    const scrollDelta = newAdjustedScrollTop - currentScrollTop
    for (let i = 0; i < data.length; i++) { data[i]!.headerY.pos += scrollDelta; for (let j = 0; j < data[i]!.nodes.length; j++) data[i]!.nodes[j]!.y.pos += scrollDelta }
  }

  // === animation step
  const newAnimatedUntilTime = animatedUntilTime ?? now
  const steps = Math.min(300, Math.floor((now - newAnimatedUntilTime) / msPerStep))
  const _newAnimatedUntilTime = newAnimatedUntilTime + steps * msPerStep
  let stillAnimating = false
  springForEach(data, function(s: Spring) {
    if (Math.abs(s.v) < 0.01 && Math.abs(s.dest - s.pos) < 0.01) springGoToEnd(s)
    // oxlint-disable-line no-unnecessary-condition
    else { stillAnimating = true; for (let i = 0; i < steps; i++) springStep(s) }
  })

  // === DOM writes
  container.style.width = newContainerSizeX + 'px'
  container.style.height = containerSizeY_ + 'px'
  container.style.bottom = composerSizeY + 'px'
  composer.style.width = (newContainerSizeX - composerGapX * 2) + 'px'
  composer.style.height = composerSizeY + 'px'
  composer.style.paddingBottom = composerGapBottom + 'px'
  composer.style.left = composerGapX + 'px'
  composer.style.zIndex = '' + (data.length * 5 + 5)
  chevron.style.transform = newView.type === 'collapsed' ? 'rotate(180deg)' : 'rotate(0deg)'

  const occY = -400, occSY = containerSizeY_ + 800, occX = -400, occSX = newContainerSizeX + 800
  for (let i = 0; i < data.length; i++) {
    const d = data[i]!, header = d.header
    if (overlapInclusive(0, d.headerY.pos - newAdjustedScrollTop, newContainerSizeX, d.headerSizeY, occX, occY, occSX, occSY)) {
      header.style.top = d.headerY.pos + 'px'; header.style.left = d.headerX.pos + 'px'
      header.style.height = d.headerSizeY + 'px'; header.style.width = newContainerSizeX + 'px'
      header.style.opacity = (newView.type === 'collapsed' || (newView.type === 'lightbox' && newView.row !== i)) ? '0' : '1'
      header.style.zIndex = '' + ((newView.type === 'lightbox' && newView.row === i) ? data.length * 5 + 4 : i * 5 + 4)
      if (header.parentNode == null) container.appendChild(header)
    } else if (header.parentNode != null) container.removeChild(header)

    for (let j = 0; j < d.nodes.length; j++) {
      const nd = d.nodes[j]!, node = nd.node, img = node.children[0] as HTMLImageElement, sx = nd.sizeY.pos * d.ar
      if (overlapInclusive(nd.x.pos, nd.y.pos - newAdjustedScrollTop, sx, nd.sizeY.pos, occX, occY, occSX, occSY)) {
        node.style.width = sx + 'px'; node.style.height = nd.sizeY.pos + 'px'
        node.style.transform = 'translate3d(' + nd.x.pos + 'px,' + nd.y.pos + 'px,0) rotate(' + nd.rotation.pos + 'deg)'
        // oxlint-disable-line no-unnecessary-condition
        if (newView.type === 'regular') { node.style.zIndex = '' + (i * 5 + j); node.style.boxShadow = imageBoxShadowAsBorder; img.style.display = 'none' }
        // oxlint-disable-line no-unnecessary-condition
        else if (newView.type === 'lightbox') { node.style.zIndex = '' + (newView.row === i ? data.length * 5 + (3 - newView.count + j) % 4 : i * 5 + j); node.style.boxShadow = imageBoxShadowAsBorder; img.style.display = 'block'; if (!stillAnimating) { const src = jobImageUrl(d.job, j); if (img.src !== src) img.src = src } } // oxlint-disable-line no-unnecessary-condition
        else { node.style.zIndex = '' + (i * 5 + d.nodes.length - j); node.style.boxShadow = imageBoxShadowAsBorder + ',' + imageBoxShadowCollapsed }
        if (node.parentNode == null) container.appendChild(node)
      } else if (node.parentNode != null) container.removeChild(node)
    }
  }

  document.body.style.cursor = cursor
  container.style.overflowY = newView.type === 'regular' ? 'auto' : 'hidden'
  dummyPlaceholder.style.height = rowsTop[rowsTop.length - 1]! + 'px'

  if (newAdjustedScrollTop !== currentScrollTop) container.scrollTo({ top: newAdjustedScrollTop })
  if (inputShouldBlur) input.blur()
  inputs.key = null; inputs.pointer = []
  if (inputToAddToPrevInputs != null) prevInputs.push(inputToAddToPrevInputs)
  if (prevInputs.length > 20) prevInputs.shift()
  touchDown = newTouchDown
  animatedUntilTime = stillAnimating ? _newAnimatedUntilTime : null // oxlint-disable-line no-unnecessary-condition
  anchorRow = newAnchorRow; containerSizeX = newContainerSizeX; prevScrollTop = newAdjustedScrollTop
  view = newView; prevInnerSizeY = innerSizeY; firstRender = false
  return stillAnimating // oxlint-disable-line no-unnecessary-condition
}

scheduleRender()
