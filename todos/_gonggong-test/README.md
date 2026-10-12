# GalleryGongGong standalone demo

2-column image gallery with spring-animated lightbox transitions and touch gesture support. React-wrapped but uses imperative DOM layout internally.

## Setup

```
bun init -y
bun add react react-dom @types/react @types/react-dom
bun build main.tsx --outfile bundle.js
python3 -m http.server 8767 --bind 0.0.0.0
```

Open http://localhost:8767/index.html

## Files

- `GalleryGongGong.tsx` — the component. React-wrapped but imperative DOM layout inside. Uses `translate3d` positioning, spring physics for lightbox transitions, touch drag with scroll locking
- `MidUI.ts` — spring physics engine (`spring`, `springStep`, `springMostlyDone`), math helpers (`center`, `fit`, `insideInclusive`, `lessEqual`)
- `Layout.ts` — responsive layout breakpoints (`navAndContainer`). Uses `MidUI.ts`
- `stubs.ts` — mock types and data standing in for the component's dependencies (`ImagineJobData`, `getJobImageUrl`, fake jobs with picsum.photos URLs)
- `main.tsx` — entry point, renders `<App>` → `<GalleryGongGong>` with fake data
- `index.html` — loads Tailwind CDN (component uses utility classes) + bundle.js

## Notes

- Requires Tailwind — the component uses classes like `absolute`, `overflow-y-scroll`, `object-cover`. Without Tailwind the page renders blank with no errors
- Click/tap an image to open lightbox. In lightbox: swipe horizontally to navigate, swipe vertically to dismiss, tap to dismiss. Escape key also dismisses
- The `center()` call on line 348 passes 4 args but `center()` in `MidUI.ts` only takes 2 — this means lightbox vertical centering ignores the top/bottom padding args. Doesn't break anything visually
- `containeeSizeY` calculation (line 758) overestimates scroll height, causing blank space at bottom
