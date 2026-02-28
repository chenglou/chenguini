# Frame Scheduling

Reliable website to test your screen's refresh rate: https://www.testufo.com. Usually, a monitor renders from 30 frames per second (fps) to 240fps, which means `1000 / 30 = 33.3` ms to `1000 / 240 = 4.17` ms per frame. On, say, a MacBook (120fps), you've got `1000 / 120 = 8.33` ms to receive input, calculate new state, and render.

Software layers on top of the hardware can also change the fps:

- To save battery, systems like Low Battery Mode (iOS and macOS) might render at a lower fps.
- on iOS, Safari throttles fps to 60 by default (enable 120fps on iPhone Pro [this way](https://apple.stackexchange.com/questions/454421/enabling-120-fps-on-mobile-safari)).
- As of today, after certain gestures like scroll swipe, iOS Safari throttles fps to a lower value for a second or so. (TODO: verify if this is still true, and which gestures).

To schedule the JS logic to happen before the render phase of the frame, the recommended way is generally `requestAnimationFrame` (`rAF`).

Paul Irish has a good article on the life time of a frame, and where `rAF` happens: https://medium.com/@paul_irish/requestanimationframe-scheduling-for-nerds-9c57f7438ef4

Essentially:

- Calling `rAF` inside event callbacks (both browser and react events) schedules the `rAF` callback to the *same* frame as the event that happened.
- `rAF` inside another `rAF` is executed next frame. This can recurse.
- `rAF` called before the browser's first paint joins that first frame.

## Render Loop

Prefer a simplified game engine loop:

```
Initialization (done once, all upfront):
  State declaration
  Static DOM chunks
  Events registration (leverage event delegation to make this happen)

Render:
  DOM reads (batched, to avoid DOM interleaving)
  State changes, in this order:
    Handle inputs
    New layout & cursor
    Animation tick
    Commit state changes
  Occlusion & DOM writes (batched, same reason)
  Side effects (scrollTo, pushState, focus, selection, localStorage, etc.)
  schedule next render (e.g. if animating)
```

```js
let animatedUntilTime = null
let pointer = {x: -Infinity, y: -Infinity}
let state = {keydown: null, click: null}

let scheduledRender = false
function scheduleRender() {
  if (scheduledRender) return
  scheduledRender = true
  requestAnimationFrame(function renderAndMaybeScheduleAnotherRender(now) { // eye-grabbing name to avoid "(anonymous)" function in the debugger & profiler
    scheduledRender = false
    if (render(now)) scheduleRender()
  })
}
// use event delegation as much as possible to statically allocate events
window.addEventListener('resize', () => scheduleRender()) // most of time, there should be nothing else in the event handler beside scheduling a render
window.addEventListener('click', (e) => {events.click = e; scheduleRender()}) // setting a state is fine too
window.addEventListener('scroll', () => scheduleRender(), true) // feel free to use capture mode for certain events
function render(now) {
  // DOM reads
  const windowSizeX = document.documentElement.clientWidth
  // Handle inputs
  if (events.click) { pointer.x = events.click.clientX; pointer.y = events.click.clientY }
  if (events.mousemove) { pointer.x = events.mousemove.clientX; pointer.y = events.mousemove.clientY }

  // Layout (no DOM writes here; compute cursor as variable, not on DOM)
  let cursor = 'auto'

  // Animation tick
  let newAnimatedUntilTime = animatedUntilTime ?? now
  const steps = Math.floor((now - newAnimatedUntilTime) / msPerAnimationStep)
  newAnimatedUntilTime += steps * msPerAnimationStep
  let stillAnimating = false
  // ... spring steps

  // Commit state
  events.keydown = events.click = events.mousemove = null
  animatedUntilTime = stillAnimating ? newAnimatedUntilTime : null

  // DOM writes
  document.body.style.cursor = cursor

  // Side effects (scrollTo, pushState, selection, etc.)

  return stillAnimating
}

scheduleRender()
```

Only events and render's final step can schedule a next render.

**Gesture-gated APIs** (`navigator.clipboard.writeText`, `element.requestFullscreen`, `audio.play`, `window.open`) require user gesture context — the browser only allows them inside the synchronous call stack of a user-initiated event handler. By the time rAF fires, the gesture context has expired, so these can't go through the batched render loop. Instead, skip event delegation for these and attach a direct event listener on the element at creation time:

```js
// inside domCache JIT creation block
if (node == null) {
  node = document.createElement('button')
  node.className = 'copy-btn'
  node.textContent = 'Copy'
  node.addEventListener('click', (e) => {
    navigator.clipboard.writeText(getTextToCopy())
    e.stopPropagation() // don't bubble to the delegated window click handler
  })
  domCache.copyBtn = node
}
// dynamic props still set every frame in DOM writes
node.style.top = `${y}px`
```

Name your `rAF` callback (`function renderAndMaybeScheduleAnotherRender(now) { ... }` instead of an anonymous arrow). Named functions show up in the browser profiler and debugger, making performance traces readable.

A React app might not be able to follow this, but when the need arises (heavy interactivity), this can still be adopted within components.

## DOM Reads

Use `document.documentElement.clientWidth` and `document.documentElement.clientHeight` for viewport dimensions. Do NOT use `window.innerWidth` / `window.innerHeight` — those include scrollbar width and behave differently under Safari pinch zoom (they change during zoom, `clientWidth/Height` don't). `visualViewport.width/height` also changes during pinch zoom.

For pointer coordinates, see Input.md (`clientX/Y` vs `pageX/Y`, coordinate space conversion, drag patterns).

### Event Consumption

In the render loop, events are stored on arrival and consumed during render. **Null them in the "commit state" phase** (after layout + animation, before DOM writes), not at the beginning of render. This ensures they're available throughout the entire state computation.

```js
// commit state
events.keydown = events.click = events.mousemove = null
```

## DOM Interleaving

Repeated DOM read & write is catastrophic for performance ([https://gist.github.com/paulirish/5d52fb081b3570c81e3a](https://gist.github.com/paulirish/5d52fb081b3570c81e3a)). It's not always avoidable (especially when there's need for text measurement as part of layout logic before render), but keep to them a strict minimum.
For easier reasoning & testing, pass the read DOM values to helper functions instead of having said helpers read from DOM. And definitely avoid having helpers mutate DOM, when possible.

## DOM Writes

**Everything that touches DOM properties is a DOM write** — not just element content and transforms, but also `body.style.cursor`, `body.style.overflowY`, dummy element heights, etc. These all belong in the DOM writes phase. A common mistake is setting `document.body.style.cursor` during layout computation — instead, compute the cursor value as a local variable during layout, then assign it to the DOM in the DOM writes phase.

React did it right with its idempotent JSX. Treat the DOM writes section of the render loop as essentially JSX as much as possible. For example, avoid partial mutations like `node.classList.add('foo')` and `node.classList.remove('foo')`. Assign the entire classes string at once. Use ternary, and when if-else are needed ensure they touch the DOM structure the same way:

```ts
// good:
if (condition) {
  node.style.display = 'block'
  node.style.color = 'red'
} else {
  node.style.display = 'none'
  node.style.color = 'blue'
}

// also good:
let display, color
if (condition) {
  display = 'block'
  color = 'red'
} else {
  display = 'none'
  color = 'blue'
}
node.style.display = display
node.style.color = color

// bad:
if (condition) {
  node.style.display = 'block'
} else {
  node.style.color = 'red'
}
```

If a property's dynamic (managed by JS), *own it fully in JS*. Don't do a partial thing where some default value's set in CSS, then overridden with JS or classes sometime. Avoid implicit property inheritance from your CSS.
In fact, in theory, class toggling should be reserved ideally only for when both classes have the same set of properties, like a struct (**note**: This is experimental advice. If you see strong counterpoints, please say so)
I.e. it's better to do `node.style.display = condition ? 'block' : 'none'` than have a `.hidden` class that sets `display: none` and toggle it; it's more "functional" and avoids chasing after implicit overrides.

## Gotchas

`rAF`'s parameter is a timestamp which differs from getting the current time with `performance.now()` ([source](https://x.com/nomsternom/status/1853687984266055983)). Use the former. If not available, use `document.timeline.currentTime`; this and `raf` are always the same.

Specifically for React:

- As of React 18, all `setState`s are batched: https://github.com/reactwg/react-18/discussions/21
- Calling `setState` inside a `rAF` inside an event handler makes the state update happen on the *next* frame. [Demo](https://tinyurl.com/4yz8nes8). [Source](https://github.com/facebook/react/issues/31634#issuecomment-2500890102).

[Extra in-depth article on iOS game frame timing](https://web.archive.org/web/20210513101414/https://www.gamasutra.com/blogs/KwasiMensah/20110211/88949/Game_Loops_on_IOS.php) if you're interested. Generally applicable elsewhere.
