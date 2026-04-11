/*
TODOs:
- drag today dot
- tooltip
- gl?
*/

const life = Math.floor(75 * 365.25)
const today = new Date().getDay() // sunday = 0
const age = Math.floor((31 * 365.25 + 6 * 30.5 - 10) / 7) * 7 + today - 1 // rough days, rounded to week, 0-indexed
const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]

// === generic helpers
function hash(n: number) { // random for a seed value n. For fun coloring, debugging, etc
  n = Math.imul((n >>> 16) ^ n, 0x21f0aaad);
  n = Math.imul((n >>> 15) ^ n, 0x735a2d97);
  return (((n >>> 15) ^ n) >>> 0) / 0x100000000;
}

// === constant layout metrics. The rest is dynamic
const gridGap = 8
const leftBlockRadius: [number, number, number, number] = [99, 0, 0, 99]
const rightBlockRadius: [number, number, number, number] = [0, 99, 99, 0]
const pillRadius: [number, number, number, number] = [99, 99, 99, 99]
function radius(i: number): [number, number, number, number] | 0 {
  if (i % 7 === 0) return leftBlockRadius
  if (i % 7 === 6) return rightBlockRadius
  return 0
}

// === state
const customDot_ = localStorage.getItem('customDot')
type State = {
  customDot: number | null
  customDotValue: string | null
  pointerState: 'down' | 'up' | 'firstDown'
  pointer: {x: number; y: number}
  events: {
    click: MouseEvent | null
    input: Event | null
    mouseup: MouseEvent | null
    mousemove: MouseEvent | null
    pointerdown: PointerEvent | null
  }
}

const st: State = {
  customDot: customDot_ == null ? null : parseInt(customDot_),
  customDotValue: localStorage.getItem('customDotValue'),
  pointerState: 'up',
  pointer: {x: -Infinity, y: -Infinity}, // btw, on page load, there's no way to render a first cursor state =(
  events: {click: null, input: null, mouseup: null, mousemove: null, pointerdown: null},
}
// cache lifetime: same as data
let domCache: {canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; tooltip: HTMLInputElement}
{
  const canvas = document.createElement('canvas')
  const tooltip = document.createElement('input')
  tooltip.id = 'tooltip'
  tooltip.placeholder = 'Set goal...'
  document.body.appendChild(canvas)
  document.body.appendChild(tooltip)
  domCache = {canvas, ctx: canvas.getContext('2d')!, tooltip}
}

// === scheduler
let scheduledRaf: number | null = null
function scheduleRender() {
  if (scheduledRaf != null) return
  scheduledRaf = requestAnimationFrame(function renderAndMaybeScheduleAnotherRender() {
    scheduledRaf = null
    render()
  })
}

// === events
// See docs/Input.md.
window.addEventListener('resize', () => scheduleRender())
window.addEventListener('click', (e) => {st.events.click = e; scheduleRender()})
domCache.tooltip.addEventListener('input', (e) => {st.events.input = e; scheduleRender()})
window.addEventListener("mouseup", (e) => {st.events.mouseup = e; scheduleRender()})
window.addEventListener('mousemove', (e) => {st.events.mousemove = e; scheduleRender()})
window.addEventListener('pointerdown', (e) => {st.events.pointerdown = e; scheduleRender()})

import {gridSizing, hitTest} from './grid-sizing'

function render() {
  // === step 0: process events
  // click
  let clicked = false
  if (st.events.click != null) {
    clicked = true
    // needed to update coords even when we already track mousemove. E.g. in Chrome, right click context menu, move elsewhere, then click to dismiss. BAM, mousemove triggers with stale/wrong (??) coordinates... Click again without moving, and now you're clicking on the wrong thing
    st.pointer.x = st.events.click.pageX - window.scrollX; st.pointer.y = st.events.click.pageY - window.scrollY
  }
  // input
  const newCustomDotValue = st.events.input == null ? null : (st.events.input.target as HTMLInputElement).value
  // mouseup
  if (st.events.mouseup != null) st.pointerState = 'up'
  // mousemove
  if (st.events.mousemove != null) {
    // when scrolling (which might schedule a render), a container's mousemove doesn't trigger, so the pointer's local coordinates are stale
    // this means we should only use pointer's global coordinates, which is always right (thus the subtraction of scroll)
    st.pointer.x = st.events.mousemove.pageX -/*toGlobal*/window.scrollX; st.pointer.y = st.events.mousemove.pageY -/*toGlobal*/window.scrollY
    // btw, pointer can exceed document bounds, e.g. dragging reports back out-of-bound, legal negative values
  }
  // pointerdown
  if (st.events.pointerdown != null) {
    st.pointerState = 'firstDown'
    st.pointer.x = st.events.pointerdown.pageX - window.scrollX; st.pointer.y = st.events.pointerdown.pageY - window.scrollY
  }

  // === step 1: batched DOM reads (to avoid accidental DOM read & write interleaving)
  const devicePixelRatio = window.devicePixelRatio
  const windowSizeX = document.documentElement.clientWidth
  const windowSizeY = window.innerHeight
  const gridSizeX = windowSizeX - gridGap
  const gridSizeY = windowSizeY - gridGap

  const {blockSize, countX, countY, gridFinalSizeX, gridFinalSizeY} = gridSizing(life, gridSizeX, gridSizeY)
  const gridLeft = (windowSizeX - gridFinalSizeX) / 2 // center
  const gridTop = (windowSizeY - gridFinalSizeY) / 2 // center

  // === step 2: handle inputs-related state change
  const hover = hitTest(blockSize, countX, countY, gridLeft, gridTop, gridFinalSizeX, gridFinalSizeY, st.pointer)
  const newCustomDot =
    clicked && hover === st.customDot ? null
    : clicked ? hover
    : st.customDot
  const cursor =
    hover == null ? 'auto'
    : hover === age || hover === newCustomDot ? 'move'
    : 'pointer'

  // === step 5: render. Batch DOM writes (dynamic properties only)
  const {canvas, ctx, tooltip} = domCache
  // no blurry canvas: coderwall.com/p/vmkk6a/how-to-make-the-canvas-not-look-like-crap-on-retina
  canvas.width = gridFinalSizeX * devicePixelRatio // different than canvas.style.width. Btw this clears the canvas as well
  canvas.height = gridFinalSizeY * devicePixelRatio
  canvas.style.width = `${gridFinalSizeX}px`
  canvas.style.height = `${gridFinalSizeY}px`
  canvas.style.left = `${gridLeft}px`
  canvas.style.top = `${gridTop}px`
  ctx.scale(devicePixelRatio, devicePixelRatio)
  ctx.clearRect(0, 0, gridFinalSizeX, gridFinalSizeY)

  ctx.strokeStyle = '#22272e'
  ctx.lineWidth = 0.5
  const emptyColor = 'hsl(214, 13%, 25%)'
  const filledColor = '#39d353'
  for (let i = 0; i < life - 1; ) {
    const x = i % countX * blockSize
    const y = Math.floor(i / countX) * blockSize

    const iPill = Math.floor(i / 7), agePill = Math.floor(age / 7), lifePill = Math.floor(life / 7)
    ctx.beginPath()
    if (iPill < agePill) {
      ctx.fillStyle = filledColor
      ctx.roundRect(x, y, blockSize * 7, blockSize, pillRadius)
      i += 7
    } else if (iPill > agePill && iPill !== lifePill) { // TODO: check condition
      ctx.fillStyle = emptyColor
      ctx.roundRect(x, y, blockSize * 7, blockSize, pillRadius)
      i += 7
    } else {
      ctx.fillStyle =
        i < age ? filledColor
        : i === age ? '#006d32'
        : emptyColor
      ctx.roundRect(x, y, blockSize, blockSize, radius(i))
      i++
    }
    ctx.fill()
    ctx.stroke()
  }

  function drawOneDot(i: number) {
    const x = i % countX * blockSize
    const y = Math.floor(i / countX) * blockSize
    ctx.beginPath()
    ctx.roundRect(x, y, blockSize, blockSize, radius(i))
    ctx.fill()
    ctx.stroke()
  }
  if (hover != null) {
    ctx.fillStyle = `hsl(${hash(hover) * 360}, ${hash(hover) * 30 + 70}%, 60%)`
    drawOneDot(hover)
  }
  if (newCustomDot != null) {
    ctx.fillStyle = `hsl(${hash(newCustomDot) * 360}, ${hash(newCustomDot) * 60 + 30}%, 60%)`
    drawOneDot(newCustomDot)
  }
  { // last dot
    ctx.fillStyle = 'red'
    drawOneDot(life - 1)
  }

  for (let i = 1; i < countX; i++) {
    if (i % 7 === 0) continue
    ctx.moveTo(blockSize * i, 0)
    const height = i < Math.floor((life - (countY - 1) * countX) / 7) * 7 ? countY * blockSize : (countY - 1) * blockSize
    ctx.lineTo(blockSize * i, height)
    ctx.stroke()
  }

  document.body.style.cursor = cursor
  tooltip.style.left = `${st.pointer.x - 110}px`
  tooltip.style.top = `${st.pointer.y - 36}px`
  if (hover === age) {
    tooltip.style.display = 'block'
    tooltip.disabled = true
    tooltip.value = `You're ${Math.floor(age / 365.25)}, born in ${months[Math.floor(age % 365.25 / 30)]!}`
  } else if (hover === life - 1) {
    tooltip.style.display = 'block'
    tooltip.disabled = true
    tooltip.value = 'Good bye'
  } else {
    tooltip.style.display = hover != null && hover === newCustomDot ? 'block' : 'none'
    tooltip.disabled = false
    tooltip.value = newCustomDotValue ?? st.customDotValue ?? ''
  }
  // === commit state
  const customDotChanged = st.customDot !== newCustomDot
  const customDotValueChanged = newCustomDotValue != null && st.customDotValue !== newCustomDotValue
  if (customDotChanged) st.customDot = newCustomDot
  if (customDotValueChanged) st.customDotValue = newCustomDotValue
  st.events.click = st.events.input = st.events.mouseup = st.events.mousemove = st.events.pointerdown = null

  // === side effects
  tooltip.focus()
  if (customDotChanged) localStorage.setItem('customDot', String(newCustomDot)) // TODO: validate (e.g. out of range)
  if (customDotValueChanged) localStorage.setItem('customDotValue', String(newCustomDotValue)) // TODO: validate (e.g. out of range)
}

scheduleRender()
