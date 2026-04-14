# Layout Verifier Todo

- Keep the active checker static-only: no browser runs, runtime traces, sampled sweeps, or committed fixture evidence.
- Work through [patterns.ts](./patterns.ts) without restating its list here.
- Add helper summaries only for opaque boundaries, and report which summary was trusted.
- Improve diagnostics so failed geometry facts show the relevant edges, overflow amount, or crossing boxes.
- Use temporary mutation/red probes to decide which atoms to add next; keep them out of the committed guarantee report.
