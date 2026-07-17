# Image

A global `max-width: 100%`, e.g. Tailwind's reset, can make CSS `width` and `scale3d()` produce different final image widths.

Async decoding doesn't necessarily help.

Prefer occlusion culling ("virtualization") to lazy decoding.

To avoid painting a partially decoded image, wait for `decode()` before rendering it:

```ts
const img = new Image()
// `onload` (only) means the bytes are downloaded
img.onload = () => img.decode().then(() => { /* decoded, aka now safe to paint atomically */ })
img.src = url
```

Prefer `<img>` over `<div>` with `background-image`
- People used `background-image` for easy `background-size: cover` and centering. `object-fit: cover` and `object-position` on `<img>` do the same thing now.
- `background-image` silently swallows load failures — you end up writing a `new Image()` preload just to detect errors. You also lose `decode()`, `onerror`, `srcSet`, and native long-press save on mobile
- Dragging an `<img>` triggers Chrome's native image drag (opens a side panel). If the page implements its own drag behavior, set `draggable={false}` on the `<img>` and put the drag handler on a parent wrapper that drags a data structure instead of a URL.
- For stacking images (low-res behind high-res, poster frame behind `<video>`), use two absolutely-positioned `<img>` elements instead of multiple `background-image` layers.

# Video

## Grids and loading

[A 2025 Chromium repro](https://issues.chromium.org/issues/434632032) showed blank regions for >2 seconds when fast-scrolling past ~12 active muted autoplay videos. This isn't a safe limit; it varies with the browser, machine, file layout, network protocol, and how quickly sources change. Large video grids may need occlusion culling (virtualization).

Pausing a video does not stop its request. If a video outside the virtualized range should release its network resources as well as stop playback, reset its resource:

```ts
video.pause()
video.removeAttribute('src')
video.load()
```

Calling `load()` matters: removing `src` does not reset the current resource on its own. If the grid must stay below an active-video limit, release inactive videos before activating their replacements. If `play()` races with this cleanup, its promise can reject with `AbortError`; handle that expected error without hiding other failures.

Don't assume a canceled video request will resume. In a June 2025 test with `206 Partial Content` responses, Chrome reused the downloaded range on the next request for the same URL, while Firefox and Safari consistently discarded it and started over.

Don't replace native video loading with `fetch()`-to-Blob caching or hand-assembled byte ranges without a measured need. `<video>` cannot use the object URL until the Blob exists, which can delay playback until the full download finishes, retain another file copy in memory, and require `URL.revokeObjectURL()` cleanup. For manual ranges, require a `206` response and validate `Content-Range`; a server may ignore `Range` and return the whole file with `200`, breaking naive concatenation.

`preload="metadata"` doesn't guarantee a first frame. In a 2025 Safari test it displayed no first frame, while `video.mp4#t=0.001` still downloaded the entire short video before displaying one. If the UI needs an image sooner, use a separate first-frame poster.

If the poster should cover loading, keep it underneath the `<video>` until playback starts; removing it earlier can expose a white frame while an uncached video loads.

Don't render a missing poster as `background-image: url(null)`: the browser may request `/null` for every item. Omit the CSS property or element until the URL exists.

Switching tabs or windows may not fire the pointer events that clear hover, leaving hover state true. If playback should stop outside the active document, listen to `visibilitychange` and window focus/blur events.

Scrolling can move a card under a stationary pointer without firing `mouseenter`. If playback must follow the card under the pointer, update hover while scrolling or hit-test after layout with `document.elementFromPoint()`.

## Scrubbing and playback speed

Use the native `<video>` element's `currentTime` first. Duration is `NaN` before metadata loads and can be `Infinity` for a live stream, so validate the seek time before assigning it:

```ts
function scrubVideo(video: HTMLVideoElement, progress: number) {
  const scrubProgress = Math.max(0, Math.min(progress, 1))
  const seekTime = scrubProgress * video.duration
  if (Number.isFinite(seekTime)) {
    video.currentTime = seekTime
  }
}
```

A sprite atlas or custom WebCodecs pipeline adds demuxing, decoding, drawing, and cleanup. Build one only if measurements show a meaningful improvement over native seeking.

Accelerated playback increases decoder demand. E.g. a 24 fps video at 4× asks for roughly 96 decoded frames per second. In one 2025 Safari test, 2× instead of 4× avoided decoder instability.

## MP4 layout and encoding

Don't treat `-movflags +faststart` as sufficient. It moves the MP4's `moov` atom to the beginning so playback can start before the whole file arrives, but the browser may still issue several byte-range requests. Rapid source changes can leave old requests waiting to cancel. In the Chromium repro, these requests filled the origin's media buffer pool and delayed new video loads; even page painting showed blank regions.

Remuxing greatly reduced the stalls without re-encoding:

```sh
ffmpeg -i input.mp4 -c copy -movflags +faststart+global_sidx output.mp4
```

The Chromium investigation did not isolate `global_sidx` from the remux itself, so inspect the MP4 and the Network panel instead of checking only the flags. After remuxing, Chromium generally fetched each video with one sequential request. Still, 20 remuxed videos could occasionally hitch, and 50 reproduced the problem immediately; limit active sources too.

`-g` controls maximum GOP length, or keyframe spacing, separately from MP4 index placement. At 24 fps, `-g 24` allows about one second between keyframes; `-g 7` allows about 0.29 seconds. A shorter GOP can reduce decoding after a seek at the cost of larger files or lower compression efficiency.
