# Draggable Cards Spec Variant: Spatial ASCII

Use `docs/` plus this spec only. Do not inspect `demos/`.

Read `docs/drafts/verification.md` first. Then read the rest of `docs/` as needed. Write tests first, then code, then validate.

Shared browser-runner rules live in:

- `/Users/chenglou/github/vibescript/docs/drafts/verification.md`
- `/Users/chenglou/github/vibescript/docs/drafts/automating-browsers.md`

## Spatial Picture

Idle stack:

```txt
viewport

          [ Drag Me 0 ]  width 320
          [ Drag Me 1 ]
          [ Drag Me 2 ]
          [ Drag Me 3 ]
          [ Drag Me 4 ]

top padding before first card = 50
cards touch vertically, no extra gap
whole stack is horizontally centered
```

Active drag:

```txt
pointer
  |
  v
      [ dragged card ]
      follows pointerY exactly
      can drift in X, but is pulled back toward center
```

Depth:

```txt
top layer       dragged card
next layer      last released card while it settles
base layers     all remaining cards in stable order
```

## Goal

Make a five-card drag-and-reorder demo where the feel matters:

- drag starts immediately
- the dragged card stays under the pointer
- reorder happens live during drag
- release preserves momentum
- the released card stays visually on top until it settles

## Visual Direction

- light gray background
- blue cards
- centered text like `Drag Me 0`
- slight shadow
- simple DOM, ideally one node per card

## Layout And Deterministic Card Data

- card width `320px`
- top padding `50px`
- no vertical gap between cards
- centered in the viewport

Use this deterministic hash:

```ts
function hash(n: number) {
  n = Math.imul((n >>> 16) ^ n, 0x21f0aaad)
  n = Math.imul((n >>> 15) ^ n, 0x735a2d97)
  return (((n >>> 15) ^ n) >>> 0) / 0x100000000
}
```

Per card index `i`:

- `sizeY = 30 + hash(i * 2) * 150`
- `lightnessBase = hash(i * 2 + 1) * 40 + 40`

## Drag Rules

Pointer down on a card:

- begin drag
- store `deltaX` and `deltaY`

While dragging:

- pin both `pos` and `dest` of the dragged card's springs
- dragged `y` follows pointer exactly via the stored offset
- dragged `x` uses:
  - `rawX = pointerX - deltaX`
  - `centeredX = (windowWidth - rowSizeX) / 2`
  - `x = rawX + (centeredX - rawX) / 1.5`

While dragging, style should feel obvious:

- scale about `1.1`
- cursor `grabbing`
- stronger shadow
- opacity about `0.7`

When not dragging:

- hover cursor `grab`
- otherwise `auto`

## Reorder Picture

Moving upward:

```txt
if pointer crosses above previous card midpoint
-> swap upward now
```

Moving downward:

```txt
if pointer crosses below next card midpoint
-> swap downward now
```

Reorder happens during drag, not after release.

After each swap:

- recompute every non-dragged card destination immediately

## Release Rules

On release:

- clear the active drag
- keep `lastDragged` set until the card settles
- estimate release velocity from roughly the last `100ms` of pointer history
- add that velocity into the x and y springs

The effect should feel like a throw with snap-back.

## Input Model

- prefer `pointerdown`
- support mouse and touch move/end/cancel paths
- use page-relative coordinates
- store recent pointer samples as `{x, y, time}`
- do not assume one release event path is enough on every browser

## Motion

- use springs for x, y, and scale
- motion should be frame-rate decoupled
- snap when both velocity and distance are very small

Suggested defaults:

- `msPerAnimationStep = 4`
- x/y stiffness `290`
- x/y damping `24`

## CSS

- `body` disables text selection
- `body` uses `overflow: hidden`
- cards are absolutely positioned

## What Tests Must Prove

At minimum:

- pure test for reorder threshold logic
- pure test for release velocity estimation
- browser-backed scenario for reorder before release
- browser-backed scenario for release-depth behavior

Those checks should prove:

- crossing the midpoint swaps before release
- final ordered ids match the scripted drag path
- the released card is still the top item while it settles
- the report reaches `ready`
