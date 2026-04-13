# Scroll Anchor Spec

Use `docs/` plus this packet only. Do not inspect `demos/` or other specs.

Read first:

1. `docs/drafts/verification.md`
2. `docs/drafts/layout-geometry.md`
3. `docs/Scrolling.md`
4. this file

State static layout facts where the helper is pure, then implement, then validate.

Build only inside the target folder the main thread gives you.

## Summary

Build a scroll anchoring demo with:

- a dark monospace page with one scroll container
- grouped day headers and colored absolute-positioned items
- buttons for `Scroll to 700`, `Add 3 above`, and `Add 1, then 2 rapid`
- one reference line across the middle of the viewport
- an info line that shows `scrollTop`, `anchor`, `prevY`, and item count

## Data

Initial items:

- `8` items for `Today`
- `1` item for `Yesterday`
- `8` items for `2 Days Ago`

Item creation:

```ts
type Item = {
  id: string
  day: string
  label: string
  color: string
}
```

Use this exact color cycle:

```ts
const colors = [
  '#c0392b', '#2980b9', '#27ae60', '#8e44ad',
  '#d35400', '#16a085', '#2c3e50', '#f39c12',
]
```

Each new item should:

- increment a counter
- get id `V<n>`
- get label `#<n>`
- cycle colors by index

## Exact Numbers

- item height `100px`
- header height `24px`
- first header gap `0px`
- later header gap `32px`
- header bottom gap `8px`
- item gap `8px`
- target scroll `700px`

## Fragile Truths

- read `scrollTop` once at the start of render
- detect user scroll by comparing current `scrollTop` to the stored read-back value from the previous frame, or by an explicit `scrollTo` event
- if the user scrolled, pick a new anchor as the first item below `scrollTop`
- if the user did not scroll and the anchor item is encountered, adjust scroll by `currentY - anchor.prevY`
- update `anchor.prevY` immediately when that adjustment is computed
- after `scrollTo`, store the read-back `container.scrollTop`, not the requested value
- rapid prepend in two quick steps should anchor correctly whether the changes land in one render or two
- only mount visible headers and items

## Picture

```txt
controls
scroll container
------------------- reference line -------------------
info
```

## Static Facts To State

- layout math for headers, item positions, and total height
- anchor picking and anchor delta adjustment logic
- product boundary: `scroll-to-700 then add-3-above` keeps the same item at the reference line
- product boundary: `add-1 then 2 rapid` keeps the same item at the reference line
- product boundary: user-scroll then prepend picks a new anchor from the new scroll position

Do not turn scroll read-back behavior into verifier evidence unless the relation is modeled in userland geometry.
