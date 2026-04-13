# JS Layout Geometry

If JS owns layout, let one JS model own the answer.

The checker should prove facts about that model. It should not make the app code pretend to be a verifier DSL.

## Natural Code First

Write normal layout:

```ts
let y = top
for (const row of rows) {
  boxes.push({top: y, height: row.height})
  y += row.height + gap
}
```

Then state the intended geometry:

```ts
/** @layout
 * requires rows[].height >= 0
 * ensures contiguousY(result.boxes, gap)
 */
```

If the checker cannot prove the loop yet, grow the checker. Do not rewrite the loop into proof-shaped runtime helpers.

## Shared Geometry

Paint, hit testing, selection, occlusion, and scroll anchoring should read the same boxes.

Good facts to state:

- `rectEquals(hitArea, layoutBox)`
- `rectInside(promptBox, layoutBox)`
- `sameLength(result.items, sources)`
- `result.contentHeight == lastBottom(result.rows) + bottomGap`
- `nonOverlapX(row.items.map(item => item.layoutBox))`

Bad:

- layout computes one box, hit testing recomputes another
- selection remeasures sliced strings after text layout already produced fragments
- occlusion uses a guessed height that paint does not use

## Base Geometry Then Projection

Keep stable layout separate from animation residuals.

Good:

- `layoutBox` is the base box
- `promptBox` is derived from the same base geometry
- `hitArea` says where pointer routing happens
- visual projection adds residuals later

Then proofs target the base geometry. Animation can have its own static facts later, but do not make the base layout depend on a moving projection.

## Text Geometry

Pretext means text is a layout model, not an opaque browser guess.

Useful facts:

- line width fits the offered width
- fragments are ordered by text offset
- fragments cover the line text range
- line ranges cover the rendered text range
- selection rects read the same fragments used for paint

If a prefix, badge, quote mark, or icon changes wrapping, make it part of the measured stream.

## Opaque Boundaries

Prefer source. Use a boundary summary only when the helper is genuinely opaque to the checker.

Good summary:

```ts
/** @layout
 * ensures result.visibleHeight == result.lines.length * lineHeight
 * ensures result.width <= offeredWidth
 */
function measureTextBlock(...) { ... }
```

Bad summary:

- a second approximate text measurement in the outer layout
- a sampled page case that happens to match one string
- a contract file that silently stands in for source without appearing in the report

## Negotiated Vectors

For tables, tracks, and flex-like constraints, keep the vector as the geometry.

Good:

```ts
const widths = [0, 0, 0]
widths[column] = Math.max(widths[column]!, minWidth)
return {widths, totalWidth}
```

Good facts:

- `trackVectorSatisfiesBounds(widths, cells)`
- `totalWidth == sum(widths) + gap * max(0, widths.length - 1)`

Bad:

- one formula for total width and a separate guessed formula for cell widths
- flattening an `N` column problem into named locals just because a checker is young

## Hit Rects

Hit testing should use half-open rectangles:

```ts
x >= left && x < right
y >= top && y < bottom
```

The first pixel after the box belongs to the next box, not both boxes.

## Resize

Continuous resize is not a mode transition. Recompute base geometry directly from current inputs. Use animation residuals only for real visual transitions.

Good fact:

- an anchored item's screen `y` is preserved by the scroll adjustment relation

State the relation in userland geometry and prove that helper.
