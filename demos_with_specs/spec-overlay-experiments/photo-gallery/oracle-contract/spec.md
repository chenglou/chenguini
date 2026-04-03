# Photo Gallery Overlay: Oracle Contract

Use `docs/` plus this packet only. Do not inspect `demos/` or other specs.

Read first:

1. `docs/verification.md`
2. `docs/ai-automating-browsers.md`
3. `/Users/chenglou/github/vibescript/demos_with_specs/spec-overlay-experiments/photo-gallery/shared-data.md`
4. this file
5. `oracle-contract.md`

Write tests first, then implementation, then validate.

Build only inside:

- `/Users/chenglou/github/vibescript/demos_with_specs/photo-gallery/overlay-oracle-contract`

## Summary

Build a photo gallery with:

- a responsive scrollable grid
- a focused horizontal line mode
- hash-routed focused image state
- dismiss back to grid with scroll restore
- real grid occlusion

## Scenarios

### Scenario 1: First Load

Expect:

- grid mode
- dark navy background
- rounded dark cards with image above caption
- side padding `32px`
- gap `24px`
- first-row top padding `40px`
- max `7` columns
- target minimum card width about `220px`

### Scenario 2: Grid Click Routing

Expect:

- clicking image area enters line mode
- clicking caption selects the full caption text and stays in grid mode

### Scenario 3: Line Mode

Expect:

- focused image large and centered
- non-focused scale `0.7`
- left strip `100px` means previous
- right strip `100px` means next
- middle dismisses
- scrolling underneath is locked

### Scenario 4: Dismiss Back To Grid

Expect:

- hash clears
- focused row is brought back into view if needed
- restored row lands with about `40px` above it

### Scenario 5: Occlusion

Expect:

- only visible and near-visible cards are mounted
- mounted count is below total photo count on a representative grid state

## Exact Metrics

- grid side padding `32px`
- grid gap `24px`
- grid top padding `40px`
- max columns `7`
- line neighbor scale `0.7`
- line card gap `52px`
- line image-to-bottom gap `28px`
- line top padding floor `40px`
- line left strip `100px`
- line right strip `100px`
- grid caption visible text `44px`
- grid caption bottom padding `8px`
- line caption visible text `64px`
- line caption bottom padding `8px`

Grid image caps:

- landscape max image height: `boxMaxSizeX`
- square max image height: `boxMaxSizeX * 0.85`
- portrait max image height: `boxMaxSizeX * 1.05`

Then:

- `sizeX = min(naturalWidth, boxMaxSizeX, imgMaxSizeY * aspectRatio)`
- `sizeY = imageHeight + captionHeight`

## Tests Must Prove

- pure grid layout math
- pure line click routing
- browser-backed navigation and hash sync
- browser-backed dismiss-to-row restore
- browser-backed full caption selection in grid mode
- browser-backed occlusion
