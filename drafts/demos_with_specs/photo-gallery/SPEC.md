# Photo Gallery Spec

Use `docs/`, `/Users/chenglou/github/vibescript/drafts/demos_with_specs/photo-gallery/DATA.md`, and this packet only. Do not inspect `demos/` or other specs.

Read first:

1. `docs/verification.md`
2. `docs/ai-automating-browsers.md`
3. `/Users/chenglou/github/vibescript/drafts/demos_with_specs/photo-gallery/DATA.md`
4. this file

Write tests first, then implementation, then validate.

Build only inside the target folder the main thread gives you.

## Summary

Build a photo gallery with:

- a responsive scrollable grid
- a focused horizontal line mode
- focused image id in `window.location.hash`
- dark navy gallery styling with rounded dark cards and a fixed GitHub-style link

## Exact Numbers

- side padding `32px`
- grid gap `24px`
- top padding `40px`
- max columns `7`
- min target card width about `220px`
- left and right line-mode strips `100px`
- line neighbor scale `0.7`
- line gap `52px`
- line bottom gap `28px`
- grid caption visible height `44px` plus bottom `8px`
- line caption visible height `64px` plus bottom `8px`
- landscape max image height `boxMaxSizeX`
- square max image height `boxMaxSizeX * 0.85`
- portrait max image height `boxMaxSizeX * 1.05`
- dismiss restore should leave about `40px` above the focused row

## Fragile Truths

- clicking image area enters line mode, but clicking a caption selects the full caption text and stays in grid mode
- left strip focuses previous, right strip focuses next, middle dismisses
- line-mode hit areas are based on layout, not current animated image edges
- dismissing line mode should scroll the focused row back into view if needed
- grid mode should mount only visible or near-visible cards
- pure resize should avoid fake motion for items that stay in the same slot
- line mode should lock underlying scroll

## Picture

```txt
|<------100------>|<--------- main line ---------->|<------100------>|
 left nav strip        focused item in middle          right nav strip
```

## Tests Must Prove

- responsive grid layout math
- line-mode hit-area routing
- browser-backed navigation flow updates the hash and lands on the right focused item
- browser-backed caption selection selects the full text and stays in grid mode
- browser-backed dismiss restore brings the focused row back with roughly `40px` above it
- browser-backed occlusion mounts fewer cards than the full photo count

If a browser check passes without proving those outcomes, it is too weak.
