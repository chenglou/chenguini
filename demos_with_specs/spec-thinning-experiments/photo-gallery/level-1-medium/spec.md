# Photo Gallery Level 1: Medium

Use `docs/` plus this packet only. Do not inspect `demos/` or other specs.

Read first:

1. `docs/verification.md`
2. `docs/ai-automating-browsers.md`
3. `/Users/chenglou/github/vibescript/demos_with_specs/spec-thinning-experiments/photo-gallery/shared-data.md`
4. this file

Write tests first, then implementation, then validate.

Build only inside:

- `/Users/chenglou/github/vibescript/demos_with_specs/photo-gallery/thin-level-1-medium`

## Summary

Build a photo gallery with:

- responsive grid mode
- focused horizontal line mode
- hash-routed focused image state
- dismiss back to grid
- real occlusion

## Key Scenarios

- image-area click opens line mode
- caption click selects the full caption text and stays in grid mode
- left and right `100px` strips navigate in line mode
- middle dismisses
- dismiss restores the focused row with about `40px` above it
- loading with a hash reopens the focused image
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

## Required Checks

- pure grid layout math
- pure line click routing
- browser-backed hash sync
- browser-backed dismiss restore
- browser-backed caption selection
- browser-backed occlusion
