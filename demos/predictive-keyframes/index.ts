// === helpers ===

const msPerAnimationStep = 6

// Wellons lowbias32 (from ui-architecture.md)
function hash(n: number) {
  n = n | 0
  n = Math.imul((n >>> 16) ^ n, 0x21f0aaad)
  n = Math.imul((n >>> 15) ^ n, 0x735a2d97)
  return (((n >>> 15) ^ n) >>> 0) / 0x100000000
}

function hash21(p: number) {
  return { x: hash(p | 0), y: hash(((p | 0) + 0x9e3779b9) | 0) }
}

type SpringConfig = {
  pos: number
  dest: number
  v: number
  k: number
  b: number
}

function spring(pos: number, dest: number, v = 0, k = 130, b = 21): SpringConfig {
  return { pos, dest, v, k, b }
}

function springStep(s: SpringConfig) {
  const t = msPerAnimationStep / 1000
  const Fspring = -s.k * (s.pos - s.dest)
  const Fdamper = -s.b * s.v
  const a = Fspring + Fdamper
  s.v += a * t
  s.pos += s.v * t
}

function springGoToEnd(s: SpringConfig) { s.pos = s.dest; s.v = 0 }
function springMostlyDone(s: SpringConfig) { return Math.abs(s.v) < 0.01 && Math.abs(s.dest - s.pos) < 0.01 }

function length(x: number, y: number) { return Math.sqrt(x * x + y * y) }

function remap(value: number, oldMin: number, oldMax: number, newMin: number, newMax: number) {
  if (oldMin === oldMax) return (newMin + newMax) / 2
  return ((value - oldMin) / (oldMax - oldMin)) * (newMax - newMin) + newMin
}

type AABB = { x: number; y: number; z: number; w: number }

function overlapArea(a: AABB, b: AABB) {
  const left = Math.max(a.x, b.x), right = Math.min(a.z, b.z)
  const top = Math.max(a.y, b.y), bottom = Math.min(a.w, b.w)
  if (right > left && bottom > top) return (right - left) * (bottom - top)
  return 0
}

type ImageJob = {
  width: number
  height: number
  url: string
  aesthetic_score: number
}

/** @fit
 * given job.width: 1..10000
 * given job.height: 1..10000
 * result >= 0
 */
function boxHeight(
  width: number, // @fit 0..5000
  job: ImageJob,
) { return width / (job.width / job.height) }

// === Initialization ===

// Image data
const images: ImageJob[] = []
let nextSeed = 0

function generateImageData(count: number): ImageJob[] {
  const batch: ImageJob[] = []
  for (let i = 0; i < count; i++) {
    const s = nextSeed++
    const w = 300 + Math.floor(hash(s * 2) * 300)
    const h = 300 + Math.floor(hash(s * 2 + 1) * 300)
    batch.push({
      width: w, height: h,
      url: 'https://picsum.photos/seed/' + (s * 7 + 42) + '/' + w + '/' + h,
      aesthetic_score: hash(s + 100) > 0.95 ? 1 : 0,
    })
  }
  return batch
}

// Preload
let preloading = false
function scheduleFetch() {
  if (preloading) return
  preloading = true
  const batch = generateImageData(30)
  let next = 0
  function preloadOne() {
    if (next >= batch.length) { preloading = false; return }
    const data = batch[next++]!
    const img = new Image()
    img.onload = function() {
      img.decode()
        .then(function() { images.push(data); scheduleRender(); preloadOne() })
        .catch(function() { images.push(data); scheduleRender(); preloadOne() })
    }
    img.onerror = function() { preloadOne() }
    img.src = data.url
  }
  for (let i = 0; i < 5; i++) preloadOne()
}
scheduleFetch()

// State
type Box = {
  job: ImageJob
  id: number
  width: number
  centerX: number
  centerY: number
  vx: number
  vy: number
  opacitySpring: SpringConfig
  scaleSpring: SpringConfig
  enterProgress: number
  exiting: boolean
}

type World = {
  nextImageIndex: number
  boxes: Box[]
  nextBoxCountdown: number
}

let world: World = { nextImageIndex: 0, boxes: [], nextBoxCountdown: 0 }
let animatedUntilTime = 0

// cache lifetime: same as data
// animation stored explicitly so we cancel exactly our animation, not CSS transitions or other animations on the node
type DomCacheEntry = { node: HTMLDivElement; animation: Animation | null }
const domCache = new Map<number, DomCacheEntry>()

// Static DOM
const container = document.createElement('div')
container.style.cssText = 'position:relative;overflow:clip;width:100vw;height:100vh;background:radial-gradient(circle at center, hsl(210, 50%, 24%), hsl(210, 50%, 4%))'
document.body.appendChild(container)

const loadingEl = document.createElement('div')
loadingEl.style.cssText = 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#d1d5db;font-size:1.25rem'
loadingEl.textContent = 'Loading images...'
container.appendChild(loadingEl)

// === Simulation ===

function cloneBox(box: Box): Box {
  return { ...box, opacitySpring: { ...box.opacitySpring }, scaleSpring: { ...box.scaleSpring } }
}

type Vec2 = { x: number; y: number }

function calculateRepulsion(self: Box, other: Box, containerWH: Vec2): Vec2 {
  const sw = self.width * self.scaleSpring.pos
  const sh = boxHeight(sw, self.job)
  const ow = other.width * other.scaleSpring.pos
  const oh = boxHeight(ow, other.job)

  const ov = overlapArea(
    { x: self.centerX - sw / 2, y: self.centerY - sh / 2, z: self.centerX + sw / 2, w: self.centerY + sh / 2 },
    { x: other.centerX - ow / 2, y: other.centerY - oh / 2, z: other.centerX + ow / 2, w: other.centerY + oh / 2 },
  )

  const dx = self.centerX - other.centerX
  const dy = self.centerY - other.centerY
  const dist = length(dx, dy)
  if (dist === 0) return { x: 0, y: 0 }

  const skew = (containerWH.x / containerWH.y) * 0.8
  const force = remap(ov, 0, sw * sh, 0, 15 * self.enterProgress)
  return { x: (dx / dist) * force * skew, y: (dy / dist) * force }
}

function minEdgeDistPct(box: Box, containerWH: Vec2) {
  const sw = box.width * box.scaleSpring.pos
  const sh = boxHeight(sw, box.job)
  return Math.min(
    (box.centerX - sw / 2) / containerWH.x,
    (containerWH.x - (box.centerX + sw / 2)) / containerWH.x,
    (box.centerY - sh / 2) / containerWH.y,
    (containerWH.y - (box.centerY + sh / 2)) / containerWH.y,
  )
}

function simulate(w: World, containerWH: Vec2): World {
  const nw: World = {
    nextImageIndex: w.nextImageIndex,
    boxes: w.boxes.map(cloneBox),
    nextBoxCountdown: Math.max(0, w.nextBoxCountdown - msPerAnimationStep),
  }

  if (nw.nextImageIndex < images.length && nw.nextBoxCountdown === 0) {
    const job = images[nw.nextImageIndex]!
    const ar = job.width / job.height
    const targetArea = (containerWH.x * containerWH.y) / (job.aesthetic_score > 0 ? 7 : 12)
    const bw = Math.sqrt(targetArea * ar)
    const nudge = hash21(nw.nextImageIndex)

    nw.boxes.push({
      job, id: nw.nextImageIndex, width: bw,
      centerX: containerWH.x / 2 + nudge.x,
      centerY: containerWH.y / 2 + nudge.y,
      vx: 0, vy: 0,
      opacitySpring: spring(1, 1, 0, 130, 21),
      scaleSpring: spring(0, 1, 0, 130, 21),
      enterProgress: 0, exiting: false,
    })
    nw.nextImageIndex++
    const r = hash(nw.nextImageIndex + 500)
    nw.nextBoxCountdown = job.aesthetic_score > 0 ? 2500 + r * 1000 : 200 + r * 1300
  }

  const forces = nw.boxes.map(function(box) {
    let fx = 0, fy = 0
    for (let j = 0; j < nw.boxes.length; j++) {
      const other = nw.boxes[j]!
      if (box !== other) {
        const f = calculateRepulsion(box, other, containerWH)
        fx += f.x; fy += f.y
      }
    }
    return { fx, fy }
  })

  for (let i = 0; i < nw.boxes.length; i++) {
    const box = nw.boxes[i]!
    box.vx += forces[i]!.fx
    box.vy += forces[i]!.fy
    box.centerX += box.vx
    box.centerY += box.vy
    box.vx *= 0.2
    box.vy *= 0.2

    const minDist = minEdgeDistPct(box, containerWH)
    box.scaleSpring.dest = 1 - Math.pow(0.9 - Math.max(0, minDist), 10)
    springStep(box.opacitySpring)
    springStep(box.scaleSpring)
    if (springMostlyDone(box.opacitySpring)) springGoToEnd(box.opacitySpring)
    if (springMostlyDone(box.scaleSpring)) springGoToEnd(box.scaleSpring)
    box.enterProgress = Math.min(1, box.enterProgress + msPerAnimationStep / 1000)

    if (!box.exiting && minDist <= 0.05) {
      box.exiting = true
      box.opacitySpring.dest = 0
    }
  }

  nw.boxes = nw.boxes.filter(function(box) { return !(box.exiting && box.opacitySpring.pos === 0) })
  return nw
}

// === Keyframes ===

function boxStyle(box: Box): Keyframe {
  const h = boxHeight(box.width, box.job)
  const aesthetic = box.job.aesthetic_score > 0
  return {
    display: 'block',
    transform: 'translate3d(' + (box.centerX - box.width / 2) + 'px, ' + (box.centerY - h / 2) + 'px, 0) scale(' + box.scaleSpring.pos + ')',
    opacity: box.opacitySpring.pos,
    boxShadow: aesthetic
      ? '0 0 8px 4px rgba(255, 165, 0, 1), 0 0 40px 12px rgba(255, 165, 0, ' + (box.opacitySpring.pos * 0.6) + ')'
      : '0 4px 20px rgba(0, 0, 0, 0.5), 0 0 30px rgba(255, 255, 255, 0.1)',
  }
}

function animationConfig(kf: Keyframe[]): KeyframeAnimationOptions {
  return {
    duration: msPerAnimationStep * (kf.length - 1),
    easing: 'steps(' + (kf.length - 1) + ', end)',
    fill: 'forwards',
  }
}

type FrameEntry = { box: Box; keyframes: Keyframe[]; animation: Animation | null }

function addKeyframes(w: World, frame: number, framesMap: Map<number, FrameEntry>) {
  const idToBox = new Map<number, Box>()
  for (let i = 0; i < w.boxes.length; i++) idToBox.set(w.boxes[i]!.id, w.boxes[i]!)

  framesMap.forEach(function(entry, id) {
    const box = idToBox.get(id)
    entry.keyframes.push(box != null ? boxStyle(box) : { display: 'none' })
  })

  for (let i = 0; i < w.boxes.length; i++) {
    const box = w.boxes[i]!
    if (!framesMap.has(box.id)) {
      const pad: Keyframe[] = []
      for (let j = 0; j < frame; j++) pad.push({ display: 'none' })
      pad.push(boxStyle(box))
      framesMap.set(box.id, { box, keyframes: pad, animation: null })
    }
  }
}

// === Scheduler ===

let scheduledTimeout: ReturnType<typeof setTimeout> | null = null
let scheduledRaf: number | null = null
function scheduleRender() {
  if (scheduledTimeout != null || scheduledRaf != null) return
  scheduledTimeout = setTimeout(function() {
    scheduledTimeout = null
    scheduledRaf = requestAnimationFrame(function(now) {
      scheduledRaf = null
      render(now)
    })
  }, 300)
}

// === Render ===

function render(now: number) {
  // DOM reads (batched)
  const cw = document.documentElement.clientWidth
  const ch = document.documentElement.clientHeight
  const containerWH: Vec2 = { x: cw, y: ch }

  // Cancel previous animations
  domCache.forEach(function(entry) {
    if (entry.animation != null) entry.animation.cancel()
  })

  // Catch up simulation
  if (animatedUntilTime === 0) animatedUntilTime = now
  const steps = Math.min(300, Math.floor((now - animatedUntilTime) / msPerAnimationStep))
  animatedUntilTime += steps * msPerAnimationStep
  for (let i = 0; i < steps; i++) {
    world = simulate(world, containerWH)
  }

  // Build predictive keyframes
  const framesMap = new Map<number, FrameEntry>()
  const predictiveFrameCount = Math.ceil(1200 / msPerAnimationStep)
  let predicted = world
  for (let i = 0; i <= predictiveFrameCount; i++) {
    addKeyframes(predicted, i, framesMap)
    predicted = simulate(predicted, containerWH)
  }

  // DOM writes (batched)

  // Loading indicator
  if (images.length > 0 && loadingEl.parentNode != null) loadingEl.remove()

  // Remove nodes for boxes no longer in framesMap
  domCache.forEach(function(entry, id) {
    if (!framesMap.has(id)) {
      entry.node.remove()
      domCache.delete(id)
    }
  })

  // Create new nodes and start animations
  framesMap.forEach(function(entry, id) {
    let cached = domCache.get(id)
    if (cached == null) {
      const node = document.createElement('div')
      node.className = 'box'
      const h = boxHeight(entry.box.width, entry.box.job)
      node.style.cssText = 'position:absolute;max-width:none;will-change:transform;transform-origin:center;border-radius:8px;background-size:contain;background-repeat:no-repeat;width:' + entry.box.width + 'px;height:' + h + 'px;background-image:url(' + entry.box.job.url + ')'
      container.appendChild(node)
      cached = { node, animation: null }
      domCache.set(id, cached)
    }
    cached.animation = cached.node.animate(entry.keyframes, animationConfig(entry.keyframes))
  })

  // Fetch next batch if running low
  if (world.nextImageIndex > images.length - 20) scheduleFetch()

  // Schedule next render
  scheduleRender()
}

scheduleRender()
