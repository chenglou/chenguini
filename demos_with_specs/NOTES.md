# Notes

This is the current read from the reconstruction experiments.

For the full chronology, including early misses and dead ends, see `NOTES_ARCHIVE.md`.

## Current Workflow

The best split right now is:

- docs are the doctrine
- one thin demo packet carries the exact product truth
- `demo_templates/` is the architecture surface
- extra extraction guidance stays in worker prompts

If you want the repo-level workflow, see `docs/ai-demo-reconstruction.md`.

## Current Conclusions

- Fresh stateless workers can recreate these demos from repo knowledge without reading `demos/`.
- The page-owned browser pattern in `docs/ai-automating-browsers.md` held up.
- The verifier shape in `docs/verification.md` held up.
- For `gpt-5.4 xhigh`, the thin default packet in `docs/minimum-viable-demo-spec.md` is the right default.
- Templates help architecture shape more than they have proven pass-rate.
- Extra extraction guidance is a shape nudge, not a correctness unlock.
- Compressed prompts help harder demos like `life-calendar`, but they are not the default.

## Per-Demo Read

### `draggable-cards`

- stable
- docs plus thin spec are enough
- the tiny Chrome CDP poller pattern held up well here

### `photo-gallery`

- reconstructible
- narrower stability margin than `draggable-cards`
- the fragile seams were:
  - full caption selection
  - exact grid width budget
  - explicit occlusion assertions
  - a concrete browser-runner recipe
- motion quality is still easier to underspec than basic behavior

### `scroll-anchor`

- repeatably reconstructible across raw, template, and guided prompt conditions
- the current difference is mostly code shape, not pass-rate

### `gesture-flick-snap-target`

- all prompt conditions landed the required behavior
- template and guided conditions stayed closer to the intended gesture lifetime

### `life-calendar`

- the main model could complete it from the thin packet
- worker stalls looked more like startup/context-loading problems than a hard spec gap
- compressed prompts improved completion reliability

## Experiment Index

- `spec-writing-experiments/RESULTS.md`
  - scenario-first packets with exact numbers and one small diagram beat picture-only or fully code-shaped packets
- `spec-overlay-experiments/RESULTS.md`
  - overlays help when aimed at the right seam
- `spec-thinning-experiments/RESULTS.md`
  - `gpt-5.4 xhigh` can use much thinner packets than `gpt-5.4-mini`
- `prompt-compression-experiments/RESULTS.md`
  - compression helps harder demos, but can also weaken repo-local toolchain discipline
- `template-experiments/RESULTS.md`
  - templates help architecture shape, and sometimes outcome
- `prompt-guidance-experiments/RESULTS.md`
  - extra extraction guidance belongs in worker prompts, not canonical docs
- `repeatability-experiments/RESULTS.md`
  - on `scroll-anchor`, raw, template, and guided all went `3/3` from the main thread

## Safe Claims

The strongest safe claims now are:

- templates are the architecture surface
- prompt guidance stays in worker prompts
- don't oversell either one as a proven repeatability unlock yet

The earlier raw `scroll-anchor` miss now looks more like one unlucky round than a stable raw-docs weakness.
