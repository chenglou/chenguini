# Gesture Stack

This is the opt-in gesture template.

Steal this when you need:

- active drag under the pointer
- reorder during drag
- recent-history release velocity
- spring settle after release
- dragged depth and just-released depth

Keep these slices together:

- pointer history collection
- `pointerState`
- drag delta storage
- release velocity calculation
- `lastDragged` depth

Delete aggressively if you don't need it:

- row reordering if the dragged thing only snaps to fixed targets
- horizontal pullback if the dragged thing should stay exactly under the pointer on both axes

But don't split the gesture lifetime into random helpers or callbacks.
