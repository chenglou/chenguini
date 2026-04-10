# Gesture Flick Snap Target Spec

Use `docs/` plus this packet only. Do not inspect `demos/` or other specs.

Read first:

1. `docs/drafts/verification.md`
2. `docs/drafts/automating-browsers.md`
3. `docs/Input.md`
4. this file

Write tests first, then implementation, then validate.

Build only inside the target folder the main thread gives you.

## Summary

Build a PiP-style gesture demo with:

- one draggable card labeled `PiP`
- four visible corner markers
- one blue rest marker that shows the decay rest position
- dark navy page styling
- drag, flick, and corner snap behavior

## Exact Numbers

- PiP width `120px`
- PiP height `80px`
- corner pad `20px`
- corner marker size `16px`
- rest marker size `10px`
- initial corner is bottom-left
- `msPerAnimationStep = 4`
- spring stiffness `290`
- spring damping `24`
- `decayFriction = 4.5`
- use recent pointer history from about the last `100ms`

## Fragile Truths

- drag should start only when pointerdown hits the current rendered PiP position
- while dragging, the PiP should stay under the pointer using stored drag offsets
- release velocity should come from recent pointer history, not from one last delta
- release should first compute a decay rest position, then choose the nearest corner to that rest position
- the blue rest marker should show that decay rest position
- mouseup, touchend, and touchcancel should all finish the snap path cleanly
- render should keep running while dragging or while springs are still moving

## Picture

```txt
corner dot                     corner dot

             PiP card
             blue rest dot after release

corner dot                     corner dot
```

## Tests Must Prove

- corner positions and nearest-corner choice
- decay rest position math
- release velocity estimation from recent pointer samples
- browser-backed drag keeps the PiP under the pointer before release
- browser-backed flick toward the upper-right lands at the upper-right corner
- browser-backed slower release toward the lower-right lands at the lower-right corner and reports a blue rest point

If a browser check passes without proving the chosen corner or the rest point, it is too weak.
