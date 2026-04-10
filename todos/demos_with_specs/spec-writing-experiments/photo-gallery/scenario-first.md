# Photo Gallery Spec Variant: Scenario First

Use `docs/` plus this spec only. Do not inspect `demos/`.

Read `docs/drafts/verification.md` first. Then read the rest of `docs/` as needed. Write tests first, then code, then validate.

Shared browser-runner rules live in:

- `/Users/chenglou/github/vibescript/docs/drafts/verification.md`
- `/Users/chenglou/github/vibescript/docs/drafts/automating-browsers.md`

Use the exact data in:

- `/Users/chenglou/github/vibescript/drafts/demos_with_specs/spec-writing-experiments/photo-gallery/shared-data.md`

## Product Summary

Build a photo gallery with:

- a responsive scrollable grid
- a focused horizontal line mode
- hash-based focus routing
- springy but interruptible motion
- real occlusion in grid mode

## Scenario 1: First Load

Starting state:

- no hash
- page freshly loaded

Expect:

- grid mode is visible
- cards are in a responsive grid
- page background is dark navy
- each card is a rounded dark tile with image over caption
- top padding before the first row is `40px`
- page side padding is `32px`
- gap between cards is `24px`
- column count is responsive but never above `7`

Sizing rules:

- target minimum card width is about `220px`
- landscape max image height: `boxMaxSizeX`
- square max image height: `boxMaxSizeX * 0.85`
- portrait max image height: `boxMaxSizeX * 1.05`
- `sizeX = min(naturalWidth, boxMaxSizeX, imgMaxSizeY * aspectRatio)`
- grid caption budget is `44px` visible text plus `8px` bottom padding

## Scenario 2: Hover In Grid

Action:

- move the pointer across one card

Expect:

- cursor becomes `zoom-in`
- hovered card scales to about `1.02`
- hovered card drifts a little toward the pointer
- non-hovered cards return to rest

## Scenario 3: Click Into Line Mode

Action:

- click a card's image area

Expect:

- line mode opens on that image
- focused image becomes large and centered
- other images stay on the same horizontal line
- non-focused images render at `0.7` scale relative to their 1D size
- line card gap is `52px`
- top padding floor is `40px`
- vertical gap between image area and bottom padding budget is `28px`
- focused image id is written to `window.location.hash`

## Scenario 4: Navigate In Line Mode

Line mode has three click zones:

- left `100px` strip means previous image
- right `100px` strip means next image
- everything else means dismiss

Important nuance:

- those hit areas come from layout, not from current animated image edges
- rapid repeated clicks should still navigate instead of accidentally dismissing

Also:

- `ArrowLeft` goes previous
- `ArrowRight` goes next
- `Escape` dismisses
- if nothing is focused yet, `ArrowLeft` or `ArrowRight` should focus the first image

While line mode is open:

- scrolling underneath is locked
- cursor is `zoom-in` over the left and right strips
- cursor is `zoom-out` elsewhere
- focused image stays sharp and bright
- non-focused images are dimmed
- immediate neighbors may blur a bit

## Scenario 5: Dismiss Back To Grid

Action:

- dismiss line mode when the focused image's row is offscreen

Expect:

- line mode closes
- hash clears
- the focused image's grid row is brought back into view
- that row ends up with roughly `40px` of space above it

## Scenario 6: Caption Selection

Action:

- click a grid caption

Expect:

- the full caption text becomes selected immediately
- the page stays in grid mode
- line mode does not open

This is not the same as "the browser selected some substring."

## Scenario 7: Reload And History

Action:

- load the page with `#<photo-id>`
- move to another image
- use browser back and forward

Expect:

- load with a hash reopens line mode on that image
- navigation updates the hash
- back and forward restore the right focused image or closed state

## Scenario 8: Grid Resize And Occlusion

Action:

- resize the page in grid mode
- scroll through the list

Expect:

- anchor item stays visually stable during reflow
- resize does not invent extra motion for items that stay in the same slot
- only visible and near-visible cards stay mounted
- mounted count should be below total photo count on a representative state

## Visual And Loading Rules

- low-res image should show quickly
- low-res image can live on the card background
- a real `<img>` should provide the high-res layer
- focused line-mode image upgrades to high-res
- non-focused images may hide high-res for performance
- include a GitHub-style icon link at the top-right

## What Tests Must Prove

At minimum:

- pure test for grid layout math
- pure test for line-mode click routing
- browser-backed navigation/hash scenario
- browser-backed dismiss-to-row scenario
- browser-backed caption-selection scenario
- browser-backed occlusion scenario
