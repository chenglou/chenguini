A quick iteration & verification loop is important especially for AI now. To that end, we use nuanced TypeScript + linting to essentially monkeypatch the type system into a mostly correct one, while opinionatedly dropping all the unhelpful stylistic rules that distracts AI

Big items that makes TypeScript "unsound" or dangerous:
- `any`
- `unknown` (although this one we allow, as an ok escape hatch)
- over/under-cover switch & if statements (aka non-exhaustive pattern matching, in FP theory)
- dynamism around object fields (e.g add/remove field, read key as string)

We don't use rules that:
- drastically slow down checks. We don't use hook rules for example. Even on oxlint
- are just stylistic nits. And we take an honest look at ourselves to determine what's actually semantically important vs what's just engineering theater

Concretely, for TS, we enable:
- strict
- noUncheckedIndexedAccess
- noImplicitReturns
- noImplicitOverride
- noUnusedLocals
- noUnusedParameters
- exactOptionalPropertyTypes
- allowUnreachableCode
- noFallthroughCasesInSwitch
- noPropertyAccessFromIndexSignature

For linting, we enable:
- no-duplicate-case
- @typescript-eslint/prefer-ts-expect-error
- no-unreachable
- no-unused-expressions
- @typescript-eslint/no-unsafe-assignment
- @typescript-eslint/no-unsafe-return
- @typescript-eslint/await-thenable
- @typescript-eslint/no-unnecessary-type-assertion
- @typescript-eslint/prefer-nullish-coalescing (with ignorePrimitives for boolean to be true)
- @typescript-eslint/strict-boolean-expressions (with allowNullableBoolean true and allowString false)
- @typescript-eslint/switch-exhaustiveness-check (with allowDefaultCaseForExhaustiveSwitch false, considerDefaultExhaustiveForUnions true and requireDefaultForNonUnion true)
- @typescript-eslint/no-unnecessary-condition (with allowConstantLoopConditions true)
- @typescript-eslint/no-base-to-string

Some of these configs for preventing extra checks (e.g. erroring on checking a value is null when it can't be) are crucial to shrink the codebase back when a feature's cleaned away. See `types-and-data-modeling.md` on the section for handling nulls for example.
