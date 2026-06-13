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
import {
  boxesGapY,
  gapTopPeek,
  getGridLayout,
  getLineLayout,
  makeLayoutSources,
  rectContainsPoint,
  type GridLayoutModel,
  type ItemLayoutGeometry,
  type LineLayoutModel,
  type PromptGeometry,
  type Rect,
} from './layout'
import {
  measurePromptLayout,
  prompt1DMaxLines,
  prompt2DMaxLines,
  promptPaddingX,
  promptPaddingTop,
} from './prompt-layout'

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

function readWindowSizeX() {
  return document.documentElement.clientWidth
}

function readWindowSizeY() {
  return document.documentElement.clientHeight
}

function readScrollY() {
  return isSafari ? document.body.scrollTop : window.scrollY
}

function readScrollX() {
  return isSafari ? document.body.scrollLeft : window.scrollX
}

function applyScrollTop(top: number) {
  ;(isSafari ? document.body : window).scrollTo({top})
}

function applyFocusedId(id: string | null) {
  const url = `${window.location.pathname}${window.location.search}${id == null ? '' : '#' + id}`
  window.history.pushState(null, '', url)
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
  layoutBox: AnimatedRect
  promptBox: AnimatedRect
}

type AnimatedRect = {
  // "base" values are the regular, non-animated values. Final visual value = base value + residual.
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

type SelectTarget =
  | {node: Node}
  | {startNode: Node; startOffset: number; endNode: Node; endOffset: number}

function shiftSpringPos(s: Spring, delta: number) {
  s.pos += delta
}

function animatedRect(r: Rect, xResidual = 0, yResidual = 0): AnimatedRect {
  return {
    x: r.x,
    y: r.y,
    sizeX: r.sizeX,
    sizeY: r.sizeY,
    xResidual: spring(xResidual),
    yResidual: spring(yResidual),
    sizeXResidual: spring(0),
    sizeYResidual: spring(0),
  }
}

function relativeRect(child: Rect, parent: Rect): Rect {
  return {
    x: child.x - parent.x,
    y: child.y - parent.y,
    sizeX: child.sizeX,
    sizeY: child.sizeY,
  }
}

function rectXPos(r: AnimatedRect) {
  return r.x + r.xResidual.pos
}

function rectYPos(r: AnimatedRect) {
  return r.y + r.yResidual.pos
}

function rectSizeXPos(r: AnimatedRect) {
  return r.sizeX + r.sizeXResidual.pos
}

function rectSizeYPos(r: AnimatedRect) {
  return r.sizeY + r.sizeYResidual.pos
}

function forEachAnimatedRectSpring(r: AnimatedRect, f: (s: Spring) => void) {
  f(r.xResidual); f(r.yResidual); f(r.sizeXResidual); f(r.sizeYResidual)
}

function resetAnimatedRectDest(r: AnimatedRect) {
  r.xResidual.dest = 0
  r.yResidual.dest = 0
  r.sizeXResidual.dest = 0
  r.sizeYResidual.dest = 0
}
// Set x/y/size right away. If this change should animate, stash the current on-screen delta in the residuals and let them settle back to 0.
function setAnimatedRect(r: AnimatedRect, next: Rect, preservePosition: boolean, preserveSize: boolean) {
  const currentX = rectXPos(r), currentY = rectYPos(r)
  const currentSizeX = rectSizeXPos(r), currentSizeY = rectSizeYPos(r)
  r.x = next.x
  r.y = next.y
  r.sizeX = next.sizeX
  r.sizeY = next.sizeY
  if (preservePosition) {
    r.xResidual.pos = currentX - next.x
    r.yResidual.pos = currentY - next.y
  }
  if (preserveSize) {
    r.sizeXResidual.pos = currentSizeX - next.sizeX
    r.sizeYResidual.pos = currentSizeY - next.sizeY
  }
}
const layoutSources = makeLayoutSources(photoGalleryData)
void document.fonts.ready.then(() => scheduleRender())

function createInitialState(windowSizeX: number, windowSizeY: number, scrollY: number, withEntryAnimation: boolean): State {
  const gridLayout = getGridLayout(layoutSources, windowSizeX)
  return {
    debugTimestamp: 0,
    animatedUntilTime: null,
    anchor: 0, // keep a box stable during resize layout shifts
    windowSizeX,
    scrollY,
    pointer: {x: -Infinity, y: -Infinity}, // btw, on page load, there's no way to render a first cursor state =(
    events: {keydown: null, click: null, mousemove: null},
    data: photoGalleryData.map((d, i) => {
      const ar = d.w / d.h
      const geometry = gridLayout.items[i]!
      const promptBox = geometry.prompt.box
      const layoutBox = geometry.layoutBox
      return {
        id: d.id,
        prompt: d.prompt,
        naturalSizeX: d.w,
        ar,
        layoutBox: animatedRect(
          layoutBox,
          withEntryAnimation ? Math.floor(i / gridLayout.cols) * -windowSizeX - windowSizeX - layoutBox.x : 0, // unfold from lower left. More visible on long screens
          withEntryAnimation ? windowSizeY + Math.floor(i / gridLayout.cols) * gridLayout.boxMaxSizeX - layoutBox.y : 0,
        ),
        promptBox: animatedRect(relativeRect(promptBox, layoutBox)),
        scale: spring(1),
        fxFactor: spring(withEntryAnimation ? 20 : 1), // for brightness and blur
      }
    }),
  }
}

let st: State = createInitialState(readWindowSizeX(), readWindowSizeY(), readScrollY(), true)
function springForEach(f: (s: Spring) => void) { // no spring ownership struggle between the spring library above vs consumer; un-inversion of control!
  for (const d of st.data) {
    forEachAnimatedRectSpring(d.layoutBox, f)
    forEachAnimatedRectSpring(d.promptBox, f)
    f(d.scale); f(d.fxFactor)
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
type PromptDOMStructure = {
  selectionSourceNode: HTMLSpanElement
  lineNodes: HTMLSpanElement[]
  bodyFragmentNodes: HTMLElement[]
}
const promptDOMStructureByNode = new WeakMap<HTMLElement, PromptDOMStructure>()
// oxlint-disable-next-line no-unnecessary-condition
if (debug) {
  document.documentElement.style.background = 'repeating-linear-gradient(#e66465 0px, #9198e5 300px)'
  document.documentElement.style.height = '100%'
}

function promptRenderKey(prompt: PromptGeometry) {
  return `${prompt.lineHeight}|${prompt.lines.map(line =>
    `${line.width.toFixed(4)}:${line.fragments.map(fragment =>
      `${fragment.itemIndex},${fragment.gapBefore.toFixed(4)},${fragment.text}`
    ).join('/')}`
  ).join('|')}`
}

function syncPromptNode(promptNode: HTMLElement, prompt: PromptGeometry, fullPromptText: string) {
  const renderKey = promptRenderKey(prompt)
  const existingSelectionSource = promptDOMStructureByNode.get(promptNode)?.selectionSourceNode
  if (promptNode.dataset['renderKey'] === renderKey && existingSelectionSource?.textContent === fullPromptText) return

  const selectionSourceNode = document.createElement('span')
  selectionSourceNode.className = 'prompt-selection-source'
  selectionSourceNode.textContent = fullPromptText
  const bodyFragmentNodes: HTMLElement[] = []
  const lineNodes = prompt.lines.map((line, lineIndex) => {
    const lineNode = document.createElement('span')
    lineNode.className = 'prompt-line'
    lineNode.style.left = `${promptPaddingX}px`
    lineNode.style.top = `${promptPaddingTop + lineIndex * prompt.lineHeight}px`
    lineNode.style.height = `${prompt.lineHeight}px`
    for (const fragment of line.fragments) {
      const fragmentNode = document.createElement('span')
      fragmentNode.className = fragment.itemIndex === 0
        ? 'prompt-fragment prompt-fragment--quote'
        : 'prompt-fragment prompt-fragment--body'
      if (fragment.gapBefore !== 0) fragmentNode.style.marginLeft = `${fragment.gapBefore}px`
      fragmentNode.textContent = fragment.text
      if (fragment.itemIndex !== 0) bodyFragmentNodes.push(fragmentNode)
      lineNode.append(fragmentNode)
    }
    return lineNode
  })

  promptNode.replaceChildren(selectionSourceNode, ...lineNodes)
  promptDOMStructureByNode.set(promptNode, {
    selectionSourceNode,
    lineNodes,
    bodyFragmentNodes,
  })
  promptNode.dataset['renderKey'] = renderKey
}

function getPromptSelectionTarget(promptTarget: Element): SelectTarget {
  if (!(promptTarget instanceof HTMLElement)) return {node: promptTarget}
  const promptDOMStructure = promptDOMStructureByNode.get(promptTarget)
  const selectionSourceNode = promptDOMStructure?.selectionSourceNode.firstChild
  if (selectionSourceNode != null) {
    return {
      startNode: selectionSourceNode,
      startOffset: 0,
      endNode: selectionSourceNode,
      endOffset: selectionSourceNode.textContent?.length ?? 0,
    }
  }

  const bodyFragments = promptDOMStructure?.bodyFragmentNodes ?? []
  if (bodyFragments.length === 0) return {node: promptTarget}

  const firstNode = bodyFragments[0]!.firstChild ?? bodyFragments[0]!
  const lastNode = bodyFragments[bodyFragments.length - 1]!.firstChild ?? bodyFragments[bodyFragments.length - 1]!
  return {
    startNode: firstNode,
    startOffset: 0,
    endNode: lastNode,
    endOffset: lastNode.textContent?.length ?? 0,
  }
}

// === hit testing logic. Boxes' hit area should be static and not follow their current animated state usually (but we can do either)
function hitTest2DMode(layout: GridLayoutModel, pointerX: number, pointerY: number) {
  for (let i = 0; i < layout.items.length; i++) {
    if (rectContainsPoint(layout.items[i]!.layoutBox, pointerX, pointerY)) return i
  }
  return null
}
function hitTest1DMode(layout: LineLayoutModel, pointerX: number, pointerY: number) {
  if (layout.leftHitArea != null && rectContainsPoint(layout.leftHitArea.box, pointerX, pointerY)) return layout.leftHitArea.targetIndex
  if (layout.rightHitArea != null && rectContainsPoint(layout.rightHitArea.box, pointerX, pointerY)) return layout.rightHitArea.targetIndex
  return null
}

function render(now: number) {
  // === DOM reads
  const newWindowSizeX = readWindowSizeX() // excludes scroll bar & invariant under safari pinch zoom
  const windowSizeY = readWindowSizeY() // same
  // this way, when pinch zooming in, we don't occlude away rows outside of the view; if we did, when we zoom out again we wouldn't see those occluded rows until we release our fingers. During safari pinch, no event is triggered so we couldn't have updated the occlusion in real time
  const animationDisabled = reducedMotion.matches
  const currentScrollY = readScrollY()
  const currentScrollX = readScrollX()
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
  const gridLayout = getGridLayout(layoutSources, newWindowSizeX)
  const currentLineLayout = focused == null ? null : getLineLayout(layoutSources, focused, newWindowSizeX, windowSizeY, currentScrollY)
  // pointer
  let selectTarget: SelectTarget | null = null
  if (clickedTarget != null) { // clicked
    if (clickedTarget instanceof Element) {
      const promptTarget = clickedTarget.closest('figcaption.prompt')
      if (promptTarget != null) {
        selectTarget = getPromptSelectionTarget(promptTarget)
      } else if (focused == null) { // in 2D grid mode. Find the box the pointer's on
        newFocused = hitTest2DMode(gridLayout, pointerXLocal, pointerYLocal) ?? newFocused
      } else { // 1D mode
        newFocused = currentLineLayout == null ? newFocused : hitTest1DMode(currentLineLayout, pointerXLocal, pointerYLocal)
      }
    } else if (focused == null) { // in 2D grid mode. Find the box the pointer's on
      newFocused = hitTest2DMode(gridLayout, pointerXLocal, pointerYLocal) ?? newFocused
    } else { // 1D mode
      newFocused = currentLineLayout == null ? newFocused : hitTest1DMode(currentLineLayout, pointerXLocal, pointerYLocal)
    }
  }

  // === layout & cursor
  const previousGridLayout = getGridLayout(layoutSources, st.windowSizeX)
  const resized = newWindowSizeX !== st.windowSizeX
  const entered1D = focused == null && newFocused != null
  const dismissed1D = focused != null && newFocused == null
  const changedFocusIn1D = focused != null && newFocused != null && focused !== newFocused
  // Resize alone doesn't touch residuals. 2D grid reflow does.
  const reflowed2D = newFocused == null && resized && previousGridLayout.cols !== gridLayout.cols
  const resized1D = newFocused != null && resized
  let cursor: string
  let newAnchor = st.anchor
  let adjustedScrollTop = currentScrollY
  let activeLayoutItems: ItemLayoutGeometry[] = gridLayout.items
  let activeLineLayout: LineLayoutModel | null = null
  const hoverMagnetFactor = 40
  if (newFocused == null) { // 2D mode
    if (focused != null) { // just dismissed 1D mode
      const focusedTop = gridLayout.rows[Math.floor(focused / gridLayout.cols)]!.y
      const focusedItem = gridLayout.items[focused]!.layoutBox
      // if the dismissed box isn't fully shown, scroll to it (later after the render code block)
      if (focusedTop <= currentScrollY || focusedItem.y + focusedItem.sizeY >= currentScrollY + windowSizeY) {
        adjustedScrollTop = focusedTop - boxesGapY - gapTopPeek // Peek a little higher to show the previous row
      }
    }

    for (let i = 0; i < data.length; i++) { // calculate boxes positions
      const d = data[i]!
      const geometry = gridLayout.items[i]!
      const layoutBox = geometry.layoutBox
      const promptBox = geometry.prompt.box
      // Back to grid: keep current x/y/size. Pure 2D reflow also keeps size so resize handoff doesn't jump.
      setAnimatedRect(d.layoutBox, layoutBox, dismissed1D || reflowed2D, dismissed1D || reflowed2D)
      setAnimatedRect(d.promptBox, relativeRect(promptBox, layoutBox), dismissed1D || reflowed2D, dismissed1D || reflowed2D)
      resetAnimatedRectDest(d.layoutBox)
      resetAnimatedRectDest(d.promptBox)
      d.scale.dest = 1
      d.fxFactor.dest = 1
    }

    const hit = hitTest2DMode(gridLayout, pointerXLocal, pointerYLocal)
    if (hit == null) cursor = 'auto'
    else { // hovering over a box. Adjust position
      cursor = 'zoom-in'
      const hoveredLayoutBox = gridLayout.items[hit]!.layoutBox
      const d = data[hit]!
      d.layoutBox.xResidual.dest += (pointerXLocal - (hoveredLayoutBox.x + hoveredLayoutBox.sizeX / 2)) / hoverMagnetFactor
      d.layoutBox.yResidual.dest += (pointerYLocal - (hoveredLayoutBox.y + hoveredLayoutBox.sizeY / 2)) / hoverMagnetFactor
      d.scale.dest = 1.02
    }
    // if layout shifted, keep the boxes near the same place to prevent annoying layout jumps while viewing
    const anchorY = gridLayout.items[st.anchor]!.layoutBox.y - gapTopPeek
    if (newWindowSizeX !== st.windowSizeX) adjustedScrollTop = Math.max(0, anchorY) // resized; maintain position!
    if (adjustedScrollTop !== st.scrollY && Math.abs(anchorY -/*toLocal*/adjustedScrollTop) > windowSizeY / 10) { // find new anchor if the current one moved too much
      for (newAnchor = 0; newAnchor < data.length; newAnchor += gridLayout.cols) { // new anchor is picked from leftmost column. Btw old anchor might not be from leftmost col due to resize layout shifts
        const layoutBox = gridLayout.items[newAnchor]!.layoutBox
        // find 1st box whose bottom exceeds 20% of window height
        if (layoutBox.y + layoutBox.sizeY -/*toLocal*/adjustedScrollTop > windowSizeY / 5) break
      }
    }
  } else { // 1D mode
    activeLineLayout = getLineLayout(layoutSources, newFocused, newWindowSizeX, windowSizeY, adjustedScrollTop)
    activeLayoutItems = activeLineLayout.items

    const edgeRubberBandVelocityX = // feedback when you hit first/last image and keep pressing left/right key
      inputCode === 'ArrowLeft' && focused === 0 ? 2 * 1000 // 2 pixels per second
      : inputCode === 'ArrowRight' && focused === data.length - 1 ? -2 * 1000
      : 0
    for (let i = 0; i < data.length; i++) { // calculate boxes positions
      const d = data[i]!
      const geometry = activeLineLayout.items[i]!
      const layoutBox = geometry.layoutBox
      const promptBox = geometry.prompt.box
      // Going into 1D mode, switching focused image, or resizing in 1D starts from the current on-screen x/y/size.
      setAnimatedRect(d.layoutBox, layoutBox, entered1D || changedFocusIn1D || resized1D, entered1D || changedFocusIn1D || resized1D)
      setAnimatedRect(d.promptBox, relativeRect(promptBox, layoutBox), entered1D || changedFocusIn1D || resized1D, entered1D || changedFocusIn1D || resized1D)
      resetAnimatedRectDest(d.layoutBox)
      resetAnimatedRectDest(d.promptBox)
      d.layoutBox.xResidual.v += edgeRubberBandVelocityX / (i === newFocused ? 1 : 4)
      d.scale.dest = 1
      d.fxFactor.dest = i === newFocused ? 1 : 0.2 // center image has no brightness & blur effect
    }

    const hit = hitTest1DMode(activeLineLayout, pointerXLocal, pointerYLocal)
    if (hit == null) cursor = 'zoom-out'
    else { // hovering on left or right image
      cursor = 'zoom-in'
      const hoveredLayoutBox = activeLineLayout.items[hit]!.layoutBox
      const d = data[hit]!
      d.layoutBox.xResidual.dest += (pointerXLocal - (hoveredLayoutBox.x + hoveredLayoutBox.sizeX / 2)) / hoverMagnetFactor
      d.layoutBox.yResidual.dest += (pointerYLocal - (hoveredLayoutBox.y + hoveredLayoutBox.sizeY / 2)) / hoverMagnetFactor
      d.scale.dest = 1.02
      d.fxFactor.dest = 0.5
    }
  }
  const preserveScrollShiftViaResidual = (focused != null && newFocused == null) || reflowed2D
  if (preserveScrollShiftViaResidual && adjustedScrollTop !== currentScrollY) { // scroll changes base coordinates only; preserve the current visual position while it catches up
    for (const d of data) shiftSpringPos(d.layoutBox.yResidual, adjustedScrollTop - currentScrollY)
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
    const geometry = activeLayoutItems[i]!
    const boxX = rectXPos(d.layoutBox)
    const boxY = rectYPos(d.layoutBox)
    const boxSizeX = rectSizeXPos(d.layoutBox)
    const boxSizeY = rectSizeYPos(d.layoutBox)
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
      const currentPromptX = rectXPos(d.promptBox)
      const currentPromptY = rectYPos(d.promptBox)
      const currentPromptSizeX = rectSizeXPos(d.promptBox)
      const currentPromptLayout = measurePromptLayout(
        layoutSources[i]!.preparedPrompt,
        currentPromptSizeX,
        activeLineLayout == null ? prompt2DMaxLines : prompt1DMaxLines,
        geometry.prompt.lineHeight,
      )
      const currentPromptSizeY = currentPromptLayout.visibleHeight
      prompt.style.left = `${currentPromptX}px`
      prompt.style.width = `${currentPromptSizeX}px`
      prompt.style.top = `${currentPromptY}px`
      prompt.style.height = `${currentPromptSizeY}px`
      prompt.style.lineHeight = `${geometry.prompt.lineHeight}px`
      prompt.style.overflowY = 'hidden'
      syncPromptNode(prompt, {
        box: {x: currentPromptX, y: currentPromptY, sizeX: currentPromptSizeX, sizeY: currentPromptSizeY},
        lineHeight: geometry.prompt.lineHeight,
        lines: currentPromptLayout.lines,
      }, d.prompt)

      if (i === newFocused) {
        node.style.zIndex = String(data.length + 1) // guaranteed above everything
        img.style.display = 'block' // not 'inline' (img's default), which adds whitespace below
        const src = `https://cdn.midjourney.com/${d.id}.webp`
        if (!stillAnimating && img.src !== src) img.src = src // oxlint-disable-line no-unnecessary-condition -- load the full res image
      } else {
        node.style.zIndex = String(i + 1) // simple proper z-index management
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
  dummyPlaceholder.style.height = `${gridLayout.contentHeight}px` // Chrome has race conditon if scrollTo is called before setting a longer dummy height

  // === side effects
  if (selectTarget != null) {
    const selection = window.getSelection()
    const range = document.createRange()
    if ('node' in selectTarget) {
      range.selectNodeContents(selectTarget.node)
    } else {
      range.setStart(selectTarget.startNode, selectTarget.startOffset)
      range.setEnd(selectTarget.endNode, selectTarget.endOffset)
    }
    selection?.removeAllRanges()
    selection?.addRange(range)
  }
  if (adjustedScrollTop !== currentScrollY) {
    applyScrollTop(adjustedScrollTop)
  }
  if (newFocused !== focused) {
    applyFocusedId(newFocused == null ? null : data[newFocused]!.id)
  }

  return stillAnimating
}

scheduleRender()
