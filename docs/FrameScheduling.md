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

**Mixing clocks is wrong.** E.g. setting `animatedUntilTime = performance.now()` in a click handler, then computing `rAF_now - animatedUntilTime` in render: the rAF timestamp can actually be *earlier* than the `performance.now()` you stored, by tens of milliseconds on a busy page, so `steps` comes out negative: nothing gets simulated that frame, and `animatedUntilTime` moves backwards. Or slightly ahead, giving inconsistent step counts. `event.timeStamp` has the same problem. Use `document.timeline.currentTime` in the event handler instead — it's always on the same clock as rAF's `now`.

TODO: the compositor/main-thread pipelining described above appears to be Chromium-specific, not a spec requirement. Needs further clarification — see [Noam's thread](https://x.com/nomsternom/status/1853687984266055983).

**For input timing, `performance.now()` is fine** (or better: `event.timeStamp`, the high-precision time of the actual input event). Don't use rAF's `now` for velocity estimation — it's the frame time, not when the pointer actually moved.

## Gotchas

Specifically for React:

- As of React 18, all `setState`s are batched: https://github.com/reactwg/react-18/discussions/21
- Calling `setState` inside a `rAF` inside an event handler makes the state update happen on the *next* frame. [Demo](https://tinyurl.com/4yz8nes8). [Source](https://github.com/facebook/react/issues/31634#issuecomment-2500890102).

[Extra in-depth article on iOS game frame timing](https://web.archive.org/web/20210513101414/https://www.gamasutra.com/blogs/KwasiMensah/20110211/88949/Game_Loops_on_IOS.php) if you're interested. Generally applicable elsewhere.
