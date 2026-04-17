# Verification

This doc details ways to prioritize verifications & make them solid.

AI should specialize verification to the problem at hand. Don't start by inventing verifier architecture.

The goal is not "more tests". The goal is a loop that catches the regressions you're actually likely to make while staying cheap enough to rerun constantly.

## Main Principle

Prefer the cheapest trustworthy oracle.

Examples:

- If the bug is "this chip should never split", check fragment topology directly.
- If the bug is "this card height drifted", compare height directly.
- If the bug is "this browser flow should end on the same selected item", let the page compute that report itself. See `automating-browsers.md`.

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

## Static Facts Are One Oracle

If the guarantee is source-owned arithmetic, state it beside the helper and check it without opening the page.

Good:

- column count stays in `int[1, 7]`
- centered offset uses `(container - containee) / 2`
- stacked row tops advance by previous height plus gap
- every measured line width fits the offered width

Bad:

- using a browser run as evidence for pure helper math
- forcing native selection, scroll physics, or storage behavior into a source-only proof

Use static facts for app-owned geometry. Use browser reports for browser-owned seams.

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

## Internal Invariants Want Pure Tests

If the bug is "our line boundary bookkeeping skipped text", don't wait for a browser canary to stumble into it.

Add a tiny pure test for the invariant itself.

Examples:

- joining all reported line slices should recover the original normalized text
- walking lines one by one should produce the same line count as the batch layout path
- splitting one rich inline run into equivalent adjacent runs should not change the fragment sequence

Then keep the browser check focused on the user-visible seam, e.g. height, selected text, or visible item ids.

## Assert The Fragile Seam Directly

If the bug hides in one tiny interaction, assert that interaction directly.

This kept coming up in the experiment:

- clicking a grid caption should select the full prompt and stay in grid mode
- dismissing line mode should bring the focused row back with roughly `40px` of space above it
- dragging past the next midpoint should reorder before release
- the released item should stay above the stack until it settles
- occlusion should mean mounted count is less than the full item count on a representative state

These are better than a vague "happy path" check that only implies the behavior indirectly.

## Animated Seams Need One Transition Snapshot

If a refactor moves child geometry from CSS or DOM flow into JS, don't only compare the final resting states.

Also snapshot one representative transition frame.

Good:

- 2D card rect before click
- the same card's prompt rect at `t=16ms` after entering 1D
- widest rendered prompt line at that same frame

Bad:

- only final 2D vs final 1D snapshots
- only outer card rects when the bug can live in a child rect

A lot of animation regressions are "the base layout is right, but one child box teleported or overflowed during the handoff." Steady-state snapshots won't see that.

## Resize Bugs Usually Need A Trajectory Report

Resize bugs often start and end in the right place and only go wrong in the middle.

Good:

- sample `t=0`
- sample `t=16ms`
- sample `t=64ms`
- sample `settled`
- include the anchored item's viewport `y`
- include same-row items' size and position

Bad:

- only checking the settled column count
- only checking one screenshot after resize ends

This catches bugs like:

- "the anchored image starts at `40px`, dives offscreen, then comes back to `40px`"
- "the first row keeps the same items but they pop to final size on frame `1`"

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

If the snapshot is meant to be consulted by machines, check in the machine-readable file directly.

Good:

- `chrome-step10.json`
- `status/dashboard.json`
- one compact per-scenario report

Bad:

- hand-copied markdown tables
- prose counts that can drift from the real sweep

If you still want a human summary, derive it from the checked-in JSON. Don't make humans keep two truths aligned by hand.

## Batch The Cheap Homogeneous Cases

If the cases only differ by one boring dimension such as width, locale, or one seeded scenario id, batch them inside one opened page.

Good:

- one corpus page load that measures widths `300..900 step=10`
- one note-layout page load that reports visible row ranges for several fixed scroll positions

Bad:

- relaunching the browser for every width
- rebuilding the same text state 61 times just to collect 61 heights

Keep the batch homogeneous. If the shape of the work changes, start a new page run.

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

## If JS Owns Text Geometry, Let One Proof Path Own It

If JS layout computes line count or comment height, don't stop there. Also check the painted line fragments.

Good proof path:

- one pure layout helper returns `rowRect`, `commentRect`, `blockRects`, `lineRects`, `fragmentRects`
- render projects those packets
- hit testing and search highlight consume those same packets

This does _not_ mean every subsystem shares one identical rect. It means there is one base geometry model.

It is still fine to leave explicit browser seams for things like:

- native selection and copy
- caret placement from live DOM
- link opening

Good:

- `lineCount`
- `commentHeight`
- `commentInnerWidth`
- `widestRenderedLine`
- one assertion like `widestRenderedLine <= commentInnerWidth`

Bad:

- only checking the container height
- assuming the DOM text flow must match the layout helper because "the text is easy"

This is how you catch "the comment height says `1` line but the last word wrapped anyway."

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

## Temporary Refactor Oracles

If the question is "did this refactor preserve the old layout?", let the old code be the oracle for a bit.

Generate a one-off report from the old code right before the refactor, then diff the new code against it on the same machine and browser.

Good:

- item `x/y/width/height`
- per-line rects
- per-token rects when wrapped text must stay exact
- a few representative widths in one run

Bad:

- keeping the giant dump forever as the official test suite
- comparing exact geometry across different browsers or machines
- using screenshots when a small geometry dump would say the same thing more directly

This is great for questions like "did this refactor move any text at all?" Keep the bulky oracle just long enough to earn confidence, then throw it away and keep the small permanent canaries.

## Differential Checks

Differential checks are high leverage, but only when the compared systems are actually semantically equivalent.

Good:

- "all items use the same font, have no extra chrome, and only differ by whitespace-only chunking"

Bad:

- "mixed-script boundaries, arbitrary rechunking, and different inline policies should match a plain-text path exactly"

If a differential oracle keeps failing for honest cases, narrow it until it becomes true.

## Switch Verifiers By Mechanical Diff

If you want to replace one verifier transport or browser driver with another, prove they agree before switching.

Good:

- generate a temporary Chrome corpus sweep JSON with Playwright
- mechanically diff it against the checked-in Chrome sweep JSON
- only switch once the diff is empty

Bad:

- "the numbers seem close"
- eyeballing a few rows
- silently writing a new baseline just because the transport changed

This is especially important when swapping:

- headed vs headless browser modes
- AppleScript vs Playwright vs CDP
- one snapshot format vs another

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

For how to run this workflow end to end, see `demo-reconstruction.md`.
For how to shape the demo packet itself, see `../../todos/minimum-viable-demo-spec.md` and `../../todos/spec-writing-for-demos.md`.

## What "Done" Means

When iterating alone, "tests pass" is usually too weak.

A better stopping condition is:

- the chosen small fixtures pass
- one broader pass agreed before being compressed away
- one sensitivity check proves the oracle can notice a meaningful regression
- the fragile seam is asserted directly if there is one
- any remaining blind spots are named explicitly

That is usually enough structure for AI to keep working without turning the repo into verifier theater.
