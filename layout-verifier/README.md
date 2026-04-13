# Layout Verifier

This is a static-only layout refinement checker.

It reads ordinary TS source, parses strict `@layout` comments, lowers the small pure arithmetic subset it understands, and reports `pass`, `fail`, or `unknown`. It does not start browsers, run app code, take screenshots, sample scenarios, or keep example-case files.

Runtime behavior is unchanged. The annotations are erased like TS types.

## Shape

```ts
/** @layout
 * requires width: int[320, 1600]
 * ensures result.cols: int[1, 7]
 * ensures result.boxMaxSizeX >= 0
 */
function colsBoxMaxSizeXF(width: number) {
  // ordinary TS
}
```

The comment is not prose. It is a tiny parsed language. Unknown names, unsupported operators, and unsupported lines are errors.

## Current Subset

This first pass intentionally starts narrow:

- `requires name: int[min, max]`
- `requires name: number[min, max]`
- `ensures expression: int[min, max]`
- `ensures expression: number[min, max]`
- `ensures left == right`
- `ensures left >= right`
- `ensures left <= right`

The expression evaluator supports numeric literals, identifiers, object returns, property access, local `const`/`let`, arithmetic, `?:`, pure calls in the same file, and a small `Math` subset.

Unsupported proof paths become `unknown`. We do not fall back to concrete examples or sampled inputs.

## Run

```sh
bun layout-verifier/verify.ts demos/photo-gallery/layout-model.ts demos/draggable-cards/swap-layout.ts
```

The checker exits non-zero if any obligation fails or remains unknown.
