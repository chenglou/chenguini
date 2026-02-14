## UI Architecture

Prefer a simplified game engine loop:

```
Initialization (done once, all upfront):
  State declaration
  Static DOM chunks
  Events registration (leverage event delegation to make this happen)

Render:
  DOM reads (batched, to avoid DOM read/write interleaving's catastrophic perf degradation)
  State changes, in this order:
    Handle inputs
    New layout & cursor
    Animation tick
    Commit state changes
  Occlusion & DOM writes (batched, same reason)
  schedule next render (e.g. if animating)
```
Only events and render's final step can schedule a next render
