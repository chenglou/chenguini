# Input

## Events Handling

Traditional webapp patterns recommend putting your event handling logic right inside the event callback

```tsx
function handleClick(e) {
  /* everything here */
}
;<div onClick={handleClick}> ... </div>
```

This is convenient for simple cases, built around the assumption that events are:

- sparse (happens only once in a while)
- precise (e.g. a mouse click on some exact pixel position)
- discrete (a click's a click; no input's _dragged_ out over time)
- rarely concurrent (e.g. no other input happens while mouse is down)

As event handling requirements grow, you can refactor to such pattern:

```ts
const events = {
  pointerdown: null,
  keydown: null,
}
window.addEventListener('pointerdown', (e) => {
  events.pointerdown = e
  scheduleRender()
})
window.addEventListener('keydown', (e) => {
  events.keydown = e
  scheduleRender()
})

function scheduleRender() {
  if (renderAlreadyScheduled) return
  renderAlreadyScheduled = true

  // ...actual render logic here.
  if (events.pointerdown) doSomething1()
  if (events.keydown) doSomething2()
  calculateSomeOtherState(events.pointerdown, events.keydown) // this is now possible

  // Then near the end, reset events after this render, or keep some if needed for the next frame
  events.pointerdown = null
  events.keydown = null
}
```

Instead of handling a particular event's logic inside its event callback, we _only_ retain the event payload (`e`), then _only_ schedule a render, then process all events holistically inside the render. For the cost of this tiny indirection, logic requiring knowing various event states at the same time (`calculateSomeOtherState`) can happen, enabling cool new UX (or cleaner code for existing UX):

- you get to order the importance of a key press relative to a concurrent (potentially conflicting) mouse click
- resolve one tap while another finger is held down
- Press a key while mouse's hovering over a special section for pro user actions
- Two directional controls on a game pad composing into a new action

This colocation of disparate events costs so little that we should default to this pattern, for easier code evolution.

## Timing

Events contain a `timeStamp` property, the high-precision time when the event occurred. Use this over `performance.now()` and others, when relevant event-related calculations are involved.

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

### Velocity Estimation

For flick/throw gestures, estimate velocity from recent pointer history:

```js
let pointer = [{x: 0, y: 0, time: 0}] // circular buffer, keep last ~20
// On move: pointer.push({x, y, time: performance.now()})
// On release:
let i = pointer.length - 1
while (i >= 0 && now - pointer[i].time <= 100) i-- // last ~100ms
let vx = (pointerLast.x - pointer[i].x) / (now - pointer[i].time) * 1000 // px/s
```

### Drag-to-Reorder

Compare cursor position against neighboring items' midpoints during drag:

```js
while (dragIdx > 0 && pointerY < data[dragIdx - 1].y.dest + data[dragIdx - 1].sizeY / 2) {
  [data[dragIdx], data[dragIdx - 1]] = [data[dragIdx - 1], data[dragIdx]]
  dragIdx--
}
```

### Z-Index During Drag & Release

See also [z-index-depth-management.md](z-index-depth-management.md) for general depth management. The dragged item needs the highest z-index. After release, it still needs to be high while animating back:

```js
zIndex = isDragged ? data.length + 2
  : isLastDragged ? data.length + 1  // still animating back to slot
  : i
```

### CSS for Drag

```css
user-select: none;         /* prevent text selection during drag */
-webkit-user-select: none;
overflow: hidden;           /* prevent accidentally dragging the viewport on iOS */
```
