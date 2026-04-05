# Input

## Quirks

- no `touch` events fire on desktop (with mouse/trackpad at least. Not sure about touch screens)
- `pointerdown`'s by spec faster than `mousedown`, by ~1ms on desktop Safari, <1ms on Chrome, and **~100ms** on iOS Safari. On iOS Safari, `pointerdown` fires at the same time as `touchstart`
- `pointerup`'s by spec faster than `mouseup` and `click`, by ~1ms on desktop Safari, <1ms on Chrome, and **~40ms** on iOS Safari. `click` slightly trails `mouseup` by ~1ms on all browsers. On iOS Safari, `pointerup` fires at the same time as `touchend`.
- On desktop, on the first left click when dismissing context menus, none of `pointerup`, `mouseup`, `click` and `touchend` fire
- On desktop, right click to open context menu triggers `pointerdown` and `mousedown`, but not `pointerup`, `mouseup` and `click`
- `pointerup`, `mouseup`, and `click` aren't fired on iOS Safari when finger down -> pan -> finger up. Only `touchend` fires. All 4 fire for regular tap. On desktop, all of the first 3 fire after pan (but not `touchend` ofc, unless it's a touch screen desktop, but that's untested).
- `pointerup` _is_ fired (but not `mouseup` or `click`) when finger down -> panning a native iOS Safari scrollbar
- `mousedown` (!) and `click` don't fire on iOS Safari when finger down -> pan -> finger up, on both regular elements and scrollbar
- on iOS Safari, `mouseup` and `click` don't fire on window-level, unless they're bubbled up from some other element
- pointer coordinates are rounded/truncated to integers on iOS Safari, and sometime, by heuristics, even less precise. This, along with throttled frame rate, explains why most webapps don't feel smooth on iOS vs their native counterparts.
- `pointermove` doesn't work on android (TODO: re-verify)
- TODO: check `mousemove` and `touchmove` behaviors
- (Not a bug, just a warning) when scrolling, a container's `pointermove`/`touchmove`/`mousemove` obviously don't always trigger; some stored `event.offsetX/Y` (coordinates local to container) would be stale
- pointer values can exceed document bounds, thus have legal negative values
- On page load, there's no way to render a first cursor state.
- Font size on inputs must be >= 16px, otherwise iOS Safari auto-zooms the viewport on focus

## Timing

Events contain a `timeStamp` property, the high-precision time when the event occurred. Use this over `performance.now()` and others, when relevant event-related calculations are involved. Refer to [FrameScheduling.md](FrameScheduling.md) for more details on timestamps.

## Pointer Coordinates

`clientX/Y` = viewport-relative. `pageX/Y` = document-relative (includes scroll offset).

- **Click/hover** (scroll may change between events): use `clientX/Y`. Convert to document-local for hit testing: `pointerXLocal = clientX + scrollX`.
- **Drag tracking** (container has no scrolling): use `pageX/Y`. These stay stable in document space across frames.

```ts
// click/hover: store viewport-relative, convert when needed
if (st.events.click != null) {
  pointer.x = st.events.click.clientX
  pointer.y = st.events.click.clientY
}
if (st.events.mousemove != null) {
  pointer.x = st.events.mousemove.clientX
  pointer.y = st.events.mousemove.clientY
}
// for hit testing against absolute-positioned elements:
const pointerXLocal = pointer.x + scrollX
const pointerYLocal = pointer.y + scrollY
```

## Drag Interactions

See quirks at the beginning of the doc, when you craft drag interactions.

### Pinning Springs During Drag

During active drag, **set both `pos` and `dest`** on the dragged element's springs:

```js
d.x.pos = d.x.dest = dragX
d.y.pos = d.y.dest = dragY
```

This pins the spring to the cursor (no springy lag). On release, the layout pass sets `dest` to the snap-back target, and the spring animates `pos` → `dest`.

### Velocity Estimation (TODO: re-verify with gesture-flick-snap-target demo)

For flick/throw gestures, estimate velocity from recent pointer history:

```js
let pointer = [{x: 0, y: 0, time: 0}] // circular buffer, keep last ~20
// On move: pointer.push({x, y, time: performance.now()})
// On release:
let i = pointer.length - 1
while (i >= 0 && now - pointer[i].time <= 100) i-- // last ~100ms
let vx = (pointerLast.x - pointer[i].x) / (now - pointer[i].time) * 1000 // px/s
```

### Z-Index During Drag & Release

For drag interactions, depth usually wants 3 bands:

- the actively dragged item above everything
- the just-released item still above the rest while it animates back
- the remaining items in their stable order underneath

Don't drop the released item back into normal z-order on `pointerup`. The snap-back looks wrong.

```js
function cardZIndex(cardId) {
  if (draggedCardId === cardId) return 300
  if (draggedCardId == null && lastDraggedCardId === cardId) return 200
  return 10 + orderedCardIds.indexOf(cardId)
}
```

Then clear `lastDraggedCardId` once that item's x/y/scale are all basically settled.

### CSS for Drag

```css
user-select: none;         /* prevent text selection during drag */
-webkit-user-select: none;
overflow: hidden;           /* prevent accidentally dragging the viewport on iOS */
```
