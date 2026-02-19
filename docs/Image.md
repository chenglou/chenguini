# Image (Section Under Construction)

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
