# Verification

AI should specialize verification to the problem at hand. Don't start by inventing verifier architecture.

The goal is not "more tests". The goal is a loop that catches the regressions you're actually likely to make while staying cheap enough to rerun constantly.

## Main Principle

Prefer the cheapest trustworthy oracle.

Examples:

- If the bug is "this chip should never split", check fragment topology directly.
- If the bug is "this card height drifted", compare height directly.
- If the bug is "this browser flow should end on the same selected item", let the page compute that report itself. See `automating-browsers.md`.

Don't force every demo or helper through one verifier shape.

## One Semantic Core, Several Precision Mechanisms

If a verifier grows past a couple of hand-written checks, don't bolt each new trick onto a fresh code path.

Prefer one semantic core, then several precision mechanisms on top of it.

For example, the same layout function can be checked three different ways:

- a symbolic check for `layoutHeight = imageHeight + captionHeight + bottomGap`
- a width-interval pass proving `cols` stays in `1..7`
- a concrete width sweep over `320..1600`

Those are not three different verifier architectures. They are three ways of looking at the same code.

This matters because demos often want a mix:

- exact equalities for small helper functions
- cheap range proofs for simple formulas
- concrete sweeps for small real domains such as viewport widths
- browser seam checks for the final rendered behavior

Keep those under one semantic model when you can.

## Quotient / Remainder Checks Should Mention Geometry

If a grid uses `Math.floor(i / cols)` and `i % cols`, don't stop at "the remainder stays in `0..cols-1`".

Tie that math to something visible.

Good:

- the card at index `i` is centered in the column slot implied by `i % cols`
- two same-row neighbors only overlap if their slot math is wrong
- the row top used for index `i` matches the row implied by `Math.floor(i / cols)`

Bad:

- proving `%` facts in isolation and never checking whether the placed rect actually lands in the expected slot

The point of quotient / remainder reasoning is not number trivia. It is to catch wrong row / column placement.

## Lower Natural Code Once

If you do build a static verifier, stop analyzing raw syntax forever.

Parse ordinary TS/JS, then lower the useful subset once into a smaller internal form. After that, run your symbolic checks, range checks, and concrete checks over that lowered form.

The high-ROI subset is usually bigger than people assume:

- locals
- `if`
- `for` / `while`
- `break` / `continue`
- arrays and indexing
- object literals and spread
- `?.` / `??`
- `Math.min`, `Math.max`, `Math.floor`, `Math.ceil`
- small pure helper functions

That is enough to cover a lot of real layout code without forcing authors into a verifier DSL.

Do draw a semantic boundary.

Good verifier subset:

- first-order pure helpers over numbers, arrays, and records
- append-only arrays like `rowsTop`
- local mutation inside one layout pass

Bad verifier subset:

- dynamic property names
- getters and prototype tricks
- unknown callbacks
- async and exceptions
- shared mutable state captured all over the place

Don't make authors write `add(...)` and `sub(...)` just because the verifier is young. Grow the verifier up to the natural code first.

## Append-Only Arrays Want A Tiny Sequence Domain

Layout code loves arrays, but it often uses a very narrow shape:

- `rowsTop.push(previousBottom + gap)`
- `visibleRows.push(rowGeometry)`
- `rects.push(nextRect)` or merge with the previous one

Don't answer that with a giant generic array theory.

Usually a tiny sequence domain goes further:

- exact length when the loop count is known
- last element
- joined item shape
- "strictly increasing numbers" for arrays like `rowsTop`
- exact small items when the array stays tiny

That is enough to prove a lot of useful layout facts:

- `rowsTop` stays ordered
- the second row starts at the first row's bottom
- one output row is produced per input row
- `rects.at(-1)` really means the last merged rect

Grow the array model around the append-only shapes the code actually uses.

## Verifier Changes Want Deliberate Red Tests

When you teach the verifier a new proof surface, don't stop at "the report is still green".

Also make one intentional mistake and keep that as a canary.

Good:

- break one column formula and make sure the grid-slot law fails
- shift one row top by `1` and make sure the row-contiguity law fails
- route empty-space selection to the wrong side of a midpoint and make sure the text-offset law fails

Bad:

- only adding new green cases
- trusting a wider proof because it "sounds right"

A verifier that only ever sees passing examples is still mostly untested.

## Callback Helpers Are Effect Boundaries

Keep ordinary helper calls pure from the caller's point of view.

For example, if `lineBreakCharCountAt(text, offset)` returns a number, the verifier should not pretend that calling it mutates the caller's locals.

Callback-style helpers are different. If you model something like:

```ts
walkVisibleLines(flow, width, line => {
  totalHeight += line.height
  lineTops.push(totalHeight)
})
```

then that helper is an effect boundary. The verifier needs an explicit contract saying that the callback's local mutations flow back out through `walkVisibleLines(...)`.

That is narrower and more honest than making every function call effectful.

The useful split is:

- ordinary helpers stay pure
- callback helpers get explicit contracts
- browser seams stay outside the proved zone

## Ship Opaque Contracts As Data

If a helper is opaque to the analyzer, don't make every verifier hand-write a custom callback for it forever.

Prefer a small contract file the library can ship as data.

For example:

```ts
export const staticLayoutContracts = {
  walkVisibleLines: contract.forEachArrayItem(0, ['lineRanges'], 2),
  layoutNextLine: contract.lookupArrayItem(0, ['lines'], 1, ['segmentIndex'], {defaultNull: true}),
}
```

For example, a text library could ship facts like:

- `walkVisibleLines(...)` calls its callback once per visible line range
- `layoutNextLine(...)` returns `lines[cursor.segmentIndex]` or `null`
- `measureFragmentTextWidth(fragment, text)` is proportional to `text.length` in a synthetic verifier mode

That keeps the analyzer generic:

- the core understands language semantics
- the library ships its own opaque contracts
- app code stays ordinary

This is closer to a semantic `.d.ts` than a hard-coded verifier plugin.

If the verifier can discover sibling `*.static-contracts.ts` files from the analyzed source and its relative imports, then "bring in the lib and it works" starts becoming realistic.

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

## Bring In A Different Shape Early

Once one regular case is proven, bring in a second shape early.

Example:

- first demo: a regular image grid
- second demo: an indented row stack with visible-row bookkeeping

Do _not_ wait until the first demo is "fully solved". That is how the verifier quietly overfits to one style of geometry.

Keep the second proof perimeter narrow.

Good:

- row tops stay monotone
- content height matches the last row bottom
- comment left edge equals `indent * indentWidth + leftGap`

Bad:

- insisting the second demo also proves native selection, caret placement, and browser range geometry on day one

The point of the second shape is to test whether the verifier architecture generalizes, not to drag every browser seam into the static core immediately.

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
