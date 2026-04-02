# Verification

AI should specialize verification to the problem at hand. Don't start by inventing a verifier architecture.

The goal is not "more tests". The goal is a loop that catches the regressions we're actually likely to make while staying cheap enough to run all the time.

## Main Principle

Prefer the cheapest trustworthy oracle.

Examples:

- If the bug is "this chip should never split", check fragment topology directly
- If the bug is "this card height drifted", compare height directly
- If the bug is "Safari and Chrome disagree", let the page compute the report itself. See `ai-automating-browsers.md`

Don't force every demo or subsystem through one shared verifier shape. AI can usually specialize the right loop faster than we can design a universal one.

## Get Wider Then Narrower

Start with the smallest repro you can trust. If a text box wraps wrong, don't start by rerunning a whole corpus. Start with one short string and one width where the behavior is obvious.

That tiny repro is for iteration speed:

- easy to rerun
- easy to reason about
- easy to falsify a bad hypothesis

But don't stop there. Once the fix feels right, broaden temporarily so you don't overfit the toy case.

For example:

- keep a small permanent suite like repeated spaces, one hard break, one whitespace-only middle line, one tab case
- do one temporary brute-force pass over a much bigger generated matrix
- if the bigger pass agrees, keep the small suite and throw the brute-force pass away

Don't keep the big exploratory checker forever just because it helped once. That usually turns verification into clutter.

## Some Bugs Are Measurement Bugs. Some Are Policy Bugs.

This distinction matters.

Measurement bug:

- the layout logic is fine
- the widths are wrong
- better browser measurements or a real canvas backend would help

Policy bug:

- the widths can be perfectly fine
- the line walker still makes the wrong choice
- better measurement alone will not save you

Concrete example:

- `foo ` followed by `abcdef`
  - wrapping before `abcdef` can be correct if the current line would only fit a partial slice of that first word
- `vertical text` followed by ` research, but keep going`
  - wrapping before the whole second item is wrong if the current line can already fit a real breakable unit like `research, but`

That second kind of bug wants a small white-box policy canary, not just better canvas fidelity.

## Invariances

Invariances, covariance, and contravariance are great when they're real. They're a bad fit when we only wish they were real.

Good examples:

- increasing available width should not increase line count
- adding chrome to an inline box should not improve fit
- splitting one text run into two equivalent runs should not change layout
- merging adjacent equivalent runs should not change layout

But only keep laws you've earned.

If a plausible law fails, demote the law. Don't contort the code to satisfy a fake theorem.

Example:

- turning a breakable item into an atomic one sounds like it should only worsen fit
- but if atomic overflow is allowed at line start, it can reduce line count

That means the law was too broad, not necessarily that the implementation was wrong.

## Choose The Oracle

Different problems want different oracles.

Good options:

- direct semantic snapshots for representative fixtures
- differential checks against a simpler existing path, but only when the semantics really match
- cheap-vs-rich agreement checks, where a fast path and a richer path must agree on shared outputs
- sensitivity checks, where one meaningful perturbation should change the result
- seeded randomized generation for boundary-heavy spaces
- browser automation when the browser itself is the source of truth
- tiny white-box policy canaries for internal heuristics

Don't cargo cult fuzzing or QuickCheck-style systems. Use them when the space is combinatorial and the failures reduce cleanly. Skip them when a few explicit fixtures tell the story better.

## Layout Verification

For layout work, verify semantics rather than screenshots when possible.

Good things to assert:

- line count
- total height
- per-block height
- representative line texts
- fragment topology for mixed inline content
- atomicity of items that must not split
- whether a collapsed boundary space was paid or dropped
- whether a known fragile width keeps or loses a particular word on a line

For text layout, browser-free verification is often enough to catch the interesting regressions:

- line wrapping drift
- line count drift
- mixed-style fragment topology drift
- disagreements between a cheap measurer and a richer layout path

This is especially good when the text engine can measure deterministically in-process.

But know the blind spots:

- browser-free tests won't catch CSS drift by themselves
- if TS says a pill has `22px` of chrome and CSS now renders `26px`, pure layout tests may still pass
- a fake measurement backend can miss threshold-sensitive wraps

So either keep layout-relevant constants in one place, or add a targeted browser check when box-model coupling matters.

## Semantic Snapshots

When you snapshot layout, snapshot the semantics that matter.

Good:

- line count
- note height
- arrays of line fragments like `['body:Ship', 'chip:@maya']`

Bad:

- giant DOM dumps
- raw screenshots as the only regression oracle
- text-only snapshots that throw away the distinction between `body`, `code`, `chip`, and gaps

A good semantic snapshot is small, readable, and obviously tied to a user-visible behavior.

Also add at least one sensitivity check. Intentionally perturb one meaningful fact and make sure the snapshot changes. Otherwise a stable snapshot may just be too weak.

When a real bug shows up at a fragile threshold, keep that width. Don't just keep the broad "desktop", "tablet", and "mobile" snapshots.

## White-Box Policy Canaries

Black-box demo snapshots are not enough on their own.

If the implementation has a meaningful policy seam, test it directly with a tiny fixture.

Good examples:

- wrap before a long first word rather than splitting it after a boundary space
- do not wrap before a multi-word run when the current line can already fit a real breakable unit from it
- drop a collapsed boundary space at line start
- keep an atomic chip whole even when it overflows

This is still outcome-focused testing. Don't assert that some private branch ran. Assert the policy outcome on a minimal repro.

## Local Seams, Not Mandatory Architecture

Sometimes a local pure helper or model makes verification much easier. That's good.

Examples:

- a helper that turns rich inline specs into line fragments
- a layout function that returns block heights and per-line fragments

Use those seams when they buy leverage:

- deterministic measurement
- semantic snapshots
- mutation checks
- cheap-vs-rich comparisons

Don't turn that into a repo-wide rule that every demo must expose a shared verifier interface or a dedicated model module.

Keep it local first. Generalize later when there's a second real use.

## Randomized Checks

Seeded randomized checks are great for exploration and for catching boundary interactions we would not have hand-written.

Guidelines:

- keep them seeded and reproducible
- print or preserve the failing seed
- reduce the failing case into a small permanent fixture when possible
- prefer domain-shaped generation over totally arbitrary strings

Examples:

- random inline runs with mixed fonts, spaces, and atomic items
- random widths around likely wrap thresholds
- random split and merge transforms over the same content

## Differential Checks

Differential checks are high leverage, but only when the compared systems are actually semantically equivalent.

Good:

- "all items use the same font, have no extra chrome, and only differ by whitespace-only chunking"

Bad:

- "mixed-script boundaries, arbitrary rechunking, and different inline policies should match a plain-text path exactly"

If a differential oracle keeps failing for honest cases, narrow it until it becomes true. A narrow true oracle is more useful than a broad fake one.

## Browser Checks

Use the browser when the browser is the thing under test:

- font resolution
- actual CSS box model
- element-specific behavior
- browser-specific typography quirks

When doing that, keep the runner dumb and the page smart. See `ai-automating-browsers.md`.

## What "Done" Means

When iterating alone, "tests pass" is usually too weak.

A better stopping condition is:

- the chosen small fixtures pass
- the chosen invariances pass
- one richer or broader pass agreed before being compressed away
- one sensitivity check proves the oracle can notice a meaningful regression
- any remaining blind spots are named explicitly

That is usually enough structure for AI to keep working safely without turning the repo into verifier theater.
