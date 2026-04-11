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

If the verifier cannot understand some natural arithmetic yet, grow the verifier. Add a local contract only when the helper is genuinely opaque. Don't contort the app first.

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
- visible height is `lineCount * lineHeight`
- fragment boxes stay ordered inside the line box
- reported aggregate width really means `max(line.width)`

Bad:

- computing height with one helper, then remeasuring sliced substrings somewhere else to guess highlight rects
- measuring against one width, then letting CSS margins or wrapping silently change the same geometry later

The outer layout should trust one contract. It should not maintain a second approximate geometry algorithm for the same thing.

For the current static verifier sidecar shape, see `../../layout-verifier/contracts.md`.

## Hit Testing Should Read The Same Geometry

If JS owns text boxes or card boxes, let hit testing read those same boxes.

Good:

- a selection highlighter walks the same line fragments the renderer used
- clicking empty space in a comment returns the nearest text offset from the line tops and line widths you already computed
- a grid hit area comes from the same `layoutBox` and `promptBox` that drive paint

Bad:

- layout comes from one JS model, then hit testing remeasures sliced substrings later
- empty-space selection is guessed from DOM ranges even though line tops and text offsets are already in userland
- one helper returns merged text rects while another helper recomputes almost-the-same boxes with slightly different gap rules

Once the geometry is in userland, selection and hit routing should usually become geometry queries, not DOM archaeology.

## Hit Test Rects Are Half-Open

For box hit testing, include the left/top edge and exclude the right/bottom edge.

Good:

- `x >= left && x < right`
- `y >= top && y < bottom`
- a pointer exactly at `gridRight` returns no cell

Bad:

- letting both neighboring boxes own the shared edge
- treating `x === right` as inside, then producing `col = countX`

This matches array indexing. The first pixel belongs to the box; the first pixel after it does not.

## Grid Index Math Should Show Up On Screen

If a grid uses `Math.floor(i / cols)` and `i % cols`, make the verifier talk about the slot the item actually lands in.

Good:

- the item at index `i` is centered in the column slot implied by `i % cols`
- the item's `y` uses the row implied by `Math.floor(i / cols)`
- same-row overlap bugs report `row`, `column`, and the two x positions that crossed

Bad:

- proving `%` stays in bounds but never checking the placed box
- debugging row / column bugs from a raw `i` with no slot context

Quotient / remainder math is only interesting here because it decides visible placement.

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
