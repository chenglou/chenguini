# Layout Verifier

This folder is the extraction boundary for the static layout verifier work.

The current shape is:

- read ordinary TS source from a demo helper
- lower the useful subset once into a smaller internal form
- run a few law checks over that lowered program
- emit a small JSON report

This is not a general TS linter. It is a narrow static checker for layout math and nearby text geometry.

For the broader doctrine, read:

- `../docs/drafts/verification.md`
- `../docs/drafts/layout-geometry.md`

## What Lives Here

- `ir.ts`: the lowered IR types and TS-to-IR lowering pass
- `values.ts`: the value domain — concrete, symbolic, and range types with their arithmetic, comparisons, narrowing, and symbolic algebra
- `core.ts`: the `LoweredProgramAnalyzer`, CFG execution, expression evaluation, typed fact checks, law reporting, helper summaries, and candidate-law mining
- `discrete.ts`: helpers for discrete-mode proofs such as discovered width bands
- `contracts.ts`: the analyzer-side contract DSL, contract sketch helpers, and contract auto-loader
- `contracts.md`: when contracts are needed and what the current DSL can say
- `mutation-coverage.ts`: automatic mutation coverage analysis and invariant mining
- `verifier.test.ts`: core regression tests and intentional bug canaries
- `mutation-coverage.test.ts`: photo-gallery mutation coverage and invariant mining
- `photo-gallery/`: the photo-gallery verifier and its contract sidecar
- `nicer-hacker-news/`: the HN thread/comment verifiers and their contract sidecar
- `life-calendar/`: the life-calendar grid sizing and hit test verifier
- `draggable-cards/`: the draggable-cards swap-layout verifier
- `gesture-flick-snap-target/`: the flick-target geometry verifier
- `scroll-anchor/`: the scroll-anchor layout verifier

The demo source being analyzed still lives in:

- `demos/photo-gallery/`
- `demos/nicer-hacker-news/`
- `demos/life-calendar/`
- `demos/draggable-cards/`
- `demos/gesture-flick-snap-target/`
- `demos/scroll-anchor/`

Tiny shim files stay in those demo folders so source-relative contract autodiscovery still works and old paths do not break.

## How A Suite Works

Each suite does four things:

1. Choose one source file to analyze, e.g. `demos/photo-gallery/layout-model.ts`.
2. Create one `LoweredProgramAnalyzer` for that source plus any known globals or contract overrides.
3. Check a named set of laws.
4. Return a `StaticLayoutVerificationReport`.

Example:

```ts
const analyzer = new LoweredProgramAnalyzer(sourceText, {
  prompt2DLineHeight,
  prompt2DMaxLines,
}, autoContractOverrides)
const laws = new Map()

verifyMakeItemLayoutGeometry(analyzer, laws)
verifyGetGridLayoutRange(analyzer, rangeGridLayoutSources, laws)

return buildStaticLayoutReport(
  'photo-gallery-static-layout',
  'demos/photo-gallery/layout-model.ts',
  laws,
)
```

If several laws share the same globals, contracts, and source, keep one analyzer and reuse it. Build little source bundles for the proof mode, not a new verifier architecture per law.

The verifier can look at the same code with different proof modes:

- `symbolic`: exact equalities for small helpers
- `range`: interval facts over bounded inputs
- `concrete-fixture`: a few hand-picked exact scenarios
- `concrete-sweep`: exhaustive checks over a small real domain, e.g. widths `320..1600`

## Report Shape

Each verifier takes demo source text, plus optional sidecar contracts for opaque helpers, and returns one static layout report.

Small example:

```json
{
  "phase": "ready",
  "suite": "photo-gallery-static-layout",
  "analyzedFile": "demos/photo-gallery/layout-model.ts",
  "coverage": [
    {
      "target": "getGridLayout.items[].layoutBox.x",
      "checks": 32,
      "status": "pass",
      "laws": ["getGridLayout row items do not overlap horizontally"],
      "proofs": [{"mechanism": "concrete-rects-do-not-overlap-x", "checks": 11}]
    }
  ],
  "laws": [
    {
      "name": "getGridLayout row items do not overlap horizontally",
      "kind": "concrete-fixture",
      "checks": 11,
      "status": "pass",
      "proofs": [{"mechanism": "concrete-rects-do-not-overlap-x", "checks": 11}],
      "targets": [{"target": "getGridLayout.items[].layoutBox.x", "checks": 11}]
    }
  ]
}
```

Read it this way:

- `phase` is `ready` only when every law passes.
- `laws` say which behavior was checked.
- `proofs` say what proved it, e.g. a symbolic equality, range fact, concrete rect fact, or manual check.
- `targets` say which returned fields a law covers.
- `coverage` flips that view around, so each returned field says which laws cover it.
- `functionSummaries` list helper contracts the verifier trusted, and in which domains.
- `candidateLaws` list relationships a concrete sweep noticed but did not prove.

If a law fails, `phase` becomes `error` and the law includes a `firstFailure` or `firstUnknown` witness. The witness should name the geometry address, e.g. `itemIndex`, `row`, `column`, `actualCenterX`, `expectedCenterX`.

Keep those last two buckets separate from `laws`. A trusted helper summary or a mined hint can explain the report, but neither one should quietly move the verdict.

Useful commands:

- `bun test layout-verifier/verifier.test.ts`
- `bun test layout-verifier/mutation-coverage.test.ts`
- `bun layout-verifier/photo-gallery/verify-static-layout.ts`
- `bun layout-verifier/nicer-hacker-news/verify-static-layout.ts`
- `bun layout-verifier/nicer-hacker-news/verify-comment-static-layout.ts`
- `bun layout-verifier/life-calendar/verify-static-layout.ts`
- `bun layout-verifier/draggable-cards/verify-static-layout.ts`
- `bun layout-verifier/gesture-flick-snap-target/verify-static-layout.ts`
- `bun layout-verifier/scroll-anchor/verify-static-layout.ts`

## When To Use Contracts

Most layout arithmetic should not need contracts. The analyzer should just read the source.

Contracts are only for boundaries that are genuinely opaque to the current subset, e.g. text helpers or callback helpers. See `contracts.md`.

The loader currently discovers sibling `*.static-contracts.ts` files for:

- the analyzed source file itself
- its relative imports

That is enough for the current demos and keeps the analyzer generic instead of hard-coding helper names.

## Adding A New Suite

The smallest good path is:

1. Pick one source file that already owns real geometry.
2. Start with one or two laws that are obviously worth keeping.
3. Use the cheapest trustworthy oracle first.
   For example, a symbolic equality for a helper, a range law for a width formula, or a tiny concrete fixture for a text-edge case.
4. Add one red canary in `verifier.test.ts` by intentionally breaking that law.
5. Only then widen coverage.

The current pattern is:

- put the suite in a subfolder here
- keep the analyzed demo source in `demos/`
- add a tiny `verify-*.ts` runner that prints the JSON report
- if the suite needs opaque helpers, ship a sibling `*.static-contracts.ts`

Good first laws:

- `contentHeight` comes from the last row bottom
- row tops stay contiguous
- a card stays centered in its slot
- clicking empty space routes to the nearest text edge

Bad first laws:

- anything that still depends on DOM selection APIs
- anything that needs a brand new domain before one existing leaf helper could be proved first

## Current Limits

This prototype is good at:

- first-order pure helpers over numbers, arrays, and records
- append-only arrays such as `rowsTop`
- local mutation inside one layout pass
- small callback patterns we explicitly model

It is not good at:

- browser behavior
- async, exceptions, or wide shared mutable state
- dynamic property names and prototype tricks
- opaque helpers with no source support and no contract
