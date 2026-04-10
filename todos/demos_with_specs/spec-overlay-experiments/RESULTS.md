# Spec Overlay Results

This file records the next overlay matrix.

Conditions:

- photo gallery + oracle contract
- photo gallery + contrastive boundary pairs
- photo gallery + two-pass packet
- draggable cards + two-pass packet
- draggable cards + temporal trace tape
- draggable cards + seed corpus

Main-thread results:

- all 6 overlay conditions passed

## Photo Gallery

### `oracle-contract`

- main-thread result: pass
- verification:
  - `bun test /Users/chenglou/github/vibescript/drafts/demos_with_specs/photo-gallery/overlay-oracle-contract`
- notes:
  - strongest boundary-rich overlay in this round
  - kept the browser-backed checks centered on demo truth instead of harness invention
  - cleanest code shape of the photo overlays in this matrix
  - good fit for route, selection, scroll-restore, and occlusion seams

### `contrastive-boundary-pairs`

- main-thread result: pass
- verification:
  - `bun test /Users/chenglou/github/vibescript/drafts/demos_with_specs/photo-gallery/overlay-contrastive-boundaries`
- notes:
  - directly helped the click-routing seams
  - especially strong on image-area vs caption and left vs middle vs right strip behavior
  - still drifted toward a slightly sprawling JS-plus-tests shape
  - best used as a supplement inside a boundary-rich spec, not necessarily the whole spec

### `two-pass`

- main-thread result: pass
- verification:
  - `bun test /Users/chenglou/github/vibescript/drafts/demos_with_specs/photo-gallery/overlay-two-pass`
- notes:
  - most important result in this round
  - delayed helper hints did NOT reintroduce the earlier gallery regression
  - this supports the idea that timing matters as much as content
  - code shape still drifted a little more than the oracle-contract version, but the product and browser seams all held

Current read for photo:

- best next overlay: `oracle-contract`
- strongest cross-cutting lesson: `two-pass`
- useful supporting section: `contrastive-boundary-pairs`

## Draggable Cards

### `two-pass`

- main-thread result: pass
- verification:
  - `bun test --timeout 30000 /Users/chenglou/github/vibescript/drafts/demos_with_specs/draggable-cards/overlay-two-pass`
- notes:
  - very clean output shape
  - staged helper hints worked well here too
  - strongest all-around draggable overlay in this round

### `temporal-trace-tape`

- main-thread result: pass
- verification:
  - `bun test /Users/chenglou/github/vibescript/drafts/demos_with_specs/draggable-cards/overlay-temporal-trace`
- notes:
  - directly helped the mid-drag and settle semantics
  - good at making reorder-before-release and top-until-settle explicit
  - but it also drifted toward a weaker delivery shape, including a round-local `package.json`
  - likely best as a trace section inside a spec, not the whole organizing principle

### `seed-corpus`

- main-thread result: pass
- verification:
  - `bun test /Users/chenglou/github/vibescript/drafts/demos_with_specs/draggable-cards/overlay-seed-corpus`
- notes:
  - strongest pure-test overlay in this round
  - particularly good for midpoint and velocity helpers
  - stayed disciplined in code shape while giving the worker concrete examples to anchor on

Current read for draggable:

- best overlays: `two-pass` and `seed-corpus`
- useful support for continuous interactions: `temporal-trace-tape`

## Updated Lesson

The earlier "scenario-first + exact numbers + one picture" base still looks right.

What changed in this round is that overlays now look real:

- boundary-rich demos want an `oracle-contract`
- logic-heavy demos want a `seed-corpus`
- helper hints are safer when staged as `two-pass`
- `contrastive-boundary-pairs` and `temporal-trace-tape` are strong targeted supplements, but not obviously the best whole-spec organizers

So the new working recommendation is:

1. start with the hybrid baseline
2. pick overlays by seam type
3. stage helper hints later when they are likely to bias reconstruction too early
