# Layout Verifier Contracts

Most layout math should not need a contract.

The analyzer should read ordinary source first. Only use a contract when one helper is genuinely opaque to the current verifier subset.

Examples:

- a text helper that the verifier should not inline
- a callback helper that walks visible lines
- a tiny boundary helper imported from a library

Bad uses:

- normal arithmetic the verifier could already read
- forcing app code to adopt special runtime helpers just for the checker

## Where Contracts Live

Contracts live in sibling `*.static-contracts.ts` files.

Examples:

- `layout-verifier/photo-gallery/prompt-layout.static-contracts.ts`
- `layout-verifier/nicer-hacker-news/hn-comment-layout.static-contracts.ts`

The auto-loader currently discovers contracts for:

- the analyzed source file itself
- its relative imports

So the intended shape is: bring in a helper, and its contract sidecar comes along with it.

## What A Contract Looks Like

Each file exports `staticLayoutContracts`:

```ts
import {contract, type StaticContractSpec} from '../contracts'

export const staticLayoutContracts = {
  layoutNextLine: contract.lookupArrayItem(0, ['lines'], 1, ['segmentIndex'], {defaultNull: true}),
} satisfies Record<string, StaticContractSpec>
```

The contract names must match the imported helper names the analyzer sees.

## Current Contract Shapes

The current DSL is intentionally small:

- `contract.returnValue(...)`
- `contract.returnArg(argIndex)`
- `contract.forEachArrayItem(arrayArgIndex, arrayPath, callbackArgIndex)`
- `contract.lookupArrayItem(sourceArgIndex, arrayPath, indexArgIndex, indexPath, {defaultNull})`
- `contract.stringUnitWidth(textArgIndex, unitWidth)`
- `contract.pushOrMergeRect(rectsArgIndex, nextArgIndex, {tolerance})`

And the value expression builder currently supports:

- `contractValue.arg(...)`
- `contractValue.argPath(...)`
- `contractValue.number(...)`
- `contractValue.null()`
- `contractValue.array(...)`
- `contractValue.object(...)`
- `contractValue.add(...)`
- `contractValue.mul(...)`

## Examples

Return a small structured value:

```ts
import {contract, contractValue, type StaticContractSpec} from '../contracts'

export const staticLayoutContracts = {
  measurePromptLayout: contract.returnValue(contractValue.object({
    width: contractValue.arg(1),
    visibleHeight: contractValue.mul(contractValue.arg(3), contractValue.number(2)),
    lines: contractValue.array([]),
  })),
} satisfies Record<string, StaticContractSpec>
```

Walk an array and thread callback effects back out:

```ts
export const staticLayoutContracts = {
  walkRichInlineLineRanges: contract.forEachArrayItem(0, ['lineRanges'], 2),
} satisfies Record<string, StaticContractSpec>
```

Return one item from an input array:

```ts
export const staticLayoutContracts = {
  layoutNextLine: contract.lookupArrayItem(0, ['lines'], 1, ['segmentIndex'], {defaultNull: true}),
} satisfies Record<string, StaticContractSpec>
```

## Range Mode Support

Range mode currently supports:

- `return-value`
- `return-arg`
- `lookup-array-item`, when the array items and index are exact
- `string-unit-width`, through string length ranges

Callback and rect-merge contracts are concrete-only for now. That is a real limitation, not a missing doc detail.

So if a range proof hits a callback helper or a merge helper, the next move is usually one of:

- prove a nearby leaf helper from source instead
- add a narrower concrete law
- widen the contract DSL only if the real target earns it

## Sketches

Contract sketches are drafts from samples.

If concrete samples show `visibleHeight = lineHeight * 2`, the sketcher can format a candidate `contract.returnValue(...)`. Treat that as review material. Do not auto-install it into a sidecar.

## How To Choose Between Source And Contract

Prefer source when the helper is:

- already in the verifier subset
- small enough to read directly
- likely to matter to several downstream laws

Prefer a contract when the helper is:

- intentionally opaque
- callback-shaped
- imported from another layer
- much more expensive to inline than the outer law is worth

The contract should state a small earned postcondition. It should not recreate a second layout engine downstream.
