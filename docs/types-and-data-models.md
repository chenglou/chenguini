Highly value asking about & modeling data structures and access patterns first and foremost when iterating. Don't be afraid to change data structure if a new feature requires remodeling. Don't just tackle things on incrementally.

Since we're aggressively coding with AI, please always think from first principle and redo data structures given new requirements instead of incrementally tackling thigns on top. **This is especially important** for e.g. DOM cache modeling, since we actually depend on the AI continuously changing the cache shape as requirements change.

Prefer type and union over interface and enum.
Aggressively prefer switch over if/else, when possible (e.g. union values). Get those proper branch coverages

Parse & validate your data as early as possible. Don't pass down half-validated data then do ad-hoc checks in downstream call sites. For example, don't half-parse a route's payload then re-transform & check some of its fields in call sites later.

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
- Keep fewer data structures, flatter data, and collapse data with the same lifetimes together

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
"@typescript-eslint/no-unsafe-assignment": "error",
"@typescript-eslint/no-unsafe-return": "error",
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
// "@typescript-eslint/no-base-to-string": "error", // enabled by default in oxlint. Prevents showing string [object Object]. This also lets us construct IDs from strings, without letting these IDs be subject to string manipulations
```

Some of these configs for preventing extra checks (e.g. erroring on checking a value is null when it can't be) are crucial to shrink the codebase back when a feature's cleaned away. See `types-and-data-modeling.md` on the section for handling nulls for example.

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
