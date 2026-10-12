# Draggable Cards Spec Variant: Scenario First

Use `docs/` plus this spec only. Do not inspect `demos/`.

Read `docs/drafts/verification.md` first. Then read the rest of `docs/` as needed. Write tests first, then code, then validate.

Shared browser-runner rules live in:

- `docs/drafts/verification.md`
- `docs/drafts/automating-browsers.md`

## Product Summary

Build a five-card drag demo where the cards reorder live and the release still feels physical.

## Scenario 1: Initial Load

Expect:

- light gray page background
- five blue cards
- cards centered horizontally
- card width `320px`
- first card starts `50px` from the top
- no extra vertical gap between cards
- centered text like `Drag Me 0`

Card height and lightness should be deterministic from index:

```ts
function hash(n: number) {
  n = Math.imul((n >>> 16) ^ n, 0x21f0aaad)
  n = Math.imul((n >>> 15) ^ n, 0x735a2d97)
  return (((n >>> 15) ^ n) >>> 0) / 0x100000000
}
```

Use:

- `sizeY = 30 + hash(i * 2) * 150`
- `lightnessBase = hash(i * 2 + 1) * 40 + 40`

## Scenario 2: Start Drag

Action:

- pointer down over one card

Expect:

- drag starts immediately
- card stays under the pointer using stored `deltaX` and `deltaY`
- cursor becomes `grabbing`
- card scales to about `1.1`
- shadow gets stronger
- opacity drops to about `0.7`

Horizontal motion rule:

- `rawX = pointerX - deltaX`
- `centeredX = (windowWidth - rowSizeX) / 2`
- final x is `rawX + (centeredX - rawX) / 1.5`

## Scenario 3: Drag Through The Stack

Action:

- drag a card downward past the next card midpoint

Expect:

- reorder happens before release
- non-dragged cards close the gap immediately

Mirror rule upward:

- dragging above the previous card midpoint swaps upward before release

## Scenario 4: Release

Action:

- release after a real drag path

Expect:

- active drag clears
- recent pointer history from about the last `100ms` drives release velocity
- velocity is added into the x and y springs
- card throws and snaps back instead of dropping instantly

## Scenario 5: Depth While Settling

After release:

- the just-released card stays marked as `lastDragged`
- that card remains visually above the stack until it settles
- only after settling should it fall back into normal depth

This is required. Without it, the release looks wrong.

## Input Rules

- prefer `pointerdown`
- use page-relative coordinates
- keep recent pointer samples as `{x, y, time}`
- support mouse and touch move/end/cancel paths
- do not assume one release event path is enough on every browser

## Motion Rules

- use springs for x, y, and scale
- frame-rate decoupled stepping
- spring snapping when distance and velocity are both very small

Suggested defaults:

- `msPerAnimationStep = 4`
- x/y stiffness `290`
- x/y damping `24`

## CSS Rules

- `body` disables text selection
- `body` uses `overflow: hidden`
- cards are absolutely positioned
- keep the DOM simple

## What Tests Must Prove

At minimum:

- pure test for midpoint reorder logic
- pure test for release velocity estimation
- browser-backed scenario where a drag path changes order
- browser-backed scenario where the released card stays on top while settling
