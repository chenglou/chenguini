# Depth Management

Webapps started with 2D, non-overlapping layouts and grew out of such assumption quickly. Nowadays we have hovering tooltips, modals, nested dropdowns, etc. These elements might live in different component trees but might require some centralized authority to coordinate their relative stacking order. Apps are evolving into more of a game engine with z sorting, and we should seriously attempt that rather than assigning random constants like 1, -1, 999, 9999 to different parts of the app and hope things end up overlapping correctly. Here's how we manage z-index:

## Stacking Contexts

A **stacking context** isolates z-index values. Children inside a stacking context can't z-index their way out of it - their z-index only competes with siblings inside the same context.

Stacking contexts are created by:
- `isolation: isolate` (cleanest, no side effects)
- `position: fixed/sticky`
- `transform`, `filter`, `opacity < 1`, etc.

(Of course, in a React component, the child can technically escape the parent stacking context through a Portal that brings the whole element somewhere else in the DOM. But that's a different concept.)

## Strategy

### No z-index (preferred)

DOM order is render order. Later siblings naturally render on top of earlier ones:

```tsx
<div>
  <Background />
  <Content />
  <Overlay />   {/* on top, no z-index needed */}
</div>
```

When possible, structure your DOM so stacking order matches source order. No z-index required.

### Global z-indexing (across components)

For elements that need to stack relative to other parts of the app (navbars, modals, toasts, lightboxes), centralize in a single file:

```ts
// example Z.ts
let d = 1
export const loft = d++
export const lightbox = d++
export const nav = d++
export const contextMenu = d++
export const tooltip = d++
export const modal = d++
export const toast = d++
```

```tsx
import { modal } from './z'

<div style={{ zIndex: modal }}>
```

Sequential numbering (`d++`) makes relative ordering clear and inspectable. Adding a new layer means adding a new constant in the right position.

### Local z-indexing (within a component)

When elements within a component need to stack relative to each other and DOM order is constrained (e.g. semantic or tab order), create an isolated stacking context:

```tsx
let d = 1
const below = d++
const above = d++
<div style={{ isolation: 'isolate' }}> {/* second highest */}
  <header style={{ position: 'relative', zIndex: above }}>header</header> {/* third highest */}
  <main style={{ position: 'relative', zIndex: below }}>content</main> {/* lowest */}
</div>
<div>sibling</div> {/* highest — isolation prevents header's z-index from escaping */}
```

(It's also ok to directly use constants like `1` and `2` instead of `d++` _locally_ for convenience, since nothing escapes and cross-pollutes).

**Note**: hopefully it's clear that the global `Z.ts` is just the same as how we manage component-local stacking context values, except it's at the "root" and doesn't belong to a specific root component.

### Don't

- Hardcode magic numbers: `z-index: 9999` or `z-[50]`
- Use Tailwind z-index classes for anything global (`z-10`, `z-20`, `z-50`)
- Use weird constants like 999 or 9999. You either know the order or try to figure out. Maybe once or twice as weird escape hatch values, in the global `Z.ts`, is fine for whatever hacky reason
- Mix global and local z-index values. E.g., don't import `modal` from `Z.ts` then do `const myZ = modal + 1` in your file
  - If the file's component doesn't have a stacking context, `modal + 1` might silently equal another global constant like `toast`, and if `modal` changes in `Z.ts`, your local code breaks unexpectedly
  - If the file's component has a stacking context, the global value is meaningless anyway; it's just a number competing locally. Use local values (1, 2) instead

### Gotchas

- `position: fixed` and `sticky` create a stacking context, but the element is still bounded by any ancestor stacking context. They only compete at the root level if no ancestor creates a stacking context. (This means a fixed/sticky element inside a nav that creates a stacking context — e.g. `position: relative` + `z-index: 5`, or `isolation: isolate` — is bounded by that nav, even though it's positioned relative to the viewport.)
- A parent with `overflow: hidden/auto/scroll` that creates a stacking context will clip children visually even if they have high z-index
- For DOM node A and B, both without stacking context, and where A comes syntactically before B (which means visually beneath B), setting z-index on A's child will make it correctly appear above B
- `isolation: isolate` prevents `mix-blend-mode` from blending with content outside - rarely matters for UI
