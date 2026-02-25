# Animation (Section Under Construction)

Animations are hard for several reasons:

- They require thinking about the states in-between the main states, aka the interpolations in-between the keyframes. Most web frameworks are not architected to cater to this. Those transitional states are often prematurity discarded "by construction" through types and data structures that naively made states (which they consider illegal) irrepresentable.
- Animations forces the interface to be fast and smooth. Most webapps barely scrape by with low performance, and thus the lack of animation helps hide sluggishness.
- Animation architectures on the web typical overfit specific use-cases like sending simple, standalone effects to the GPU to avoid janks from CPU. This also removed the forcing function for main thread performance to be good. Most tasteful animations require interactions between various UI elements, gestures, CPU-side computations, etc.
- Modern web frameworks optimize for throughput performance at the expense of latency performance (elaborate)
- Animations require structural ...

## Tips & Tricks

- Some animations should be source of truth for state from which other states are derived (e.g. ?)
- Some animations should be derived from state (e.g. ios 18 photos bottom bar darken & word color flip are a function of scroll pos)

data structure dictate access patterns and control flow, and since animations might affect data structure, I don't believe in wrapping it up obscurely and only provide opaque accessors. E.g. every time someone abstract away the underlying mechanism of some physical animation like spring, decay and others, someone else hacks into it to get e.g. the velocity in order to derive other states from it. Understandable to make opaque due to need to crossing to GPU, but......

"animate your way to glory" article. Decouple physical clock from logical clock.

## Pitfalls

- **Do NOT add `will-change: transform` (or any `will-change`) to animated elements by default.** This is blind premature optimization that promotes elements to their own compositing layer, consuming GPU memory, causes text rendering differences, and interfering with stacking contexts. **Don't add it to CSS classes applied to many elements** (e.g. grid items) — each one gets its own layer. Exceptions:
  - When `boxShadow` + `scale()` animation happens together, `will-change: transform` may be required to avoid flicker from compositing layer promote/demote churn. [Mozilla 790239](https://bugzilla.mozilla.org/show_bug.cgi?id=790239), [Mozilla 1122885](https://bugzilla.mozilla.org/show_bug.cgi?id=1122885).
  - When using WebAnimations API (predictive keyframes pattern) where elements are explicitly handed to the compositor — `will-change: transform` is appropriate since the compositor is doing the rendering anyway.

## Springs

Springs became the pseudo-standard for UI animations thanks to their versatility, playfulness and smooth interruptibility. Example implementation:

```ts
// 4ms/step for the spring animation's step. Typically 4 steps for 60fps (16.6ms/frame) and 2 for 120fps (8.3ms/frame). Frame time delta varies, so not always true
// could use 8ms instead, but 120fps' 8.3ms/frame means the computation might not fit in the remaining 0.3ms, which means sometime the simulation step wouldn't even run once, giving the illusion of jank
const msPerAnimationStep = 6
type Spring = { pos: number; dest: number; v: number; k: number; b: number }
function spring(position: number, destination = position, velocity = 0, stiffness = 333, damping = 33): Spring {
  return { pos: position, dest: destination, v: velocity, k: stiffness, b: damping } // try https://chenglou.me/react-motion/demos/demo5-spring-parameters-chooser/
}
function springStep(config: Spring) {
  const t = msPerAnimationStep / 1000 // convert to seconds for the physics equation
  const { pos, dest, v, k, b } = config
  // for animations, dest is actually spring at rest. Current position is the spring's stretched/compressed state
  const Fspring = -k * (pos - dest) // Spring stiffness, in kg / s^2
  const Fdamper = -b * v // Damping, in kg / s
  const a = Fspring + Fdamper // a needs to be divided by mass, but we'll assume mass of 1. Adjust k and b to change spring curve instead
  const newV = v + a * t
  const newPos = pos + newV * t

  config.pos = newPos
  config.v = newV
}
function springGoToEnd(config: Spring) {
  config.pos = config.dest
  config.v = 0
}
function springMostlyDone(s: Spring) {
  return Math.abs(s.v) < 0.01 && Math.abs(s.dest - s.pos) < 0.01
}
```

We usually end a spring animation once it's almost at the target and velocity ~0: `if (springMostlyDone(s)) springGoToEnd(s)`
We can't compare against the exact target value and velocity of 0 since the spring oscillates forever within a small delta

### Obscure Usages

Imagine a scroll view with an image that you can tap to enlarge into a detail image view. When you dismiss, the image bounces back to its original place in the parent scroll view. If, at that time, you keep scrolling the scroll view up and down non-stop, the image will in theory bounce back and forth forever as you jitter the scroll view. iOS springboard and other places use a concept called *spring tightening* to fix this. They gradually "tighten" the spring, either through tweaking the spring constants, or by modeling the tightening itself as another spring. This way, the image itself bounces tighter and tighter til rest, even if you're still jittering the scroll view.

This is a bit overkill. And in reality, this is often a mismanagement of the image's (conceptual) coordinate system. The image's position should be relative to the scroll view container's, i.e. no matter where we scroll, the image's y is at, say, 12px. And then when it springs from zoomed in view back to the scroll view, it goes back to its local coordinate of 12px and doesn't care about the scroll view's y movement at all. The reason why iOS had to employ spring tightening is, among other reasons, because they lift the image out of its local coordinates for animation. They're undoing some component hierarchy's default influence on the layout numbers, when the layout numbers should have been decoupled from the hierarchy.

iOS FaceTime and Picture-in-Picture lets you flick a view that always ends up snapping nicely to some fixed corner. This uses two springs running simultaneously. First, exponential decay is used to calculate `rest_pos` — where the flick would naturally come to rest. Which corner to snap to is determined by `rest_pos`. Then:

- `spring_1(t)`: starts at `current_pos` (with the flick's initial velocity), targets `rest_pos`.
- `spring_2(t)`: starts at `rest_pos`, targets `corner`.
- The final position is (speculatively) `spring_1(t) + (spring_2(t) - rest_pos)`.

At t=0 this gives `current_pos + 0 = current_pos`. At t=∞ this gives `rest_pos + (corner - rest_pos) = corner`. Early on, spring_1 dominates and the motion follows the flick's momentum. Spring_2's correction starts at zero displacement and gradually steers toward the corner, so there's no jolt. Using a spring rather than a pure decay for the first component lets the motion overshoot `rest_pos` on hard flicks, which feels more physical. Since two damped springs are both solutions to second-order linear ODEs, their sum is too, so there might be an equivalent single-spring formulation with modified initial conditions. See [gesture-flick-snap-target](../gesture-flick-snap-target.html).

## Exponential Decay

Springs are often overrated. Exp decays are simple, with great properties:
- No overshoot bounce. Smoothly eases out to a resting position that's analytically computable ahead of time
- Interruptible without transition discontinuity
- Closed-form. `x(t) = x0 * e^(-kt)` plug in any t, get the exact answer. No stepping loop, no accumulated numerical error, can skip ahead to any point in time. FPS-independent! (the naive velocity *= 0.99 per frame gives 0.99^60 ≈ 0.55 at 60fps but 0.99^30 ≈ 0.74 at 30fps)

## Predictive Keyframes

**Warning**: this is high-complexity. Only do this within a small scope, or if you're ready to pay the cost of needing a rewindable world.
CSS/WebAnimation run on dedicated threads that avoid jank, at the cost of expressivity. JS animation has full expressivity at the cost of jank. To have the smoothest JS animations, we can do a hybrid: simulate in advance the next few frames of the animation in JS, then turn them into WebAnimations keyframes to play

```js
function render(now) {
  // cancel previous predictions
  for (let entry of boxAnimations.values()) entry.animation.cancel()

  // catch up to current time
  let steps = Math.floor((now - lastTime) / msPerAnimationStep)
  lastTime += steps * msPerAnimationStep
  for (let i = 0; i < steps; i++) world = simulate(world)

  // predict ~1200ms ahead, collect keyframes per element
  let frames = new Map() // id -> { keyframes: [...] }
  let predicted = world
  for (let i = 0; i <= 200; i++) {
    addKeyframes(predicted, i, frames)
    // pads {display:'none'} for elements absent in this frame
    // pads earlier frames with {display:'none'} for elements first appearing here
    predicted = simulate(predicted) // deep clones internally, doesn't mutate world
  }

  // hand to compositor thread through WebAnimations
  for (let [id, f] of frames)
    element.animate(f.keyframes, {
      duration: msPerAnimationStep * (f.keyframes.length - 1),
      easing: `steps(${f.keyframes.length - 1}, end)`, // do NOT use `linear` easing! These frames are already the smallest unit of time; there's nothing in-between
      fill: 'forwards',
    })

  setTimeout(() => requestAnimationFrame(render), 300) // intentionally janky render loop for demo purpose; results still smooth!
}
```

**`display: 'block'` is required on every visible frame.** The Web Animations API resolves missing properties from adjacent keyframes. A frame with only `{transform, opacity}` between two `{display: 'none'}` frames inherits `display: none` and stays invisible. Every visible frame needs explicit `display: 'block'`. [Chromium 382509289](https://issues.chromium.org/issues/382509289).

The simulation must be non-mutative since we're predicting ahead & throwing away predictions later. This requires:
- Pure function for `simulate()`. No bad DOM ops, no side effects inside `simulate()`
- JS animations. CSS transitions/easings are opaque won't work since you can't know & control their intermediate values

During the catch-up phase where we do `simulate()`: you have a choice to either catch up from potentially a very long time ago (e.g. browser tab was backgrounded) til now, incurring expensive computations, or cap the steps (e.g. `if (steps > N) steps = N`) and accept a time skip. There's no clean middle ground — a slow catch-up makes the next frame late, which means even more catch-up (spiral of death), but capping to 0 freezes the simulation forever at its current state.

See [predictive-keyframes.html](../demos/predictive-keyframes.html) for a working example.
