# Minimum Viable Demo Spec

Use this as the default packet for a fresh `gpt-5.4 xhigh` worker when the shared docs are already strong.

For the broader workflow, see `demo-reconstruction.md`.
For older packet shapes and overlays, see `spec-writing-for-demos.md`.

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

1. `docs/drafts/verification.md`
2. `docs/drafts/layout-geometry.md`
3. this file

State static layout facts where the helper is pure, then implement, then validate.

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
- <browser boundary truth like hash, selection, scroll restore, or mounted count, stated as product behavior>

## Static Facts To State

- <one static fact for a pure geometry helper>
- <one static fact for a hit rect, row, text, or sizing helper>
- <one product boundary that is intentionally not verifier evidence>
- <one product boundary that is intentionally not verifier evidence>
````

## Keep These Exact

Keep these exact unless you have a very good reason not to:

- numeric layout constants like `32px`, `24px`, `40px`, `100px`
- threshold rules like midpoint reorder
- the exact product seam, e.g. `caption click selects the full text and stays in grid mode`
- which pure helper or product boundary owns each fragile truth

Leave these in shared docs, not the per-demo packet:

- the static-fact annotation grammar
- report statuses
- why unsupported facts become `unknown`
- why sampled inputs do not count

## Add One Diagram Only If It Helps

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

## Add One Overlay Only If Needed

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
