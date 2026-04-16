# Layout Verifier Todo

- Keep the active checker static-only: no browser runs, runtime traces, sampled sweeps, or committed fixture evidence.
- Work through [patterns.ts](./patterns.ts) without restating its list here.
- Add helper summaries only for opaque boundaries, and report which summary was trusted.
- Keep improving messages as new atoms land. Geometry facts should show the relevant edges, overflow amount, or crossing boxes.
- Use temporary mutation/red probes to decide which atoms to add next; keep them out of the committed guarantee report.

## Next Work

- Extend the running-sum loop past scalar row heights. It now proves append length, `monotone(result.rows.top)`, `contiguousY(result.rows, gap)`, and `lastBottom(result.rows)`.
- Add append-only array facts needed by richer loops: per-item height domains such as `items[].height`, conditional rows, and empty-list `lastBottom` handling.
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
- The checker only handles the small pure subset it can inline. Side effects are still out, except the recognized append-only running-sum loop.
- Top-level `given` lines are still assumptions unless a same-file caller proves them.
- Math choice facts are local and bounded. They prove immediate `Math.min` / `Math.max` / clamp relations, not full branch correlation across arbitrary fields.
- Integer helper facts are narrow known shapes, e.g. `ceil(total / count) * count >= total`, `floor(pointer / cellSize) < count`, and `index % count < count`, not a general nonlinear arithmetic solver.
- Positive scale/divide facts only preserve order through matching expressions with a known non-negative or positive factor. They are not polynomial reasoning.
- Branch facts only flow through ternaries and return-style `if` guards.
- The array domain only tracks `.length`, literal elements, spread append length, running-sum sequence facts, and numeric index bounds. No `items[].height` or mutation facts yet.
- Wide intervals can still fail or become `unknown` even when a richer relation would prove the fact.
- No module/import graph tracking.
- No overloads, generics, TS type narrowing, or type-system integration.
- No object precondition domains yet, so no `rows[].height`.
- Running-sum `lastBottom` currently needs a non-empty input length.
- Running-sum loops do not yet read per-item domains such as `items[].height`.
