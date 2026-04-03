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
- `<demo>/SPEC.md`: the current spec for that demo
- `<demo>/round-XX/`: one isolated reconstruction attempt

## Round Rules

- Use fresh agents for each round.
- Agents read `docs/verification.md` first.
- Agents then read only `docs/` plus the spec.
- Agents write tests first.
- Agents then implement the demo.
- The main thread compares results against the originals and records the misses.
