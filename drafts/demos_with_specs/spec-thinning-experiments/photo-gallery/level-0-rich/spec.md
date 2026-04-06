# Photo Gallery Level 0: Rich

Use `docs/` plus this packet only. Do not inspect `demos/` or other specs.

Read first:

1. `docs/verification.md`
2. `docs/ai-automating-browsers.md`
3. `/Users/chenglou/github/vibescript/drafts/demos_with_specs/spec-thinning-experiments/photo-gallery/shared-data.md`
4. this file
5. `oracle-contract.md`

Write tests first, then implementation, then validate.

Build only inside:

- `/Users/chenglou/github/vibescript/drafts/demos_with_specs/photo-gallery/thin-level-0-rich`

## Summary

Build a photo gallery with:

- a responsive scrollable grid
- a focused horizontal line mode
- hash-routed focused image state
- dismiss back to grid with scroll restore
- real grid occlusion

## Scenarios

### First Load

- dark navy page
- rounded dark cards with image above caption
- side padding `32px`
- gap `24px`
- top padding `40px`
- max `7` columns
- target minimum card width about `220px`

### Grid Click Routing

- image-area click enters line mode
- caption click selects the full caption text and stays in grid mode

### Line Mode

- focused image large and centered
- non-focused scale `0.7`
- left strip `100px` means previous
- right strip `100px` means next
- middle dismisses
- scrolling underneath is locked

### Dismiss

- hash clears
- focused row is brought back into view if needed
- restored row lands with about `40px` above it

### Occlusion

- only visible and near-visible cards are mounted
- mounted count is below total photo count on a representative grid state

## Exact Metrics

- side padding `32px`
- grid gap `24px`
- top padding `40px`
- max columns `7`
- min target card width about `220px`
- line neighbor scale `0.7`
- line card gap `52px`
- line bottom gap `28px`
- line top floor `40px`
- left strip `100px`
- right strip `100px`
- grid caption visible `44px` + bottom `8px`
- line caption visible `64px` + bottom `8px`

Grid image caps:

- landscape `boxMaxSizeX`
- square `boxMaxSizeX * 0.85`
- portrait `boxMaxSizeX * 1.05`

Then:

- `sizeX = min(naturalWidth, boxMaxSizeX, imgMaxSizeY * aspectRatio)`
- `sizeY = imageHeight + captionHeight`

## Tests Must Prove

- pure grid layout math
- pure line click routing
- browser-backed navigation/hash sync
- browser-backed dismiss-to-row restore
- browser-backed full caption selection in grid mode
- browser-backed occlusion
