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

Possible operations if this becomes real later:

- `aspring(...)`
- `aspringSample(...)`
- `aspringRetarget(...)`
- `aspringNudgeVelocity(...)`
- `aspringSnapTo(...)`
- `aspringGoToEnd(...)`

But this should not be treated as canon yet. The operations may be real, while the exact helper surface and naming are still too easy to bikeshed.
