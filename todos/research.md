# Research (Draft 2)

## Analytical Springs

Analytical springs are elegant, but this whole topic is research for now, not source-of-truth doctrine yet.

Why they're attractive:

- closed-form: sample any time directly, no stepping loop
- no spiral-of-death bookkeeping
- no accumulated integration drift
- retargeting works by sampling current `pos` / `vel` and restarting the closed-form trajectory from there
- prediction is cheap, which matters for things like predictive keyframes or some gesture handoff patterns

Why this keeps getting bike-sheddy:

- numerical springs use the same stepping equation whether the motion is underdamped, critically damped, or overdamped
- analytical springs split into different closed forms depending on the damping regime
- that is a real ergonomic loss, even if the math itself is nice
- the naive underdamped formula has a `1 / omega` term, so it gets awkward near critical damping even though the true limit is perfectly finite

For UI, the useful regimes are roughly:

- underdamped: bounce / overshoot
- critically damped: fastest no-overshoot settle
- overdamped: slower, heavier, usually less interesting

In other words, overdamped is probably the case we care about least, but critically damped is not optional if this becomes real.

Let `x(t) = pos(t) - dest`, `x0 = pos0 - dest`, `v0 = initial velocity`, `alpha = damping / 2`, and `omega0 = sqrt(stiffness)`.

- Underdamped (`alpha < omega0`):
  `x(t) = e^(-alpha t) * (x0 * cos(omega t) + ((v0 + alpha * x0) / omega) * sin(omega t))`
  where `omega = sqrt(omega0^2 - alpha^2)`
- Critically damped (`alpha = omega0`):
  `x(t) = e^(-alpha t) * (x0 + (v0 + alpha * x0) * t)`
- Overdamped (`alpha > omega0`):
  `x(t) = e^(-alpha t) * (x0 * cosh(delta t) + ((v0 + alpha * x0) / delta) * sinh(delta t))`
  where `delta = sqrt(alpha^2 - omega0^2)`

The critical form is the `omega -> 0` limit of the underdamped one:

- `sin(omega * t) / omega -> t`
- `cos(omega * t) -> 1`

So critical damping really is the boundary case. The annoying part is just that the nice underdamped parameterization is not numerically pleasant all the way to the boundary.

Current repo take:

- `spring-comparison` is the right place to be the eventual source-of-truth demo if this gets real
- `gesture-flick-snap-target` is a strong analytical candidate: direct drag, then release into a trajectory
- `draggable-cards` is a plausible sweet-spot candidate, but only if the code still feels small and obvious
- `photo-gallery` should probably first split layout values from animated residuals before trying to swap the spring model
- `predictive-keyframes` stays numerical. That demo is simulation-shaped, not isolated-spring-shaped

The real structural lesson from the gallery discussion was probably not "analytical beats numerical". It was "too many absolute layout values became springs". A better split is:

- layout numbers: plain `x`, `y`, `sizeX`, `sizeY`
- animated residuals: `xOffset`, `yOffset`, `scaleOffset`, etc.
- render = layout + residual

That makes analytical springs more plausible later, because many springs just decay back to zero instead of constantly being retargeted in absolute space.

## Layout + Residual

When too many absolute layout values become springs, things get muddy fast. Layout, animation, scroll compensation, hover effects, resize policy and hit testing all start living in the same numbers.

The cleaner split is:

- `x`, `y`, `sizeX`, `sizeY` are the real values
- residuals are the temporary animated deltas
- final visual value = real value + residual

So if an image is animating from one mode to another, we set its real `x/y/size` to the final values right away. Then we set the residuals to the delta between the current on-screen values and those final values, and let the residuals go back to `0`.

In other words, the residual is not "how far from the previous target we were". It's "how far from the new target we currently look on screen".

This also makes interruptibility cleaner. If an animation is halfway from `x0` to `x1`, and we now wanna go to `x2`, we don't think in terms of chaining deltas. We just look at the current on-screen x, compare it to `x2`, and set the residual from there.

This is not saying every animated property needs this split. Some things are already pure effect layers. In photo-gallery, `scale` is like that. `x/y/size` were the ones that needed the split because they were real layout values too.

## Continuity Ownership

The subtle part is not the spring. The subtle part is deciding which change owns continuity.

Some changes should preserve the current on-screen look and glide to the new layout:

- changing modes
- changing focused item
- real 2D grid reflow

Some changes should usually just change the real layout values and leave the residuals alone:

- plain resize where an item stays in the same place/column

So "base + residual" is only half the idea. The other half is the policy for when residuals get rewritten vs left alone.

If this feels history-dependent or weirdly sensitive to whether a spring had already settled, that's usually a sign the ownership is unclear and the spring state is leaking into policy.

Possible operations if this becomes real later:

- `aspring(...)`
- `aspringSample(...)`
- `aspringRetarget(...)`
- `aspringNudgeVelocity(...)`
- `aspringSnapTo(...)`
- `aspringGoToEnd(...)`

But this should not be treated as canon yet. The operations may be real, while the exact helper surface and naming are still too easy to bikeshed.
