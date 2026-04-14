# Layout Verifier Todo

- Keep the active checker static-only: no browser runs, runtime traces, sampled sweeps, or committed fixture evidence.
- Work through [patterns.ts](./patterns.ts) without restating its list here.
- Add helper summaries only for opaque boundaries, and report which summary was trusted.
- Improve diagnostics so failed geometry facts show the relevant edges, overflow amount, or crossing boxes.
- Use temporary mutation/red probes to decide which atoms to add next; keep them out of the committed guarantee report.

## Current Limitations

- Call-requirement discharge only works inside one file.
- `requires` only supports constant-bounded ranges, e.g. `value: number[0, 10]`.
- No relational preconditions yet, e.g. `container >= containee`, `right == left + width`, or `index < items.length`.
- Calls must be direct named calls. No method calls except the hardcoded `Math.*` subset.
- Parameters must be simple names. No destructuring, rest params, or defaults.
- The checker only handles the small pure subset it can inline. No side effects, mutation reasoning, loops, or callbacks.
- Entry-point `requires` clauses are still assumptions unless a same-file caller discharges them.
- Wide intervals can still fail or become `unknown` even when a richer relation would prove the fact.
- No module/import graph tracking.
- No overloads, generics, TS type narrowing, or type-system integration.
- No array/object precondition domains yet, so no `items.length`, `rows[].height`, etc.
- Branch-local discharge is limited to the current simple ternary/comparison path analysis.
