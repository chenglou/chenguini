# Layout Verifier

This is a static-only layout refinement checker.

It reads ordinary TS source, parses strict `@layout` comments, lowers the small pure arithmetic subset it understands, and reports `pass`, `fail`, or `unknown`. It does not start browsers, run app code, take screenshots, sample scenarios, or keep example-case files.

Runtime behavior is unchanged. The annotations are erased like TS types.

## Shape

```ts
/** @layout
 * given width: int[320, 1600]
 * result.cols: int[1, 7]
 * result.boxMaxSizeX >= 0
 */
function colsBoxMaxSizeXF(width: number) {
  // ordinary TS
}
```

The comment is not prose. It is a tiny parsed language. Unknown names, unsupported operators, and unsupported lines are errors.

`given` lines are input facts. Bare lines are facts the checker has to prove.

When a verified same-file helper calls another helper with `@layout` facts, the caller has to prove the callee's `given` lines. The checker can reduce small sums of known non-negative linear facts, e.g. padding slack. Top-level `given` lines are still assumptions unless some same-file caller proves them.

For the current runnable pattern surface, see [patterns.ts](./patterns.ts). For intentionally bad facts, see [negative-patterns.ts](./negative-patterns.ts) and its stable expected messages.

## Run

```sh
bun run verify:layout
```

The checker exits non-zero if a positive check fails or remains unknown, or if the expected negative messages change.
