# Notes

This folder tracks a spec-driven reconstruction experiment.

The generated implementation folders were pruned later. This archive keeps the chronology, but some old path references now point to runs that only still exist in git history.

Rules for the experiment:

- The main thread writes or refines specs.
- Each round uses fresh subagents.
- Each subagent must read `docs/` and its spec first, especially `docs/verification.md`.
- Each subagent must not inspect `demos/`.
- Each subagent writes tests first, then code, then validates against those tests.
- Failures here are useful. They show either a docs gap, a spec gap, or both.

## Round 1

### Photo Gallery

- Strong first pass. The worker reproduced the core interaction model from docs plus spec: responsive grid, line mode, hash routing, spring motion, dismiss-to-row scrolling, occlusion, and browser-backed semantic checks.
- The round's tests passed when run directly in `/Users/chenglou/github/vibescript/drafts/demos_with_specs/photo-gallery/round-01`.
- Miss: line mode does not truly lock scrolling underneath the overlay. The spec said line mode should disable scrolling, but the implementation keeps the scroll container alive underneath a fixed layer.
- Miss: clicking a caption does not select the whole caption text the way the original demo does. The spec only said "select its text", which was too loose.
- Gap signal: the worker chose a very local Safari AppleScript harness for browser checks. It worked here, but this is more ad hoc than the rest of the repo. We may want a clearer repo-level pattern for lightweight browser-backed verification.

### Draggable Cards

- Partial failure. The worker got the core logic and pure tests in place, but the round did not land cleanly end-to-end.
- `bun test logic.test.ts` passes in `/Users/chenglou/github/vibescript/drafts/demos_with_specs/draggable-cards/round-01`.
- The browser-backed test setup is miswired. `browser.spec.ts` is written in Playwright style, but the worker tried to run it through `bun test`, which fails before any browser scenario runs.
- Root `bun check` fails because `/Users/chenglou/github/vibescript/drafts/demos_with_specs/draggable-cards/round-01/index.ts` has a parse error near the duplicated import block at the top of the file.
- Gap signal: the spec and docs were not explicit enough about what "write browser-backed tests" should look like in this repo. The worker invented a second toolchain and a round-local `package.json`, which is probably not the direction we want.

### Cross-Cutting Notes

- The experiment already surfaced a meta-pattern worth keeping: spec-driven reconstruction with fresh agents is a good way to measure where docs end and hidden repo knowledge begins.
- Round 1 suggests that behavior-heavy UI specs work better than tooling-light specs. The photo spec constrained behavior tightly enough that the worker mostly landed it. The draggable spec left too much room around verification plumbing and delivery shape.
- For the next round, tighten the specs around:
  - what counts as "caption selection"
  - scroll lock expectations in overlay modes
  - the required verification command and toolchain
  - the requirement that the round must pass the repo root `bun check`

## Round 2

### Photo Gallery

- Incomplete. The fresh worker rebuilt the data and pure layout/hit-area seams first, and the pure tests passed, but it did not finish the demo UI in this round.
- Signal: even with a stronger spec, the full photo-gallery rebuild is a large enough one-shot task that completion reliability is now part of the experiment.
- This is different from round 1, where the first fresh worker did complete the demo. So round-to-round completion variance is itself worth noting.

### Draggable Cards

- Improved shape, but still not clean end-to-end.
- The fresh worker avoided the parse error from round 1 and kept the demo/test split simpler.
- Pure logic and demo code landed in `/Users/chenglou/github/vibescript/drafts/demos_with_specs/draggable-cards/round-02/`.
- Miss: browser-backed tests still depend on `playwright`, but no dependency was installed, so `bun test index.test.ts` fails with `Cannot find package 'playwright'`.
- Signal: tightening the spec helped with delivery shape, but we still need a repo-preferred browser-check pattern that does not encourage every worker to rediscover dependency management.

### Cross-Cutting Notes

- The experiment structure itself needs a rule for archive hygiene. Historical failed rounds under `drafts/demos_with_specs/**` currently poison the repo root `bun check`.
- We likely want one of these patterns:
  - a `current/` path that is typechecked and served by default, plus archived rounds excluded from default checks
  - round folders kept outside the default `tsconfig` include set
  - an experiment-specific check command separate from the repo's main `bun check`
- Implemented: the repo default loop now stays on `demos/`, while experiments are served separately with `bun run start:specs`.
- New spec tweak for the next round:
  - photo-gallery should build a minimal complete end-to-end slice before polishing
  - draggable-cards should avoid undisclosed external browser-test dependencies

## Round 3

### Photo Gallery

- Converged.
- The worker produced a full UI implementation plus pure tests and browser-backed semantic checks.
- `bun test drafts/demos_with_specs/photo-gallery/round-03/pure.test.ts` passes.
- `bun test --timeout 30000 drafts/demos_with_specs/photo-gallery/round-03/browser.test.ts` passes.
- Important nuance: the earlier failure was not a product failure. It was a harness-timeout failure from using Bun's default 5s timeout on a slower no-extra-dependency browser run.
- Main lesson: the photo-gallery browser checks need an explicit timeout budget closer to 30s.

### Draggable Cards

- The demo and pure tests look good, but the browser-backed runner is still not stable under repeated verification.
- A first isolated run passed, but repeated re-runs exposed instability in the no-extra-dependency browser harness.
- Main-thread stabilization attempts on round 3 did not fully fix it. The harness remained sensitive to runner choice and timeout behavior.
- Main lesson so far: the sharper no-extra-dependency guidance helped, but we also need a clearer repo-blessed browser runner for this class of interaction demo.

### Cross-Cutting Notes

- The photo-gallery experiment also converged once the browser timeout was made explicit.
- New harness lesson: some no-extra-dependency browser checks are slow but still good. Budget that in the test command instead of treating it as a product regression.
- The draggable experiment is still open specifically on browser-runner robustness.

## Round 4

### Photo Gallery

- Aborted.
- A fresh round-4 worker was started before round-3 was fully re-verified.
- Once round-3 passed with the correct browser-test timeout, round 4 was no longer needed.

### Draggable Cards

- Fresh retry focused on browser-runner robustness.
- The worker produced a full round again: pure logic, demo UI, and a browser harness with loopback probing and requestId polling.
- Result: still not converged.
- `bun test drafts/demos_with_specs/draggable-cards/round-04` failed in two ways:
  - the browser-backed tests timed out
  - one pure velocity test expected the wrong value (`1600` vs actual `666.67` from the fixture)
- This strengthens the conclusion that the remaining problem is the verifier path, not the core drag/reorder demo shape.

## Pre-Round 5 Notes

### Browser Harness Gaps

- Likely miss in round 4: the custom TypeScript-serving server transpiles `.ts` files, but the app still imports `./shared` without an extension. In a native browser that requests `/shared`, not `/shared.ts`, so a hand-rolled server can silently strand the page before any useful report appears.
- This points to a clearer preferred pattern for these experiments:
  - use Bun's own page server when possible
  - let the page run the scenario itself from query params
  - let the page publish one compact semantic report with phase markers
  - keep the runner dumb
- Another miss across the browser checks: "first report seen" is too weak. Some pages publish an early `loading` or `running` marker long before the final semantic outcome. The runner needs to wait for the matching `requestId` and the final `phase: ready`.
- Timeout budget is part of the pattern. The photo round only looked flaky until we gave the browser-backed test a realistic timeout. The next draggable round should be explicit about that too.

### Photo Gallery

- Photo round 3 is the current bar to beat.
- The spec now needs to preserve the simple working browser-runner shape, not just the demo behavior.

### Draggable Cards

- The remaining gap still looks narrower than the earlier failures. The round-03 app already publishes structured semantic phases and page-driven automation scenarios, which suggests the browser-check shape is close.
- The next fresh round should lean into that simpler shape instead of inventing a richer runner.

## Round 5

### Photo Gallery

- Main-thread verification passed:
  - `bun test /Users/chenglou/github/vibescript/drafts/demos_with_specs/photo-gallery/round-05/gallery.test.ts`
  - `bun test --timeout 35000 /Users/chenglou/github/vibescript/drafts/demos_with_specs/photo-gallery/round-05/browser.test.ts`
  - `bun check`
- The round rebuilt the main gallery shape successfully again: grid mode, line mode, hash routing, dismiss-to-row behavior, scroll lock, occlusion, low-res backgrounds, high-res focused image, and page-driven semantic reports.
- Remaining miss against the spec and original demo: caption click still does not select the whole caption text. The implementation blocks mode changes on caption click, but it does not actively select the full prompt text.
- This is useful: the gap now looks smaller and more precise. It is not "the docs can't recreate the gallery." It is "the spec and tests still underspecified one interaction nuance."

### Draggable Cards

- Main-thread verification passed:
  - `bun test /Users/chenglou/github/vibescript/drafts/demos_with_specs/draggable-cards/round-05/logic.test.ts`
  - `bun test --timeout 30000 /Users/chenglou/github/vibescript/drafts/demos_with_specs/draggable-cards/round-05/browser.test.ts`
  - `bun check`
- Round 5 is the first draggable reconstruction that looks converged end-to-end from the main thread.
- The demo behavior landed cleanly: live reorder during drag, velocity-based release, and correct `lastDragged` depth while settling.
- **NEW PATTERN DETECTED**: a tiny no-extra-dependency Chrome CDP poller can be a good repo-blessed browser runner when the page still owns the semantics. The useful shape is:
  - start Bun's deterministic page server
  - open a dedicated Chrome target
  - let the page run a query-param-driven scenario
  - poll only for the page-owned semantic report
  - keep the runner dumb otherwise

## Pre-Round 6 Notes

### Photo Gallery

- Tighten the caption-selection requirement so it is explicit and testable.
- Add a browser-backed semantic check for full caption-text selection on click.

### Draggable Cards

- The spec should stop implicitly discouraging the tiny CDP poller if the runner stays dumb and the page still owns the semantics.
- Round 6 should tell us whether the draggable spec is now stable across repeated fresh reconstructions, not just one lucky pass.

## Round 6

### Photo Gallery

- Main-thread verification result:
  - `bun test /Users/chenglou/github/vibescript/drafts/demos_with_specs/photo-gallery/round-06/*.test.ts` failed
- Good news first: the new caption-selection requirement did land. The browser-backed caption-selection scenario passed, which means the tighter spec was strong enough to move that behavior.
- Miss 1: the browser runner regressed. The round used a runner that relaunches headless Chrome through `execFile` while polling, and it waits for Chrome command success instead of treating the page-owned report as the authority. That reintroduced harness failure on the navigation scenario.
- Miss 2: dismiss-to-row still does not restore the focused row with the intended peek. The measured row top after dismiss was about `623px`, far outside the expected `24px` to `80px` window.
- Signal: the photo spec still needs a more concrete browser-runner recipe, not just high-level guidance.

### Draggable Cards

- Main-thread verification passed:
  - `bun test /Users/chenglou/github/vibescript/drafts/demos_with_specs/draggable-cards/round-06`
  - `bun check`
- This is the second fresh draggable round in a row that passed end-to-end from the main thread.
- The draggable spec now looks materially more stable than before.

## Pre-Round 7 Notes

### Photo Gallery

- Keep the caption-selection requirement. That part worked.
- Tighten the browser-runner shape further:
  - one Chrome process per scenario
  - one page-owned semantic report
  - poll until final `phase: ready`
  - kill Chrome after the report appears
  - do not relaunch Chrome inside the polling loop
- Keep dismiss-to-row as a product requirement with the explicit peek band. That seam is still not reliably reconstructed.

### Draggable Cards

- The main open question is no longer "can a fresh agent rebuild this at all?" It is more like "does this stay stable over more repeats, and should the tiny CDP poller become a docs pattern?"

## Round 7

### Photo Gallery

- Main-thread verification result:
  - `bun test /Users/chenglou/github/vibescript/drafts/demos_with_specs/photo-gallery/round-07/*.test.ts` failed
- Miss 1: the pure layout test already drifted on the basic width heuristics. The round chose a slightly different grid-width budget, which means the spec still was not explicit enough about horizontal page padding and the exact column budget.
- Miss 2: the navigation browser scenario timed out at Bun's default `5000ms` test timeout, which means the round did not carry forward the explicit longer timeout budget we had already learned to require.
- Miss 3: the browser harness still relied on waiting for Chrome to exit cleanly and then scraping the dumped DOM file, rather than polling one long-lived scenario run until the page-owned report reached `phase: ready`.
- Miss 4: the browser checks showed missing or insufficient occlusion. One report had `gridMountedCount` equal to the full photo count, which violates the required grid-mode mounting behavior.

### Draggable Cards

- Main-thread verification passed:
  - `bun test /Users/chenglou/github/vibescript/drafts/demos_with_specs/draggable-cards/round-07`
  - `bun check`
- This is the third fresh draggable round in a row that passed end-to-end from the main thread.
- The draggable side now looks reliably reconstructible from docs plus spec.

## Pre-Round 8 Notes

### Photo Gallery

- Specify the exact horizontal page padding so the grid-width budget is less guessy.
- Keep the caption-selection requirement and the dismiss-to-row peek band.
- Keep the concrete browser-runner recipe and now also require an explicit occlusion assertion in browser-backed checks.
- The remaining photo failures no longer look like broad docs gaps. They look like a small cluster of still-underspecified seams.

### Draggable Cards

- Draggable now looks like the stable side of the experiment.
- Another fresh round is still worth running only because the user wants symmetric repeated stateless reconstructions.

## Round 8

### Photo Gallery

- Main-thread verification passed:
  - `bun test /Users/chenglou/github/vibescript/drafts/demos_with_specs/photo-gallery/round-08`
  - `bun check`
- Round 8 is the first fresh photo reconstruction that passed from the main thread after the later spec tightening.
- The previously narrow misses now look addressed in one pass:
  - browser-backed navigation flow passed
  - dismiss-to-row with explicit peek band passed
  - full caption-text selection without entering line mode passed
  - pure layout seams passed
- One implementation detail from the worker is worth noting but does not look like a docs gap by itself: in report mode, the page swaps remote image loads for a tiny local placeholder so browser checks stay about behavior rather than CDN timing.

### Draggable Cards

- Main-thread verification passed:
  - `bun test /Users/chenglou/github/vibescript/drafts/demos_with_specs/draggable-cards/round-08`
  - `bun check`
- This is the fourth fresh draggable round in a row that passed end-to-end from the main thread.
- The draggable side now looks robustly reconstructible from `docs/` plus spec.

## Current Read

- Draggable-cards looks stable now.
- Photo-gallery also looks reconstructible now, but it took more spec tightening around:
  - caption selection
  - exact grid width budget
  - explicit occlusion assertions
  - a more concrete browser-runner recipe
- So the experiment did find real gaps, but they were smaller and more specific than a broad docs failure.

## Round 9

### Draggable Cards

- Main-thread verification passed:
  - `bun test /Users/chenglou/github/vibescript/drafts/demos_with_specs/draggable-cards/round-09`
  - `bun check`
- This is the fifth fresh draggable round in a row that passed end-to-end from the main thread.
- At this point the draggable side looks stably reconstructible from `docs/` plus spec.

### Photo Gallery

- Main-thread verification failed:
  - `bun test /Users/chenglou/github/vibescript/drafts/demos_with_specs/photo-gallery/round-09`
- The pure layout tests passed.
- The browser-backed scenario tests failed in a familiar way:
  - caption selection still did not produce full selected text
  - navigation and dismiss-to-row reported `phase: "running"` instead of `phase: "ready"`
- This looks like another runner-page contract miss, not a broad layout failure.
- The current photo pattern seems more brittle across fresh rounds than the draggable one. It can converge, but it does not yet look as repeatably reconstructible.

## Round 10

### What Changed Before The Round

- `docs/ai-automating-browsers.md` and `docs/verification.md` were cleaned up so they now own the generic browser-runner and verifier-shape rules.
- Both demo specs were trimmed so they mostly say:
  - what the demo does
  - which seams are fragile
  - which scenarios must be proven
- The specs now point back to the shared docs for transport/tooling rules instead of repeating `requestId`, phase markers, loopback probing, and "keep the runner dumb" guidance.

### Draggable Cards

- Main-thread verification passed:
  - `bun test /Users/chenglou/github/vibescript/drafts/demos_with_specs/draggable-cards/round-10`
  - `bun check`
- This is the sixth fresh draggable round in a row that passed end-to-end from the main thread.
- The cleanup did not make draggable any shakier. If anything, the spec reads more like a product target now and less like a mini repo policy doc.

### Photo Gallery

- Main-thread verification passed:
  - `bun test /Users/chenglou/github/vibescript/drafts/demos_with_specs/photo-gallery/round-10`
  - `bun check`
- The fresh round landed the same four browser seams that kept mattering:
  - navigation and hash sync
  - dismiss-to-row with a small peek above the row
  - full caption selection while staying in grid mode
  - real grid occlusion
- This is an important signal: moving shared verifier/browser guidance out of the photo spec did not make the photo round regress. The page-specific behavior was still reconstructible as long as the spec kept the actual fragile seams.

## Updated Read

- Shared browser/verifier mechanics do belong in docs, not copied into every spec.
- The specs work better when they stay focused on demo behavior, exact numbers, and required scenarios.
- Draggable-cards now looks very stably reconstructible from docs plus spec.
- Photo-gallery still feels a little more delicate than draggable, but round 10 shows that the cleaner docs/spec boundary is not the reason it used to wobble.

## Spec Writing Experiments

- A separate spec-style comparison now lives in:
  - `/Users/chenglou/github/vibescript/drafts/demos_with_specs/spec-writing-experiments/RESULTS.md`
- Short version:
  - draggable liked `state-and-derivations` best
  - photo liked `scenario-first` best
  - `spatial-ascii` worked as a supplement, but was not the strongest whole-spec style
  - the best overall shape looks hybrid: scenario-first spine, exact numbers, one picture where needed, and only light hints about pure helper seams

## Spec Overlay Experiments

- A follow-up overlay comparison now lives in:
  - `/Users/chenglou/github/vibescript/drafts/demos_with_specs/spec-overlay-experiments/RESULTS.md`
- Short version:
  - all 6 overlay conditions passed from the main thread
  - photo liked `oracle-contract` best
  - draggable liked `two-pass` and `seed-corpus` best
  - `two-pass` looks like the most reusable cross-cutting overlay because it let helper hints help without pulling the gallery toward the wrong harness too early

## Spec Thinning Experiments

- A model-upgrade thinning comparison now lives in:
  - `/Users/chenglou/github/vibescript/drafts/demos_with_specs/spec-thinning-experiments/RESULTS.md`
- This round used `gpt-5.4` with `xhigh` reasoning instead of `gpt-5.4-mini`.
- Short version:
  - draggable passed at rich, medium, and thin levels
  - photo passed at medium and thin levels
  - photo rich unexpectedly failed the dismiss-to-row seam twice from the main thread
- The strongest new signal is that the stronger model can spec much less than the mini model could, as long as the exact numbers and fragile truths stay explicit.

## Thin Spec Repeatability

- We then repeated the thinnest successful packet with fresh `gpt-5.4 xhigh` agents.
- Result:
  - draggable thin packet: `4/4` main-thread passes including the original
  - photo thin packet: `4/5` main-thread passes including the original
- The only repeatability miss on the photo side was again the dismiss-to-row seam.
- Current read:
  - thin is now the real default for `gpt-5.4 xhigh`
  - photo still has a slightly smaller stability margin than draggable, but not enough to justify going back to a richer default packet

## Life Calendar Transfer Test

- We started a third-demo transfer test on:
  - `/Users/chenglou/github/vibescript/demos/life-calendar`
- The current spec packet is:
  - `/Users/chenglou/github/vibescript/drafts/demos_with_specs/life-calendar/SPEC.md`
- Round 1 used a fresh `gpt-5.4 xhigh` worker and produced:
  - `/Users/chenglou/github/vibescript/drafts/demos_with_specs/life-calendar/round-01`
- Round 1 result:
  - the worker created the right file shape and a plausible test shape
  - but it stopped at scaffolding and placeholder stubs instead of finishing the loop
  - so there is no meaningful main-thread pass/fail result yet
- Round 2 used another fresh `gpt-5.4 xhigh` worker targeting `round-02`.
- Round 2 result:
  - the worker stalled before writing any files
- Round 3 used another fresh `gpt-5.4 xhigh` worker targeting `round-03`.
- Round 3 result:
  - the worker stalled before writing any files
- Round 4 used a fresh `gpt-5.4 high` worker targeting `round-04` as a diagnostic.
- Round 4 result:
  - the worker also stalled before writing any files

Current read:

- this does not yet look like a clean spec failure
- the first worker understood the demo well enough to choose reasonable seams:
  - geometry snapshot
  - hit testing
  - age/final-day hover tooltips
  - custom-dot persistence
- the bottleneck here looks more like startup/completion reliability for a fresh stronger-model worker on a new demo than a clear miss in the thin packet itself
- the diagnostic `high` round makes that read stronger: this is probably not just an `xhigh` overthinking issue
- `life-calendar` is also a meaningfully different category:
  - canvas-first
  - exact geometry formula
  - localStorage persistence
  - almost no DOM surface beyond one tooltip input

Tentative next move:

- keep the thin spec
- if we continue, either:
  - try a much smaller faster worker prompt that inlines only the life-calendar packet plus 2 doc excerpts, or
  - accept this as a separate experiment axis: stateless reconstruction quality is one thing, worker startup/completion reliability is another

### Main-Thread Repro Check

- We then tried the same demo locally from the main model in:
  - `/Users/chenglou/github/vibescript/drafts/demos_with_specs/life-calendar/round-05`
- Main-thread verification passed:
  - `bun test /Users/chenglou/github/vibescript/drafts/demos_with_specs/life-calendar/round-05`
  - `bun check`

Updated read:

- the demo and thin packet are good enough for the main model to complete the loop
- this makes the earlier `life-calendar` blockage look much more like subagent startup/completion reliability than a spec gap
- so we should be careful not to overfit the spec based on those stalled worker rounds alone

### Compressed Prompt Matrix

- We then kept the same `life-calendar` packet but stopped asking fresh workers to discover docs from the repo.
- Results live in:
  - `/Users/chenglou/github/vibescript/drafts/demos_with_specs/life-calendar/COMPRESSED_PROMPT_RESULTS.md`
- Short version:
  - `round-06`: partial
  - `round-07`: main-thread pass
  - `round-08`: near-complete but browser-harness fail

Updated read:

- compressed prompts helped completion reliability materially
- this makes the earlier no-write stalls look even more like worker startup/context-loading problems rather than a hard demo/spec problem

## Prompt Compression Comparison On Photo Gallery And Draggable Cards

- We then reran the two older demos with fresh `gpt-5.4 xhigh` workers in a clean raw-vs-compressed A/B.
- Results live in:
  - `/Users/chenglou/github/vibescript/drafts/demos_with_specs/prompt-compression-experiments/RESULTS.md`
- Each demo got:
  - one `raw` round that read repo docs plus the current thin packet
  - one `compressed` round that got the demo truth and a tiny verification/browser excerpt inline

### Main-Thread Results

- `photo-gallery/round-11-raw`:
  - `bun test /Users/chenglou/github/vibescript/drafts/demos_with_specs/photo-gallery/round-11-raw`
  - pass
- `photo-gallery/round-11-compressed`:
  - `bun test /Users/chenglou/github/vibescript/drafts/demos_with_specs/photo-gallery/round-11-compressed`
  - fail at the folder level because the round introduced a Playwright-style spec file that Bun tried to load
  - `bun test /Users/chenglou/github/vibescript/drafts/demos_with_specs/photo-gallery/round-11-compressed/gallery.unit.test.ts`
  - pass
  - `bunx playwright test /Users/chenglou/github/vibescript/drafts/demos_with_specs/photo-gallery/round-11-compressed/browser.semantic.spec.ts --config /Users/chenglou/github/vibescript/drafts/demos_with_specs/photo-gallery/round-11-compressed/playwright.config.ts`
  - pass
- `draggable-cards/round-11-raw`:
  - `bun test /Users/chenglou/github/vibescript/drafts/demos_with_specs/draggable-cards/round-11-raw`
  - pass
- `draggable-cards/round-11-compressed`:
  - `bun test /Users/chenglou/github/vibescript/drafts/demos_with_specs/draggable-cards/round-11-compressed`
  - pass
- `bun check`:
  - pass

### Updated Read

- For demos that were already healthy under raw docs plus thin spec, compression did not buy a pass-rate improvement.
- Raw packets stayed closer to the repo's preferred Bun-native verification shape.
- The photo compressed round is the useful warning:
  - the worker mostly landed the product truth
  - but it drifted into Playwright and a round-local config
  - so the compression preserved semantics better than it preserved repo-local toolchain constraints
- Draggable stayed aligned under both formats, so compression was not harmful there. It just was not clearly better either.
- Current read:
  - keep raw docs plus thin spec as the default for demos that already reconstruct well
  - keep compressed packets as a rescue lever for harder demos like `life-calendar`
  - if we compress, keep the delivery constraint explicit too, e.g. stay on `bun test` and the page-owned semantic report path unless the experiment is specifically about another harness

**NEW PATTERN DETECTED**: prompt compression and pattern compression are not the same thing. A compressed packet can preserve product truth while quietly dropping repo-preferred delivery constraints.

## Template Experiment: Scroll Anchor

- We then tested the new `drafts/demo_templates/` surface on a third kind of demo:
  - `/Users/chenglou/github/vibescript/drafts/demos_with_specs/scroll-anchor/SPEC.md`
- Results live in:
  - `/Users/chenglou/github/vibescript/drafts/demos_with_specs/template-experiments/RESULTS.md`

The comparison was:

- `round-01-raw`: docs plus thin spec only
- `round-01-template`: docs plus thin spec plus `drafts/demo_templates/reference-app`

### Main-Thread Results

- `scroll-anchor/round-01-raw`:
  - `bun test /Users/chenglou/github/vibescript/drafts/demos_with_specs/scroll-anchor/round-01-raw`
  - fail
  - the pure model tests passed, but the browser-backed `add-1 then 2 rapid` scenario failed
- `scroll-anchor/round-01-template`:
  - `bun test /Users/chenglou/github/vibescript/drafts/demos_with_specs/scroll-anchor/round-01-template`
  - pass
- `bun check`:
  - pass

### Updated Read

- This is the first concrete transfer result in favor of the template surface.
- The raw worker understood the anchor law, but still missed one live seam under rapid two-step prepend.
- The template worker stayed much closer to the intended app-shell shape:
  - one global state object
  - staged events
  - explicit `domCache`
  - render-ordering closer to `reference-app`
- So the useful gain was both:
  - better outcome
  - less architecture drift

Tentative follow-on thought:

- if the template surface keeps holding up, some docs can probably get shorter
- the docs would still carry doctrine and tradeoffs
- but some structural guidance could point at the template slices instead of re-explaining the same code shape in prose

## Template Experiment: Gesture Flick Snap Target

- We then tested the gesture template on a demo that still needs drag, flick, and snap behavior:
  - `/Users/chenglou/github/vibescript/drafts/demos_with_specs/gesture-flick-snap-target/SPEC.md`
- Results live in:
  - `/Users/chenglou/github/vibescript/drafts/demos_with_specs/template-experiments/RESULTS.md`

The comparison was:

- `round-01-raw`: docs plus thin spec only
- `round-01-template`: docs plus thin spec plus `drafts/demo_templates/gesture-stack`

### Main-Thread Results

- `gesture-flick-snap-target/round-01-raw`:
  - `bun test /Users/chenglou/github/vibescript/drafts/demos_with_specs/gesture-flick-snap-target/round-01-raw`
  - pass
- `gesture-flick-snap-target/round-01-template`:
  - `bun test /Users/chenglou/github/vibescript/drafts/demos_with_specs/gesture-flick-snap-target/round-01-template`
  - pass
- `bun check`:
  - pass

### Updated Read

- This was not another pass/fail split like `scroll-anchor`.
- The useful difference was architecture shape:
  - the raw worker built a good standalone gesture model with direct callbacks
  - the template worker stayed much closer to the repo's staged-event gesture lifetime
- So `gesture-stack` looks useful even when the raw path already passes, because it keeps:
  - pointer history
  - release velocity
  - settle behavior
  - just-released depth
  - one render-loop-centric input interpretation
  together instead of scattering them

**NEW PATTERN DETECTED**: template wins can show up as less architecture drift even when raw docs plus spec already pass.

Updated template read:

- `reference-app` currently looks strongest for outcome plus shape on app-shell demos
- `gesture-stack` currently looks strongest for keeping the interaction lifetime together on gesture demos
- that is strong enough to let some docs start pointing at template slices instead of fully restating the same structure in prose

## Prompt Guidance Experiment

- We then tested whether the extra template extraction guidance should live in worker prompts, beyond plain template access.
- Results live in:
  - `/Users/chenglou/github/vibescript/drafts/demos_with_specs/prompt-guidance-experiments/RESULTS.md`

The matrix was:

- raw: docs plus thin spec only
- template: docs plus thin spec plus template access
- guided: docs plus thin spec plus template access plus explicit extraction guidance

Targets:

- `scroll-anchor`
- `gesture-flick-snap-target`

### Main-Thread Results

- all six prompt conditions passed from the main thread
- `bun check` passed

### Updated Read

- This was not a correctness win for extra guidance.
- The useful difference was mostly architecture shape.

On `scroll-anchor`:

- raw still leaned more ad hoc
- template and guided both stayed closer to the intended app-shell structure
- guided did not materially improve outcome beyond plain template access

On `gesture-flick-snap-target`:

- all three conditions landed the required behavior
- template and guided stayed closer to the intended gesture-stack lifetime
- guided copied that slice more literally, including `lastDragged` depth, but that did not buy a better result on this one-card demo

**NEW PATTERN DETECTED**: explicit extraction guidance currently looks more like a shape nudge than a correctness unlock once template access is already available.

Current read:

- keep this guidance in worker prompts
- do not promote it into canonical docs yet
- template access is still the bigger lever

## Repeatability Experiment: Scroll Anchor

- We then ran a repeatability pass on `scroll-anchor` to see whether the prompt conditions differ in stability.
- Results live in:
  - `/Users/chenglou/github/vibescript/drafts/demos_with_specs/repeatability-experiments/RESULTS.md`

The matrix was:

- raw: docs plus thin spec only
- template: docs plus thin spec plus template access
- guided: docs plus thin spec plus template access plus explicit extraction guidance

Each condition got 3 fresh `gpt-5.4 xhigh` workers.

### Main-Thread Results

- raw:
  - `3/3` passes
- template:
  - `3/3` passes
- guided:
  - `3/3` passes
- `bun check`:
  - pass

### Updated Read

- This repeatability pass did not show a stability advantage for template access or extra extraction guidance.
- That means the earlier raw `scroll-anchor` miss now looks more like one unlucky round than a stable raw-docs weakness.
- The useful difference that still remains is architecture shape:
  - template tends to keep the app-shell structure closer to `reference-app`
  - guided tends to copy that structure more literally

So the safest current read is:

- templates are still the architecture surface
- extra extraction guidance still belongs in worker prompts
- but neither currently deserves to be sold as a proven repeatability unlock on `scroll-anchor`
