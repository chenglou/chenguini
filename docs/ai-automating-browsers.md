# AI Automating Browsers

When AI automates a browser, the page should own the answer.

The runner should mostly:

- start a deterministic local server
- open one browser run for one scenario
- navigate to `?scenario=...&requestId=...`
- wait for one machine-readable report
- read it back
- tear everything down

If the runner starts feeling like a second layout engine, it is already too complicated.

## Default Shape

This is the boring shape we want by default:

1. Start a deterministic local server.
2. Pick a loopback host that actually responds.
3. Open one browser target for one scenario.
4. Pass `scenario` and a unique `requestId` in the URL.
5. Let the page run the scenario.
6. Let the page publish a compact report with phase markers.
7. Wait for the matching `requestId` to reach `phase: 'ready'`.
8. Close the browser target and server.

Keep the scenario in the page. Keep transport in the runner.

## What The Page Owns

The page should:

- read `scenario`
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

- `location.hash` when the runner can read live page state
- a hidden `<script type="application/json">` when a one-shot dump is simpler

Pick one stable place. Don't scatter the same truth across the DOM, console logs, and random globals.

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

## What The Runner Owns

The runner can do transport work such as:

- start the server
- open the browser
- poll `location.hash`
- read one report node
- take a screenshot for debugging

It should not:

- reimplement gesture policy
- guess at "done" from sleeps
- infer layout from pixels when the page can already report the semantic answer
- treat browser exit as truth when the page can already say `ready` or `error`

The runner should feel dumb on purpose.

## One Scenario Run, One Browser Run

Keep the page alive while the runner waits.

If you use `--dump-dom`, start one Chrome process for that scenario, wait for the final report, then kill it.

If you use CDP or Playwright, same idea:

- open one browser process
- open one target for that scenario
- wait for the final report
- close it

Don't relaunch Chrome inside a polling loop. Don't keep starting fresh tabs just to ask the page whether it is done yet.

## Tiny CDP Poller Is Fine

A tiny Chrome CDP poller is a good default when you want no extra dependency.

That can be as small as:

- launch headless Chrome with remote debugging
- create a target for the scenario URL
- poll `location.hash` through `Runtime.evaluate`
- stop when the page reports the matching `requestId` and `phase: 'ready'`

This is still the same pattern. CDP is just transport.

Playwright is fine when you really need richer browser control. It is not the default just because it is familiar.

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

Benchmark runs:

- care about focus, throttling, and `requestAnimationFrame`
- should not trust numbers from a background tab

Don't mix those goals by accident.

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
