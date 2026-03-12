This repo documents all the code patterns we want to codify for a new era of UI apps written with AI. Demos at `demos/` and docs at `docs/`. Read the latter in full before working.

`bun check` for linting, `bun start` for running the demos. Their url is the respective folder, e.g. `http://localhost:3000/photo-gallery/`

We'll periodically refactor other codebases' code and extract lessons back into our docs. Whenever you encounter a new pattern in some code that isn't found in the docs, or if you hesitate with the structuring of code, loudly alert **NEW PATTERN DETECTED**. Then let's discuss what to bake into the docs.

## Docs Tone
- Preserve the author's tone in docs and drafts. Prefer concise, slightly personal phrasing over generic explanatory filler.
- Do not bulk-normalize docs into default LLM prose. If agent-friendly expansion is useful, put it in a derived doc, draft, or skeleton instead of rewriting the canon.
- When editing existing docs, make the smallest change that clarifies the point while keeping the original voice.

Example:
- Preferred: `The image's position should be relative to the scroll view container's.`
- Avoid: `A more robust architectural approach is to define the image position relative to the parent scrolling container so that scrolling does not interfere with the animation system.`
- Preferred: `Properties are only selectively animated. E.g. on window resize, an image's x/y/scale do NOT animate if it stays in the same place/column.`
- Avoid: `Layout changes and transitions are treated separately. On resize, x/y/scale don't animate if an image stays in the same place; when changing modes, the image keeps its current visual position and glides to the new layout.`
- Preferred: `If you want a lightweight, hand-rolled router, do it this way.`
- Avoid: `A pattern for building routing that's fully typed, handles browser history correctly, and avoids the traps of routing libraries.`
