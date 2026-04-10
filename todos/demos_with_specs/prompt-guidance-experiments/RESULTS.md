# Prompt Guidance Experiment Results

This matrix tested whether the extra extraction guidance belongs in the worker prompt, beyond plain template access.

The comparison was:

- raw: docs plus thin spec only
- template: docs plus thin spec plus template access
- guided: docs plus thin spec plus template access plus explicit extraction guidance

All workers were fresh `gpt-5.4 xhigh` agents.

## Demos

- `scroll-anchor`
- `gesture-flick-snap-target`

## Main-Thread Results

### `scroll-anchor`

- `prompt-01-raw`:
  - `bun test /Users/chenglou/github/vibescript/drafts/demos_with_specs/scroll-anchor/prompt-01-raw`
  - pass
- `prompt-01-template`:
  - `bun test /Users/chenglou/github/vibescript/drafts/demos_with_specs/scroll-anchor/prompt-01-template`
  - pass
- `prompt-01-guided`:
  - `bun test /Users/chenglou/github/vibescript/drafts/demos_with_specs/scroll-anchor/prompt-01-guided`
  - pass

### `gesture-flick-snap-target`

- `prompt-01-raw`:
  - `bun test /Users/chenglou/github/vibescript/drafts/demos_with_specs/gesture-flick-snap-target/prompt-01-raw`
  - pass
- `prompt-01-template`:
  - `bun test /Users/chenglou/github/vibescript/drafts/demos_with_specs/gesture-flick-snap-target/prompt-01-template`
  - pass
- `prompt-01-guided`:
  - `bun test /Users/chenglou/github/vibescript/drafts/demos_with_specs/gesture-flick-snap-target/prompt-01-guided`
  - pass

- `bun check`:
  - pass

## Updated Read

- This was not a correctness win for prompt guidance. All six passed from the main thread.
- The useful difference was mostly code shape.

### App-Shell Read

On `scroll-anchor`:

- raw landed the full semantics again, but still used the more ad hoc shape:
  - local `model.js`
  - direct DOM rebuilding with `replaceChildren`
  - no persistent `domCache`
- template and guided both stayed much closer to the intended app-shell structure:
  - staged `events`
  - persistent `domCache`
  - read-once anchoring inside render
  - page-owned browser semantics

Guided did not materially improve outcome beyond plain template access.

### Gesture Read

On `gesture-flick-snap-target`:

- raw, template, and guided all landed the required behavior
- template and guided stayed closer to the intended gesture-stack lifetime
- guided copied the template more literally:
  - staged input
  - settle loop
  - `lastDragged` depth

That extra literalness did not buy a better pass result on this one-card demo.

## Current Read

- Template access is the bigger lever than extra extraction guidance.
- Extra extraction guidance currently looks like:
  - a shape nudge
  - not a correctness unlock
- So this guidance belongs in worker prompts as an optional tightening tool, not in the canonical docs.

## Caveat

This is one matrix, not a repeatability study.

The strongest safe claim is:

- if a template already fits, explicit extraction guidance can keep the worker closer to that template
- but this round did not show a reliable correctness gain beyond plain template access
