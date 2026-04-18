This repo documents all the code patterns we want to codify for a new era of UI apps written with AI. Demos at `demos/` and docs at `docs/`. Read the docs in full, especially `docs/drafts/verification.md`, before working.

`bun install` if you're in a fresh worktree.
`bun check` for linting, `bun start` for running the demos. Their url is the respective folder, e.g. `http://localhost:3000/photo-gallery/`

`docs/` are hand-written docs, battle-tested. `docs/drafts` are faster-moving, written by AI instead of human.
`todos/` are messy, often incoherent half-experiments.

When we refactor code, from inside this repo or elsewhere, whenever you encounter a new code pattern that isn't found in the docs, or if you hesitate with the structuring of code, loudly alert **NEW PATTERN DETECTED**. Then diligently add to/modify them in `docs/drafts` and tell me about the modifications. Note that docs are **generalizable** lessons. Do NOT put one-offs in there unless they're representatve of an entire category of problems. The context is: we're trying to purely use these docs as specs to regenerate future demos, so it wouldn't be good to overfit to the current demos since that'd be cheating. If you object to what's in `docs/`, please raise this loudly too.

**Important:** after you're done with a feature, and have enough holistic vision, make sure you do a pass over all the files again and see if you can simplify anything. Don't change things for the sake of, but if there are simplifications, YELL **I DID A HOLISTIC PASS AND FOUND SIMPLIFICATIONS** with a brief summary.

**Important:** do NOT monkey-patch. If you found yourself solving the symptom instead of the root cause, reconsider and do a proper fix, then YELL **I SOLVED THE ROOT CAUSE NOT THE SYMPTOM** with a brief summary.

## Docs Tone
- Preserve the author's tone in docs and drafts. Prefer concise, slightly personal phrasing over generic explanatory filler.
- Ground abstract explanations in examples (and shorten explanations length this way). Make sure the examples can be understood without excessive context and that the naming aren't abstract either:
  - write docs guidelines like this: "Colocate lifetimes. Instead of a `personAge: number | null` and a `personName: string | null`, put them into a `type Person = { age: number, name: string } | null`"
  - don't write like this: "Colocate lifetimes. Instead of `a: T1 | null` and `b: T2 | null`, put them into a `type P = { a: T1, b: T2 } | null`". Also don't use weirdly contextful names like `hullShape: HullID | null`
- Prefer examples that are concrete and archetypal, not repo-local jargon or vague shell nouns. Good: `available text width`, `line breaks`, `visible row range`, `scroll position`, `selected item`. Avoid: names that only make sense if you've seen one particular demo, or words like `panel` that don't name the underlying data.
- When a rule is broad, phrase it as the general rule plus one concrete category, e.g. `If behavior genuinely differs by some dimension, say, browser, feature flag, or mode, model that difference explicitly in one place.` Use "e.g.", "say", "such as", or some other clean turn of phrase
- The above applies to generating doc comments for functions too
- Leverage descriptive variable names that represent a whole category. If you come across a context-less example like "store events in state, e.g. pointerDownTime = ..." you still know that `pointerDownTime` is examplary among many other use-cases. Whereas a doc that says "e.g. ptAt = ..." is the _same_ variable but bakes in way less explanatory power
- don't turn local lessons into universal rules, and vice-versa

Example:
- Preferred: `The image's position should be relative to the scroll view container's.`
- Avoid: `A more robust architectural approach is to define the image position relative to the parent scrolling container so that scrolling does not interfere with the animation system.`
- Preferred: `Properties are only selectively animated. E.g. on window resize, an image's x/y/scale do NOT animate if it stays in the same place/column.`
- Avoid: `Layout changes and transitions are treated separately. On resize, x/y/scale don't animate if an image stays in the same place; when changing modes, the image keeps its current visual position and glides to the new layout.`
- Preferred: `If you want a lightweight, hand-rolled router, do it this way.`
- Avoid: `A pattern for building routing that's fully typed, handles browser history correctly, and avoids the traps of routing libraries.`
