# Draggable Cards Spec

Recreate the original draggable cards demo from `docs/` plus this spec only. Do not inspect `demos/`.

## Deliverable

Build the round inside `demos_with_specs/draggable-cards/round-10/`.

Expected files:

- `index.html`
- `index.ts`
- any helper files you need
- tests that run locally and verify the behavior before implementation is considered done

## Process Constraints

1. Read `docs/verification.md` first.
2. Then read the rest of `docs/` as needed.
3. Write tests first.
4. Then write the implementation.
5. Validate against the tests.
6. Never inspect `demos/`.

Shared verification and browser-automation rules live in:

- `docs/verification.md`
- `docs/ai-automating-browsers.md`

Don't restate or invent a different verifier shape. Use those docs for runner/tooling/transport decisions. This spec is about the demo's behavior and the seams that must be proven.

## Goal

Make a tiny drag-and-reorder demo with five stacked cards.

The point is not just that the cards reorder. The point is the feel:

- drag starts immediately
- the dragged card stays under the pointer
- the list reorders while dragging, not only on release
- release preserves momentum
- the released card stays visually above the others until it settles

## Visual Direction

- Light gray page background.
- Five blue cards centered horizontally.
- Each card has a deterministic height, a slight shadow, and centered text like `Drag Me 0`.
- Keep the DOM simple. One node per card is enough.

## Layout

- Card width: `320px`.
- Top padding before the first card: `50px`.
- Cards stack vertically with no extra gap between them.
- Horizontal position is centered in the viewport.

Use deterministic pseudo-randomness for card height and lightness:

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

Use those values to derive outline and background colors so the cards are recognizably in the same family.

## Input Model

- Prefer `pointerdown` for drag start.
- Track pointer history for release velocity.
- Support mouse and touch move/end paths.
- Use page-relative coordinates for drag tracking.

Store recent pointer samples with `{x, y, time}`.

Release handling should be reliable across input paths:

- start drag from `pointerdown`
- do not assume one release event is always enough on every browser
- handle mouse and touch end/cancel paths so the demo still finishes the drag cleanly

## Hit Testing

- Hit test against the card's current visual position while dragging is possible.
- A pointer is on a card if it falls within the card's current rectangle.

## Drag Behavior

When a pointer goes down over a card:

- capture which card is dragged
- store the pointer-to-card offset as `deltaX` and `deltaY`

During active drag:

- pin both `pos` and `dest` of the dragged card's springs
- the dragged card's `y` follows the pointer exactly using the stored offset
- the dragged card's `x` is allowed to move, but it should be pulled somewhat back toward the centered column

Use this exact horizontal behavior:

- `rawX = pointerX - deltaX`
- `centeredX = (windowWidth - rowSizeX) / 2`
- final dragged x should be `rawX + (centeredX - rawX) / 1.5`

While dragging:

- scale the dragged card up slightly, about `1.1`
- cursor becomes `grabbing`
- shadow becomes much stronger
- opacity drops a bit, about `0.7`

When not dragging:

- hovering a card shows `grab`
- otherwise cursor is `auto`

## Reordering

Reorder live while dragging.

If the dragged card moves upward:

- swap it upward whenever the pointer crosses above the vertical midpoint of the previous card

If the dragged card moves downward:

- swap it downward whenever the pointer crosses below the vertical midpoint of the next card

After swaps, recompute every non-dragged card's destination so the stack closes up immediately.

## Release Behavior

On release:

- clear the active drag
- keep the just-released card marked as `lastDragged` until it settles
- estimate release velocity from recent pointer history, using roughly the last `100ms`
- add that velocity to the dragged card's x and y springs

The result should feel like a throw with snap-back rather than an instant drop.

## Motion

- Use springs for x, y, and scale.
- Motion should be frame-rate decoupled.
- Use spring snapping when velocity and distance are both very small.

Suggested spring defaults:

- `msPerAnimationStep = 4`
- x/y stiffness `290`
- x/y damping `24`

## Depth

This demo has an important z-order nuance:

- the actively dragged card is above everything
- the last released card is still above the rest while it animates back into place
- the remaining cards keep a stable order underneath

This is required. Without it, the release looks wrong.

## CSS

- `body` should disable text selection
- `body` should use `overflow: hidden`
- cards are absolutely positioned
- avoid generic framework wrappers

## Verification Expectations

Write tests before implementation.

At minimum, cover these:

- a pure test for reorder threshold logic
- a pure test for velocity estimation from pointer samples
- a browser-backed semantic check for a scripted drag that changes order
- a browser-backed semantic check that the released card keeps elevated depth while settling

The browser-backed checks should prove these demo-specific outcomes:

- dragging past the next midpoint reorders before release
- the final ordered card ids match the scripted path
- the released card still reports as the top item while settling
- the report reaches `ready` for both reorder and release-depth scenarios

Keep the toolchain light, but follow the docs for how the page and runner talk to each other. If the browser check can only prove that the page booted, it is too weak.
