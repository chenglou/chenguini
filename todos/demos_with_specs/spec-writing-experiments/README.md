# Spec Writing Experiments

This folder compares a few ways of writing the same demo spec.

The goal is simple:

- keep `docs/` fixed
- keep the demo target fixed
- change only the spec writing style
- use fresh agents every time
- compare which style reconstructs the demo most reliably

Current styles:

- `spatial-ascii`: describe the layout as a picture first, then pin the numbers
- `scenario-first`: describe the demo as a small set of user flows and invariants
- `state-and-derivations`: describe the model, derived helpers, and transitions directly

The baseline control is the normal spec in:

- `todos/demos_with_specs/photo-gallery/SPEC.md`
- `todos/demos_with_specs/draggable-cards/SPEC.md`

We are not trying to find the prettiest spec. We are trying to find the one a fresh subagent can turn into tests and code with the fewest misses.
