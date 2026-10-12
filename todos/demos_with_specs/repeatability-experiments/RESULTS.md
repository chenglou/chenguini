# Repeatability Experiment Results

This matrix tested whether the three prompt conditions differ in repeatability on `scroll-anchor`.

The comparison was:

- raw: docs plus thin spec only
- template: docs plus thin spec plus template access
- guided: docs plus thin spec plus template access plus explicit extraction guidance

All workers were fresh `gpt-5.4 xhigh` agents.

## Demo

- `scroll-anchor`

## Main-Thread Results

### Raw

- `repeat-raw-01`:
  - `bun test todos/demos_with_specs/scroll-anchor/repeat-raw-01`
  - pass
- `repeat-raw-02`:
  - `bun test todos/demos_with_specs/scroll-anchor/repeat-raw-02`
  - pass
- `repeat-raw-03`:
  - `bun test todos/demos_with_specs/scroll-anchor/repeat-raw-03`
  - pass

Raw total:

- `3/3` main-thread passes

### Template

- `repeat-template-01`:
  - `bun test todos/demos_with_specs/scroll-anchor/repeat-template-01`
  - pass
- `repeat-template-02`:
  - `bun test todos/demos_with_specs/scroll-anchor/repeat-template-02`
  - pass
- `repeat-template-03`:
  - `bun test todos/demos_with_specs/scroll-anchor/repeat-template-03`
  - pass

Template total:

- `3/3` main-thread passes

### Guided

- `repeat-guided-01`:
  - `bun test todos/demos_with_specs/scroll-anchor/repeat-guided-01`
  - pass
- `repeat-guided-02`:
  - `bun test todos/demos_with_specs/scroll-anchor/repeat-guided-02`
  - pass
- `repeat-guided-03`:
  - `bun test todos/demos_with_specs/scroll-anchor/repeat-guided-03`
  - pass

Guided total:

- `3/3` main-thread passes

- `bun check`:
  - pass

## Updated Read

- This repeatability pass did not show a stability advantage for template access or extra extraction guidance.
- All three prompt conditions were `3/3` from the main thread.

That changes the safest read:

- the earlier raw `scroll-anchor` miss looks more like one unlucky round than a stable raw-docs weakness
- template access still helps architecture shape
- extra extraction guidance still looks like a shape nudge
- but this repeatability pass did not show a pass-rate gap between the three conditions

## What Still Looks True

- `reference-app` still tends to keep the worker closer to the intended app-shell structure:
  - staged `events`
  - persistent `domCache`
  - read-once anchoring inside render
- guided still tends to copy that structure more literally

But the strongest safe claim now is:

- on `scroll-anchor`, all three prompt conditions are repeatably capable
- the current difference is mostly architecture shape, not whether the demo passes

## Practical Conclusion

- keep templates as the architecture surface
- keep extra extraction guidance in worker prompts as an optional tightening tool
- do not oversell either as a proven repeatability unlock based on `scroll-anchor`
