# Photo Gallery Overlay: Contrastive Boundary Pairs

Use `docs/` plus this packet only. Do not inspect `demos/` or other specs.

Read first:

1. `docs/verification.md`
2. `docs/ai-automating-browsers.md`
3. `/Users/chenglou/github/vibescript/drafts/demos_with_specs/spec-overlay-experiments/photo-gallery/shared-data.md`
4. this file

Write tests first, then implementation, then validate.

Build only inside:

- `/Users/chenglou/github/vibescript/drafts/demos_with_specs/photo-gallery/overlay-contrastive-boundaries`

## Summary

Build a responsive photo gallery with:

- grid mode
- focused horizontal line mode
- hash-based focus routing
- scroll restore on dismiss
- real occlusion

## Small Spatial Picture

```txt
|<-32->| card |<-24->| card |<-24->| card |<-32->|
```

```txt
|<------100------>|<--------- main line ---------->|<------100------>|
 left nav strip        focused image in middle          right nav strip
```

## Exact Metrics

- side padding `32px`
- grid gap `24px`
- grid top padding `40px`
- min target card width about `220px`
- max columns `7`
- line neighbor scale `0.7`
- line gap `52px`
- line bottom gap `28px`
- line top floor `40px`
- left strip `100px`
- right strip `100px`

Grid image caps:

- landscape `boxMaxSizeX`
- square `boxMaxSizeX * 0.85`
- portrait `boxMaxSizeX * 1.05`

Grid caption budget:

- visible text `44px`
- bottom padding `8px`

Line caption budget:

- visible text `64px`
- bottom padding `8px`

## Boundary Pairs

Treat these as the heart of the spec.

### Pair 1: Same Card, Different Target

Given the same grid card:

- click image area -> enter line mode focused on that image
- click caption text -> select the full caption text and stay in grid mode

### Pair 2: Same Screen, Different X

In line mode:

- click inside the left `100px` strip -> previous image
- click in the middle -> dismiss to grid
- click inside the right `100px` strip -> next image

These zones come from the layout, not from animated image edges.

### Pair 3: Same Image, Different Entry

Given the same image id:

- load page without hash -> grid mode
- load page with `#<id>` -> line mode focused on that image

### Pair 4: Same Dismiss, Different Scroll State

Dismiss line mode:

- if the focused row is already visible, keep it in a stable visible position
- if the focused row is offscreen, scroll it back so it lands with about `40px` above it

### Pair 5: Same Grid, Different Mount Semantics

Two implementations may look similar, but only one is valid:

- invalid: every photo stays mounted
- valid: only visible and near-visible photos stay mounted

## Visual Direction

- dark navy background
- rounded dark cards
- subtle shadow
- caption under image in the same card
- GitHub-style icon link at the top-right

## Tests Must Prove

- pure grid layout math
- pure line click routing
- browser-backed navigation/hash sync
- browser-backed dismiss-to-row restore
- browser-backed full caption selection
- browser-backed mounted-count reduction from occlusion
