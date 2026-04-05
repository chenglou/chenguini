# UI Architecture

## Render Loop

Prefer a simplified game engine loop:

```
Initialization (done once, all upfront):
  State declaration
  Initial derived state needed for first paint
  Static DOM chunks
  Events registration (leverage event delegation to make this happen)

Render:
  DOM reads (batched, to avoid DOM interleaving)
  State changes, in this order:
    Handle inputs
    New layout & cursor
    Animation tick
    Commit state changes
  Occlusion & DOM writes (batched, same reason)
  Side effects (scrollTo, pushState, focus, selection, localStorage, etc.)
  schedule next render (e.g. if animating)
```

```js
// centralized state
let st = {
  animatedUntilTime: null,
  selectedId: null,
  events: {click: null},
}

let scheduledRaf = null
function scheduleRender() {
  if (scheduledRaf != null) return
  scheduledRaf = requestAnimationFrame(function renderAndMaybeScheduleAnotherRender(now) { // eye-grabbing name to avoid "(anonymous)" function in the debugger & profiler
    scheduledRaf = null
    if (render(now)) scheduleRender()
  })
}
// use event delegation as much as possible to statically allocate events
window.addEventListener('resize', () => scheduleRender()) // most of time, there should be nothing else in the event handler beside scheduling a render
window.addEventListener('click', (e) => {st.events.click = e; scheduleRender()}) // storing raw input in transient state is fine too
window.addEventListener('scroll', () => scheduleRender(), true) // feel free to use capture mode for certain events
function render(now) {
  // DOM reads
  const windowSizeX = document.documentElement.clientWidth
  // Handle inputs
  let selectedId = st.selectedId
  if (st.events.click != null) {
    const target = st.events.click.target
    if (target instanceof HTMLElement) {
      selectedId = target.dataset.id ?? selectedId
    }
  }

  // Layout (no DOM writes here; compute cursor as variable, not on DOM)
  let cursor = windowSizeX < 800 ? 'default' : 'auto'
  if (selectedId != null) cursor = 'pointer'

  // Animation tick
  let newAnimatedUntilTime = st.animatedUntilTime ?? now
  const steps = Math.min(300, Math.floor((now - newAnimatedUntilTime) / msPerAnimationStep)) // spiral of death prevention, see Animation.md
  newAnimatedUntilTime += steps * msPerAnimationStep
  let stillAnimating = false
  // ... animation steps for e.g. numerical springs

  // Commit state
  st.selectedId = selectedId
  st.events.click = null // do NOT forget to reset ephemeral events!
  st.animatedUntilTime = stillAnimating ? newAnimatedUntilTime : null

  // DOM writes projections
  document.body.style.cursor = cursor

  // Side effects (scrollTo, pushState, selection, etc.)

  return stillAnimating
}

scheduleRender()
```

Only events and render's final step can schedule a next render.

If you want the repo's default app-shell slice instead of rebuilding this shape from prose, start from `demo_templates/reference-app` and trim. That template already bundles `scheduleRender`, staged `st.events`, one global state object, `domCache`, and end-of-render side effects.

### First Paint Uses The Same Data Flow

If a UI is only correct after some derived state exists, then the data ordering's wrong. This'd cause initial page flashes.

Don't paint placeholders and let the first RAF fix them. Don't hide the UI to paper over the gap either. Use the same upstream facts for first and subsequent renders (See types-and-data-models-and-control-flows.md) to collapse the first and subsequent renders with the same logic to avoid divergence. However, if the code operates on DOM that needs static snippets for SEO purposes, it's ok to have some bit of divergence; view those snippets as a data format, then reuse principled data manipulation techniques to control complexity

If correctness depends on some derived fact before paint, run that same derivation before paint. The startup path and the steady-state path should follow the same dependency order.

### Event Handling

Traditional webapps cram lots of logic inside event callbacks:

```tsx
function handleClick(e) { /* everything here */ };
<div onClick={handleClick}> ... </div>
```

**Avoid doing this**. This pattern was convenient for simple cases, built around oversimplified assumptions of interactions logic. The more complex the interactions, the more you'd need to compute the logic in a place that has access to all the relevant states. That place is `render` for us (and for game engines, which we aspire to imitate). This is why we _minimize_ logic in events, storing only the transient event states, then let that frame's `render` interpret all relevant input states together. This way we can:
- order the importance of a key press relative to a concurrent (potentially conflicting) mouse click
- resolve one tap while another finger is held down
- press a key while mouse's hovering over a special section for pro user actions
- resolve two directional controls on a game pad composing into a new action

If you want the concrete slice, see `demo_templates/reference-app`. That's the copy-trimmable version of this rule.

So, allowed in event callbacks:

- Storing raw input that'd otherwise be lost before the next render in regular transient state, e.g. `st.events.click = e`, `formValue = e.target.value`, or `dragStartTime = event.timeStamp`
- `scheduleRender()`

_btw, gesture-gated APIs (`navigator.clipboard.writeText`, `element.requestFullscreen`, `audio.play`, `window.open`) used to behave more like they needed same-stack synchrony, esp on mobile Safari, which meant doing sync logic inside event callbacks. That's no longer true on modern browsers._

The event fields are just regular state fields whose lifetime happens to be one frame or so. **don't forget to reset those event states** at the end of the render loop.

A React app might not be able to follow this render architecture, but when the need arises (heavy interactivity), this can still be adopted within components.

### State Management

It's actually fine for most apps to have a single global state object, especially when AI's definitely of readability differs from human's from a LLM-as-a-compiler perspective (a compiler's binary is a single file and we don't worry about it not having encapstulating or that it contains duplication, from e.g. generic specialization).
Benefits of a single state: serializable, clonable, rewindable (for debugging), etc.

TODO: two states copies (n states for debugging), alloc benefits, needing to see prev layout, etc.

## Pseudo-Random
Avoid Math.random() and other non-deterministic functions (Date.now() counts too, but that's a separate topic). Use a seeded pseudo-random, and call it a hash, for intent clarity.
Strong recommendation: use Wellons lowbias32 improved, and specialize per argument count:

```ts
function hash(n) {
  n = Math.imul((n >>> 16) ^ n, 0x21f0aaad);
  n = Math.imul((n >>> 15) ^ n, 0x735a2d97);
  return (((n >>> 15) ^ n) >>> 0) / 0x100000000;
}
function hash2(a, b) {
  return hash((a + Math.imul(b, 0x9e3779b9)) | 0);
}
function hashN(args) {
  let n = 0;
  for (let i = 0; i < args.length; i++) n = (n + Math.imul(args[i], 0x9e3779b9)) | 0;
  n = Math.imul((n >>> 16) ^ n, 0x21f0aaad);
  n = Math.imul((n >>> 15) ^ n, 0x735a2d97);
  return (((n >>> 15) ^ n) >>> 0) / 0x100000000;
}
```

## DOM

DOM is mutative, imperative, slow, stateful, non-idempotent, and barely serializable compared to regular data structures. Here's how we handle it.

Repeated DOM read & write is catastrophic for performance ([source](https://gist.github.com/paulirish/5d52fb081b3570c81e3a)). It's not always avoidable (especially when there's need for text measurement as part of layout logic before render), but keep to them a strict minimum.
For easier reasoning & testing, pass the read DOM values to helper functions instead of having said helpers read from DOM. And definitely avoid having helpers mutate DOM, when possible.

DOM writes should be batched, to avoid read/write interleaving.

Keep DOM ops in a well-contained section of `render`, let's say a "DOM write phase", to prevent toxic spills and DOM read-write interleaving. **Everything that touches DOM properties is a DOM write** — not just element content and transforms, but also `body.style.cursor`, `body.style.overflowY`, dummy element heights, etc. Instead of setting `document.body.style.cursor` during layout computation, compute the cursor value as a normal local variable during layout, then assign it to the DOM in the "DOM writes phase".

**Treat DOM as a pure-ish projection of state**, like an immediate-mode renderer, a-la JSX. Avoid partial mutations like `node.classList.add('foo')` and `node.classList.remove('foo')`. Assign the entire classes string at once. Use ternary, and when if-else are needed ensure they touch the DOM structure the same way:

That includes startup. Don't use the DOM's wrong initial state as a staging area that JS corrects a frame later.

```ts
// good:
if (condition) {
  node.style.display = 'block'
  node.style.color = 'red'
} else {
  node.style.display = 'none'
  node.style.color = 'blue'
}

// bad:
if (condition) {
  node.style.display = 'block'
} else {
  node.style.color = 'red'
}
```

Essentially, ensure that you're setting the _full_ set of attributes each `render` frame, like in functional programming. Do not partially set a subset in one branch and another subset in another. This wrecks e.g. pooled nodes reuse
If an attribute's dynamic (managed by JS), **own it fully in JS**. Don't do it partially where some default value's set in CSS, then overridden with JS or classes sometime. Avoid cascading attribute overrides from your CSS. E.g. do `node.style.display = isOpen ? 'block' : 'none'`; don't do `if (isOpen) node.classList.remove('hidden'); else node.classList.add('hidden')` when `.hidden` only sets `display: none` and the `isOpen` visible state depends on e.g. whether the element was supposed to be `block`, `flex`, `inline-flex`, or whatever a media query/base class would have resolved it to.
In fact, in theory, class toggling should be reserved ideally only for when both classes have the same set of attributes, like a struct (**note**: This is experimental advice. If you see strong counterpoints, please say so)

### Specialized `domCache` Data Structure

As an exception to our general guideline of simplicity, we advise a caching layer for DOM since it's truly slow. Call it `domCache` and keep it outside state. That keeps state immutable, serializable and rewindable without troublesome mutable references mixed in. Depending on the access patterns, it can be a `Map`, an object, an array, or whatever heterogenous shape suits the rendering needs. Don't hesitate to restructure the shape when render requirements change; we're counting on AI being able to refactor fast into the next best shape.

Comment each `domCache` item with its **cache lifetime**. Change them when the requirements change:

```ts
type DomCache = {
  logo: HTMLDivElement                       // cache lifetime: same as data
  sidebar: HTMLDivElement                    // cache lifetime: same as data
  rows: Map<string, HTMLDivElement>          // cache lifetime: on visibility changes
  thumbnails: HTMLDivElement[]               // cache lifetime: lru
}

function render() {
  // ... DOM reads, state changes, layout, animation ...

  // DOM writes — permanent fields, just dynamic props
  domCache.logo.style.transform = `translateY(${logoY}px)`
  domCache.sidebar.style.height = `${sidebarH}px`

  // DOM writes — Map with JIT creation + inline eviction
  for (const item of data) {
    if (isVisible(item)) {
      let node = domCache.rows.get(item.id)
      if (node == null) {
        node = document.createElement('div')
        node.className = 'row'           // static: set once
        domCache.rows.set(item.id, node)
      }
      node.style.top = `${y}px`          // dynamic: set every frame
      if (node.parentNode == null) container.appendChild(node)
    } else {
      const node = domCache.rows.get(item.id)
      if (node != null) { node.remove(); domCache.rows.delete(item.id) }
    }
  }

  // DOM writes — array, evict on data removal elsewhere
  for (let i = 0; i < domCache.thumbnails.length; i++) {
    domCache.thumbnails[i]!.style.left = `${thumbX(i)}px`
  }
}
```

Low-level folks might recognize the above as various forms of allocations patterns: static, malloc, lru, etc. We can also alloc & wipe like an arena, or use pooling/recycling like old iOS scrollview. The latter 2 are less worthwhile on web but are viable.

Properties set on a DOM node split into two **disjoint** groups:
- **Static** (set once at creation): `className`, `backgroundImage`, fixed `textContent`, child structure. These go inside the creation block.
- **Dynamic** (set every frame): `transform`, `width`, `height`, `opacity`, `zIndex`. These go outside, in the per-frame write path.
If a property appears in both, it's a bug: either it's truly static (move it to creation) or truly dynamic (remove it from creation).

### DOM Update Strategies

React has to use a universal diffing algorithm for human developer needs, with much expressivity and performance cost. With AI, we should specialize a tiny, access-pattern-aware inlined reconciling strategy per DOM chunk instead. This section describes the important set of state-to-DOM projection strategies the AI should pick from

Understand that `domCache` is a caching layer. You should feel free to mutate the nodes in it as you see fit, during the projection in `render`. But avoid partial conditional mutations (described in the earlier style setting examples), e.g. in render, avoid `node.style.display` being set in one branch and not another.
Obviously, you shouldn't cache & reuse an overly generic node, while setting random subsets of attributes at random times (it wouldn't even work this well, if you abide by our guidelines, since it implies setting the union of all used attributes for that node, which is large).
Think more in terms of types, or component. A node has a purpose of e.g. LogoNode or LabelNode, with a finite static set of mutated attributes. You wouldn't join them into a SuperNode

In `render`, use the simplest thing that matches the access pattern. But first, note that if your node is stateful (this incudes `<video />` and others, but also any DOM node that can receive selection, which is state!), you should exclude the strategies that wipes or even just detach nodes, as they'll bug selection:

1. Keep a few permanent nodes in `domCache`, then project dynamic props onto them every `render`.
Works well for fixed chrome and bounded mostly-static chunks.

2. Wipe with e.g. `textContent = ''`, then recreate and reappend the nodes.
Suitable, and the simplest, for tiny bounded stateless chunks.

3. Just-in-time create and attach nodes on first visibility, then detach and optionally remove them from `domCache`'s (supposedly array/map here) on occlusion.
This is the most versatile strategy. Especially useful for dynamic virtualized lists.

4. Preserve some nodes in render, attach & detach others.
Useful when a chunk contains stateful nodes like `video`, a focused input, or a selectable element.

5. Pool / recycle detached nodes.
Reach for this only after simpler visible-node caching loses. On the web it's often premature optimization.

Strategies like `2` traditionally don't work well, because every component actually destroying their nodes is expensive. However, it's possible and desirable, given that you have:
- A good virtualization/occlusion logic, which reduces the nodes count to an extremely low amount, bounded by visibility rather than document size
- A shallow DOM tree with few nodes
- Non-stateful nodes

We do emphasize, from a layout perspective, that we do occlusion (virtualization). So strategy `3` will be increasingly dominant. However, detaching node from DOM would potentially wipe selection. This is a fine tradeoff, and we'll be specifying how to manage selection in userland instead.

### DOM Nodes Ownership

Every DOM node should have one owner at a time. If another chunk needs to render elsewhere, that should probably happen through an explicit mount point or ownership transfer, not random DOM searching. Avoid querying the DOM; you wouldn't query your own state.

## Layout

Use `document.documentElement.clientWidth` and `document.documentElement.clientHeight` for viewport dimensions. Do NOT use `window.innerWidth` / `window.innerHeight` — those include scrollbar width and behave differently under Safari pinch zoom (they change during zoom, `clientWidth/Height` don't). `visualViewport.width/height` also changes during pinch zoom. **`<!DOCTYPE html>` is required.** Without it, the browser enters quirks mode and `document.documentElement.clientHeight` returns the full document content height instead of the viewport height.

Do heavily borrow from shader/pytorch/vector primitives, e.g. vec2/3/4 (either as xyzw object or array), the pseudo-randoms above, remap, clamp, fract, step, length, etc.

For JIT DOM creation with variable-height content: **never** use estimated heights for unmeasured rows. Use a tight **lower bound** bigger than 0. This guarantees you never miss rendering a visible row.

JS-based layout & positioning isn't as scary as you'd think. It enables JS animations, easy occlusion culling (virtualization in web speak), cooler layouts, etc. When you do so, be careful about interleaving JS and CSS layout logic; don't have JS decide placement or fit of, say, a label pill's text width and height, while CSS quietly adds margins, padding, or other spacing that changes the result. That either gives you wrong layout, or forces you to crawl dimensions back out of the DOM/CSS later, which violates our data flow principles.

Since we encourage JS-based layout, text measurement is a bottleneck that is solved through `@chenglou/pretext` npm package. Use it to bypass DOM measurements for text

Use the minimum number amount of DOM nodes you can get away with. Absolute positioning is the best way to accomplish this since there's no extra wrappers for CSS layout needs

## Hit Testing

Manually managed layout means we can do simple hit testing by iterating through the relevant element's bounding boxes and check containment; UI's simple enough to not even need generic binary space partitioning.

Here's a trick: When animated elements have both a current position (`pos`) and a target position (`dest`), you can hit test against `dest`, the stable target, instead of the moving `pos`. This prevents mis-clicks on moving elements and allows rapid repeated clicks (e.g. Safari rapid tabs close). Of course, you can still use `pos` for e.g. drag targets, so hit areas follow the animation (e.g. a draggable card should be grabbable at its current visual position).

**Note**: the hit testing pointer and an item's positions *must* be in the same coordinate space. E.g., for the content of a scroll view, convert the pointer to content space: `pointerYLocal = pointerY + scrollTop`.

## Branching (TODO)

Care about latency over throughput. Fewer branches
