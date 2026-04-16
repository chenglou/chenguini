# Layout Verifier Todo

- Keep the active checker static-only: no browser runs, runtime traces, sampled sweeps, or committed fixture evidence.
- Work through [patterns.ts](./patterns.ts) without restating its list here.
- Add helper summaries only for opaque boundaries, and report which summary was trusted.
- Keep improving messages as new atoms land. Geometry facts should show the relevant edges, overflow amount, or crossing boxes.
- Use temporary mutation/red probes to decide which atoms to add next; keep them out of the committed guarantee report.

## Next Work

- Recognize the first running-sum loop. E.g. `let y = top; rows.push({top: y, height}); y += height + gap` should prove row tops move forward when heights and gap are non-negative.
- Add append-only array facts needed by that loop: `sameLength(result, items)`, `monotone(rows.map(row => row.top))`, `contiguousY(rows, gap)`, and `lastBottom(rows)`.
- Add geometry atoms after the loop facts exist: `rectInside(child, parent)`, `rectEquals(a, b)`, `nonOverlapX(rects)`, and `nonOverlapY(rects)`.
- Improve geometry messages once atoms exist. A failed `rectInside` should name the overflowing edge.
- Add module/import summaries. Same-file inlining is enough for now, but real helpers need summaries across files, and the report should say when a summary was trusted.
- Add Pretext-facing text facts: line width fits, fragments are ordered, fragments cover a text range, and selection rects come from the paint fragments.
- Add the `life-calendar` hard numeric examples as small patterns: positive-domain `Math.sqrt`, `Math.ceil`, integer facts after `ceil`, `**`, and half-open grid hit testing.
- Add column/row width reasoning later: table columns, grids, flex-like width negotiation, and cells that cover multiple columns.
- Keep adding one positive pattern and one negative checker case for each new proof shape.

## Current Limitations

- Call `given` lines can only be proved inside one file.
- `given` supports constant-bounded intervals and simple linear comparisons, e.g. `value: number[0, 10]` and `container >= containee`.
- Linear reduction is intentionally tiny and bounded. It is not a general linear solver.
- Calls must be direct named calls. No method calls except the hardcoded `Math.*` subset.
- Parameters must be simple names. No destructuring, rest params, or defaults.
- The checker only handles the small pure subset it can inline. No side effects, mutation reasoning, loops, or callbacks.
- Top-level `given` lines are still assumptions unless a same-file caller proves them.
- Math choice facts are local and bounded. They prove immediate `Math.min` / `Math.max` / clamp relations, not full branch correlation across arbitrary fields.
- The array domain only tracks `.length`, literal elements, spread append length, and numeric index bounds. No `rows[].height` or mutation facts yet.
- Wide intervals can still fail or become `unknown` even when a richer relation would prove the fact.
- No module/import graph tracking.
- No overloads, generics, TS type narrowing, or type-system integration.
- No object precondition domains yet, so no `rows[].height`.
- Branch-local proof is limited to the current simple ternary/comparison path analysis.
