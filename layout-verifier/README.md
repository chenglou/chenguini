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

When a verified same-file helper calls another helper with `@layout` requirements, the caller has to prove the callee's input ranges and simple linear relations. Entry-point `requires` clauses are still assumptions unless some caller discharges them.

For the current runnable pattern surface, see [patterns.ts](./patterns.ts). For intentionally bad facts, see [negative-patterns.ts](./negative-patterns.ts) and its normalized expected output.

## Run

```sh
bun run verify:layout
```

The checker exits non-zero if a positive obligation fails or remains unknown, or if the negative diagnostics drift.
