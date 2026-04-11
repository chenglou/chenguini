# Layout Kernel Demos

These files are reduced layout kernels extracted from `pretex-editor`.
They are still general layout categories rather than TeX-editor-specific parser code:

- `generated-list-geometry.ts`: flat generated-list / TOC-style row geometry with level-specific indent ladders, wrapped lines, and terminal-line metadata
- `page-break-bundles.ts`: page-budget flow with keep-with-next rules and promotable top-float bundles
- `table-span-columns.ts`: column-width negotiation where single-column and spanning constraints both tighten the same width vector

The paired verifier modules live under `layout-verifier/layout-kernels/`.
