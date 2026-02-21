# Data Migration

Data migration has traditionally been a thorny problem: you try evolve a data shape arbitrarily (`any -> any`, with arbitrary accompanied side-effects), through a single universal solution to make it convenient. This usually ends up with some DSL that's worst of both worlds in terms of expressivity and convenience.

Through AI, we can specialize each migration's code without sacrificing anything. Let's go back to writing regular functions.

## Recommended Pattern

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

## The Sanitizer Round-Trip

Always pass migration output through the new version's sanitizer/validator before storing. If your migration has a bug — wrong field name, bad type, missing value — the sanitizer catches it immediately at migration time rather than later when the app tries to use the data.

## Testing

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
