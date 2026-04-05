# Reference App

This is the default app template.

Steal this when you need:

- schedule-render architecture
- one global state object
- staged events
- DOM cache with explicit lifetimes
- scrolling, occlusion, and layout in one render loop
- text selection and copy logic

Keep these slices together:

- `scheduleRender` plus `render`
- `st.events` plus the reset at the end of render
- DOM reads before layout, DOM writes after layout
- selection state plus `copy` handling

Delete aggressively if you don't need it:

- the HN-specific parser and thread rendering
- search, if the new demo has no text filtering
- canvas drawing, if your app has no connective chrome

But keep the architecture shape intact while trimming.
