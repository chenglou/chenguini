# Verification

AI should specialize verification to the problem at hand. Don't start by inventing verifier architecture.

The goal is not "more tests". The goal is a loop that catches the regressions you're actually likely to make while staying cheap enough to rerun constantly.

## Main Principle

Prefer the cheapest trustworthy oracle.

Examples:

- If the bug is "this chip should never split", check fragment topology directly.
- If the bug is "this card height drifted", compare height directly.
- If the bug is "this browser flow should end on the same selected item", let the page compute that report itself. See `ai-automating-browsers.md`.

Don't force every demo or helper through one verifier shape.

## Start Narrow, Then Widen

Start with the smallest repro you can trust.

If a text box wraps wrong, don't start by rerunning a whole corpus. Start with one short string and one width where the behavior is obvious.

That tiny repro is for iteration speed:

- easy to rerun
- easy to reason about
- easy to falsify a bad hypothesis

Then widen temporarily so you do not overfit the toy case.

For example:

- keep a small permanent suite like repeated spaces, one hard break, one whitespace-only middle line, one tab case
- do one temporary broader pass over a much bigger generated matrix
- if the broad pass agrees, keep the small suite and throw the broad pass away

Don't keep the big exploratory checker forever just because it helped once.

## Pick The Oracle

Different problems want different oracles.

Good options:

- a tiny white-box policy canary
- a direct semantic snapshot
- a page-owned browser report
- a narrow differential check
- a seeded randomized pass

Use the simplest one that can really catch the bug you care about.

## Demos Usually Want Two Layers

Public demos usually want:

- a few pure tests for deterministic helpers
- one browser-backed semantic report for the actual user-visible flow

Examples of good pure tests:

- grid layout math
- reorder threshold logic
- line hit-area routing
- release velocity estimation

Examples of good browser-backed checks:

- selected text after clicking a caption
- visible row range after dismissing an overlay
- ordered card ids after a drag path
- which item stays on top during release settle

Pure tests are great for policy and math. Browser checks are great for "what does a real opened demo do?"

## Assert The Fragile Seam Directly

If the bug hides in one tiny interaction, assert that interaction directly.

This kept coming up in the experiment:

- clicking a grid caption should select the full prompt and stay in grid mode
- dismissing line mode should bring the focused row back with roughly `40px` of space above it
- dragging past the next midpoint should reorder before release
- the released item should stay above the stack until it settles
- occlusion should mean mounted count is less than the full item count on a representative state

These are better than a vague "happy path" check that only implies the behavior indirectly.

## Semantic Snapshots

When you snapshot behavior, snapshot the semantics that matter.

Good:

- line count
- note height
- arrays like `['body:Ship', 'chip:@maya']`
- visible item ids
- a compact positioned-card summary

Bad:

- giant DOM dumps
- raw screenshots as the only oracle
- text-only snapshots that throw away distinctions the UI actually cares about

A good semantic snapshot is small, readable, and obviously tied to user-visible behavior.

Also add at least one sensitivity check. Change one meaningful input and make sure the snapshot changes too. Otherwise the snapshot may just be too weak.

## Model Geometry Must Match Render Geometry

Some bugs are not really "the line breaker is wrong". They are "the model measured against one width, then the DOM rendered at another width."

Common shape:

- measure a bubble, card, or text block against width A
- then CSS or a later projection step clamps it to width B
- now the wrapping looks wrong even if the layout policy itself is fine

Treat this as its own verification class.

Good browser-backed probe:

- model width
- rendered container width
- widest rendered row or fragment edge
- a simple assertion like `widestRow <= renderedInnerWidth`

This is often much better than a screenshot diff.

Screenshots are still great for discovery and debugging. But the durable oracle should usually be a small geometry report the page computes itself.

If the system does "measure first, then shrink/clamp in CSS", assume that is a verification smell until proven otherwise.

## Measurement Bug vs Policy Bug

This distinction matters.

Measurement bug:

- the layout logic is fine
- the widths are wrong
- better browser measurement or a better backend would help

Policy bug:

- the widths can be perfectly fine
- the code still makes the wrong choice
- better measurement alone will not save you

Concrete example:

- `foo ` followed by `abcdef`
  - wrapping before `abcdef` can be correct if the current line would only fit a partial slice of that first word
- `vertical text` followed by ` research, but keep going`
  - wrapping before the whole second item is wrong if the current line can already fit a real breakable unit like `research, but`

That second kind of bug wants a tiny policy canary, not just better canvas fidelity.

## Keep Laws Narrow And Earned

Invariances are great when they are real.

Good examples:

- increasing available width should not increase line count
- splitting one text run into two equivalent runs should not change layout
- merging adjacent equivalent runs should not change layout

But only keep laws you've earned.

If a plausible law fails, demote the law. Don't contort the code to satisfy a fake theorem.

## Local Seams, Not Mandatory Architecture

Sometimes a local pure helper or model makes verification much easier. That's good.

Examples:

- a helper that turns rich inline specs into line fragments
- a layout function that returns item positions and total height

Use those seams when they buy leverage:

- deterministic measurement
- semantic snapshots
- mutation checks
- cheap-vs-rich comparisons

Don't turn that into a repo-wide rule that every demo needs a shared verifier interface.

## Randomized Checks

Seeded randomized checks are great for exploration and for boundary-heavy spaces.

Guidelines:

- keep them seeded and reproducible
- print or preserve the failing seed
- reduce the failing case into a small permanent fixture when possible
- prefer domain-shaped generation over arbitrary noise

## Differential Checks

Differential checks are high leverage, but only when the compared systems are actually semantically equivalent.

Good:

- "all items use the same font, have no extra chrome, and only differ by whitespace-only chunking"

Bad:

- "mixed-script boundaries, arbitrary rechunking, and different inline policies should match a plain-text path exactly"

If a differential oracle keeps failing for honest cases, narrow it until it becomes true.

## Timeout Budget Is Part Of The Verifier

If the only failure is "the browser-backed check needed longer than Bun's default timeout", that is a verifier problem, not automatically a product problem.

Set an explicit timeout budget for slower but still trustworthy checks.

Examples:

- `30_000ms` browser-backed semantic flow for a drag demo
- `35_000ms` browser-backed semantic flow for a heavier gallery
- one broader corpus pass that is only run manually before compressing back down

Don't confuse "slow oracle" with "wrong behavior".

## Strip Transport Noise

Keep transport correctness in the report, but don't make it part of the checked behavior.

Good:

- keep `requestId` while transporting the report
- assert on `orderedCardIds`, `selectedText`, `visibleRowRange`, or `topItemId`

Bad:

- snapshotting a transport nonce as if it were product behavior
- treating "Chrome exited" as the semantic answer

## What Belongs In A Demo Spec

A demo spec should mostly say:

- what the demo does
- what the fragile seams are
- which scenarios must be proven

It should not keep re-explaining:

- how `requestId` works
- which browser transport is acceptable
- why phase markers help
- why the runner should stay dumb

Keep that shared machinery in the docs so every new spec does not fork the repo's verification style.

For how to run this workflow end to end, see `ai-demo-reconstruction.md`.
For how to shape the demo packet itself, see `minimum-viable-demo-spec.md` and `spec-writing-for-demos.md`.

## What "Done" Means

When iterating alone, "tests pass" is usually too weak.

A better stopping condition is:

- the chosen small fixtures pass
- one broader pass agreed before being compressed away
- one sensitivity check proves the oracle can notice a meaningful regression
- the fragile seam is asserted directly if there is one
- any remaining blind spots are named explicitly

That is usually enough structure for AI to keep working without turning the repo into verifier theater.
