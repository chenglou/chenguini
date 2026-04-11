# Layout verifier research

What worked:

- One semantic core, several precision mechanisms.
  Lowering natural TS/JS once, then running symbolic checks, range checks, concrete fixtures, and concrete sweeps over the same core, generalized much better than growing one AST walker per trick.
- Natural layout code was analyzable sooner than expected.
  Locals, loops, arrays, object literals, spread, `?.`, `??`, `Math.min`, `Math.max`, `Math.floor`, and `Math.ceil` covered a lot without forcing a verifier DSL.
- Tiny domains beat heavyweight theory early.
  Intervals, path-sensitive narrowing, an append-only sequence domain, and a tiny exact string domain got us much further than expected.
- Mutation canaries paid for themselves.
  Making an intentional mistake whenever we widened the proof surface caught core bugs and false confidence quickly.
- Geometry-shaped interval partitions matter.
  Splitting by real seams, e.g. left edge / interior / right edge, gave much sharper results than one giant interval.
- Contracts worked best as a boundary tool.
  The analyzer should read normal source by default, then use contracts only where the code is genuinely opaque or out of subset.

What didn't work, or didn't earn itself:

- Treating browser behavior as part of the proved zone.
  DOM selection APIs, actual scrolling, compositor details, and CSS flow still want seam checks, not static claims.
- Hard-coding app helper names into the analyzer.
  That was tolerable as a bootstrap move, but clearly the wrong long-term shape.
- Forcing checker-shaped authoring.
  Requiring `add(...)`, `sub(...)`, or special layout helpers everywhere would have contorted the demos for little gain.
- Pulling in more demos too early.
  The better move was to make the core smarter on two demos we already had.
- Giant unsplit intervals.
  They were too fuzzy to prove the branchy geometry helpers we cared about.
- Heavy machinery up front.
  We never needed SMT, octagons, or polyhedra to get real wins, so they stayed theoretical.

What the mutation coverage analysis revealed:

- Automatic mutation testing (251 mutations across 123 sites in photo-gallery) showed 32% coverage, which tells you exactly where the verifier has teeth.
  The caught mutations cluster on the verified functions: `colsBoxMaxSizeXF` track-fill math, `getGridLayout` overlap/centering, `makeItemLayoutGeometry` structural alignment.
  The blind spots fall into clear categories:
  - Global constants (gaps, padding): mutating them preserves structural relationships, so no existing law fires.
  - Functions outside the verified surface (`rectContainsPoint`, `get1DItemSize`, `clamp`): the verifier doesn't analyze these yet.
  - Aspect-ratio scaling factors (`0.85`, `1.05`): no law constrains these specific values.
- Invariant mining from range analysis automatically rediscovered the hand-written bounds (`cols ∈ [1, 6]`, `boxMaxSizeX ≥ 25`) without any specs, just by running the range evaluator with wide inputs and reading off the output bounds. The gap between what the miner finds and what laws assert is a map for where to invest next.
