# Layout Verifier

This folder is the extraction boundary for the static layout verifier work.

It contains:

- `core.ts`: the lowered IR, symbolic/range/concrete evaluators, and law reporting
- `contracts.ts`: the analyzer-side contract DSL and contract auto-loader
- `verifier.test.js`: mutation canaries and core regression tests
- `todo.md`: theories and precision ideas worth trying next
- `research.md`: what worked, what didn't, and where the real leverage came from
- `photo-gallery/`: the photo-gallery verifier and its contract sidecar
- `nicer-hacker-news/`: the HN thread/comment verifiers and their contract sidecar
- `layout-kernels/`: extracted pure kernels for generated lists, page-break bundles, and table-span negotiation

The demo source being analyzed still lives in:

- `demos/photo-gallery/`
- `demos/nicer-hacker-news/`
- `demos/layout-kernels/`

Tiny shim files stay in the larger demo folders so source-relative contract autodiscovery still works and old paths do not break.
The extracted kernels live directly under `demos/layout-kernels/` because they are already reduced to pure source files with no app wrapper around them.
