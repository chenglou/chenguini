# Layout Verifier Research

The old verifier mixed useful static ideas with too many test-shaped mechanisms.

Things we are not carrying into the active checker:

- per-demo proof files
- fixture laws
- sampled sweeps
- mutation coverage as a verifier signal
- browser-backed report paths
- candidate-law mining in the committed report

Some old facts are still worth recovering as static atoms later:

- row contiguity
- non-overlap
- content height from last bottom
- text fragment offset coverage
- track-vector constraints
- scroll-anchor stability as a userland relation

Recover them through the `@layout` DSL, not through the old harness shapes.
