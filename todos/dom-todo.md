# DOM TODO

Temporary scratchpad. Not canon yet.

The canon DOM guidance now lives in [docs/ui.md](../docs/ui.md).
This file should only keep things that are still unsettled.
If something is already known but just not written up yet, don't keep it here.

## Still Open

- How strict should "one owner per node" be? What is the least-bad portal / cross-boundary mount story?
- Is LRU real for DOM nodes, or usually fake sophistication?
- When is precreating everything actually fine?
- Are there cases where a small local patcher is clearly better than both rebuild and full retention?
- Are there cases where universal diffing is still the right tradeoff for one chunk?
- Is "projection boundary" the right term, or is there a better one than "component" here?

## Still Worth Validating

- A visible-window list with truly stateful media, e.g. `video`, `audio`, maybe `iframe`, to see what "preserve some nodes" should mean in practice.
- An explicit cross-boundary mount example, so ownership transfer isn't just a sentence in the docs.
- A canvas / WebGL / iframe example, to decide whether these deserve a first-class carve-out in the DOM model.

## Current Hunches

- Pooling/recycling might just be a web-flavored premature optimization.
- `innerHTML = ''`, `textContent = ''`, `replaceChildren`, and manual child removal are not philosophically different enough to fetishize. The real question is identity preservation and statefulness.
- "Cache" and "diff" are related, but not the same. A specialized cache shape hardcodes ownership and lifetime in a way a universal diff does not.

## Nearby Docs / Inputs

- [todos/thoughts.md](./thoughts.md)
- [docs/ui.md](../docs/ui.md)
- [docs/FrameScheduling.md](../docs/FrameScheduling.md)
- [todos/ui-bag/scrollview.js](./ui-bag/scrollview.js)
