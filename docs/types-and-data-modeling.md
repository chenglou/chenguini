Highly value asking about & modeling data structures and access patterns first and foremost when iterating. Don't be afraid to change data structure if a new feature requires remodeling. Don't just tackle things on incrementally.

Prefer type and union over interface and enum.

Parse & validate your data as early as possible. Don't pass down half-validated data then do ad-hoc checks in downstream call sites. For example, don't half-parse a route's payload then re-transform & check some of its fields in call sites later.

Guideline for typing potentially nullable string:

- If the nullable string has no valid `''` state (e.g. mandatory non-empty username), model it as `string | null`
- If the nullable string has valid `''` state, it's hard to say whether to model as `string | null` or `string` where `''` represents the empty state:
  - Former is nice and linter/type system reminds us to check for `null`. But then we miss checking `''`. Any over time there's always some callsite that either over-checks or under-checks for `''`.
  - Latter is technically the correct number of states, but has no built-in language support for explicitly checking for `''`.
- One thing's for sure: don't model a non-nullable string as `string | null`.

The reason we're diligent about trying not to introduce `null` when not needed, is that if a `null` wasn't meaningful (and just added into the type just because), you'll find that such checks now prevents the next person from removing `null` in the future from the callsite or definition site, since folks no longer know whether a `null` had a proper intentional meaning previously.

If you wanna refactor a data structure that's used everywhere, and can't do it one shot, make the new data structure, have it side by side with the old, and gradually migrate to the new one. Ideally, don't make the new one into a new state, since old callsites mutating the old data structure wouldn't have their changes reflected in the new one, and vice versa. So derive the new one from the old one each time through some function. Naturally, the accessors modifying the new one should, under the hood, mutate the old one (then the new one is again, automatically derived from the old one). Unidirectional data flow.

Avoid iterators. They're slow and alloc-heavy
A single forEach or map over data is fine, but more than that, just convert to regular loops
Avoid `reduce` in most cases except for simple cases like summing up numbers. Using reduce, especially with objects, likely means the data modeling is wrong. Likewise with flatMap most of the time.

DO NOT prematurily optimize data for performance at the cost of simplicity:
- Avoid caching
- Highly value single source of truth. Don't denormalize & add auxiliary fields on data that we could have just computed on the fly. The computations are quasi-free compared to memory
- Keep fewer data structures, flatter data, and collapse data with the same lifetimes together
