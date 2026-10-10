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
- On desktop Chrome and Safari, mouse movements while a native context menu is open may be delayed until the menu closes. Chrome may then deliver a few buffered `mousemove` events out of `event.timeStamp` order, so the last event delivered can contain an older pointer position. In our Safari test, the delayed events remained in timestamp order.
- TODO: check `touchmove` behavior
- (Not a bug, just a warning) when scrolling, a container's `pointermove`/`touchmove`/`mousemove` obviously don't always trigger; some stored `event.offsetX/Y` (coordinates local to container) would be stale
- pointer values can exceed document bounds, thus have legal negative values
- On page load, there's no way to render a first cursor state.
- Font size on inputs must be >= 16px, otherwise iOS Safari auto-zooms the viewport on focus. To have smaller input without the zoom, you can set it at 16px then scale down with CSS

## Timing

Events contain a `timeStamp` property, the time when the event occurred. Use this over `performance.now()` and others, when relevant event-related calculations are involved. Refer to [FrameScheduling.md](FrameScheduling.md) for more details on timestamps.

Browsers round `timeStamp`, same as `performance.now()`: to 1ms in Safari and Firefox and to 0.1ms in Chrome. On a cross-origin isolated page (https or localhost, served with the headers `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp`) the rounding is 20µs in Safari and Firefox and 5µs in Chrome. E.g. an iPhone scans a finger every 4.17ms, so in Safari two touch events one scan apart read as 4 or 5ms apart, unless the page is isolated.

## Pointer Coordinates

`clientX/Y` = viewport-relative. `pageX/Y` = document-relative (includes scroll offset).

- **Click/hover** (scroll may change between events): use `clientX/Y`. Convert to document-local for hit testing: `pointerXLocal = clientX + scrollX`.
- **Drag tracking** (container has no scrolling): use `pageX/Y`. These stay stable in document space across frames.

Use an event's own coordinates for behavior caused by that event. E.g. hit-test a click with its `clientX/Y`, rather than a stored pointer position that a delayed `mousemove` may overwrite.

```ts
// click/hover: store viewport-relative, convert when needed
if (st.events.click != null) {
  const clickXLocal = st.events.click.clientX + scrollX
  const clickYLocal = st.events.click.clientY + scrollY
  // use clickXLocal/YLocal for click hit testing
  pointer.x = st.events.click.clientX
  pointer.y = st.events.click.clientY
}
if (st.events.mousemove != null) {
  pointer.x = st.events.mousemove.clientX
  pointer.y = st.events.mousemove.clientY
}
// for hover hit testing against absolute-positioned elements:
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
let pointer = [] // circular buffer, keep last ~20
// On move: pointer.push({x: e.clientX, y: e.clientY, time: e.timeStamp})
// On release, with now = the release event's timeStamp:
let vx = 0
if (pointer.length > 0) {
  const last = pointer[pointer.length - 1]
  let i = pointer.length - 1
  // last ~100ms. Stop at the oldest sample when every sample is recent, e.g. 20 samples from a 240Hz pen
  while (i > 0 && now - pointer[i].time <= 100) i--
  const dt = now - pointer[i].time
  if (dt > 0) vx = (last.x - pointer[i].x) / dt * 1000 // px/s
}
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
