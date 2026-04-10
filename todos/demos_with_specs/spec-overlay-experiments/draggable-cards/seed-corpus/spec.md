# Draggable Cards Overlay: Seed Corpus

Use `docs/` plus this packet only. Do not inspect `demos/` or other specs.

Read first:

1. `docs/drafts/verification.md`
2. `docs/drafts/automating-browsers.md`
3. this file

Write tests first, then implementation, then validate.

Build only inside:

- `/Users/chenglou/github/vibescript/drafts/demos_with_specs/draggable-cards/overlay-seed-corpus`

## Summary

Build a five-card drag-and-reorder demo with:

- immediate drag start
- live midpoint-based reorder
- release momentum
- released card staying on top while it settles

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

Drag x rule:

- `rawX = pointerX - deltaX`
- `centeredX = (windowWidth - rowSizeX) / 2`
- `x = rawX + (centeredX - rawX) / 1.5`

## Canonical Pure Examples

Treat these as a small seed corpus for your pure tests.

### Reorder Seeds

Given `ordered = [0, 1, 2, 3, 4]` and the dragged card `2`:

- pointer just above card `1` midpoint -> `[0, 2, 1, 3, 4]`
- pointer just below card `1` midpoint -> no upward swap yet

Given `ordered = [0, 1, 2, 3, 4]` and the dragged card `1`:

- pointer just below card `2` midpoint -> `[0, 2, 1, 3, 4]`

### Velocity Seeds

Given recent pointer samples:

```ts
[
  {x: 100, y: 100, time: 0},
  {x: 130, y: 145, time: 40},
  {x: 160, y: 190, time: 80},
  {x: 210, y: 250, time: 120},
]
```

and `now = 120`, use roughly the last `100ms`, not the full history window from `time = 0`.

Given only one useful recent sample pair, allow zero or a cleanly defined fallback velocity. Do not invent a noisy estimate from stale points.

## Product Rules

- drag starts immediately on pointer down
- reorder happens before release
- release velocity feeds the springs
- just-released card stays topmost until settle

## Tests Must Prove

- pure reorder seeds
- pure velocity seeds
- browser-backed reorder-before-release scenario
- browser-backed top-until-settle scenario
