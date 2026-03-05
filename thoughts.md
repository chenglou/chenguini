# Thoughts

## Why Not JSX

Tasteful UI is really multiple imperative, mutative graphs — animation, gesture, clipping, layout, data flow, z-index, timing — and React bundled them all into a single tree for DX. The tree is a good default, but every graph that doesn't fit needs an escape hatch (refs, effects, portals, external stores). For anything interactive, the escape hatches *become* the architecture.

The game-engine approach lets each graph be itself. Springs are springs, not state that triggers re-renders. Hit testing is math against coordinates, not invisible divs. Occlusion is a visibility check in the render loop, not a separate library. They share the same render frame but aren't forced into the same abstraction.

Some things that are hard or impossible in JSX:

- Framerate-decoupled physics (N spring steps per frame based on elapsed time)
- Velocity transfer on animation interruption
- Hit testing against target position (`dest`), not current animated position (`pos`)
- Decoupled hit area geometry (click regions that don't match element bounds)
- Batched DOM reads before any state computation (React's render can't read DOM)
- Occlusion culling that works with animated positions
- Area-based responsive sizing across sibling elements
- Anchor-based scroll preservation during resize (single-frame, no flash)
- Continuous hover effects without re-rendering the world
- Per-frame pointer history for release velocity
- Debug frame stepping
- Static vs dynamic property split (React diffs all props every render)
- Passive state that doesn't trigger re-renders (pointer position)

## No Free Lunch, Specialized Abstractions

We've spent decades crafting universal abstractions — generic reconcilers, general-purpose component models, one-size-fits-all state management. But the no free lunch theorem applies: no single abstraction is optimal for every situation.

What we were missing was sufficiently smart AI to assess the situation, condition on the entire codebase, and write the most clean and simple code for the task at hand. Not a universal abstraction, but the *right* abstraction, specialized to the current requirements.

The key shift: when requirements change, AI can read, reassess, and rewrite — producing the next best abstraction given the new constraints. No need to incrementally modify architecture from the old state, accumulating accidental complexity. Just regenerate the right thing.

Most libraries and patterns we've built were defensive — protecting humans from mistakes, hiding complexity behind opaque APIs, constraining expressiveness to prevent footguns. With AI, we can be aggressive. This doesn't mean no abstractions — it means a different kind of abstraction. Not "hide the dangerous parts" but "express the intent clearly and let AI handle the mechanical correctness." These docs are an attempt to find what those new abstractions look like.

## Vibe Engineering

The vibe coding movement has produced more apps, faster. But the ceiling is the ceiling of what we already have — we're just producing more of these things in quantity. The quality and ambition haven't moved.

What we're trying to do here is raise both the ceiling and the floor. Turn vibe coding into vibe engineering.

## The No-Framework Framework

These docs aren't a library to npm install. They're patterns and conventions that AI applies contextually. The framework is knowledge, not code. A `domCache` isn't a generic virtual DOM — it's whatever shape this specific app needs right now, reshapeable when requirements change. The router isn't a routing library — it's a switch statement and `pushState`. The animation system isn't a package — it's spring math inlined where it's used.

The cost of a universal framework is that it must handle cases you don't have. The cost of no framework is that you rewrite patterns. AI makes the second cost near-zero.

## The Interactivity Tax

Most web frameworks optimize for the easy case — static content, forms, simple transitions — and make the hard case nearly impossible. The escape hatches (refs, effects, external stores, portals) required for real interactive UI are so pervasive they become the actual architecture. At that point you're not using the framework, you're fighting it.

This project inverts the priority: optimize for the hard case (real-time interactive UI with animation, gestures, occlusion), and the easy case is trivially handled within the same model.

## Docs as Compressed Expertise

We document mainly for AI, not humans. But there's a deeper point: these docs are a compressed model of interaction design expertise. The AI reads them and produces code that reflects knowledge about scroll physics, spring interruption, coordinate spaces, hit testing, occlusion — things that take years to learn. The docs are domain-specific training data, applied at generation time rather than training time.

This also means the docs should capture *why*, not just *what*. AI can figure out the what from code. The why — the tradeoffs, the browser quirks, the interaction design principles — is what makes the generated code tasteful rather than merely functional.
