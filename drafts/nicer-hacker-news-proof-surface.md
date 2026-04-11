# Nicer Hacker News Proof Surface

Goal: move only the layout decisions that block a static checker. Do not rewrite the whole demo around selection or browser quirks unless it buys proof surface.

That goal is also too tool-shaped, so here is the real one:

- let one userland model own comment geometry
- make measurement, rendering, hit testing, and highlights use that same model
- leave only a small browser seam at the end

This demo currently has a bigger split than `photo-gallery`:

- Pretext already measures the comments
- the browser still renders the comment flow
- DOM APIs still decide selection and highlight geometry

So the issue is not just "the checker can't prove enough". The issue is that the app has two layout engines for the same comment.

## Already Good

`demos/nicer-hacker-news/index.ts` already has a decent amount of userland geometry:

- `containerWidthF()`
- `commentLeftF()`
- `commentWidthF()`
- `rowHeightNaturalF()`
- the submission/scroller vertical partition
- row hit testing using natural heights instead of animated heights
- gutter x positions from `indentWidth`

That is a good start. The main problem is that the comment text is still rendered by browser flow even though its height is measured in userland.

Another way to say it:

- row stack geometry is mostly userland
- comment internal geometry is still split across userland and browser

That split is the first thing to collapse.

## What We Want To Be Able To Say

After the refactor, we should be able to say things like:

- the measured comment height and the rendered comment height are the same model
- block gaps come from one source, not from JS plus CSS margins
- link hit testing, search highlights, and selection highlights all reuse the same fragment geometry
- row hit testing and comment rendering do not disagree about where text lives

Again, that is the main goal. The static checker is the consumer of that clearer geometry ownership.

## Change First

### 1. Stop measuring with Pretext and rendering with DOM flow

This is the biggest mismatch in the repo right now.

Today:

- `hn-comment-layout.ts` measures and materializes lines with Pretext
- `renderHNCommentDoc()` still renders `<p>`, `<pre>`, `<a>`, and plain text
- CSS still owns paragraph margins, code block wrapping, and inline line breaking

So the checker can reason about the measured height, but not the actual rendered geometry.

Change:

- Make `layoutPreparedHNCommentDoc()` the single source of truth for visible comment layout.
- Return block tops, line tops, fragment x positions, fragment widths, and total height.
- Render comments from that layout result instead of from `renderHNCommentDoc()`.

The key rule here is simple:

- if Pretext measured it, Pretext should also decide where it goes

That is the highest-leverage change in this demo by far.

### 2. Remove CSS-owned block spacing from comment layout

Right now some spacing lives in JS and some in CSS:

- JS has `COMMENT_BLOCK_GAP = 8`
- CSS also gives `.comment p` and `.comment pre` their own margins

That is exactly the kind of split that weakens the checker.

Change:

- Delete paragraph and pre margins from CSS for the proof path.
- Put all block gaps in the layout result from `hn-comment-layout.ts`.
- Keep the DOM projection dumb: absolute top/left/width/height only.

The deeper rule is:

- spacing that affects layout should not be split between a geometry model and stylesheet defaults

If the checker has to guess which margins CSS added, it is already proving the wrong thing.

### 3. Turn comment rendering into explicit rectangles

For the proof surface, the checker wants rectangle-producing helpers, not implicit flow.

Change:

- Each row should return:
  - user banner rect
  - comment rect
  - block rects inside the comment
  - line rects inside each block
  - fragment rects for links / italic / text if needed
- The DOM should just paint those rectangles.

This would let the checker prove:

- comment rect stays inside the row
- blocks stay inside the comment rect
- lines are monotone
- total comment height matches the last line bottom

This also pays off for ordinary product work:

- easier search highlighting
- easier selection painting
- easier browser reports
- easier debugging when one comment wraps badly

### 4. Move search-highlight and selection-highlight geometry to userland

Today the highlight geometry comes from:

- `caretRangeFromPoint`
- `elementFromPoint`
- `Range.getClientRects()`

Those are browser APIs, so the checker cannot reason about them.

Change:

- Compute text-hit routing against the Pretext line fragments.
- Compute search highlight rects from the same fragment geometry.
- Compute selection highlight rects from the same fragment geometry.

It is fine to still use the browser for clipboard copy at the edge. The important change is that the rectangles come from the model, not from DOM ranges.

This is a good example of what we should and should not pull into userland:

- the rectangle geometry should move over
- the actual clipboard effect can stay a browser seam

### 5. Keep row animation separate from row geometry

The demo already partially does this by hit testing against natural heights. Push that idea one step further.

Change:

- Extract a pure row geometry helper based on natural heights.
- Treat animated row heights and `scrollerPeekUp` as a second layer.
- Let the checker prove the base row stack first.

This keeps the proof surface stable even if the animation layer stays imperative.

## What This Demo Would Look Like After The Refactor

One clean shape would be:

- `layoutCommentDoc(...) -> {blocks, lines, fragments, height}`
- `layoutThreadRows(...) -> {userRects, commentRects, gutterSegments, contentHeight}`
- `hitTestCommentText(...)` against fragment geometry
- `selectionRects(...)` and `searchRects(...)` from the same fragment geometry
- `projectThreadToDom(...)` that only paints those results

Then the browser no longer decides where paragraphs, links, and code blocks physically go. It just paints a layout model we already own.

## Leave Alone For Now

These are real seams, but they are not the first things to drag into the checker:

- browser scroll behavior and the smoothed `scrollTop`
- link opening
- canvas rasterization details
- caret quirks across browsers
- copy event handling

Those should stay browser-backed until the base text geometry is fully userland.

The practical rule is the same as in `photo-gallery`:

- own geometry when it is cheap and central
- keep real browser behavior as an explicit seam instead of half-owning it

## What The Checker Could Prove After These Changes

- comment width is non-negative for every row
- row tops are monotone
- comment rect fits inside its row
- block tops are monotone inside a comment
- block gaps are exactly `8px`
- total comment height matches the last block bottom
- gutter x equals `indent * 24`
- search highlight rects stay inside the comment rect
- selection highlight rects stay inside the comment rect
- hit testing uses the same geometry that rendering uses

## Practical Order

Do it in this order:

1. Make Pretext own both comment measurement and visible comment placement.
2. Remove CSS block margins from the proof path.
3. Return explicit block, line, and fragment rectangles.
4. Move search and selection highlight geometry onto those rectangles.
5. Keep scroll and clipboard as browser seams.

The first step does most of the work. Until measurement and rendering share one geometry model, the checker will always be proving the wrong thing.
