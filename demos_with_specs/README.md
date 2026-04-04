# demos_with_specs

This folder is an experiment harness for spec-driven demo reconstruction.

## Intent

We write specs from the original demos, then use fresh agents to rebuild from:

- `docs/`
- one demo-specific spec

The rebuild agents must not inspect `demos/`.

## Why This Folder Is Separate

Historical rounds are evidence. Some of them fail. That is useful.

Because of that:

- the repo's default `bun check` still covers only `demos/`
- the repo's default `bun start` still serves only `demos/`
- experimental rounds are served through `bun run start:specs`

This keeps the main repo loop clean while preserving failed rounds as data.

## Structure

- `NOTES.md`: cross-round findings and gaps
- `<demo>/SPEC.md`: the current reusable spec packet for that demo
- `<demo>/DATA.md`: shared exact data when a spec would otherwise get bloated
- `<demo>/round-XX/`: early one-off reconstruction attempts
- `<demo>/style-*/`: broad spec-writing comparisons
- `<demo>/overlay-*/`: targeted overlay experiments
- `<demo>/thin-level-*/`: thinning matrix conditions
- `<demo>/thin-repeat-*/`: repeatability checks for the thinnest successful packet
- `spec-writing-experiments/`, `spec-overlay-experiments/`, `spec-thinning-experiments/`: cross-demo experiment summaries

`bun run start:specs` serves any experiment folder with an `index.html`, including rounds, style variants, overlays, and thin-packet repeats.

The current default packet shape lives in `docs/minimum-viable-demo-spec.md`.

## Rules

- Use fresh agents for each round.
- Agents read `docs/verification.md` first.
- Agents then read only `docs/` plus the spec.
- Agents write tests first.
- Agents then implement the demo.
- The main thread compares results against the originals and records the misses.
