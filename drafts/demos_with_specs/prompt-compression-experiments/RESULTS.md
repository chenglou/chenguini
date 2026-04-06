# Prompt Compression Results

This matrix reran `photo-gallery` and `draggable-cards` with fresh `gpt-5.4 xhigh` workers.

Each demo got two variants:

- `raw`: read repo docs plus the current thin spec packet
- `compressed`: do not discover repo docs, and instead get one inline packet with:
  - the demo truth
  - one short verification excerpt
  - one short browser-report excerpt

All 4 workers were fresh. All 4 were forbidden from inspecting `demos/`.

## Main-Thread Results

- `photo-gallery/round-11-raw`: pass
- `photo-gallery/round-11-compressed`: mixed
- `draggable-cards/round-11-raw`: pass
- `draggable-cards/round-11-compressed`: pass
- `bun check`: pass

## `photo-gallery/round-11-raw`

- main-thread verification:
  - `bun test /Users/chenglou/github/vibescript/drafts/demos_with_specs/photo-gallery/round-11-raw`
- result:
  - pass

Read:

- this landed cleanly inside the repo's preferred shape
- pure tests and browser-backed semantic checks both ran through `bun test`

## `photo-gallery/round-11-compressed`

- main-thread verification:
  - `bun test /Users/chenglou/github/vibescript/drafts/demos_with_specs/photo-gallery/round-11-compressed`
  - `bun test /Users/chenglou/github/vibescript/drafts/demos_with_specs/photo-gallery/round-11-compressed/gallery.unit.test.ts`
  - `bunx playwright test /Users/chenglou/github/vibescript/drafts/demos_with_specs/photo-gallery/round-11-compressed/browser.semantic.spec.ts --config /Users/chenglou/github/vibescript/drafts/demos_with_specs/photo-gallery/round-11-compressed/playwright.config.ts`
- result:
  - the folder-level `bun test` failed because the round introduced a Playwright-style spec file that Bun tried to load
  - the unit test passed
  - the Playwright browser scenarios passed

Read:

- the product truth mostly landed
- the drift was in the harness shape
- compression preserved the semantic goals, but not the repo-preferred toolchain choice

## `draggable-cards/round-11-raw`

- main-thread verification:
  - `bun test /Users/chenglou/github/vibescript/drafts/demos_with_specs/draggable-cards/round-11-raw`
- result:
  - pass

Read:

- this again landed in the repo's preferred shape
- the browser-backed semantic report stayed inside the existing Bun-based pattern

## `draggable-cards/round-11-compressed`

- main-thread verification:
  - `bun test /Users/chenglou/github/vibescript/drafts/demos_with_specs/draggable-cards/round-11-compressed`
- result:
  - pass

Read:

- compressed still worked here
- unlike the photo compressed round, it did not drift into a second toolchain

## Updated Read

- On demos that were already stable under raw docs plus spec, compression did not improve pass rate.
- Raw packets stayed closer to the repo's preferred verification shape.
- The main risk on the compressed side is not necessarily product failure. It is harness drift.
- `photo-gallery` shows that clearly: the worker landed the semantics, but introduced Playwright and a round-local config.
- `draggable-cards` stayed aligned under both formats, so compression was not harmful there. It just was not obviously better either.
- The earlier `life-calendar` result still matters: compression can help completion reliability on harder demos.
- Current read:
  - use raw docs plus thin spec as the default when the demo is already reconstructing well
  - use compressed packets as a rescue lever when completion reliability is the real bottleneck
  - if you do compress, keep the repo-local toolchain constraint explicit too

**NEW PATTERN DETECTED**: prompt compression and pattern compression are not the same thing. A compressed packet can preserve product truth while still dropping repo-preferred delivery constraints, which makes stronger workers more likely to finish but also more likely to choose a different harness.
