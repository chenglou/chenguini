# Layout Verifier

Static layout checks for ordinary TS.

The checker reads function source plus strict `@layout` comments. It proves the comments from source, or reports `fail` / `unknown`. It does not run app code, open browsers, take screenshots, sample cases, or compare fixtures.

Annotations are erased like TS types.

## Run

```sh
bun run verify:layout
```

That checks the positive patterns in [patterns.ts](./patterns.ts) and the stable negative messages in [negative-patterns.ts](./negative-patterns.ts).

To inspect another file:

```sh
bun layout-verifier/verify.ts path/to/file.ts
```

## Write A Spec

Put a `@layout` block immediately above a function declaration:

```ts
/** @layout
 * given width: number[0, 1000]
 * result.capped: number[0, 320]
 * result.overflow >= 0
 */
function cappedOverflow(width: number) {
  const capped = Math.min(width, 320)
  return {capped, overflow: width - capped}
}
```

This is not prose. Unsupported lines are parser errors.

`given` lines are input assumptions. Bare lines are facts the checker must prove.

## Annotation Language

Ranges:

```ts
given width: number[0, 1000]
given items.length: int[0, 100]
result.x: number[10, 20]
result.index: int[0, 9]
```

`number[...]` means any real-ish JS number in that interval. `int[...]` also requires integer-ness.

Comparisons:

```ts
given container >= content
given index < items.length
result.left == (container - content) / 2
result.right > result.left
```

Supported comparison operators: `==`, `>=`, `<=`, `>`, `<`.

Sequence atoms:

```ts
monotone(result.rows.top)
monotone(result.rows, top)
contiguousY(result.rows, gap)
lastBottom(result.rows) == result.bottom
```

Only `monotone` and `contiguousY` are atoms today. `lastBottom(rows)` is an expression helper, so use it inside a comparison.

## What `given` Does

Use `given` for the function's required input domain:

```ts
/** @layout
 * given containee: number[0, 1000]
 * given container: number[0, 1000]
 * given container >= containee
 * result >= 0
 */
function centeredOffset(containee: number, container: number) {
  return (container - containee) / 2
}
```

Top-level `given` lines are trusted assumptions.

When a verified same-file helper is called, its `given` lines become things the caller must prove:

```ts
/** @layout
 * given value: number[4, 14]
 * result: number[5, 15]
 */
function addOne(value: number) {
  return value + 1
}

/** @layout
 * given width: number[0, 10]
 * result: number[5, 15]
 */
function caller(width: number) {
  return addOne(width + 4)
}
```

This tracking is same-file and transitive. Imports are not followed yet.

## Source Subset

The checker understands a small pure subset:

- function declarations
- simple named parameters
- numeric top-level constants
- `const` / `let` locals with initializers
- `return expression`
- ternaries
- return-style `if` guards
- direct same-file function calls
- object literals with normal or shorthand properties
- array literals, array spread, `.length`, and bounded literal indexing
- one append-only running-sum `for...of` loop shape

Unsupported source becomes `unknown`; unsupported annotation syntax is an error.

## Number Math

Arithmetic:

- `+`, `-`, unary `+`, unary `-`
- `*`
- `/`, only when the divisor range excludes zero
- `%`, only for non-negative values and positive divisors
- `**`, currently useful for non-negative squares and constant bases

Math calls:

- `Math.floor`
- `Math.ceil`
- `Math.round`
- `Math.trunc`
- `Math.abs`
- `Math.sqrt`, only over non-negative ranges
- `Math.min`
- `Math.max`

Known facts include:

- `Math.floor(x) <= x`
- `Math.ceil(x) >= x`
- `Math.ceil(total / count) * count >= total`, when `total >= 0` and `count > 0`
- `Math.floor(pointer / cellSize) < count`, when `pointer < count * cellSize` and `cellSize > 0`
- `index % count < count`, when `index >= 0` and `count > 0`
- multiplying both sides by the same known non-negative value preserves `<=`
- dividing both sides by the same known positive value preserves `<=`

`Math.min` / `Math.max` keep small local branch facts:

```ts
/** @layout
 * given width: number[0, 1000]
 * result.overflow >= 0
 */
function overflow(width: number) {
  const capped = Math.min(width, 320)
  return {overflow: width - capped}
}
```

That works because either `capped == width`, or `capped == 320` and `width >= 320`.

## Linear Facts

The checker carries tiny linear facts from ranges and comparisons.

This proves ordinary slack:

```ts
/** @layout
 * given content: number[0, 1000]
 * given padding: number[0, 100]
 * given width: number[0, 1200]
 * given width >= content + padding
 * result >= 0
 */
function remaining(width: number, content: number) {
  return width - content
}
```

It is not a full linear solver. It reduces a few known non-negative facts, bounded by a small depth.

## Arrays

Supported today:

- `given items.length: int[0, 100]`
- `given row.height: number[0, 40]`
- `given items[]: number[0, 400]`
- `given items[].height: number[0, 40]`
- reading `items.length`
- reading object fields with declared domains
- reading `items[index].height` after `0 <= index < items.length`
- array literal length
- array literal element values
- `[...items, value]` length
- index checks when the index is proven integer and `0 <= index < array.length`

Example:

```ts
/** @layout
 * given items.length: int[0, 100]
 * given index: int[0, 100]
 * given index < items.length
 * result.index < items.length
 */
function keepIndex(items: number[], index: number) {
  return {index}
}
```

Not supported yet:

- relational per-item domains like `cells[].start + cells[].span <= columnCount`
- general array mutation
- arbitrary indexed values from unknown arrays

## Running Sums

The first loop primitive is this shape:

```ts
/** @layout
 * given items.length: int[1, 50]
 * given items[].height: number[0, 40]
 * given top: number[0, 1000]
 * given gap: number[0, 10]
 * result.rows.length == items.length
 * result.rows[].height: number[0, 40]
 * monotone(result.rows.top)
 * contiguousY(result.rows, gap)
 * lastBottom(result.rows) == result.bottom
 */
function stackRows(items: Item[], top: number, gap: number) {
  const rows = []
  let y = top
  for (const item of items) {
    rows.push({top: y, height: item.height, source: item})
    y += item.height + gap
  }
  return {rows, bottom: y - gap}
}
```

It proves:

- `rows.length == items.length`
- `monotone(rows.top)`, when the increment is non-negative
- `contiguousY(rows, gap)`, when the increment is `height + gap`
- `lastBottom(rows)`, when the input length is known non-empty and each pushed row has `top` and `height`

It also accepts a scalar row height and `y += rowHeight`, which means `contiguousY(rows, 0)`.

It does not yet prove facts about conditional rows.

## Results

Each check is:

- `pass`: proven
- `fail`: proven false or outside the requested range
- `unknown`: the checker could not prove it

`unknown` is real. It is not a soft pass.

## Missing On Purpose

Not supported yet:

- browser runs, screenshots, runtime traces, sampled sweeps
- imports or module summaries
- classes, methods, closures, async, generators
- destructured params, rest params, default params
- TS type narrowing, generics, overloads
- strings, booleans, unions, branded types
- object precondition domains like `row.height: number[0, 40]`
- geometry atoms: `rectInside`, `rectEquals`, `nonOverlapX`, `nonOverlapY`
- Pretext text facts
- table/grid/flex column negotiation
- general loops
- general nonlinear arithmetic

If you need a guarantee and it is in this list, add a pattern first. Prefer one positive pattern and one negative message.

## Add New Support

Use [patterns.ts](./patterns.ts) as the runnable catalog. Put one clear good example there.

Use [negative-patterns.ts](./negative-patterns.ts) for the matching bad example, and update [negative-patterns.expected.txt](./negative-patterns.expected.txt).

Then run:

```sh
bun run verify:layout
bun check
```

Keep the guarantee static. Red probes are fine while designing a fact, but do not commit runtime evidence as the verifier's proof.
