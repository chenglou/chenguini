# Vibescript

Experimental AI-native UI framework. We're exploring how to build interactive UIs when AI is a first-class participant in authoring and understanding the code.

## What's here

- `midui.ts` — shared helpers (spring physics, geometry, math, hash). Read its `@cs` header for a quick overview.
- `demos/` and `demo_*.html` — single-file HTML demos with inline JS. Game-engine render loop style: scheduler, event batching, framerate-decoupled physics, batched DOM reads/writes.
- `docs/` — UI pattern knowledge: input handling, scrolling, animation, frame scheduling, routing, z-index management, etc.
- `cs.ts` — header extraction utility for `@cs` blocks.

## Conventions

- No React. Vanilla DOM, single-file HTML demos.
- `@cs` / `@/cs` headers are compact pseudocode specs describing the code below them. They sit inside `<script>` tags or at the top of `.ts` files.
- Render loop follows a consistent structure: process events → batched DOM reads → state transitions → layout → physics step → batched DOM writes → state cleanup. `render(now)` returns bool (still animating?).
- Spring physics are decoupled from framerate: track `animatedUntilTime`, compute `steps = floor((now - animatedUntilTime) / msPerAnimationStep)`, run that many physics steps per frame.

Architecture diagram ![IMG_6937](https://github.com/user-attachments/assets/caee340e-cc75-4611-9d81-bc31aca0457b)
