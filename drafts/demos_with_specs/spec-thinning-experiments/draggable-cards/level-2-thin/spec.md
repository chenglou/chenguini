# Draggable Cards Level 2: Thin

Use `docs/` plus this packet only. Do not inspect `demos/` or other specs.

Read first:

1. `docs/verification.md`
2. `docs/ai-automating-browsers.md`
3. this file

Write tests first, then implementation, then validate.

Build only inside:

- `/Users/chenglou/github/vibescript/drafts/demos_with_specs/draggable-cards/thin-level-2-thin`

Build a five-card drag demo with:

- immediate drag start
- live midpoint-based reorder
- release momentum
- released card staying on top until settle

Keep these exact:

- card width `320px`
- top padding `50px`
- no vertical gap
- use recent pointer history from about the last `100ms`
- `rawX = pointerX - deltaX`
- `centeredX = (windowWidth - rowSizeX) / 2`
- `x = rawX + (centeredX - rawX) / 1.5`

Use this hash:

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

Tests must prove:

- reorder happens before release when crossing a midpoint
- released card stays on top while settling
- velocity uses recent history
