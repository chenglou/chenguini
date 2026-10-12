# Photo Gallery Level 2: Thin

Use `docs/` plus this packet only. Do not inspect `demos/` or other specs.

Read first:

1. `docs/drafts/verification.md`
2. `docs/drafts/automating-browsers.md`
3. `todos/demos_with_specs/spec-thinning-experiments/photo-gallery/shared-data.md`
4. this file

Write tests first, then implementation, then validate.

Build only inside:

- `todos/demos_with_specs/photo-gallery/thin-level-2-thin`

Build a photo gallery with:

- responsive grid
- horizontal line mode
- focused image in `window.location.hash`
- dismiss back to grid
- real occlusion

Keep these exact:

- side padding `32px`
- gap `24px`
- top padding `40px`
- max columns `7`
- min target card width about `220px`
- left strip `100px`
- right strip `100px`
- line neighbor scale `0.7`
- line gap `52px`
- line bottom gap `28px`
- grid caption visible `44px` + bottom `8px`
- line caption visible `64px` + bottom `8px`
- dismiss restore lands the focused row with about `40px` above it

Grid click truth:

- image-area click opens line mode
- caption click selects the full caption text and stays in grid mode

Line click truth:

- left strip previous
- right strip next
- middle dismiss

Grid sizing truth:

- landscape `boxMaxSizeX`
- square `boxMaxSizeX * 0.85`
- portrait `boxMaxSizeX * 1.05`

Tests must prove:

- hash sync
- caption selection
- dismiss restore
- occlusion
- layout math
- line click routing
