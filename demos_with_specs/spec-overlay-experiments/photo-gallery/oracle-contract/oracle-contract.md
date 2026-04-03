# Photo Gallery Oracle Contract

This file is only about demo-specific truth. Shared docs still own `requestId`, phases, and transport.

Your browser-backed checks should treat these named scenario outcomes as the authority.

## Required Scenarios

### `navigation-hash-sync`

The final ready report should include enough fields to prove:

- `phase` is `ready`
- line mode is still open
- the focused image id matches the expected target after navigation
- `window.location.hash` matches that focused image
- scroll lock is still active while line mode remains open

Good field examples:

- `focusedId`
- `hash`
- `scrollLocked`

### `dismiss-to-row`

The final ready report should include enough fields to prove:

- `phase` is `ready`
- line mode is closed
- the previously focused item's row is back in view
- that row top is restored with a small peek above it, around `40px`

Good field examples:

- `focusedId: null`
- `restoredId`
- `restoredRowTop`

Accept a reasonable band around the target, e.g. about `24px` to `80px`.

### `caption-selection`

The final ready report should include enough fields to prove:

- `phase` is `ready`
- the selected text equals the full caption text
- line mode never opened

Good field examples:

- `selectedText`
- `focusedId`

### `grid-occlusion`

The final ready report should include enough fields to prove:

- `phase` is `ready`
- mounted grid item count is lower than the total photo count

Good field examples:

- `mountedCount`
- `totalCount`

## Forbidden Oracle Shortcuts

- Do not use a report that only proves "the page booted."
- Do not infer these truths from screenshots.
- Do not let the runner guess these truths from arbitrary DOM scraping if the page can report them directly.
