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

## Timestamps

There are three time sources and they are **not** the same:

- **rAF's `now` parameter**: Scheduled frame start time (from VSync). All rAF callbacks in the same frame get the **same** value. Use for animation stepping inside rAF callbacks.
- **`document.timeline.currentTime`**: Same value as rAF's `now` ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame)). Use when an event handler needs to capture a timestamp that would otherwise be lost before the next render.
- **`performance.now()`**: Actual wall-clock time when the JS line executes. Advances between callbacks. Use for input timing (velocity estimation, gesture duration).

**For animation, never use `performance.now()`.** Use rAF's `now` inside rAF callbacks, and `document.timeline.currentTime` when you need the same clock outside rAF (e.g. storing `pointerDownTime` for the next render).

**Why they differ:** The rAF timestamp comes from the display's VSync schedule (Chromium's `BeginFrameArgs` — [how cc works](https://chromium.googlesource.com/chromium/src/+/master/docs/how_cc_works.md)). It represents when the frame was *supposed* to start, not when your JS actually runs. `performance.now()` reflects wall-clock time, which is always later (your JS runs after the frame starts). In Chromium's rendering pipeline, the compositor and main thread work in parallel — the main thread can be processing frame N+1 while the compositor is still painting frame N ([source](https://x.com/nomsternom/status/1853687984266055983)). This means `performance.now()` can diverge significantly from the rAF timestamp.

**Mixing clocks is wrong.** E.g. setting `animatedUntilTime = performance.now()` in a click handler, then computing `rAF_now - animatedUntilTime` in render: the rAF timestamp can actually be *earlier* than the `performance.now()` you stored, giving you 0 steps (wasted frame). Or slightly ahead, giving inconsistent step counts. Use `document.timeline.currentTime` in the event handler instead — it's always on the same clock as rAF's `now`.

TODO: the compositor/main-thread pipelining described above appears to be Chromium-specific, not a spec requirement. Needs further clarification — see [Noam's thread](https://x.com/nomsternom/status/1853687984266055983).

**For input timing, `performance.now()` is fine** (or better: `event.timeStamp`, the high-precision time of the actual input event). Don't use rAF's `now` for velocity estimation — it's the frame time, not when the pointer actually moved.

## Gotchas

Specifically for React:

- As of React 18, all `setState`s are batched: https://github.com/reactwg/react-18/discussions/21
- Calling `setState` inside a `rAF` inside an event handler makes the state update happen on the *next* frame. [Demo](https://tinyurl.com/4yz8nes8). [Source](https://github.com/facebook/react/issues/31634#issuecomment-2500890102).

[Extra in-depth article on iOS game frame timing](https://web.archive.org/web/20210513101414/https://www.gamasutra.com/blogs/KwasiMensah/20110211/88949/Game_Loops_on_IOS.php) if you're interested. Generally applicable elsewhere.

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
// centralized state
let st = {
  animatedUntilTime: null,
  selectedId: null,
  events: {click: null},
}

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
window.addEventListener('click', (e) => {st.events.click = e; scheduleRender()}) // storing raw input in transient state is fine too
window.addEventListener('scroll', () => scheduleRender(), true) // feel free to use capture mode for certain events
function render(now) {
  // DOM reads
  const windowSizeX = document.documentElement.clientWidth
  // Handle inputs
  let selectedId = st.selectedId
  if (st.events.click != null) {
    const target = st.events.click.target
    if (target instanceof HTMLElement) {
      selectedId = target.dataset.id ?? selectedId
    }
  }

  // Layout (no DOM writes here; compute cursor as variable, not on DOM)
  let cursor = windowSizeX < 800 ? 'default' : 'auto'
  if (selectedId != null) cursor = 'pointer'

  // Animation tick
  let newAnimatedUntilTime = st.animatedUntilTime ?? now
  const steps = Math.min(300, Math.floor((now - newAnimatedUntilTime) / msPerAnimationStep)) // spiral of death prevention, see Animation.md
  newAnimatedUntilTime += steps * msPerAnimationStep
  let stillAnimating = false
  // ... spring steps

  // Commit state
  st.selectedId = selectedId
  st.events.click = null
  st.animatedUntilTime = stillAnimating ? newAnimatedUntilTime : null

  // DOM writes projections
  document.body.style.cursor = cursor

  // Side effects (scrollTo, pushState, selection, etc.)

  return stillAnimating
}

scheduleRender()
```

Only events and render's final step can schedule a next render.

### Event Handlers

Allowed in event handlers:

- Storing raw input that'd otherwise be lost before the next render in regular transient state, e.g. `st.events.click = e`, `formValue = input.value`, or `pointerDownTime = document.timeline.currentTime`
- `scheduleRender()`
- Gesture-gated APIs (see below)

These event fields are not a separate subsystem; they're just ordinary state fields whose lifetime happens to be one frame or so. Store event info in event handlers (e.g. a click event, or an input value); do NOT do extra logic/state modifications that could have been done in `render` instead. This is counter to many paradigms out there that loosely do bigger chunks of state changes in events. In a proper render loop architecture, like in games, events are stored then that frame's render, and often only by then, has full info on what to do with those events. If we crammed bits of logic into events out of premature convenience, we wouldn't be able to e.g. consider both a click and a key press in that same frame and do some interesting UX action

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

A React app might not be able to follow this, but when the need arises (heavy interactivity), this can still be adopted within components.

## Event Consumption

In the render loop, events are stored on arrival and consumed during render. **Null them in the "commit state" phase** (after layout + animation, before DOM writes), not at the beginning of render. This ensures they're available throughout the entire state computation.

```js
// commit state
st.events.click = null
```

For DOM reads, writes, and interleaving rules, see [ui-architecture.md § DOM](ui-architecture.md#dom).
