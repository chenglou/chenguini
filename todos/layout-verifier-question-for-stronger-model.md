You are advising on a prototype static verifier for layout math in UI code.

The codebase is not available to you. Everything relevant is in this prompt.

## Goal

We want a verifier for userland layout math. Think "strong static checker for layout geometry", not a CSS linter.

Important constraints:

- We do **not** want authors to write a special layout DSL unless it becomes absolutely necessary.
- We do **not** want to special-case only first-class "layout helper" constructs if we can avoid it.
- We **do** want to understand ordinary TypeScript / JavaScript layout code: locals, arithmetic, `Math.min`, `Math.max`, `Math.floor`, `Math.ceil`, conditionals, loops, arrays, object literals, object spread, small pure helpers, etc.
- We are fine with explicit contract boundaries for opaque subsystems, e.g. userland text measurement from Pretext.
- We are fine with browser seam checks for the last mile. The static verifier does not need to prove the browser.

The broader philosophy is:

- "Fully JS-owned geometry" is good.
- "Fully JS-owned everything" is not required.
- We do not consider abandoning CSS/DOM-owned layout to be contortion.
- We **do** consider it contortion if authors must stop using natural layout arithmetic and instead write `add(...)`, `rect(...)`, symbolic wrappers, proof combinators, etc.

So the verifier should ideally adapt to natural userland layout code, not the other way around.

## The two demo shapes we care about

### 1. Photo gallery

This demo has a pretty clean "pure geometry seam" already.

Here is the actual layout model shape, simplified but faithful:

```ts
type Rect = { x: number, y: number, sizeX: number, sizeY: number }

type PromptGeometry = {
  box: Rect
  lineHeight: number
  lines: PromptLine[]
}

type ItemLayoutGeometry = {
  imageBox: Rect
  layoutBox: Rect
  occlusionBounds: Rect
  prompt: PromptGeometry
}

type GridLayoutModel = {
  boxMaxSizeX: number
  cols: number
  contentHeight: number
  items: Array<ItemLayoutGeometry & { hitArea: Rect }>
  rowsTop: number[]
}

type EdgeHitArea = {
  box: Rect
  targetIndex: number
}

type LineLayoutModel = {
  items: ItemLayoutGeometry[]
  leftHitArea: EdgeHitArea | null
  rightHitArea: EdgeHitArea | null
}
```

The key functions look like this:

```ts
const boxesGapX = 24
const boxesGapY = 24
const boxes1DGapX = 52
const boxes1DGapY = 28
const windowPaddingTop = 40
const hitArea1DSizeX = 100

function colsBoxMaxSizeXF(containerSizeX: number) {
  const boxMinSizeX = 220
  const cols = clamp(1, Math.floor((containerSizeX - boxesGapX) / (boxMinSizeX + boxesGapX)), 7)
  const boxMaxSizeX = (containerSizeX - boxesGapX - cols * boxesGapX) / cols
  return { cols, boxMaxSizeX }
}

function getGridLayout(layoutSources: LayoutSource[], windowSizeX: number): GridLayoutModel {
  const { cols, boxMaxSizeX } = colsBoxMaxSizeXF(windowSizeX)
  const rowsTop: number[] = [windowPaddingTop]
  const rowHeights: number[] = []
  const measurements: Array<{
    ar: number
    imageSizeX: number
    imageSizeY: number
    layoutHeight: number
    promptLayout: PromptLayout
  }> = []
  let rowHeight = 0

  for (let i = 0; i < layoutSources.length; i++) {
    const source = layoutSources[i]!
    const ar = source.ar
    const imgMaxSizeY =
      ar === 1 ? boxMaxSizeX * 0.85
      : ar < 1 ? boxMaxSizeX * 1.05
      : boxMaxSizeX
    const imageSizeX = Math.min(source.naturalSizeX, boxMaxSizeX, imgMaxSizeY * ar)
    const imageSizeY = imageSizeX / ar
    const promptLayout = measurePromptLayout(source.preparedPrompt, imageSizeX, prompt2DMaxLines, prompt2DLineHeight, true)
    const layoutHeight = imageSizeY + promptLayout.visibleHeight + promptPaddingBottom
    measurements.push({ ar, imageSizeX, imageSizeY, layoutHeight, promptLayout })
    rowHeight = Math.max(rowHeight, layoutHeight)
    if (i % cols === cols - 1 || i === layoutSources.length - 1) {
      rowHeights.push(rowHeight)
      rowsTop.push(rowsTop.at(-1)! + rowHeight + boxesGapY)
      rowHeight = 0
    }
  }

  return {
    boxMaxSizeX,
    cols,
    contentHeight: rowsTop.at(-1)!,
    items: measurements.map((measurement, i) => {
      const currentRow = Math.floor(i / cols)
      const x = boxesGapX + (boxMaxSizeX + boxesGapX) * (i % cols) + (boxMaxSizeX - measurement.imageSizeX) / 2
      const y = rowsTop[currentRow]! + (rowHeights[currentRow]! - measurement.layoutHeight) / 2
      const geometry = makeItemLayoutGeometry(
        x,
        y,
        measurement.imageSizeX,
        measurement.imageSizeY,
        measurement.promptLayout,
        prompt2DLineHeight,
      )
      return {
        ...geometry,
        hitArea: geometry.layoutBox,
      }
    }),
    rowsTop,
  }
}

function getLineLayout(
  layoutSources: LayoutSource[],
  focused: number,
  windowSizeX: number,
  windowSizeY: number,
  scrollY: number,
): LineLayoutModel {
  const box1DMaxSizeY = windowSizeY - windowPaddingTop - boxes1DGapY
  const box1DMaxSizeX = windowSizeX - boxes1DGapX * 2 - hitArea1DSizeX * 2
  const measurements = layoutSources.map((source, i) =>
    get1DItemSize(source, box1DMaxSizeX, box1DMaxSizeY, i === focused ? 1 : 0.7))

  let currentLeft = hitArea1DSizeX + boxes1DGapX
  for (let i = focused - 1; i >= 0; i--) currentLeft -= measurements[i]!.imageSizeX + boxes1DGapX

  const items: ItemLayoutGeometry[] = []
  for (let i = 0; i < layoutSources.length; i++) {
    const measurement = measurements[i]!
    const x = i === focused ? (windowSizeX - measurement.imageSizeX) / 2 : currentLeft
    const y = Math.max(windowPaddingTop, (windowSizeY - measurement.layoutHeight) / 2) + scrollY
    items.push(makeItemLayoutGeometry(
      x,
      y,
      measurement.imageSizeX,
      measurement.imageSizeY,
      measurement.promptLayout,
      prompt1DLineHeight,
    ))
    currentLeft = i === focused ? windowSizeX - hitArea1DSizeX : currentLeft + measurement.imageSizeX + boxes1DGapX
  }

  return {
    items,
    leftHitArea: focused > 0 ? { box: rect(0, scrollY, hitArea1DSizeX, windowSizeY), targetIndex: focused - 1 } : null,
    rightHitArea: focused < layoutSources.length - 1 ? { box: rect(windowSizeX - hitArea1DSizeX, scrollY, hitArea1DSizeX, windowSizeY), targetIndex: focused + 1 } : null,
  }
}
```

There is also:

```ts
function makeItemLayoutGeometry(
  x: number,
  y: number,
  imageSizeX: number,
  imageSizeY: number,
  promptLayout: PromptLayout,
  promptLineHeight: number,
): ItemLayoutGeometry {
  const imageBox = rect(x, y, imageSizeX, imageSizeY)
  const layoutBox = rect(x, y, imageSizeX, imageSizeY + promptLayout.visibleHeight + promptPaddingBottom)
  return {
    imageBox,
    layoutBox,
    occlusionBounds: layoutBox,
    prompt: {
      box: rect(x, y + imageSizeY, promptLayout.width, promptLayout.visibleHeight),
      lineHeight: promptLineHeight,
      lines: promptLayout.lines,
    },
  }
}
```

This demo also has a runtime browser seam verifier that compares model geometry to actual rendered prompt line widths during resize. It found a real model-vs-render mismatch in some prompt cases, so prompt fitting is **not** yet fully in the proved zone.

### 2. Nicer Hacker News

This demo is only partly relevant so far, but it is the likely next stress test.

Its userland layout functions look roughly like this:

```ts
type Rect = { left: number, top: number, width: number, height: number }

type RowVisualGeometry = {
  rowIndex: number
  indent: number
  rowRect: Rect
  userRect: Rect
  commentRect: Rect
  gutter: { left: number, top: number, bottom: number }
  rowBottom: number
}

type ThreadVisualGeometry = {
  rows: RowVisualGeometry[]
  contentHeight: number
  firstVisibleRowIndex: number | null
  lastVisibleRowIndex: number | null
  firstVisibleRowTop: number | null
}

function layoutHNThreadVisualGeometry(params: {
  rows: Array<{
    indent: number
    rowHeight: number
    commentLayout: HNCommentLayout
  }>
  containerWidth: number
  indentWidth: number
  commentLeftGap: number
  commentRightGap: number
  commentUserGapNatural: number
  userHeightNatural: number
  rowsScrollerTopGap: number
  scrollerPeekUp: number
  scrollTopCap: number
  scrollerHeight: number
}) {
  const rows: RowVisualGeometry[] = []
  let rowTop = params.rowsScrollerTopGap + params.scrollerPeekUp - params.scrollTopCap
  let firstVisibleRowIndex: number | null = null
  let lastVisibleRowIndex: number | null = null
  let firstVisibleRowTop: number | null = null

  for (let rowIndex = 0; rowIndex < params.rows.length; rowIndex++) {
    const row = params.rows[rowIndex]!
    const rowBottom = rowTop + row.rowHeight
    const userHeight = Math.min(params.userHeightNatural, row.rowHeight)
    const userTop = clamp(rowTop, 0, rowBottom - userHeight)
    const indentsWidth = row.indent * params.indentWidth
    const commentRect = {
      left: indentsWidth + params.commentLeftGap,
      top: rowTop + params.userHeightNatural + params.commentUserGapNatural,
      width: row.commentLayout.width + params.commentRightGap,
      height: Math.max(0, row.rowHeight - userHeight - params.commentUserGapNatural),
    }
    // gutterTop / gutterBottom logic omitted here, but it is ordinary arithmetic and loops
    // visible-row bookkeeping omitted here too
    rows.push(...)
    rowTop = rowBottom
  }

  return {
    rows,
    contentHeight: rowTop + params.scrollTopCap,
    firstVisibleRowIndex,
    lastVisibleRowIndex,
    firstVisibleRowTop,
  }
}
```

Its comment layout is userland too, using Pretext. It already materializes per-line and per-fragment geometry. But some substring highlight rects are still reconstructed approximately by remeasuring sliced substrings, so that seam is not exact yet.

## What we built so far

We built a prototype static verifier for the photo gallery.

Implementation shape:

- It parses the actual TypeScript source with the TypeScript parser.
- It interprets a small ordinary-code subset rather than asking authors to write a special verifier DSL.
- It currently has a hybrid of:
  - symbolic evaluation for straight-line arithmetic/object code
  - interval-style abstract interpretation for some scalar functions
  - bounded concrete execution for small real input ranges and for loops/arrays where that is pragmatic
  - explicit contract overrides for opaque functions like `measurePromptLayout(...)`

The current internal supported subset includes:

- numeric literals, booleans, `null`
- identifiers and numeric globals
- unary `+` and `-`
- binary arithmetic and comparisons
- ternaries
- `if`
- `for`
- postfix `i++`
- arrays
- `.length`
- indexing
- `.map`
- `.push`
- `array.at(...)`
- object literals
- object spread
- object destructuring in local declarations
- local pure function calls
- `Math.min`
- `Math.max`
- `Math.floor`

It does **not** yet handle a general TS/JS subset. It is just enough to read real layout functions from source.

## What the prototype currently proves

On the photo-gallery demo, all of these pass today:

### Symbolic, source-level

- `makeItemLayoutGeometry` stays branch-free
- image box x equals layout box x
- prompt x equals image x
- prompt y equals image y + image height
- layout height equals image height + prompt visible height + bottom padding

### Concrete source interpretation

For `getLineLayout(...)`:

- stays branch-free per concrete scenario
- preserves item count
- keeps the focused image centered
- left hit area matches the previous target at the left edge
- right hit area matches the next target at the right edge
- item x order stays monotone

For `getGridLayout(...)`:

- stays branch-free per concrete width
- preserves item count
- `rowsTop` stays monotone
- `rowsTop.length === rowCount + 1`
- layout boxes stay within the viewport width
- same-row items do not overlap horizontally
- `contentHeight` equals the last row bottom plus bottom gap

### Interval-style abstract interpretation

For `colsBoxMaxSizeXF(containerSizeX)` over `containerSizeX in [320, 1600]`:

- `cols` stays in `[1, 7]`
- `cols` stays integral
- `boxMaxSizeX` stays non-negative

### Concrete sweep

For every integer width `320..1600`:

- `colsBoxMaxSizeXF` stays branch-free
- `cols` stays in `[1, 7]`
- `cols` stays integral
- `boxMaxSizeX >= 0`
- the returned `cols` and `boxMaxSizeX` exactly fill the horizontal track

There is also a separate runtime browser seam check that compares the model to the actual rendered prompt layout. That browser seam check still finds prompt overflow mismatches in some cases, so prompt fitting is not yet fully trusted.

## The theory shortlist so far

These are the branches of CS / math we think are most relevant:

- abstract interpretation
- symbolic execution
- affine / linear expression simplification
- SMT solving for linear arithmetic constraints
- Hoare-style pre/postconditions at function boundaries
- refinement-style contracts for opaque boundaries such as Pretext outputs
- possibly richer numeric domains later, e.g. octagons or polyhedra

What seems lower-priority:

- separation logic

Reason: it seems much more about heap ownership / aliasing than about rectangle arithmetic, monotonicity, piecewise formulas, and layout constraints.

## The practical questions

Please think hard about the following.

### 1. Architecture

Does the current hybrid architecture sound like the right path?

By "hybrid architecture" I mean:

- source-level interpretation of ordinary TS/JS layout code
- symbolic evaluation when the code is straight-line enough
- interval abstract interpretation when ranges are natural
- bounded concrete sweeps when the domain is small and real, e.g. viewport widths
- explicit contracts at opaque boundaries
- browser seam verification for the last mile

Should we keep growing this hybrid, or is there a cleaner unification that would let these methods coexist without feeling ad hoc?

For example:

- Is there a principled single framework that subsumes "symbolic eval + intervals + bounded concrete sweeps + contracts" for this problem?
- Should we think in terms of abstract interpretation with multiple abstract domains and selective concretization?
- Should we think in terms of symbolic execution plus widening / joining?
- Is there a better formulation entirely?

### 2. Natural authoring style

We want the verifier to handle natural JS layout code, not force people into a DSL.

How far can that realistically go before the economics flip and we should admit some restricted surface?

Concretely:

- Is parsing and interpreting ordinary TS the right bet here?
- What subset seems like the "high ROI plateau" for layout code before complexity explodes?
- Are there good ways to support natural helpers like `clamp`, local helper functions, arrays, loops, and `map` without growing an interpreter forever?
- Would some lightweight A-normal-form / SSA lowering help a lot here?
- Would extracting a control-flow graph and then doing standard numeric analysis on that be the more principled next step?

### 3. Contracts and Pretext

We now own text measurement and wrapping in userland through Pretext.

That seems like a big shift, because text layout no longer has to be browser-owned. We can imagine contracts like:

- widest line width <= offered width
- visible height = line count * line height, plus known block gaps
- fragment positions are stable with respect to the chosen line breaks

What is the right theory / mechanism for that layer?

Concretely:

- Should we model Pretext with refinement-style contracts?
- Hoare-style postconditions?
- Abstract summaries?
- Some separate proof-producing layout engine?

And how should those contracts compose with the outer rectangle verifier?

### 4. Loops, arrays, and collection-shaped layouts

A lot of real layout code is collection-shaped:

- compute measurements
- accumulate row heights
- push row boundaries
- map to final positioned items

Right now we handle some of that concretely.

What is the best next step for statically reasoning about code shaped like:

- `for` loops with accumulators
- arrays of measurements
- `rowsTop`
- `rowHeights`
- item placement by `i % cols` and `Math.floor(i / cols)`

Would you recommend:

- loop invariants by hand
- synthesized invariants
- summarized collection domains
- a shift to a relational numeric domain
- turning those loops into recurrence-like summaries
- something else

### 5. What to do next

We are deciding between two immediate next moves:

- keep pushing photo-gallery further
- or bring in the second demo now, which has more text/Pretext contracts and more irregular row geometry

Given everything above, which would you do next and why?

Also: from the methods above, what is the single next theory or technique you would try first?

### 6. Harder, more speculative question

If you had to design the "long-term clean theory" for this space, what would it be?

For example:

- a geometry-aware abstract interpreter over a JS/TS subset?
- a verifier built around numeric abstract domains plus contracts?
- a symbolic execution engine with domain-specific joins?
- a lightweight proof system for userland layout functions?
- something like liquid types / refinement typing over extracted layout IR?

I would especially like you to think about whether there is a satisfying unification across all the seemingly disparate methods we are already using.

## Constraints for your answer

Please answer as if you were advising a small but serious prototype effort, not a blue-sky research lab.

So:

- optimize for high-ROI next steps
- prefer things that preserve natural authoring style
- be honest about where theory is elegant but engineering is not
- if you think some path is a dead end, say so plainly
- if you think there is a better framing than "typed layout algebra", suggest it

If useful, structure your answer as:

1. What is working already
2. What is the likely deep unification
3. What the next implementation step should be
4. What contracts to ask Pretext for
5. Whether to bring in the second demo now
