# Verification

This doc details ways to prioritize verifications & make them solid.

Verification should feel like static typing for layout.

The checker reads ordinary TS layout code plus strict `@layout` comments. It proves the annotated facts from source, or says `unknown`. It does not start browsers, record runtime traces, compare screenshots, run example cases, or sample "representative" inputs.

If a fact is not proven statically, it is not a verifier guarantee.

## The Contract

`@layout` comments are erased like TS types:

```ts
/** @layout
 * given width: int[320, 1600]
 * result.cols: int[1, 7]
 * result.boxMaxSizeX >= 0
 */
function colsBoxMaxSizeXF(width: number) {
  const boxMinSizeX = 220
  const cols = clamp(1, Math.floor((width - gap) / (boxMinSizeX + gap)), 7)
  return {cols, boxMaxSizeX: (width - gap - cols * gap) / cols}
}
```

`given` lines are input facts. Bare lines are facts the checker has to prove.

This is not prose. The parser should reject "does the right thing". The authoring surface can later be prose-assisted, but the committed truth is a small structured language.

## What Counts

Good proof mechanisms:

- symbolic facts over the lowered source
- range facts over declared numeric domains
- structural facts over recognized layout loops, say stacked rows or local width vectors
- finite discrete domains only when the domain is explicitly finite and the checker proves the check as such

Not static guarantees:

- observed executions
- sampled inputs
- approximate mirror code outside the function being checked

Those can be useful while designing a fact, but the committed report should only say what the checker proved from source.

## Unknown Is Real

`unknown` means the checker did not prove the fact. It is different from failure.

Good:

- `result.cols: int[1, 7]` passes from a range proof
- `result.contentHeight == lastBottom(result.rows)` reports `unknown` until the checker understands that row loop
- `rectInside(promptBox, layoutBox)` fails if the source proves the prompt can overflow

Bad:

- replacing the unknown row proof with three example cases
- accepting sampled inputs because they happened to pass
- letting unsupported syntax silently become documentation

## Proof Vocabulary

Keep app code normal. Put proof vocabulary in annotations, not in runtime layout code.

Good app code:

```ts
const rows = []
let y = top
for (const item of items) {
  rows.push({top: y, height: item.height})
  y += item.height + gap
}
return rows
```

Good spec:

```ts
/** @layout
 * given items[].height >= 0
 * given gap >= 0
 * sameLength(result, items)
 * contiguousY(result, gap)
 */
```

The checker can learn `contiguousY` by recognizing the running `y` loop. If it cannot, it reports `unknown`. Do not rewrite the app into `contiguousYBuilder(...)` just to satisfy the checker.

Relational preconditions should read like the layout fact they mean:

```ts
/** @layout
 * given containee: number[0, 1000]
 * given container: number[0, 1000]
 * given container >= containee
 * result >= 0
 */
function centeredOffset(containee: number, container: number) {
  return (container - containee) / 2
}
```

The checker can do small linear reduction. E.g. `container >= containee + padding` plus `padding: number[0, 100]` is enough to prove `container >= containee`. This is still just static arithmetic over the lowered source, not a general logic engine.

Math choice helpers should keep the branch fact just long enough:

```ts
/** @layout
 * given width: number[0, 1000]
 * result.overflow >= 0
 */
function cappedOverflow(width: number) {
  const capped = Math.min(width, 320)
  return {overflow: width - capped}
}
```

The checker proves this by splitting `Math.min`: either `capped == width`, or `capped == 320` and `width >= 320`. Keep this tiny and local. Do not turn it into a general path engine until ordinary layout code needs that.

Array facts should be its own small layer:

```ts
/** @layout
 * given items.length: int[0, 100]
 * given index: int[0, 100]
 * given index < items.length
 * result.index < items.length
 */
function keepIndex(items: Item[], index: number) {
  return {index}
}
```

This layer knows `.length`, array literal length, literal indexing, and spread append length. It should not own row contiguity. The running-sum loop can use these facts later, but it should be recognized as a separate layout shape.

## Atoms

Start with a small owned vocabulary:

- `rectInside(child, parent)`
- `rectEquals(a, b)`
- `nonOverlapX(rects)` / `nonOverlapY(rects)`
- `monotone(values)`
- `contiguousY(rows, gap)`
- `sameLength(a, b)`
- `lastBottom(rows)`
- `coversOffsets(fragments, textRange)`
- `columnWidthsFitCells(widths, cells)`

Agents may compose atoms into local named facts. If a composition repeats, promote it into a shared atom after reading it.

## Text Layout

Pretext makes text geometry userland data. That is exactly where this checker should grow.

Useful text facts:

- every line width fits the offered width
- fragments are ordered by `textStart`
- adjacent fragments cover a line's text range
- line ranges cover the rendered text range
- selection rects come from the same fragments used for paint
- decorative prefixes that affect wrapping are part of the measured stream

These should compose upward: text lines prove block height, block height proves row tops, row tops prove visible ranges and scroll anchors.

## Finite Domains

Do not add finite enumeration in the first version. Prefer source range and symbolic proofs first.

If we later need finite domains, use a narrow explicit mechanism:

- the input is declared finite and discrete, e.g. `width: int[320, 1600]`
- the checker covers the whole domain, not a step size
- the report calls it finite-domain proof, not "sweep"

No sampled sweep is a verifier law.

## Reports

A report should say:

- which file and function the check came from
- the exact annotation text
- `pass`, `fail`, or `unknown`
- the reason for `fail` or `unknown`
- the local proof context: what was needed, what was known, and the likely missing fact

Keep drafted facts and exploratory checks out of the committed verifier report.

## Checker Tests

Keep verifier tests split:

- `patterns.ts` is good code that must prove.
- `negative-patterns.ts` is bad code that must not prove.
- Track stable expected messages, not the whole JSON report.

Good negative tests are tiny and archetypal. E.g. a helper accepts `value: number[0, 20]` and calls another helper with `given value: number[0, 10]`; the expected output should name the failed `given` line.
