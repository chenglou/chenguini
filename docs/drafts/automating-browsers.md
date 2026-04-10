# AI Automating Browsers

When AI automates a browser, the page should own the answer.

The runner should mostly:

- start a deterministic local server
- open one browser run for one scenario or one homogeneous batch
- navigate to `?scenario=...&requestId=...`
- wait for one machine-readable report
- read it back
- tear everything down

If the runner starts feeling like a second layout engine, it is already too complicated.

## Default Shape

This is the boring shape we want by default:

1. Start a deterministic local server.
2. Pick a loopback host that actually responds.
3. Open one browser target for one scenario or one homogeneous batch.
4. Pass the scenario inputs and a unique `requestId` in the URL.
5. Let the page run the scenario or batch.
6. Let the page publish a compact report with phase markers.
7. Wait for the matching `requestId` to reach `phase: 'ready'`.
8. Close the browser target and server.

Keep the scenario in the page. Keep transport in the runner.

## What The Page Owns

The page should:

- read `scenario` or another compact input like `widths=300,310,320`
- read `requestId`
- run the scripted flow
- compute the semantic result
- publish one compact report

Example:

```ts
type Report = {
  phase: 'loading' | 'running' | 'ready' | 'error'
  requestId: string
  scenario: string
  selectedText?: string
  visibleRowRange?: [number, number]
  orderedCardIds?: string[]
  lastDraggedId?: string | null
  message?: string
}
```

Good channels:

- `location.hash` for small live reports
- a local POST endpoint for large batched reports
- one in-page debug object if a richer protocol runner wants to read page state directly

Keep one source of truth for the report object. It can have more than one transport, but don't make the transports disagree.

## `requestId`

Always include a unique `requestId`.

Without it, the runner can easily read:

- a stale report from an earlier run
- another tab's state
- a page that reloaded halfway through

Good:

```ts
const requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`
const url = `${baseUrl}?scenario=dismiss-to-row&requestId=${encodeURIComponent(requestId)}`
```

Then ignore any report whose `requestId` does not match.

## Phase Markers

If the scenario takes real time, publish coarse phases:

- `loading`
- `running`
- `ready`
- `error`

This makes hangs much easier to read:

- never loaded
- loaded but never started
- started but got stuck
- finished with an explicit failure

If the page has a real transport step, say posting a large report back to the runner, add one more specific phase such as `posting`.

## What The Runner Owns

The runner can do transport work such as:

- start the server
- open the browser
- poll `location.hash`
- wait for one POSTed report
- read one report node
- take a screenshot for debugging

It should not:

- reimplement gesture policy
- guess at "done" from sleeps
- infer layout from pixels when the page can already report the semantic answer
- treat browser exit as truth when the page can already say `ready` or `error`

The runner should feel dumb on purpose.

## Temporary Preservation Diffs Are Narrower

For a one-off refactor question like "did any line or box move?", it is fine for the runner to dump rects directly.

Good:

- open the old code, record item, line, or token rects
- open the new code, record again
- diff the JSON on the same machine and browser
- delete the bulky harness afterward

Bad:

- promoting that one-off dump into the permanent browser architecture
- replacing a better page-owned semantic report with a DOM dump just because it was easy once

This is a temporary preservation oracle, not the default answer to browser automation.

## One Page Run, One Browser Run

Keep the page alive while the runner waits.

If you use `--dump-dom`, start one Chrome process for that scenario, wait for the final report, then kill it.

If you use CDP or Playwright, same idea:

- open one browser process
- open one target for that scenario or homogeneous batch
- wait for the final report
- close it

Don't relaunch Chrome inside a polling loop. Don't keep starting fresh tabs just to ask the page whether it is done yet.

If you need many cheap subcases, batch them in the page instead of in the runner.

Good:

- one corpus page load that measures widths `300..900 step=10`
- one gallery page load that reports visible item ids for a few fixed scroll positions

Bad:

- 61 separate browser navigations for 61 widths
- a runner loop that keeps refreshing the same page just to collect one more row

## If JS Owns The Clock, Let The Page Expose Frame Sampling

If the animation is stepped from JS time, don't make the runner guess with sleeps.

Good page-owned API:

- `setViewport(width, height)`
- `scrollToY(y)`
- `clickItem(id)`
- `flushTo(ms)`
- `sample()`

Then the runner can do:

1. set up one scenario
2. flush to `t=16ms`, `t=64ms`, `settled`
3. read one compact geometry report

This is great for resize, anchoring, and transition bugs. The runner stays dumb. The page stays the only layout engine.

Bad:

- `await sleep(16)` and hoping you caught the right frame
- screenshotting a transition and inferring geometry from pixels
- runner-side math that tries to reconstruct where the item "must have been"

## Tiny CDP Poller Is Fine

A tiny Chrome CDP poller is a good default when you want no extra dependency.

That can be as small as:

- launch headless Chrome with remote debugging
- create a target for the scenario URL
- poll `location.hash` through `Runtime.evaluate`
- stop when the page reports the matching `requestId` and `phase: 'ready'`

This is still the same pattern. CDP is just transport.

Playwright is fine when you really need richer browser control. It is not the default just because it is familiar.

## Headless Is A Different Environment Until Proven Otherwise

Don't assume headed and headless are equivalent just because they use the same browser binary.

If you want to switch a checked-in correctness sweep from headed Chrome to headless Chrome:

- pin the headless screen environment explicitly
- generate the full machine-readable report
- mechanically diff it against the trusted snapshot

If the diff is not empty, the answer is "not equivalent yet", not "close enough".

Good:

- `--screen-info={3024x1964 devicePixelRatio=2}` with a matching Playwright context
- a zero-diff compare against the trusted Chrome sweep JSON

Bad:

- "same Chrome version, so it must match"
- silently rerunning headed after headless disagrees
- updating the baseline before proving parity

## Deterministic Servers

Prefer a deterministic page server, e.g.:

```sh
bun --port 3210 --no-hmr pages/*.html
```

Don't run correctness automation against an HMR session if you can avoid it.

HMR preserves too much state:

- stale modules
- old page state
- confusing reload timing

## Probe Loopback Hosts

Don't assume one loopback hostname will work everywhere.

Probe:

- `http://127.0.0.1`
- `http://localhost`
- `http://[::1]`

and use the one that actually responds.

## Keep Asset Timing Out Of It

If the thing under test is routing, selection, scroll position, z-order, or occlusion, don't let CDN timing decide pass or fail.

In report mode, it is fine to swap remote images for a tiny local placeholder if the assets themselves are not under test.

## Correctness vs Benchmarks

Correctness runs and benchmark runs are different.

Correctness runs:

- are mostly about whether the semantic report is right
- are fine with a minimal dumb runner
- are often great candidates for in-page batching

Benchmark runs:

- care about focus, throttling, and `requestAnimationFrame`
- should not trust numbers from a background tab
- should not casually switch browser driver or browser mode without a fresh benchmark baseline

Don't mix those goals by accident.

For correctness runs, it is often enough to drive a manual page-owned clock and read semantic geometry. That is a different job from measuring real frame cadence.

## Fail Loudly On Drift

Don't hide transport drift or environment drift with silent fallbacks.

Bad:

- if Playwright headless disagrees, quietly rerun headed
- if a POST report never arrives, pretend the hash report was good enough
- if Safari times out, mark the run green because Chrome matched

Good:

- fail if the `requestId` never comes back
- fail if the page never leaves `loading`
- fail if the page gets stuck at `posting`
- fail if the pinned headless width or DPR does not match what the page sees
- fail in compare mode if the new runner's JSON differs from the trusted snapshot

## Common Automation Artifacts

Some things look scary but are just cleanup noise:

- `ERR_CONNECTION_REFUSED` after a temporary server exits
- an early `loading` report before the final `ready` report
- a stale report with the wrong `requestId`
- the automation tab disappearing during teardown

Don't treat these as product failures by default.

## Example

Page:

```ts
const params = new URLSearchParams(location.search)
const scenario = params.get('scenario') ?? ''
const requestId = params.get('requestId') ?? ''

function publishReport(report: Report) {
  location.hash = `report=${encodeURIComponent(JSON.stringify(report))}`
}

publishReport({phase: 'loading', requestId, scenario})

// ...run the scenario...

publishReport({
  phase: 'ready',
  requestId,
  scenario,
  selectedText,
})
```

Runner:

```ts
const requestId = crypto.randomUUID()
const url = `${baseUrl}?scenario=caption-selection&requestId=${encodeURIComponent(requestId)}`

await openChrome(url)

const report = await waitForMatchingReadyReport(requestId)
expect(report.selectedText).toBe(expectedPrompt)
```

Large batched report:

```ts
const requestId = crypto.randomUUID()
const reportServer = await startPostedReportServer(requestId)
const url =
  `${baseUrl}?widths=${encodeURIComponent('300,310,320')}` +
  `&requestId=${encodeURIComponent(requestId)}` +
  `&reportEndpoint=${encodeURIComponent(reportServer.endpoint)}`

await openChrome(url)

const report = await reportServer.waitForReport()
expect(report.rows).toHaveLength(3)
```
