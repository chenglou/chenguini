# Image

Sizing: careful that max-width being set to 100% (e.g. tailwind global reset) means setting image's css width vs using scale3d don't always end up with the same width

Async decoding might not necessarily help

Lazy decoding is better substituted with proper occlusion culling ("virtualization")

You can ensure the image doesn't partially decode and render if you control the rendering yourself:

```ts
const img = new Image()
// `onload` (only) means the bytes are downloaded
img.onload = () => img.decode().then(() => { /* decoded, aka now safe to paint atomically */ })
img.src = url
```

Prefer `<img>` over `<div>` with `background-image`
- People used `background-image` for easy `background-size: cover` and centering. `object-fit: cover` and `object-position` on `<img>` do the same thing now.
- `background-image` silently swallows load failures — you end up writing a `new Image()` preload just to detect errors. You also lose `decode()`, `onerror`, `srcSet`, and native long-press save on mobile
- Dragging an `<img>` triggers Chrome's native image drag (opens a side panel). Fix: set `draggable={false}` on the `<img>` and put the drag handler on a parent wrapper that drags a data structure instead of a URL.
- For stacking images (low-res behind high-res, poster frame behind `<video>`), use two absolutely-positioned `<img>` elements instead of multiple `background-image` layers.
