# Template Experiment Results

This is the first pass at using `demo_templates/` as the architecture surface for AI workers.

## Initial Template Set

- `reference-app`
- `gesture-stack`

This is intentionally small.

The current rule is:

- start from `reference-app`
- pull from `gesture-stack` only when the interaction really needs it

## What We Tried

The original instinct for `reference-app` was `nicer-hacker-news`.

That demo is architecturally attractive because it bundles:

- schedule-render
- staged events
- scrolling
- selection and copy
- richer data shaping

Copying it into `demo_templates/` exposed a real repo drift:

- `nicer-hacker-news` still imported the old `pretext` `inline-flow` helper
- `pretext` had renamed that surface to `rich-inline`

We fixed that drift directly instead of working around it.

So the current template set uses:

- `nicer-hacker-news` as `reference-app`
- `draggable-cards` as `gesture-stack`

## Smoke Result

- `bun run start:templates` serves:
  - `/reference-app`
  - `/gesture-stack`
- both template folders build and serve
- `reference-app` works again after updating `nicer-hacker-news` to the current `pretext` API
- `gesture-stack` was self-contained from the start

## Current Read

- A good template is not just "a good demo". It has to track the real APIs it depends on.
- The right answer here was to fix the HN/pretext seam, not route around it.
- The right split still looks like:
  - one rich default DOM app
  - one opt-in gesture template
- If we later add an even more boring app shell than `nicer-hacker-news`, it can replace `reference-app` without changing the overall folder strategy.

**NEW PATTERN DETECTED**: template portability is not only about folder boundaries. It is also about keeping the referenced sibling APIs current, so the copy-pasteable specimen stays alive instead of fossilizing.
