# Spec Thinning Experiments

This folder asks a narrower question than the earlier style and overlay experiments:

- if the worker model is stronger, how much spec can we remove before reconstruction quality drops?

For this round:

- all workers use `gpt-5.4`
- reasoning effort is `xhigh`
- each condition still uses fresh agents only

Each demo gets 3 thinning levels:

- `level-0-rich`: current best-known packet
- `level-1-medium`: one major layer removed
- `level-2-thin`: only the essential product truth remains

The main thing we want to learn is not only pass/fail.

We want to learn:

- which details the stronger model can infer from docs alone
- which details still need to stay in the spec
- whether different demo categories thin differently
