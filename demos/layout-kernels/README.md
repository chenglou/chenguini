# Layout Kernels

These are small pure layout kernels. They are not mini apps. They are meant to be easy to read alone, with enough real geometry to keep the verifier honest.

- `generated-list-geometry.ts`: generated lists with level-specific indent ladders, wrapped rows, terminal-line leaders, and page-number metadata slots
- `page-break-bundles.ts`: paginated block flow with keep-with-next pairs, page budgets, and heading-plus-top-float bundles that promote only once the current page has too little remaining height
- `table-column-negotiation.ts`: table column negotiation where single-column and spanning constraints tighten the same width vector, then total width is derived from that vector plus gaps

The paired verifier modules live under `layout-verifier/layout-kernels/`.
