# Animation (Section Under Construction)

Modern webapps are caught between the two extremes of "everything animates everywhere" and "nothing animates ever". To learn to judiciously sprinkle animations in the right places to convey intent, requires judgement and taste. This will take a while.

Animations are hard for several reasons:

- They require thinking about the states in-between the main states, aka the interpolations in-between the keyframes. Most web frameworks are not architected to cater to this. Those transitional states are often prematurity discarded "by construction" through types and data structures that naively made states (which they consider illegal) irrepresentable.
- Animations forces the interface to be fast and smooth. Most webapps barely scrape by with low performance, and thus the lack of animation helps hide sluggishness.
- Animation architectures on the web typical overfit specific use-cases like sending simple, standalone effects to the GPU to avoid janks from CPU. This also removed the forcing function for main thread performance to be good. Most tasteful animations require interactions between various UI elements, gestures, CPU-side computations, etc.
- Modern web frameworks optimize for throughput performance at the expense of latency performance (elaborate)
- Animations require structural ........

## Tips & Tricks

- Some animations should be source of truth for state from which other states are derived (e.g. ?)
- Some animations should be derived from state (e.g. ios 18 photos bottom bar darken & word color flip are a function of scroll pos)

data structure dictate access patterns and control flow, and since animations might affect data structure, I don't believe in wrapping it up obscurely and only provide opaque accessors. E.g. every time someone abstract away the underlying mechanism of some physical animation like spring, decay and others, someone else hacks into it to get e.g. the velocity in order to derive other states from it. Understandable to make opaque due to need to crossing to GPU, but......

send future frames to gpu in case CPU janks

"animate your way to glory" article. Decouple physical clock from logical clock.

## Exponential Decay

Springs are often overrated. Exp decays are simple, with great properties:
- No overshoot bounce. Smoothly eases out to a resting position that's analytically computable ahead of time
- Interruptible without transition discontinuity
- Closed-form. `x(t) = x0 * e^(-kt)` plug in any t, get the exact answer. No stepping loop, no accumulated numerical error, can skip ahead to any point in time. FPS-independent! (the naive velocity *= 0.99 per frame gives 0.99^60 ≈ 0.55 at 60fps but 0.99^30 ≈ 0.74 at 30fps)

## Springs

We usually end a spring animation once it achieves a certain small velocity and position threshold (distance isn't enough! The spring might be oscillating).

Imagine a scroll view with an image that you can tap to enlarge into a detail image view. When you dismiss, the image bounces back to its original place in the parent scroll view. If, at that time, you keep scrolling the scroll view up and down non-stop, the image will in theory bounce back and forth forever as you jitter the scroll view. iOS springboard and other places use a concept called *spring tightening* to fix this. They gradually "tighten" the spring, either through tweaking the spring constants, or by modeling the tightening itself as another spring. This way, the image itself bounces tighter and tighter til rest, even if you're still jittering the scroll view.

This is a bit overkill. And in reality, this is often a mismanagement of the image's (conceptual) coordinate system. The image's position should be relative to the scroll view container's, i.e. no matter where we scroll, the image's y is at, say, 12px. And then when it springs from zoomed in view back to the scroll view, it goes back to its local coordinate of 12px and doesn't care about the scroll view's y movement at all. The reason why iOS had to employ spring tightening is, among other reasons, because they lift the image out of its local coordinates for animation. They're undoing some component hierarchy's default influence on the layout numbers, when the layout numbers should have been decoupled from the hierarchy.

iOS FaceTime and Picture-in-Picture lets you flick a view that always ends up snapping nicely to some fixed corner. This uses two springs running simultaneously. First, exponential decay is used to calculate `rest_pos` — where the flick would naturally come to rest. Which corner to snap to is determined by `rest_pos`. Then:

- `spring_1(t)`: starts at `current_pos` (with the flick's initial velocity), targets `rest_pos`.
- `spring_2(t)`: starts at `rest_pos`, targets `corner`.
- The final position is (speculatively) `spring_1(t) + (spring_2(t) - rest_pos)`.

At t=0 this gives `current_pos + 0 = current_pos`. At t=∞ this gives `rest_pos + (corner - rest_pos) = corner`. Early on, spring_1 dominates and the motion follows the flick's momentum. Spring_2's correction starts at zero displacement and gradually steers toward the corner, so there's no jolt. Using a spring rather than a pure decay for the first component lets the motion overshoot `rest_pos` on hard flicks, which feels more physical. Since two damped springs are both solutions to second-order linear ODEs, their sum is too, so there might be an equivalent single-spring formulation with modified initial conditions. See [gesture-flick-snap-target](../gesture-flick-snap-target.html).
