# Draggable Cards Overlay: Two Pass Packet, Pass B

Read this only after the tests from Pass A exist.

This file is optional guidance, not mandatory structure.

## Pure Seams Worth Having

- deterministic card metrics helper
- midpoint reorder helper
- release velocity helper

Examples of good helper shapes:

- `reorderIdsByPointerY(orderedIds, draggedId, pointerY, cardRects)`
- `estimateReleaseVelocity(pointerSamples, now, windowMs = 100)`

## Cautions

- reorder should happen during drag, not only on release
- the top-until-settle rule is a product requirement, not a polish detail
- keep browser checks about semantic report truth, not synthetic runner guesses
