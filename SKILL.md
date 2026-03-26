# Using VibeScript as an AI Skill

This guide helps AI agents consume this repo as a reference library when building interactive UIs in external projects. It complements `AGENTS.md` (which covers contributing *to* this repo) — this is about building *with* it.

## Setup

Add this repo as a git submodule or clone it into your AI agent's reference directory. The agent loads docs selectively based on the task at hand.

## Default: Selective Load

Start with the core set for any interactive UI task:

1. `docs/ui-architecture.md` — render loop, DOM guidance, state management, hash functions, caching
2. `docs/FrameScheduling.md` — rAF timing, frame lifecycle
3. `docs/Input.md` — event-store-then-render pattern, pointer/touch quirks
4. `docs/Scrolling.md` — scroll anchoring, rubber-banding, scrollTop quirks
5. `midui.ts` — shared library: springs, geometry, easing, hash, vector types

Add topic-specific docs only when the task matches. Use keyword search on the repo for discovery.

## Full-Load Mode

Use only when the task spans multiple subsystems or for architecture audits. Read everything in `docs/` plus `midui.ts`.

## Docs by Tier

### Tier 1: Core (always relevant for interactive UI)

| File | Lines | Topic |
|-|-|-|
| `docs/ui-architecture.md` | ~279 | Game-engine render loop, DOM read/write batching, idempotent DOM writes, state management, seeded hash, caching |
| `docs/FrameScheduling.md` | ~46 | rAF scheduling, timestamp vs performance.now(), React 18 setState batching in rAF |
| `docs/Input.md` | ~82 | Event-store-then-render pattern, pointer/touch/mouse cross-browser quirks, timing |
| `docs/Scrolling.md` | ~114 | Scroll anchoring (with vanilla + React patterns), rubber-banding, scrollTop truncation, iOS Safari large scroll-height crash |
| `docs/types-and-data-models-and-control-flows.md` | ~258 | Single source of truth, type over interface, union over enum, nullable string modeling, control flow patterns |

### Tier 2: Topic-specific (load when task matches)

| File | Lines | Topic |
|-|-|-|
| `docs/router.md` | ~371 | Full typed routing: URL vs history.state, owner pattern for modals, auth callbacks |
| `docs/z-index-depth-management.md` | ~91 | Stacking contexts, global Z.ts pattern, local isolation |
| `docs/Animation.md` | ~139 | Exp decay vs springs, two-spring flick-snap, spring tightening |
| `docs/ai-automating-browsers.md` | ~320 | Browser automation patterns, Playwright, headless Chrome |
| `docs/AddToHomeScreen.md` | ~64 | PWA manifest, standalone mode, iOS quirks |
| `docs/server-rendering-and-hot-reloading.md` | ~113 | Bun SSR setup, dev/prod split, hydration |

### Tier 3: Small references

| File | Lines | Topic |
|-|-|-|
| `docs/Image.md` | ~22 | img best practices, lazy decoding |
| `docs/download-quirks-in-browser.md` | ~6 | Download throttling |
| `docs/file-system-api-quirks.md` | ~3 | FS API edge cases |

## Demos by Topic

| Demo | Best for |
|-|-|
| `demos/photo-gallery/` | **Canonical reference** — springs, occlusion, hit testing, routing, z-index, resize anchoring, progressive loading |
| `demos/draggable-cards/` | Drag-reorder, hit testing, velocity on release. Simplest full-pattern demo |
| `demos/gesture-flick-snap-target/` | Two-spring flick-to-corner-snap |
| `demos/scroll-anchor/` | Scroll anchoring (vanilla + React) |
| `demos/nicer-hacker-news/` | Full app with routing, data fetching |
| `demos/spring-comparison/` | Spring parameter tuning |
| `demos/predictive-keyframes/` | Predictive keyframe animation |
| `demos/life-calendar/` | Grid layout, hover effects |
| `demos/global-illumination-pathtracer/` | WebGL ray tracing |
| `demos/mobile-test-standalone/` | Mobile/PWA testing |

## Known Inconsistencies

Prefer docs over demo code when they conflict:

1. **`msPerAnimationStep`**: `midui.ts` uses `6`, demos use `4`. Use midui's value when importing from it.
2. **Hash functions**: `ui-architecture.md` recommends Wellons lowbias32 for integer hashing. `midui.ts` uses fract-based (fine for float/shader use).
3. **Spring defaults**: `midui.ts` `k=333, b=33` vs demos `k=290, b=24`. Taste choices — tune to feel.

## Workflow

1. Build constraints from docs first.
2. Find an analogous demo and mirror its structure.
3. Reuse `midui.ts` helpers (springs, geometry, hash, easing).
4. Keep architecture consistent: `scheduleRender` + rAF loop, frame-step springs, store-then-render input.
5. Flag any new patterns not covered by docs — these should be fed back.
