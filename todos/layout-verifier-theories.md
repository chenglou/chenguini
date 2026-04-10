# Layout verifier theories to try

Current prototype:
- symbolic evaluation for straight-line layout code
- bounded concrete sweeps for small real input ranges, e.g. viewport widths `320..1600`

Try next:
- abstract interpretation with intervals
- symbolic execution with path splitting
- affine / linear expression simplification
- SMT solving for linear arithmetic constraints
- Hoare-style pre/postconditions at function boundaries
- refinement-style contracts for opaque boundaries, e.g. Pretext outputs
- richer numeric domains if needed, e.g. octagons or polyhedra

Low priority for layout math:
- separation logic
Why:
- probably more useful for heap ownership and aliasing than rectangle arithmetic
