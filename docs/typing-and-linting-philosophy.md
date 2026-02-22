A quick iteration & verification loop is important especially for AI now. To that end, we use nuanced TypeScript + linting to essentially monkeypatch the type system into a mostly correct one, while opinionatedly dropping all the unhelpful stylistic rules that distracts AI

Big items that makes TypeScript "unsound" or dangerous:
- `any`
- `unknown` (although this one we allow, as an ok escape hatch)
- over/under-cover switch & if statements (aka non-exhaustive pattern matching, in FP theory)
- dynamism around object fields (e.g add/remove field, read key as string)

We don't use rules that:
- drastically slow down checks. We don't use hook rules for example. Even on oxlint
- are just stylistic nits. And we take an honest look at ourselves to determine what's actually semantically important vs what's just engineering theater

Concretely, for TS config, we enable:

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

For linting config, we prefer oxlint + tsgolint for AI verification loop perf. But the recs below work for eslint too:

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
