# Photo Gallery Spec Variant: Spatial ASCII

Use `docs/` plus this spec only. Do not inspect `demos/`.

Read `docs/verification.md` first. Then read the rest of `docs/` as needed. Write tests first, then code, then validate.

Shared browser-runner rules live in:

- `/Users/chenglou/github/vibescript/docs/verification.md`
- `/Users/chenglou/github/vibescript/docs/ai-automating-browsers.md`

This spec is only about the gallery itself.

## Big Picture

The gallery has two modes:

- a scrollable grid
- a focused horizontal line mode

The grid should feel calm and browseable. The line mode should feel forgiving and fast to click through.

## Spatial Picture

Grid mode:

```txt
viewport width
|<-32->| card |<-24->| card |<-24->| card |<-32->|

top of page
40px

+----------------------+
| image                |
|                      |
+----------------------+
| caption, clamp 2 ln  |
+----------------------+
```

Important grid facts:

- page side padding is `32px`
- gap between cards is `24px`
- top padding before the first row is `40px`
- target minimum card width is about `220px`
- clamp column count to at most `7`

Line mode:

```txt
|<------100------>|<--------- main line ---------->|<------100------>|
 left nav strip        focused image in middle         right nav strip

small      small        BIG focused        small      small
0.7x       0.7x                             0.7x      0.7x
```

Important line-mode facts:

- left and right nav strips are each `100px` wide
- those hit areas are based on layout, not current animated image edges
- middle click dismisses back to grid
- left strip means previous image
- right strip means next image
- while line mode is open, scrolling underneath is locked

## Data

Use the exact data in:

- `/Users/chenglou/github/vibescript/drafts/demos_with_specs/spec-writing-experiments/photo-gallery/shared-data.md`

## Grid Sizing

The width budget starts from the responsive column width.

Then image sizing changes a bit by aspect class:

- landscape max image height: `boxMaxSizeX`
- square max image height: `boxMaxSizeX * 0.85`
- portrait max image height: `boxMaxSizeX * 1.05`

Then:

- `sizeX = min(naturalWidth, boxMaxSizeX, imgMaxSizeY * aspectRatio)`
- `sizeY = imageHeight + captionHeight`

Caption budget in grid mode:

- `44px` visible text area
- `8px` bottom padding

## Interaction Picture

Grid hover:

- card cursor is `zoom-in`
- hovered card scales to about `1.02`
- hovered card drifts a little toward the pointer

Grid click:

- click image area -> enter line mode on that image
- click caption -> select the full caption text and stay in grid mode

Line mode:

- focused image is large and centered
- neighbors stay on one horizontal line
- non-focused scale is `0.7`
- gap between line cards is `52px`
- gap between image area and bottom padding budget is `28px`
- top padding floor is `40px`

Line-mode caption:

- much taller than grid caption
- visible text area `64px`
- bottom padding `8px`
- can scroll if needed

Keyboard:

- `ArrowLeft` previous
- `ArrowRight` next
- `Escape` dismiss
- if nothing is focused yet, `ArrowLeft` and `ArrowRight` focus the first image

Routing:

- focused image id lives in `window.location.hash`
- reload with a hash should reopen line mode on that image
- moving between images updates the hash
- dismiss clears the hash
- browser back and forward should work

Scroll and resize:

- grid resize should keep an anchor item visually stable
- if line mode dismisses while the focused row is offscreen, scroll that row back into view
- after dismiss, leave about `40px` of space above that row

Motion:

- use spring-like motion, not plain CSS transitions, for position and size changes
- motion should be interruptible
- if resize keeps an item in the same slot, do not invent extra motion
- when switching modes, preserve the current visual position and size first, then settle

Occlusion:

- only visible and near-visible cards should stay mounted
- this is required

Image loading:

- low-res image should appear quickly
- use the low-res image as a card background
- use a real `<img>` layered above for the high-res image
- focused line-mode image upgrades to high-res
- non-focused images can hide high-res for performance

## Visual Direction

- dark navy background
- rounded dark cards
- subtle shadow
- caption inside the same card, directly under the image
- GitHub-style icon link at the top-right

It should feel like a hand-built gallery, not a generic masonry feed.

## What Tests Must Prove

At minimum:

- pure test for responsive grid layout math
- pure test for line-mode hit-area routing
- browser-backed scenario for navigation and hash sync
- browser-backed scenario for dismiss-to-row scroll restore
- browser-backed scenario for full caption selection while staying in grid mode
- browser-backed scenario proving mounted grid count is lower than total photo count

If a test passes without proving those outcomes, it is too weak.
