# Demo Templates

This folder is for copy-pasteable architecture references.

These are not meant to be perfectly orthogonal. That usually creates too many files and too much template shopping. The default shape is:

- start from `reference-app`
- pull from `gesture-stack` only when the demo really needs drag, flick, or release settle

Use `docs/` for rules and tradeoffs. Use this folder for concrete code shape.

## Current Templates

### `reference-app`

Use this when you need:

- the repo's render loop shape
- event staging and a single global state object
- scrolling and occlusion
- DOM cache patterns
- text selection and copy
- one richer browser UI with data shaping

This is intentionally a full app, not a tiny skeleton. The point is to let AI steal a working slice like:

- `scheduleRender` plus staged `st.events`
- a `domCache` with explicit lifetime
- side effects at the end of render
- copy/selection logic that stays out of random callbacks

This template is based on `nicer-hacker-news`, and now tracks the current `pretext` rich-inline API again.

### `gesture-stack`

Use this when you need:

- pointerdown / move / up / cancel handling
- recent-history velocity
- spring settle after release
- dragged item depth and just-released depth

Steal this as a bundle. Don't just copy one spring and leave behind the pointer history or `lastDragged` depth logic.

## Default Worker Prompt Shape

Tell the worker something like:

1. read the relevant docs
2. start from `demo_templates/reference-app`
3. only pull from `demo_templates/gesture-stack` if the interaction needs it
4. copy the smallest complete slice that works
5. trim after the slice works

Good:

- "Use `reference-app` for scheduler, state, scrolling, and browser verification. Pull only drag/release logic from `gesture-stack`."

Bad:

- "Read everything and invent the architecture you think is nicest."

## Current Read

The experiments so far suggest:

- docs are still the doctrine
- template demos should be the architecture surface
- the worker should copy and trim, not imitate from memory

This folder is the first pass at that split.
