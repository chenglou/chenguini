# Photo Gallery Spec Variant: State And Derivations

Use `docs/` plus this spec only. Do not inspect `demos/`.

Read `docs/verification.md` first. Then read the rest of `docs/` as needed. Write tests first, then code, then validate.

Shared browser-runner rules live in:

- `/Users/chenglou/github/vibescript/docs/verification.md`
- `/Users/chenglou/github/vibescript/docs/ai-automating-browsers.md`

Use the exact data in:

- `/Users/chenglou/github/vibescript/drafts/demos_with_specs/spec-writing-experiments/photo-gallery/shared-data.md`

## Recommended Shape

The easiest shape for this demo is:

- one layout helper for grid mode
- one layout helper for line mode
- one click-routing helper for line mode
- one small router layer around `window.location.hash`
- one scroll-restore helper for dismissing back to grid

You do not have to match those exact file names, but this demo wants clear seams.

## Core State

Model the page around a state roughly like:

```ts
type GalleryState = {
  focusedId: string | null
  hoveredId: string | null
  viewportWidth: number
  viewportHeight: number
  scrollTop: number
  pointerX: number
  pointerY: number
}
```

You can add fields, but keep these ideas explicit:

- grid vs line mode comes from whether `focusedId` exists
- routing truth comes from the hash
- scroll restore on dismiss depends on the focused item's grid row
- occlusion depends on viewport and scroll position

## Derived Layout: Grid

Given viewport width and photo data, derive:

- column count
- column width budget
- each card's `x`, `y`, `sizeX`, `sizeY`
- total grid height

Constants:

- min target card width about `220px`
- max columns `7`
- gap `24px`
- top padding `40px`
- page side padding `32px`

Aspect-aware caps:

- landscape max image height: `boxMaxSizeX`
- square max image height: `boxMaxSizeX * 0.85`
- portrait max image height: `boxMaxSizeX * 1.05`

Then:

- `sizeX = min(naturalWidth, boxMaxSizeX, imgMaxSizeY * aspectRatio)`
- `sizeY = imageHeight + captionHeight`

Grid caption budget:

- visible text `44px`
- bottom padding `8px`

## Derived Layout: Line Mode

Given focused index and viewport size, derive:

- focused image card geometry
- left and right neighbor geometry on the same horizontal line
- line-mode caption geometry
- left and right click-strip routing zones

Constants:

- non-focused scale `0.7`
- horizontal gap `52px`
- image-to-bottom-padding gap `28px`
- top padding floor `40px`
- left strip `100px`
- right strip `100px`
- line caption visible text `64px`
- line caption bottom padding `8px`

## Input Rules

Grid mode:

- hover should set `zoom-in`
- hovered card should scale to about `1.02`
- hovered card should drift a little toward the pointer
- clicking image area opens line mode on that image
- clicking caption selects the full caption text and must not open line mode

Line mode:

- left strip focuses previous image if it exists
- right strip focuses next image if it exists
- middle dismisses
- `ArrowLeft`, `ArrowRight`, `Escape` work
- if no image is focused and left or right is pressed, focus the first image
- while line mode is open, scrolling underneath is locked

## Routing Rules

- `focusedId` lives in `window.location.hash`
- load with a hash should reopen line mode on that image
- moving between images updates the hash
- dismiss clears the hash
- browser back and forward must work

## Motion Rules

Use spring-like motion for position and size.

Important:

- motion should be interruptible
- if resize leaves an item in the same slot, do not animate it just because a resize happened
- when moving between grid and line layouts, preserve current visual position and size first, then settle
- honor `prefers-reduced-motion: reduce` by effectively snapping

## Scroll And Occlusion Rules

- resize in grid mode should keep an anchor item visually stable
- dismissing line mode should bring the focused row back into view if needed
- after dismiss, leave roughly `40px` of space above that row
- grid mode should mount only visible and near-visible cards

## Visual Rules

- dark navy background
- rounded dark cards
- subtle shadow
- caption inside the same card under the image
- top-right GitHub-style icon link
- focused line-mode image sharp and bright
- non-focused images dimmed
- immediate neighbors may blur a bit

## Loading Rules

- low-res image visible quickly
- low-res image can live on the card background
- high-res image uses a real `<img>` above it
- focused line-mode image upgrades to high-res
- non-focused images can hide high-res

## What Tests Must Prove

At minimum:

- pure `computeGridLayout`-style test
- pure `routeLineModeClick`-style test
- browser-backed navigation/hash scenario
- browser-backed dismiss-to-row scenario
- browser-backed caption-selection scenario
- browser-backed occlusion scenario

The browser checks should assert real semantic outcomes, not just "the page booted."
