# Browser Automation Research

Browser automation is no longer part of the layout verifier.

Keep this as research only. If a future task needs browser automation, it should be explicit about why static layout facts are insufficient.

## Boundary

The active verifier is static:

- no browser startup
- no screenshots
- no page-owned reports
- no runtime traces
- no sampled scenarios

Browser automation may still be useful for manual research into real browser seams, such as native selection APIs, scroll physics, compositor behavior, or CSS support. Those runs should not be reported as static layout guarantees.

## If You Run A Browser Anyway

Keep the runner dumb:

- open one deterministic page
- pass a unique request id
- let the page publish one compact report
- tear down the browser

Do not infer layout from pixels when userland geometry can report the semantic fact directly.

Do not promote the harness into the static verifier.
