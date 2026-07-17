# Research (Draft 2)

The analytical spring notes were promoted to `docs/Animation.md`.

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
