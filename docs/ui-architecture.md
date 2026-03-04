## UI Architecture

See [FrameScheduling.md](FrameScheduling.md) for the render loop structure, event consumption timing, and timestamps.

## State Management
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

DOM is mutative, imperative, and slow. So against our general guideline of simplicity, we make an exception and create a caching layer for it. The DOM should be a pure projection of state, not part of it (this keeps state immutable and rewindable without troublesome mutable references mixed in), just like React. Except in our case it's introspectable for a bit more expressivity.

### DOM Reads

Use `document.documentElement.clientWidth` and `document.documentElement.clientHeight` for viewport dimensions. Do NOT use `window.innerWidth` / `window.innerHeight` — those include scrollbar width and behave differently under Safari pinch zoom (they change during zoom, `clientWidth/Height` don't). `visualViewport.width/height` also changes during pinch zoom.

For pointer coordinates, see [Input.md](Input.md) (`clientX/Y` vs `pageX/Y`, coordinate space conversion, drag patterns).

### DOM Interleaving

Repeated DOM read & write is catastrophic for performance ([source](https://gist.github.com/paulirish/5d52fb081b3570c81e3a)). It's not always avoidable (especially when there's need for text measurement as part of layout logic before render), but keep to them a strict minimum.
For easier reasoning & testing, pass the read DOM values to helper functions instead of having said helpers read from DOM. And definitely avoid having helpers mutate DOM, when possible.

### DOM Writes

**Everything that touches DOM properties is a DOM write** — not just element content and transforms, but also `body.style.cursor`, `body.style.overflowY`, dummy element heights, etc. These all belong in the DOM writes phase. A common mistake is setting `document.body.style.cursor` during layout computation — instead, compute the cursor value as a local variable during layout, then assign it to the DOM in the DOM writes phase.

React did it right with its idempotent JSX. Treat the DOM writes section of the render loop as essentially JSX as much as possible. For example, avoid partial mutations like `node.classList.add('foo')` and `node.classList.remove('foo')`. Assign the entire classes string at once. Use ternary, and when if-else are needed ensure they touch the DOM structure the same way:

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

If a property's dynamic (managed by JS), *own it fully in JS*. Don't do a partial thing where some default value's set in CSS, then overridden with JS or classes sometime. Avoid implicit property inheritance from your CSS.
In fact, in theory, class toggling should be reserved ideally only for when both classes have the same set of properties, like a struct (**note**: This is experimental advice. If you see strong counterpoints, please say so)
I.e. it's better to do `node.style.display = condition ? 'block' : 'none'` than have a `.hidden` class that sets `display: none` and toggle it; it's more "functional" and avoids chasing after implicit overrides.

### domCache

The `domCache` lives outside state and can be a `Map`, an object, an array, or whatever heterogenous shape suits the rendering needs. Don't hesitate to restructure the shape — we're counting on AI being able to refactor fast to the next best shape given changed requirements.

Comment each `domCache` ite with its **cache lifetime**. Change them when the requirements change:

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

## Layout

JS-based layout & positioning isn't as scary as you'd think. It enables JS animations, easy occlusion culling (virtualization in web speak), cooler layouts, etc. For example, for images, a demo here can check the area of each image (instead of just width or height), and adjust it to be more pleasant, e.g. same-ish size relative to other neighbor images.

Do heavily borrow from shader/pytorch/vector primitives, e.g. vec2/3/4 (either as xyzw object or array), the pseudo-randoms above, remap, clamp, fract, step, length, etc.

For JIT DOM creation with variable-height content: **never** use estimated heights for unmeasured rows. Use a tight **lower bound** bigger than 0. This guarantees you never miss rendering a visible row.

## Hit Testing

Manually managed layout means we can do simple hit testing by iterating through the relevant element's bounding boxes and check containment; UI's simple enough to not even need generic binary space partitioning.

Here's a trick: When animated elements have both a current position (`pos`) and a target position (`dest`), you can hit test against `dest`, the stable target, instead of the moving `pos`. This prevents mis-clicks on moving elements and allows rapid repeated clicks (e.g. Safari rapid tabs close). Of course, you can still use `pos` for e.g. drag targets, so hit areas follow the animation (e.g. a draggable card should be grabbable at its current visual position).

**Note**: the hit testing pointer and an item's positions *must* be in the same coordinate space. E.g., for the content of a scroll view, convert the pointer to content space: `pointerYLocal = pointerY + scrollTop`.

## Branching (TODO)

Care about latency over throughput. Fewer branches
