# Layout verifier todo

Current prototype:
- symbolic evaluation for straight-line layout code
- bounded concrete sweeps for small real input ranges, e.g. viewport widths `320..1600`
- abstract interpretation with intervals
- symbolic execution with path splitting
- affine / linear expression simplification
- refinement-style contracts for opaque boundaries, e.g. Pretext outputs
- discovered integer seam bands for responsive helpers
- proof reports with target coverage, trusted helper summaries, unknowns, and candidate laws
- review-only contract sketches from concrete samples
- automatic mutation coverage analysis (80/223 runnable mutations caught on photo-gallery)
- invariant mining from range analysis

Try next (informed by mutation coverage blind spots):
- laws for global constant sensitivity, e.g. gap changes must still produce non-negative item widths
- laws for `clamp` boundary behavior so comparison mutations get caught
- laws for aspect-ratio scaling factors (the `0.85` / `1.05` geometry)
- 1D/line layout verification surface (currently unverified: `get1DItemSize`, `getLineLayout` positioning)
- richer range contracts in the sidecar DSL, but only if a real opaque helper needs them
- promote or reject mined candidate laws after reading them; do not auto-install them
- make contract sketches easier to compare against existing sidecars
- better quotient / remainder reasoning for grid placement
- more sequence facts for append-only arrays, e.g. prefix-sum-ish growth and "one output per input"
- better counterexamples, e.g. `row 2 item 7 overflowed by 12`
- cleaner library-side contract discovery once extraction pressure is real

Maybe later:
- Hoare-style pre/postconditions at function boundaries
- SMT solving for linear arithmetic constraints
- richer numeric domains if needed, e.g. octagons or polyhedra

Low priority for layout math:
- separation logic
Why:
- probably more useful for heap ownership and aliasing than rectangle arithmetic
