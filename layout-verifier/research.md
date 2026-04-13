# Layout Verifier Research

Future-useful notes from the old verifier work.

## Worked

- Keep app code natural. A checker that understands locals, loops, arrays, object literals, `?.`, `??`, and `Math.min` / `Math.max` / `Math.floor` / `Math.ceil` buys more than proof-shaped runtime helpers.
- Start with tiny abstract domains. Intervals, path-sensitive narrowing, append-only sequence facts, and exact string facts carried farther than heavier numeric theories would have early.
- Split ranges by layout seams. Column bands, line-left / line-interior / line-right regions, and branch-local facts were much clearer than one giant interval.
- Preserve symbolic shadows when possible. Keeping an expression around after a clear `Math.min` / `Math.max` winner helped prove center-line and aspect-ratio facts without a heavier solver.
- Name geometry facts. `rectInside`, overlap, row contiguity, and similar atoms produce better diagnostics when failures can include edges, overflow, or the two boxes that crossed.
- Read source by default. Use summaries only for genuinely opaque helper boundaries, and make the report say which helper was trusted.
- Use mutation/red probes as research signals. They are good for finding holes in the proof surface, but they should not become verifier guarantees.
- `life-calendar` was a useful numeric stressor: `**`, `Math.sqrt`, `Math.ceil`, integer facts after `ceil(life / countX)`, and half-open grid hit testing.

## Did Not Earn Itself

- Treating browser behavior as statically proved.
- Hard-coding app helper names into the analyzer.
- Rewriting app code into checker-shaped helpers like `add(...)` / `sub(...)`.
- Giant unsplit intervals.
- Pulling in every demo at once before a second shape was actually understood.
- SMT, octagons, or polyhedra up front. Let a real layout law earn them.

