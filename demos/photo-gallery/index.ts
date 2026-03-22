/*
## Features
- **Non-disruptive, interruptible transitions**. Animations don't block your ability to interact with the UI.
- **Optionally reduced motion for accessibility**.
- **[Layout-aware decoupled hit areas](https://youtu.be/MBSdQqZkXyc)**. In the gallery's line mode, the left & right cursor hit areas vertically extend to the window's edges, so that horizontally thin images don't have smaller hit areas than others. Hit areas also don't move with their image during transition, so you don't have to snipe click images. Consequently, rapidly clicking the left or right image doesn't accidentally dismiss the gallery (caused by clicking on a gap between image, or re-clicking on the newly centering image itself while it's still moving).
- **[Window resize transition](https://youtu.be/mfePLQ7OAEY)**. Just enough to convey what moved where.
- **[Anchor during resize](https://youtu.be/F2nawwZxy0g)**. No layout shift! Resize without losing what you're looking at.
- **[Area-based responsive image size](https://youtu.be/WkMRftTD4SA)**. Naive responsive layout uses the width of an item, but an image's visual impact is determined by its area. For the same width, square images visually appear bigger, while long images end up too thin. So we punish the formers by shrinking them, and grow the latters, to end up with more visually equal image sizes. Nice tangential article [here](https://www.dreamerux.com/articles/n2zhrp9ikfx2boypip3r2r9mhfy0um).
- **[Non-throttled cursor updates](https://youtu.be/ANgSxs0Y0Ys)**. The cursor state, when specified on the UI elements themselves (e.g. `cursor: 'zoom-in'`), doesn't update immediately during smooth scrolling. Hover effects also don't trigger til scrolling ends.
- **[Edge rubberbanding on the first & last item](https://youtu.be/K1BZcfgYGuY)**.
- **[Dynamic depth management](https://youtu.be/VKEdfOcjO1s)**. Proper z-index adjustments when images overlap. The center image in line view needs to be in front.
- **[Framerate-decoupled animation](https://www.kirupa.com/animations/fixing_frame_rate_for_consistent_animations.htm)**. Transitions run well and on time even when framerate is uneven, or when frames are completely dropped on lower-end devices.
- **[Spring physics](https://youtu.be/lmV07ZoruGA)** (exaggerated in the link for effect). Subtle playful bounces.
- **[Continous hover effect](https://youtu.be/AKmc_7groFY)**. The cursor attracts images magnetically, as opposed to a typical discrete, one-off upward lift transition trigger.
- **[Seamless repositioning on image dismissal](https://youtu.be/jyuYlebNNCg)**. In line view, navigating to a image and dismissing it transports you to the location of that image even if it's way further down the grid.
- **[Pretty selections](https://user-images.githubusercontent.com/1909539/205440816-ff666880-1acb-4ece-b548-51ad8b3af434.png)**. Select-all doesn't ruin the page's look.
- **[Routing](https://youtu.be/Sjpt65KFftg)**.
- **Occlusion culling**. Only render what's in view (sometime called virtualization). This puts a nice hard upper bound on the amount of DOM manipulations.
- **Keyboard inputs & multiple inputs coordination**. Concurrent keys and cursor events are resolved without pretending they're independent events.
- **Progressive image loading**. Though this could be done better.
- **Smoothness & performance**. Works on 120fps displays, including ProMotion.
- **Battery-friendly**. Fewer DOM nodes & no excessive tangential computations. You'll never get the Safari tab energy consumption warning.
- **Blur & brightness effects**. These help focusing on the middle image in the line view.
- **SEO-friendly**.
- Cool images =)

For developers:
- **Short, dependency-free code with no hidden control flow**.
- **Only the right properties are animated, and only at the right times**. E.g. on window resize, an image's `x/y/scale` correctly do NOT animate if it stays in the same place/column (and they also do animate if the image moves to a different slot in the grid entirely)
- **Fun debug mode with manual frame stepping**.
- **Guaranteed minimum render count**. Renders are batched per frame. Also no multi-frames cascading rerenders from wrongly ordered state changes.
- **Minimal DOM nodes**. A clean, wrapper-divs-free inspector experience.
*/

import {photoGalleryData} from './data'

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

type Spring = {
  pos: number
  dest: number
  v: number
  k: number
  b: number
}

function spring(pos: number, v = 0, k = 290, b = 30): Spring {
  return {pos, dest: pos, v, k, b} // k = stiffness, b = damping. Try https://chenglou.me/react-motion/demos/demo5-spring-parameters-chooser/
}
function springStep(config: Spring) {
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
function springGoToEnd(config: Spring) {
  config.pos = config.dest
  config.v = 0
}

// === generic helpers
function clamp(min: number, v: number, max: number) {
  return v > max ? max : v < min ? min : v
}

// === constant layout metrics. The rest is dynamic
const promptPaddingBottom = 8
const promptSizeY = 44 + promptPaddingBottom // 44 is a magic number. Doesn't show the 3rd line nor cuts the 2nd line on safari, mobile safari and chrome
const prompt1DSizeY = 64 + promptPaddingBottom // size in 1d mode
const boxesGapX = 24, boxesGapY = 24
const boxes1DGapX = 52, boxes1DGapY = 28
const windowPaddingTop = 40
const gapTopPeek = 40 // used when programmatically scrolling and wanting to show some gap at the top of a row
const hitArea1DSizeX = 100 // left and right click region in 1D mode

function colsBoxMaxSizeXF(containerSizeX: number) {
  const boxMinSizeX = 220 // Make sure that on mobile, this min width is big enough not to show 2 images per row. Also, this won't be respected if view's tiny
  const cols = clamp(1, Math.floor((containerSizeX - boxesGapX) / (boxMinSizeX + boxesGapX)), 7) // half of boxesGapX for container's left and right gap
  const boxMaxSizeX = (containerSizeX - boxesGapX - cols * boxesGapX) / cols
  return {cols, boxMaxSizeX}
}

const isSafari = navigator.userAgent.includes('Safari') && !navigator.userAgent.includes('Chrome') // Chrome also includes Safari in user-agent string
if (isSafari) {
  // alright *deep breath* Desktop Safari is fine, but iPad Safari behaves badly when items exceed the viewport in 1D mode (overflow hidden doesn't work!). This is prominent if you hold arrow right and check the GitHub logo move. It's especially pathological on Stage Manager and any other iPad Safari mode where the app window shrinks and bugs the browser more for whatever reason
  // so we use contain: layout plus viewport width and height to force the clipping of items. Now every browser behaves well with these, BUT Chrome doesn't have rubberbanding of inner elements (only page-wide one). So YES I'm switching to scrolling page instead of document body for Chrome JUST FOR THE RUBBER BANDING on macOS.
  // this is how much I care about edge scroll rubber banding. Thanks Bas Ording & old Apple. If browser specs folks were more visual & interactions-driven as opposed to being static document-driven then we wouldn't have a decade-long decline of visual & interaction design as a discipline.
  // it's a good thing these hacks are easy to pull off under this architecture, and quite readable and even robust despite changing whole container logics
  document.body.style.contain = 'layout'
  document.body.style.width = '100vw'
  document.body.style.height = '100vh'
}

// === state. Plus one in the URL's hash
const debug = false // toggle this for manually stepping through animation frames (press key A)
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')

type BoxData = {
  id: string
  prompt: string
  naturalSizeX: number // image's original size
  ar: number // aspect ratio
  scale: Spring
  fxFactor: Spring
  // "base" values are the regular, non-animated values. Final visual value = base value + residual (see below)
  x: number
  y: number
  sizeX: number
  sizeY: number
  // "residuals" are animation-specific deltas that usually go toward 0. Their current value (spring pos) is the delta between e.g. the current visual x position, and the object's actual x position (the destination) without animation
  // naively, we'd just use a single field that's `x: Spring`. But means the object's x is animating even during e.g. window resize and other times where animation is undesirable. This is tasteless
  // so instead we keep x as the regular animation-less scalar value, and xResidual usually at 0 too (aka unanimated). And when we _do_ wanna animate x, we instead set x to the final destination, set residual to be the delta between current and final x, then derive the final visual x with the formula in the prev comment on base value
  xResidual: Spring
  yResidual: Spring
  sizeXResidual: Spring
  sizeYResidual: Spring
}

type State = {
  debugTimestamp: number
  animatedUntilTime: number | null
  anchor: number
  windowSizeX: number
  scrollY: number
  pointer: {x: number; y: number}
  events: {keydown: KeyboardEvent | null; click: MouseEvent | null; mousemove: MouseEvent | null}
  data: BoxData[]
}

function shiftSpringPos(s: Spring, delta: number) {
  s.pos += delta
}
function sizeXPos(d: BoxData) {
  return d.sizeX + d.sizeXResidual.pos
}
function sizeYPos(d: BoxData) {
  return d.sizeY + d.sizeYResidual.pos
}
function xPos(d: BoxData) {
  return d.x + d.xResidual.pos
}
function yPos(d: BoxData) {
  return d.y + d.yResidual.pos
}
// Set x/y/size right away. If this change should animate, stash the current on-screen delta in the residuals and let them settle back to 0.
function setLayout(d: BoxData, x: number, y: number, sizeX: number, sizeY: number, preservePosition: boolean, preserveSize: boolean) {
  const currentX = xPos(d), currentY = yPos(d)
  const currentSizeX = sizeXPos(d), currentSizeY = sizeYPos(d)
  d.x = x
  d.y = y
  d.sizeX = sizeX
  d.sizeY = sizeY
  if (preservePosition) {
    d.xResidual.pos = currentX - x
    d.yResidual.pos = currentY - y
  }
  if (preserveSize) {
    d.sizeXResidual.pos = currentSizeX - sizeX
    d.sizeYResidual.pos = currentSizeY - sizeY
  }
}
function get2DLayout(windowSizeX: number) {
  const {cols, boxMaxSizeX} = colsBoxMaxSizeXF(windowSizeX)
  const boxes2DSizeX: number[] = [], boxes2DSizeY: number[] = [], rowsTop: number[] = [windowPaddingTop] // length: number of rows + 1
  let rowMaxSizeY = 0
  for (let i = 0; i < photoGalleryData.length; i++) {
    const d = photoGalleryData[i]!
    const ar = d.w / d.h
    const imgMaxSizeY =
      ar === 1 ? boxMaxSizeX * 0.85 // square aspect ratio area too big. Shrink it
      : ar < 1 ? boxMaxSizeX * 1.05 // vertical images look a bit small. Grow it
      : boxMaxSizeX
    const sizeX = Math.min(d.w, boxMaxSizeX, imgMaxSizeY * ar)
    const sizeY = sizeX / ar + promptSizeY
    boxes2DSizeX.push(sizeX)
    boxes2DSizeY.push(sizeY)
    rowMaxSizeY = Math.max(rowMaxSizeY, sizeY)
    if (i % cols === cols - 1 || i === photoGalleryData.length - 1) { // last box of the row or last box ever
      rowsTop.push(rowsTop.at(-1)! + rowMaxSizeY + boxesGapY)
      rowMaxSizeY = 0
    }
  }
  return {cols, boxMaxSizeX, boxes2DSizeX, boxes2DSizeY, rowsTop}
}

let st: State; {
  const windowSizeX = document.documentElement.clientWidth
  const windowSizeY = document.documentElement.clientHeight
  const {cols, boxMaxSizeX, boxes2DSizeX, boxes2DSizeY, rowsTop} = get2DLayout(windowSizeX)
  st = {
    debugTimestamp: 0,
    animatedUntilTime: null,
    anchor: 0, // keep a box stable during resize layout shifts
    windowSizeX,
    scrollY: isSafari ? document.body.scrollTop : window.scrollY,
    pointer: {x: -Infinity, y: -Infinity}, // btw, on page load, there's no way to render a first cursor state =(
    events: { keydown: null, click: null, mousemove: null },
    data: photoGalleryData.map((d, i) => {
      const ar = d.w / d.h
      const sizeX = boxes2DSizeX[i]!, sizeY = boxes2DSizeY[i]!
      const currentRow = Math.floor(i / cols)
      const rowMaxSizeY = rowsTop[currentRow + 1]! - boxesGapY - rowsTop[currentRow]! // restore the row's max height
      const x = boxesGapX + (boxMaxSizeX + boxesGapX) * (i % cols) + (boxMaxSizeX - sizeX) / 2
      const y = rowsTop[currentRow]! + (rowMaxSizeY - sizeY) / 2
      return {
        id: d.id,
        prompt: d.prompt,
        naturalSizeX: d.w,
        ar,
        sizeX,
        sizeY,
        x,
        y,
        sizeXResidual: spring(0),
        sizeYResidual: spring(0), // image + prompt
        xResidual: spring(Math.floor(i / cols) * -windowSizeX - windowSizeX - x), // unfold from lower left. More visible on long screens
        yResidual: spring(windowSizeY + Math.floor(i / cols) * boxMaxSizeX - y),
        scale: spring(1),
        fxFactor: spring(20), // for brightness and blur
      }
    }),
  }
}
function springForEach(f: (s: Spring) => void) { // no spring ownership struggle between the spring library above vs consumer; un-inversion of control!
  for (const d of st.data) {
    f(d.sizeXResidual); f(d.sizeYResidual); f(d.xResidual); f(d.yResidual); f(d.scale); f(d.fxFactor) // no different than [a, b, c].forEach(f)
  }
}

// === events
// See docs/Input.md.
window.addEventListener('resize', () => scheduleRender())
window.addEventListener('scroll', () => scheduleRender(), true) // capture is needed for iPad Safari...
window.addEventListener('popstate', () => scheduleRender())
window.addEventListener('keydown', (e) => {st.events.keydown = e; scheduleRender()})
window.addEventListener('click', (e) => {st.events.click = e; scheduleRender()})
window.addEventListener('mousemove', (e) => {st.events.mousemove = e; scheduleRender()})

// === static DOM initialization. Just 1 in this app. The more you have here the more your app looks like a PDF document. Minimize
const dummyPlaceholder = document.createElement('div')
dummyPlaceholder.style.position = 'absolute'
dummyPlaceholder.style.width = '1px' // make it tiny in case it affects compositing... sigh lamport.azurewebsites.net/pubs/future-of-computing.pdf
document.body.append(dummyPlaceholder)
const domCache = new Map<string, HTMLDivElement>() // cache lifetime: on visibility
// oxlint-disable-next-line no-unnecessary-condition
if (debug) {
  document.documentElement.style.background = 'repeating-linear-gradient(#e66465 0px, #9198e5 300px)'
  document.documentElement.style.height = '100%'
}

// === hit testing logic. Boxes' hit area should be static and not follow their current animated state usually (but we can do either)
function hitTest2DMode(data: BoxData[], pointerX: number, pointerY: number) {
  for (let i = 0; i < data.length; i++) {
    const d = data[i]!
    if (d.x <= pointerX && pointerX < d.x + d.sizeX && d.y <= pointerY && pointerY < d.y + d.sizeY) return i // pointer on this box
  }
  return null
}
function hitTest1DMode(data: BoxData[], focused: number, windowSizeX: number, pointerX: number) {
  // allow spamming clicks without accidentally clicking on an empty region on left/right side or newly focused image during transition (and dismiss 1D mode)
  return focused > 0 && pointerX >= 0 /* might be -Infinity */ && pointerX <= hitArea1DSizeX ? Math.max(0, focused - 1) // left
    : focused < data.length - 1 && pointerX >= windowSizeX - hitArea1DSizeX ? Math.min(data.length - 1, focused + 1) // right
    : null
}

function render(now: number) {
  // === DOM reads
  const newWindowSizeX = document.documentElement.clientWidth // excludes scroll bar & invariant under safari pinch zoom
  const windowSizeY = document.documentElement.clientHeight // same
  // this way, when pinch zooming in, we don't occlude away rows outside of the view; if we did, when we zoom out again we wouldn't see those occluded rows until we release our fingers. During safari pinch, no event is triggered so we couldn't have updated the occlusion in real time
  const animationDisabled = reducedMotion.matches
  const currentScrollY = isSafari ? document.body.scrollTop : window.scrollY
  const currentScrollX = isSafari ? document.body.scrollLeft : window.scrollX
  const hashImgId = window.location.hash.slice(1)

  const data = st.data
  let focused: number | null = null; for (let i = 0; i < data.length; i++) if (data[i]!.id === hashImgId) focused = i

  // === handle inputs
  // keydown
  const inputCode = st.events.keydown == null ? null : st.events.keydown.code

  // oxlint-disable-next-line no-unnecessary-condition
  if (debug) {
    if (inputCode === 'KeyA') st.debugTimestamp += 1000 / 60
    now = st.debugTimestamp
  }

  // click
  let clickedTarget: EventTarget | null = null
  if (st.events.click != null) {
    // needed to update coords even when we already track mousemove. E.g. in Chrome, right click context menu, move elsewhere, then click to dismiss. BAM, mousemove triggers with stale/wrong (??) coordinates... Click again without moving, and now you're clicking on the wrong thing
    clickedTarget = st.events.click.target
    st.pointer.x = st.events.click.clientX; st.pointer.y = st.events.click.clientY
  }
  // mousemove
  if (st.events.mousemove != null) {
    // we only use clientX/Y, not pageX/Y, because we want to ignore scrolling. See comment around isSafari above; we either scroll body or window depending on the browser, so pageX/Y might be meaningless (if Safari)
    st.pointer.x = st.events.mousemove.clientX; st.pointer.y = st.events.mousemove.clientY
    // btw, pointer can exceed document bounds, e.g. dragging reports back out-of-bound, legal negative values
  }

  // don't forget top & bottom safari UI chrome sizes when vertically occluding, since they're transluscent so we can't over-occlude by ignoring them
  const pointerXLocal = st.pointer.x +/*toLocal*/currentScrollX, pointerYLocal = st.pointer.y +/*toLocal*/currentScrollY

  // keys
  let newFocused: number | null =
    inputCode === 'Escape' ? null
    : focused == null ? (inputCode === 'ArrowLeft' || inputCode === 'ArrowRight') ? 0 : focused
    : inputCode === 'ArrowLeft' ? Math.max(0, focused - 1)
    : inputCode === 'ArrowRight' ? Math.min(data.length - 1, focused + 1)
    : focused
  // pointer
  let selectTarget: HTMLElement | null = null
  if (clickedTarget != null) { // clicked
    if (clickedTarget instanceof HTMLElement && clickedTarget.tagName === 'FIGCAPTION') { // select the whole prompt
      selectTarget = clickedTarget
    } else if (focused == null) { // in 2D grid mode. Find the box the pointer's on
      newFocused = hitTest2DMode(data, pointerXLocal, pointerYLocal) ?? newFocused
    } else { // 1D mode
      newFocused = hitTest1DMode(data, focused, newWindowSizeX, pointerXLocal)
    }
  }

  // === layout & cursor
  const {cols: oldCols} = get2DLayout(st.windowSizeX)
  const {cols, boxMaxSizeX, boxes2DSizeX, boxes2DSizeY, rowsTop} = get2DLayout(newWindowSizeX)
  const resized = newWindowSizeX !== st.windowSizeX
  const entered1D = focused == null && newFocused != null
  const dismissed1D = focused != null && newFocused == null
  const changedFocusIn1D = focused != null && newFocused != null && focused !== newFocused
  // Resize alone doesn't touch residuals. 2D grid reflow does.
  const reflowed2D = newFocused == null && resized && oldCols !== cols
  let cursor: string
  let newAnchor = st.anchor
  let adjustedScrollTop = currentScrollY
  const hoverMagnetFactor = 40
  if (newFocused == null) { // 2D mode
    if (focused != null) { // just dismissed 1D mode
      const focusedTop = rowsTop[Math.floor(focused / cols)]!
      // if the dismissed box isn't fully shown, scroll to it (later after the render code block)
      if (focusedTop <= currentScrollY || focusedTop + boxes2DSizeY[focused]! >= currentScrollY + windowSizeY) {
        adjustedScrollTop = focusedTop - boxesGapY - gapTopPeek // Peek a little higher to show the previous row
      }
    }

    for (let i = 0; i < data.length; i++) { // calculate boxes positions
      const d = data[i]!
      const sizeX = boxes2DSizeX[i]!, sizeY = boxes2DSizeY[i]!
      const currentRow = Math.floor(i / cols)
      const rowMaxSizeY = rowsTop[currentRow + 1]! - boxesGapY - rowsTop[currentRow]! // this is restoring the rowMaxSizeY info above, kinda weird
      const x = boxesGapX + (boxMaxSizeX + boxesGapX) * (i % cols) + (boxMaxSizeX - sizeX) / 2
      const y = rowsTop[currentRow]! + (rowMaxSizeY - sizeY) / 2
      // Back to grid: keep current x/y/size. Pure 2D reflow only keeps x/y. Same-grid resize doesn't touch the residuals.
      setLayout(d, x, y, sizeX, sizeY, dismissed1D || reflowed2D, dismissed1D)
      d.sizeXResidual.dest = 0
      d.sizeYResidual.dest = 0
      d.xResidual.dest = 0
      d.yResidual.dest = 0
      d.scale.dest = 1
      d.fxFactor.dest = 1
    }

    const hit = hitTest2DMode(data, pointerXLocal, pointerYLocal)
    if (hit == null) cursor = 'auto'
    else { // hovering over a box. Adjust position
      cursor = 'zoom-in'
      const d = data[hit]!
      d.xResidual.dest += (pointerXLocal - (d.x + d.sizeX / 2)) / hoverMagnetFactor
      d.yResidual.dest += (pointerYLocal - (d.y + d.sizeY / 2)) / hoverMagnetFactor
      d.scale.dest = 1.02
    }
    // if layout shifted, keep the boxes near the same place to prevent annoying layout jumps while viewing
    const anchorY = data[st.anchor]!.y - gapTopPeek
    if (newWindowSizeX !== st.windowSizeX) adjustedScrollTop = Math.max(0, anchorY) // resized; maintain position!
    if (adjustedScrollTop !== st.scrollY && Math.abs(anchorY -/*toLocal*/adjustedScrollTop) > windowSizeY / 10) { // find new anchor if the current one moved too much
      for (newAnchor = 0; newAnchor < data.length; newAnchor += cols) { // new anchor is picked from leftmost column. Btw old anchor might not be from leftmost col due to resize layout shifts
        const d = data[newAnchor]!
        // find 1st box whose bottom exceeds 20% of window height
        if (d.y + d.sizeY -/*toLocal*/adjustedScrollTop > windowSizeY / 5) break
      }
    }
  } else { // 1D mode
    const img1DSizeY = windowSizeY - windowPaddingTop - prompt1DSizeY - boxes1DGapY
    const box1DMaxSizeX = newWindowSizeX - boxes1DGapX * 2 - hitArea1DSizeX * 2

    let currentLeft = hitArea1DSizeX + boxes1DGapX // start from the right edge of the left box and...
    for (let i = newFocused - 1; i >= 0; i--) { // ...iterate til we get the left edge of the very first box
      const d = data[i]!
      const {naturalSizeX, ar} = d
      const imgSizeX = Math.min(naturalSizeX, box1DMaxSizeX, img1DSizeY * ar) * 0.7
      currentLeft -= imgSizeX + boxes1DGapX
    }

    const edgeRubberBandVelocityX = // feedback when you hit first/last image and keep pressing left/right key
      inputCode === 'ArrowLeft' && focused === 0 ? 2 * 1000 // 2 pixels per second
      : inputCode === 'ArrowRight' && focused === data.length - 1 ? -2 * 1000
      : 0
    for (let i = 0; i < data.length; i++) { // calculate boxes positions
      const d = data[i]!
      const {naturalSizeX, ar} = d
      const imgSizeX = Math.min(naturalSizeX, box1DMaxSizeX, img1DSizeY * ar) * (i === newFocused ? 1 : 0.7)
      const boxSizeY = imgSizeX / ar + prompt1DSizeY
      const x = i === newFocused ? (newWindowSizeX - imgSizeX) / 2 : currentLeft
      const y = Math.max(windowPaddingTop, (windowSizeY - boxSizeY) / 2) +/*toLocal*/adjustedScrollTop
      // Going into 1D mode, or switching focused image, starts from the current on-screen x/y/size. Plain 1D resize doesn't.
      setLayout(d, x, y, imgSizeX, boxSizeY, entered1D || changedFocusIn1D, entered1D || changedFocusIn1D)
      d.sizeXResidual.dest = 0
      d.sizeYResidual.dest = 0
      d.xResidual.dest = 0
      d.yResidual.dest = 0
      d.xResidual.v += edgeRubberBandVelocityX / (i === newFocused ? 1 : 4)
      d.scale.dest = 1
      d.fxFactor.dest = i === newFocused ? 1 : 0.2 // center image has no brightness & blur effect

      currentLeft = i === newFocused ? newWindowSizeX - hitArea1DSizeX : currentLeft + imgSizeX + boxes1DGapX
    }

    const hit = hitTest1DMode(data, newFocused, newWindowSizeX, pointerXLocal)
    if (hit == null) cursor = 'zoom-out'
    else { // hovering on left or right image
      cursor = 'zoom-in'
      const d = data[hit]!
      d.xResidual.dest += (pointerXLocal - (d.x + d.sizeX / 2)) / hoverMagnetFactor
      d.yResidual.dest += (pointerYLocal - (d.y + d.sizeY / 2)) / hoverMagnetFactor
      d.scale.dest = 1.02
      d.fxFactor.dest = 0.5
    }
  }
  if (focused != null && newFocused == null && adjustedScrollTop !== currentScrollY) { // scroll changes base coordinates only; preserve the current visual position while it catches up
    for (const d of data) shiftSpringPos(d.yResidual, adjustedScrollTop - currentScrollY)
  }

  // === animation
  let newAnimatedUntilTime = st.animatedUntilTime ?? now
  const steps = Math.min(300, Math.floor((now - newAnimatedUntilTime) / msPerAnimationStep)) // run x spring steps. Decouple physics simulation from framerate!
  newAnimatedUntilTime += steps * msPerAnimationStep
  let stillAnimating = false
  if (animationDisabled) springForEach(springGoToEnd)
  else {
    springForEach(s => {
      for (let i = 0; i < steps; i++) springStep(s)
      if (Math.abs(s.v) < 0.01 && Math.abs(s.dest - s.pos) < 0.01) springGoToEnd(s) // close enough, done
      else stillAnimating = true
    })
  }

  // === commit state
  st.events.keydown = st.events.click = st.events.mousemove = null
  st.animatedUntilTime = stillAnimating ? newAnimatedUntilTime : null // oxlint-disable-line no-unnecessary-condition
  st.anchor = newAnchor
  st.windowSizeX = newWindowSizeX
  st.scrollY = adjustedScrollTop

  // === DOM writes
  const browserUIMaxSizeTop = 100, browserUIMaxSizeBottom = 150 // browsers UI like Safari are transluscent. Random conservative numbers
  for (let i = 0; i < data.length; i++) {
    const d = data[i]!
    const boxY = yPos(d), boxSizeY = sizeYPos(d), boxX = xPos(d), boxSizeX = sizeXPos(d)
    if ( // occlusion culling, aka only draw what's visible on screen (aka "virtualization")
      boxY -/*toGlobal*/adjustedScrollTop <= windowSizeY + browserUIMaxSizeBottom &&
      boxY + boxSizeY -/*toGlobal*/adjustedScrollTop >= -browserUIMaxSizeTop &&
      boxX <= newWindowSizeX &&
      boxX + boxSizeX >= 0
    ) { // disregard shadow & scaling for now; browserUIMaxSizeBottom and browserUIMaxSizeTop are safe bigger values anyway
      let node = domCache.get(d.id)
      if (node == null) { // JIT DOM node creation: first time this box is visible
        // upon zooming into 1D mode (big image), swapping out an img src for a higher-res one would cause a flash of blank image in certain cases. Instead, we put the low-res image as a background-image on the container, then the high-res image as a real img on top. Hand-rolled double buffering...
        node = document.createElement('div')
        node.className = 'box'
        node.style.backgroundImage = `url(https://cdn.midjourney.com/${d.id}_384_N.webp)` // 128 is the next smallest. Too small for retina screens
        const img = document.createElement('img')
        const promptNode = document.createElement('figcaption')
        promptNode.className = 'prompt'
        promptNode.textContent = d.prompt
        node.append(img, promptNode)
        domCache.set(d.id, node)
      }
      const img = node.children[0] as HTMLImageElement, prompt = node.children[1] as HTMLElement
      node.style.width = `${boxSizeX}px`
      node.style.height = `${boxSizeY}px`
      node.style.transform = `translate3d(${boxX}px,${boxY}px,0) scale(${d.scale.pos})` // safari now anti-aliases for hover, but then zoom in janks on big displays...
      // we can't afford fxFactor & blur for all pics; too expensive for Safari & Chrome. E.g. when zomming out of a photo, keep scrolling; Chrome stops render on Studio Display
      node.style.filter = newFocused != null && (i === newFocused - 1 || i === newFocused || i === newFocused + 1)
        ? `brightness(${d.fxFactor.pos * 100}%) blur(${Math.max(0, 6 - d.fxFactor.pos * 6)}px)` // blur these 3 only
        : `brightness(${d.fxFactor.pos * 100}%)` // blur of unrelated pics is too fast during transition from/to 1D mode to be seen anyway
      if (debug) node.style.outline = i === newAnchor ? '2px solid rgba(255, 255, 0, 0.8)' : 'none' // oxlint-disable-line no-unnecessary-condition
      prompt.style.top = `${boxSizeX / d.ar}px` // right below img's sizeY

      if (i === newFocused) {
        node.style.zIndex = String(data.length + 1) // guaranteed above everything
        prompt.style.overflowY = 'auto'
        prompt.style.height = `${prompt1DSizeY - promptPaddingBottom}px`
        prompt.style.setProperty('line-clamp', '999')
        prompt.style.webkitLineClamp = '999'
        img.style.display = 'block' // not 'inline' (img's default), which adds whitespace below
        const src = `https://cdn.midjourney.com/${d.id}.webp`
        if (!stillAnimating && img.src !== src) img.src = src // oxlint-disable-line no-unnecessary-condition -- load the full res image
      } else {
        node.style.zIndex = String(i + 1) // simple proper z-index management
        prompt.style.overflowY = 'hidden'
        prompt.style.height = `${promptSizeY - promptPaddingBottom}px`
        prompt.style.setProperty('line-clamp', '2')
        prompt.style.webkitLineClamp = '2'
        img.style.display = 'none' // hide full res image for perf (yes it makes a difference, even on M1, with Studio Display)
      }
      if (node.parentNode == null) document.body.appendChild(node) // if previously absent, add
    } else { // not visible
      const node = domCache.get(d.id)
      if (node != null) {
        if (node.parentNode != null) document.body.removeChild(node)
        domCache.delete(d.id)
      }
    }
  }

  document.body.style.cursor = cursor
  document.body.style.overflowY = newFocused == null ? 'auto' : 'hidden'
  dummyPlaceholder.style.height = `${rowsTop.at(-1)!}px` // Chrome has race conditon if scrollTo is called before setting a longer dummy height

  // === side effects
  if (selectTarget != null) {
    const selection = window.getSelection()
    const range = document.createRange()
    range.selectNodeContents(selectTarget)
    selection?.removeAllRanges()
    selection?.addRange(range)
  }
  if (adjustedScrollTop !== currentScrollY) {
    // see comment about isSafari above
    ;(isSafari ? document.body : window).scrollTo({top: adjustedScrollTop}) // will trigger scrolling, thus next frame's render
  }
  if (newFocused !== focused) {
    window.history.pushState(null, '', `${window.location.pathname}${window.location.search}${newFocused == null ? '' : '#' + data[newFocused]!.id}`)
  }

  return stillAnimating
}

scheduleRender()
