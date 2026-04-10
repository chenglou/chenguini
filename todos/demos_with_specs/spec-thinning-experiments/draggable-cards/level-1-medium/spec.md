# Draggable Cards Level 1: Medium

Use `docs/` plus this packet only. Do not inspect `demos/` or other specs.

Read first:

1. `docs/drafts/verification.md`
2. `docs/drafts/automating-browsers.md`
3. this file

Write tests first, then implementation, then validate.

Build only inside:

- `/Users/chenglou/github/vibescript/drafts/demos_with_specs/draggable-cards/thin-level-1-medium`

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
- no vertical gap
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

- use roughly the last `100ms` of pointer history
- add that velocity into x and y springs

## Seed Examples

- ordered `[0,1,2,3,4]`, dragged `2`, pointer just above card `1` midpoint -> `[0,2,1,3,4]`
- ordered `[0,1,2,3,4]`, dragged `1`, pointer just below card `2` midpoint -> `[0,2,1,3,4]`

## Required Checks

- pure midpoint reorder logic
- pure release velocity estimation
- browser-backed reorder-before-release
- browser-backed top-until-settle
