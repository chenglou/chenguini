# Template Experiment Results

This matrix tests whether `demo_templates/` helps on new demos that are not just the original template sources.

Both workers in each comparison were fresh `gpt-5.4 xhigh` agents and were forbidden from reading `demos/`.

## `scroll-anchor`

Comparison:

- `round-01-raw`: docs plus thin spec only
- `round-01-template`: docs plus thin spec plus `demo_templates/reference-app`

### Main-Thread Results

- `scroll-anchor/round-01-raw`:
  - `bun test /Users/chenglou/github/vibescript/demos_with_specs/scroll-anchor/round-01-raw`
  - fail
- `scroll-anchor/round-01-template`:
  - `bun test /Users/chenglou/github/vibescript/demos_with_specs/scroll-anchor/round-01-template`
  - pass

### `round-01-raw`

- pure model tests passed
- two browser scenarios passed
- one browser scenario failed:
  - `add-1 then 2 rapid keeps the same item at the reference line`

Main-thread read:

- the worker understood the anchoring law well enough to build the pure model
- the miss was in the live browser behavior under the rapid two-step prepend
- the code shape was simpler and more ad hoc:
  - `main.js`
  - `model.js`
  - no persistent DOM cache
  - more direct node recreation with `replaceChildren`

### `round-01-template`

- pure model tests passed
- all browser scenarios passed

Main-thread read:

- the worker stayed much closer to the intended app-shell shape
- it used:
  - one staged `events` object
  - one global state object
  - explicit `domCache`
  - read-once scroll anchoring inside the render loop
- this looks much closer to “copy and trim from `reference-app`” than “invent a structure from scratch”

## `gesture-flick-snap-target`

Comparison:

- `round-01-raw`: docs plus thin spec only
- `round-01-template`: docs plus thin spec plus `demo_templates/gesture-stack`

### Main-Thread Results

- `gesture-flick-snap-target/round-01-raw`:
  - `bun test /Users/chenglou/github/vibescript/demos_with_specs/gesture-flick-snap-target/round-01-raw`
  - pass
- `gesture-flick-snap-target/round-01-template`:
  - `bun test /Users/chenglou/github/vibescript/demos_with_specs/gesture-flick-snap-target/round-01-template`
  - pass
- `bun check`:
  - pass

### `round-01-raw`

- pure gesture math tests passed
- all browser scenarios passed
- the worker also covered `mouseup`, `touchend`, and `touchcancel` in the browser-driven paths

Main-thread read:

- the worker landed the product truth cleanly
- the code shape was more ad hoc than the repo default:
  - a local model object
  - direct event callbacks that call `beginDrag`, `moveDrag`, and `finishDrag`
  - no staged `events` object feeding one render loop
- this is a respectable implementation, but it looks more like “build a neat standalone demo” than “copy the repo’s gesture slice”

### `round-01-template`

- pure logic tests passed
- all browser scenarios passed

Main-thread read:

- the worker stayed much closer to the intended gesture-stack shape
- it kept:
  - pointer history
  - release-velocity estimation
  - `lastDragged` depth
  - staged event interpretation inside one render loop
- the template version was narrower in one place:
  - the automated browser scenarios only covered the mouse path
  - `touchend` and `touchcancel` are implemented in the page, but not directly exercised by the browser checks

## Updated Read

- The template surface now has two different kinds of wins:
  - `reference-app` helped both outcome and shape on `scroll-anchor`
  - `gesture-stack` mainly helped shape on `gesture-flick-snap-target`, because the raw worker already passed
- So the useful question is not only “did the template make it pass?”
- It is also:
  - did it keep the worker closer to the repo’s intended architecture?
  - did it keep the fragile interaction lifetime together?

**NEW PATTERN DETECTED**: templates can reduce architecture drift even when the raw docs-plus-spec path already passes.

Current read:

- keep `reference-app` as the default template
- keep `gesture-stack` as opt-in
- add more templates only if another repeated gap shows up
- docs can start yielding some structure prose to template pointers, but carefully:
  - docs should still carry rules and tradeoffs
  - templates should carry the concrete code shape
