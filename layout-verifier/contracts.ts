import {existsSync, readFileSync} from 'node:fs'
import path from 'node:path'
import {pathToFileURL} from 'node:url'
import {
  concreteArray,
  concreteNull,
  concreteNumber,
  concreteObject,
  expectArray,
  expectConcreteNumber,
  expectObject,
  expectRangeArray,
  expectRangeNumber,
  expectRangeObject,
  expectRangeString,
  expectString,
  getProp,
  getRangeProp,
  invokeConcreteFunctionValue,
  type FunctionOverride,
  type FunctionOverrideSummary,
  rangeArray,
  rangeNull,
  rangeNumber,
  rangeObject,
  type RangeValue,
  type Value,
} from './core'
import * as ts from 'typescript'

export type StaticContractValueExpr =
  | {kind: 'arg'; argIndex: number}
  | {kind: 'arg-path'; argIndex: number; path: string[]}
  | {kind: 'number'; value: number}
  | {kind: 'null'}
  | {kind: 'array'; items: StaticContractValueExpr[]}
  | {kind: 'object'; props: Record<string, StaticContractValueExpr>}
  | {kind: 'add'; left: StaticContractValueExpr; right: StaticContractValueExpr}
  | {kind: 'mul'; left: StaticContractValueExpr; right: StaticContractValueExpr}

export type StaticContractSpec =
  | {
      kind: 'return-value'
      value: StaticContractValueExpr
    }
  | {
      kind: 'return-arg'
      argIndex: number
    }
  | {
      kind: 'for-each-array-item'
      arrayArgIndex: number
      arrayPath: string[]
      callbackArgIndex: number
    }
  | {
      kind: 'lookup-array-item'
      sourceArgIndex: number
      arrayPath: string[]
      indexArgIndex: number
      indexPath: string[]
      defaultNull?: boolean
    }
  | {
      kind: 'string-unit-width'
      textArgIndex: number
      unitWidth: number
    }
  | {
      kind: 'push-or-merge-rect'
      rectsArgIndex: number
      nextArgIndex: number
      tolerance?: number
    }

export type StaticContractSpecMap = Partial<Record<string, StaticContractSpec>>

export type StaticContractSketchSample = {
  args: Value[]
  value: Value
}

export type StaticContractSketch = {
  spec: StaticContractSpec
  evidence: number
}

export const contract = {
  returnValue(value: StaticContractValueExpr): StaticContractSpec {
    return {kind: 'return-value', value}
  },

  returnArg(argIndex: number): StaticContractSpec {
    return {kind: 'return-arg', argIndex}
  },

  forEachArrayItem(arrayArgIndex: number, arrayPath: string[], callbackArgIndex: number): StaticContractSpec {
    return {
      kind: 'for-each-array-item',
      arrayArgIndex,
      arrayPath,
      callbackArgIndex,
    }
  },

  lookupArrayItem(
    sourceArgIndex: number,
    arrayPath: string[],
    indexArgIndex: number,
    indexPath: string[],
    options: {defaultNull?: boolean} = {},
  ): StaticContractSpec {
    return {
      kind: 'lookup-array-item',
      sourceArgIndex,
      arrayPath,
      indexArgIndex,
      indexPath,
      defaultNull: options.defaultNull ?? false,
    }
  },

  stringUnitWidth(textArgIndex: number, unitWidth: number): StaticContractSpec {
    return {
      kind: 'string-unit-width',
      textArgIndex,
      unitWidth,
    }
  },

  pushOrMergeRect(rectsArgIndex: number, nextArgIndex: number, options: {tolerance?: number} = {}): StaticContractSpec {
    return {
      kind: 'push-or-merge-rect',
      rectsArgIndex,
      nextArgIndex,
      tolerance: options.tolerance ?? 0.5,
    }
  },
}

export const contractValue = {
  arg(argIndex: number): StaticContractValueExpr {
    return {kind: 'arg', argIndex}
  },

  argPath(argIndex: number, path: string[]): StaticContractValueExpr {
    return {kind: 'arg-path', argIndex, path}
  },

  number(value: number): StaticContractValueExpr {
    return {kind: 'number', value}
  },

  null(): StaticContractValueExpr {
    return {kind: 'null'}
  },

  array(items: StaticContractValueExpr[]): StaticContractValueExpr {
    return {kind: 'array', items}
  },

  object(props: Record<string, StaticContractValueExpr>): StaticContractValueExpr {
    return {kind: 'object', props}
  },

  add(left: StaticContractValueExpr, right: StaticContractValueExpr): StaticContractValueExpr {
    return {kind: 'add', left, right}
  },

  mul(left: StaticContractValueExpr, right: StaticContractValueExpr): StaticContractValueExpr {
    return {kind: 'mul', left, right}
  },
}

export function buildStaticContractOverrides(specs: StaticContractSpecMap): Record<string, FunctionOverride> {
  const overrides: Record<string, FunctionOverride> = {}

  for (const [name, spec] of Object.entries(specs)) {
    if (spec == null) continue
    overrides[name] = {
      summary: summarizeContractSpec(spec),

      evaluate(args, mode, context) {
        if (mode !== 'concrete') throw new Error(`${name} contract only supports concrete mode`)

        switch (spec.kind) {
          case 'return-value':
            return [{
              constraints: context.state.constraints,
              env: context.state.env,
              value: evaluateConcreteValueExpr(spec.value, args),
            }]

          case 'return-arg':
            return [{
              constraints: context.state.constraints,
              env: context.state.env,
              value: args[spec.argIndex]!,
            }]

          case 'for-each-array-item': {
            const callback = args[spec.callbackArgIndex]!
            const items = expectArray(getValueAtPath(args[spec.arrayArgIndex]!, spec.arrayPath)).items
            let activeStates = [context.state]
            for (let i = 0; i < items.length; i++) {
              const nextStates = []
              for (const state of activeStates) {
                const callbackReturns = invokeConcreteFunctionValue(context.analyzer, state, callback, [items[i]!])
                if (callbackReturns.length !== 1) throw new Error(`${name} callback must resolve to 1 case`)
                nextStates.push(callbackReturns[0]!.state)
              }
              activeStates = nextStates
            }
            return activeStates.map(state => ({
              constraints: state.constraints,
              env: state.env,
              value: concreteNull('concrete'),
            }))
          }

          case 'lookup-array-item': {
            const items = expectArray(getValueAtPath(args[spec.sourceArgIndex]!, spec.arrayPath)).items
            const index = expectConcreteNumber(getValueAtPath(args[spec.indexArgIndex]!, spec.indexPath))
            const value = index >= items.length && spec.defaultNull ? concreteNull('concrete') : items[index]!
            return [{
              constraints: context.state.constraints,
              env: context.state.env,
              value,
            }]
          }

          case 'string-unit-width': {
            const text = expectString(args[spec.textArgIndex]!)
            return [{
              constraints: context.state.constraints,
              env: context.state.env,
              value: concreteNumber(text.value.length * spec.unitWidth),
            }]
          }

          case 'push-or-merge-rect': {
            const rects = expectArray(args[spec.rectsArgIndex]!)
            const next = expectObject(args[spec.nextArgIndex]!)
            const tolerance = spec.tolerance ?? 0.5
            const previous = rects.items.at(-1)
            if (previous != null) {
              const previousRect = expectObject(previous)
              const previousTop = expectConcreteNumber(getProp(previousRect, 'top'))
              const previousHeight = expectConcreteNumber(getProp(previousRect, 'height'))
              const previousLeft = expectConcreteNumber(getProp(previousRect, 'left'))
              const previousWidth = expectConcreteNumber(getProp(previousRect, 'width'))
              const nextTop = expectConcreteNumber(getProp(next, 'top'))
              const nextHeight = expectConcreteNumber(getProp(next, 'height'))
              const nextLeft = expectConcreteNumber(getProp(next, 'left'))
              const nextWidth = expectConcreteNumber(getProp(next, 'width'))
              if (
                previousTop === nextTop &&
                previousHeight === nextHeight &&
                Math.abs(previousLeft + previousWidth - nextLeft) < tolerance
              ) {
                previousRect.props['width'] = concreteNumber(nextLeft + nextWidth - previousLeft)
                return [{
                  constraints: context.state.constraints,
                  env: context.state.env,
                  value: concreteNull('concrete'),
                }]
              }
            }

            rects.items.push(next)
            return [{
              constraints: context.state.constraints,
              env: context.state.env,
              value: concreteNull('concrete'),
            }]
          }
        }
      },

      evaluateRange(args) {
        switch (spec.kind) {
          case 'return-value':
            return [{
              value: evaluateRangeValueExpr(spec.value, args),
            }]

          case 'return-arg':
            return [{
              value: args[spec.argIndex]!,
            }]

          case 'lookup-array-item': {
            const array = expectRangeArray(getRangeValueAtPath(args[spec.sourceArgIndex]!, spec.arrayPath))
            const index = expectRangeNumber(getRangeValueAtPath(args[spec.indexArgIndex]!, spec.indexPath))
            return [{
              value: lookupRangeArrayItem(array, index, spec.defaultNull ?? false),
            }]
          }

          case 'string-unit-width': {
            const text = expectRangeString(args[spec.textArgIndex]!)
            return [{
              value: multiplyRangeByConstant(
                rangeNumber(text.minLength, text.maxLength, true),
                spec.unitWidth,
              ),
            }]
          }

          default:
            throw new Error(`${name} contract does not support range mode yet`)
        }
      },
    }
  }

  return overrides
}

function summarizeContractSpec(spec: StaticContractSpec): FunctionOverrideSummary {
  return {
    kind: spec.kind,
    domains: contractSpecDomains(spec),
  }
}

function contractSpecDomains(spec: StaticContractSpec): FunctionOverrideSummary['domains'] {
  switch (spec.kind) {
    case 'return-value':
    case 'return-arg':
    case 'lookup-array-item':
    case 'string-unit-width':
      return ['concrete', 'range']
    case 'for-each-array-item':
    case 'push-or-merge-rect':
      return ['concrete']
  }
}

function getValueAtPath(root: Value, path: string[]) {
  let current = root
  for (const prop of path) current = getProp(expectObject(current), prop)
  return current
}

function getRangeValueAtPath(root: RangeValue, path: string[]) {
  let current = root
  for (const prop of path) current = getRangeProp(expectRangeObject(current), prop)
  return current
}

function lookupRangeArrayItem(array: ReturnType<typeof expectRangeArray>, index: ReturnType<typeof expectRangeNumber>, defaultNull: boolean): RangeValue {
  if (index.min !== index.max || !index.isInteger) throw new Error('Range lookup-array-item contract expects an exact integer index')
  if (array.items == null) throw new Error('Range lookup-array-item contract expects exact array items')
  const rawIndex = index.min
  return rawIndex >= array.items.length && defaultNull
    ? rangeNull()
    : array.items[rawIndex]!
}

function multiplyRangeByConstant(value: ReturnType<typeof expectRangeNumber>, factor: number) {
  const products = [value.min * factor, value.max * factor]
  return rangeNumber(Math.min(...products), Math.max(...products), value.isInteger && Number.isInteger(factor))
}

export async function loadStaticContractOverridesForSourceFile(sourceFilePath: string): Promise<Record<string, FunctionOverride>> {
  const sourceText = readFileSync(sourceFilePath, 'utf8')
  const sourceFile = ts.createSourceFile(sourceFilePath, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  const specs: StaticContractSpecMap = {}

  const ownSidecar = await loadStaticContractsModule(toStaticContractsPath(sourceFilePath))
  if (ownSidecar != null) mergeContractSpecs(specs, ownSidecar, sourceFilePath)

  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue
    const specifier = statement.moduleSpecifier.text
    if (!specifier.startsWith('.')) continue

    const importClause = statement.importClause
    const namedBindings = importClause?.namedBindings
    if (namedBindings == null || !ts.isNamedImports(namedBindings)) continue

    const importedModulePath = resolveRelativeModulePath(sourceFilePath, specifier)
    if (importedModulePath == null) continue
    const importedSidecar = await loadStaticContractsModule(toStaticContractsPath(importedModulePath))
    if (importedSidecar == null) continue

    const localSpecs: StaticContractSpecMap = {}
    for (const element of namedBindings.elements) {
      const importedName = element.propertyName?.text ?? element.name.text
      const localName = element.name.text
      const contract = importedSidecar[importedName]
      if (contract != null) localSpecs[localName] = contract
    }
    mergeContractSpecs(specs, localSpecs, importedModulePath)
  }

  return buildStaticContractOverrides(specs)
}

function evaluateConcreteValueExpr(expression: StaticContractValueExpr, args: Value[]): Value {
  switch (expression.kind) {
    case 'arg':
      return args[expression.argIndex]!
    case 'arg-path':
      return getValueAtPath(args[expression.argIndex]!, expression.path)
    case 'number':
      return concreteNumber(expression.value)
    case 'null':
      return concreteNull('concrete')
    case 'array':
      return concreteArray(expression.items.map(item => evaluateConcreteValueExpr(item, args)))
    case 'object': {
      const props: Record<string, Value> = {}
      for (const [name, value] of Object.entries(expression.props)) props[name] = evaluateConcreteValueExpr(value, args)
      return concreteObject(props)
    }
    case 'add': {
      const left = expectConcreteNumber(evaluateConcreteValueExpr(expression.left, args))
      const right = expectConcreteNumber(evaluateConcreteValueExpr(expression.right, args))
      return concreteNumber(left + right)
    }
    case 'mul': {
      const left = expectConcreteNumber(evaluateConcreteValueExpr(expression.left, args))
      const right = expectConcreteNumber(evaluateConcreteValueExpr(expression.right, args))
      return concreteNumber(left * right)
    }
  }
}

function evaluateRangeValueExpr(expression: StaticContractValueExpr, args: RangeValue[]): RangeValue {
  switch (expression.kind) {
    case 'arg':
      return args[expression.argIndex]!
    case 'arg-path':
      return getRangeValueAtPath(args[expression.argIndex]!, expression.path)
    case 'number':
      return rangeNumber(expression.value, expression.value, Number.isInteger(expression.value))
    case 'null':
      return rangeNull()
    case 'array':
      return rangeArray(expression.items.map(item => evaluateRangeValueExpr(item, args)))
    case 'object': {
      const props: Record<string, RangeValue> = {}
      for (const [name, value] of Object.entries(expression.props)) props[name] = evaluateRangeValueExpr(value, args)
      return rangeObject(props)
    }
    case 'add': {
      const left = expectRangeNumber(evaluateRangeValueExpr(expression.left, args))
      const right = expectRangeNumber(evaluateRangeValueExpr(expression.right, args))
      return rangeNumber(left.min + right.min, left.max + right.max, left.isInteger && right.isInteger)
    }
    case 'mul': {
      const left = expectRangeNumber(evaluateRangeValueExpr(expression.left, args))
      const right = expectRangeNumber(evaluateRangeValueExpr(expression.right, args))
      const products = [left.min * right.min, left.min * right.max, left.max * right.min, left.max * right.max]
      return rangeNumber(Math.min(...products), Math.max(...products), left.isInteger && right.isInteger)
    }
  }
}

export function sketchStaticReturnContractFromSamples(samples: StaticContractSketchSample[]): StaticContractSketch | null {
  if (samples.length === 0) return null
  const first = samples[0]!
  for (let argIndex = 0; argIndex < first.args.length; argIndex++) {
    if (samples.every(sample => staticSketchValuesEqual(sample.value, sample.args[argIndex]!))) {
      return {
        spec: contract.returnArg(argIndex),
        evidence: samples.length,
      }
    }
  }

  const value = sketchStaticContractValueExprFromSamples(samples)
  if (value == null) return null
  return {
    spec: contract.returnValue(value),
    evidence: samples.length,
  }
}

export function formatStaticContractSketchEntry(name: string, sketch: StaticContractSketch): string {
  return `${name}: ${formatStaticContractSpec(sketch.spec)},`
}

export function formatStaticContractSpec(spec: StaticContractSpec): string {
  switch (spec.kind) {
    case 'return-value':
      return `contract.returnValue(${formatStaticContractValueExpr(spec.value)})`
    case 'return-arg':
      return `contract.returnArg(${spec.argIndex})`
    case 'for-each-array-item':
      return `contract.forEachArrayItem(${spec.arrayArgIndex}, ${JSON.stringify(spec.arrayPath)}, ${spec.callbackArgIndex})`
    case 'lookup-array-item':
      return `contract.lookupArrayItem(${spec.sourceArgIndex}, ${JSON.stringify(spec.arrayPath)}, ${spec.indexArgIndex}, ${JSON.stringify(spec.indexPath)}${spec.defaultNull ? ', {defaultNull: true}' : ''})`
    case 'string-unit-width':
      return `contract.stringUnitWidth(${spec.textArgIndex}, ${spec.unitWidth})`
    case 'push-or-merge-rect':
      return `contract.pushOrMergeRect(${spec.rectsArgIndex}, ${spec.nextArgIndex}${spec.tolerance == null ? '' : `, {tolerance: ${spec.tolerance}}`})`
  }
}

function sketchStaticContractValueExprFromSamples(samples: StaticContractSketchSample[]): StaticContractValueExpr | null {
  if (samples.length === 0) return null
  const first = samples[0]!

  const argPathExpr = findStaticSketchArgPathExpr(samples)
  if (argPathExpr != null) return argPathExpr

  const firstValue = first.value
  if (firstValue.kind === 'number') return sketchStaticNumberExprFromSamples(samples)
  if (firstValue.kind === 'null') return samples.every(sample => sample.value.kind === 'null') ? contractValue.null() : null
  if (firstValue.kind === 'array') {
    if (!samples.every(sample => sample.value.kind === 'array' && sample.value.items.length === firstValue.items.length)) return null
    const items: StaticContractValueExpr[] = []
    for (let index = 0; index < firstValue.items.length; index++) {
      const itemExpr = sketchStaticContractValueExprFromSamples(samples.map(sample => ({
        args: sample.args,
        value: expectArray(sample.value).items[index]!,
      })))
      if (itemExpr == null) return null
      items.push(itemExpr)
    }
    return contractValue.array(items)
  }
  if (firstValue.kind === 'object') {
    const keys = Object.keys(firstValue.props)
    if (!samples.every(sample =>
      sample.value.kind === 'object' &&
      keys.length === Object.keys(sample.value.props).length &&
      keys.every(key => sample.value.kind === 'object' && sample.value.props[key] != null)
    )) return null
    const props: Record<string, StaticContractValueExpr> = {}
    for (const key of keys) {
      const propExpr = sketchStaticContractValueExprFromSamples(samples.map(sample => ({
        args: sample.args,
        value: expectObject(sample.value).props[key]!,
      })))
      if (propExpr == null) return null
      props[key] = propExpr
    }
    return contractValue.object(props)
  }
  return null
}

function sketchStaticNumberExprFromSamples(samples: StaticContractSketchSample[]): StaticContractValueExpr | null {
  if (!samples.every(sample => sample.value.kind === 'number')) return null
  const outputs = samples.map(sample => expectConcreteNumber(sample.value))
  const firstOutput = outputs[0]!
  if (outputs.every(output => Math.abs(output - firstOutput) <= 0.000001)) return contractValue.number(firstOutput)

  for (const candidate of getStaticSketchArgPathCandidates(samples)) {
    const inputNumbers: number[] = []
    let inputsAreUsableNumbers = true
    for (const value of candidate.values) {
      if (value.kind !== 'number') {
        inputsAreUsableNumbers = false
        break
      }
      const inputNumber = expectConcreteNumber(value)
      if (Math.abs(inputNumber) <= 0.000001) {
        inputsAreUsableNumbers = false
        break
      }
      inputNumbers.push(inputNumber)
    }
    if (!inputsAreUsableNumbers) continue

    const ratio = firstOutput / inputNumbers[0]!
    if (outputs.every((output, index) => Math.abs(output - inputNumbers[index]! * ratio) <= 0.000001)) {
      return Math.abs(ratio - 1) <= 0.000001
        ? candidate.expression
        : contractValue.mul(candidate.expression, contractValue.number(ratio))
    }
  }

  return null
}

function findStaticSketchArgPathExpr(samples: StaticContractSketchSample[]): StaticContractValueExpr | null {
  for (const candidate of getStaticSketchArgPathCandidates(samples)) {
    if (samples.every((sample, index) => staticSketchValuesEqual(sample.value, candidate.values[index]!))) return candidate.expression
  }
  return null
}

function getStaticSketchArgPathCandidates(samples: StaticContractSketchSample[]) {
  const first = samples[0]!
  const candidates: Array<{expression: StaticContractValueExpr; values: Value[]}> = []
  for (let argIndex = 0; argIndex < first.args.length; argIndex++) {
    collectStaticSketchArgPathCandidates(samples, argIndex, [], candidates)
  }
  return candidates
}

function collectStaticSketchArgPathCandidates(
  samples: StaticContractSketchSample[],
  argIndex: number,
  pathParts: string[],
  candidates: Array<{expression: StaticContractValueExpr; values: Value[]}>,
) {
  const values = samples.map(sample => getValueAtPath(sample.args[argIndex]!, pathParts))
  candidates.push({
    expression: pathParts.length === 0 ? contractValue.arg(argIndex) : contractValue.argPath(argIndex, pathParts),
    values,
  })

  const firstValue = values[0]!
  if (firstValue.kind !== 'object') return
  for (const key of Object.keys(firstValue.props)) {
    if (values.every(value => value.kind === 'object' && value.props[key] != null)) {
      collectStaticSketchArgPathCandidates(samples, argIndex, [...pathParts, key], candidates)
    }
  }
}

function staticSketchValuesEqual(left: Value, right: Value): boolean {
  if (left.kind !== right.kind) return false
  switch (left.kind) {
    case 'number':
      return Math.abs(expectConcreteNumber(left) - expectConcreteNumber(right)) <= 0.000001
    case 'string':
      return left.value === expectString(right).value
    case 'null':
      return true
    case 'array': {
      const rightArray = expectArray(right)
      return left.items.length === rightArray.items.length &&
        left.items.every((item, index) => staticSketchValuesEqual(item, rightArray.items[index]!))
    }
    case 'object': {
      const rightObject = expectObject(right)
      const keys = Object.keys(left.props)
      return keys.length === Object.keys(rightObject.props).length &&
        keys.every(key => rightObject.props[key] != null && staticSketchValuesEqual(left.props[key]!, rightObject.props[key]!))
    }
    case 'boolean':
      return left.mode === 'concrete' && right.kind === 'boolean' && right.mode === 'concrete' && left.value === right.value
    case 'function':
    case 'opaque':
      return false
  }
}

function formatStaticContractValueExpr(expression: StaticContractValueExpr, depth = 0): string {
  switch (expression.kind) {
    case 'arg':
      return `contractValue.arg(${expression.argIndex})`
    case 'arg-path':
      return `contractValue.argPath(${expression.argIndex}, ${JSON.stringify(expression.path)})`
    case 'number':
      return `contractValue.number(${formatContractNumber(expression.value)})`
    case 'null':
      return 'contractValue.null()'
    case 'array':
      if (expression.items.length === 0) return 'contractValue.array([])'
      return [
        'contractValue.array([',
        ...expression.items.map(item => `${indent(depth + 1)}${formatStaticContractValueExpr(item, depth + 1)},`),
        `${indent(depth)}])`,
      ].join('\n')
    case 'object': {
      const entries = Object.entries(expression.props)
      if (entries.length === 0) return 'contractValue.object({})'
      return [
        'contractValue.object({',
        ...entries.map(([name, value]) => `${indent(depth + 1)}${formatObjectKey(name)}: ${formatStaticContractValueExpr(value, depth + 1)},`),
        `${indent(depth)}})`,
      ].join('\n')
    }
    case 'add':
      return `contractValue.add(${formatStaticContractValueExpr(expression.left, depth)}, ${formatStaticContractValueExpr(expression.right, depth)})`
    case 'mul':
      return `contractValue.mul(${formatStaticContractValueExpr(expression.left, depth)}, ${formatStaticContractValueExpr(expression.right, depth)})`
  }
}

function indent(depth: number) {
  return '  '.repeat(depth)
}

function formatObjectKey(key: string) {
  return /^[a-zA-Z_$][\w$]*$/.test(key) ? key : JSON.stringify(key)
}

function formatContractNumber(value: number) {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(6)))
}

function toStaticContractsPath(sourceFilePath: string) {
  const extension = path.extname(sourceFilePath)
  return sourceFilePath.slice(0, -extension.length) + '.static-contracts.ts'
}

function resolveRelativeModulePath(sourceFilePath: string, specifier: string) {
  const absoluteBase = path.resolve(path.dirname(sourceFilePath), specifier)
  const candidates = [
    absoluteBase + '.ts',
    absoluteBase + '.tsx',
    path.join(absoluteBase, 'index.ts'),
    path.join(absoluteBase, 'index.tsx'),
  ]
  return candidates.find(candidate => existsSync(candidate)) ?? null
}

async function loadStaticContractsModule(modulePath: string): Promise<StaticContractSpecMap | null> {
  if (!existsSync(modulePath)) return null
  const module = await import(pathToFileURL(modulePath).href) as {
    staticLayoutContracts?: StaticContractSpecMap
  }
  return module.staticLayoutContracts ?? null
}

function mergeContractSpecs(
  target: StaticContractSpecMap,
  incoming: StaticContractSpecMap,
  modulePath: string,
) {
  for (const [name, spec] of Object.entries(incoming)) {
    if (spec == null) continue
    if (target[name] != null) throw new Error(`Duplicate static contract for ${name} while loading ${modulePath}`)
    target[name] = spec
  }
}
