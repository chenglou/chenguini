# Photo Gallery Overlay: Two Pass Packet, Pass A

Use `docs/` plus this packet only. Do not inspect `demos/` or other specs.

Read first:

1. `docs/drafts/verification.md`
2. `docs/drafts/automating-browsers.md`
3. `todos/demos_with_specs/spec-overlay-experiments/photo-gallery/shared-data.md`
4. this file

Process:

1. Read Pass A.
2. Write the tests from Pass A first.
3. Only after the tests exist, read Pass B.
4. Then implement and validate.

Build only inside:

- `todos/demos_with_specs/photo-gallery/overlay-two-pass`

## Summary

Build a responsive photo gallery with:

- scrollable grid mode
- focused horizontal line mode
- hash-routed focused image state
- scroll restore on dismiss
- real occlusion

## Scenarios

### Scenario 1: First Load

Expect:

- dark navy page
- rounded dark cards
- side padding `32px`
- gap `24px`
- top padding `40px`
- max `7` columns
- target minimum card width about `220px`

### Scenario 2: Grid Clicks

Expect:

- image-area click opens line mode
- caption click selects the full caption text and stays in grid mode

### Scenario 3: Line Mode

Expect:

- focused image large and centered
- neighbors remain on one horizontal line
- left and right `100px` strips navigate
- middle dismisses
- scroll underneath is locked

### Scenario 4: Dismiss

Expect:

- hash clears
- focused row is restored into view if needed
- restored row lands with about `40px` above it

### Scenario 5: Occlusion

Expect:

- mounted count lower than full photo count on a representative grid state

## Exact Metrics

- grid side padding `32px`
- grid gap `24px`
- grid top padding `40px`
- max columns `7`
- line neighbor scale `0.7`
- line card gap `52px`
- line bottom gap `28px`
- line top floor `40px`
- left strip `100px`
- right strip `100px`
- grid caption `44px` visible + `8px` bottom padding
- line caption `64px` visible + `8px` bottom padding

Grid image caps:

- landscape `boxMaxSizeX`
- square `boxMaxSizeX * 0.85`
- portrait `boxMaxSizeX * 1.05`

## Tests Must Prove

- pure grid layout math
- pure line click routing
- browser-backed navigation/hash sync
- browser-backed dismiss-to-row restore
- browser-backed full caption selection in grid mode
- browser-backed occlusion
