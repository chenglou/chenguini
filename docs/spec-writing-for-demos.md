# Spec Writing For Demos

When writing a demo spec for a fresh AI, lead with behavior, not implementation.

This doc is mainly about what we learned from the experiments.

For the current default packet, see `minimum-viable-demo-spec.md`.

The most reliable shape we found was:

1. one short product summary
2. a small set of scenarios
3. one compact metrics block
4. one small picture where geometry is hard to picture
5. a short "tests must prove" section

## Start With Scenarios

Write the spec in the order a user experiences it.

Good:

- `Scenario 1: First load. Expect a scrollable grid, 32px side padding, 24px gaps, and no more than 7 columns.`
- `Scenario 2: Click a caption. Expect the full caption text to become selected and the page to stay in grid mode.`
- `Scenario 3: Drag a card past the next midpoint. Expect the order to change before release.`

This works better than starting with a whole state model or a long styling dump. It gives the agent a natural path to tests first.

## Pin The Numbers Exactly

After the scenarios, give one compact block of exact numbers.

Good:

- grid side padding `32px`
- grid gap `24px`
- top padding before the first row `40px`
- line-mode left and right strips `100px`
- non-focused line-mode scale `0.7`

If a number matters, say it once clearly. Don't hide it in prose.

## Add One Picture When Words Get Lossy

Use a tiny ASCII diagram when the geometry is easy to misunderstand.

Good:

```txt
|<------100------>|<--------- main line ---------->|<------100------>|
 left nav strip        focused item in middle          right nav strip
```

Another good one:

```txt
|<-32->| card |<-24->| card |<-24->| card |<-32->|
```

One picture is often enough. Don't turn the whole spec into diagrams.

## Keep Code-Shaped Hints Light

It is fine to hint at one or two pure seams we already know are worth it.

Good:

- `A pure grid layout helper is worth it here.`
- `A pure click-routing helper for the 100px left/right strips is worth it here.`
- `A pure release-velocity helper is worth it here.`

But don't write the whole spec as a data model or pseudocode file. That nudges the agent into solving the wrong problem first, especially on visual demos.

## Say What Tests Must Prove

End with the fragile seams.

Good:

- browser-backed navigation should reach the right focused item and update the hash
- dismissing line mode should bring the focused row back with roughly `40px` above it
- clicking a caption should select the full text without changing mode
- the released item should stay on top while it settles

This keeps the spec tied to user-visible truth instead of drifting into verifier transport details.

## What To Leave Out

Don't repeat repo-wide browser-verification machinery in every spec.

That means the demo spec should not keep re-explaining:

- `requestId`
- phase markers
- which browser transport is acceptable
- why the runner should stay dumb

That belongs in the shared docs.

## Baseline We Started From

The first strong baseline was:

1. Summary
2. Scenarios
3. Metrics
4. One diagram if needed
5. Tests must prove
6. Optional pure-seam hints

`NEW PATTERN DETECTED`: for fresh subagents, a scenario-first spec with exact numbers and one supporting diagram works better than either a picture-only spec or a fully code-shaped spec.

For `gpt-5.4 xhigh`, we later shrank that into the thinner default in `minimum-viable-demo-spec.md`.

## Add Overlays By Seam Type

After the baseline spec is in place, add one small overlay based on where the fragile truth lives.

Good overlays:

- `oracle contract` for browser-boundary truth like hash routing, text selection, scroll restore, and mounted-count semantics
- `seed corpus` for deterministic helpers like midpoint reorder and release velocity
- `contrastive boundary pairs` when tiny target changes should cause different outcomes, such as image click vs caption click
- `temporal trace tape` when the truth happens in the middle of an interaction, such as reorder before release or top-until-settle
- `two-pass` when helper hints are useful but likely to bias reconstruction too early

Good rule of thumb:

- start with the baseline
- add one overlay for the dominant seam
- if helper hints are risky, delay them to a second pass instead of deleting them

## Stronger Models Can Use Thinner Specs

With a stronger worker model, try thinning the packet before you assume you need more overlays.

The first things to remove are:

- helper hints
- seed examples
- extra oracle scaffolding in the per-demo packet

The last things to remove are:

- exact numeric constants
- the fragile user-visible seams
- the concrete browser-backed scenarios that prove those seams

Counterintuitive but important:

- more packet detail is not always better
- a stronger model may do better with a smaller, cleaner packet than with a richer one that nudges it toward the wrong reconstruction
