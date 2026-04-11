# Layout verifier research

What worked:

- One lowered semantic core.
  Lower ordinary TS/JS once, then run symbolic checks, range checks, concrete fixtures, and concrete sweeps over that same core.
- Natural layout code.
  Locals, loops, arrays, object literals, spread, `?.`, `??`, `Math.min`, `Math.max`, `Math.floor`, and `Math.ceil` covered a lot without asking app code to become a verifier DSL.
- Tiny domains.
  Intervals, path-sensitive narrowing, append-only sequence facts, and exact string facts did more useful work than heavier numeric theories would have done early.
- Geometry-shaped intervals.
  Split by the seams the layout actually cares about: line left edge, line interior, line right edge; column band `1`, column band `2`, column band `3`.
- Discovered responsive bands.
  Sweep `colsBoxMaxSizeXF`, group adjacent widths with the same `cols`, then prove range laws inside each band. Do not duplicate the layout constants just to rediscover the same thresholds badly.
- Contracts as data.
  Read source by default. Use a sidecar contract only for an opaque helper boundary, and make the report say which helper was trusted.
- Reports as ledgers.
  A green law is not enough. Keep proof mechanisms, target coverage, trusted function summaries, unknowns, and candidate laws visible.
- Typed geometry facts.
  Once rect containment and overlap became named facts, failures could carry `overflowBy`, edge numbers, and a tiny SVG witness instead of a vague failed predicate.
- Symbolic shadows on interval numbers.
  Bounds were not enough for center-line proofs across responsive bands. Keeping the expression when `Math.min` or `Math.max` has a clear winning side caught aspect-ratio scale mutations without a heavier solver.
- Deliberate red tests.
  Every new proof surface got more believable once one intentional mutation proved the verifier could complain.

What did not earn itself:

- Treating browser behavior as statically proved.
  DOM selection, scrolling, compositor timing, and CSS flow still want seam checks.
- Hard-coding app helper names into the analyzer.
  Fine as a bootstrap. Wrong as an architecture.
- Checker-shaped authoring.
  `add(...)`, `sub(...)`, and special layout builders would have made the demos worse for little verifier gain.
- Giant unsplit intervals.
  They crossed too many branch seams and produced vague facts.
- Heavy machinery up front.
  SMT, octagons, and polyhedra can wait until a real layout law needs them.
- Pulling in every demo at once.
  The useful move was a second different shape, not a whole zoo of half-proved shapes.

What mutation coverage revealed:

- The photo-gallery sweep currently catches `83/223` runnable mutations (`37.2%`), with `28` more crashing before a verifier result.
- The caught mutations cluster where the proof surface is real: `colsBoxMaxSizeXF` track-fill math, `getGridLayout` overlap and centering, and `makeItemLayoutGeometry` structural alignment.
- The surviving mutations are useful signposts: global constants are not pinned, `get1DItemSize` / `getLineLayout` / `clamp` are mostly outside the verified surface, and some aspect-ratio scale changes still preserve the current structural laws.
- Invariant mining rediscovered facts like `cols in [1, 6]` and `boxMaxSizeX >= 25` without hand-written specs. The gap between mined facts and asserted laws is the next todo list.
- Contract sketches are drafts. `visibleHeight = lineHeight * 2` is useful to print, but a person still has to decide whether it is the contract.
