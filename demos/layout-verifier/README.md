# Layout Verifier

This folder is the extraction boundary for the static layout verifier work.

It contains:

- `core.ts`: the lowered IR, symbolic/range/concrete evaluators, and law reporting
- `contracts.ts`: the analyzer-side contract DSL and contract auto-loader
- `verifier.test.js`: mutation canaries and core regression tests
- `photo-gallery/`: the photo-gallery verifier and its contract sidecar
- `nicer-hacker-news/`: the HN thread/comment verifiers and their contract sidecar

The demo source being analyzed still lives in:

- `demos/photo-gallery/`
- `demos/nicer-hacker-news/`

Tiny shim files stay in those demo folders so source-relative contract autodiscovery still works and old paths do not break.
