# Minimum Viable Demo Spec

Use this as the default packet for a fresh `gpt-5.4 xhigh` worker when the shared docs are already strong.

The repeatability read behind this doc is:

- draggable thin packet: `4/4` main-thread passes
- photo thin packet: `4/5` main-thread passes

So this is the default now.

## Default Shape

Keep the packet this small:

1. summary
2. data
3. exact numbers
4. fragile truths
5. tests must prove

If geometry is hard to picture, add one tiny diagram.

If one seam keeps wobbling across fresh repeats, add one overlay. Don't start with overlays by default.

## Template

````md
# <Demo Name>

Use `docs/` plus this packet only. Do not inspect `demos/` or other specs.

Read first:

1. `docs/verification.md`
2. `docs/ai-automating-browsers.md`
3. this file

Write tests first, then implementation, then validate.

Build only inside:

- `<target folder>`

## Summary

Build a demo with:

- <mode or interaction 1>
- <mode or interaction 2>
- <required browser or routing truth>

## Data

Use this exact data:

```ts
<small concrete data shape or seed corpus>
```

## Exact Numbers

- <number and what it controls>
- <number and what it controls>
- <number and what it controls>

## Fragile Truths

- <same gesture, different target -> different outcome>
- <middle-of-interaction truth that must happen before settle>
- <browser boundary truth like hash, selection, scroll restore, or mounted count>

## Tests Must Prove

- <one pure seam>
- <one pure seam>
- <one browser-backed semantic scenario>
- <one browser-backed semantic scenario>
````

## What To Keep Exact

Keep these exact unless you have a very good reason not to:

- numeric layout constants like `32px`, `24px`, `40px`, `100px`
- threshold rules like midpoint reorder
- the exact browser-facing seam, e.g. `caption click selects the full text and stays in grid mode`
- what each browser-backed scenario must prove

## What To Leave Out

Leave these in shared docs, not the per-demo packet:

- `requestId`
- phase markers
- acceptable browser transport
- why the runner should stay dumb

## When To Add One Diagram

Add a diagram only when the geometry is easy to misread in prose.

Good:

```txt
|<------100------>|<--------- main line ---------->|<------100------>|
 left nav strip        focused item in middle          right nav strip
```

Good:

```txt
top layer       dragged item
next layer      just released item while settling
base layers     all remaining items
```

## When To Add One Overlay

Default: no overlay.

Add exactly one overlay only if the seam wants it:

- `oracle contract` for browser-boundary truth like hash routing, selection, scroll restore, or occlusion
- `seed corpus` for deterministic helper logic like midpoint reorder or recent-history velocity
- `two-pass` when helper hints are useful but likely to bias reconstruction too early
- `contrastive boundary pairs` when tiny target changes must cause different outcomes
- `temporal trace tape` when truth happens in the middle of an interaction

## Practical Rule

Start thinner than you think.

If the shared docs are good, a stronger worker usually still needs:

- exact numbers
- exact fragile seams
- exact test obligations

It usually does not need:

- extra architecture hints
- repeated browser doctrine
- long packets explaining what the shared docs already cover

One important nuance from the repeats:

- photo still has a slightly smaller stability margin than draggable
- if the dismiss-to-row seam is especially important, that is the first place to add one extra overlay or one extra browser witness
