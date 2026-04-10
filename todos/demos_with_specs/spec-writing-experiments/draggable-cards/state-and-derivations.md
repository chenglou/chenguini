# Draggable Cards Spec Variant: State And Derivations

Use `docs/` plus this spec only. Do not inspect `demos/`.

Read `docs/drafts/verification.md` first. Then read the rest of `docs/` as needed. Write tests first, then code, then validate.

Shared browser-runner rules live in:

- `/Users/chenglou/github/vibescript/docs/drafts/verification.md`
- `/Users/chenglou/github/vibescript/docs/drafts/automating-browsers.md`

## Recommended Shape

This demo is easiest if you make the logic explicit.

A good shape is:

- one helper for deterministic card metrics
- one helper for midpoint-based reorder decisions
- one helper for release velocity estimation
- one render/update loop for springs and DOM

You do not need those exact file names, but this demo wants a visible logic seam.

## Core State

Model around ideas like:

```ts
type DragState = {
  orderedIds: string[]
  activeDragId: string | null
  lastDraggedId: string | null
  deltaX: number
  deltaY: number
  pointerSamples: Array<{x: number; y: number; time: number}>
}
```

Each card also wants derived visual state like:

- `x`
- `y`
- `scale`
- `sizeY`
- `lightnessBase`

## Deterministic Card Metrics

Cards are fixed by index and stay recognizable across runs.

Use:

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

Layout constants:

- width `320px`
- top padding `50px`
- no vertical gap between cards
- centered column

## Derived Logic

You likely want a pure helper equivalent to:

- `reorderIdsByPointerY(orderedIds, draggedId, pointerY, cardRects)`
- `estimateReleaseVelocity(pointerSamples, now, windowMs = 100)`

Midpoint rule:

- crossing above the previous card midpoint swaps upward
- crossing below the next card midpoint swaps downward

Velocity rule:

- use roughly the last `100ms` of pointer history
- if there is not enough useful history, return zero velocity

## Input Rules

Start:

- `pointerdown` on card begins drag
- store `deltaX` and `deltaY`

During drag:

- dragged card `y` follows the pointer exactly through the stored offset
- pin both `pos` and `dest` of the dragged card springs
- dragged `x` still moves, but is pulled toward center

Exact x rule:

- `rawX = pointerX - deltaX`
- `centeredX = (windowWidth - rowSizeX) / 2`
- `x = rawX + (centeredX - rawX) / 1.5`

Release:

- clear `activeDragId`
- keep `lastDraggedId` until settle
- add estimated release velocity into x and y springs

Support:

- mouse and touch move/end/cancel paths
- page-relative coordinates
- recent pointer sample history

## Visual Rules

Idle:

- light gray background
- blue cards
- slight shadow
- text like `Drag Me 0`
- hover cursor `grab`

Dragging:

- cursor `grabbing`
- scale about `1.1`
- stronger shadow
- opacity about `0.7`

Depth:

- active drag above everything
- `lastDragged` above the rest while settling
- remaining cards keep a stable order underneath

## Motion Rules

- springs for x, y, and scale
- frame-rate decoupled stepping
- snap when both distance and velocity are tiny

Suggested defaults:

- `msPerAnimationStep = 4`
- x/y stiffness `290`
- x/y damping `24`

## CSS Rules

- `body { user-select: none; overflow: hidden; }`
- cards absolutely positioned
- keep the DOM simple

## What Tests Must Prove

At minimum:

- pure reorder-threshold test
- pure release-velocity test
- browser-backed reorder scenario
- browser-backed release-depth scenario

The browser checks should prove:

- reorder happens before release
- final ordered ids match the scripted path
- released card remains the top item while settling
