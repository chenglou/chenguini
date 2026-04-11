# Photo Gallery Proof Surface

Goal: remove only the DOM-driven layout that blocks a static rectangle checker. Do not rewrite unrelated browser seams just because we can.

That goal is a bit too tool-shaped, so here's the more useful version:

- move as much fragile geometry as possible into one userland layout model
- make rendering, hit testing, occlusion, and anchoring reuse that same geometry
- leave only a small browser seam at the end

This is not about proving the final browser pixels from first principles. It is about shrinking the amount of layout truth that still lives in CSS, DOM flow, and browser-specific behavior.

If a piece of behavior still depends on browser-owned text wrapping, `line-clamp`, real `scrollTop`, image decode timing, or compositing quirks, that is still a browser seam. The point of these changes is to make that seam smaller and more obvious.

For this demo, the good news is that most of the important geometry is already in userland. The remaining weak spot is the prompt.

## Already Good

`demos/photo-gallery/index.ts` already puts most of the important geometry in userland:

- `colsBoxMaxSizeXF()` computes column count and per-column width.
- `get2DLayout()` computes every grid box's size and row tops.
- The 1D mode computes every image's x/y/size in JS.
- The `100px` left and right hit areas are already explicit numbers in JS.
- The placeholder height already comes from `rowsTop.at(-1)`.

This is already a strong proof surface. Keep leaning into it.

Another way to say it:

- image size is already a modeled value
- image position is already a modeled value
- row structure is already a modeled value
- mode-specific hit-area numbers are already modeled values

So this demo is close to a world where the browser mostly paints a geometry model we already own.

## What We Want To Be Able To Say

After the refactor, we should be able to say things like:

- for any window width in a chosen range, the grid columns fit
- every box rect, prompt rect, and hit rect comes from one shared layout pass
- changing mode does not silently switch to a different geometry source
- occlusion uses the same base rectangles as rendering

That is more the point than "use a static checker". The checker is just the downstream consumer of that cleaner ownership split.

## Change First

### 1. Pull prompt layout fully into userland

Today the box height is userland, but the prompt's actual line breaks are still browser-owned:

- `promptSizeY = 44 + promptPaddingBottom`
- `.prompt` uses `display: -webkit-box`
- JS toggles `line-clamp: 2` vs `999`

That means the checker can prove `boxHeight = imageHeight + promptHeight`, but not:

- which lines are visible
- whether `44px` really shows two lines and not three
- whether the rendered prompt width matches the model width

Change:

- Use Pretext for prompt layout too.
- Compute `promptInnerWidth = boxSizeX - 24` in JS.
- In 2D mode, ask Pretext for exactly the first two lines.
- In 1D mode, ask Pretext for the full line layout.
- Render the prompt from positioned line boxes or fragments instead of browser line clamping.

This is the single biggest layout-proof win in this demo.

More importantly, it removes a geometry split:

- JS currently decides the box height
- CSS currently decides the prompt's visible line layout

That split is exactly what weakens both static reasoning and ordinary debugging.

### 2. Make the base box geometry a pure return value

Right now the pure layout math is mixed with animation and DOM projection in `render()`.

Change:

- Extract one pure helper that returns:
  - 2D box rects
  - 1D box rects
  - row tops
  - placeholder height
  - left/right hit rects
  - anchor candidates
- Keep springs and DOM writes outside that helper.

The checker should read the base rects, not animated residuals.

This also helps outside the checker:

- resize math becomes inspectable without stepping through springs
- hit testing stops needing to rediscover layout facts from live state
- browser-backed tests can ask the page for a compact geometry report instead of inferring it from DOM

### 3. Make hit areas first-class rectangles

Today `hitTest2DMode()` and `hitTest1DMode()` encode the geometry inline.

Change:

- Have layout return explicit hit rects.
- In 2D mode, return one hit rect per box.
- In 1D mode, return two viewport-wide vertical strips plus the center box rect.

That lets the checker prove:

- the left and right strips are always `100px`
- they do not overlap the centered image's dismissal region by accident
- they stay stable while the image animates

This is an example of the bigger doctrine:

- if a user interaction depends on geometry, model the geometry directly
- don't keep one shape for rendering and another ad hoc shape for input

### 4. Make the occlusion helper operate on base rects only

The current occlusion check mixes layout rects with conservative browser-UI allowances.

Change:

- Keep one pure helper: `visible(boxRect, scrollY, windowSizeY, topAllowance, bottomAllowance)`.
- Feed it base rects, not transformed DOM state.
- Keep the browser-UI allowances as inputs, not hidden constants in the DOM write loop.

This will not prove the browser chrome sizes, but it will prove the rest of the occlusion math.

That is a good trade:

- userland proves the visibility math
- browser checks still verify the final seam around translucent browser UI and actual rendering

## Leave Alone For Now

These are real seams, but they are not worth pulling into the static checker first:

- springs and residual animation
- `scrollTo` and real browser scroll behavior
- `history.pushState`
- image loading and the low-res/high-res swap
- filter, blur, and compositing details
- selection of the whole caption through DOM `Range`

Those want browser-backed checks, not more layout algebra.

The practical rule is:

- if we can own the geometry cheaply, own it
- if the geometry is really browser behavior, name it as a seam and verify it directly

## What This Demo Would Look Like After The Refactor

One clean shape would be:

- `layoutGallery2D(...) -> {boxRects, promptLayouts, hitRects, rowsTop, contentHeight}`
- `layoutGallery1D(...) -> {boxRects, promptLayouts, hitRects}`
- `projectToDom(...)` that only paints those results
- `visible(...)` that filters those rectangles for occlusion

Then:

- static analysis reasons about the pure layout helpers
- browser automation asks the page for the same layout packets when needed
- the remaining browser seam is mostly scroll behavior, selection, image loading, and rendering quirks

## What The Checker Could Prove After These Changes

- column count always fits the container
- every 2D box stays inside its row slot
- same-row boxes never overlap
- `rowsTop` is monotone
- placeholder height equals the last row bottom
- the focused 1D image is centered
- left and right hit strips are exactly `100px`
- hit strips do not depend on image width
- prompt rects stay inside their parent box
- prompt line layout uses the same offered width as the box geometry

## Practical Order

Do it in this order:

1. Prompt layout through Pretext.
2. Extract pure layout return values for 2D and 1D.
3. Return hit rects explicitly.
4. Extract pure occlusion math.

That gets most of the demo's fragile geometry into a proofable surface without turning the whole app into a theorem prover.
