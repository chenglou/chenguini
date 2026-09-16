# Scrolling

This doc details as much as we know about scrolling on the web, so that folks don't trip on its longstanding pitfalls when trying to programmatically scroll and preventing scroll.

## Scroll Rubberbanding (Elastic Bounceback)

iOS, macOS and a few other platforms produce a pleseant bounce effect when a container scrolls past its bounds, to indicate the end of the content. This is a large, silent differentiator in making your app feel native, and a large, silent reason why a vocal minority dislikes Electron and other non-native apps. This UX, along with the now-famous "green bubble" effect, is one of the many premium-feeling Apple subtleties one has to familiarize themselves with in order to cross the chasm for Apple platform adoptions, especially when your app differentiates itself through premium feels.

Safari, Firefox and Chrome (since 145) all do rubberbanding on page and container scrolling.

Fixed elements don't always rubberband with the page. Chrome keeps fixed elements pinned during page rubberbanding; Safari and Firefox move them with the page. So a fixed nav can peek through during a top bounce in Chrome, but move along with the rest of the page in Safari/Firefox.

## Scroll Value & Quirks

`scrollTop` and others properties are the primary ways to get the content's scroll position. However:

1. The scroll event is fired asynchronously; by the time your JavaScript executes and you read `scrollTop`, the actual scroll position has already changed. Most hacky scroll logic assume the change isn't too bad and side-step this through design. \*
2. Despite rubberbanding, you can't programmatically set scrolling to a negative value to simulate scrolling past the beginning/end of content.
   Reads are different: while rubberbanding, `scrollTop` can report a position past either end. So don't clamp a target to [0, max] and scroll to it in such a frame, or every frame pulls the content back and the bounce jitters. The browser clamps writes itself.
3. The scrolling value can be a floating point, but the `scrollTop` exposed to us is rounded. Safari rounds down to an integer (`1.6` → `1`, `10.9` → `10`). Chrome and Firefox round to the nearest device pixel: at devicePixelRatio 2, to the nearest `0.5` (`1.4` → `1.5`, `10.2` → `10`, `10.75` → `11`), and at devicePixelRatio 4, to the nearest `0.25`. Headless Chromium rounds to whole pixels instead, whatever the devicePixelRatio. \*\*
4. Setting `scrollTop` to the same value doesn't trigger a scroll event, where "same" means the same read-back value: an assignment fires one event exactly when the read-back value changes. E.g. setting `10.6` then `10.9` doesn't fire a second event on Safari (both read `10`), but does on Chrome and Firefox at devicePixelRatio 2 (`10.5`, then `11`). This also means that programmatically scrolling smoothly over time is janky, as we're setting a scroll value that's a coarser than what the browser natively does.
5. Scroll event's source can be: user scroll, dragging the scroll bar, pressing space/up/down, dragging in an item and auto scrolling, tabbing, programmatic, etc. There's no way to disambiguate them; if e.g. you're scrolling programmatically, you can set a state like `programmaticScroll = true`, call `scrollTo`, then in the scroll event check `programmaticScroll`. But this doesn't mean a native user scroll didn't happen!
6. Careful that the max `scrollTop` value, on some platform UIs, is influenced by, say, the presence of a horizontal scrollbar, since that might or might not take permanent space.
7. Programmatic scrolling (`scrollTo`, `scrollTop =`, `scrollIntoView`, `window.scrollTo`) never fires the scroll event synchronously, not even from inside a click handler. The event arrives after the handler and its microtasks finish, in the next rendering update, before that update's `requestAnimationFrame` callbacks. A `setTimeout(0)` queued in the handler may run before or after it, depending on the browser and the input. Calling `scrollTo` from inside a scroll handler fires the next scroll event one frame later, for any target in the same document, even cross-container. Scrolling a same-origin iframe from the parent's scroll handler is the exception: Firefox and Safari fire the iframe's event in the same rendering update, Chrome one frame later. With `behavior: 'smooth'`, the first event comes a frame or two later. (Measured in Chrome 153, Firefox 155 and Safari 26.5 on macOS.)

\* In fact, on certain platforms, such as macOS and iOS, JavaScript's execution is capped to 60fps (lower in certain cases, e.g. after some touches, low battery mode, etc.) while native scrolling happens at potentially 120fps, on GPU. So by the time JS reads that `scrollTop`, it might be way late. This means many things: you can't reliably prevent position-based scrolling in JS, can't reliably sync up other items' position with scroll position in JS, etc.

\*\* This means preferrably, only _read_ `scrollTop` and don't use it to set a new scroll position. This is almost unavoidable for scroll anchoring, as you'd need the current `scrollTop`, the delta to adjust, then do `scrollTo({top: scrollTop + delta})`. Notice that if `delta` is some floating point, you'll end up with some anchor jitter if the user resizes browser smoothly/continuously, as the final scroll value is rounded or truncated and would keep jitter. E.g. continuously resizing might nudge the anchor lower and lower. Scroll Anchoring below keeps that from adding up by measuring from where the anchor was picked instead.

## Other Considerations

The scroll physics on various platforms, especially Apple, are intricate. For example, the scroll momentum accelerates the more you scroll. Compare that to Chrome's emulated scrolling, which doesn't.

If you try to reproduce the scrolling physics, you'd usually fall short (e.g. early React Native, Flutter, Zynga scroll). To this day there are only a handful of apps that reproduce them almost perfectly: Facebook Paper (RIP), Reeder, Chrome, etc.

## Use-Cases

Despite all this, some effects are only possible through programmatic manipulation of scrolling:

- Occlusion culling/virtualization, where we read `scrollTop` and determine only the elements that need to be shown on screen. `IntersectionObserver` is the usual proposed alternative, but it's also capped at JS framerate (see earlier) and is a bit yuckier in terms of API architecture, among other flaws.
- Scroll anchoring, where we keep a certain element stable while resizing container, when things above and below potentially change size and jitter said element around otherwise. `overflow-anchor` isn't yet a satisfying solution (no Safari support, etc.).
- Rendering to canvas, where you're reading `scrollTop`from a transparent DOM container somewhere else in order not to recreate your own scrolling logic. Keep in mind the `scrollTop` quirks above. You can try keeping an old & new `scrollTop` value and interpolate between them into a smoother one.
- Scroll position restoration across page changes.

## Scroll Anchoring

When content above the viewport changes (new items prepended, elements resizing), the visible items shift. Scroll anchoring compensates by adjusting `scrollTop` by the delta, keeping visible content stable.

The clean pattern (used in [chenglou.me](https://chenglou.me), demo: [`demos/scroll-anchor`](../demos/scroll-anchor/index.ts), resize demo: [`demos/photo-gallery`](../demos/photo-gallery/index.ts)):

1. Read `scrollTop` once at the start of each render/frame.
2. Compare to the stored value from last frame. If different → user scrolled → pick a new anchor (first item below `scrollTop`, or the last item if none is). If same → data changed → keep the old anchor. The anchor keeps its screen offset, `anchor.screenY`: its y minus `scrollTop` when it was picked, measured against the read-back value from step 5.
3. Compute layout. When the anchor item is encountered, `adjustedScrollTop = currentY - anchor.screenY`. Keep `screenY` until the user scrolls. If the user scrolled, return the new anchor's id and y instead, e.g. `{id, y: currentY}`. Only scroll when the anchor's y in this frame's layout differs from its y in last frame's layout, as on a resize. If its y didn't change, it's already where it was on screen, so leave `scrollTop` as read.
4. After all DOM writes, `scrollTo(adjustedScrollTop)` if it changed. Make sure to use `behavior: 'instant'` to avoid wrong smooth scrolling
5. After `scrollTo`, read back `container.scrollTop` once and store it for the next frame's comparison. Treat this as a deliberate layout-forcing read: keep it at the end of the effect and don't do more DOM writes after it. If you request `10.6` but the browser exposes `10` or `10.5`, storing `10.6` makes the next render see a false mismatch. Measure a newly picked anchor's `screenY` against this read-back value, e.g. `{id, screenY: y - storedScrollTop}`, so a rounded or clamped scroll doesn't skew where the anchor sits on screen.

This requires no flags or workarounds because each frame processes all accumulated state changes independently — `scrollTo` from frame N is fully resolved by frame N+1.

Remaining limitation: continuous resize with fractional layout values still causes sub-pixel anchor jitter from `scrollTop` rounding (point 3 footnote). This is a fundamental browser limitation, but the jitter doesn't add up over frames, because every frame starts from the `screenY` measured when the anchor was picked. The delta formula `adjustedScrollTop = scrollTop + (currentY - anchor.prevY)` starts every frame from the rounded `scrollTop` instead, so the rounding adds up: the anchor drifted 3 to 4px over a 15-step continuous resize in Safari and headless Chrome.

For scroll anchoring, don't infer user scroll from whether a scroll event fired. Programmatic `scrollTo` also fires scroll events, so a "scroll happened" flag can mistake our own anchor adjustment for user input. Use the stored read-back value from step 5 for the next render's comparison.

### React 18+ Pitfall

React 18's automatic batching can merge a scroll event's `setState` with unrelated data `setState` into one render. If your scroll handler sets an `onScrolled` flag to distinguish "user scrolled" from "data changed," the batched render sees `onScrolled = true` _and_ new data simultaneously — skipping anchor adjustment while items shifted. Demo: [`demos/scroll-anchor/scroll-anchor-react-bug.html`](../demos/scroll-anchor/scroll-anchor-react-bug.html).

The same value-comparison pattern from step 2 above works under React, avoiding the flag entirely:

- **`storedScrollTop` ref**: in the scroll handler, only `forceUpdate` if `scrollTop !== storedScrollTop`. Programmatic `scrollTo` produces the same value we stored → handler skips → no extra render. User scroll produces a different value → `forceUpdate`. Even if React batches a data `setState` with a skipped scroll event, the render computes `userScrolled = scrollTop !== storedScrollTop` → `false` → anchor adjustment runs correctly.
- **`storedScrollTop` read-back**: in `useLayoutEffect`, always store `container.scrollTop` after any `scrollTo` (same as step 5 — the read-back, not the requested value). This naturally handles browser truncation (points 3–4).
- **`scrollAnchor.screenY`**: set a new anchor's `screenY` in `useLayoutEffect`, after the read-back. An adjustment scrolls to `y - screenY` and doesn't change the anchor, so there's nothing to refresh after an adjustment, and no delta to double-count when renders fire in quick succession (e.g. rapid data updates).

None of these adaptations exist in a manual render loop architecture because events don't carry state; they just schedule renders.

### Less Preferred Alternatives

- **CSS `overflow-anchor`**: native, but lacks Safari support.
- **Padding adjustment**: instead of `scrollTo`, reduce a preallocated top spacer (e.g. padding-top) by the delta. Content stays put, `scrollTop` doesn't change, no scroll event fires — sidesteps the entire detection problem. Downside: scrollbar thumb visually jumps, and the accumulated padding offset complicates virtualization.
- **ResizeObserver above the anchor**: observe height changes of content above the anchor element, adjust `scrollTop` in the callback. More precise when existing elements resize unpredictably, but unnecessary when items have deterministic heights and layout is recomputed every frame.

## Recreate Apple Scroll Physics

**Again, highly disrecommended**. But if you're gonna try (don't), might as well try properly.

iOS and macOS' scrolling physics have changed over time, but nowadays settled. The original scrolling decay & rubberbanding were done by Bas Ording on Macromedia Director, with roughly `0.99` multiplier per 1 milisecond (yep) for decay velocity and a series of exponentials for rubberbanding (**not a spring**). The implementation's [here](https://github.com/grp/XNAnimation/blob/508e6aa093765c214500ef022e4f34f3ea5653c0/Animations/XNScrollView.m).\* An idiomatic spring physics during rubberbanding would be more elegant & correct, but would feel slightly off vs folks' decade-long expectations.

\* [Related link](https://gist.github.com/originell/6961057).

## The Case For Main Thread Scrolling

The reason why browsers give you wrong & async `scrollTop` values is because, for smoothness, scrolling happens off-main-thread, separated from JS, so that userland JS doesn't jank scrolling. This approach made bad webapps not too bad, at the invisible, and (imo) heavy cost of:

- Preventing userland innovation on scroll-driven effects
- Causing folks to wrongly assume that `scrollTop` is correct, and make bad UI/UX using it anyway
- Causing standard committee to add a tremendous amount of hard-coded scroll effects in CSS, most of which only cater to particular scroll-driven effects.

This is the equivalent of standardizing fixed shader pipeline for WebGL/WebGPU, where standard decides what shapes you get to make, and how. For scrolling, the web's too far gone to fix this, but hopefully this serves as a lesson for future APIs.

## Safari Scroll Container Quirk

On iOS Safari, a total height of roughly >500000px can crash the browser. To repro, make such a page and drag the scrollbar non-stop for a while (easier to crash on >1M px. Even tapping the header to go back to top can trigger it).

On iPad Safari, elements positioned outside the viewport (e.g. a horizontal carousel extending past viewport width) aren't properly clipped by `overflow: hidden` on `<body>` in all cases. The fix is to use `contain: layout` + `width: 100vw` + `height: 100vh` on body, turning it into the scroll container. This means:

- Read scroll via `document.body.scrollTop` / `document.body.scrollLeft` (not `window.scrollY` / `window.scrollX`)
- Programmatic scroll via `document.body.scrollTo(...)` (not `window.scrollTo(...)`)
- Scroll event listener needs `{ capture: true }` to catch body scroll events

Detect Safari: `navigator.userAgent.includes('Safari') && !navigator.userAgent.includes('Chrome')` (Chrome's UA also contains "Safari").

## Scrollbar Room

Overlay scrollbars never take room: macOS set to "When scrolling" (or "Automatically" with a trackpad), iOS, Android, and Firefox on Windows 11 and Linux by default. Hovering only thickens how they're drawn. Classic scrollbars take about 15px: macOS set to "Always" (or "Automatically" with a mouse without gestures), Chrome on Windows and Linux whatever the OS setting, Firefox on Windows 10. A page that sizes `::-webkit-scrollbar` gets room-taking scrollbars in Chrome and Safari even where they would overlay. Classic scrollbars move content whenever that room changes:

- The box starts or stops overflowing: content grows or shrinks, the window resizes, a horizontal scrollbar appears and takes height, or `overflow: hidden` goes on or off (e.g. opening a modal, or an element going fullscreen). Centered content moves by half a scrollbar, and full-width inner scrollers lose the room too.
- The scrollbar itself changes: the OS switches between overlay and classic live (settings, or plugging in a mouse under "Automatically"; open pages get laid out again), browser zoom changes (a native scrollbar keeps its device pixels, so at 200% it takes 7.5 CSS px), or CSS changes `scrollbar-width` or `::-webkit-scrollbar`, including a different width under `:hover`.

No window `resize` event fires when a classic scrollbar appears, disappears or switches style. `visualViewport`'s `resize` fires for the page's own scrollbar (a frame late in Chrome); ResizeObserver fires before paint.

`html { scrollbar-gutter: stable }` reserves the room from the start without painting anything, keeps it under scroll locks, and overlay scrollbars ignore it. `overflow-y: scroll` reserves it too, but paints an empty track on short pages, and a lock that sets `overflow: hidden` on `html` replaces it. Neither survives a live overlay/classic switch or zoom; only hiding scrollbars (`scrollbar-width: none`) does.

With a stable gutter:
- Read the width from `document.body.clientWidth`. Chrome's `documentElement.clientWidth` reports the full width until a scrollbar is drawn (ui.md, Layout).
- Content centers in the room left of the gutter, so with classic scrollbars it sits half a scrollbar left of the window's center, even on short pages. `scrollbar-gutter: stable both-edges` reserves both sides and centers on the window, for one more gutter of width.
- The gutter width is `window.innerWidth - document.body.clientWidth` (with no body margin).
- `100vw` includes the scrollbar in Safari and Firefox; size containers with `100%`.
- `@media` widths include the scrollbar in Chrome and Firefox (Safari leaves it out) and `clientWidth` doesn't, so a JS breakpoint and a CSS one with the same number can disagree by a scrollbar. Decide each breakpoint in one place.

For an inner scroller, read its own `clientWidth` and give it `scrollbar-gutter: stable`.

## Overflow-X

When positioning elements horizontally outside the viewport (e.g. a 1D carousel), set `overflow-x: hidden` on `<body>`. Without it, the browser adds a horizontal scrollbar. This is easy to forget because `overflow-y: auto` doesn't imply `overflow-x: hidden`.

## Miscellaneous

- Avoid `overscroll-behavior: none` if you can, since it disables rubberbanding.
- Prefer `overflow: clip` over `overflow: hidden` when you only need visual clipping without scroll behavior. `clip` is lighter — it doesn't create a scroll container, and is slightly more performant. (Neither `clip` nor `hidden` creates a stacking context.) Use `hidden` only when you actually need the element to be a scroll container (e.g. for programmatic scrollTo).
