# Layout Verifier Todo

- Keep the active checker static-only: no browser runs, runtime traces, sampled sweeps, or committed fixture evidence.
- Grow loop facts for ordinary layout code: append-only arrays, running `y`, `sameLength`, `contiguousY`, `monotone`, and `lastBottom`.
- Add first-class geometry atoms: `rectInside`, `rectEquals`, `nonOverlapX`, `nonOverlapY`, and half-open hit rects.
- Exercise the numeric subset against `life-calendar` grid sizing: `**`, `Math.sqrt`, `Math.ceil`, positive-domain facts, and integer facts after `ceil`.
- Add track/vector reasoning for tables, grids, and flex-like negotiation, including spanning constraints.
- Add Pretext-backed text facts: line widths fit, fragments are ordered, fragments cover text ranges, and selection rects reuse paint fragments.
- Model scroll-anchor stability as a userland geometry relation, not a browser trace.
- Add helper summaries only for opaque boundaries, and report which summary was trusted.
- Improve diagnostics so failed geometry facts show the relevant edges, overflow amount, or crossing boxes.
- Use temporary mutation/red probes to decide which atoms to add next; keep them out of the committed guarantee report.

