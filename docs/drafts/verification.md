# Verification

This doc is about choosing checks that actually catch the bugs we're likely to make.

Don't start by inventing a whole checking system. Start with the failure you care about.

The goal is not "more tests". The goal is a loop cheap enough to rerun constantly, and sharp enough to complain when the layout is genuinely wrong.

## Use The Cheapest Check That Tells The Truth

Pick the smallest thing that can really see the bug.

Examples:

- If the bug is "this chip should never split", check fragment topology directly.
- If the bug is "this card height drifted", compare height directly.
- If the bug is "this browser flow should end on the same selected item", let the page compute that report itself. See `automating-browsers.md`.

Don't force every demo or helper through one shape.

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

## Pick The Kind Of Check

Different bugs want different checks.

Good options:

- a tiny policy test
- a compact layout snapshot
- a page-owned browser report
- a narrow diff against old code
- a seeded random pass

Use the simplest one that can really catch the bug you care about.

## Put Source Facts On Pure Helpers

If the guarantee is just layout math, state it beside the helper and check it without opening the page.

Good:

- column count stays in `int 1..7`
- centered offset uses `(container - containee) / 2`
- stacked row tops advance by previous height plus gap
- every measured line width fits the offered width

Bad:

- using a browser run as evidence for pure helper math
- forcing native selection, scroll physics, or storage behavior into a source check

Use static facts for app-owned geometry. Use browser reports for browser-owned behavior.

Put the smallest useful `@fit` contract above the pure helper itself. Keep the claim close to the code that earns it:

```ts
/** @fit
 * given rowSizes.length: int 0..200
 * given rowSizes[]: 0..1000
 * result.length == rowSizes.length
 */
function stackLayout(rowSizes: number[], paddingTop: number) {
  const result = []
  let top = paddingTop
  for (const rowSize of rowSizes) {
    result.push(top)
    top += rowSize
  }
  return result
}
```

Prefer boring facts like length, bounds, and copied fields first. If a contract needs a paragraph of setup or knows too much about the page, the fact probably belongs in a smaller helper or a browser-owned report.

## Source Contracts Should Be Small And Earned

The useful contracts we added were not grand claims. They were plain facts on small helpers:

- `clamp(min, value, max)` returns between `min` and `max`
- a rect helper copies `x`, `y`, `width`, and `height`
- grid sizing returns `cols` inside `int 1..7`
- hit geometry returns one hit box per visible row
- scroll anchor math moves by `currentY - previousY`

These are good because the source can earn them. A caller can then use the helper contract without knowing the helper body.

Preconditions count. A clamp contract that says `result <= max` is only true if `max >= min`:

```ts
/** @fit
 * given min: -100000..100000
 * given value: -100000..100000
 * given max: -100000..100000
 * given max >= min
 * result >= min
 * result <= max
 */
function clamp(min: number, value: number, max: number) {
  return Math.min(Math.max(value, min), max)
}
```

If a helper needs that input promise, put it in the contract. Don't let every caller rediscover it as a weird layout failure.

Use negative probes too. After adding a contract, briefly break the code in the boring way:

- swap `min` and `max`
- make `cols` reach `8`
- forget to copy `height`
- push one fewer hit box than rows

The checker should complain. If it doesn't, the contract is probably decoration.

Don't prove everything. Prove the places that are cheap and likely to regress: lengths, bounds, copied fields, row order, hit areas, min/max guarantees. Leave native selection, browser scrolling, text painting, and storage behavior to browser reports.

Sometimes a tiny helper is worth extracting because it names a real dependency. E.g. `scalePointIntoRect` is better than a large loop contract if several coordinates all depend on the same transform. But don't extract just to make the checker happy. The helper should still be a useful piece of app code.

Responsive layout also benefits from explicit domains. A line like `given windowWidth: 320..2000` is not paperwork. It says which screens the layout actually supports, and it stops thin impossible layouts from quietly becoming part of the app.

## Demos Usually Want Two Layers

Public demos usually want:

- a few pure tests for deterministic helpers
- one browser report for the actual user-visible flow

Examples of good pure tests:

- grid layout math
- reorder threshold logic
- line hit-area routing
- release velocity estimation

Examples of good browser checks:

- selected text after clicking a caption
- visible row range after dismissing an overlay
- ordered card ids after a drag path
- which item stays on top during release settle

Pure tests are great for policy and math. Browser checks are great for "what does a real opened demo do?"

## Check Internal Bookkeeping Directly

If the bug is "our line boundary bookkeeping skipped text", don't wait for a browser check to stumble into it.

Add a tiny pure test for the bookkeeping rule itself.

Examples:

- joining all reported line slices should recover the original normalized text
- walking lines one by one should produce the same line count as the batch layout path
- splitting one rich inline run into equivalent adjacent runs should not change the fragment sequence

Then keep the browser check focused on the user-visible edge, e.g. height, selected text, or visible item ids.

## Assert The Fragile Interaction Directly

If the bug hides in one tiny interaction, assert that interaction directly.

This kept coming up in the experiment:

- clicking a grid caption should select the full prompt and stay in grid mode
- dismissing line mode should bring the focused row back with roughly `40px` of space above it
- dragging past the next midpoint should reorder before release
- the released item should stay above the stack until it settles
- occlusion should mean mounted count is less than the full item count on a representative state

These are better than a vague "happy path" check that only implies the behavior indirectly.

## Animation Handoffs Need One Transition Snapshot

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

## Snapshot The Thing Users Care About

When you snapshot behavior, snapshot the thing the user would notice.

Good:

- line count
- note height
- arrays like `['body:Ship', 'chip:@maya']`
- visible item ids
- a compact positioned-card summary

Bad:

- giant DOM dumps
- raw screenshots as the only answer
- text-only snapshots that throw away distinctions the UI actually cares about

A good snapshot is small, readable, and obviously tied to user-visible behavior.

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

Keep the batch same-shaped. If the work changes, start a new page run.

## Model Geometry Must Match Render Geometry

Some bugs are not really "the line breaker is wrong". They are "the model measured against one width, then the DOM rendered at another width."

Common shape:

- measure a bubble, card, or text block against width A
- then CSS or a later projection step clamps it to width B
- now the wrapping looks wrong even if the layout policy itself is fine

Treat this as its own kind of bug.

Good browser probe:

- model width
- rendered container width
- widest rendered row or fragment edge
- a simple assertion like `widestRow <= renderedInnerWidth`

This is often much better than a screenshot diff.

Screenshots are still great for discovery and debugging. But the permanent check should usually be a small geometry report the page computes itself.

If the system does "measure first, then shrink/clamp in CSS", assume that is a bug smell until proven otherwise.

## If JS Owns Text Geometry, Let One Layout Path Own It

If JS layout computes line count or comment height, don't stop there. Also check the painted line fragments.

Good:

- one pure layout helper returns `rowRect`, `commentRect`, `blockRects`, `lineRects`, `fragmentRects`
- render projects those packets
- hit testing and search highlight consume those same packets

This does _not_ mean every subsystem shares one identical rect. It means there is one base geometry model.

It is still fine to leave explicit browser checks for things like:

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

That second kind of bug wants a tiny policy test, not just better canvas fidelity.

## Performance Needs Benchmark Then Profile

A benchmark tells you whether something moved. A profile tells you where time or allocations went.

Use both, in that order:

- keep a coarse benchmark snapshot for the user-facing workload
- when it moves, run a focused browser profile on the same kind of work
- name the hot path, e.g. `prepare tracked text`, `line walking`, or `visible row calculation`
- decide whether the cost is CPU, allocation churn, or retained memory

Good:

- a median benchmark for `layout()` before and after a text-engine change
- a Chrome CPU profile for the line-walker loop if that benchmark regresses
- heap sampling during the same loop if the question is allocation churn

Bad:

- staring at a profile without first proving the workload regressed
- treating a faster microbenchmark as enough when the real browser benchmark moved
- optimizing a sampled helper before checking whether the helper is on the user-visible path

Keep permanent perf evidence compact. The checked-in artifact should usually be the benchmark JSON or a small machine-readable summary. Raw CPU and heap profiles are excellent investigation notes, but too bulky and environment-shaped to become the normal truth.

## Keep Laws Narrow And Earned

Laws are great when they are real.

Good examples:

- increasing available width should not increase line count
- splitting one text run into two equivalent runs should not change layout
- merging adjacent equivalent runs should not change layout

But only keep laws you've earned.

If a plausible law fails, demote the law. Don't contort the code to satisfy a fake theorem.

## Use Local Helpers, Not Repo-Wide Rules

Sometimes a local pure helper or model makes verification much easier. That's good.

Examples:

- a helper that turns rich inline specs into line fragments
- a layout function that returns item positions and total height

Use those helpers when they buy leverage:

- deterministic measurement
- compact snapshots
- mutation checks
- cheap-vs-rich comparisons

Don't turn that into a repo-wide rule that every demo needs a shared checking interface.

## Randomized Checks

Seeded randomized checks are great for exploration and for boundary-heavy spaces.

Guidelines:

- keep them seeded and reproducible
- print or preserve the failing seed
- reduce the failing case into a small permanent fixture when possible
- prefer domain-shaped generation over arbitrary noise

## Use Old Code While Refactoring

If the question is "did this refactor preserve the old layout?", let the old code be the answer for a bit.

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

This is great for questions like "did this refactor move any text at all?" Keep the bulky report just long enough to earn confidence, then throw it away and keep the small permanent canaries.

## Differential Checks

Diff checks are high leverage, but only when the two systems are actually supposed to match.

Good:

- "all items use the same font, have no extra chrome, and only differ by whitespace-only chunking"

Bad:

- "mixed-script boundaries, arbitrary rechunking, and different inline policies should match a plain-text path exactly"

If a diff keeps failing for honest cases, narrow it until it becomes true.

## Switch Check Runners By Mechanical Diff

If you want to replace one browser driver or report transport with another, prove they agree before switching.

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

## Timeout Budget Is Part Of The Check

If the only failure is "the browser check needed longer than Bun's default timeout", that is a check problem, not automatically a product problem.

Set an explicit timeout budget for slower but still trustworthy checks.

Examples:

- `30_000ms` browser flow for a drag demo
- `35_000ms` browser flow for a heavier gallery
- one broader corpus pass that is only run manually before compressing back down

Don't confuse "slow check" with "wrong behavior".

## Strip Transport Noise

Keep transport correctness in the report, but don't make it part of the checked behavior.

Good:

- keep `requestId` while transporting the report
- assert on `orderedCardIds`, `selectedText`, `visibleRowRange`, or `topItemId`

Bad:

- snapshotting a transport nonce as if it were product behavior
- treating "Chrome exited" as the product answer

## What Belongs In A Demo Spec

A demo spec should mostly say:

- what the demo does
- what the fragile interactions are
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
- one sensitivity check proves the check can notice a meaningful regression
- the fragile interaction is asserted directly if there is one
- any remaining blind spots are named explicitly

That is usually enough structure for AI to keep working without turning the repo into test theater.
