# Layout Verifier

This folder is the extraction boundary for the static layout verifier work.

It contains:

- `ir.ts`: the lowered IR types and TS-to-IR lowering pass
- `values.ts`: the value domain — concrete, symbolic, and range types with their arithmetic, comparisons, narrowing, and symbolic algebra
- `core.ts`: the `LoweredProgramAnalyzer`, CFG execution, expression evaluation, and law reporting
- `discrete.ts`: tiny helpers for discovering integer seam bands and shrinking failing intervals
- `contracts.ts`: the analyzer-side contract DSL and contract auto-loader
- `contracts.md`: how to write and review static contract sidecars
- `verifier.test.js`: mutation canaries and core regression tests
- `mutation-coverage.ts`: automatic mutation coverage analysis and invariant mining
- `mutation-coverage.test.js`: mutation coverage tests for photo-gallery
- `todo.md`: theories and precision ideas worth trying next
- `research.md`: what worked, what didn't, and where the real leverage came from
- `photo-gallery/`: the photo-gallery verifier and its contract sidecar
- `nicer-hacker-news/`: the HN thread/comment verifiers and their contract sidecar
- `life-calendar/`: the life-calendar grid sizing and hit test verifier

The demo source being analyzed still lives in:

- `demos/photo-gallery/`
- `demos/nicer-hacker-news/`
- `demos/life-calendar/`

Tiny shim files stay in those demo folders so source-relative contract autodiscovery still works and old paths do not break.

Reports are intentionally more than pass/fail lists. A law can carry proof mechanisms, target coverage, trusted function summaries, candidate laws, and unknown proof results. Use those as an audit surface: proved facts go in laws, trusted opaque helpers go in function summaries, and mined/sketched ideas stay candidates until promoted by hand.
