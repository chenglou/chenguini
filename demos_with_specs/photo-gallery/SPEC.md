# Photo Gallery Spec

Recreate the original photo gallery demo from `docs/` plus this spec only. Do not inspect `demos/`.

## Deliverable

Build the round inside `demos_with_specs/photo-gallery/round-10/`.

Expected files:

- `index.html`
- `index.ts`
- any helper files you need, such as `data.ts`
- tests that run locally and verify the behavior before implementation is considered done

## Process Constraints

1. Read `docs/verification.md` first.
2. Then read the rest of `docs/` as needed.
3. Write tests first.
4. Then write the implementation.
5. Validate against the tests.
6. Never inspect `demos/`.

Execution priority:

- Ship a minimal complete end-to-end demo before polishing.
- That thin slice must already include:
  - grid mode
  - line mode
  - hash routing
  - dismiss-to-row behavior
  - scroll lock while line mode is visible
- Only after that should you spend time on hover magnet, blur/brightness nuance, or image-loading polish.

Shared verification and browser-automation rules live in:

- `docs/verification.md`
- `docs/ai-automating-browsers.md`

Don't restate or invent a different verifier shape. Use those docs for runner/tooling/transport decisions. This spec is about the demo's behavior and the seams that must be proven.

## Goal

Make a photo gallery with two modes:

- a scrollable responsive grid
- a focused horizontal line mode for browsing one image at a time

The point is not just to show pictures. The point is to preserve interaction quality:

- clicks should feel forgiving
- resize should avoid layout shift
- transitions should be interruptible
- hover should feel continuous rather than binary
- the URL should reflect the focused image

## Visual Direction

- Dark navy page background.
- The page should feel like a hand-built art gallery, not a generic masonry grid.
- Each photo sits in a rounded dark card with a subtle shadow.
- The caption sits directly under the image inside the same card.
- Include a GitHub-style icon link at the top-right as fixed chrome.

It does not need to be pixel-identical, but it should feel recognizably like the original demo.

## Data

Use this exact seed set. The image URLs come from the Midjourney CDN.

- Low-res image URL: `https://cdn.midjourney.com/${id}_384_N.webp`
- High-res image URL: `https://cdn.midjourney.com/${id}.webp`

Use this array as your data source:

```ts
export type PhotoData = {
  id: string
  w: number
  h: number
  prompt: string
}

export const photoGalleryData: PhotoData[] = [
  {id: 'd228330c-7364-497b-994f-a37467ae436a/0_0', w: 2048, h: 2048, prompt: 'Miniature watermelon delicately balanced on fingertip'},
  {id: '7b5301ca-ef01-44bd-8bcc-4473c945aaaf/0_0', w: 1792, h: 2688, prompt: 'Hourglass heart, liquid, grand canyon background, fleeting, ephemerality of time'},
  {id: '96ff81dd-fa46-43c0-b681-35b7cd8eb700/0_0', w: 1792, h: 2688, prompt: 'A phone held extremely close against an xray of a skeleton sitting on a sofa, side by side view'},
  {id: '077ddfbf-4f1a-437f-909e-073ec48beae0/0_0', w: 1344, h: 896, prompt: 'Eclipse in a tiny keychain bottle, dangling around a walking woman\\'s purse, dynamic pose, macro photography'},
  {id: 'e1d06d80-68ca-4081-9ca2-73f5ba7333cc/0_3', w: 1536, h: 768, prompt: 'Tetris monuments in lord of the rings setting'},
  {id: '196ff609-69c8-47be-8d92-e9ba9db95e2c/0_3', w: 848, h: 1424, prompt: 'Peaceful prehistoric marine lagaxy life, adventure, bold outlines, bold colors, psychedelic swirls patterns'},
  {id: 'daa6883b-75ae-4805-9fe8-d394006ca8ca/0_1', w: 1024, h: 1024, prompt: 'Apple WWDC promo, dan mumford'},
  {id: '0dcaf55a-6ece-42b1-a0b3-eb753d108415/0_3', w: 1424, h: 848, prompt: 'Everything everywhere all at once, bold outlines'},
  {id: 'cfd235ab-89b2-4834-9544-19768f160d2a/0_1', w: 1344, h: 896, prompt: 'Cute and fluffy marshmallow modern mansion'},
  {id: 'ab740a8e-54af-452a-9b74-7b8cb233c025/0_0', w: 1024, h: 1024, prompt: 'Voronoi 3D printed cup taking roots'},
  {id: 'bcf32fdc-6d81-40f0-9063-d67cb402ea2a/0_0', w: 1344, h: 1024, prompt: 'Marble sculpture of an orange, museum gallery, exhibit'},
  {id: 'eb145f80-0196-4557-8560-e33637a3a807/0_0', w: 864, h: 1728, prompt: 'hourglass heart, liquid, grand canyon background'},
  {id: '604af437-f76b-4c7f-b778-1a3bf6ad663b/0_0', w: 1024, h: 1024, prompt: 'Golden retriever rising from the thick smokes, silhouette, contour'},
  {id: 'b6beb80d-b006-45e0-a06d-5e482b541571/0_0', w: 2304, h: 1536, prompt: 'Jupiter sitting on a chair on Saturn'},
  {id: '30d33a33-9b5b-4947-b813-4d0c5c2f9939/0_0', w: 1536, h: 1024, prompt: 'Chinese mid autumn festival on Neptune, surrealism'},
  {id: 'fb622e95-814d-4f74-8ac0-04d266c8387d/0_0', w: 1664, h: 2432, prompt: 'eclipse in a bottle'},
  {id: '733a5b94-3f35-4357-8ef5-645d1a9bb942/0_0', w: 1024, h: 1536, prompt: 'silk-like silhouette of koi fish, abstract wall paper, volumetric lighting'},
  {id: '2ca7a0f7-9153-45ce-be2b-1fc89327f61b/0_0', w: 2304, h: 1536, prompt: 'futuristic qipao, pink seamless astronaut skirt, sitting cross-legged at a floating space cafe, looking at camera, high angle, depth of field'},
  {id: '890a8dbb-93f6-4934-a92f-7dde390410e0/0_0', w: 1024, h: 1536, prompt: 'website landing page of a company with photos of streets and tiles'},
  {id: '11048abd-2c7e-42de-929b-bad5d810b3a3/0_0', w: 1024, h: 1024, prompt: 'dead tree and castle shaped like the silhouette of a skull, negative space'},
  {id: 'a812ad46-f902-427e-804b-68f5a55f2264/0_0', w: 1024, h: 1024, prompt: 'closed up macrophotography of a bowl of asian dessert'},
  {id: '4481ad84-444d-4761-adb1-15d470f216da/0_0', w: 1536, h: 1536, prompt: 'the cutest little cartoon octopus wearing a cap in a bathtub, she\\'s playing with a toy boat, studio lighting, closed-up, hyperrealistic, photoshoot, tilt shift, contrast, intricate details'},
  {id: '50be9117-b2f5-482f-b61f-46477ed6184e/0_0', w: 1024, h: 1536, prompt: 'three-body problem, cinematic'},
  {id: '39428453-9b30-4998-a3d6-4668b4e2621f/0_0', w: 1536, h: 1536, prompt: 'super mario gundam'},
]
```

## Behavior

### Grid Mode

- The default mode is a vertically scrollable grid.
- Use a responsive column count.
- Use a minimum visual card width of about `220px`.
- Clamp the column count to at most `7`.
- Horizontal and vertical gap between cards: `24px`.
- Top padding before the first row: `40px`.
- Left and right page padding in grid mode: `32px` each.

Use area-aware sizing rather than naive width-only sizing:

- Start from the column width budget.
- Landscape images can use the normal budget.
- Square images should be shrunk a bit because they read visually larger at the same width.
- Portrait images should be allowed to grow a bit because they otherwise read too small.

Use these exact heuristics:

- square max image height: `boxMaxSizeX * 0.85`
- portrait max image height: `boxMaxSizeX * 1.05`
- landscape max image height: `boxMaxSizeX`

Then compute:

- `sizeX = min(naturalWidth, boxMaxSizeX, imgMaxSizeY * aspectRatio)`
- `sizeY = imageHeight + captionHeight`

Caption height budget in grid mode:

- `44px` of visible text area
- plus `8px` of bottom padding

Grid mode hover:

- hovering a card sets the document cursor to `zoom-in`
- the hovered card should scale up very slightly, about `1.02`
- the hovered card should drift a little toward the pointer, like a weak magnet
- non-hovered cards should return to rest

Grid mode click:

- clicking a card enters line mode focused on that card
- clicking the caption should select the whole caption text instead of changing mode
- on a simple click, select the full prompt text immediately; do not rely on partial browser text selection

### Line Mode

- The focused image becomes large and centered.
- The other images stay arranged on the same horizontal line to the left and right.
- Non-focused images should be visibly smaller than the focused one.
- Use a scale factor of `0.7` for non-focused images relative to their 1D size.
- Keep `52px` horizontal gap between line-mode cards.
- Keep `28px` vertical gap between the image area and the bottom padding budget.
- Top padding floor: `40px`.

Line mode uses forgiving hit areas:

- left navigation strip: `100px` wide and spans the full window height
- right navigation strip: `100px` wide and spans the full window height
- these hit areas are based on the layout, not the currently animated image edges
- this means rapid repeated clicks should still navigate instead of accidentally dismissing

Line mode click behavior:

- clicking the left strip focuses the previous image if one exists
- clicking the right strip focuses the next image if one exists
- clicking anywhere else dismisses line mode back to the grid
- while line mode is visible, scrolling underneath it should be disabled

Line mode keyboard behavior:

- `ArrowLeft` moves to the previous image
- `ArrowRight` moves to the next image
- `Escape` dismisses line mode
- if no image is focused and the user presses `ArrowLeft` or `ArrowRight`, focus the first image

Line mode visuals:

- focused image remains sharp and bright
- non-focused images are dimmed
- immediate neighbors may also be blurred a bit
- hovering the left or right navigation side should lighten that target image slightly and scale it up a touch
- the cursor should be `zoom-in` over the left or right navigation strip and `zoom-out` elsewhere in line mode

Caption behavior:

- grid mode captions clamp to 2 lines
- line mode caption shows many more lines and can scroll vertically if needed
- line mode caption height budget: `64px` of visible text area plus `8px` of bottom padding

### Image Loading

- Each card should always have a low-res image visible quickly.
- Use the low-res image as a background on the card itself.
- Use a real `<img>` for the high-res image layered above it.
- The focused line-mode image should upgrade to the high-res URL.
- Non-focused images can hide the high-res `<img>` for performance.

### Motion

- Use spring-like motion, not CSS transitions for position and size changes.
- Motion should be interruptible.
- Respect `prefers-reduced-motion: reduce` by effectively snapping springs to the end.

Important nuance:

- not every layout change should animate every property
- if a pure resize keeps an item in the same slot, do not invent extra motion
- when switching between grid mode and line mode, preserve the current visual position and size first, then settle toward the new layout

### Scroll And Resize

- In grid mode, keep an anchor item stable on resize so the page does not visibly jump.
- If the column count changes on resize, preserve on-screen position during the reflow, then settle.
- When dismissing line mode, if the focused item's grid row is offscreen, programmatically scroll so that row becomes visible again.
- Leave a little extra space above that row after dismissing. A peek of roughly `40px` is enough.

### Routing

- The focused image id lives in `window.location.hash`.
- Reloading the page with a hash should reopen line mode on that image.
- Moving between focused images updates the hash.
- Dismissing line mode clears the hash.
- Handle browser back and forward.

### Occlusion

- Only keep visible or near-visible cards mounted in the DOM.
- This is a required part of the demo, not an optimization you can skip.

## Verification Expectations

Write tests before implementation.

At minimum, cover these:

- a pure test for the responsive grid layout math
- a pure test for line-mode hit-area routing
- a browser-backed semantic check for one real navigation flow
- a browser-backed semantic check for resize anchoring or dismiss-to-row behavior
- a browser-backed semantic check that clicking a grid caption selects the full caption text and does not enter line mode
- a browser-backed semantic check that proves grid occlusion actually mounts fewer items than the full photo count

The browser-backed checks should prove these demo-specific outcomes:

- the report reaches `ready` for navigation, dismiss, and caption-selection scenarios
- caption click returns the full prompt text, not an empty or partial slice
- dismiss-to-row restores the focused row with roughly `40px` of space above it
- at least one representative grid state reports mounted count lower than the total photo count

If a browser check passes without proving those outcomes, it is too weak.
