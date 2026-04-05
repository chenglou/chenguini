# Template Experiment Results

This matrix tested whether `demo_templates/reference-app` helps on a new demo that is not just photo-gallery or draggable-cards.

The demo was:

- `scroll-anchor`

Both workers were fresh `gpt-5.4 xhigh` agents.

The comparison was:

- `round-01-raw`: docs plus thin spec only
- `round-01-template`: docs plus thin spec plus `demo_templates/reference-app`

Both workers were forbidden from reading `demos/`.

## Main-Thread Results

- `scroll-anchor/round-01-raw`:
  - `bun test /Users/chenglou/github/vibescript/demos_with_specs/scroll-anchor/round-01-raw`
  - fail
- `scroll-anchor/round-01-template`:
  - `bun test /Users/chenglou/github/vibescript/demos_with_specs/scroll-anchor/round-01-template`
  - pass
- `bun check`:
  - pass

## `round-01-raw`

- pure model tests passed
- two browser scenarios passed
- one browser scenario failed:
  - `add-1 then 2 rapid keeps the same item at the reference line`

Main-thread read:

- the worker understood the anchoring law well enough to build the pure model
- the miss was in the live browser behavior under the rapid two-step prepend
- the code shape was simpler and more ad hoc:
  - `main.js`
  - `model.js`
  - no persistent DOM cache
  - more direct node recreation with `replaceChildren`

## `round-01-template`

- pure model tests passed
- all browser scenarios passed

Main-thread read:

- the worker stayed much closer to the intended app-shell shape
- it used:
  - one staged `events` object
  - one global state object
  - explicit `domCache`
  - read-once scroll anchoring inside the render loop
- this looks much closer to “copy and trim from `reference-app`” than “invent a structure from scratch”

## Updated Read

- On `scroll-anchor`, the template helped.
- The useful difference was not just pass/fail. It was shape:
  - raw landed the anchoring idea but missed one live seam
  - template landed both the seam and the repo-preferred structure
- This is the first concrete signal that the template surface can reduce architecture drift on a new demo.

Tentative next read:

- keep `reference-app` as the default template
- keep `gesture-stack` as opt-in
- add more templates only if another repeated gap shows up

One likely second-order effect:

- if the template surface keeps holding up, some docs can get shorter
- the docs would still carry doctrine and tradeoffs
- but some “how to structure the code” guidance could point at template slices instead of restating the same architecture in prose
