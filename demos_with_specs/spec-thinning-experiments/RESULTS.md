# Spec Thinning Results

All workers in this matrix use `gpt-5.4` with `xhigh` reasoning.

Conditions:

- photo gallery `level-0-rich`
- photo gallery `level-1-medium`
- photo gallery `level-2-thin`
- draggable cards `level-0-rich`
- draggable cards `level-1-medium`
- draggable cards `level-2-thin`

Main-thread results:

- photo gallery `level-0-rich`: fail
- photo gallery `level-1-medium`: pass
- photo gallery `level-2-thin`: pass
- draggable cards `level-0-rich`: pass
- draggable cards `level-1-medium`: pass
- draggable cards `level-2-thin`: pass

## Repeatability Pass

Then we repeated the thinnest successful packet with fresh `gpt-5.4 xhigh` agents.

### Photo Gallery thin repeats

- original thin packet: pass
- `thin-repeat-01`: pass
- `thin-repeat-02`: fail
- `thin-repeat-03`: pass
- `thin-repeat-04`: pass

Repeatability read:

- `4/5` main-thread passes overall
- the only miss was again the dismiss-to-row seam
- the failure was narrow: restore gap landed at `58px` instead of the tighter expected band

### Draggable Cards thin repeats

- original thin packet: pass
- `thin-repeat-01`: pass
- `thin-repeat-02`: pass
- `thin-repeat-03`: pass

Repeatability read:

- `4/4` main-thread passes overall
- no seam-specific regressions showed up in the repeats

## Photo Gallery

### `level-0-rich`

- main-thread result: fail
- verification:
  - `bun test /Users/chenglou/github/vibescript/demos_with_specs/photo-gallery/thin-level-0-rich`
- repeated failure:
  - dismiss-to-row restore did not bring the focused row back into view
  - the same failure reproduced twice from the main thread
- notes:
  - this is the surprising result in the matrix
  - the richer oracle-style packet did not help `gpt-5.4 xhigh` here
  - if anything, it seems to have nudged the implementation toward a more brittle interpretation of the dismiss seam

### `level-1-medium`

- main-thread result: pass
- verification:
  - `bun test /Users/chenglou/github/vibescript/demos_with_specs/photo-gallery/thin-level-1-medium`
- notes:
  - this already removed the separate oracle contract
  - all key browser seams still passed: hash sync, dismiss restore, caption selection, and occlusion

### `level-2-thin`

- main-thread result: pass
- verification:
  - `bun test /Users/chenglou/github/vibescript/demos_with_specs/photo-gallery/thin-level-2-thin`
- notes:
  - strongest result in the matrix
  - `gpt-5.4 xhigh` could reconstruct the gallery from a very small packet as long as the exact numbers and fragile truths stayed explicit
  - the stronger model seems able to infer a lot of the browser/report discipline from shared docs alone

Current read for photo:

- with `gpt-5.4 xhigh`, the spec can be thinned much more aggressively than it could with `gpt-5.4-mini`
- exact numbers and fragile seams still matter
- extra packet detail is not automatically helpful, and may sometimes bias the reconstruction in the wrong direction
- the thin packet is good enough to be the default, but the dismiss-to-row seam still has a smaller stability margin than the rest

## Draggable Cards

### `level-0-rich`

- main-thread result: pass
- verification:
  - `bun test /Users/chenglou/github/vibescript/demos_with_specs/draggable-cards/thin-level-0-rich`
- notes:
  - rich control worked as expected

### `level-1-medium`

- main-thread result: pass
- verification:
  - `bun test /Users/chenglou/github/vibescript/demos_with_specs/draggable-cards/thin-level-1-medium`
- notes:
  - dropping the staged helper hints did not hurt this model
  - browser seams and pure seams still landed cleanly

### `level-2-thin`

- main-thread result: pass
- verification:
  - `bun test /Users/chenglou/github/vibescript/demos_with_specs/draggable-cards/thin-level-2-thin`
- notes:
  - even the bare packet still reconstructed the core demo correctly
  - the stronger model did not need seed examples to land midpoint reorder, recent-history velocity, and top-until-settle

Current read for draggable:

- `gpt-5.4 xhigh` can handle a very thin packet here
- the main remaining reason to keep richer spec overlays would be code-shape discipline and easier auditing, not basic correctness
- this thin packet now looks stable enough to treat as the real default

## Updated Lesson

For these two demos, `gpt-5.4 xhigh` can spec less than `gpt-5.4-mini high`.

What still appears necessary:

- exact numeric constants
- the fragile user-visible seams
- the split between shared docs and per-demo truth

What appears more removable than before:

- extra oracle scaffolding in the demo spec
- helper hints
- seed examples
- some of the explicit verifier-shape reminders inside the packet

The new working rule is:

1. keep the shared docs strong
2. keep the demo spec small but exact
3. for stronger models, try removing overlays before removing the exact numbers and seam claims

And after the repeatability pass:

4. a thin packet is now the default for `gpt-5.4 xhigh`
5. add one overlay only when a specific seam keeps wobbling across fresh repeats
