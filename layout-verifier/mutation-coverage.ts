// Automatic mutation coverage analysis for layout verifiers.
//
// Enumerates every arithmetic site in a layout source file (numeric literals,
// binary operators), applies systematic mutations, runs the verifier on each,
// and reports which mutations were caught vs missed.
//
// For missed mutations, runs the layout function on both the original and
// mutated source with concrete inputs and renders an SVG diff showing the
// geometric difference the verifier didn't notice.

import * as ts from 'typescript'
import {
  concreteArray,
  concreteNull,
  concreteNumber,
  concreteObject,
  expectArray,
  expectConcreteNumber,
  expectObject,
  getProp,
  joinRangeCases,
  LoweredProgramAnalyzer,
  type ArrayValue,
  type FunctionOverride,
  type StaticLayoutVerificationReport,
} from './core'
import type {RangeValue} from './values'

// Mutation site: a position in the source text that can be mutated.

export type MutationSite = {
  kind: 'numeric-literal' | 'binary-operator' | 'comparison-operator'
  start: number
  end: number
  original: string
  line: number
  context: string // surrounding source for human readability
}

export type Mutation = {
  site: MutationSite
  replacement: string
  label: string
}

export type MutationResult = {
  mutation: Mutation
  outcome: 'caught' | 'missed' | 'crashed'
  failedLaws?: string[]
}

export type MutationCoverageReport = {
  totalSites: number
  totalMutations: number
  caught: number
  missed: number
  crashed: number
  missedMutations: MutationResult[]
  caughtMutations: MutationResult[]
}

// Enumerate all mutable sites in a TS source file.
export function enumerateMutationSites(sourceText: string): MutationSite[] {
  const sourceFile = ts.createSourceFile('source.ts', sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  const sites: MutationSite[] = []
  const lines = sourceText.split('\n')

  function getLine(pos: number) {
    const lineAndChar = sourceFile.getLineAndCharacterOfPosition(pos)
    return lineAndChar.line + 1
  }

  function getContext(pos: number) {
    const lineIndex = getLine(pos) - 1
    return lines[lineIndex]?.trim() ?? ''
  }

  function walk(node: ts.Node) {
    // Numeric literals (skip type annotations)
    if (ts.isNumericLiteral(node) && !isInTypePosition(node)) {
      sites.push({
        kind: 'numeric-literal',
        start: node.getStart(sourceFile),
        end: node.getEnd(),
        original: node.text,
        line: getLine(node.getStart(sourceFile)),
        context: getContext(node.getStart(sourceFile)),
      })
    }

    // Binary operators in expressions
    if (ts.isBinaryExpression(node)) {
      const opToken = node.operatorToken
      const opText = opToken.getText(sourceFile)
      if (['+', '-', '*', '/', '%'].includes(opText)) {
        sites.push({
          kind: 'binary-operator',
          start: opToken.getStart(sourceFile),
          end: opToken.getEnd(),
          original: opText,
          line: getLine(opToken.getStart(sourceFile)),
          context: getContext(opToken.getStart(sourceFile)),
        })
      }
      if (['>', '>=', '<', '<=', '===', '!=='].includes(opText)) {
        sites.push({
          kind: 'comparison-operator',
          start: opToken.getStart(sourceFile),
          end: opToken.getEnd(),
          original: opText,
          line: getLine(opToken.getStart(sourceFile)),
          context: getContext(opToken.getStart(sourceFile)),
        })
      }
    }

    ts.forEachChild(node, walk)
  }

  walk(sourceFile)
  return sites
}

function isInTypePosition(node: ts.Node): boolean {
  let current = node.parent
  while (!ts.isSourceFile(current)) {
    if (ts.isTypeNode(current) || ts.isTypeAliasDeclaration(current) || ts.isInterfaceDeclaration(current)) return true
    current = current.parent
  }
  return false
}

// Generate mutations for a site.
export function generateMutations(site: MutationSite): Mutation[] {
  const mutations: Mutation[] = []

  if (site.kind === 'numeric-literal') {
    const value = Number(site.original)
    const candidates: Array<[number, string]> = [
      [value + 1, '+1'],
      [value - 1, '-1'],
      [0, '→0'],
    ]
    if (value !== 0) candidates.push([-value, 'negate'])
    if (value > 1) candidates.push([value * 2, '×2'])

    for (const [replacement, label] of candidates) {
      if (replacement !== value) {
        mutations.push({
          site,
          replacement: String(replacement),
          label: `${site.original}${label}`,
        })
      }
    }
  }

  if (site.kind === 'binary-operator') {
    const swaps: Record<string, string[]> = {
      '+': ['-'],
      '-': ['+'],
      '*': ['/'],
      '/': ['*'],
      '%': ['+'],
    }
    for (const replacement of swaps[site.original] ?? []) {
      mutations.push({
        site,
        replacement,
        label: `${site.original}→${replacement}`,
      })
    }
  }

  if (site.kind === 'comparison-operator') {
    const swaps: Record<string, string[]> = {
      '>': ['>=', '<'],
      '>=': ['>', '<='],
      '<': ['<=', '>'],
      '<=': ['<', '>='],
      '===': ['!=='],
      '!==': ['==='],
    }
    for (const replacement of swaps[site.original] ?? []) {
      mutations.push({
        site,
        replacement,
        label: `${site.original}→${replacement}`,
      })
    }
  }

  return mutations
}

// Apply a mutation to source text.
export function applyMutation(sourceText: string, mutation: Mutation): string {
  return sourceText.slice(0, mutation.site.start) + mutation.replacement + sourceText.slice(mutation.site.end)
}

// Run mutation coverage analysis.
export function runMutationCoverage(
  sourceText: string,
  verify: (mutatedSource: string) => StaticLayoutVerificationReport,
): MutationCoverageReport {
  const sites = enumerateMutationSites(sourceText)
  const allMutations: Mutation[] = []
  for (const site of sites) allMutations.push(...generateMutations(site))

  const results: MutationResult[] = []
  for (const mutation of allMutations) {
    const mutatedSource = applyMutation(sourceText, mutation)
    try {
      const report = verify(mutatedSource)
      if (report.phase === 'error') {
        const failedLaws = report.laws.filter(l => l.status === 'fail').map(l => l.name)
        results.push({mutation, outcome: 'caught', failedLaws})
      } else {
        results.push({mutation, outcome: 'missed'})
      }
    } catch {
      results.push({mutation, outcome: 'crashed'})
    }
  }

  return {
    totalSites: sites.length,
    totalMutations: allMutations.length,
    caught: results.filter(r => r.outcome === 'caught').length,
    missed: results.filter(r => r.outcome === 'missed').length,
    crashed: results.filter(r => r.outcome === 'crashed').length,
    missedMutations: results.filter(r => r.outcome === 'missed'),
    caughtMutations: results.filter(r => r.outcome === 'caught'),
  }
}

// SVG diff rendering for uncaught mutations.
// Runs the layout function on both original and mutated source,
// extracts the geometry, and renders an overlaid SVG showing
// the original (green) vs mutated (red) layout.

type LayoutRect = {x: number; y: number; w: number; h: number; label: string}

function extractGridRects(analyzer: LoweredProgramAnalyzer, layoutSources: ArrayValue): LayoutRect[] {
  const returns = analyzer.evaluateFunction('getGridLayout', [layoutSources, concreteNumber(800)], 'concrete')
  if (returns.length !== 1) return []
  const layout = expectObject(returns[0]!.value)
  const items = expectArray(getProp(layout, 'items'))
  const rects: LayoutRect[] = []

  for (let i = 0; i < items.items.length; i++) {
    const item = expectObject(items.items[i]!)
    const imageBox = expectObject(getProp(item, 'imageBox'))
    const layoutBox = expectObject(getProp(item, 'layoutBox'))
    rects.push({
      x: expectConcreteNumber(getProp(imageBox, 'x')),
      y: expectConcreteNumber(getProp(imageBox, 'y')),
      w: expectConcreteNumber(getProp(imageBox, 'sizeX')),
      h: expectConcreteNumber(getProp(imageBox, 'sizeY')),
      label: `img${i}`,
    })
    rects.push({
      x: expectConcreteNumber(getProp(layoutBox, 'x')),
      y: expectConcreteNumber(getProp(layoutBox, 'y')),
      w: expectConcreteNumber(getProp(layoutBox, 'sizeX')),
      h: expectConcreteNumber(getProp(layoutBox, 'sizeY')),
      label: `layout${i}`,
    })
  }
  return rects
}

function makeTestLayoutSources() {
  return concreteArray([
    concreteObject({ar: concreteNumber(1), naturalSizeX: concreteNumber(400), preparedPrompt: concreteNull('concrete')}),
    concreteObject({ar: concreteNumber(1.5), naturalSizeX: concreteNumber(700), preparedPrompt: concreteNull('concrete')}),
    concreteObject({ar: concreteNumber(0.75), naturalSizeX: concreteNumber(480), preparedPrompt: concreteNull('concrete')}),
    concreteObject({ar: concreteNumber(2), naturalSizeX: concreteNumber(900), preparedPrompt: concreteNull('concrete')}),
  ])
}

export function renderMutationDiffSVG(
  originalSource: string,
  mutatedSource: string,
  mutation: Mutation,
  externalGlobals: Record<string, number>,
  overrides: Record<string, FunctionOverride>,
): string {
  const layoutSources = makeTestLayoutSources()
  let originalRects: LayoutRect[] = []
  let mutatedRects: LayoutRect[] = []

  try {
    const origAnalyzer = new LoweredProgramAnalyzer(originalSource, externalGlobals, overrides)
    originalRects = extractGridRects(origAnalyzer, layoutSources)
  } catch { /* layout function may not be analyzable with these overrides */ }

  try {
    const mutAnalyzer = new LoweredProgramAnalyzer(mutatedSource, externalGlobals, overrides)
    mutatedRects = extractGridRects(mutAnalyzer, layoutSources)
  } catch { /* mutated source may crash */ }

  if (originalRects.length === 0 && mutatedRects.length === 0) {
    return `<!-- No geometry extracted for mutation: ${mutation.label} at line ${mutation.site.line} -->`
  }

  const allRects = [...originalRects, ...mutatedRects]
  const maxX = Math.max(800, ...allRects.map(r => r.x + r.w)) + 20
  const maxY = Math.max(600, ...allRects.map(r => r.y + r.h)) + 20
  const scale = Math.min(1, 800 / maxX, 600 / maxY)

  const lines: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.ceil(maxX * scale)}" height="${Math.ceil(maxY * scale + 40)}" viewBox="0 0 ${maxX} ${maxY + 50}">`,
    `  <style>`,
    `    .original { fill: none; stroke: #2d7; stroke-width: 2; opacity: 0.8; }`,
    `    .mutated { fill: none; stroke: #d42; stroke-width: 2; opacity: 0.8; stroke-dasharray: 6,3; }`,
    `    .label { font: 11px monospace; fill: #555; }`,
    `    .title { font: bold 13px monospace; fill: #333; }`,
    `  </style>`,
    `  <text x="10" y="16" class="title">Line ${mutation.site.line}: ${escapeXML(mutation.label)} — ${escapeXML(mutation.site.context)}</text>`,
    `  <text x="10" y="32" class="label"><tspan fill="#2d7">■</tspan> original  <tspan fill="#d42">■</tspan> mutated</text>`,
    `  <g transform="translate(0, 40)">`,
  ]

  for (const rect of originalRects) {
    lines.push(`    <rect class="original" x="${rect.x}" y="${rect.y}" width="${rect.w}" height="${rect.h}"/>`)
  }
  for (const rect of mutatedRects) {
    lines.push(`    <rect class="mutated" x="${rect.x}" y="${rect.y}" width="${rect.w}" height="${rect.h}"/>`)
  }

  lines.push(`  </g>`)
  lines.push(`</svg>`)
  return lines.join('\n')
}

function escapeXML(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

// Invariant mining: automatically discover candidate laws from range analysis.
//
// Runs evaluateFunctionRange with wide input intervals and inspects the output
// to extract facts the verifier could check: bounds, integrality, monotonicity,
// structural equalities.

export type MinedInvariant = {
  functionName: string
  property: string
  kind: 'bound' | 'integer' | 'monotone' | 'non-negative' | 'exact'
  description: string
}

export function mineInvariants(
  sourceText: string,
  functionName: string,
  args: RangeValue[],
  externalGlobals: Record<string, number> = {},
): MinedInvariant[] {
  const analyzer = new LoweredProgramAnalyzer(sourceText, externalGlobals, {})

  const invariants: MinedInvariant[] = []

  try {
    const cases = analyzer.evaluateFunctionRange(functionName, args)
    const result = joinRangeCases(cases)
    extractInvariantsFromValue(invariants, functionName, 'return', result)
  } catch {
    // Function may not be analyzable in range mode
  }

  return invariants
}

function extractInvariantsFromValue(invariants: MinedInvariant[], functionName: string, path: string, value: RangeValue) {
  switch (value.kind) {
    case 'range-number': {
      if (value.isInteger) {
        invariants.push({functionName, property: path, kind: 'integer', description: `${path} is always an integer in [${value.min}, ${value.max}]`})
      }
      if (value.min >= 0) {
        invariants.push({functionName, property: path, kind: 'non-negative', description: `${path} is non-negative (min: ${value.min})`})
      }
      if (value.min === value.max) {
        invariants.push({functionName, property: path, kind: 'exact', description: `${path} is exactly ${value.min}`})
      } else {
        invariants.push({functionName, property: path, kind: 'bound', description: `${path} ∈ [${value.min}, ${value.max}]`})
      }
      break
    }
    case 'range-object':
      for (const [key, propValue] of Object.entries(value.props)) {
        extractInvariantsFromValue(invariants, functionName, `${path}.${key}`, propValue)
      }
      break
    case 'range-array':
      if (value.isStrictlyIncreasingNumeric) {
        invariants.push({functionName, property: path, kind: 'monotone', description: `${path} is strictly increasing`})
      }
      if (value.lengthMin === value.lengthMax) {
        invariants.push({functionName, property: path, kind: 'exact', description: `${path}.length is exactly ${value.lengthMin}`})
      }
      break
    case 'range-boolean':
    case 'range-string':
    case 'range-function':
    case 'range-opaque':
    case 'range-null':
      break
  }
}
