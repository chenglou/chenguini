# Life Calendar Compressed Prompt Results

This matrix kept the same `life-calendar` packet, but stopped asking the worker to discover docs from the repo.

Each worker got:

- the life-calendar packet inline
- one short verification excerpt
- one short browser-report excerpt

All 3 workers used fresh `gpt-5.4 xhigh` agents.

## Main-Thread Results

- `round-06`: partial
- `round-07`: pass
- `round-08`: fail

## `round-06`

- observed output:
  - `browser-test-server.ts`
  - `browser.spec.ts`
  - `logic.test.ts`
- no main app files landed
- no meaningful end-to-end run was possible

Read:

- still stalled partway through
- but it at least started writing immediately, which is already better than the earlier no-write stalls

## `round-07`

- main-thread verification passed:
  - `bun test /Users/chenglou/github/vibescript/demos_with_specs/life-calendar/round-07`
- landed:
  - pure geometry helpers
  - canvas-first app
  - browser-backed semantic report tests

Read:

- this is the important result in the matrix
- the compressed prompt made at least one fresh worker complete the full loop on the same demo/spec that previously kept stalling

## `round-08`

- landed:
  - `index.html`
  - `index.ts`
  - `lifeCalendar.ts`
  - `style.css`
  - pure tests
  - browser test
- main-thread verification:
  - pure tests passed
  - `bun test /Users/chenglou/github/vibescript/demos_with_specs/life-calendar/round-08` failed in the browser test with a hook timeout and a dangling process cleanup

Read:

- this looks closer to a browser harness/tooling miss than a product-spec miss
- it is still a much healthier failure mode than "worker never wrote anything"

## Updated Read

The compressed prompt helped materially.

Before compression:

- one partial scaffold
- three no-write stalls

With compression:

- one partial
- one main-thread pass
- one near-complete attempt that failed in the browser harness

`NEW PATTERN DETECTED`: for fresh subagents, prompt compression can improve completion reliability even when the underlying spec is unchanged.

That means we should treat:

- reconstruction quality
- spec quality
- worker startup/completion reliability

as separate experiment axes.
