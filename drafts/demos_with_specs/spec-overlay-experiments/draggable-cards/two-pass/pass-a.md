# Draggable Cards Overlay: Two Pass Packet, Pass A

Use `docs/` plus this packet only. Do not inspect `demos/` or other specs.

Read first:

1. `docs/verification.md`
2. `docs/ai-automating-browsers.md`
3. this file

Process:

1. Read Pass A.
2. Write the tests from Pass A first.
3. Only after the tests exist, read Pass B.
4. Then implement and validate.

Build only inside:

- `/Users/chenglou/github/vibescript/drafts/demos_with_specs/draggable-cards/overlay-two-pass`

## Summary

Build a five-card drag-and-reorder demo where:

- drag starts immediately
- the dragged card stays under the pointer
- reorder happens during drag
- release preserves momentum
- the released card stays above the stack until it settles

## Exact Metrics

- card width `320px`
- top padding `50px`
- no vertical gap between cards
- centered in viewport
- drag scale about `1.1`
- drag opacity about `0.7`

Use this exact hash:

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

Drag x rule:

- `rawX = pointerX - deltaX`
- `centeredX = (windowWidth - rowSizeX) / 2`
- `x = rawX + (centeredX - rawX) / 1.5`

Release:

- estimate velocity from about the last `100ms` of pointer history
- add that velocity into x and y springs

Spring defaults:

- `msPerAnimationStep = 4`
- x/y stiffness `290`
- x/y damping `24`

## Scenarios

### Scenario 1: Start Drag

Expect:

- drag starts on pointer down
- dragged card stays under pointer

### Scenario 2: Reorder During Drag

Expect:

- crossing above the previous midpoint swaps upward before release
- crossing below the next midpoint swaps downward before release

### Scenario 3: Release

Expect:

- active drag clears
- momentum carries into the springs
- released card remains on top while it settles

## Tests Must Prove

- pure midpoint reorder logic
- pure release velocity estimation
- browser-backed reorder-before-release scenario
- browser-backed top-until-settle scenario
