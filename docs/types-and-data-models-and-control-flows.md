Highly value asking about & modeling data structures and access patterns first and foremost when iterating. Don't be afraid to change data structure if a new feature requires remodeling. Don't just tackle things on incrementally. AI can rewrite fast and well.

Prefer type and union over interface and enum.

Parse & validate your data as early as possible. Don't pass down half-validated data then do ad-hoc checks in downstream call sites. For example, don't half-parse a payload then re-transform & check some of its fields in call sites later.

Parse and normalize early but don't _interpret_ too early. Interpret data at a narrow useful scope that will see all interacting data and has a real reason to own the result. If e.g. a click handler only sees the click, but render also sees scroll position, hit targets and route state, store the click (or any other raw fact you'd otherwise lose) and let render decide what it means.

Strings are the `any` of data. If you're parsing, splitting, or regex-matching a string repeatedly, it should have been a structured type upstream. If there's already such data type and you're still forced to use the original unparsed string, then that data type was modeled too tightly and lost necessary info. Fix that instead
Careful making a composite key through string concat of parts (e.g. `` `${id}-${index}` `` as a Set key). In a hot loop this allocates a string per lookup

Two systems want different data representations. Expect data shape pressure at those boundaries. A text layout helper, canvas renderer, or search index may want data grouped, flattened, indexed, or split differently than your app does. As much as you can, own your data shapes and be very careful delegating those to a library.

A good helper should create _local_, not global, shape pressure. Quick design test: if you removed the helper tomorrow, would you only delete one adapter, or would you have to remodel your app state and control flow? If only the adapter breaks, the helper fits. If the whole app now has to carry the helper's shape around, the API is too prescriptive.

Guideline for typing potentially nullable string:

- If the nullable string has no valid `''` state (e.g. mandatory non-empty username), model it as `string | null`
- If the nullable string has valid `''` state, it's hard to say whether to model as `string | null` or `string` where `''` represents the empty state:
  - Former is nice and linter/type system reminds us to check for `null`. But then we miss checking `''`. Any over time there's always some callsite that either over-checks or under-checks for `''`.
  - Latter is technically the correct number of states, but has no built-in language support for explicitly checking for `''`.
- One thing's for sure: don't model a non-nullable string as `string | null`.

Unnecessary `null` in a type makes it hard to remove later. Future maintainers won't know if it was semantically meaningfully, added accidentally, or just an unnecessary defensive measure.

If you wanna refactor a data structure that's used everywhere, and can't do it one shot, make the new data structure, have it side by side with the old, and gradually migrate to the new one. Ideally, don't make the new one into a new state, since old callsites mutating the old data structure wouldn't have their changes reflected in the new one, and vice versa. So derive the new one from the old one each time through some function. Naturally, the accessors modifying the new one should, under the hood, mutate the old one (then the new one is again, automatically derived from the old one). Unidirectional data flow.

Avoid iterators. They're slow and alloc-heavy
A single forEach or map over data is fine, but more than that, just convert to regular loops
Avoid `reduce` in most cases except for simple cases like summing up numbers. Using reduce, especially with objects, likely means the data modeling is wrong. Likewise with flatMap most of the time.

DO NOT prematurily optimize data for performance at the cost of simplicity:
- Avoid caching
- Highly value single source of truth. Don't denormalize & add auxiliary fields on data that we could have just computed on the fly. The computations are quasi-free compared to memory
- Keep fewer data structures, flatter data, and collapse data with the same lifetimes together. E.g. store those same-lifetime values into object fields so that they're created & deleted together when we manipulate the obj. This is also why we avoid denormalized data, because having stuff in 2+ places falsely convey extra degrees of freedom. Think as if you need to manually allocate them; your app/component doesn't that _that_ many different lifetimes!
- Ideally, derived data should be computed and then gone, in the same scope as the inputs that produced them. Fewer lifetimes mismatches, less staleness
- Imagine: If multiple callsites need the same derived data in the same scope, we'd obviously compute it once and then use it many times below. But somehow, it feels ickier to store that derived data alongside the same object that holds the inputs that produced it. This is because a local derived value is just a computation result, but a derived field stored on the object becomes state. Its lifetime now follows the object rather than the evaluation that justified it, so you have created a second representation of the same fact, plus an invalidation problem

Resist future-proofing with generic helpers if you've only encountered one instance of the logic. The more abstract it gets, the bigger the risk for vagueness. The more indirection there is, the more the reader has to mentally compute the chain of generic logic to understand the callsite. This also closes off cleaner situation-specific algorithms and naming. Keep it local first. Generalize later when there's a second real use.

If behavior genuinely differs by some dimension, say, browser, feature flag, or mode, model that difference explicitly in one place. Don't weave it through a bunch of local conditionals.

DO NOT write defensive code like `foo?.bar?.baz`, or bigger defensive patterns that silence potential upstream causes of errors. Things are well-typed, and if weird type-related errors happen, that means somewhere _upstream_ is broken and needs fixing, not silenced per-callsite. Let it crash early.
Do consider defensive code in the context of provably shaky boundaries, e.g. user input, network responses. But do it only after user asks so. AI tends to overdo defensive coding.

Think twice before using overly generic data structures like Map and Set. They're fine in many cases, but in many others, it just means you haven't leveraged more properties & strong assumptions from your domain. Array's often a better bet unless your algorithm really needs `O(1)` access. Think more in C-style terms: where is a hash map more appropriate despite its higher friction?
Data structures tier:
- Record/tuple
- Array
- Map/set
(Tagged union is a bit of a special data structure that doesn't belong in this ranking. But obviously, use it)

Orient your data structure to match your access pattern. If you have `folders: Map<folderName, Set<imageId>>` but your hot path asks "which folders is this image in?", build `imageToFolders: Map<imageId, Set<folderName>>` once upfront. Don't scan all folders per image — that turns an O(1) lookup into O(folders).

O(n^2) is fine when both n's are bounded by domain constraints, e.g. images per job (~4) × collections (~tens) = ~hundreds. It's not fine when one n is user data that grows unboundedly (10k jobs, feed items). Watch out for bounded-looking inner loops that get nested inside an unbounded outer loop and repeated across the system — each instance is cheap but 4 repetitions × 10k jobs × 18 re-renders adds up.

## Control Flow

Folks try to "solve" performance by hiding them behind ever more obscure control flows, e.g. nested ifs, lazy imports, etc. Avoid these; they often just obscure the perf degradation, and add extra state checking & debugging complexity. We prefer making systems with even latency and throughput, like shaders or real-time systems: branchless, predictable. Branches (and caches) lower the cost of best-case scenarios by rising the cost of worst-case scenarios; we don't want that! We don't want a 4ms frame to reduce to 1ms while, in the worst case, upping it to 10ms (which is now a frame drop). So try to first and only cater to worst-case frame latency.

Avoid excessive asyncs. If needed, at least spot the asyncs that need to go together, and wrap them in a group with Promise.all. Prefer top-down control flow. E.g. don't do one `configLoaded.then(...)`, one `dataLoaded.then(...)`, then some shared `maybeStart()` / `if (fooReady && barReady)` handshake if what you really mean is "wait for both, then start".

Aggressively prefer `switch` over `if/else`, when possible (e.g. union values). Get those exhaustiveness coverages. Write conditions like a functional langauge with pattern matching:
- Do: `switch (payload.type) { case 'image': return handleImage(payload); case 'text': return handleText(payload); }`
- Don't: `if (payload.type === 'image') { handleImage(payload); } else if (payload.type === 'text') { handleText(payload); }`
- Don't: `const dispatch = { image: handleImage, text: handleText }; dispatch[payload.type](payload)`

The latter's especially prominent (using objects as dynamic dispatch tables). It's overly cute, wrecks static analysis, and cannot varie the value (function)'s shape

Loop invariants are extremely underutilized in reasoning. Understanding what doesn't change makes each iteration easy to verify, and makes static parts easier to lift outside of the loop.

Not all code reuse is good. Before extracting similar calls into helpers, consider whether the redundant work is actually a manifestation of a control flow that didn't properly compute the shared part before the downstream usage sites.

### Exceptions

Exceptions are non-local control flow. They cause invalid states. Avoid them, apart from 2 cases:
- _Do_ throw when something is unrecoverable. Use it the same way some languages use `panic`
- _Do_ throw instead of silently hiding big invariant violations, e.g. when a React context is only supposed to be used in certain paths, or when a DOM node that's guaranteed to be present is missing. Silencing those end up making you propagate e.g. a null value, making your app state look much bigger than it actually is. See the early `null` section

If the error is actually expected and recoverable, don't throw; model with regular data/control flow. When using APIs that throw, try & catch them early.

### Model The Dependency Order Directly

If two parts of your app depend on the same upstream fact, derive both from that fact. Don't make the program rediscover dependencies it already knows.

Reactive systems, event-driven systems, and DOM-driven code often do black-box theater here: one part "emits", "updates", or "writes to the DOM", and another part tries to recover meaning later. This hides order and precedence, then later someone has to reconstruct them from timing, subscription order, or DOM reads.

- don't update an animated card's DOM position, then measure the DOM somewhere else to drive a sibling effect. Compute the card position once, then feed both the DOM styles and the sibling effect from it.
- don't fire several events and let downstream listeners reconstruct which state won. Put that ordering logic in one place that sees the relevant state, then feed the result downstream.

Your app is more of a white box than these systems pretend. Keep the ordering logic in one place. If something has to be messy, let it be visibly messy in one place instead of spread across listeners, effects, and DOM reads.

## Caching

Modern computing's much cheaper than memory. Recompute instead of storing the result. Computing, being ephemeral, avoids lifetime issues. If you have to cache, consider it more as a temporary acceleration structure, like in dynamic programming. Here are some notable exceptions:
- DOM, because they're genuinely expensive. We have a dedicated DOM caching section in [ui-architecture.md](../ui-architecture.md).
- truly expensive computations after real measurements
- computations with stable input identity, real reuse, bounded cache size

## Project Setup

A quick iteration & verification loop is important especially for AI now. To that end, we use nuanced TypeScript + linting to essentially monkeypatch the type system into a mostly correct one, while opinionatedly dropping all the unhelpful stylistic rules that distracts AI

Big items that makes TypeScript "unsound" or dangerous:
- `any`
- `unknown` (although this one we allow, as an ok escape hatch)
- over/under-cover switch & if statements (aka non-exhaustive pattern matching, in FP theory)
- dynamism around object fields (e.g add/remove field, read key as string)

We don't use rules that:
- drastically slow down checks. We don't use hook rules for example. Even on oxlint
- are just stylistic nits. And we take an honest look at ourselves to determine what's actually semantically important vs what's just engineering theater

Concretely, for TS config (use `@typescript/native-preview`. Faster):

```jsonc
"strict": true,
"noUncheckedIndexedAccess": true,
"noImplicitReturns": true,
"noImplicitOverride": true,
"noUnusedLocals": true,
"noUnusedParameters": true,
"exactOptionalPropertyTypes": true,
"allowUnreachableCode": true, // we allow this because our editor settings' uses "source.fixAll", which fixes everything on save. But then temporarily dead code gets removed during iteration, which sucks. So we replace this with oxlint's "no-unreachable" rule, which isn't auto-fixed
"noFallthroughCasesInSwitch": true,
"noPropertyAccessFromIndexSignature": true, // life-saver
```

For linting, we prefer oxlint + tsgolint npm packages for AI verification loop perf. But the recs below work for eslint too:

```jsonc
"plugins": ["typescript", "oxc"], // no need to turn on other things. Others might be noisy for AI
"prefer-ts-expect-error": "error",
"no-unnecessary-type-assertion": "error",
"no-unreachable": "error", // we use this instead of typescript's "allowUnreachableCode" (see tsconfig)
"@typescript-eslint/no-explicit-any": "error",
"@typescript-eslint/no-unsafe-assignment": "error",
"@typescript-eslint/no-unsafe-return": "error",
"@typescript-eslint/no-unsafe-member-access": "error",
"@typescript-eslint/prefer-nullish-coalescing": ["error", {
  "ignorePrimitives": { "boolean": true },
}],
"@typescript-eslint/strict-boolean-expressions": ["error", {
  "allowNullableBoolean": true,
  "allowString": false, // disable `!myString` and `!myNullableString`
}],
"@typescript-eslint/switch-exhaustiveness-check": ["error", {
  "allowDefaultCaseForExhaustiveSwitch": false,
  "considerDefaultExhaustiveForUnions": true,
  "requireDefaultForNonUnion": true,
}],
"@typescript-eslint/no-unnecessary-condition": ["error", {
  "allowConstantLoopConditions": true,
}],
"no-unused-expressions": ["error", {
  "allowTernary": true,
  "allowShortCircuit": true,
}],
// "@typescript-eslint/no-base-to-string": "error", // enabled by default in oxlint. Prevents showing string [object Object]. This also lets us construct IDs from strings, without letting these IDs be subject to string manipulations
```

Some of these configs for preventing extra checks (e.g. erroring on checking a value is null when it can't be) are crucial to shrink the codebase back when a feature's cleaned away. See early section for handling nulls for example.

Recommended alias in package.json as e.g.:

```jsonc
"scripts": {
  "check": "tsgo && oxlint --type-aware yourSourceFolder",
}
```

## Data Migration

Data migration has traditionally been a thorny problem: you try evolve a data shape arbitrarily (`any -> any`, with arbitrary accompanied side-effects), through a single universal solution to make it convenient. This usually ends up with some DSL that's worst of both worlds in terms of expressivity and convenience.

Through AI, we can specialize each migration's code without sacrificing anything. Let's go back to writing regular functions.

### Recommended Pattern

Here's an example based on upgrading user's localStorage data, e.g. persisted settings:

- Assuming you have `dataV1.ts`, `dataV2.ts`, and `data.ts` (most recent version, implicitly v3)
- A `migrate.ts` file with all the migration functions, and `migrate.test.ts`

To do a migration:
1. Copy `data.ts` to `dataV3.ts`. This is now immutable — the old version, preserved exactly as it was.
2. Modify `data.ts` freely. This is the new version, v4. Change the schema, rename fields, restructure however you want.
  - This is the time to remove all fields from v3 that are no longer needed
  - Once this is in production, `data.ts` also becomes immutable. Any modifications need another migration. This is cumbersome, but there are shortcuts to alter your data without violating invariants, if your data schema library is lenient enough:
    - You can add new fields to the schema and make them optional with a default value, assuming the schema library allows decoding & filling absent fields with a default
    - You can remove fields from the schema, assuming the schema library ignores unknown fields when parsing the existing persisted data
    - You can add new enum/union values to a particular field of your schema
3. Write a `migrate3To4()` function that reads the old format and writes the new one. One-off, turing-complete, no constraints.
4. **Don't** forget that it's a good time to:
    - Turn optional fields with default values, tackled onto the old schema, into required fields when necessary (see Shortcuts notes at the end)
    - Prune old fields that are no longer needed

**DO NOT** refactor the new `dataV3.ts`, nor make the newly modified `data.ts` depend on `dataV3.ts`. `dataV3.ts` is a frozen snapshot of the old version, which guarantees that we didn't break the old data format. We also wanna be able to delete it in the future without having to refactor `data.ts`, which might have become `dataV4.ts` (when there's a `dataV5.ts` and further data files). Basically, keep old versions immutable for easy guarantees and refactors-free deletions.

`dataV3.ts`:
```ts
import * as S from 'sury' // random schema library you might use

const schema = S.schema({
  theme: S.union(['light', 'dark']),
  fontSize: S.number,
})
export type Data = S.Output<typeof schema>
export const localStorageKey = 'settings_v3'

export function sanitize(raw: string): Data {
  try {
    return S.parseOrThrow(JSON.parse(raw), schema) // validate the data, which could have been corrupted or tampered with
  } catch {
    return { theme: 'light', fontSize: 14 } // default fallback
  }
}
```

`migrate.ts`
```ts
import { sanitize as sanitizeV3, localStorageKey as keyV3 } from './dataV3'
import { sanitize as sanitizeV4, localStorageKey as keyV4 } from './data'

// example new migration function
export function migrate3To4() {
  const old = localStorage.getItem(keyV3)
  if (old == null) return

  const v3 = sanitizeV3(old)
  const v4 = { ...v3, language: 'en' } // one new field

  const clean = sanitizeV4(JSON.stringify(v4)) // optional run-time round-tripping through the new sanitizer to catch migration bugs

  localStorage.removeItem(keyV3) // clean up the old key
  localStorage.setItem(keyV4, JSON.stringify(clean))
}
```

Callsite can daisy-chain conversions (do this as early as possible. Don't use old data versions in your app):

```ts
import { localStorageKey } from './data'
migrate1To2()
migrate2To3()
migrate3To4()
const data = loadCurrentVersionFromLocalStorage(localStorageKey)
```

Each function is a no-op if its source key doesn't exist. A user on v1 chains through all three. A user on v3 skips the first two.

### The Sanitizer Round-Trip

Always pass migration output through the new version's sanitizer/validator before storing. If your migration has a bug — wrong field name, bad type, missing value — the sanitizer catches it immediately at migration time rather than later when the app tries to use the data.

### Testing

Getting migration wrong is expensive. We recommend testing the daisy chaining:

```ts
class LocalStorageMock implements Storage { /* stub localStorage functions */}

beforeEach(() => {
  globalThis.localStorage = new LocalStorageMock()
})

test('end-to-end migration from oldest to newest', () => {
  localStorage.setItem(keyV1, JSON.stringify(sampleV1))
  migrate1To2()
  migrate2To3()
  migrate3To4()
  expect(localStorage.getItem(keyV1)).toBeNull() // all wiped
  expect(localStorage.getItem(keyV2)).toBeNull()
  expect(localStorage.getItem(keyV3)).toBeNull()

  const result = sanitizeV4(localStorage.getItem(keyV4)!)
  expect(result.theme).toBe('dark') // spot-check a value that survived the chain
})

test('bad input falls back to defaults', () => {
  localStorage.setItem(keyV3, JSON.stringify({ theme: 'invalid', fontSize: 'abc' }))
  migrate3To4()

  const result = sanitizeV4(localStorage.getItem(keyV4)!)
  expect(result.theme).toBe('light') // sanitizer rejected bad data, used defaults
})
```
