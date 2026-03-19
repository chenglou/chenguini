# Input

## Timing

Events contain a `timeStamp` property, the high-precision time when the event occurred. Use this over `performance.now()` and others, when relevant event-related calculations are involved. Refer to [FrameScheduling.md](FrameScheduling.md) for more details on timestamps.

## Touch

Pointer up's slightly faster than mouseup on iOS Safari: https://x.com/_chenglou/status/1666771401729265664

Pointer coordinates are rounded/truncated to integers on iOS Safari. This, along with throttled frame rate, explains why most webapps don't feel smooth on iOS vs their native counterparts.

## Miscellaneous

- On page load, there's no way to render a first cursor state.
- `pointermove` doesn't work on android
- `pointerdown` isn't fired on Safari on the first left click after dismissing context menus
- `mousedown` doesn't trigger properly on mobile
- `pointerup` isn't triggered when pointer panned (at least on iOS), don't forget contextmenu event
- (Not a bug, but careful) when scrolling, a container's pointermove doesn't trigger; some stored `event.offsetX/Y` (coordinates local to container) would be stale
- pointer can exceed document bounds, thus have legal negative values

From some of the above points, there's no pointer event that works cross-browser that can replace mouse & touch events.

- Font size on inputs must be >= 16px, otherwise iOS Safari auto-zooms the viewport on focus

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

### CSS for Drag

```css
user-select: none;         /* prevent text selection during drag */
-webkit-user-select: none;
overflow: hidden;           /* prevent accidentally dragging the viewport on iOS */
```
