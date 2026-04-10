# Draggable Cards Spec

Use `docs/` plus this packet only. Do not inspect `demos/` or other specs.

Read first:

1. `docs/drafts/verification.md`
2. `docs/drafts/automating-browsers.md`
3. this file

Write tests first, then implementation, then validate.

Build only inside the target folder the main thread gives you.

## Summary

Build a five-card drag demo with:

- immediate drag start
- live midpoint reorder
- release momentum
- the released card staying on top until it settles
- a light gray page and five centered blue cards labeled like `Drag Me 0`

## Data

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

## Exact Numbers

- card width `320px`
- top padding `50px`
- no vertical gap between cards
- use recent pointer history from about the last `100ms`
- `rawX = pointerX - deltaX`
- `centeredX = (windowWidth - rowSizeX) / 2`
- dragged `x = rawX + (centeredX - rawX) / 1.5`
- drag scale about `1.1`
- drag opacity about `0.7`
- `msPerAnimationStep = 4`
- x/y stiffness `290`
- x/y damping `24`

## Fragile Truths

- dragging past the next midpoint should reorder before release
- the dragged card should stay under the pointer using the stored `deltaX` and `deltaY`
- release should use recent pointer history instead of snapping straight home
- the active card is above everything
- the just-released card stays above the rest until settle finishes
- release handling should still finish cleanly on mouse and touch end or cancel paths

## Picture

```txt
top layer       dragged item
next layer      just released item while settling
base layers     all remaining items
```

## Tests Must Prove

- reorder threshold logic
- release velocity estimation from recent pointer samples
- browser-backed scripted drag reorders before release and lands on the expected final order
- browser-backed release-depth scenario keeps the released card on top while settling
