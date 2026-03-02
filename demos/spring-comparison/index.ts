// === scheduler ===
let scheduledRender = false
function scheduleRender() {
  if (scheduledRender) return
  scheduledRender = true
  requestAnimationFrame(function renderAndMaybeScheduleAnotherRender(now) {
    scheduledRender = false
    if (render(now)) scheduleRender()
  })
}

// === spring constants ===
const msPerAnimationStep = 6
const stiffness = 333
const damping = 12
// derived constants for the analytical solution (underdamped: damping² < 4*stiffness)
const alpha = damping / 2 // exponential decay rate
const omega = Math.sqrt(stiffness - alpha * alpha) // damped angular frequency

// === numerical spring (symplectic Euler integration) ===
type Spring = { pos: number; dest: number; v: number }

function spring(pos: number): Spring {
  return { pos, dest: pos, v: 0 }
}
function springStep(s: Spring) {
  const dt = msPerAnimationStep / 1000
  const a = -stiffness * (s.pos - s.dest) - damping * s.v
  s.v += a * dt
  s.pos += s.v * dt
}
function springDone(s: Spring): boolean {
  return Math.abs(s.v) < 0.01 && Math.abs(s.dest - s.pos) < 0.01
}
function springGoToEnd(s: Spring) {
  s.pos = s.dest; s.v = 0
}

// === analytical spring (closed-form underdamped solution) ===
// x(t) = dest + e^(-α·t) · (A·cos(ω·t) + B·sin(ω·t))
// A and B are determined by initial position and velocity
type ASpring = { dest: number; A: number; B: number; t0: number }

function aspring(pos: number, dest: number, vel: number, t0: number): ASpring {
  const x0 = pos - dest
  return { dest, A: x0, B: (vel + alpha * x0) / omega, t0 }
}
function aspringSample(s: ASpring, now: number): { pos: number; vel: number } {
  const t = (now - s.t0) / 1000
  const decay = Math.exp(-alpha * t)
  const cos = Math.cos(omega * t)
  const sin = Math.sin(omega * t)
  return {
    pos: s.dest + decay * (s.A * cos + s.B * sin),
    vel: decay * ((omega * s.B - alpha * s.A) * cos - (omega * s.A + alpha * s.B) * sin)
  }
}
function aspringGoToEnd(s: ASpring) {
  s.A = 0; s.B = 0
}
function aspringDone(s: ASpring, now: number): boolean {
  const { pos, vel } = aspringSample(s, now)
  return Math.abs(vel) < 0.01 && Math.abs(s.dest - pos) < 0.01
}
function aspringRetarget(s: ASpring, newDest: number, now: number) {
  const { pos, vel } = aspringSample(s, now)
  const x0 = pos - newDest
  s.dest = newDest
  s.A = x0
  s.B = (vel + alpha * x0) / omega
  s.t0 = now
}

// === state ===
const colors = ['#ff6b6b', '#4ecdc4', '#ffe66d'] as const
const dotSize = 20
const ringSize = 28

type Pair = {
  numX: Spring; numY: Spring
  anaX: ASpring; anaY: ASpring
  numEl: HTMLDivElement; anaEl: HTMLDivElement
}

type State = {
  animatedUntilTime: number | null
  pairs: Pair[]
  events: { click: MouseEvent | null }
}

const st: State = { animatedUntilTime: null, pairs: [], events: { click: null } }

// === DOM setup ===
const cx = document.documentElement.clientWidth / 2
const cy = document.documentElement.clientHeight / 2
for (let i = 0; i < 3; i++) {
  const x = cx + (i - 1) * 80
  const y = cy
  const color = colors[i]!

  const numEl = document.createElement('div')
  numEl.style.cssText = `position:absolute;left:0;top:0;width:${dotSize}px;height:${dotSize}px;border-radius:50%;background:${color};pointer-events:none`
  numEl.style.transform = `translate(${x - dotSize / 2}px,${y - dotSize / 2}px)`
  document.body.appendChild(numEl)

  const anaEl = document.createElement('div')
  anaEl.style.cssText = `position:absolute;left:0;top:0;width:${ringSize}px;height:${ringSize}px;border-radius:50%;border:3px solid ${color};box-sizing:border-box;pointer-events:none`
  anaEl.style.transform = `translate(${x - ringSize / 2}px,${y - ringSize / 2}px)`
  document.body.appendChild(anaEl)

  const now = document.timeline.currentTime as number
  st.pairs.push({
    numX: spring(x), numY: spring(y),
    anaX: aspring(x, x, 0, now), anaY: aspring(y, y, 0, now),
    numEl, anaEl
  })
}

// cache lifetime: same as data
let domCache: { btn: HTMLButtonElement; errEl: HTMLSpanElement }
{
  const btn = document.createElement('button')
  btn.textContent = 'Fling!'
  btn.style.cssText = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);padding:10px 30px;font-size:18px;border:none;border-radius:8px;background:#e94560;color:#fff;cursor:pointer;z-index:1;font-family:system-ui'
  document.body.appendChild(btn)

  const legend = document.createElement('div')
  legend.style.cssText = 'position:fixed;bottom:20px;left:20px;right:20px;font:14px system-ui;color:#888;display:flex;justify-content:space-between'
  document.body.appendChild(legend)

  const legendLabel = document.createElement('span')
  legendLabel.innerHTML = '&#9679; Numerical (Euler) &nbsp; &#9675; Analytical (closed-form)'
  legend.appendChild(legendLabel)

  const errEl = document.createElement('span')
  legend.appendChild(errEl)

  domCache = { btn, errEl }
}

// === events ===
window.addEventListener('click', (e) => { st.events.click = e; scheduleRender() })

// === render ===
function render(now: number): boolean {
  // === DOM reads
  const w = document.documentElement.clientWidth
  const h = document.documentElement.clientHeight

  // === handle inputs
  if (st.events.click != null && st.events.click.target === domCache.btn) {
    const margin = 80
    for (const p of st.pairs) {
      const destX = margin + Math.random() * (w - margin * 2)
      const destY = margin + Math.random() * (h - margin * 2)
      p.numX.dest = destX
      p.numY.dest = destY
      aspringRetarget(p.anaX, destX, now)
      aspringRetarget(p.anaY, destY, now)
    }
  }

  // === animation
  let newAnimatedUntilTime = st.animatedUntilTime ?? now
  const steps = Math.min(300, Math.floor((now - newAnimatedUntilTime) / msPerAnimationStep))
  newAnimatedUntilTime += steps * msPerAnimationStep

  for (let i = 0; i < steps; i++) {
    for (const p of st.pairs) {
      springStep(p.numX)
      springStep(p.numY)
    }
  }

  let stillAnimating = false

  for (const p of st.pairs) {
    const numDone = springDone(p.numX) && springDone(p.numY)
    if (numDone) { springGoToEnd(p.numX); springGoToEnd(p.numY) }

    const anaDone = aspringDone(p.anaX, now) && aspringDone(p.anaY, now)
    if (anaDone) { aspringGoToEnd(p.anaX); aspringGoToEnd(p.anaY) }

    if (!numDone || !anaDone) stillAnimating = true
  }

  // === commit state
  st.events.click = null
  st.animatedUntilTime = stillAnimating ? newAnimatedUntilTime : null

  // === DOM writes
  let errText = ''
  for (const p of st.pairs) {
    const ax = aspringSample(p.anaX, now).pos
    const ay = aspringSample(p.anaY, now).pos

    p.numEl.style.transform = `translate(${p.numX.pos - dotSize / 2}px,${p.numY.pos - dotSize / 2}px)`
    p.anaEl.style.transform = `translate(${ax - ringSize / 2}px,${ay - ringSize / 2}px)`

    const dx = p.numX.pos - ax
    const dy = p.numY.pos - ay
    errText += `${Math.sqrt(dx * dx + dy * dy).toFixed(1)}px `
  }
  domCache.errEl.textContent = `divergence: ` + errText

  return stillAnimating
}

scheduleRender()
