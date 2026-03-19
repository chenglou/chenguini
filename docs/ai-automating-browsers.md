## AI Automating Browsers

When AI automates a browser, the browser page itself should be the source of truth as much as possible. The automation runner should be dumb:

- open the page
- pass inputs
- wait for a machine-readable result
- read it back
- tear everything down

Do not make the runner interpret the page more than necessary. The page already has the DOM, fonts, layout engine, and rendering context. Let the page compute the answer.

This is especially important for:

- visual correctness checks
- layout verification
- browser-specific typography behavior
- benchmark snapshots

### Main Principle

Push intelligence into the page, not the runner.

Good:

- page computes a JSON report
- page encodes it in a stable place
- runner waits for the report

Bad:

- runner scrapes random DOM text
- runner infers layout state from visible pixels
- runner executes ad hoc JS in the active tab to inspect fragile local variables

## The Pattern

The most reliable shape is:

1. Start or find a deterministic local server.
2. Open a dedicated browser tab or window.
3. Navigate to a page URL containing a unique `requestId` and any other parameters.
4. Let the page compute the answer.
5. Have the page publish the answer in a machine-readable way.
6. Poll for that answer until the matching `requestId` appears.
7. Close the tab and shut down any temporary server.

### Good Result Channel

The page should produce a small report object like:

```ts
type Report = {
  status: 'ready' | 'error'
  requestId: string
  height?: number
  lineCount?: number
  message?: string
}
```

And then publish it somewhere stable, for example in the URL hash:

```ts
location.hash = `report=${encodeURIComponent(JSON.stringify(report))}`
```

This works well because:

- it is easy for simple automation to read back
- it survives reloads cleanly
- it does not require a special JS bridge

## Why `requestId` Matters

Always include a unique `requestId`.

Without it, AI automation can easily read:

- a stale report from an earlier run
- a previous tab's state
- a partially reloaded page

Good:

```ts
const requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`
const url = `${baseUrl}?report=1&requestId=${encodeURIComponent(requestId)}`
```

Then the runner should reject any report whose `requestId` does not match.

## Dedicated Tabs, Not Active Tabs

Use a dedicated browser tab or window owned by the automation run.

Do not drive the user’s active tab if you can avoid it.

Why:

- fewer accidental interactions with the user
- less focus churn
- lower chance of reading the wrong page
- easier cleanup

For correctness checks, background-safe tabs are usually fine.

For benchmark runs, keep them foregrounded. Background tabs can be throttled and produce fake numbers.

## Deterministic Page Servers

Use temporary page servers for scripted runs.

For example:

```sh
bun --port=3210 --no-hmr pages/*.html
```

Do not run scripted correctness/benchmark checks against a hot-reloading dev server if you can avoid it.

Reason:

- HMR preserves too much state
- stale modules are common
- layout tooling can look "wrong" when the real problem is stale runtime state

For human development, full reload is fine. For automated runs, use a deterministic temporary server.

## Prefer Loopback Probing Over Assumptions

Do not assume one loopback hostname will always work.

Probe:

- `http://127.0.0.1`
- `http://localhost`
- `http://[::1]`

and use the one that actually responds.

This matters more than it sounds. Browser automation and local servers can disagree about IPv4 vs IPv6 loopback in annoying ways.

## Serialize Browser Automation Per Browser

Do not run multiple browser-automation jobs in parallel against the same visible browser instance.

Use a per-browser lock.

Why:

- runs fight over tabs
- stale reports become easier to read accidentally
- focus and window ordering become flaky

If Chrome automation is already running, the next Chrome job should wait.

Safari should have its own separate lock.

## Accuracy Runs vs Benchmark Runs

These are different classes of automation.

### Accuracy / layout / corpus / screenshot runs

Usually okay to run in a background-safe tab.

Main concern:

- correctness of the page’s computed report

Focus is not usually required for correctness, only for convenience or stability.

### Benchmark runs

Keep them foregrounded.

Main concern:

- timer throttling
- scheduling changes
- `requestAnimationFrame` behavior
- browser deprioritizing background work

If you care about benchmark numbers, allow the run to momentarily steal focus rather than trust a background tab.

## Environment Fingerprinting

If the thing being measured can change with display or browser environment, record the environment in the report.

At minimum:

- browser
- devicePixelRatio
- viewport width and height
- outer window width and height
- `visualViewport.scale` if relevant
- screen width and height

Why:

- helps detect stale runs
- helps compare different displays
- helps explain "it changed when I moved the window to another screen"

## Screenshots Are Debugging, Not Truth

Use screenshots for:

- visual sanity checks
- overlap debugging
- composition tuning

Do not use screenshots as the primary data source if the page can compute the answer exactly.

For example, if a page can already compute:

- `height`
- `lineCount`
- `firstMismatch`

then the runner should read that report, not try to infer it from screenshots.

## Chrome DevTools / Rich Automation Tools

Use richer tools like Chrome DevTools automation or MCP-style browser tooling for:

- debugging
- performance traces
- DOM inspection
- console inspection
- screenshots

Do not automatically replace a simple page-report runner with a richer protocol.

The richer tool is often a better debugger, but not necessarily a better regression runner.

For repeatable tests:

- simpler is often more reliable

## Expected Failure Modes

Some things look like bugs but are just automation artifacts:

- `ERR_CONNECTION_REFUSED` on a temporary checker port after the run exits
- an automation tab disappearing when cleanup happens
- stale pages when using HMR/hot reload
- focus briefly changing during browser session setup

Do not immediately treat these as measurement failures.

## DOs

- Do generate a unique `requestId` for every run.
- Do let the page compute the answer itself.
- Do use dedicated tabs or windows for automation.
- Do serialize runs per browser.
- Do use deterministic temporary servers for scripted runs.
- Do record environment data in the report when it matters.
- Do keep benchmark runs foregrounded.
- Do make the runner as dumb as possible.
- Do use screenshots and richer browser tooling for debugging, not as the default truth source.

## DON’Ts

- Don’t scrape visible DOM text when the page can emit a structured report.
- Don’t drive the user’s active tab unless you truly have to.
- Don’t use HMR state as the basis for correctness automation.
- Don’t run multiple Chrome automation jobs at once in the same browser instance.
- Don’t benchmark in a background tab and trust the number.
- Don’t omit `requestId`.
- Don’t hide browser-specific environment differences from the report.

## Example: Good Browser Automation Shape

Page:

```ts
const requestId = new URLSearchParams(location.search).get('requestId') ?? ''

const report = {
  status: 'ready',
  requestId,
  height,
  lineCount,
}

location.hash = `report=${encodeURIComponent(JSON.stringify(report))}`
```

Runner:

```ts
const requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`
const url = `${baseUrl}?report=1&requestId=${encodeURIComponent(requestId)}`

session.navigate(url)

for (;;) {
  const report = readReportFromHash()
  if (report.requestId === requestId) {
    return report
  }
  await sleep(100)
}
```

This pattern is boring, and that is exactly why it is good.

## Final Taste

Browser automation should feel like:

- one owned browser session
- one deterministic page
- one explicit report
- one teardown

If the runner starts feeling like a second layout engine, or a second source of truth, it is already too complicated.
