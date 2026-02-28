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

// === analytical spring (closed-form underdamped solution) ===
// x(t) = dest + e^(-α·t) · (A·cos(ω·t) + B·sin(ω·t))
// A and B are determined by initial position and velocity
type ASpring = { dest: number; A: number; B: number; t0: number }

function aspringCreate(pos: number, dest: number, vel: number, t0: number): ASpring {
  const x0 = pos - dest
  return { dest, A: x0, B: (vel + alpha * x0) / omega, t0 }
}
function aspringSample(s: ASpring, now: number): [pos: number, vel: number] {
  const t = (now - s.t0) / 1000
  const decay = Math.exp(-alpha * t)
  const cos = Math.cos(omega * t)
  const sin = Math.sin(omega * t)
  return [
    s.dest + decay * (s.A * cos + s.B * sin),
    decay * ((omega * s.B - alpha * s.A) * cos - (omega * s.A + alpha * s.B) * sin)
  ]
}
function aspringRetarget(s: ASpring, newDest: number, now: number): ASpring {
  const [pos, vel] = aspringSample(s, now)
  return aspringCreate(pos, newDest, vel, now)
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

const cx = document.documentElement.clientWidth / 2
const cy = document.documentElement.clientHeight / 2
const pairs: Pair[] = []
let animatedUntilTime = 0

// === DOM setup ===
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
  pairs.push({
    numX: spring(x), numY: spring(y),
    anaX: aspringCreate(x, x, 0, now), anaY: aspringCreate(y, y, 0, now),
    numEl, anaEl
  })
}

// button
const btn = document.createElement('button')
btn.textContent = 'Fling!'
btn.style.cssText = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);padding:10px 30px;font-size:18px;border:none;border-radius:8px;background:#e94560;color:#fff;cursor:pointer;z-index:1;font-family:system-ui'
document.body.appendChild(btn)

// legend + error readout
const legend = document.createElement('div')
legend.style.cssText = 'position:fixed;bottom:20px;left:20px;right:20px;font:14px system-ui;color:#888;display:flex;justify-content:space-between'
document.body.appendChild(legend)

const legendLabel = document.createElement('span')
legendLabel.innerHTML = '&#9679; Numerical (Euler) &nbsp; &#9675; Analytical (closed-form)'
legend.appendChild(legendLabel)

const errEl = document.createElement('span')
legend.appendChild(errEl)

// === events ===
btn.addEventListener('click', () => {
  const now = document.timeline.currentTime as number
  const margin = 80
  const w = document.documentElement.clientWidth
  const h = document.documentElement.clientHeight

  for (const p of pairs) {
    const destX = margin + Math.random() * (w - margin * 2)
    const destY = margin + Math.random() * (h - margin * 2)
    p.numX.dest = destX
    p.numY.dest = destY
    p.anaX = aspringRetarget(p.anaX, destX, now)
    p.anaY = aspringRetarget(p.anaY, destY, now)
  }

  if (!scheduledRender) {
    animatedUntilTime = now
    scheduleRender()
  }
})

// === render ===
function render(now: number): boolean {
  const steps = Math.min(300, Math.floor((now - animatedUntilTime) / msPerAnimationStep))
  animatedUntilTime += steps * msPerAnimationStep

  for (let i = 0; i < steps; i++) {
    for (const p of pairs) {
      springStep(p.numX)
      springStep(p.numY)
    }
  }

  let anyActive = false
  let errText = ''

  for (const p of pairs) {
    // numerical: snap to end if done
    const numDone = springDone(p.numX) && springDone(p.numY)
    if (numDone) {
      p.numX.pos = p.numX.dest; p.numX.v = 0
      p.numY.pos = p.numY.dest; p.numY.v = 0
    }

    // analytical: sample at current time
    const [axRaw, avx] = aspringSample(p.anaX, now)
    const [ayRaw, avy] = aspringSample(p.anaY, now)
    const anaDone = Math.abs(avx) < 0.01 && Math.abs(p.anaX.dest - axRaw) < 0.01
                 && Math.abs(avy) < 0.01 && Math.abs(p.anaY.dest - ayRaw) < 0.01
    const ax = anaDone ? p.anaX.dest : axRaw
    const ay = anaDone ? p.anaY.dest : ayRaw

    if (!numDone || !anaDone) anyActive = true

    p.numEl.style.transform = `translate(${p.numX.pos - dotSize / 2}px,${p.numY.pos - dotSize / 2}px)`
    p.anaEl.style.transform = `translate(${ax - ringSize / 2}px,${ay - ringSize / 2}px)`

    // divergence between the two methods
    const dx = p.numX.pos - ax
    const dy = p.numY.pos - ay
    errText += `${Math.sqrt(dx * dx + dy * dy).toFixed(1)}px `
  }

  errEl.textContent = 'divergence: ' + errText
  return anyActive
}
