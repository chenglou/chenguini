# JS Layout Geometry

If JS owns layout, let one JS model own the answer.

Don't have JS decide an image card's size, CSS decide its caption fit, then DOM reads recover the rest later. That path keeps creating fake bugs where the policy is fine but the ownership is split.

## Keep Layout Arithmetic Natural

If JS owns layout, write normal JS layout.

Good:

- `const cols = clamp(1, Math.floor((width - gap) / (minCardWidth + gap)), 7)`
- a `for` loop that pushes `rowsTop`
- `Math.min` / `Math.max` when one size caps another

Bad:

- rewriting the same math as `add(...)`, `sub(...)`, `mul(...)`, `when(...)` only because a verifier exists
- forcing every layout helper through a special expression builder just to make proofs possible

If the verifier cannot understand some natural arithmetic yet, grow the verifier or add one local contract. Don't contort the app first.

## Base Geometry First, Animated Geometry Second

Compute the stable boxes once, then let animation add a visual residual on top.

Good:

- `layoutBox` for the card's stable `x/y/width/height`
- `promptBox` for the caption area
- `hitArea` for pointer routing
- `occlusionBounds` for virtualization
- a separate `visualBox` or residual offset for the animated projection

Bad:

- using the animated box as the only source of truth
- recomputing hit areas from whatever happened to be painted this frame
- letting scroll anchoring, hit testing, and occlusion all read slightly different geometry

The useful split is "base geometry" vs "animated projection", not "CSS layout" vs "JS layout".

## Text Geometry Wants One Owner

If JS decides a caption's width, line count, or height, don't then hand the same string back to normal DOM flow and hope it breaks the same way.

Bad:

- `pretext` says the caption fits on `1` line
- CSS `line-clamp` or a separate DOM structure does the actual wrapping
- the last word wraps anyway and gets clipped

Good:

- one `rich-inline` layout path returns the visible lines
- that same line list drives caption height, width shrink, and painted fragments

This is especially important when the layout is exact enough to shrink a `1`-line caption down to its tight width.

## Opaque Geometry Helpers Want Contracts

Sometimes one layout layer has to trust another.

Example:

- a row layout helper asks a text layout helper for caption height
- a comment thread layout asks a text engine for fragment boxes
- an outer scroller asks an inner layout for content height

When that happens, ask for small earned postconditions instead of recreating the inner layout badly downstream.

Good contracts:

- visible line width is `<= offeredWidth`
- visible height comes from line count and line height
- fragment boxes stay ordered inside the line box
- reported aggregate width really means `max(line.width)`

Bad:

- computing height with one helper, then remeasuring sliced substrings somewhere else to guess highlight rects
- measuring against one width, then letting CSS margins or wrapping silently change the same geometry later

The outer layout should trust one contract. It should not maintain a second approximate geometry algorithm for the same thing.

## Decorative Prefixes Count As Layout

If an opening quote, badge, or icon steals width, make it part of the measured text stream.

Good:

- measure `❝ ` as a real prefix item
- give it `break: 'never'` if it should stay attached
- render that same prefix in the painted fragments

Bad:

- measure plain text, then paint the quote with `::before`
- measure one text run, then render two inline boxes and expect identical wrapping
- treat `::first-letter` like a paint-only effect when it changes inline fragmentation

If the chrome changes wrapping, it is not just paint.

## Some Layout Quantities Depend On Each Other

Sometimes one size depends on another which depends back on the first.

Example:

- image height depends on how much vertical space the caption uses
- caption height depends on the image width
- image width depends on the image height and aspect ratio

Don't force a fake one-way formula there. A tiny bounded solve is fine.

Good:

- start from a plausible caption budget
- compute the image size
- recompute the caption height at that width
- do one more pass if needed

If the state space is tiny, say `1`, `2`, or `3` caption lines, this is still ordinary app code, not "building a layout engine".

## Resize Within One Mode Is Not A Mode Transition

Continuous resize has a different feel from changing modes.

If a grid stays a grid, don't keep kicking a spring residual every time the viewport changes by one pixel. That creates bowed motion where the item moves down then back up, or up then back down, even though its final slot is fine.

Good:

- recompute the anchored projection directly from the current layout and current scroll relation
- keep residual catch-up for real mode changes, e.g. grid to focused view

Bad:

- base `y` changes from resize
- anchored scroll correction changes too
- a residual spring keeps trying to preserve the previous frame's position

Repeated resize corrections and residual catch-up fight each other.

## Discrete Line Breaks Need An Explicit Resize Policy

Available width changes continuously. Line breaks do not.

When a caption moves from `2` lines to `1`, decide what should happen:

- snap to the new line layout immediately
- freeze the old lines until resize settles
- crossfade old and new line layouts

Don't pretend this is "just measurement". The widths can be perfectly right and the UI can still feel wrong if the transition policy is implicit.
