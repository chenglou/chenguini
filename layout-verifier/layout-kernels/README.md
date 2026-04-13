# Extracted Layout Kernels

These kernels come from real layout categories, but the point is not "verify one app." The point is to stress layout math that shows up across document editors, report builders, and grid-heavy interfaces while still staying pure enough for the static verifier.

## `generated-list`

Representative category:

- tables of contents
- lists of figures or tables
- outline panes with reserved number slots
- any wrapped list row with a trailing metadata lane that belongs only to the terminal line

Why it stresses the verifier:

- row geometry changes by both semantic level and document class
- the last wrapped line owns the leader and page-number lane while earlier lines do not
- the overall list top/bottom positions still come from a straight sequence fold

## `page-break-bundles`

Representative category:

- paginators
- timeline or feed chunkers with keep-with-next rules
- layout passes that may promote a heading-plus-floats bundle onto the next page once the remaining budget drops below that bundle height

Why it stresses the verifier:

- the loop carries remaining budget across a variable-length block sequence
- keep-with-next and promotion interact, so the interesting part is the sequence policy, not one formula
- the promoted bundle is reordered on the fresh page, so the verifier has to care about both page budgets and output order

## `table-column-negotiation`

Representative category:

- tables
- calendars and grid layouts
- any multi-column layout where single-lane constraints and spanning constraints both tighten the same width vector

Why it stresses the verifier:

- a span distributes one measured width across multiple columns
- later single-column cells can dominate one column without invalidating span-derived lower bounds on neighbors
- the loop is over nested, bounded column indexes and uses `max` joins instead of a single affine formula
