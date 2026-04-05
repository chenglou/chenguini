# demos_with_specs

This folder is an experiment harness for spec-driven demo reconstruction.

## Start Here

- `NOTES.md`: current read, current workflow, and experiment index
- `NOTES_ARCHIVE.md`: full chronological research notes
- `docs/ai-demo-reconstruction.md`: the current repo-level workflow

## What Lives Here

- `<demo>/SPEC.md`: the current reusable packet for that demo
- `<demo>/DATA.md`: shared exact data when the packet would otherwise get bloated
- `<demo>/round-*`: one-off reconstruction attempts
- `<demo>/style-*`, `<demo>/overlay-*`, `<demo>/thin-*`, `<demo>/prompt-*`, `<demo>/repeat-*`: focused experiment conditions
- `*-experiments/RESULTS.md`: cross-demo summaries

## Why This Folder Stays Separate

Historical failures are evidence.

Because of that:

- the repo's default `bun check` still covers only `demos/`
- the repo's default `bun start` still serves only `demos/`
- experimental runs are served through `bun run start:specs`

That keeps the main repo loop clean while preserving the misses that taught us something.

## Core Rule

Fresh workers rebuild from:

- `docs/`
- one demo packet

They must not inspect `demos/`.
