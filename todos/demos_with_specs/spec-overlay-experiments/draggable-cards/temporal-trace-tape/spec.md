# Draggable Cards Overlay: Temporal Trace Tape

Use `docs/` plus this packet only. Do not inspect `demos/` or other specs.

Read first:

1. `docs/drafts/verification.md`
2. `docs/drafts/automating-browsers.md`
3. this file

Write tests first, then implementation, then validate.

Build only inside:

- `todos/demos_with_specs/draggable-cards/overlay-temporal-trace`

## Summary

Build a five-card drag demo with live reorder and a visible settle phase.

## Exact Metrics

- card width `320px`
- top padding `50px`
- no vertical gap
- centered in viewport

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

## Trace Tape

Treat this time-ordered trace as the heart of the spec.

### Trace A: Downward Reorder

- `t0`: pointer down on card `1` -> drag starts immediately
- `t1`: dragged card remains under the pointer
- `t_cross`: pointer crosses below card `2` midpoint -> order changes before release
- `t_after_cross`: non-dragged cards close the gap immediately
- `t_release`: active drag clears, `lastDragged` is card `1`
- `t_settle`: `lastDragged` eventually clears after the card settles

### Trace B: Depth During Release

- `t0`: card is actively dragged -> it is topmost
- `t_release`: just-released card is still topmost
- `t_mid_settle`: just-released card remains topmost while still moving
- `t_done`: when movement is effectively finished, normal depth ordering resumes

### Trace C: Velocity

- pointer samples from about the last `100ms` influence the release throw
- with no useful recent history, release velocity falls back to zero

## Exact Behavior

Drag x rule:

- `rawX = pointerX - deltaX`
- `centeredX = (windowWidth - rowSizeX) / 2`
- `x = rawX + (centeredX - rawX) / 1.5`

Dragging visuals:

- scale about `1.1`
- cursor `grabbing`
- stronger shadow
- opacity about `0.7`

Not dragging:

- hover cursor `grab`
- otherwise `auto`

Spring defaults:

- `msPerAnimationStep = 4`
- x/y stiffness `290`
- x/y damping `24`

## Tests Must Prove

- pure reorder logic around midpoint crossings
- pure release velocity from recent samples
- browser-backed downward drag trace
- browser-backed top-during-settle trace
