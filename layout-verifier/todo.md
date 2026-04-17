# Layout Verifier Todo

- Keep the checker static-only: no browser runs, runtime traces, sampled sweeps, or committed fixture evidence.
- Prefer reducers, interval facts, and source inference before adding a new atom.
- Keep [patterns.ts](./patterns.ts) as the runnable catalog. Add one positive pattern and one negative expected message for each new proof shape.
- Keep reports honest about assumptions. Top-level `given` lines are trusted; same-file helper `given` lines are proved at call sites.
- Add helper summaries only for opaque boundaries, and report when a summary was trusted.

## Next Work

- Extend wildcard comparisons to two collection sides only when zip/cross-product semantics are explicit.
- Support nested wildcard paths in comparisons, e.g. `params.rows[].height >= params.minRowHeight`.
- Extend append-only array inference beyond the first running-sum loop: `push`, conditional push, append length, and facts that survive simple branches.
- Add a total extent helper for empty sequences, likely `extentEnd(rows, empty)`. Today `lastEnd(rows)` needs a non-empty input length.
- Decide the smallest geometry surface. First try plain field comparisons like `child.x >= parent.x` and `child.x + child.w <= parent.x + parent.w`; add `rectInside(child, parent)` only if the repeated shape deserves a name.
- If geometry atoms land, support field naming without forcing one app shape too hard. `x/y/w/h` vs `x/y/width/height` should be a deliberate choice, not an accident.
- Improve geometry messages once geometry exists. A failed inside check should name the edge, e.g. `child.x + child.w <= parent.x + parent.w`.
- Add module/import summaries. Same-file inlining is enough for now, but real helper libraries need summaries across files.
- Make top-level and loop-local assumptions loud in machine output. A contextless caller should see which `given` facts were trusted, not proved.
- Add Pretext-facing text facts: line width fits offered width, fragments are ordered, fragments cover a text range, line ranges cover rendered text, and selection rects reuse paint fragments.
- Add column/row width reasoning only after array/object domains exist: table columns, grids, flex-like width negotiation, and cells spanning multiple columns.
- Keep failure messages improving as the proof surface grows. Missing facts should point at the smallest useful assumption, e.g. `padding >= 0`.
- Keep the README and verification docs synced with the runnable pattern surface. No feature should exist only in folklore.

## Made Less Urgent

- New numeric atoms are less urgent. `ceil(total / count) * count >= total`, floor hit-testing, modulo bounds, positive scale/divide order, and local `Math.min` / `Math.max` branch facts now cover a lot of ordinary layout math.
- Life-calendar numeric work is less scary. Positive `Math.sqrt`, non-negative square, ceil coverage, and half-open grid hit testing are now reducer/pattern work, not a new primitive family.
- Clamp-specific atoms are less needed. A userland clamp helper can be checked through same-file calls plus `Math.min` / `Math.max` facts.
- `sameLength` as a primitive is less needed for now. We can often prove `result.rows.length == items.length` directly from append/running-sum inference.
- Small geometry facts may not need atoms. Many inside/center cases can start as ordinary comparisons with relational `given`s.
- Exhaustive integer sweeps should stay out. The new reducers make static proofs tractable enough that sweeps would mostly add unit-test-shaped complexity.

## Current Limitations

- Call `given` lines can only be proved inside one file.
- `given` supports constant-bounded intervals and simple linear comparisons, e.g. `value: number[0, 10]` and `container >= containee`.
- Linear reduction is intentionally tiny and bounded. It is not a general linear solver.
- Calls must be direct named calls. No method calls except the hardcoded `Math.*` subset.
- Parameters must be simple names. No destructuring, rest params, or defaults.
- The checker only handles the small pure subset it can inline. Side effects are still out, except the recognized append-only running-sum loop.
- Top-level `given` lines are still assumptions unless a same-file caller proves them.
- `@layout-loop` is only attached to supported `for...of` loops.
- Loop specs can name locals after the loop, but they do not have `result`.
- Loop-local `given` facts are trusted from that point forward. They are not proved against the earlier function state yet.
- Math choice facts are local and bounded. They prove immediate `Math.min` / `Math.max` / clamp relations, not full branch correlation across arbitrary fields.
- Integer helper facts are narrow known shapes, e.g. `ceil(total / count) * count >= total`, `floor(pointer / cellSize) < count`, and `index % count < count`, not a general nonlinear arithmetic solver.
- Positive scale/divide facts only preserve order through matching expressions with a known non-negative or positive factor. They are not polynomial reasoning.
- Branch facts only flow through ternaries and return-style `if` guards.
- The array domain only tracks `.length`, literal elements, spread append length, running-sum sequence facts, and numeric index bounds.
- Per-item domains support simple field/range facts like `items[].height: number[0, 40]` and one wildcard collection compared with a scalar expression.
- Wildcard comparisons do not support two collection sides or nested wildcard paths yet.
- Running-sum `lastEnd` currently needs a non-empty input length; use a future `extentEnd(rows, empty)` for maybe-empty rows.
- Wide intervals can still fail or become `unknown` even when a richer relation would prove the fact.
- No module/import graph tracking.
- No overloads, generics, TS type narrowing, or type-system integration.
