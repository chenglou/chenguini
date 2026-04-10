# AI Demo Reconstruction

This is the current workflow for asking AI to rebuild a demo without reading `demos/`.

The short version is:

- docs are the doctrine
- one thin demo packet carries the exact product truth
- `todos/demo_templates/` is the architecture surface
- extra prompt guidance is optional and mostly affects shape, not correctness

For the exact default packet, see `minimum-viable-demo-spec.md`.
For older packet variants and overlays, see `spec-writing-for-demos.md`.

## Current Split

Use each layer for a different job:

- `docs/drafts/verification.md`: what counts as a trustworthy oracle
- `docs/drafts/automating-browsers.md`: how the browser runner should work
- one demo packet: exact numbers, fragile seams, required scenarios
- `todos/demo_templates/`: concrete code shape when a worker should copy and trim instead of improvising

That split held up better than either extreme:

- "just read the docs and invent the architecture"
- "stuff the whole repo policy into every spec"

## Default Worker Loop

Use this order:

1. read `docs/drafts/verification.md`
2. read `docs/drafts/automating-browsers.md`
3. read any one extra domain doc that really matters, e.g. `Scrolling.md` or `Input.md`
4. read the demo packet
5. write tests first
6. implement the demo
7. validate from the main thread

If the demo already fits a template, let the worker use the template. Don't make it rediscover the same app shell from prose.

## Default Packet

For `gpt-5.4 xhigh`, the best default packet is thin:

1. summary
2. data
3. exact numbers
4. fragile truths
5. tests must prove

That was enough for demos like:

- `photo-gallery`
- `draggable-cards`
- `scroll-anchor`
- `gesture-flick-snap-target`

The last things to remove are still:

- exact numbers like `32px`, `24px`, `40px`, `100px`
- exact fragile seams like `caption click selects the full text`
- exact browser-backed scenarios

## Templates

Templates are useful, but the current evidence says they mainly help architecture shape.

Current templates:

- `todos/demo_templates/reference-app`
- `todos/demo_templates/gesture-stack`

Current read:

- `reference-app` keeps app-shell demos closer to the intended render-loop shape
- `gesture-stack` keeps pointer history, release velocity, settle, and post-release depth together

What templates have not yet proven:

- a pass-rate advantage on `scroll-anchor`

In the latest repeatability pass, raw, template, and guided all went `3/3` from the main thread on `scroll-anchor`.

So the safe claim is:

- templates are the architecture surface
- they help shape
- don't oversell them as a proven stability unlock yet

## Extra Prompt Guidance

Extra extraction guidance belongs in worker prompts, not canonical docs.

Good examples:

- `Keep scheduleRender, staged st.events, domCache, and end-of-render side effects together.`
- `Keep pointer history, release velocity, settle, and just-released depth together.`

What the experiments say so far:

- this is a shape nudge
- not a correctness unlock

So use it when you want the worker to copy a template more literally. Don't treat it as a mandatory repo rule.

## Compressed Prompts

Compressed prompts are a rescue lever for harder demos, not the default.

The clearest example was `life-calendar`:

- raw docs-loading plus spec often stalled or never wrote files
- a compressed packet improved completion reliability a lot

But compressed prompts also have a real risk:

- they preserve product truth better than repo-local delivery constraints

We saw that on a compressed `photo-gallery` round that drifted into Playwright even though the repo-preferred Bun-native shape was good enough.

So:

- default: raw docs plus thin spec
- rescue: compressed packet when worker startup or context-loading is the real problem

## Current Best Read

What feels solid now:

- fresh stateless workers can recreate these demos from repo knowledge without reading `demos/`
- page-owned browser semantics are the right default
- the thin packet is the right default for `gpt-5.4 xhigh`
- templates help architecture shape
- extra prompt guidance helps architecture shape a bit more

What still feels narrower:

- `photo-gallery` is reconstructible, but its stability margin is smaller than `draggable-cards`
- a canvas-oriented template probably still wants a dedicated pass

## Where The Research Lives

For the current research summary, see `drafts/demos_with_specs/NOTES.md`.

For the full chronology, including early misses and dead ends, see:

- `drafts/demos_with_specs/NOTES_ARCHIVE.md`
- `drafts/demos_with_specs/*/RESULTS.md`
