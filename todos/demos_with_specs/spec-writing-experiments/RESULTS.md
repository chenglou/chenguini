# Spec Writing Results

This compares three alternate spec styles against the existing round-10 baseline.

Shared conditions:

- fresh agents only
- no forking thread context
- `docs/` stayed fixed
- each agent only saw its assigned variant spec
- main-thread verification mattered more than the worker's self-report

## Matrix

### Draggable Cards

Baseline control:

- `/Users/chenglou/github/vibescript/drafts/demos_with_specs/draggable-cards/round-10`
- main-thread result: pass

`spatial-ascii`:

- `/Users/chenglou/github/vibescript/drafts/demos_with_specs/draggable-cards/style-spatial-ascii`
- main-thread result: pass
- notes:
  - geometry and depth were communicated well enough
  - code shape was a little looser: `.js` app files, smaller pure seam
  - still reconstructed cleanly

`scenario-first`:

- `/Users/chenglou/github/vibescript/drafts/demos_with_specs/draggable-cards/style-scenario-first`
- main-thread result: pass
- notes:
  - very steady
  - good browser scenarios
  - less explicit internal structure than the state-first variant

`state-and-derivations`:

- `/Users/chenglou/github/vibescript/drafts/demos_with_specs/draggable-cards/style-state-and-derivations`
- main-thread result: pass
- notes:
  - strongest pure logic seam
  - cleanest helper split
  - richest pure tests
  - fastest-looking path to a solid implementation

Current read for draggable:

- best full-spec style: `state-and-derivations`
- close second: `scenario-first`
- useful supplement, not ideal as the whole spec: `spatial-ascii`

### Photo Gallery

Baseline control:

- `/Users/chenglou/github/vibescript/drafts/demos_with_specs/photo-gallery/round-10`
- main-thread result: pass

`spatial-ascii`:

- `/Users/chenglou/github/vibescript/drafts/demos_with_specs/photo-gallery/style-spatial-ascii`
- main-thread result: pass
- notes:
  - the picture helped with the page geometry
  - the resulting shape was a little more sprawling: nested `tests/`, extra browser-server helper
  - still good enough to reconstruct the gallery

`scenario-first`:

- `/Users/chenglou/github/vibescript/drafts/demos_with_specs/photo-gallery/style-scenario-first`
- main-thread result: pass
- notes:
  - cleanest pass for the gallery
  - browser scenarios map directly onto the fragile seams
  - the agent naturally covered hash flow, dismiss-to-row, caption selection, and occlusion

`state-and-derivations`:

- `/Users/chenglou/github/vibescript/drafts/demos_with_specs/photo-gallery/style-state-and-derivations`
- main-thread result: fail
- failure shape:
  - pure layout tests passed
  - browser-backed scenarios failed
  - the worker drifted into a brittle Playwright-style browser harness
  - main-thread run timed out on navigation, then the browser context closed and the remaining browser scenarios collapsed

Current read for photo:

- best full-spec style: `scenario-first`
- workable supplement: `spatial-ascii`
- too code-shaped as the whole spec: `state-and-derivations`

## Main Lesson

The most effective spec for these demos is not one extreme.

Not best:

- pure spatial picture
- pure code-shaped state machine

Best:

- a scenario-first spine
- exact numeric constants
- one small spatial picture when geometry is hard to picture
- one or two recommended pure seams for the fragile math

In other words:

1. Say what the user does.
2. Say what must be true after each step.
3. Pin the important numbers exactly.
4. Add one picture only where words are too lossy.
5. Only then hint at internal seams.

## Working Recommendation

For a fresh subagent, the best default spec shape now looks like:

1. One short product summary.
2. `Scenario 1`, `Scenario 2`, `Scenario 3` user flows with explicit expected outcomes.
3. A compact metrics table or bullet list with exact numbers.
4. One ASCII picture for layout-heavy regions like hit strips, row padding, or stacked depth.
5. A short "tests must prove" section.
6. Optional "recommended seam" hints only for the tiny pure helpers we know are worth it.

`NEW PATTERN DETECTED`: scenario-first specs with a tiny metrics block and one supporting diagram seem more reliable than either picture-only specs or fully code-shaped specs for visual interaction demos.
