import {center, rowSizeX, shouldSwapDown, shouldSwapUp, stackLayout, windowPaddingTop} from './swap-layout'

// === generic scheduler & its debugger
let scheduledRaf: number | null = null
function scheduleRender() {
  if (scheduledRaf != null) return;
  scheduledRaf = requestAnimationFrame(function renderAndMaybeScheduleAnotherRender(now) { // eye-grabbing name. No "(anonymous)" function in the debugger & profiler
    scheduledRaf = null
    if (render(now)) scheduleRender()
  })
}

// === generic spring physics
// 4ms/step for the spring animation's step. Typically 4 steps for 60fps (16.6ms/frame) and 2 for 120fps (8.3ms/frame). Frame time delta varies, so not always true
// could use 8ms instead, but 120fps' 8.3ms/frame means the computation might not fit in the remaining 0.3ms, which means sometime the simulation step wouldn't even run once, giving the illusion of jank
const msPerAnimationStep = 4

type SpringConfig = {
  pos: number
  dest: number
  v: number
  k: number
  b: number
}

function spring(pos: number, v = 0, k = 290, b = 24): SpringConfig {
  return {pos, dest: pos, v, k, b} // k = stiffness, b = damping. Try https://chenglou.me/react-motion/demos/demo5-spring-parameters-chooser/
}
function springStep(config: SpringConfig) {
  // https://blog.maximeheckel.com/posts/the-physics-behind-spring-animations/
  // this seems inspired by https://github.com/chenglou/react-motion/blob/9e3ce95bacaa9a1b259f969870a21c727232cc68/src/stepper.js
  const t = msPerAnimationStep / 1000 // convert to seconds for the physics equation
  const {pos, dest, v, k, b} = config
  // for animations, dest is actually spring at rest. Current position is the spring's stretched/compressed state
  const Fspring = -k * (pos - dest) // Spring stiffness, in kg / s^2
  const Fdamper = -b * v // Damping, in kg / s
  const a = Fspring + Fdamper // a needs to be divided by mass, but we'll assume mass of 1. Adjust k and b to change spring curve instead
  const newV = v + a * t
  const newPos = pos + newV * t

  config.pos = newPos; config.v = newV
}
function springGoToEnd(config: SpringConfig) {
  config.pos = config.dest
  config.v = 0
}

// === generic helpers
function hash(n: number) {
  n = Math.imul((n >>> 16) ^ n, 0x21f0aaad);
  n = Math.imul((n >>> 15) ^ n, 0xd35a2d97);
  return (((n >>> 15) ^ n) >>> 0) / 0x100000000;
}

// === state
type RowData = {
  id: string
  sizeY: number
  x: SpringConfig
  y: SpringConfig
  scale: SpringConfig
}

type DragInfo = {
  id: string
  deltaX: number
  deltaY: number
}

type PointerSample = {x: number; y: number; time: number}

type State = {
  animatedUntilTime: number | null
  dragged: DragInfo | null
  lastDragged: DragInfo | null
  pointerState: 'down' | 'up' | 'firstDown'
  pointer: PointerSample[]
  events: {
    mouseup: MouseEvent | null
    touchend: TouchEvent | null
    touchcancel: TouchEvent | null
    mousemove: MouseEvent | null
    touchmove: TouchEvent | null
    pointerdown: PointerEvent | null
  }
  data: RowData[]
}

// cache lifetime: same as data
const domCache: HTMLDivElement[] = []
for (let i = 0; i < 5; i++) {
  const node = document.createElement("div")
  const sizeY = 30 + hash(i * 2) * 150 // [30, 180)
  const rand = hash(i * 2 + 1) * 40 + 40 // Range: [40, 80]
  // static properties: set once at creation
  node.className = "row"
  node.textContent = "Drag Me " + i
  node.style.width = `${rowSizeX}px`
  node.style.height = `${sizeY}px`
  node.style.outline = `1px solid hsl(205, 100%, ${rand}%)` // blue hue
  node.style.backgroundColor = `hsl(205, 100%, ${rand + 10}%)` // lighter blue hue
  domCache.push(node)
  document.body.appendChild(node)
}


const st: State = {
  animatedUntilTime: null,
  dragged: null,
  lastDragged: null,
  pointerState: 'up',
  pointer: [{x: 0, y: 0, time: 0}], // circular buffer. Btw, on page load, there's no way to render a first cursor state =(
  events: { mouseup: null, touchend: null, touchcancel: null, mousemove: null, touchmove: null, pointerdown: null },
  data: [],
}
{
  const windowSizeX = document.documentElement.clientWidth // excludes scroll bar & invariant under safari pinch zoom
  for (let i = 0; i < 5; i++) {
    const sizeY = 30 + hash(i * 2) * 150 // [30, 180)
    st.data.push({
      id: i + '', // gonna drag rows around so we can't refer to a row by index. Assign a stable id
      sizeY,
      x: spring(center(rowSizeX, windowSizeX)),
      y: spring(0),
      scale: spring(1),
    })
  }
}
function springForEach(f: (s: SpringConfig) => void) {
  for (const d of st.data) {
    f(d.x); f(d.y); f(d.scale) // no different than [a, b, c].forEach(f)
  }
}

// === events
// See docs/Input.md.
window.addEventListener('resize', () => scheduleRender())
window.addEventListener("mouseup", (e) => {st.events.mouseup = e; scheduleRender()})
window.addEventListener("touchend", (e) => {st.events.touchend = e; scheduleRender()})
window.addEventListener("touchcancel", (e) => {st.events.touchcancel = e; scheduleRender()})
window.addEventListener("mousemove", (e) => {st.events.mousemove = e; scheduleRender()})
window.addEventListener("touchmove", (e) => {st.events.touchmove = e; scheduleRender()})
window.addEventListener('pointerdown', (e) => {st.events.pointerdown = e; scheduleRender()})

// === hit testing logic. Boxes' hit area should be static and not follow their current animated state usually (but we can do either). Use the dynamic area here for once
function hitTest(data: RowData[], pointer: PointerSample) {
  for (const d of data) {
    const {x, y, sizeY} = d
    if (x.pos <= pointer.x && pointer.x < x.pos + rowSizeX && y.pos <= pointer.y && pointer.y < y.pos + sizeY) return d // pointer on this box
  }
  return null
}

function render(now: number) {
  // === step 0: process events
  // mouseup/touchend
  if (st.events.mouseup != null || st.events.touchend != null || st.events.touchcancel != null) st.pointerState = 'up'
  if (st.events.mouseup != null) st.pointer.push({x: st.events.mouseup.pageX, y: st.events.mouseup.pageY, time: st.events.mouseup.timeStamp})
  if (st.events.touchcancel != null) {
    const touch = st.events.touchcancel.changedTouches[0]
    if (touch != null) st.pointer.push({x: touch.pageX, y: touch.pageY, time: st.events.touchcancel.timeStamp})
  }
  if (st.events.touchend != null) {
    const touch = st.events.touchend.changedTouches[0]
    if (touch != null) st.pointer.push({x: touch.pageX, y: touch.pageY, time: st.events.touchend.timeStamp})
  }
  // move
  // when scrolling (which might schedule a render), a container's pointermove doesn't trigger, so the pointer's local coordinates are stale
  // this means we should only use pointer's global coordinates, which is always right
  if (st.events.mousemove != null) st.pointer.push({x: st.events.mousemove.pageX, y: st.events.mousemove.pageY, time: st.events.mousemove.timeStamp})
  if (st.events.touchmove != null) st.pointer.push({x: st.events.touchmove.touches[0]!.pageX, y: st.events.touchmove.touches[0]!.pageY, time: st.events.touchmove.timeStamp})
  // down
  if (st.events.pointerdown != null) {
    st.pointerState = 'firstDown'
    st.pointer.push({x: st.events.pointerdown.pageX, y: st.events.pointerdown.pageY, time: st.events.pointerdown.timeStamp})
  }

  // === step 1: batched DOM reads (to avoid accidental DOM read & write interleaving)
  const windowSizeX = document.documentElement.clientWidth // excludes scroll bar & invariant under safari pinch zoom
  const pointerLast = st.pointer.at(-1)! // guaranteed non-null since pointer.length >= 1

  // === step 2: handle inputs-related state change
  let newDragged: DragInfo | null
  if (st.pointerState === 'down') newDragged = st.dragged
  else if (st.pointerState === 'up') {
    if (st.dragged != null) {
      const dragIdx = st.data.findIndex(d => d.id === st.dragged!.id)
      let i = st.pointer.length - 1
      while (i > 0 && pointerLast.time - st.pointer[i - 1]!.time <= 100) i--
      const deltaTime = pointerLast.time - st.pointer[i]!.time
      if (deltaTime > 0) {
        const vx = (pointerLast.x - st.pointer[i]!.x) / deltaTime * 1000 // speed over ~1s
        const vy = (pointerLast.y - st.pointer[i]!.y) / deltaTime * 1000
        st.data[dragIdx]!.x.v += vx
        st.data[dragIdx]!.y.v += vy
      }
    }
    newDragged = null
  } else {
    const hit = hitTest(st.data, pointerLast)
    if (hit != null) newDragged = {id: hit.id, deltaX: pointerLast.x - hit.x.pos, deltaY: pointerLast.y - hit.y.pos}
    else newDragged = null
  }

  // === step 3: calculate new layout & cursor
  if (newDragged != null) { // first, swap row based on cursor position if needed
    let dragIdx = st.data.findIndex(d => d.id === newDragged.id) // guaranteed non-null
    const d = st.data[dragIdx]!
    const x = pointerLast.x - newDragged.deltaX
    const y = pointerLast.y - newDragged.deltaY
    d.x.pos = d.x.dest = x + (center(rowSizeX, windowSizeX) - x) / 1.5 // restrict horizontal drag a bit
    d.y.pos = d.y.dest = y
    d.scale.dest = 1.1
    // dragging row upward? Swap it with previous row if cursor is above the first half previous row
    while (dragIdx > 0 && shouldSwapUp(pointerLast.y, st.data[dragIdx - 1]!.y.dest, st.data[dragIdx - 1]!.sizeY)) {
      [st.data[dragIdx], st.data[dragIdx - 1]] = [st.data[dragIdx - 1]!, st.data[dragIdx]!] // swap
      dragIdx--
    }
    // dragging row downward? Swap it with next row if cursor is below the first half next row
    while (dragIdx < st.data.length - 1 && shouldSwapDown(pointerLast.y, st.data[dragIdx + 1]!.y.dest, st.data[dragIdx + 1]!.sizeY)) {
      [st.data[dragIdx], st.data[dragIdx + 1]] = [st.data[dragIdx + 1]!, st.data[dragIdx]!] // swap
      dragIdx++
    }
  }
  const rowTops = stackLayout(st.data.map(d => d.sizeY), windowPaddingTop)
  for (let rowIndex = 0; rowIndex < st.data.length; rowIndex++) {
    const d = st.data[rowIndex]!
    const top = rowTops[rowIndex]!
    if (newDragged != null && d.id === newDragged.id) { // already modified above
    } else {
      d.x.dest = center(rowSizeX, windowSizeX)
      d.y.dest = top
      d.scale.dest = 1
    }
  }
  const cursor =
    newDragged != null ? 'grabbing' // will be "grabbing" even if cursor isn't on the card! Try dragging to left/right extremes
    : hitTest(st.data, pointerLast) != null ? 'grab'
    : 'auto'

  // === step 4: run animation
  let newAnimatedUntilTime = st.animatedUntilTime ?? now
  const steps = Math.min(300, Math.floor((now - newAnimatedUntilTime) / msPerAnimationStep)) // run x spring steps. Decouple physics simulation from framerate!
  newAnimatedUntilTime += steps * msPerAnimationStep
  let stillAnimating = false
  springForEach(s => {
    for (let i = 0; i < steps; i++) springStep(s)
    if (Math.abs(s.v) < 0.01 && Math.abs(s.dest - s.pos) < 0.01) springGoToEnd(s) // close enough, done
    else stillAnimating = true
  })

  // === step 5: render. Batch DOM writes (dynamic properties only)
  for (let i = 0; i < st.data.length; i++) {
    const d = st.data[i]!, style = domCache[Number(d.id)]!.style
    style.transform = `translate3d(${d.x.pos}px,${d.y.pos}px,0) scale(${d.scale.pos})`
    style.zIndex =
      newDragged != null && d.id === newDragged.id ? String(st.data.length + 2)
      : st.lastDragged != null && d.id === st.lastDragged.id ? String(st.data.length + 1) // last dragged and released row still needs to animate into place; keep it high
      : String(i)
    if (newDragged != null && d.id === newDragged.id) {
      style.boxShadow = "rgba(0, 0, 0, 0.2) 0px 16px 32px 0px"
      style.opacity = '0.7'
    } else {
      style.boxShadow = "rgba(0, 0, 0, 0.2) 0px 1px 2px 0px"
      style.opacity = '1.0'
    }
  }
  document.body.style.cursor = cursor

  // === step 6: update state & prepare for next frame
  if (st.pointerState === 'firstDown') st.pointerState = 'down'
  if (st.dragged != null && newDragged == null) st.lastDragged = st.dragged
  st.dragged = newDragged
  st.animatedUntilTime = stillAnimating ? newAnimatedUntilTime : null // oxlint-disable-line no-unnecessary-condition
  if (st.pointerState === 'up') st.pointer = [{x: 0, y: 0, time: 0}]
  if (st.pointer.length > 20) st.pointer.shift() // keep last ~20
  st.events.mouseup = st.events.touchend = st.events.touchcancel = st.events.mousemove = st.events.touchmove = st.events.pointerdown = null

  return stillAnimating // oxlint-disable-line no-unnecessary-condition
}

scheduleRender()
