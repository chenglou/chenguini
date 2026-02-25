// === scheduler
let scheduledRender = false
function scheduleRender() {
  if (scheduledRender) return
  scheduledRender = true
  requestAnimationFrame(function renderAndMaybeScheduleAnotherRender(now) {
    scheduledRender = false
    if (render(now)) scheduleRender()
  })
}

// === spring physics (same as demo_drag)
const msPerAnimationStep = 4

type SpringConfig = {
  pos: number
  dest: number
  v: number
  k: number
  b: number
}

function spring(pos: number, v = 0, k = 290, b = 24): SpringConfig {
  return {pos, dest: pos, v, k, b}
}
function springStep(config: SpringConfig) {
  const t = msPerAnimationStep / 1000
  const {pos, dest, v, k, b} = config
  const Fspring = -k * (pos - dest)
  const Fdamper = -b * v
  const a = Fspring + Fdamper
  const newV = v + a * t
  const newPos = pos + newV * t
  config.pos = newPos; config.v = newV
}
function springGoToEnd(config: SpringConfig) {
  config.pos = config.dest; config.v = 0
}

// === exponential decay: calculate where a flick with given velocity would rest
// v(t) = v0 * e^(-friction * t), position integrates to v0/friction * (1 - e^(-friction*t))
// at rest (t->inf): displacement = v0 / friction
const decayFriction = 4.5 // tunable
function decayRestPos(pos: number, velocity: number) {
  return pos + velocity / decayFriction
}

// === layout
const pipW = 120, pipH = 80, cornerPad = 20
function getCorners(w: number, h: number) {
  return [
    {x: cornerPad, y: cornerPad},                       // top-left
    {x: w - pipW - cornerPad, y: cornerPad},             // top-right
    {x: cornerPad, y: h - pipH - cornerPad},             // bottom-left
    {x: w - pipW - cornerPad, y: h - pipH - cornerPad},  // bottom-right
  ]
}
function nearestCorner(x: number, y: number, w: number, h: number) {
  const corners = getCorners(w, h)
  let best = corners[0]!, bestDist = Infinity
  for (const c of corners) {
    const d = (c.x - x) ** 2 + (c.y - y) ** 2
    if (d < bestDist) { bestDist = d; best = c }
  }
  return best
}

// === state
type PointerSample = {x: number; y: number; time: number}

type State = {
  animatedUntilTime: number | null
  mode: 'idle' | 'dragging'
  showRestMarker: boolean
  // The two-spring system:
  // spring_1: current_pos -> rest_pos (carries flick velocity)
  // spring_2: rest_pos -> corner
  // final_pos = spring_1 + (spring_2 - rest_pos)
  spring1x: SpringConfig
  spring1y: SpringConfig
  spring2x: SpringConfig
  spring2y: SpringConfig
  restPosX: number
  restPosY: number
  // drag state
  dragOffsetX: number
  dragOffsetY: number
  dragPosX: number
  dragPosY: number
  pointerHistory: PointerSample[]
  events: {
    mouseup: MouseEvent | null
    touchend: TouchEvent | null
    mousemove: MouseEvent | null
    touchmove: TouchEvent | null
    pointerdown: PointerEvent | null
  }
}

const initCorner = getCorners(document.documentElement.clientWidth, document.documentElement.clientHeight)[2]! // bottom-left

const st: State = {
  animatedUntilTime: null,
  mode: 'idle',
  showRestMarker: false,
  spring1x: spring(initCorner.x),
  spring1y: spring(initCorner.y),
  spring2x: spring(initCorner.x),
  spring2y: spring(initCorner.y),
  restPosX: initCorner.x,
  restPosY: initCorner.y,
  dragOffsetX: 0,
  dragOffsetY: 0,
  dragPosX: 0,
  dragPosY: 0,
  pointerHistory: [],
  events: { mouseup: null, touchend: null, mousemove: null, touchmove: null, pointerdown: null },
}

// DOM
const pipNode = document.createElement('div')
pipNode.className = 'pip'
pipNode.textContent = 'PiP'
document.body.appendChild(pipNode)

const restMarker = document.createElement('div')
restMarker.className = 'rest-marker'
document.body.appendChild(restMarker)

// corner markers
{ const w = document.documentElement.clientWidth, h = document.documentElement.clientHeight
  for (const c of getCorners(w, h)) {
    const m = document.createElement('div')
    m.className = 'corner-marker'
    m.style.left = (c.x + pipW / 2) + 'px'
    m.style.top = (c.y + pipH / 2) + 'px'
    document.body.appendChild(m)
  }
}

// === events
window.addEventListener("mouseup", (e) => {st.events.mouseup = e; scheduleRender()})
window.addEventListener("touchend", (e) => {st.events.touchend = e; scheduleRender()})
window.addEventListener("mousemove", (e) => {st.events.mousemove = e; scheduleRender()})
window.addEventListener("touchmove", (e) => {st.events.touchmove = e; scheduleRender()})
window.addEventListener('pointerdown', (e) => {st.events.pointerdown = e; scheduleRender()})

// === hit test against current rendered position
function currentPos() {
  if (st.mode === 'dragging') return {x: st.dragPosX, y: st.dragPosY}
  return {x: st.spring1x.pos + (st.spring2x.pos - st.restPosX), y: st.spring1y.pos + (st.spring2y.pos - st.restPosY)}
}
function hitTest(px: number, py: number) {
  const {x, y} = currentPos()
  return px >= x && px < x + pipW && py >= y && py < y + pipH
}

function triggerSnap(fromX: number, fromY: number, vx: number, vy: number, w: number, h: number) {
  st.showRestMarker = true

  // calculate decay rest position
  st.restPosX = decayRestPos(fromX, vx)
  st.restPosY = decayRestPos(fromY, vy)

  // which corner?
  const corner = nearestCorner(st.restPosX, st.restPosY, w, h)

  // spring_1: from current position to rest_pos, with flick velocity
  st.spring1x.pos = fromX; st.spring1x.dest = st.restPosX; st.spring1x.v = vx
  st.spring1y.pos = fromY; st.spring1y.dest = st.restPosY; st.spring1y.v = vy

  // spring_2: from rest_pos to corner
  st.spring2x.pos = st.restPosX; st.spring2x.dest = corner.x; st.spring2x.v = 0
  st.spring2y.pos = st.restPosY; st.spring2y.dest = corner.y; st.spring2y.v = 0

  st.animatedUntilTime = null
}

function render(now: number) {
  // === DOM reads
  const windowW = document.documentElement.clientWidth
  const windowH = document.documentElement.clientHeight

  // === step 0: process events
  let pointerX: number | undefined, pointerY: number | undefined

  if (st.events.mousemove != null) { pointerX = st.events.mousemove.pageX; pointerY = st.events.mousemove.pageY }
  if (st.events.touchmove != null) { pointerX = st.events.touchmove.touches[0]!.pageX; pointerY = st.events.touchmove.touches[0]!.pageY }
  if (st.events.pointerdown != null) { pointerX = st.events.pointerdown.pageX; pointerY = st.events.pointerdown.pageY }

  // pointer down
  if (st.events.pointerdown != null && pointerX !== undefined && pointerY !== undefined && hitTest(pointerX, pointerY)) {
    const cur = currentPos() // must read before setting mode to 'dragging'
    st.mode = 'dragging'
    st.dragOffsetX = pointerX - cur.x
    st.dragOffsetY = pointerY - cur.y
    st.dragPosX = cur.x
    st.dragPosY = cur.y
    st.pointerHistory = [{x: pointerX, y: pointerY, time: now}]
  }

  // pointer move while dragging
  if (st.mode === 'dragging' && (st.events.mousemove != null || st.events.touchmove != null) && pointerX !== undefined && pointerY !== undefined) {
    st.dragPosX = pointerX - st.dragOffsetX
    st.dragPosY = pointerY - st.dragOffsetY
    st.pointerHistory.push({x: pointerX, y: pointerY, time: now})
    if (st.pointerHistory.length > 20) st.pointerHistory.shift()
  }

  // pointer up while dragging -> snap to nearest corner
  if (st.mode === 'dragging' && (st.events.mouseup != null || st.events.touchend != null)) {
    st.mode = 'idle'

    // calculate release velocity from last ~100ms of pointer history
    let vx = 0, vy = 0
    if (st.pointerHistory.length >= 2) {
      let i = st.pointerHistory.length - 1
      while (i > 0 && now - st.pointerHistory[i - 1]!.time <= 100) i--
      const dt = now - st.pointerHistory[i]!.time
      if (dt > 0) {
        const last = st.pointerHistory[st.pointerHistory.length - 1]!
        vx = (last.x - st.pointerHistory[i]!.x) / dt * 1000
        vy = (last.y - st.pointerHistory[i]!.y) / dt * 1000
      }
    }

    triggerSnap(st.dragPosX, st.dragPosY, vx, vy, windowW, windowH)
  }

  // === animation
  let stillAnimating = false

  if (st.mode !== 'dragging') {
    let newAnimatedUntilTime = st.animatedUntilTime ?? now
    const steps = Math.floor((now - newAnimatedUntilTime) / msPerAnimationStep)
    newAnimatedUntilTime += steps * msPerAnimationStep

    const allSprings = [st.spring1x, st.spring1y, st.spring2x, st.spring2y]
    for (const s of allSprings) {
      for (let i = 0; i < steps; i++) springStep(s)
      if (Math.abs(s.v) < 0.01 && Math.abs(s.dest - s.pos) < 0.01) springGoToEnd(s)
      else stillAnimating = true
    }
    st.animatedUntilTime = stillAnimating ? newAnimatedUntilTime : null // oxlint-disable-line no-unnecessary-condition
  }

  // === render
  const {x: renderX, y: renderY} = currentPos()
  pipNode.style.transform = `translate3d(${renderX}px,${renderY}px,0)`

  // rest marker
  restMarker.style.display = st.showRestMarker ? 'block' : 'none'
  restMarker.style.left = (st.restPosX + pipW / 2) + 'px'
  restMarker.style.top = (st.restPosY + pipH / 2) + 'px'

  // cursor
  const cursor = st.mode === 'dragging' ? 'grabbing'
    : (pointerX !== undefined && pointerY !== undefined && hitTest(pointerX, pointerY)) ? 'grab' : 'auto'
  document.body.style.cursor = cursor
  pipNode.style.cursor = cursor

  // === clear events
  st.events.mouseup = st.events.touchend = st.events.mousemove = st.events.touchmove = st.events.pointerdown = null

  return st.mode === 'dragging' || stillAnimating // oxlint-disable-line no-unnecessary-condition
}

scheduleRender()
