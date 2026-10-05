# Draft Demo Reconstruction

This folder is an experiment harness for spec-driven demo reconstruction.

The generated implementation folders were pruned once the experiments settled down. The live value here is the packets, summaries, and archive notes. If an older note points at a deleted `round-*` or `thin-*` folder, recover it from git history.

## Start Here

- `NOTES.md`: current read, current workflow, and experiment index
- `NOTES_ARCHIVE.md`: full chronological research notes
- `todos/demo-reconstruction.md`: the current repo-level workflow

## What Lives Here

- `<demo>/SPEC.md`: the current reusable packet for that demo
- `<demo>/DATA.md`: shared exact data when the packet would otherwise get bloated
- `<demo>/*.md`: per-demo summaries that still matter, e.g. `COMPRESSED_PROMPT_RESULTS.md`
- `spec-*-experiments/**`: the packet variants we tested
- `*-experiments/RESULTS.md`: cross-demo summaries

Older experiment notes may mention browser-backed checks or other retired verifier shapes. Treat those as historical evidence, not current guidance.

## Why This Folder Stays Separate

Historical failures are evidence.

Because of that:

- the repo's default `bun check` still covers only `demos/`
- the repo's default `bun start` still serves only `demos/`

That keeps the main repo loop clean while preserving the notes that taught us something.

## Core Rule

Fresh workers rebuild from:

- `docs/`
- one demo packet

They must not inspect `demos/`.
