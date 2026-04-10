# Life Calendar Spec

Use `docs/` plus this packet only. Do not inspect `demos/` or other specs.

Read first:

1. `docs/drafts/verification.md`
2. `docs/drafts/automating-browsers.md`
3. this file

Write tests first, then implementation, then validate.

Build only inside:

- the target folder the main thread gives you

## Summary

Build a canvas-based life calendar with:

- one centered grid covering a 75-year lifespan
- past weeks shown in green, future weeks shown in gray
- the current week split into individual day cells with today darker
- special hover behavior for the current age and the final day
- a clickable custom goal dot whose text persists through reload

## Data

Use these exact values:

```ts
const life = Math.floor(75 * 365.25)
const today = new Date().getDay()
const age = Math.floor((31 * 365.25 + 6 * 30.5 - 10) / 7) * 7 + today - 1
const months = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]
```

Use this exact hash for hover and custom-dot colors:

```ts
function hash(n: number) {
  n = Math.imul((n >>> 16) ^ n, 0x21f0aaad)
  n = Math.imul((n >>> 15) ^ n, 0x735a2d97)
  return (((n >>> 15) ^ n) >>> 0) / 0x100000000
}
```

## Exact Numbers

- grid gap `8px`
- tooltip width `220px`
- tooltip padding `8px 16px`
- tooltip border radius `6px`
- tooltip offset `pointerX - 110px`, `pointerY - 36px`
- body background `#22272e`
- empty block color `hsl(214, 13%, 25%)`
- filled block color `#39d353`
- current-day color `#006d32`
- final day color `red`
- left block radius `[99, 0, 0, 99]`
- right block radius `[0, 99, 99, 0]`
- full pill radius `[99, 99, 99, 99]`
- `countX` must always be a multiple of `7`
- for a `1200x900` viewport: `countX = 182`, `countY = 151`, `gridTop = 4`, and canvas width is about `1075.13px`

Use this exact layout math:

- `gridSizeX = viewportWidth - gridGap`
- `gridSizeY = viewportHeight - gridGap`
- `blockSize_ = (life * sqrt((4 * life * gridSizeX * gridSizeY + (7 * gridSizeY) ** 2) / life ** 2) + 7 * gridSizeY) / 2 / life`
- `countX = floor((gridSizeX / blockSize_) / 7) * 7`
- `countY = ceil(life / countX)`
- `blockSize = gridSizeY / countY`

## Fragile Truths

- the demo is canvas-first; do not replace it with one DOM node per day cell
- full past weeks and full future weeks collapse into 7-day pills, but the current week renders one day at a time
- hovering the age cell shows a disabled tooltip like `You're 31, born in June` and sets the cursor to `move`
- hovering the final day shows a disabled tooltip `Good bye`
- hovering a normal cell shows cursor `pointer` and no tooltip until clicked
- clicking a normal cell toggles a custom dot at that index
- the selected custom dot shows an enabled focused input whose value persists in `localStorage`
- reloading should restore both `customDot` and `customDotValue`
- clicking the same selected custom dot again clears `customDot` but keeps `customDotValue`
- hit testing uses the current grid geometry and returns `null` outside the canvas bounds

## Picture

```txt
[week pill][week pill][today week split into 7 cells][week pill][week pill]
```

## Tests Must Prove

- pure grid-metric math, including the `1200x900` geometry snapshot
- pure hit testing from pointer position to day index or `null`
- browser-backed `hover-tooltips` scenario for age cell and final day tooltip behavior
- browser-backed `custom-dot-cycle` scenario covering click, edit, reload, and toggle-off persistence
- the report reaches `ready` for both browser-backed scenarios
