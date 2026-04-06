# Photo Gallery Overlay: Two Pass Packet, Pass B

Read this only after the tests from Pass A exist.

This file is optional guidance, not a command to mirror one exact architecture.

## Small Picture

```txt
|<------100------>|<--------- main line ---------->|<------100------>|
 left nav strip        focused image in middle          right nav strip
```

## Pure Seams Worth Having

These are the small pure seams most likely to help:

- a pure grid layout helper
- a pure line click-routing helper for the `100px` left and right strips
- a small dismiss-to-row helper that converts focused id plus grid layout into a restore target

## Cautions

- keep browser transport rules in shared docs, not local helpers
- do not treat animated image edges as click truth
- do not treat "page loaded" as enough for browser verification
- do not fake occlusion by keeping every item mounted
