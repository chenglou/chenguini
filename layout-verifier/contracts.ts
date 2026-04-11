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
  rangeArray,
  rangeNull,
  rangeNumber,
  rangeObject,
  type FunctionOverride,
  type FunctionOverrideSummary,
  type RangeArrayValue,
  type RangeNumberValue,
  type StaticLayoutFactDomain,
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

type ValueStaticContractSpec =
  | {
      kind: 'return-value'
      value: StaticContractValueExpr
    }
  | {
      kind: 'return-arg'
      argIndex: number
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

type ConcreteEffectStaticContractSpec =
  | {
      kind: 'for-each-array-item'
      arrayArgIndex: number
      arrayPath: string[]
      callbackArgIndex: number
    }
  | {
      kind: 'push-or-merge-rect'
      rectsArgIndex: number
      nextArgIndex: number
      tolerance?: number
    }

export type StaticContractSpec = ValueStaticContractSpec | ConcreteEffectStaticContractSpec
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

  for (const [name, maybeSpec] of Object.entries(specs)) {
    const spec = maybeSpec
    if (spec == null) continue

    overrides[name] =
      isValueStaticContractSpec(spec)
        ? buildValueStaticContractOverride(name, spec)
        : buildConcreteEffectStaticContractOverride(name, spec)
  }

  return overrides
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

function getRequiredItem<T>(items: T[], index: number, label: string): T {
  const item = items[index]
  if (item == null) throw new Error(`${label} ${index} is missing`)
  return item
}

function getRequiredRecordValue<T>(items: Record<string, T>, key: string, label: string): T {
  const item = items[key]
  if (item == null) throw new Error(`${label} ${key} is missing`)
  return item
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

    const importedModulePath: string | null = resolveRelativeModulePath(sourceFilePath, specifier)
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

export function sketchStaticReturnContractFromSamples(samples: StaticContractSketchSample[]): StaticContractSketch | null {
  if (samples.length === 0) return null

  const first = getRequiredItem(samples, 0, 'contract sketch sample')
  for (let argIndex = 0; argIndex < first.args.length; argIndex++) {
    if (samples.every(sample => staticSketchValuesEqual(sample.value, getRequiredItem(sample.args, argIndex, 'contract sketch arg')))) {
      return {
        spec: contract.returnArg(argIndex),
        evidence: samples.length,
      }
    }
  }

  const value = sketchStaticContractValueExprFromSamples(samples)
  return value == null
    ? null
    : {
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
      return `contract.forEachArrayItem(${spec.arrayArgIndex}, ${formatStringArray(spec.arrayPath)}, ${spec.callbackArgIndex})`
    case 'lookup-array-item':
      return `contract.lookupArrayItem(${spec.sourceArgIndex}, ${formatStringArray(spec.arrayPath)}, ${spec.indexArgIndex}, ${formatStringArray(spec.indexPath)}${spec.defaultNull === true ? ', {defaultNull: true}' : ''})`
    case 'string-unit-width':
      return `contract.stringUnitWidth(${spec.textArgIndex}, ${formatNumber(spec.unitWidth)})`
    case 'push-or-merge-rect':
      return `contract.pushOrMergeRect(${spec.rectsArgIndex}, ${spec.nextArgIndex}${spec.tolerance == null || spec.tolerance === 0.5 ? '' : `, {tolerance: ${formatNumber(spec.tolerance)}}`})`
  }
}

function summarizeStaticContractSpec(spec: StaticContractSpec): FunctionOverrideSummary {
  return {
    kind: spec.kind,
    domains: staticContractSpecDomains(spec),
  }
}

function staticContractSpecDomains(spec: StaticContractSpec): StaticLayoutFactDomain[] {
  return isValueStaticContractSpec(spec) ? ['concrete', 'range'] : ['concrete']
}

type StaticContractValueDomain<TValue> = {
  name: StaticLayoutFactDomain
  getValueAtPath(root: TValue, path: string[]): TValue
  makeNumber(value: number): TValue
  makeNull(): TValue
  makeArray(items: TValue[]): TValue
  makeObject(props: Record<string, TValue>): TValue
  add(left: TValue, right: TValue): TValue
  multiply(left: TValue, right: TValue): TValue
  lookupArrayItem(array: TValue, index: TValue, defaultNull: boolean): TValue
  measureStringUnitWidth(text: TValue, unitWidth: number): TValue
}

const concreteValueDomain: StaticContractValueDomain<Value> = {
  name: 'concrete',
  getValueAtPath,
  makeNumber: concreteNumber,
  makeNull: () => concreteNull('concrete'),
  makeArray: concreteArray,
  makeObject: concreteObject,
  add(left, right) {
    return concreteNumber(expectConcreteNumber(left) + expectConcreteNumber(right))
  },
  multiply(left, right) {
    return concreteNumber(expectConcreteNumber(left) * expectConcreteNumber(right))
  },
  lookupArrayItem(array, index, defaultNull) {
    const items = expectArray(array).items
    const rawIndex = expectConcreteNumber(index)
    return rawIndex >= items.length && defaultNull
      ? concreteNull('concrete')
      : getRequiredItem(items, rawIndex, 'contract lookup item')
  },
  measureStringUnitWidth(text, unitWidth) {
    return concreteNumber(expectString(text).value.length * unitWidth)
  },
}

const rangeValueDomain: StaticContractValueDomain<RangeValue> = {
  name: 'range',
  getValueAtPath: getRangeValueAtPath,
  makeNumber(value) {
    return rangeNumber(value, value, Number.isInteger(value))
  },
  makeNull: rangeNull,
  makeArray: rangeArray,
  makeObject: rangeObject,
  add(left, right) {
    const leftNumber = expectRangeNumber(left)
    const rightNumber = expectRangeNumber(right)
    return rangeNumber(leftNumber.min + rightNumber.min, leftNumber.max + rightNumber.max, leftNumber.isInteger && rightNumber.isInteger)
  },
  multiply(left, right) {
    return multiplyRangeNumbers(expectRangeNumber(left), expectRangeNumber(right))
  },
  lookupArrayItem(array, index, defaultNull) {
    return lookupRangeArrayItem(expectRangeArray(array), expectRangeNumber(index), defaultNull)
  },
  measureStringUnitWidth(text, unitWidth) {
    const rangeText = expectRangeString(text)
    return multiplyRangeByConstant(
      rangeNumber(rangeText.minLength, rangeText.maxLength, true),
      unitWidth,
    )
  },
}

function isValueStaticContractSpec(spec: StaticContractSpec): spec is ValueStaticContractSpec {
  switch (spec.kind) {
    case 'return-value':
    case 'return-arg':
    case 'lookup-array-item':
    case 'string-unit-width':
      return true
    case 'for-each-array-item':
    case 'push-or-merge-rect':
      return false
  }
}

function buildValueStaticContractOverride(name: string, spec: ValueStaticContractSpec): FunctionOverride {
  return {
    summary: summarizeStaticContractSpec(spec),
    evaluate(args, mode, context) {
      if (mode !== 'concrete') throw new Error(`${name} contract only supports concrete mode`)
      return [{
        constraints: context.state.constraints,
        env: context.state.env,
        value: evaluateValueStaticContractSpecInDomain(spec, args, concreteValueDomain),
      }]
    },
    evaluateRange(args) {
      return [{value: evaluateValueStaticContractSpecInDomain(spec, args, rangeValueDomain)}]
    },
  }
}

function buildConcreteEffectStaticContractOverride(name: string, spec: ConcreteEffectStaticContractSpec): FunctionOverride {
  return {
    summary: summarizeStaticContractSpec(spec),
    evaluate(args, mode, context) {
      if (mode !== 'concrete') throw new Error(`${name} contract only supports concrete mode`)

      switch (spec.kind) {
        case 'for-each-array-item': {
          const callback = getRequiredItem(args, spec.callbackArgIndex, 'callback arg')
          const root = getRequiredItem(args, spec.arrayArgIndex, 'array arg')
          const items = expectArray(getValueAtPath(root, spec.arrayPath)).items
          let activeStates = [context.state]
          for (let i = 0; i < items.length; i++) {
            const nextStates = []
            for (const state of activeStates) {
              const callbackReturns = invokeConcreteFunctionValue(context.analyzer, state, callback, [getRequiredItem(items, i, `${name} item`)])
              if (callbackReturns.length !== 1) throw new Error(`${name} callback must resolve to 1 case`)
              nextStates.push(getRequiredItem(callbackReturns, 0, `${name} callback return`).state)
            }
            activeStates = nextStates
          }
          return activeStates.map(state => ({
            constraints: state.constraints,
            env: state.env,
            value: concreteNull('concrete'),
          }))
        }

        case 'push-or-merge-rect': {
          const rects = expectArray(getRequiredItem(args, spec.rectsArgIndex, 'rects arg'))
          const next = expectObject(getRequiredItem(args, spec.nextArgIndex, 'next rect arg'))
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
    evaluateRange(_args) {
      throw new Error(`${name} contract only supports concrete mode for ${spec.kind}`)
    },
  }
}

function evaluateValueStaticContractSpecInDomain<TValue>(
  spec: ValueStaticContractSpec,
  args: TValue[],
  domain: StaticContractValueDomain<TValue>,
): TValue {
  switch (spec.kind) {
    case 'return-value':
      return evaluateStaticContractValueExprInDomain(spec.value, args, domain)
    case 'return-arg':
      return getRequiredItem(args, spec.argIndex, `${domain.name} contract arg`)
    case 'lookup-array-item': {
      const source = getRequiredItem(args, spec.sourceArgIndex, `${domain.name} lookup source arg`)
      const indexSource = getRequiredItem(args, spec.indexArgIndex, `${domain.name} lookup index arg`)
      return domain.lookupArrayItem(
        domain.getValueAtPath(source, spec.arrayPath),
        domain.getValueAtPath(indexSource, spec.indexPath),
        spec.defaultNull ?? false,
      )
    }
    case 'string-unit-width':
      return domain.measureStringUnitWidth(getRequiredItem(args, spec.textArgIndex, `${domain.name} text arg`), spec.unitWidth)
  }
}

function evaluateStaticContractValueExprInDomain<TValue>(
  expression: StaticContractValueExpr,
  args: TValue[],
  domain: StaticContractValueDomain<TValue>,
): TValue {
  switch (expression.kind) {
    case 'arg':
      return getRequiredItem(args, expression.argIndex, `${domain.name} contract value arg`)
    case 'arg-path':
      return domain.getValueAtPath(getRequiredItem(args, expression.argIndex, `${domain.name} contract value arg`), expression.path)
    case 'number':
      return domain.makeNumber(expression.value)
    case 'null':
      return domain.makeNull()
    case 'array':
      return domain.makeArray(expression.items.map(item => evaluateStaticContractValueExprInDomain(item, args, domain)))
    case 'object': {
      const props: Record<string, TValue> = {}
      for (const [name, value] of Object.entries(expression.props)) props[name] = evaluateStaticContractValueExprInDomain(value, args, domain)
      return domain.makeObject(props)
    }
    case 'add':
      return domain.add(
        evaluateStaticContractValueExprInDomain(expression.left, args, domain),
        evaluateStaticContractValueExprInDomain(expression.right, args, domain),
      )
    case 'mul':
      return domain.multiply(
        evaluateStaticContractValueExprInDomain(expression.left, args, domain),
        evaluateStaticContractValueExprInDomain(expression.right, args, domain),
      )
  }
}

function sketchStaticContractValueExprFromSamples(samples: StaticContractSketchSample[]): StaticContractValueExpr | null {
  const first = getRequiredItem(samples, 0, 'contract sketch sample')
  const argPath = findStaticSketchArgPathExpr(samples)
  if (argPath != null) return argPath

  if (samples.every(sample => sample.value.kind === 'null')) return contractValue.null()

  const numberExpr = sketchStaticNumberExprFromSamples(samples)
  if (numberExpr != null) return numberExpr

  if (first.value.kind === 'array' && samples.every(sample => sample.value.kind === 'array')) {
    const firstItems = first.value.items
    const allSameLength = samples.every(sample => sample.value.kind === 'array' && sample.value.items.length === firstItems.length)
    if (!allSameLength) return null
    const items: StaticContractValueExpr[] = []
    for (let index = 0; index < firstItems.length; index++) {
      const itemExpr = sketchStaticContractValueExprFromSamples(samples.map(sample => ({
        args: sample.args,
        value: getRequiredItem(expectArray(sample.value).items, index, 'contract sketch array item'),
      })))
      if (itemExpr == null) return null
      items.push(itemExpr)
    }
    return contractValue.array(items)
  }

  if (first.value.kind === 'object' && samples.every(sample => sample.value.kind === 'object')) {
    const keys = Object.keys(first.value.props)
    const allSameKeys = samples.every(sample => {
      if (sample.value.kind !== 'object') return false
      const sampleKeys = Object.keys(sample.value.props)
      return sampleKeys.length === keys.length && keys.every(key => sampleKeys.includes(key))
    })
    if (!allSameKeys) return null

    const props: Record<string, StaticContractValueExpr> = {}
    for (const key of keys) {
      const propExpr = sketchStaticContractValueExprFromSamples(samples.map(sample => ({
        args: sample.args,
        value: getProp(expectObject(sample.value), key),
      })))
      if (propExpr == null) return null
      props[key] = propExpr
    }
    return contractValue.object(props)
  }

  return null
}

function formatStaticContractValueExpr(expression: StaticContractValueExpr, depth = 0): string {
  switch (expression.kind) {
    case 'arg':
      return `contractValue.arg(${expression.argIndex})`
    case 'arg-path':
      return `contractValue.argPath(${expression.argIndex}, ${formatStringArray(expression.path)})`
    case 'number':
      return `contractValue.number(${formatNumber(expression.value)})`
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

function formatStringArray(values: string[]) {
  return `[${values.map(value => JSON.stringify(value)).join(', ')}]`
}

function formatObjectKey(key: string) {
  return /^[A-Za-z_$][\w$]*$/.test(key) ? key : JSON.stringify(key)
}

function formatNumber(value: number) {
  return String(value)
}

function indent(depth: number) {
  return '  '.repeat(depth)
}

function sketchStaticNumberExprFromSamples(samples: StaticContractSketchSample[]): StaticContractValueExpr | null {
  if (!samples.every(sample => sample.value.kind === 'number' && sample.value.mode === 'concrete')) return null

  const outputs = samples.map(sample => expectConcreteNumber(sample.value))
  const firstOutput = getRequiredItem(outputs, 0, 'contract sketch output')
  if (outputs.every(output => Math.abs(output - firstOutput) <= 0.000001)) return contractValue.number(firstOutput)

  for (const candidate of getStaticSketchArgPathCandidates(samples)) {
    const inputs = candidate.values
    if (!inputs.every(value => value.kind === 'number' && value.mode === 'concrete')) continue

    const inputNumbers = inputs.map(value => expectConcreteNumber(value))
    if (inputNumbers.some(value => Math.abs(value) <= 0.000001)) continue
    const ratio = getRequiredItem(outputs, 0, 'contract sketch output') / getRequiredItem(inputNumbers, 0, 'contract sketch input')
    if (outputs.every((output, index) => Math.abs(output - getRequiredItem(inputNumbers, index, 'contract sketch input') * ratio) <= 0.000001)) {
      return Math.abs(ratio - 1) <= 0.000001
        ? candidate.expression
        : contractValue.mul(candidate.expression, contractValue.number(ratio))
    }
  }

  return null
}

function findStaticSketchArgPathExpr(samples: StaticContractSketchSample[]): StaticContractValueExpr | null {
  for (const candidate of getStaticSketchArgPathCandidates(samples)) {
    if (samples.every((sample, index) => staticSketchValuesEqual(sample.value, getRequiredItem(candidate.values, index, 'contract sketch candidate value')))) return candidate.expression
  }
  return null
}

function getStaticSketchArgPathCandidates(samples: StaticContractSketchSample[]) {
  const first = getRequiredItem(samples, 0, 'contract sketch sample')
  const candidates: Array<{expression: StaticContractValueExpr; values: Value[]}> = []
  for (let argIndex = 0; argIndex < first.args.length; argIndex++) {
    const arg = getRequiredItem(first.args, argIndex, 'contract sketch arg')
    for (const path of collectStaticSketchValuePaths(arg)) {
      const values: Value[] = []
      let valid = true
      for (const sample of samples) {
        try {
          values.push(getValueAtPath(getRequiredItem(sample.args, argIndex, 'contract sketch arg'), path))
        } catch {
          valid = false
          break
        }
      }
      if (!valid) continue
      candidates.push({
        expression: path.length === 0 ? contractValue.arg(argIndex) : contractValue.argPath(argIndex, path),
        values,
      })
    }
  }
  return candidates
}

function collectStaticSketchValuePaths(value: Value, prefix: string[] = []): string[][] {
  if (value.kind !== 'object') return [prefix]
  return [
    prefix,
    ...Object.entries(value.props).flatMap(([key, prop]) => collectStaticSketchValuePaths(prop, [...prefix, key])),
  ]
}

function staticSketchValuesEqual(left: Value, right: Value): boolean {
  if (left.kind !== right.kind) return false
  switch (left.kind) {
    case 'number':
      return right.kind === 'number' && left.mode === 'concrete' && right.mode === 'concrete' && Math.abs(left.value - right.value) <= 0.000001
    case 'string':
      return right.kind === 'string' && left.value === right.value
    case 'null':
      return true
    case 'array':
      return right.kind === 'array' &&
        left.items.length === right.items.length &&
        left.items.every((item, index) => staticSketchValuesEqual(item, getRequiredItem(right.items, index, 'contract sketch array item')))
    case 'object': {
      if (right.kind !== 'object') return false
      const keys = Object.keys(left.props)
      const rightKeys = Object.keys(right.props)
      return keys.length === rightKeys.length &&
        keys.every(key => rightKeys.includes(key) && staticSketchValuesEqual(
          getRequiredRecordValue(left.props, key, 'contract sketch object prop'),
          getRequiredRecordValue(right.props, key, 'contract sketch object prop'),
        ))
    }
    case 'boolean':
    case 'function':
    case 'opaque':
      return false
  }
}

function lookupRangeArrayItem(array: RangeArrayValue, index: RangeNumberValue, defaultNull: boolean): RangeValue {
  if (!index.isInteger) throw new Error('Range lookup-array-item expects an integer index')
  if (index.min >= array.lengthMax && defaultNull) return rangeNull()

  const indexIsSingleton = index.min === index.max
  if (!indexIsSingleton) {
    if (array.item != null && index.min >= 0 && index.max < array.lengthMax) return array.item
    throw new Error('Range lookup-array-item only supports exact indexes or fully in-bounds item ranges')
  }

  let rawIndex = index.min
  if (rawIndex < 0) {
    if (array.lengthMin !== array.lengthMax) throw new Error('Range lookup-array-item cannot normalize negative indexes without exact length')
    rawIndex += array.lengthMin
  }

  if (array.items != null && rawIndex >= 0 && rawIndex < array.items.length) return getRequiredItem(array.items, rawIndex, 'range lookup item')
  if (array.item != null && rawIndex >= 0 && rawIndex < array.lengthMax) return array.item
  if (defaultNull) return rangeNull()
  throw new Error(`Range lookup-array-item index ${rawIndex} is out of bounds`)
}

function multiplyRangeByConstant(value: RangeNumberValue, constant: number) {
  return multiplyRangeNumbers(value, rangeNumber(constant, constant, Number.isInteger(constant)))
}

function multiplyRangeNumbers(left: RangeNumberValue, right: RangeNumberValue) {
  const products = [left.min * right.min, left.min * right.max, left.max * right.min, left.max * right.max]
  return rangeNumber(Math.min(...products), Math.max(...products), left.isInteger && right.isInteger)
}

function toStaticContractsPath(sourceFilePath: string) {
  const extension = path.extname(sourceFilePath)
  return sourceFilePath.slice(0, -extension.length) + '.static-contracts.ts'
}

function resolveRelativeModulePath(sourceFilePath: string, specifier: string) {
  const absoluteBase = path.resolve(path.dirname(sourceFilePath), specifier)
  const candidates: string[] = [
    absoluteBase + '.ts',
    absoluteBase + '.tsx',
    path.join(absoluteBase, 'index.ts'),
    path.join(absoluteBase, 'index.tsx'),
  ]
  return candidates.find(candidate => existsSync(candidate) === true) ?? null
}

async function loadStaticContractsModule(modulePath: string): Promise<StaticContractSpecMap | null> {
  if (existsSync(modulePath) !== true) return null
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
    if (target[name] != null) throw new Error(`Duplicate static contract for ${name} while loading ${modulePath}`)
    target[name] = spec
  }
}
