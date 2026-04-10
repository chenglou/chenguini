# Validation Loops

When investigating a bug or a new feature, the validation loop should usually get wider and then narrower again.

Start with the smallest repro you can trust. If a text box wraps wrong, don't start by rerunning an entire corpus. Start with one short string and one width where the behavior is obvious.

That small repro is for iteration speed:

- easy to rerun
- easy to reason about
- easy to invalidate a bad hypothesis

But don't stop there. Once the fix feels right, broaden temporarily to make sure you didn't just overfit the toy case.

For example:

- keep a small permanent suite like:
  - repeated spaces
  - one hard break
  - whitespace-only middle line
  - one tab case
- then do one temporary brute-force pass over a much bigger generated matrix
- if the bigger pass agrees, keep the small suite and throw the brute-force pass away

In other words:

- narrow aggressively while discovering the problem
- broaden temporarily to validate the shape
- compress back down to a small permanent oracle

Don't keep the big exploratory checker forever just because it was once useful. That usually turns validation into clutter.
