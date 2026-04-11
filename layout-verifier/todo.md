# Layout verifier todo

Current surface:

- symbolic evaluation for straight-line layout helpers
- bounded concrete sweeps for small real input ranges, e.g. viewport widths `320..1600`
- range evaluation with intervals, path splitting, and path-sensitive narrowing
- affine expression simplification for the arithmetic the demos actually use
- append-only sequence facts, exact small arrays, and exact string lengths
- static contracts for opaque helper boundaries, e.g. text layout outputs
- discovered integer seam bands for responsive helpers
- proof reports with target coverage, trusted helper summaries, unknowns, and candidate laws
- review-only contract sketches from concrete samples
- photo-gallery mutation coverage and invariant mining

Try next:

- Pin one or two real constant-sensitive outputs, e.g. a known gap or centered card at a known width.
- Add `clamp` boundary laws so comparison mutations have somewhere to fail.
- Add laws for the aspect-ratio scale factors around the `0.85` / `1.05` geometry.
- Bring `get1DItemSize` and `getLineLayout` into the verified surface instead of only proving grid layout.
- Promote or reject mined candidate laws after reading them. Do not auto-install them.
- Make contract sketches easier to diff against existing sidecars.
- Improve quotient / remainder facts for grid placement, but keep the law tied to visible slots.
- Teach the sequence domain more prefix-sum-shaped facts, e.g. one row top per row and one output item per input.
- Report better counterexamples, e.g. `row 2 item 7 overflowed by 12`.
- Clean up library-side contract discovery once extraction pressure is real.

Maybe later:

- Hoare-style pre/postconditions at function boundaries
- SMT solving for linear arithmetic constraints
- richer numeric domains if needed, e.g. octagons or polyhedra

Low priority for layout math:

- separation logic

Why: probably more useful for heap ownership and aliasing than rectangle arithmetic.
