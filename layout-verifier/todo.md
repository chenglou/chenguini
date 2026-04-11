# Layout verifier todo

Current prototype:
- symbolic evaluation for straight-line layout code
- bounded concrete sweeps for small real input ranges, e.g. viewport widths `320..1600`
- abstract interpretation with intervals
- symbolic execution with path splitting
- affine / linear expression simplification
- refinement-style contracts for opaque boundaries, e.g. Pretext outputs

Try next:
- richer range contracts in the sidecar DSL, but only if a real opaque helper needs them
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
