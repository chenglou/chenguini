// Evaluator: LoweredProgramAnalyzer, CFG execution, expression evaluation,
// and law reporting. Imports the IR from ir.ts and the value domain from
// values.ts. Re-exports both so consumers can import everything from './core'.

import type {InlineFunction, IrExpression, IrInstruction, IrProgram} from './ir'
import {lowerSourceProgram} from './ir'
import {
  appendRangeArrayItem,
  applyAssignmentOperator,
  applyComparisonOperator,
  applyNumericOperator,
  applyRangeAssignmentOperator,
  applyRangeNumericOperator,
  bindRangeValueToName,
  bindValueToName,
  type BoolExpr,
  booleanValue,
  compareNullableRangeValues,
  compareRangeNumbers,
  compareRangeStringValues,
  concreteArray,
  concreteNull,
  concreteNumber,
  concreteString,
  epsilon,
  expectArray,
  expectBoolean,
  expectConcreteNumber,
  expectConcreteNumberValue,
  expectFunction,
  expectRangeFunction,
  expectNumber,
  expectObject,
  expectRangeArray,
  expectRangeBoolean,
  expectRangeNumber,
  expectRangeObject,
  expectString,
  getArrayItem,
  getArrayProperty,
  getIndexableItem,
  getRangeArrayItemAt,
  getRangeArrayProperty,
  getRangeIndexableItem,
  getRangeProp,
  getRangeStringProperty,
  getProp,
  getStringProperty,
  formatScalarExpr,
  isComparisonOperator,
  isRangeComparisonOperator,
  joinRangeValues,
  maxRangeNumber,
  minRangeNumber,
  type Mode,
  narrowableComparisonOperator,
  narrowRangeNumberPair,
  negateBoolExpr,
  negateNumber,
  negateRangeNumber,
  numberValue,
  objectValue,
  proveSymbolicExprEquality,
  rangeArray,
  rangeBoolean,
  rangeNull,
  rangeNumber,
  rangeObject,
  rangeString,
  type RangeArrayValue,
  type RangeAccessPath,
  type RangeNumberValue,
  type RangeValue,
  type ScalarExpr,
  setRangeValueAtPath,
  type StaticLayoutLawKind,
  type StaticLayoutLawWitness,
  symbolicExprEquals,
  type Value,
} from './values'

// Re-export value-layer symbols so existing call-sites can keep importing from './core'.
export type {
  ArrayValue,
  BoolExpr,
  ComparisonOp,
  Mode,
  NumberValue,
  ObjectValue,
  OpaqueValue,
  NullValue,
  RangeArrayValue,
  RangeBooleanValue,
  RangeNumberValue,
  RangeObjectValue,
  RangeOpaqueValue,
  RangeNullValue,
  RangeStringValue,
  RangeTruth,
  RangeValue,
  ScalarExpr,
  StaticLayoutLawWitness,
  StringValue,
  Value,
  WitnessValue,
} from './values'
export {
  addExpr,
  applyComparisonOperator,
  applyNumericOperator,
  concreteArray,
  concreteNull,
  concreteNumber,
  concreteNumberArrayIsStrictlyIncreasing,
  concreteObject,
  concreteOpaque,
  concreteString,
  constExpr,
  describeNumericArray,
  divExpr,
  epsilon,
  expectArray,
  expectBoolean,
  expectConcreteNumber,
  expectNumber,
  expectObject,
  expectRangeArray,
  expectRangeNumber,
  expectRangeObject,
  expectRangeString,
  expectString,
  expectSymbolicNumber,
  formatScalarExpr,
  getProp,
  getRangeProp,
  mulExpr,
  rangeArray,
  rangeNull,
  rangeNumber,
  rangeObject,
  rangeString,
  subExpr,
  symbolicExprEquals,
  symbolicNumber,
  symbolicObject,
  symbolicOpaque,
} from './values'

// Report types
export type StaticLayoutLawStatus = 'pass' | 'fail' | 'unknown'

export type StaticLayoutLawUnknown = {
  reason: string
  witness?: StaticLayoutLawWitness
}

export type StaticLayoutLawResult =
  | {status: 'pass'}
  | {status: 'fail'; witness: StaticLayoutLawWitness}
  | {status: 'unknown'; reason: string; witness?: StaticLayoutLawWitness}

export type StaticLayoutProofResult =
  | {status: 'pass'}
  | {status: 'fail'}
  | {status: 'unknown'; reason: string}

export type ConcreteRect = {
  left: number
  top: number
  width: number
  height: number
}

export type ConcreteInlineBounds = {
  left: number
  right: number
}

export type ConcreteBlockBounds = {
  top: number
  bottom: number
}

export type RangeRect = {
  left: RangeNumberValue
  top: RangeNumberValue
  width: RangeNumberValue
  height: RangeNumberValue
}

export type RectEdge = 'left' | 'top' | 'right' | 'bottom' | 'width' | 'height'

export type StaticLayoutFact =
  | {kind: 'symbolic-equality'; left: ScalarExpr; right: ScalarExpr}
  | {kind: 'range-equality'; left: RangeNumberValue; right: RangeNumberValue}
  | {kind: 'range-rect-edge-equality'; rect: RangeRect; edge: RectEdge; expected: RangeNumberValue}
  | {kind: 'range-within'; value: RangeNumberValue; min?: number; max?: number}
  | {kind: 'range-non-negative'; value: RangeNumberValue}
  | {kind: 'range-integer'; value: RangeNumberValue}
  | {kind: 'range-array-length'; value: RangeArrayValue; exact: number}
  | {kind: 'concrete-rect-edge-equality'; rect: ConcreteRect; edge: RectEdge; expected: number; tolerance: number}
  | {kind: 'concrete-rect-x-within'; rect: ConcreteRect; bounds: ConcreteInlineBounds; tolerance: number}
  | {kind: 'concrete-rect-x-fills'; rect: ConcreteRect; bounds: ConcreteInlineBounds; tolerance: number}
  | {kind: 'concrete-rect-y-within'; rect: ConcreteRect; bounds: ConcreteBlockBounds; tolerance: number}
  | {kind: 'concrete-rects-do-not-overlap-x'; left: ConcreteRect; right: ConcreteRect; tolerance: number}
  | {kind: 'concrete-close'; actual: number; expected: number; tolerance: number}

export type StaticLayoutLawProofMechanism = 'manual-check' | StaticLayoutFact['kind']

export type StaticLayoutLawProofSummary = {
  mechanism: StaticLayoutLawProofMechanism
  checks: number
}

export type StaticLayoutTargetPath = string

export type StaticLayoutLawTargetSummary = {
  target: StaticLayoutTargetPath
  checks: number
  proofs: StaticLayoutLawProofSummary[]
}

export type StaticLayoutFactDomain = 'concrete' | 'range' | 'symbolic'

export type StaticLayoutLawSummary = {
  name: string
  kind: StaticLayoutLawKind
  checks: number
  status: StaticLayoutLawStatus
  proofs: StaticLayoutLawProofSummary[]
  targets?: StaticLayoutLawTargetSummary[]
  firstFailure?: StaticLayoutLawWitness
  firstUnknown?: StaticLayoutLawUnknown
}

export type StaticLayoutTargetCoverageSummary = {
  target: StaticLayoutTargetPath
  checks: number
  status: StaticLayoutLawStatus
  laws: string[]
  proofs: StaticLayoutLawProofSummary[]
}

export type FunctionOverrideSummary = {
  kind: string
  domains: StaticLayoutFactDomain[]
}

export type StaticLayoutFunctionSummary = FunctionOverrideSummary & {
  name: string
}

export type StaticLayoutCandidateLawKind = 'mined-from-concrete-sweep'

export type StaticLayoutCandidateLaw = {
  name: string
  kind: StaticLayoutCandidateLawKind
  evidence: number
  details?: StaticLayoutLawWitness
}

export type StaticLayoutVerificationReport = {
  phase: 'ready' | 'error'
  suite: string
  analyzedFile: string
  coverage: StaticLayoutTargetCoverageSummary[]
  laws: StaticLayoutLawSummary[]
  functionSummaries?: StaticLayoutFunctionSummary[]
  candidateLaws?: StaticLayoutCandidateLaw[]
}

export type InternalLawSummary = {
  name: string
  kind: StaticLayoutLawKind
  checks: number
  proofs: Map<StaticLayoutLawProofMechanism, number>
  targets: Map<StaticLayoutTargetPath, InternalLawTargetSummary>
  firstFailure: StaticLayoutLawWitness | null
  firstUnknown: StaticLayoutLawUnknown | null
}

export type InternalLawTargetSummary = {
  checks: number
  proofs: Map<StaticLayoutLawProofMechanism, number>
}

export type StaticLayoutLawCheckOptions = {
  kind?: StaticLayoutLawKind
  targets?: StaticLayoutTargetPath[]
}

// Evaluation state types

export type FunctionOverride = {
  summary?: FunctionOverrideSummary
  evaluate?: (args: Value[], mode: Mode, context: {
    analyzer: LoweredProgramAnalyzer
    state: EvalState
  }) => ReturnCase[]
  evaluateRange?: (args: RangeValue[], context: {
    analyzer: LoweredProgramAnalyzer
    state: RangeState
  }) => RangeReturnCase[]
}

export type RangeState = {
  env: Map<string, RangeValue>
}

export type RangeEvalCase = {
  state: RangeState
  value: RangeValue
}

export type RangeReturnCase = {
  value: RangeValue
}

export type EvalState = {
  mode: Mode
  constraints: BoolExpr[]
  env: Map<string, Value>
}

export type EvalCase = {
  state: EvalState
  value: Value
}

export type ReturnCase = {
  constraints: BoolExpr[]
  env?: Map<string, Value>
  value: Value
}

export const staticLayoutFact = {
  symbolicEquality(left: ScalarExpr, right: ScalarExpr): StaticLayoutFact {
    return {kind: 'symbolic-equality', left, right}
  },

  rangeEquality(left: RangeNumberValue, right: RangeNumberValue): StaticLayoutFact {
    return {kind: 'range-equality', left, right}
  },

  rangeRectEdgeEquality(rect: RangeRect, edge: RectEdge, expected: RangeNumberValue): StaticLayoutFact {
    return {kind: 'range-rect-edge-equality', rect, edge, expected}
  },

  rangeRectLeftEquals(rect: RangeRect, expected: RangeNumberValue): StaticLayoutFact {
    return staticLayoutFact.rangeRectEdgeEquality(rect, 'left', expected)
  },

  rangeRectTopEquals(rect: RangeRect, expected: RangeNumberValue): StaticLayoutFact {
    return staticLayoutFact.rangeRectEdgeEquality(rect, 'top', expected)
  },

  rangeRectRightEquals(rect: RangeRect, expected: RangeNumberValue): StaticLayoutFact {
    return staticLayoutFact.rangeRectEdgeEquality(rect, 'right', expected)
  },

  rangeRectBottomEquals(rect: RangeRect, expected: RangeNumberValue): StaticLayoutFact {
    return staticLayoutFact.rangeRectEdgeEquality(rect, 'bottom', expected)
  },

  rangeRectWidthEquals(rect: RangeRect, expected: RangeNumberValue): StaticLayoutFact {
    return staticLayoutFact.rangeRectEdgeEquality(rect, 'width', expected)
  },

  rangeRectHeightEquals(rect: RangeRect, expected: RangeNumberValue): StaticLayoutFact {
    return staticLayoutFact.rangeRectEdgeEquality(rect, 'height', expected)
  },

  concreteRectEdgeEquals(rect: ConcreteRect, edge: RectEdge, expected: number, tolerance: number = epsilon): StaticLayoutFact {
    return {kind: 'concrete-rect-edge-equality', rect, edge, expected, tolerance}
  },

  concreteRectLeftEquals(rect: ConcreteRect, expected: number, tolerance: number = epsilon): StaticLayoutFact {
    return staticLayoutFact.concreteRectEdgeEquals(rect, 'left', expected, tolerance)
  },

  concreteRectTopEquals(rect: ConcreteRect, expected: number, tolerance: number = epsilon): StaticLayoutFact {
    return staticLayoutFact.concreteRectEdgeEquals(rect, 'top', expected, tolerance)
  },

  concreteRectRightEquals(rect: ConcreteRect, expected: number, tolerance: number = epsilon): StaticLayoutFact {
    return staticLayoutFact.concreteRectEdgeEquals(rect, 'right', expected, tolerance)
  },

  concreteRectBottomEquals(rect: ConcreteRect, expected: number, tolerance: number = epsilon): StaticLayoutFact {
    return staticLayoutFact.concreteRectEdgeEquals(rect, 'bottom', expected, tolerance)
  },

  concreteRectWidthEquals(rect: ConcreteRect, expected: number, tolerance: number = epsilon): StaticLayoutFact {
    return staticLayoutFact.concreteRectEdgeEquals(rect, 'width', expected, tolerance)
  },

  concreteRectHeightEquals(rect: ConcreteRect, expected: number, tolerance: number = epsilon): StaticLayoutFact {
    return staticLayoutFact.concreteRectEdgeEquals(rect, 'height', expected, tolerance)
  },

  rangeWithin(value: RangeNumberValue, bounds: {min?: number; max?: number}): StaticLayoutFact {
    const fact: StaticLayoutFact = {kind: 'range-within', value}
    if (bounds.min != null) fact.min = bounds.min
    if (bounds.max != null) fact.max = bounds.max
    return fact
  },

  rangeNonNegative(value: RangeNumberValue): StaticLayoutFact {
    return {kind: 'range-non-negative', value}
  },

  rangeInteger(value: RangeNumberValue): StaticLayoutFact {
    return {kind: 'range-integer', value}
  },

  rangeArrayLength(value: RangeArrayValue, exact: number): StaticLayoutFact {
    return {kind: 'range-array-length', value, exact}
  },

  concreteRectXWithin(rect: ConcreteRect, bounds: ConcreteInlineBounds, tolerance: number = epsilon): StaticLayoutFact {
    return {kind: 'concrete-rect-x-within', rect, bounds, tolerance}
  },

  concreteRectXFills(rect: ConcreteRect, bounds: ConcreteInlineBounds, tolerance: number = epsilon): StaticLayoutFact {
    return {kind: 'concrete-rect-x-fills', rect, bounds, tolerance}
  },

  concreteRectYWithin(rect: ConcreteRect, bounds: ConcreteBlockBounds, tolerance: number = epsilon): StaticLayoutFact {
    return {kind: 'concrete-rect-y-within', rect, bounds, tolerance}
  },

  concreteRectsDoNotOverlapX(left: ConcreteRect, right: ConcreteRect, tolerance: number = epsilon): StaticLayoutFact {
    return {kind: 'concrete-rects-do-not-overlap-x', left, right, tolerance}
  },

  concreteClose(actual: number, expected: number, tolerance: number = epsilon): StaticLayoutFact {
    return {kind: 'concrete-close', actual, expected, tolerance}
  },
}

// LoweredProgramAnalyzer deliberately handles a partial TS/JS subset:
// locals, loops, arrays, records, small helpers, and a few intrinsics.
// Unsupported language features are the proof boundary, not accidental gaps.
// includeFunctions lets each verifier keep that lowered surface narrow.
export class LoweredProgramAnalyzer {
  private readonly program: IrProgram
  private readonly overrides: Record<string, FunctionOverride>

  constructor(
    sourceText: string,
    externalGlobals: Record<string, number>,
    overrides: Record<string, FunctionOverride> = {},
    options: {includeFunctions?: string[]} = {},
  ) {
    this.overrides = overrides
    this.program = lowerSourceProgram(sourceText, externalGlobals, options.includeFunctions ?? null)
  }

  getGlobalNumber(name: string) {
    const value = this.program.globals.get(name)
    if (value == null) throw new Error(`Unknown numeric global: ${name}`)
    return value
  }

  evaluateFunction(name: string, args: Value[], mode: Mode): ReturnCase[] {
    const override = this.overrides[name]?.evaluate
    if (override != null) return override(args, mode, {
      analyzer: this,
      state: {mode, constraints: [], env: new Map()},
    })

    const fn = this.program.functions.get(name)
    if (fn == null) throw new Error(`Function ${name} not found`)
    if (fn.params.length !== args.length) {
      throw new Error(`Function ${name} expected ${fn.params.length} arguments, got ${args.length}`)
    }

    const env = new Map<string, Value>()
    for (let i = 0; i < fn.params.length; i++) env.set(fn.params[i]!, args[i]!)
    return executeFunctionBlocks(this, fn, [{mode, constraints: [], env}])
  }

  evaluateFunctionRange(name: string, args: RangeValue[]): RangeReturnCase[] {
    const override = this.overrides[name]?.evaluateRange
    if (override != null) return override(args, {
      analyzer: this,
      state: {env: new Map()},
    })

    const fn = this.program.functions.get(name)
    if (fn == null) throw new Error(`Function ${name} not found`)
    if (fn.params.length !== args.length) {
      throw new Error(`Function ${name} expected ${fn.params.length} arguments, got ${args.length}`)
    }

    const env = new Map<string, RangeValue>()
    for (let i = 0; i < fn.params.length; i++) env.set(fn.params[i]!, args[i]!)
    return executeRangeFunctionBlocks(this, fn, [{env}])
  }

  evalExpression(state: EvalState, expression: IrExpression): EvalCase[] {
    switch (expression.kind) {
      case 'number':
        return [{state, value: numberValue(state.mode, expression.value)}]
      case 'string':
        return [{state, value: concreteString(expression.value)}]
      case 'null':
        return [{state, value: concreteNull(state.mode)}]
      case 'boolean':
        return [{state, value: booleanValue(state.mode, expression.value)}]
      case 'identifier': {
        const local = state.env.get(expression.name)
        if (local != null) return [{state, value: local}]
        const global = this.program.globals.get(expression.name)
        if (global != null) return [{state, value: numberValue(state.mode, global)}]
        throw new Error(`Unsupported identifier: ${expression.name}`)
      }
      case 'prefix': {
        const operandCases = this.evalExpression(state, expression.operand)
        return operandCases.map(result => ({
          state: result.state,
          value: expression.operator === '-' ? negateNumber(expectNumber(result.value)) : expectNumber(result.value),
        }))
      }
      case 'postfix-update': {
        if (state.mode !== 'concrete') throw new Error('Postfix updates are only supported in concrete mode')
        const current = expectConcreteNumber(state.env.get(expression.target) ?? unsupported(`Unknown identifier ${expression.target}`))
        const env = new Map(state.env)
        env.set(expression.target, concreteNumber(expression.operator === '++' ? current + 1 : current - 1))
        return [{
          state: {...state, env},
          value: concreteNumber(current),
        }]
      }
      case 'array': {
        if (state.mode !== 'concrete') throw new Error('Array literals are only supported in concrete mode')
        let cases: Array<{state: EvalState; items: Value[]}> = [{state, items: []}]
        for (const itemExpression of expression.items) {
          const nextCases: Array<{state: EvalState; items: Value[]}> = []
          for (const arrayCase of cases) {
            for (const evaluated of this.evalExpression(arrayCase.state, itemExpression)) {
              nextCases.push({
                state: evaluated.state,
                items: [...arrayCase.items, evaluated.value],
              })
            }
          }
          cases = nextCases
        }
        return cases.map(arrayCase => ({
          state: arrayCase.state,
          value: concreteArray(arrayCase.items),
        }))
      }
      case 'property': {
        const targetCases = this.evalExpression(state, expression.object)
        return targetCases.map(result => ({
          state: result.state,
          value:
            result.value.kind === 'array'
              ? getArrayProperty(result.value, expression.property)
              : result.value.kind === 'string'
                ? getStringProperty(result.value, expression.property)
              : getProp(expectObject(result.value), expression.property),
        }))
      }
      case 'index': {
        const targetCases = this.evalExpression(state, expression.object)
        const results: EvalCase[] = []
        for (const targetCase of targetCases) {
          for (const evaluatedIndex of this.evalExpression(targetCase.state, expression.index)) {
            const index = expectConcreteNumber(evaluatedIndex.value)
            results.push({
              state: evaluatedIndex.state,
              value: getIndexableItem(targetCase.value, index),
            })
          }
        }
        return results
      }
      case 'binary':
        return combineBinaryCases(this, state, expression)
      case 'conditional': {
        const conditionCases = this.evalExpression(state, expression.condition)
        const results: EvalCase[] = []
        for (const conditionCase of conditionCases) {
          const condition = expectBoolean(conditionCase.value)
          if (condition.mode === 'concrete') {
            results.push(...this.evalExpression(conditionCase.state, condition.value ? expression.whenTrue : expression.whenFalse))
          } else {
            results.push(...this.evalExpression(withConstraint(conditionCase.state, condition.expr), expression.whenTrue))
            results.push(...this.evalExpression(withConstraint(conditionCase.state, negateBoolExpr(condition.expr)), expression.whenFalse))
          }
        }
        return results
      }
      case 'object': {
        let cases: Array<{state: EvalState; props: Record<string, Value>}> = [{state, props: {}}]
        for (const property of expression.properties) {
          if (property.kind === 'spread') {
            const nextCases: Array<{state: EvalState; props: Record<string, Value>}> = []
            for (const objectCase of cases) {
              for (const evaluated of this.evalExpression(objectCase.state, property.value)) {
                const spreadObject = expectObject(evaluated.value)
                nextCases.push({
                  state: evaluated.state,
                  props: {...objectCase.props, ...spreadObject.props},
                })
              }
            }
            cases = nextCases
            continue
          }

          const nextCases: Array<{state: EvalState; props: Record<string, Value>}> = []
          for (const objectCase of cases) {
            for (const evaluated of this.evalExpression(objectCase.state, property.value)) {
              nextCases.push({
                state: evaluated.state,
                props: {...objectCase.props, [property.name]: evaluated.value},
              })
            }
          }
          cases = nextCases
        }
        return cases.map(objectCase => ({
          state: objectCase.state,
          value: objectValue(state.mode, objectCase.props),
        }))
      }
      case 'call':
        return evaluateCallExpression(this, state, expression)
      case 'arrow': {
        if (state.mode !== 'concrete') throw new Error('Arrow functions are only supported in concrete mode')
        return [{
          state,
          value: {
            kind: 'function' as const,
            mode: 'concrete' as const,
            fn: expression.fn,
            closure: new Map(state.env),
          },
        }]
      }
      case 'assign': {
        if (state.mode !== 'concrete') throw new Error('Assignments are only supported in concrete mode')
        return this.evalExpression(state, expression.value).map(evaluated => {
          const env = new Map(evaluated.state.env)
          const nextValue =
            expression.operator === '='
              ? evaluated.value
              : applyAssignmentOperator(
                  expectNumber(env.get(expression.target) ?? unsupported(`Unknown identifier ${expression.target}`)),
                  expectNumber(evaluated.value),
                  expression.operator,
                )
          env.set(expression.target, nextValue)
          return {
            state: {...evaluated.state, env},
            value: nextValue,
          }
        })
      }
    }
  }

  evalRangeExpression(state: RangeState, expression: IrExpression): RangeEvalCase[] {
    switch (expression.kind) {
      case 'number':
        return [{state, value: rangeNumber(expression.value, expression.value, Number.isInteger(expression.value))}]
      case 'string':
        return [{state, value: rangeString(expression.value)}]
      case 'null':
        return [{state, value: rangeNull()}]
      case 'boolean':
        return [{state, value: rangeBoolean(expression.value ? 'always-true' : 'always-false')}]
      case 'identifier': {
        const local = state.env.get(expression.name)
        if (local != null) return [{state, value: local}]
        const global = this.program.globals.get(expression.name)
        if (global != null) return [{state, value: rangeNumber(global, global, Number.isInteger(global))}]
        throw new Error(`Unsupported identifier: ${expression.name}`)
      }
      case 'prefix': {
        const operandCases = this.evalRangeExpression(state, expression.operand)
        return operandCases.map(result => ({
          state: result.state,
          value: expression.operator === '-' ? negateRangeNumber(expectRangeNumber(result.value)) : expectRangeNumber(result.value),
        }))
      }
      case 'postfix-update': {
        const current = expectRangeNumber(state.env.get(expression.target) ?? unsupported(`Unknown identifier ${expression.target}`))
        const env = new Map(state.env)
        const delta = expression.operator === '++' ? 1 : -1
        env.set(expression.target, rangeNumber(current.min + delta, current.max + delta, current.isInteger))
        return [{
          state: {env},
          value: current,
        }]
      }
      case 'array': {
        let cases: Array<{state: RangeState; items: RangeValue[]}> = [{state, items: []}]
        for (const itemExpression of expression.items) {
          const nextCases: Array<{state: RangeState; items: RangeValue[]}> = []
          for (const arrayCase of cases) {
            for (const evaluated of this.evalRangeExpression(arrayCase.state, itemExpression)) {
              nextCases.push({
                state: evaluated.state,
                items: [...arrayCase.items, evaluated.value],
              })
            }
          }
          cases = nextCases
        }
        return cases.map(arrayCase => ({
          state: arrayCase.state,
          value: rangeArray(arrayCase.items),
        }))
      }
      case 'property': {
        const targetCases = this.evalRangeExpression(state, expression.object)
        return targetCases.map(result => ({
          state: result.state,
          value:
            result.value.kind === 'range-array'
              ? getRangeArrayProperty(result.value, expression.property)
              : result.value.kind === 'range-string'
                ? getRangeStringProperty(result.value, expression.property)
              : getRangeProp(expectRangeObject(result.value), expression.property),
        }))
      }
      case 'index': {
        const targetCases = this.evalRangeExpression(state, expression.object)
        const results: RangeEvalCase[] = []
        for (const targetCase of targetCases) {
          for (const evaluatedIndex of this.evalRangeExpression(targetCase.state, expression.index)) {
            results.push({
              state: evaluatedIndex.state,
              value: getRangeIndexableItem(targetCase.value, expectRangeNumber(evaluatedIndex.value)),
            })
          }
        }
        return results
      }
      case 'binary':
        return combineRangeBinaryCases(this, state, expression)
      case 'conditional': {
        const conditionCases = this.evalRangeExpression(state, expression.condition)
        const results: RangeEvalCase[] = []
        for (const conditionCase of conditionCases) {
          const condition = expectRangeBoolean(conditionCase.value)
          if (condition.truth !== 'always-false') {
            for (const narrowedState of narrowRangeStatesForCondition(this, conditionCase.state, expression.condition, true)) {
              results.push(...this.evalRangeExpression(narrowedState, expression.whenTrue))
            }
          }
          if (condition.truth !== 'always-true') {
            for (const narrowedState of narrowRangeStatesForCondition(this, conditionCase.state, expression.condition, false)) {
              results.push(...this.evalRangeExpression(narrowedState, expression.whenFalse))
            }
          }
        }
        return results
      }
      case 'object': {
        let cases: Array<{state: RangeState; props: Record<string, RangeValue>}> = [{state, props: {}}]
        for (const property of expression.properties) {
          if (property.kind === 'spread') {
            const nextCases: Array<{state: RangeState; props: Record<string, RangeValue>}> = []
            for (const objectCase of cases) {
              for (const evaluated of this.evalRangeExpression(objectCase.state, property.value)) {
                const spreadObject = expectRangeObject(evaluated.value)
                nextCases.push({
                  state: evaluated.state,
                  props: {...objectCase.props, ...spreadObject.props},
                })
              }
            }
            cases = nextCases
            continue
          }
          const nextCases: Array<{state: RangeState; props: Record<string, RangeValue>}> = []
          for (const objectCase of cases) {
            for (const evaluated of this.evalRangeExpression(objectCase.state, property.value)) {
              nextCases.push({
                state: evaluated.state,
                props: {...objectCase.props, [property.name]: evaluated.value},
              })
            }
          }
          cases = nextCases
        }
        return cases.map(objectCase => ({
          state: objectCase.state,
          value: rangeObject(objectCase.props),
        }))
      }
      case 'call':
        return evaluateRangeCallExpression(this, state, expression)
      case 'arrow':
        return [{
          state,
          value: {
            kind: 'range-function',
            fn: expression.fn,
            closure: new Map(state.env),
          },
        }]
      case 'assign': {
        return this.evalRangeExpression(state, expression.value).map(evaluated => {
          const env = new Map(evaluated.state.env)
          const nextValue =
            expression.operator === '='
              ? evaluated.value
              : applyRangeAssignmentOperator(
                  expectRangeNumber(env.get(expression.target) ?? unsupported(`Unknown identifier ${expression.target}`)),
                  expectRangeNumber(evaluated.value),
                  expression.operator,
                )
          env.set(expression.target, nextValue)
          return {
            state: {env},
            value: nextValue,
          }
        })
      }
    }
  }
}

// Reporting

export function check(
  laws: Map<string, InternalLawSummary>,
  name: string,
  passed: boolean,
  witness: () => StaticLayoutLawWitness,
  options: StaticLayoutLawKind | StaticLayoutLawCheckOptions = 'concrete-fixture',
) {
  const {kind, targets} = normalizeStaticLayoutLawCheckOptions('concrete-fixture', options)
  checkLaw(laws, name, passed ? {status: 'pass'} : {status: 'fail', witness: witness()}, kind, 'manual-check', targets)
}

export function checkFact(
  laws: Map<string, InternalLawSummary>,
  name: string,
  fact: StaticLayoutFact,
  witness: () => StaticLayoutLawWitness,
  options: StaticLayoutLawKind | StaticLayoutLawCheckOptions = {},
) {
  const {kind, targets} = normalizeStaticLayoutLawCheckOptions(staticLayoutFactKind(fact), options)
  const result = proveStaticLayoutFact(fact)
  checkLaw(laws, name, result.status === 'pass' ? result : {
    ...result,
    witness: {
      ...describeStaticLayoutFactFailure(fact),
      ...witness(),
    },
  }, kind, fact.kind, targets)
}

export function checkFacts(
  laws: Map<string, InternalLawSummary>,
  name: string,
  facts: StaticLayoutFact[],
  witness: () => StaticLayoutLawWitness,
  options: StaticLayoutLawKind | StaticLayoutLawCheckOptions = {},
) {
  if (facts.length === 0) {
    const {kind, targets} = normalizeStaticLayoutLawCheckOptions(
      typeof options === 'string' ? options : options.kind ?? 'concrete-fixture',
      options,
    )
    checkLaw(laws, name, {
      status: 'fail',
      witness: {
        ...witness(),
        reason: 'no facts to check',
      },
    }, kind, 'manual-check', targets)
    return
  }
  const {kind, targets} = normalizeStaticLayoutLawCheckOptions(inferStaticLayoutFactsKind(facts), options)
  for (const fact of facts) checkFact(laws, name, fact, witness, {kind, targets})
}

export function checkLaw(
  laws: Map<string, InternalLawSummary>,
  name: string,
  result: StaticLayoutLawResult,
  kind: StaticLayoutLawKind,
  proofMechanism: StaticLayoutLawProofMechanism = 'manual-check',
  targets: StaticLayoutTargetPath[] = [],
) {
  let law = laws.get(name)
  if (law == null) {
    law = {name, kind, checks: 0, proofs: new Map(), targets: new Map(), firstFailure: null, firstUnknown: null}
    laws.set(name, law)
  } else if (law.kind !== kind) {
    throw new Error(`Law ${name} mixed proof kinds: ${law.kind} vs ${kind}`)
  }
  law.checks++
  law.proofs.set(proofMechanism, (law.proofs.get(proofMechanism) ?? 0) + 1)
  recordLawTargets(law, proofMechanism, targets)
  if (result.status === 'fail' && law.firstFailure == null) law.firstFailure = result.witness
  if (result.status === 'unknown' && law.firstUnknown == null) {
    law.firstUnknown = result.witness == null
      ? {reason: result.reason}
      : {reason: result.reason, witness: result.witness}
  }
}

export function summarizeLaws(laws: Map<string, InternalLawSummary>): StaticLayoutLawSummary[] {
  return [...laws.values()].map(law => {
    const status =
      law.firstFailure != null ? 'fail'
      : law.firstUnknown != null ? 'unknown'
      : 'pass'
    const targets = summarizeLawTargets(law.targets)
    return {
      name: law.name,
      kind: law.kind,
      checks: law.checks,
      status,
      proofs: summarizeLawProofs(law.proofs),
      ...(targets.length === 0 ? {} : {targets}),
      ...(law.firstFailure == null ? {} : {firstFailure: law.firstFailure}),
      ...(law.firstUnknown == null ? {} : {firstUnknown: law.firstUnknown}),
    }
  })
}

function normalizeStaticLayoutLawCheckOptions(
  defaultKind: StaticLayoutLawKind,
  options: StaticLayoutLawKind | StaticLayoutLawCheckOptions,
): {kind: StaticLayoutLawKind; targets: StaticLayoutTargetPath[]} {
  if (typeof options === 'string') return {kind: options, targets: []}
  return {
    kind: options.kind ?? defaultKind,
    targets: options.targets ?? [],
  }
}

function recordLawTargets(
  law: InternalLawSummary,
  proofMechanism: StaticLayoutLawProofMechanism,
  targets: StaticLayoutTargetPath[],
) {
  for (const target of new Set(targets)) {
    const summary = law.targets.get(target) ?? {checks: 0, proofs: new Map()}
    summary.checks++
    summary.proofs.set(proofMechanism, (summary.proofs.get(proofMechanism) ?? 0) + 1)
    law.targets.set(target, summary)
  }
}

function summarizeLawTargets(targets: Map<StaticLayoutTargetPath, InternalLawTargetSummary>): StaticLayoutLawTargetSummary[] {
  return [...targets]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([target, summary]) => ({
      target,
      checks: summary.checks,
      proofs: summarizeLawProofs(summary.proofs),
    }))
}

function summarizeLawProofs(proofs: Map<StaticLayoutLawProofMechanism, number>): StaticLayoutLawProofSummary[] {
  return [...proofs].map(([mechanism, checks]) => ({mechanism, checks}))
}

function summarizeStaticLayoutCoverage(laws: StaticLayoutLawSummary[]): StaticLayoutTargetCoverageSummary[] {
  const coverage = new Map<StaticLayoutTargetPath, {
    checks: number
    status: StaticLayoutLawStatus
    laws: Set<string>
    proofs: Map<StaticLayoutLawProofMechanism, number>
  }>()

  for (const law of laws) {
    for (const target of law.targets ?? []) {
      const summary = coverage.get(target.target) ?? {
        checks: 0,
        status: 'pass' as StaticLayoutLawStatus,
        laws: new Set<string>(),
        proofs: new Map<StaticLayoutLawProofMechanism, number>(),
      }
      summary.checks += target.checks
      summary.status = combineStaticLayoutLawStatus(summary.status, law.status)
      summary.laws.add(law.name)
      for (const proof of target.proofs) {
        summary.proofs.set(proof.mechanism, (summary.proofs.get(proof.mechanism) ?? 0) + proof.checks)
      }
      coverage.set(target.target, summary)
    }
  }

  return [...coverage]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([target, summary]) => ({
      target,
      checks: summary.checks,
      status: summary.status,
      laws: [...summary.laws],
      proofs: summarizeLawProofs(summary.proofs),
    }))
}

function combineStaticLayoutLawStatus(left: StaticLayoutLawStatus, right: StaticLayoutLawStatus): StaticLayoutLawStatus {
  if (left === 'fail' || right === 'fail') return 'fail'
  if (left === 'unknown' || right === 'unknown') return 'unknown'
  return 'pass'
}

export function summarizeFunctionOverrides(overrides: Record<string, FunctionOverride>): StaticLayoutFunctionSummary[] {
  return Object.entries(overrides)
    .flatMap(([name, override]) => override.summary == null ? [] : [{name, ...override.summary}])
    .sort((left, right) => left.name.localeCompare(right.name))
}

export function mineNumericSweepCandidateLaws(
  subject: string,
  samples: StaticLayoutLawWitness[],
  options: {
    inputKeys?: string[]
    outputKeys?: string[]
    epsilon?: number
  } = {},
): StaticLayoutCandidateLaw[] {
  if (samples.length < 2) return []

  const epsilonValue = options.epsilon ?? epsilon
  const inputKeys = new Set(options.inputKeys ?? [])
  const allKeys = Object.keys(samples[0] ?? {})
  const numberKeys = allKeys.filter(key => samples.every(sample => typeof sample[key] === 'number'))
  const outputKeys = options.outputKeys ?? numberKeys.filter(key => !inputKeys.has(key))
  const outputKeySet = new Set(outputKeys)
  const laws: StaticLayoutCandidateLaw[] = []

  for (const key of outputKeys) {
    const values = samples.map(sample => sample[key] as number)
    const min = Math.min(...values)
    const max = Math.max(...values)
    if (values.every(Number.isInteger)) {
      laws.push(candidateLaw(`${subject} sweep observed ${key} as integer`, samples.length, {field: key}))
    }
    laws.push(candidateLaw(
      min === max
        ? `${subject} sweep observed ${key} fixed at ${formatCandidateNumber(min)}`
        : `${subject} sweep observed ${key} in ${formatCandidateNumber(min)}..${formatCandidateNumber(max)}`,
      samples.length,
      {field: key, min, max},
    ))
  }

  for (let leftIndex = 0; leftIndex < numberKeys.length; leftIndex++) {
    for (let rightIndex = leftIndex + 1; rightIndex < numberKeys.length; rightIndex++) {
      const leftKey = numberKeys[leftIndex]!
      const rightKey = numberKeys[rightIndex]!
      if (!outputKeySet.has(leftKey) && !outputKeySet.has(rightKey)) continue

      const deltas = samples.map(sample => (sample[leftKey] as number) - (sample[rightKey] as number))
      const firstDelta = deltas[0]!
      if (!deltas.every(delta => Math.abs(delta - firstDelta) <= epsilonValue)) continue
      let displayLeft = leftKey
      let displayRight = rightKey
      let displayDelta = firstDelta
      if (inputKeys.has(leftKey) && outputKeySet.has(rightKey)) {
        displayLeft = rightKey
        displayRight = leftKey
        displayDelta = -firstDelta
      }

      laws.push(candidateLaw(
        Math.abs(displayDelta) <= epsilonValue
          ? `${subject} sweep suggests ${displayLeft} = ${displayRight}`
          : `${subject} sweep suggests ${displayLeft} = ${displayRight} + ${formatCandidateNumber(displayDelta)}`,
        samples.length,
        {left: displayLeft, right: displayRight, delta: displayDelta},
      ))
    }
  }

  return laws
}

export function buildStaticLayoutReport(
  suite: string,
  analyzedFile: string,
  laws: Map<string, InternalLawSummary>,
  options: {
    functionSummaries?: StaticLayoutFunctionSummary[]
    candidateLaws?: StaticLayoutCandidateLaw[]
  } = {},
): StaticLayoutVerificationReport {
  const lawSummaries = summarizeLaws(laws)
  const functionSummaries = options.functionSummaries ?? []
  const candidateLaws = options.candidateLaws ?? []
  return {
    phase: lawSummaries.some(law => law.status !== 'pass') ? 'error' : 'ready',
    suite,
    analyzedFile,
    coverage: summarizeStaticLayoutCoverage(lawSummaries),
    laws: lawSummaries,
    ...(functionSummaries.length === 0 ? {} : {functionSummaries}),
    ...(candidateLaws.length === 0 ? {} : {candidateLaws}),
  }
}

export function proveStaticLayoutFact(fact: StaticLayoutFact): StaticLayoutProofResult {
  switch (fact.kind) {
    case 'symbolic-equality':
      return proveSymbolicExprEquality(fact.left, fact.right)
    case 'range-equality':
      return rangeNumbersEqual(fact.left, fact.right) ? {status: 'pass'} : {status: 'fail'}
    case 'range-rect-edge-equality':
      return rangeNumbersEqual(getRangeRectEdge(fact.rect, fact.edge), fact.expected) ? {status: 'pass'} : {status: 'fail'}
    case 'range-within':
      if (fact.min != null && fact.value.min < fact.min - epsilon) return {status: 'fail'}
      if (fact.max != null && fact.value.max > fact.max + epsilon) return {status: 'fail'}
      return {status: 'pass'}
    case 'range-non-negative':
      return fact.value.min >= -epsilon ? {status: 'pass'} : {status: 'fail'}
    case 'range-integer':
      return fact.value.isInteger ? {status: 'pass'} : {status: 'fail'}
    case 'range-array-length':
      return fact.value.lengthMin === fact.exact && fact.value.lengthMax === fact.exact ? {status: 'pass'} : {status: 'fail'}
    case 'concrete-rect-edge-equality':
      return Math.abs(getConcreteRectEdge(fact.rect, fact.edge) - fact.expected) <= fact.tolerance ? {status: 'pass'} : {status: 'fail'}
    case 'concrete-rect-x-within':
      return concreteRectXWithin(fact.rect, fact.bounds, fact.tolerance) ? {status: 'pass'} : {status: 'fail'}
    case 'concrete-rect-x-fills':
      return concreteRectXFills(fact.rect, fact.bounds, fact.tolerance) ? {status: 'pass'} : {status: 'fail'}
    case 'concrete-rect-y-within':
      return concreteRectYWithin(fact.rect, fact.bounds, fact.tolerance) ? {status: 'pass'} : {status: 'fail'}
    case 'concrete-rects-do-not-overlap-x':
      return concreteRectsDoNotOverlapX(fact.left, fact.right, fact.tolerance) ? {status: 'pass'} : {status: 'fail'}
    case 'concrete-close':
      return Math.abs(fact.actual - fact.expected) <= fact.tolerance ? {status: 'pass'} : {status: 'fail'}
  }
}

function describeStaticLayoutFactFailure(fact: StaticLayoutFact): StaticLayoutLawWitness {
  switch (fact.kind) {
    case 'symbolic-equality':
      return {
        fact: fact.kind,
        left: formatScalarExpr(fact.left),
        right: formatScalarExpr(fact.right),
      }
    case 'range-equality':
      return {
        fact: fact.kind,
        actualRange: describeRangeNumber(fact.left),
        expectedRange: describeRangeNumber(fact.right),
      }
    case 'range-rect-edge-equality': {
      const actual = getRangeRectEdge(fact.rect, fact.edge)
      return {
        fact: fact.kind,
        edge: fact.edge,
        actualRange: describeRangeNumber(actual),
        expectedRange: describeRangeNumber(fact.expected),
      }
    }
    case 'range-within':
      return {
        fact: fact.kind,
        valueRange: describeRangeNumber(fact.value),
        min: fact.min ?? null,
        max: fact.max ?? null,
      }
    case 'range-non-negative':
      return {
        fact: fact.kind,
        valueRange: describeRangeNumber(fact.value),
        underflowBy: Math.max(0, -fact.value.min),
      }
    case 'range-integer':
      return {
        fact: fact.kind,
        valueRange: describeRangeNumber(fact.value),
        isInteger: fact.value.isInteger ? 'true' : 'false',
      }
    case 'range-array-length':
      return {
        fact: fact.kind,
        lengthMin: fact.value.lengthMin,
        lengthMax: fact.value.lengthMax,
        expectedLength: fact.exact,
      }
    case 'concrete-rect-edge-equality': {
      const actual = getConcreteRectEdge(fact.rect, fact.edge)
      return {
        fact: fact.kind,
        edge: fact.edge,
        actual,
        expected: fact.expected,
        delta: actual - fact.expected,
        geometrySvg: svgForRectEdge(fact.rect, fact.edge, fact.expected),
      }
    }
    case 'concrete-rect-x-within': {
      const rectLeft = fact.rect.left
      const rectRight = fact.rect.left + fact.rect.width
      const leftOverflowBy = Math.max(0, fact.bounds.left - rectLeft)
      const rightOverflowBy = Math.max(0, rectRight - fact.bounds.right)
      return {
        fact: fact.kind,
        rectLeft,
        rectRight,
        boundsLeft: fact.bounds.left,
        boundsRight: fact.bounds.right,
        leftOverflowBy,
        rightOverflowBy,
        overflowBy: Math.max(leftOverflowBy, rightOverflowBy),
        geometrySvg: svgForInlineRectBounds(fact.rect, fact.bounds),
      }
    }
    case 'concrete-rect-x-fills': {
      const rectLeft = fact.rect.left
      const rectRight = fact.rect.left + fact.rect.width
      return {
        fact: fact.kind,
        rectLeft,
        rectRight,
        boundsLeft: fact.bounds.left,
        boundsRight: fact.bounds.right,
        leftDelta: rectLeft - fact.bounds.left,
        rightDelta: rectRight - fact.bounds.right,
        geometrySvg: svgForInlineRectBounds(fact.rect, fact.bounds),
      }
    }
    case 'concrete-rect-y-within': {
      const rectTop = fact.rect.top
      const rectBottom = fact.rect.top + fact.rect.height
      const topOverflowBy = Math.max(0, fact.bounds.top - rectTop)
      const bottomOverflowBy = Math.max(0, rectBottom - fact.bounds.bottom)
      return {
        fact: fact.kind,
        rectTop,
        rectBottom,
        boundsTop: fact.bounds.top,
        boundsBottom: fact.bounds.bottom,
        topOverflowBy,
        bottomOverflowBy,
        overflowBy: Math.max(topOverflowBy, bottomOverflowBy),
        geometrySvg: svgForBlockRectBounds(fact.rect, fact.bounds),
      }
    }
    case 'concrete-rects-do-not-overlap-x': {
      const leftRight = fact.left.left + fact.left.width
      const rightRight = fact.right.left + fact.right.width
      const overlapBy = Math.max(0, Math.min(leftRight, rightRight) - Math.max(fact.left.left, fact.right.left))
      return {
        fact: fact.kind,
        leftRectLeft: fact.left.left,
        leftRectRight: leftRight,
        rightRectLeft: fact.right.left,
        rightRectRight: rightRight,
        overlapBy,
        geometrySvg: svgForInlineRectPair(fact.left, fact.right),
      }
    }
    case 'concrete-close':
      return {
        fact: fact.kind,
        actual: fact.actual,
        expected: fact.expected,
        delta: fact.actual - fact.expected,
      }
  }
}

function rangeNumbersEqual(left: RangeNumberValue, right: RangeNumberValue) {
  return (
    Math.abs(left.min - right.min) <= epsilon &&
    Math.abs(left.max - right.max) <= epsilon
  ) || (
    left.expr != null &&
    right.expr != null &&
    symbolicExprEquals(left.expr, right.expr)
  )
}

function describeRangeNumber(value: RangeNumberValue) {
  return `[${value.min},${value.max}]${value.isInteger ? ':int' : ''}`
}

function getRangeRectEdge(rect: RangeRect, edge: RectEdge) {
  switch (edge) {
    case 'left':
      return rect.left
    case 'top':
      return rect.top
    case 'width':
      return rect.width
    case 'height':
      return rect.height
    case 'right':
      return addRangeNumbers(rect.left, rect.width)
    case 'bottom':
      return addRangeNumbers(rect.top, rect.height)
  }
}

function getConcreteRectEdge(rect: ConcreteRect, edge: RectEdge) {
  switch (edge) {
    case 'left':
      return rect.left
    case 'top':
      return rect.top
    case 'width':
      return rect.width
    case 'height':
      return rect.height
    case 'right':
      return rect.left + rect.width
    case 'bottom':
      return rect.top + rect.height
  }
}

function addRangeNumbers(left: RangeNumberValue, right: RangeNumberValue) {
  return rangeNumber(left.min + right.min, left.max + right.max, left.isInteger && right.isInteger)
}

function concreteRectXWithin(rect: ConcreteRect, bounds: ConcreteInlineBounds, tolerance: number) {
  return rect.left >= bounds.left - tolerance && rect.left + rect.width <= bounds.right + tolerance
}

function concreteRectXFills(rect: ConcreteRect, bounds: ConcreteInlineBounds, tolerance: number) {
  return Math.abs(rect.left - bounds.left) <= tolerance && Math.abs(rect.left + rect.width - bounds.right) <= tolerance
}

function concreteRectYWithin(rect: ConcreteRect, bounds: ConcreteBlockBounds, tolerance: number) {
  return rect.top >= bounds.top - tolerance && rect.top + rect.height <= bounds.bottom + tolerance
}

function concreteRectsDoNotOverlapX(left: ConcreteRect, right: ConcreteRect, tolerance: number) {
  return left.left + left.width <= right.left + tolerance || right.left + right.width <= left.left + tolerance
}

function svgForRectEdge(rect: ConcreteRect, edge: RectEdge, expected: number) {
  if (edge === 'top' || edge === 'bottom' || edge === 'height') return svgForBlockRectBounds(rect, {
    top: edge === 'height' ? rect.top : expected,
    bottom: edge === 'height' ? rect.top + expected : expected,
  })
  return svgForInlineRectBounds(rect, {
    left: edge === 'width' ? rect.left : expected,
    right: edge === 'width' ? rect.left + expected : expected,
  })
}

function svgForInlineRectBounds(rect: ConcreteRect, bounds: ConcreteInlineBounds) {
  const rectRight = rect.left + rect.width
  const min = Math.min(bounds.left, bounds.right, rect.left, rectRight)
  const max = Math.max(bounds.left, bounds.right, rect.left, rectRight)
  const map = makeSvgMapper(min, max, 10, 230)
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 48"><line x1="${map(bounds.left)}" y1="14" x2="${map(bounds.right)}" y2="14" stroke="#333" stroke-width="2"/><rect x="${map(rect.left)}" y="24" width="${Math.max(1, map(rectRight) - map(rect.left))}" height="10" fill="#f88" stroke="#900"/></svg>`
}

function svgForBlockRectBounds(rect: ConcreteRect, bounds: ConcreteBlockBounds) {
  const rectBottom = rect.top + rect.height
  const min = Math.min(bounds.top, bounds.bottom, rect.top, rectBottom)
  const max = Math.max(bounds.top, bounds.bottom, rect.top, rectBottom)
  const map = makeSvgMapper(min, max, 10, 70)
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80"><line x1="16" y1="${map(bounds.top)}" x2="16" y2="${map(bounds.bottom)}" stroke="#333" stroke-width="2"/><rect x="36" y="${map(rect.top)}" width="18" height="${Math.max(1, map(rectBottom) - map(rect.top))}" fill="#f88" stroke="#900"/></svg>`
}

function svgForInlineRectPair(left: ConcreteRect, right: ConcreteRect) {
  const leftRight = left.left + left.width
  const rightRight = right.left + right.width
  const min = Math.min(left.left, leftRight, right.left, rightRight)
  const max = Math.max(left.left, leftRight, right.left, rightRight)
  const map = makeSvgMapper(min, max, 10, 230)
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 54"><rect x="${map(left.left)}" y="14" width="${Math.max(1, map(leftRight) - map(left.left))}" height="12" fill="#8cf" stroke="#057"/><rect x="${map(right.left)}" y="28" width="${Math.max(1, map(rightRight) - map(right.left))}" height="12" fill="#f88" stroke="#900"/></svg>`
}

function makeSvgMapper(min: number, max: number, outMin: number, outMax: number) {
  const span = Math.max(epsilon, max - min)
  return (value: number) => Math.round(outMin + (value - min) / span * (outMax - outMin))
}

function inferStaticLayoutFactsKind(facts: StaticLayoutFact[]): StaticLayoutLawKind {
  if (facts.length === 0) throw new Error('Expected at least one static layout fact')
  const kind = staticLayoutFactKind(facts[0]!)
  for (let i = 1; i < facts.length; i++) {
    const nextKind = staticLayoutFactKind(facts[i]!)
    if (nextKind !== kind) throw new Error(`Mixed fact kinds: ${kind} vs ${nextKind}`)
  }
  return kind
}

function staticLayoutFactKind(fact: StaticLayoutFact): StaticLayoutLawKind {
  switch (fact.kind) {
    case 'symbolic-equality':
      return 'symbolic'
    case 'range-equality':
    case 'range-rect-edge-equality':
    case 'range-within':
    case 'range-non-negative':
    case 'range-integer':
    case 'range-array-length':
      return 'range'
    case 'concrete-rect-edge-equality':
    case 'concrete-rect-x-within':
    case 'concrete-rect-x-fills':
    case 'concrete-rect-y-within':
    case 'concrete-rects-do-not-overlap-x':
    case 'concrete-close':
      return 'concrete-fixture'
  }
}

function candidateLaw(name: string, evidence: number, details?: StaticLayoutLawWitness): StaticLayoutCandidateLaw {
  return {
    name,
    kind: 'mined-from-concrete-sweep',
    evidence,
    ...(details == null ? {} : {details}),
  }
}

function formatCandidateNumber(value: number) {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(4)))
}

// Callback invocation

export function invokeConcreteFunctionValue(
  analyzer: LoweredProgramAnalyzer,
  outerState: EvalState,
  callbackValue: Value,
  args: Value[],
): EvalCase[] {
  const callback = expectFunction(callbackValue)
  const env = new Map(callback.closure)
  for (const [name, value] of outerState.env) env.set(name, value)
  for (let i = 0; i < callback.fn.params.length; i++) {
    const arg = args[i]
    if (arg == null) break
    env.set(callback.fn.params[i]!, arg)
  }
  const returns = executeFunctionBlocks(analyzer, callback.fn, [{
    mode: outerState.mode,
    constraints: outerState.constraints,
    env,
  }])
  return returns.map(returned => ({
    state: {
      ...outerState,
      constraints: returned.constraints,
      env: returned.env ?? env,
    },
    value: returned.value,
  }))
}

function invokeRangeFunctionValue(
  analyzer: LoweredProgramAnalyzer,
  outerState: RangeState,
  callbackValue: RangeValue,
  args: RangeValue[],
): RangeEvalCase[] {
  const callback = expectRangeFunction(callbackValue)
  const env = new Map(callback.closure)
  for (const [name, value] of outerState.env) env.set(name, value)
  for (let i = 0; i < callback.fn.params.length; i++) {
    const arg = args[i]
    if (arg == null) break
    env.set(callback.fn.params[i]!, arg)
  }
  const returns = executeRangeFunctionBlocks(analyzer, callback.fn, [{env}])
  return returns.map(returned => ({
    state: outerState,
    value: returned.value,
  }))
}

// Range case joining

export function joinRangeCases(cases: RangeReturnCase[]): RangeValue {
  if (cases.length === 0) throw new Error('Expected at least 1 range case')
  let current = cases[0]!.value
  for (let i = 1; i < cases.length; i++) current = joinRangeValues(current, cases[i]!.value)
  return current
}

// CFG execution

function executeFunctionBlocks(analyzer: LoweredProgramAnalyzer, fn: InlineFunction, initialStates: EvalState[]): ReturnCase[] {
  const returns: ReturnCase[] = []
  const worklist = initialStates.map(state => ({blockId: fn.entryBlockId, state}))
  let steps = 0

  while (worklist.length > 0) {
    const item = worklist.pop()!
    if (steps++ > 20000) throw new Error('Concrete/symbolic CFG execution exceeded its step budget')
    const block = fn.blocks.get(item.blockId)
    if (block == null) throw new Error(`Unknown block ${item.blockId}`)

    let states = [item.state]
    for (const instruction of block.instructions) {
      const nextStates: EvalState[] = []
      for (const state of states) nextStates.push(...executeInstruction(analyzer, state, instruction))
      states = nextStates
    }

    for (const state of states) {
      switch (block.terminator.kind) {
        case 'return':
          for (const evaluated of analyzer.evalExpression(state, block.terminator.expression)) {
            returns.push({
              constraints: evaluated.state.constraints,
              env: evaluated.state.env,
              value: evaluated.value,
            })
          }
          break
        case 'goto':
          worklist.push({blockId: block.terminator.targetBlockId, state})
          break
        case 'branch': {
          const conditionCases = analyzer.evalExpression(state, block.terminator.condition)
          for (const conditionCase of conditionCases) {
            const condition = expectBoolean(conditionCase.value)
            if (condition.mode === 'concrete') {
              worklist.push({
                blockId: condition.value ? block.terminator.thenBlockId : block.terminator.elseBlockId,
                state: conditionCase.state,
              })
            } else {
              worklist.push({
                blockId: block.terminator.thenBlockId,
                state: withConstraint(conditionCase.state, condition.expr),
              })
              worklist.push({
                blockId: block.terminator.elseBlockId,
                state: withConstraint(conditionCase.state, negateBoolExpr(condition.expr)),
              })
            }
          }
          break
        }
        case 'end':
          returns.push({
            constraints: state.constraints,
            env: state.env,
            value: concreteNull(state.mode),
          })
          break
      }
    }
  }

  return returns
}

function executeRangeFunctionBlocks(analyzer: LoweredProgramAnalyzer, fn: InlineFunction, initialStates: RangeState[]): RangeReturnCase[] {
  const returns: RangeReturnCase[] = []
  const worklist = initialStates.map(state => ({blockId: fn.entryBlockId, state}))
  let steps = 0

  while (worklist.length > 0) {
    const item = worklist.pop()!
    if (steps++ > 10000) throw new Error('Range CFG execution exceeded its step budget')
    const block = fn.blocks.get(item.blockId)
    if (block == null) throw new Error(`Unknown block ${item.blockId}`)

    let states = [item.state]
    for (const instruction of block.instructions) {
      const nextStates: RangeState[] = []
      for (const state of states) nextStates.push(...executeRangeInstruction(analyzer, state, instruction))
      states = nextStates
    }

    for (const state of states) {
      switch (block.terminator.kind) {
        case 'return':
          for (const evaluated of analyzer.evalRangeExpression(state, block.terminator.expression)) {
            returns.push({value: evaluated.value})
          }
          break
        case 'goto':
          worklist.push({blockId: block.terminator.targetBlockId, state})
          break
        case 'branch': {
          const conditionCases = analyzer.evalRangeExpression(state, block.terminator.condition)
          for (const conditionCase of conditionCases) {
            const condition = expectRangeBoolean(conditionCase.value)
            if (condition.truth !== 'always-false') {
              for (const narrowedState of narrowRangeStatesForCondition(analyzer, conditionCase.state, block.terminator.condition, true)) {
                worklist.push({blockId: block.terminator.thenBlockId, state: narrowedState})
              }
            }
            if (condition.truth !== 'always-true') {
              for (const narrowedState of narrowRangeStatesForCondition(analyzer, conditionCase.state, block.terminator.condition, false)) {
                worklist.push({blockId: block.terminator.elseBlockId, state: narrowedState})
              }
            }
          }
          break
        }
        case 'end':
          break
      }
    }
  }

  return returns
}

// Instruction dispatch

function executeInstruction(analyzer: LoweredProgramAnalyzer, state: EvalState, instruction: IrInstruction): EvalState[] {
  if (instruction.kind === 'declare') {
    let states = [state]
    for (const declaration of instruction.declarations) {
      const nextStates: EvalState[] = []
      for (const declarationState of states) {
        for (const evaluated of analyzer.evalExpression(declarationState, declaration.initializer)) {
          const env = new Map(evaluated.state.env)
          bindValueToName(env, declaration.name, evaluated.value)
          nextStates.push({...evaluated.state, env})
        }
      }
      states = nextStates
    }
    return states
  }

  return analyzer.evalExpression(state, instruction.expression).map(result => result.state)
}

function executeRangeInstruction(analyzer: LoweredProgramAnalyzer, state: RangeState, instruction: IrInstruction): RangeState[] {
  if (instruction.kind === 'expression') {
    return analyzer.evalRangeExpression(state, instruction.expression).map(result => result.state)
  }

  let states = [state]
  for (const declaration of instruction.declarations) {
    const nextStates: RangeState[] = []
    for (const declarationState of states) {
      for (const evaluated of analyzer.evalRangeExpression(declarationState, declaration.initializer)) {
        const env = new Map(evaluated.state.env)
        bindRangeValueToName(env, declaration.name, evaluated.value)
        nextStates.push({env})
      }
    }
    states = nextStates
  }
  return states
}

// Binary expression evaluation

function combineBinaryCases(analyzer: LoweredProgramAnalyzer, state: EvalState, expression: Extract<IrExpression, {kind: 'binary'}>): EvalCase[] {
  const leftCases = analyzer.evalExpression(state, expression.left)
  const results: EvalCase[] = []
  for (const leftCase of leftCases) {
    if (expression.operator === '??') {
      if (leftCase.value.kind !== 'null') {
        results.push({
          state: leftCase.state,
          value: leftCase.value,
        })
        continue
      }
      results.push(...analyzer.evalExpression(leftCase.state, expression.right))
      continue
    }

    if (expression.operator === '||' || expression.operator === '&&') {
      const left = expectBoolean(leftCase.value)
      if (left.mode !== 'concrete') throw new Error(`Logical operator ${expression.operator} is only supported in concrete mode`)
      if ((expression.operator === '||' && left.value) || (expression.operator === '&&' && !left.value)) {
        results.push({
          state: leftCase.state,
          value: booleanValue('concrete', left.value),
        })
        continue
      }
      for (const rightCase of analyzer.evalExpression(leftCase.state, expression.right)) {
        const right = expectBoolean(rightCase.value)
        if (right.mode !== 'concrete') throw new Error(`Logical operator ${expression.operator} is only supported in concrete mode`)
        results.push({
          state: rightCase.state,
          value: booleanValue('concrete', right.value),
        })
      }
      continue
    }

    const rightCases = analyzer.evalExpression(leftCase.state, expression.right)
    for (const rightCase of rightCases) {
      if (
        expression.operator === '+' ||
        expression.operator === '-' ||
        expression.operator === '*' ||
        expression.operator === '/' ||
        expression.operator === '%' ||
        expression.operator === '**'
      ) {
        results.push({
          state: rightCase.state,
          value: applyNumericOperator(expectNumber(leftCase.value), expectNumber(rightCase.value), expression.operator),
        })
        continue
      }

      if (isComparisonOperator(expression.operator)) {
        results.push({
          state: rightCase.state,
          value: applyComparisonOperator(leftCase.value, rightCase.value, expression.operator),
        })
        continue
      }

      throw new Error('Unsupported binary operator')
    }
  }
  return results
}

function combineRangeBinaryCases(analyzer: LoweredProgramAnalyzer, state: RangeState, expression: Extract<IrExpression, {kind: 'binary'}>): RangeEvalCase[] {
  const leftCases = analyzer.evalRangeExpression(state, expression.left)
  const results: RangeEvalCase[] = []
  for (const leftCase of leftCases) {
    if (expression.operator === '??') {
      if (leftCase.value.kind !== 'range-null') {
        results.push({
          state: leftCase.state,
          value: leftCase.value,
        })
        continue
      }
      results.push(...analyzer.evalRangeExpression(leftCase.state, expression.right))
      continue
    }
    if (expression.operator === '||' || expression.operator === '&&') {
      const left = expectRangeBoolean(leftCase.value)
      if ((expression.operator === '||' && left.truth === 'always-true') || (expression.operator === '&&' && left.truth === 'always-false')) {
        results.push({
          state: leftCase.state,
          value: rangeBoolean(left.truth === 'always-true' ? 'always-true' : 'always-false'),
        })
        continue
      }
      if ((expression.operator === '||' && left.truth === 'always-false') || (expression.operator === '&&' && left.truth === 'always-true')) {
        const narrowedStates = narrowRangeStatesForCondition(
          analyzer,
          leftCase.state,
          expression.left,
          expression.operator === '&&',
        )
        for (const narrowedState of narrowedStates) {
          const rightCases = analyzer.evalRangeExpression(narrowedState, expression.right)
          for (const rightCase of rightCases) {
            results.push({
              state: rightCase.state,
              value: expectRangeBoolean(rightCase.value),
            })
          }
        }
        continue
      }
      const shortCircuitTruth = expression.operator === '||'
        ? rangeBoolean('always-true')
        : rangeBoolean('always-false')
      results.push({
        state: leftCase.state,
        value: shortCircuitTruth,
      })
      const narrowedStates = narrowRangeStatesForCondition(
        analyzer,
        leftCase.state,
        expression.left,
        expression.operator === '&&',
      )
      for (const narrowedState of narrowedStates) {
        const rightCases = analyzer.evalRangeExpression(narrowedState, expression.right)
        for (const rightCase of rightCases) {
          results.push({
            state: rightCase.state,
            value: rangeBoolean('maybe'),
          })
        }
      }
      continue
    }
    const rightCases = analyzer.evalRangeExpression(leftCase.state, expression.right)
    for (const rightCase of rightCases) {
      if (
        expression.operator === '==' ||
        expression.operator === '!=' ||
        expression.operator === '===' ||
        expression.operator === '!=='
      ) {
        const nullTruth = compareNullableRangeValues(leftCase.value, rightCase.value, expression.operator)
        if (nullTruth != null) {
          results.push({
            state: rightCase.state,
            value: rangeBoolean(nullTruth),
          })
          continue
        }
        const stringTruth = compareRangeStringValues(leftCase.value, rightCase.value, expression.operator)
        if (stringTruth != null) {
          results.push({
            state: rightCase.state,
            value: rangeBoolean(stringTruth),
          })
          continue
        }
      }

      if (
        expression.operator === '+' ||
        expression.operator === '-' ||
        expression.operator === '*' ||
        expression.operator === '/' ||
        expression.operator === '%' ||
        expression.operator === '**'
      ) {
        results.push({
          state: rightCase.state,
          value: applyRangeNumericOperator(expectRangeNumber(leftCase.value), expectRangeNumber(rightCase.value), expression.operator),
        })
        continue
      }

      if (isRangeComparisonOperator(expression.operator)) {
        results.push({
          state: rightCase.state,
          value: rangeBoolean(compareRangeNumbers(expectRangeNumber(leftCase.value), expectRangeNumber(rightCase.value), expression.operator)),
        })
        continue
      }

      throw new Error('Unsupported range binary operator')
    }
  }
  return results
}

// Range narrowing (condition-level, needs the evaluator for sub-expression reading)

function narrowRangeStatesForCondition(
  analyzer: LoweredProgramAnalyzer,
  state: RangeState,
  expression: IrExpression,
  assumeTrue: boolean,
): RangeState[] {
  if (expression.kind === 'binary') {
    if (expression.operator === '&&') {
      if (assumeTrue) {
        let states = narrowRangeStatesForCondition(analyzer, state, expression.left, true)
        states = states.flatMap(nextState => narrowRangeStatesForCondition(analyzer, nextState, expression.right, true))
        return states
      }
      return [
        ...narrowRangeStatesForCondition(analyzer, state, expression.left, false),
        ...narrowRangeStatesForCondition(analyzer, state, expression.left, true)
          .flatMap(nextState => narrowRangeStatesForCondition(analyzer, nextState, expression.right, false)),
      ]
    }

    if (expression.operator === '||') {
      if (assumeTrue) {
        return [
          ...narrowRangeStatesForCondition(analyzer, state, expression.left, true),
          ...narrowRangeStatesForCondition(analyzer, state, expression.left, false)
            .flatMap(nextState => narrowRangeStatesForCondition(analyzer, nextState, expression.right, true)),
        ]
      }
      let states = narrowRangeStatesForCondition(analyzer, state, expression.left, false)
      states = states.flatMap(nextState => narrowRangeStatesForCondition(analyzer, nextState, expression.right, false))
      return states
    }

    const narrowedStates = narrowRangeStatesForSimpleComparison(analyzer, state, expression, assumeTrue)
    if (narrowedStates != null) return narrowedStates
  }

  return [state]
}

function narrowRangeStatesForSimpleComparison(
  analyzer: LoweredProgramAnalyzer,
  state: RangeState,
  expression: Extract<IrExpression, {kind: 'binary'}>,
  assumeTrue: boolean,
): RangeState[] | null {
  if (!isRangeComparisonOperator(expression.operator)) {
    return null
  }
  const operator = narrowableComparisonOperator(expression.operator, assumeTrue)
  if (operator == null) return null

  const leftValue = readSimpleRangeValue(analyzer, state, expression.left)
  const rightValue = readSimpleRangeValue(analyzer, state, expression.right)
  if (leftValue?.kind !== 'range-number' || rightValue?.kind !== 'range-number') return null

  const narrowedPair = narrowRangeNumberPair(leftValue, rightValue, operator)
  if (narrowedPair == null) return []

  let nextEnv = state.env
  const leftPath = getRangeAccessPath(expression.left)
  const rightPath = getRangeAccessPath(expression.right)

  if (leftPath != null) {
    const updatedEnv = setRangeValueAtPath(nextEnv, leftPath, narrowedPair.left)
    if (updatedEnv != null) nextEnv = updatedEnv
  }

  if (rightPath != null) {
    const updatedEnv = setRangeValueAtPath(nextEnv, rightPath, narrowedPair.right)
    if (updatedEnv != null) nextEnv = updatedEnv
  }

  return [{env: nextEnv}]
}

function readSimpleRangeValue(analyzer: LoweredProgramAnalyzer, state: RangeState, expression: IrExpression): RangeValue | null {
  switch (expression.kind) {
    case 'number':
      return rangeNumber(expression.value, expression.value, Number.isInteger(expression.value))
    case 'string':
      return rangeString(expression.value)
    case 'null':
      return rangeNull()
    case 'boolean':
      return rangeBoolean(expression.value ? 'always-true' : 'always-false')
    case 'identifier': {
      const local = state.env.get(expression.name)
      if (local != null) return local
      try {
        const global = analyzer.getGlobalNumber(expression.name)
        return rangeNumber(global, global, Number.isInteger(global))
      } catch {
        return null
      }
    }
    case 'prefix': {
      const operand = readSimpleRangeValue(analyzer, state, expression.operand)
      if (operand?.kind !== 'range-number') return null
      return expression.operator === '-' ? negateRangeNumber(operand) : operand
    }
    case 'property': {
      const target = readSimpleRangeValue(analyzer, state, expression.object)
      if (target == null) return null
      if (target.kind === 'range-object') return target.props[expression.property] ?? null
      if (target.kind === 'range-array') return getRangeArrayProperty(target, expression.property)
      if (target.kind === 'range-string') return getRangeStringProperty(target, expression.property)
      return null
    }
    default:
      return null
  }
}

function getRangeAccessPath(expression: IrExpression): RangeAccessPath | null {
  if (expression.kind === 'identifier') return {root: expression.name, props: []}
  if (expression.kind === 'property') {
    const base = getRangeAccessPath(expression.object)
    if (base == null) return null
    return {
      root: base.root,
      props: [...base.props, expression.property],
    }
  }
  return null
}

// Call expression evaluation

function evaluateCallExpression(analyzer: LoweredProgramAnalyzer, state: EvalState, expression: Extract<IrExpression, {kind: 'call'}>): EvalCase[] {
  if (expression.callee.kind === 'property' && expression.callee.property === 'at') {
    const targetCases = analyzer.evalExpression(state, expression.callee.object)
    const results: EvalCase[] = []
    for (const targetCase of targetCases) {
      const array = expectArray(targetCase.value)
      if (expression.args.length !== 1) throw new Error('Array.at expects exactly 1 argument')
      for (const evaluatedIndex of analyzer.evalExpression(targetCase.state, expression.args[0]!)) {
        let index = expectConcreteNumber(evaluatedIndex.value)
        if (index < 0) index = array.items.length + index
        results.push({
          state: evaluatedIndex.state,
          value: getArrayItem(array, index),
        })
      }
    }
    return results
  }

  if (expression.callee.kind === 'property' && expression.callee.property === 'push') {
    const targetExpression = expression.callee.object
    if (targetExpression.kind !== 'identifier') throw new Error('Only identifier.push(...) is supported')
    let activeStates: EvalState[] = [state]
    for (const argument of expression.args) {
      const nextStates: EvalState[] = []
      for (const activeState of activeStates) {
        for (const evaluated of analyzer.evalExpression(activeState, argument)) {
          const currentArray = expectArray(evaluated.state.env.get(targetExpression.name) ?? unsupported(`Unknown array identifier ${targetExpression.name}`))
          const env = new Map(evaluated.state.env)
          const items = [...currentArray.items, evaluated.value]
          env.set(targetExpression.name, concreteArray(items))
          nextStates.push({
            ...evaluated.state,
            env,
          })
        }
      }
      activeStates = nextStates
    }
    return activeStates.map(activeState => ({
      state: activeState,
      value: concreteNumber(expectArray(activeState.env.get(targetExpression.name)!).items.length),
    }))
  }

  if (expression.callee.kind === 'property' && expression.callee.property === 'slice') {
    const targetCases = analyzer.evalExpression(state, expression.callee.object)
    const results: EvalCase[] = []
    for (const targetCase of targetCases) {
      const target = expectString(targetCase.value)
      if (expression.args.length < 1 || expression.args.length > 2) throw new Error('String.slice expects 1 or 2 arguments')
      const startCases = analyzer.evalExpression(targetCase.state, expression.args[0]!)
      for (const startCase of startCases) {
        const start = expectConcreteNumber(startCase.value)
        const endArg = expression.args[1]
        if (endArg == null) {
          results.push({
            state: startCase.state,
            value: concreteString(target.value.slice(start)),
          })
          continue
        }
        for (const endCase of analyzer.evalExpression(startCase.state, endArg)) {
          const end = expectConcreteNumber(endCase.value)
          results.push({
            state: endCase.state,
            value: concreteString(target.value.slice(start, end)),
          })
        }
      }
    }
    return results
  }

  if (expression.callee.kind === 'property' && expression.callee.property === 'map') {
    if (expression.args.length < 1) throw new Error('Array.map expects a callback')
    const callbackCases = analyzer.evalExpression(state, expression.args[0]!)
    const targetCases = analyzer.evalExpression(state, expression.callee.object)
    const results: EvalCase[] = []
    for (const targetCase of targetCases) {
      const array = expectArray(targetCase.value)
      for (const callbackCase of callbackCases) {
        const callback = expectFunction(callbackCase.value)
        let currentState = targetCase.state
        const mappedItems: Value[] = []
        for (let i = 0; i < array.items.length; i++) {
          const callbackReturns = invokeConcreteFunctionValue(analyzer, currentState, callback, [
            array.items[i]!,
            concreteNumber(i),
          ])
          if (callbackReturns.length !== 1) throw new Error('Concrete array.map callback must resolve to 1 case')
          currentState = callbackReturns[0]!.state
          mappedItems.push(callbackReturns[0]!.value)
        }
        results.push({
          state: currentState,
          value: concreteArray(mappedItems),
        })
      }
    }
    return results
  }

  let argumentCases: Array<{state: EvalState; values: Value[]}> = [{state, values: []}]
  for (const argument of expression.args) {
    const nextArgumentCases: Array<{state: EvalState; values: Value[]}> = []
    for (const argumentCase of argumentCases) {
      for (const evaluated of analyzer.evalExpression(argumentCase.state, argument)) {
        nextArgumentCases.push({
          state: evaluated.state,
          values: [...argumentCase.values, evaluated.value],
        })
      }
    }
    argumentCases = nextArgumentCases
  }

  const callee = expression.callee
  if (callee.kind === 'property' && callee.object.kind === 'identifier' && callee.object.name === 'Math') {
    return argumentCases.map(argumentCase => ({
      state: argumentCase.state,
      value: evaluateMathCall(callee.property, argumentCase.values, argumentCase.state.mode),
    }))
  }

  if (callee.kind === 'identifier') {
    const override = analyzer['overrides'][callee.name]?.evaluate
    const results: EvalCase[] = []
    for (const argumentCase of argumentCases) {
      const returnedCases =
        override != null
          ? override(argumentCase.values, argumentCase.state.mode, {analyzer, state: argumentCase.state})
          : analyzer.evaluateFunction(callee.name, argumentCase.values, argumentCase.state.mode)
      for (const returned of returnedCases) {
        results.push({
          state: {
            ...argumentCase.state,
            constraints: override != null ? returned.constraints : [...argumentCase.state.constraints, ...returned.constraints],
            env: override != null ? (returned.env ?? argumentCase.state.env) : argumentCase.state.env,
          },
          value: returned.value,
        })
      }
    }
    return results
  }

  throw new Error('Unsupported call expression')
}

function evaluateRangeCallExpression(analyzer: LoweredProgramAnalyzer, state: RangeState, expression: Extract<IrExpression, {kind: 'call'}>): RangeEvalCase[] {
  if (expression.callee.kind === 'property' && expression.callee.property === 'at') {
    const targetCases = analyzer.evalRangeExpression(state, expression.callee.object)
    const results: RangeEvalCase[] = []
    for (const targetCase of targetCases) {
      const array = expectRangeArray(targetCase.value)
      if (expression.args.length !== 1) throw new Error('Array.at expects exactly 1 argument')
      for (const evaluatedIndex of analyzer.evalRangeExpression(targetCase.state, expression.args[0]!)) {
        results.push({
          state: evaluatedIndex.state,
          value: getRangeArrayItemAt(array, expectRangeNumber(evaluatedIndex.value)),
        })
      }
    }
    return results
  }

  if (expression.callee.kind === 'property' && expression.callee.property === 'push') {
    const targetExpression = expression.callee.object
    if (targetExpression.kind !== 'identifier') throw new Error('Only identifier.push(...) is supported in range mode')
    let activeStates: RangeState[] = [state]
    for (const argument of expression.args) {
      const nextStates: RangeState[] = []
      for (const activeState of activeStates) {
        for (const evaluated of analyzer.evalRangeExpression(activeState, argument)) {
          const currentArray = expectRangeArray(evaluated.state.env.get(targetExpression.name) ?? unsupported(`Unknown array identifier ${targetExpression.name}`))
          const env = new Map(evaluated.state.env)
          env.set(targetExpression.name, appendRangeArrayItem(currentArray, evaluated.value))
          nextStates.push({env})
        }
      }
      activeStates = nextStates
    }
    return activeStates.map(activeState => ({
      state: activeState,
      value: rangeNumber(
        expectRangeArray(activeState.env.get(targetExpression.name)!).lengthMin,
        expectRangeArray(activeState.env.get(targetExpression.name)!).lengthMax,
        true,
      ),
    }))
  }

  if (expression.callee.kind === 'property' && expression.callee.property === 'map') {
    if (expression.args.length < 1) throw new Error('Array.map expects a callback')
    const callbackCases = analyzer.evalRangeExpression(state, expression.args[0]!)
    const targetCases = analyzer.evalRangeExpression(state, expression.callee.object)
    const results: RangeEvalCase[] = []
    for (const targetCase of targetCases) {
      const array = expectRangeArray(targetCase.value)
      if (array.items == null) throw new Error('Range array.map expects exact array items')
      for (const callbackCase of callbackCases) {
        const mappedItems: RangeValue[] = []
        for (let i = 0; i < array.items.length; i++) {
          const callbackReturns = invokeRangeFunctionValue(analyzer, targetCase.state, callbackCase.value, [
            array.items[i]!,
            rangeNumber(i, i, true),
          ])
          if (callbackReturns.length !== 1) throw new Error('Range array.map callback must resolve to 1 case')
          mappedItems.push(callbackReturns[0]!.value)
        }
        results.push({
          state: targetCase.state,
          value: rangeArray(mappedItems),
        })
      }
    }
    return results
  }

  let argumentCases: Array<{state: RangeState; values: RangeValue[]}> = [{state, values: []}]
  for (const argument of expression.args) {
    const nextArgumentCases: Array<{state: RangeState; values: RangeValue[]}> = []
    for (const argumentCase of argumentCases) {
      for (const evaluated of analyzer.evalRangeExpression(argumentCase.state, argument)) {
        nextArgumentCases.push({
          state: evaluated.state,
          values: [...argumentCase.values, evaluated.value],
        })
      }
    }
    argumentCases = nextArgumentCases
  }

  const callee = expression.callee
  if (callee.kind === 'property' && callee.object.kind === 'identifier' && callee.object.name === 'Math') {
    return argumentCases.map(argumentCase => ({
      state: argumentCase.state,
      value: evaluateRangeMathCall(callee.property, argumentCase.values),
    }))
  }

  if (callee.kind === 'identifier') {
    const override = analyzer['overrides'][callee.name]?.evaluateRange
    const results: RangeEvalCase[] = []
    for (const argumentCase of argumentCases) {
      const returnedCases =
        override != null
          ? override(argumentCase.values, {analyzer, state: argumentCase.state})
          : analyzer.evaluateFunctionRange(callee.name, argumentCase.values)
      for (const returned of returnedCases) {
        results.push({
          state: argumentCase.state,
          value: returned.value,
        })
      }
    }
    return results
  }

  throw new Error('Unsupported range call expression')
}

// Math intrinsics

function evaluateMathCall(name: string, args: Value[], mode: Mode): Value {
  const numbers = args.map(arg => expectNumber(arg))
  if (mode === 'symbolic') throw new Error(`Math.${name} is not supported in symbolic mode yet`)
  const values = numbers.map(number => expectConcreteNumberValue(number))
  switch (name) {
    case 'floor':
      if (values.length !== 1) throw new Error('Math.floor expects 1 argument')
      return concreteNumber(Math.floor(values[0]!))
    case 'ceil':
      if (values.length !== 1) throw new Error('Math.ceil expects 1 argument')
      return concreteNumber(Math.ceil(values[0]!))
    case 'sqrt':
      if (values.length !== 1) throw new Error('Math.sqrt expects 1 argument')
      return concreteNumber(Math.sqrt(values[0]!))
    case 'min':
      return concreteNumber(Math.min(...values))
    case 'max':
      return concreteNumber(Math.max(...values))
    default:
      throw new Error(`Unsupported Math call: Math.${name}`)
  }
}

function evaluateRangeMathCall(name: string, args: RangeValue[]): RangeValue {
  const numbers = args.map(arg => expectRangeNumber(arg))
  switch (name) {
    case 'floor': {
      if (numbers.length !== 1) throw new Error('Math.floor expects 1 argument')
      const value = numbers[0]!
      return rangeNumber(Math.floor(value.min), Math.floor(value.max), true)
    }
    case 'ceil': {
      if (numbers.length !== 1) throw new Error('Math.ceil expects 1 argument')
      const value = numbers[0]!
      return rangeNumber(Math.ceil(value.min), Math.ceil(value.max), true)
    }
    case 'sqrt': {
      if (numbers.length !== 1) throw new Error('Math.sqrt expects 1 argument')
      const value = numbers[0]!
      if (value.min < 0) throw new Error('Math.sqrt of a possibly-negative range')
      return rangeNumber(Math.sqrt(value.min), Math.sqrt(value.max), false)
    }
    case 'min': {
      if (numbers.length === 0) throw new Error('Math.min expects at least 1 argument')
      let current = numbers[0]!
      for (let i = 1; i < numbers.length; i++) current = minRangeNumber(current, numbers[i]!)
      return current
    }
    case 'max': {
      if (numbers.length === 0) throw new Error('Math.max expects at least 1 argument')
      let current = numbers[0]!
      for (let i = 1; i < numbers.length; i++) current = maxRangeNumber(current, numbers[i]!)
      return current
    }
    default:
      throw new Error(`Unsupported range Math call: Math.${name}`)
  }
}

// Helpers

function withConstraint(state: EvalState, constraint: BoolExpr): EvalState {
  return {
    ...state,
    constraints: [...state.constraints, constraint],
  }
}

function unsupported(message: string): never {
  throw new Error(message)
}
