# Extracted Layout Kernels

These kernels come from `pretex-editor`, but the point is not "verify a TeX editor."
The point is to stress categories of layout math that show up in lots of interfaces and that are still pure enough to live inside the static verifier.

## `generated-list`

Representative category:

- tables of contents
- list of figures / tables
- file trees or outline panes with reserved number slots
- any list row with level-specific indent ladders, a trailing metadata slot, and leaders that only belong on the terminal wrapped line

Why it stresses the verifier:

- per-row geometry changes by both level and document-class branch
- the last wrapped line owns the leader and page-number lane while earlier lines do not
- the overall list top/bottom positions still come from a straight sequence fold

## `page-break-bundles`

Representative category:

- paginators
- timeline or feed chunkers with keep-with-next rules
- layout passes that may promote a lookahead bundle onto the next page/column

Why it stresses the verifier:

- the loop carries remaining budget across a variable-length block sequence
- the algorithm looks ahead, then conditionally reorders a promotable bundle
- keep-with-next and promotion interact, so the interesting part is not a single formula but the sequence policy

## `table-span-columns`

Representative category:

- tables
- calendar or grid layout negotiation
- any multi-column layout where single-lane constraints and spanning constraints both tighten the same width vector

Why it stresses the verifier:

- a span distributes one measured width across multiple columns
- later single-column cells can dominate one column without invalidating the span-derived lower bounds on its neighbors
- the loop is over nested variable-length arrays and uses `max` joins instead of a single affine formula
