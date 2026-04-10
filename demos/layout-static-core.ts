import * as ts from 'typescript'

export type WitnessValue = boolean | number | string | null

export type StaticLayoutLawWitness = Record<string, WitnessValue>

export type StaticLayoutLawSummary = {
  name: string
  checks: number
  status: 'pass' | 'fail'
  firstFailure?: StaticLayoutLawWitness
}

export type StaticLayoutVerificationReport = {
  phase: 'ready' | 'error'
  suite: string
  analyzedFile: string
  laws: StaticLayoutLawSummary[]
}

export type InternalLawSummary = {
  name: string
  checks: number
  firstFailure: StaticLayoutLawWitness | null
}

export type Mode = 'concrete' | 'symbolic'
export type ComparisonOp = '>' | '>=' | '<' | '<=' | '===' | '!=='

export type ScalarExpr =
  | {kind: 'const'; value: number}
  | {kind: 'var'; name: string}
  | {kind: 'add'; left: ScalarExpr; right: ScalarExpr}
  | {kind: 'sub'; left: ScalarExpr; right: ScalarExpr}
  | {kind: 'mul'; left: ScalarExpr; right: ScalarExpr}
  | {kind: 'div'; left: ScalarExpr; right: ScalarExpr}

export type BoolExpr = {
  kind: 'compare'
  op: ComparisonOp
  left: ScalarExpr
  right: ScalarExpr
}

export type NumberValue =
  | {kind: 'number'; mode: 'concrete'; value: number}
  | {kind: 'number'; mode: 'symbolic'; expr: ScalarExpr}

export type StringValue = {
  kind: 'string'
  mode: 'concrete'
  value: string
}

export type BooleanValue =
  | {kind: 'boolean'; mode: 'concrete'; value: boolean}
  | {kind: 'boolean'; mode: 'symbolic'; expr: BoolExpr}

export type ObjectValue = {
  kind: 'object'
  mode: Mode
  props: Record<string, Value>
}

export type ArrayValue = {
  kind: 'array'
  mode: 'concrete'
  items: Value[]
}

type InlineFunction = {
  params: string[]
  entryBlockId: string
  blocks: Map<string, IrBlock>
}

type FunctionValue = {
  kind: 'function'
  mode: 'concrete'
  fn: InlineFunction
  closure: Map<string, Value>
}

export type OpaqueValue = {
  kind: 'opaque'
  mode: Mode
  label: string
}

export type NullValue = {
  kind: 'null'
  mode: Mode
}

export type Value = NumberValue | StringValue | BooleanValue | ObjectValue | ArrayValue | FunctionValue | OpaqueValue | NullValue

export type RangeTruth = 'always-true' | 'always-false' | 'maybe'

export type RangeNumberValue = {
  kind: 'range-number'
  min: number
  max: number
  isInteger: boolean
}

export type RangeBooleanValue = {
  kind: 'range-boolean'
  truth: RangeTruth
}

export type RangeObjectValue = {
  kind: 'range-object'
  props: Record<string, RangeValue>
}

export type RangeOpaqueValue = {
  kind: 'range-opaque'
  label: string
}

export type RangeNullValue = {
  kind: 'range-null'
}

export type RangeValue = RangeNumberValue | RangeBooleanValue | RangeObjectValue | RangeOpaqueValue | RangeNullValue

export type FunctionOverride = {
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

type IrBindingName =
  | {kind: 'identifier'; name: string}
  | {kind: 'object'; elements: Array<{key: string; name: IrBindingName}>}

type IrProgram = {
  functions: Map<string, IrFunction>
  globals: Map<string, number>
}

type IrFunction = InlineFunction & {
  name: string
}

type IrBlock = {
  id: string
  instructions: IrInstruction[]
  terminator: IrTerminator
}

type MutableIrBlock = {
  id: string
  instructions: IrInstruction[]
  terminator: IrTerminator | null
}

type IrInstruction =
  | {kind: 'declare'; declarations: Array<{name: IrBindingName; initializer: IrExpression}>}
  | {kind: 'expression'; expression: IrExpression}

type IrTerminator =
  | {kind: 'return'; expression: IrExpression}
  | {kind: 'goto'; targetBlockId: string}
  | {kind: 'branch'; condition: IrExpression; thenBlockId: string; elseBlockId: string}
  | {kind: 'end'}

type IrExpression =
  | {kind: 'number'; value: number}
  | {kind: 'string'; value: string}
  | {kind: 'boolean'; value: boolean}
  | {kind: 'null'}
  | {kind: 'identifier'; name: string}
  | {kind: 'prefix'; operator: '+' | '-'; operand: IrExpression}
  | {kind: 'postfix-update'; target: string; operator: '++' | '--'}
  | {kind: 'array'; items: IrExpression[]}
  | {kind: 'property'; object: IrExpression; property: string}
  | {kind: 'index'; object: IrExpression; index: IrExpression}
  | {kind: 'binary'; operator: IrBinaryOperator; left: IrExpression; right: IrExpression}
  | {kind: 'conditional'; condition: IrExpression; whenTrue: IrExpression; whenFalse: IrExpression}
  | {kind: 'object'; properties: IrObjectProperty[]}
  | {kind: 'call'; callee: IrCallee; args: IrExpression[]}
  | {kind: 'arrow'; fn: InlineFunction}
  | {kind: 'assign'; target: string; operator: '=' | '+=' | '-='; value: IrExpression}

type IrBinaryOperator =
  | '+'
  | '-'
  | '*'
  | '/'
  | '%'
  | '??'
  | '>'
  | '>='
  | '<'
  | '<='
  | '=='
  | '!='
  | '==='
  | '!=='
  | '||'
  | '&&'

type IrObjectProperty =
  | {kind: 'property'; name: string; value: IrExpression}
  | {kind: 'spread'; value: IrExpression}

type IrCallee =
  | {kind: 'identifier'; name: string}
  | {kind: 'property'; object: IrExpression; property: string}

export const epsilon = 0.0001

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
            kind: 'function',
            mode: 'concrete',
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
        throw new Error('Range strings are not supported yet')
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
      case 'property': {
        const targetCases = this.evalRangeExpression(state, expression.object)
        return targetCases.map(result => ({
          state: result.state,
          value: getRangeProp(expectRangeObject(result.value), expression.property),
        }))
      }
      case 'binary':
        return combineRangeBinaryCases(this, state, expression)
      case 'conditional': {
        const conditionCases = this.evalRangeExpression(state, expression.condition)
        const results: RangeEvalCase[] = []
        for (const conditionCase of conditionCases) {
          const condition = expectRangeBoolean(conditionCase.value)
          if (condition.truth !== 'always-false') {
            results.push(...this.evalRangeExpression(conditionCase.state, expression.whenTrue))
          }
          if (condition.truth !== 'always-true') {
            results.push(...this.evalRangeExpression(conditionCase.state, expression.whenFalse))
          }
        }
        return results
      }
      case 'object': {
        let cases: Array<{state: RangeState; props: Record<string, RangeValue>}> = [{state, props: {}}]
        for (const property of expression.properties) {
          if (property.kind === 'spread') {
            throw new Error('Spread in range object literals is not supported yet')
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
      default:
        throw new Error(`Unsupported range expression kind: ${expression.kind}`)
    }
  }
}

export function check(
  laws: Map<string, InternalLawSummary>,
  name: string,
  passed: boolean,
  witness: () => StaticLayoutLawWitness,
) {
  let law = laws.get(name)
  if (law == null) {
    law = {name, checks: 0, firstFailure: null}
    laws.set(name, law)
  }
  law.checks++
  if (!passed && law.firstFailure == null) law.firstFailure = witness()
}

export function summarizeLaws(laws: Map<string, InternalLawSummary>): StaticLayoutLawSummary[] {
  return [...laws.values()].map(law => ({
    name: law.name,
    checks: law.checks,
    status: law.firstFailure == null ? 'pass' : 'fail',
    ...(law.firstFailure == null ? {} : {firstFailure: law.firstFailure}),
  }))
}

export function buildStaticLayoutReport(suite: string, analyzedFile: string, laws: Map<string, InternalLawSummary>): StaticLayoutVerificationReport {
  const lawSummaries = summarizeLaws(laws)
  return {
    phase: lawSummaries.some(law => law.status === 'fail') ? 'error' : 'ready',
    suite,
    analyzedFile,
    laws: lawSummaries,
  }
}

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

function lowerSourceProgram(sourceText: string, externalGlobals: Record<string, number>, includeFunctions: string[] | null): IrProgram {
  const sourceFile = ts.createSourceFile('layout-source.ts', sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  const globals = new Map<string, number>()
  const functions = new Map<string, IrFunction>()
  const allowedFunctions = includeFunctions == null ? null : new Set(includeFunctions)

  for (const statement of sourceFile.statements) {
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (!ts.isIdentifier(declaration.name) || declaration.initializer == null) continue
        const value = evaluateConstNumber(declaration.initializer, globals)
        if (value != null) globals.set(declaration.name.text, value)
      }
      continue
    }

    if (ts.isFunctionDeclaration(statement) && statement.name != null && statement.body != null) {
      if (allowedFunctions != null && !allowedFunctions.has(statement.name.text)) continue
      functions.set(statement.name.text, lowerFunction(statement.name.text, statement.parameters, statement.body.statements))
    }
  }

  for (const [name, value] of Object.entries(externalGlobals)) globals.set(name, value)
  return {functions, globals}
}

function lowerFunction(name: string, parameters: ts.NodeArray<ts.ParameterDeclaration>, statements: ts.NodeArray<ts.Statement>): IrFunction {
  const context = new LoweringContext()
  const entryBlockId = context.createBlock('entry')
  const parameterNames = parameters.map(parameter => {
    if (!ts.isIdentifier(parameter.name)) throw new Error(`Unsupported parameter pattern in ${name}`)
    return parameter.name.text
  })
  const finalBlockId = lowerStatementsInto(context, entryBlockId, statements, null, null)
  if (finalBlockId != null) ensureBlockTerminator(context, finalBlockId, {kind: 'end'})
  return {
    name,
    params: parameterNames,
    entryBlockId,
    blocks: context.finalize(),
  }
}

function lowerInlineFunction(parameters: ts.NodeArray<ts.ParameterDeclaration>, body: ts.ConciseBody): InlineFunction {
  const context = new LoweringContext()
  const entryBlockId = context.createBlock('inline_entry')
  const params = parameters.map(parameter => {
    if (!ts.isIdentifier(parameter.name)) throw new Error('Only identifier inline parameters are supported')
    return parameter.name.text
  })
  if (ts.isBlock(body)) {
    const finalBlockId = lowerStatementsInto(context, entryBlockId, body.statements, null, null)
    if (finalBlockId != null) ensureBlockTerminator(context, finalBlockId, {kind: 'end'})
  } else {
    context.getBlock(entryBlockId).terminator = {kind: 'return', expression: lowerExpression(body)}
  }
  return {
    params,
    entryBlockId,
    blocks: context.finalize(),
  }
}

class LoweringContext {
  private nextBlockId = 0
  private readonly blocks = new Map<string, MutableIrBlock>()

  createBlock(prefix: string) {
    const id = `${prefix}_${this.nextBlockId++}`
    this.blocks.set(id, {id, instructions: [], terminator: null})
    return id
  }

  getBlock(id: string) {
    const block = this.blocks.get(id)
    if (block == null) throw new Error(`Unknown block ${id}`)
    return block
  }

  finalize() {
    const finalized = new Map<string, IrBlock>()
    for (const [id, block] of this.blocks) {
      finalized.set(id, {
        id,
        instructions: block.instructions,
        terminator: block.terminator ?? {kind: 'end'},
      })
    }
    return finalized
  }
}

function lowerStatementsInto(
  context: LoweringContext,
  initialBlockId: string | null,
  statements: readonly ts.Statement[],
  breakTargetBlockId: string | null,
  continueTargetBlockId: string | null,
): string | null {
  let currentBlockId = initialBlockId
  for (const statement of statements) {
    if (currentBlockId == null) break
    currentBlockId = lowerStatementInto(context, currentBlockId, statement, breakTargetBlockId, continueTargetBlockId)
  }
  return currentBlockId
}

function lowerStatementInto(
  context: LoweringContext,
  currentBlockId: string,
  statement: ts.Statement,
  breakTargetBlockId: string | null,
  continueTargetBlockId: string | null,
): string | null {
  const block = context.getBlock(currentBlockId)

  if (ts.isVariableStatement(statement)) {
    block.instructions.push({
      kind: 'declare',
      declarations: statement.declarationList.declarations.map(declaration => {
        if (declaration.initializer == null) throw new Error('Only initialized declarations are supported')
        return {
          name: lowerBindingName(declaration.name),
          initializer: lowerExpression(declaration.initializer),
        }
      }),
    })
    return currentBlockId
  }

  if (ts.isExpressionStatement(statement)) {
    block.instructions.push({
      kind: 'expression',
      expression: lowerExpression(statement.expression),
    })
    return currentBlockId
  }

  if (ts.isReturnStatement(statement)) {
    if (statement.expression == null) throw new Error('Bare return is not supported')
    ensureBlockTerminator(context, currentBlockId, {kind: 'return', expression: lowerExpression(statement.expression)})
    return null
  }

  if (ts.isBlock(statement)) {
    return lowerStatementsInto(context, currentBlockId, statement.statements, breakTargetBlockId, continueTargetBlockId)
  }

  if (ts.isIfStatement(statement)) {
    const thenBlockId = context.createBlock('if_then')
    const elseBlockId = context.createBlock('if_else')
    const joinBlockId = context.createBlock('if_join')

    ensureBlockTerminator(context, currentBlockId, {
      kind: 'branch',
      condition: lowerExpression(statement.expression),
      thenBlockId,
      elseBlockId,
    })

    const thenExit = lowerStatementInto(context, thenBlockId, statement.thenStatement, breakTargetBlockId, continueTargetBlockId)
    if (thenExit != null) ensureBlockTerminator(context, thenExit, {kind: 'goto', targetBlockId: joinBlockId})

    const elseExit =
      statement.elseStatement == null
        ? elseBlockId
        : lowerStatementInto(context, elseBlockId, statement.elseStatement, breakTargetBlockId, continueTargetBlockId)
    if (elseExit != null) ensureBlockTerminator(context, elseExit, {kind: 'goto', targetBlockId: joinBlockId})

    return joinBlockId
  }

  if (ts.isSwitchStatement(statement)) {
    const afterSwitchBlockId = context.createBlock('switch_after')
    const defaultClause = statement.caseBlock.clauses.find(clause => ts.isDefaultClause(clause)) ?? null
    const caseClauses = statement.caseBlock.clauses.filter(clause => ts.isCaseClause(clause))
    let currentTestBlockId = currentBlockId

    for (let i = 0; i < caseClauses.length; i++) {
      const clause = caseClauses[i]!
      const clauseBlockId = context.createBlock('switch_case')
      const nextTestBlockId =
        i === caseClauses.length - 1
          ? defaultClause == null ? afterSwitchBlockId : context.createBlock('switch_default_test')
          : context.createBlock('switch_test')
      ensureBlockTerminator(context, currentTestBlockId, {
        kind: 'branch',
        condition: {
          kind: 'binary',
          operator: '===',
          left: lowerExpression(statement.expression),
          right: lowerExpression(clause.expression),
        },
        thenBlockId: clauseBlockId,
        elseBlockId: nextTestBlockId,
      })

      const clauseExit = lowerStatementsInto(context, clauseBlockId, stripTrailingCaseBreak(clause.statements), afterSwitchBlockId, continueTargetBlockId)
      if (clauseExit != null) ensureBlockTerminator(context, clauseExit, {kind: 'goto', targetBlockId: afterSwitchBlockId})
      currentTestBlockId = nextTestBlockId
    }

    if (defaultClause != null) {
      const defaultBlockId = context.createBlock('switch_default')
      ensureBlockTerminator(context, currentTestBlockId, {kind: 'goto', targetBlockId: defaultBlockId})
      const defaultExit = lowerStatementsInto(context, defaultBlockId, stripTrailingCaseBreak(defaultClause.statements), afterSwitchBlockId, continueTargetBlockId)
      if (defaultExit != null) ensureBlockTerminator(context, defaultExit, {kind: 'goto', targetBlockId: afterSwitchBlockId})
    } else if (caseClauses.length === 0) {
      ensureBlockTerminator(context, currentBlockId, {kind: 'goto', targetBlockId: afterSwitchBlockId})
    }

    return afterSwitchBlockId
  }

  if (ts.isForStatement(statement)) {
    if (statement.initializer != null) {
      if (ts.isVariableDeclarationList(statement.initializer)) {
        context.getBlock(currentBlockId).instructions.push({
          kind: 'declare',
          declarations: statement.initializer.declarations.map(declaration => {
            if (declaration.initializer == null) throw new Error('Only initialized for declarations are supported')
            return {
              name: lowerBindingName(declaration.name),
              initializer: lowerExpression(declaration.initializer),
            }
          }),
        })
      } else {
        context.getBlock(currentBlockId).instructions.push({
          kind: 'expression',
          expression: lowerExpression(statement.initializer),
        })
      }
    }

    const conditionBlockId = context.createBlock('for_condition')
    const bodyBlockId = context.createBlock('for_body')
    const incrementBlockId = context.createBlock('for_increment')
    const afterBlockId = context.createBlock('for_after')

    ensureBlockTerminator(context, currentBlockId, {kind: 'goto', targetBlockId: conditionBlockId})

    const conditionBlock = context.getBlock(conditionBlockId)
    conditionBlock.terminator =
      statement.condition == null
        ? {kind: 'goto', targetBlockId: bodyBlockId}
        : {
            kind: 'branch',
            condition: lowerExpression(statement.condition),
            thenBlockId: bodyBlockId,
            elseBlockId: afterBlockId,
          }

    const bodyExit = lowerStatementInto(context, bodyBlockId, statement.statement, afterBlockId, incrementBlockId)
    if (bodyExit != null) ensureBlockTerminator(context, bodyExit, {kind: 'goto', targetBlockId: incrementBlockId})

    const incrementBlock = context.getBlock(incrementBlockId)
    if (statement.incrementor != null) {
      incrementBlock.instructions.push({
        kind: 'expression',
        expression: lowerExpression(statement.incrementor),
      })
    }
    incrementBlock.terminator = {kind: 'goto', targetBlockId: conditionBlockId}
    return afterBlockId
  }

  if (ts.isWhileStatement(statement)) {
    const conditionBlockId = context.createBlock('while_condition')
    const bodyBlockId = context.createBlock('while_body')
    const afterBlockId = context.createBlock('while_after')

    ensureBlockTerminator(context, currentBlockId, {kind: 'goto', targetBlockId: conditionBlockId})

    const conditionBlock = context.getBlock(conditionBlockId)
    conditionBlock.terminator = {
      kind: 'branch',
      condition: lowerExpression(statement.expression),
      thenBlockId: bodyBlockId,
      elseBlockId: afterBlockId,
    }

    const bodyExit = lowerStatementInto(context, bodyBlockId, statement.statement, afterBlockId, conditionBlockId)
    if (bodyExit != null) ensureBlockTerminator(context, bodyExit, {kind: 'goto', targetBlockId: conditionBlockId})
    return afterBlockId
  }

  if (ts.isBreakStatement(statement)) {
    if (breakTargetBlockId == null) throw new Error('Break statement is only supported inside loop/switch lowering')
    ensureBlockTerminator(context, currentBlockId, {kind: 'goto', targetBlockId: breakTargetBlockId})
    return null
  }

  if (ts.isContinueStatement(statement)) {
    if (continueTargetBlockId == null) throw new Error('Continue statement is only supported inside loop lowering')
    ensureBlockTerminator(context, currentBlockId, {kind: 'goto', targetBlockId: continueTargetBlockId})
    return null
  }

  throw new Error(`Unsupported statement kind while lowering: ${ts.SyntaxKind[statement.kind]}`)
}

function stripTrailingCaseBreak(statements: readonly ts.Statement[]) {
  if (statements.length === 0) return statements
  const last = statements[statements.length - 1]!
  return ts.isBreakStatement(last) ? statements.slice(0, -1) : statements
}

function ensureBlockTerminator(context: LoweringContext, blockId: string, terminator: IrTerminator) {
  const block = context.getBlock(blockId)
  if (block.terminator != null) throw new Error(`Block ${blockId} already has a terminator`)
  block.terminator = terminator
}

function lowerBindingName(name: ts.BindingName): IrBindingName {
  if (ts.isIdentifier(name)) return {kind: 'identifier', name: name.text}
  if (ts.isObjectBindingPattern(name)) {
    return {
      kind: 'object',
      elements: name.elements.map(element => {
        if (element.dotDotDotToken != null) throw new Error('Rest object binding is not supported')
        const key =
          element.propertyName == null
            ? ts.isIdentifier(element.name) ? element.name.text : unsupported('Nested object binding without property name is not supported')
            : getPropertyName(element.propertyName)
        return {key, name: lowerBindingName(element.name)}
      }),
    }
  }
  throw new Error(`Unsupported binding pattern: ${ts.SyntaxKind[name.kind]}`)
}

function lowerExpression(expression: ts.Expression): IrExpression {
  if (ts.isParenthesizedExpression(expression)) return lowerExpression(expression.expression)
  if (ts.isNonNullExpression(expression)) return lowerExpression(expression.expression)
  if (ts.isAsExpression(expression)) return lowerExpression(expression.expression)
  if (ts.isSatisfiesExpression(expression)) return lowerExpression(expression.expression)
  if (ts.isNumericLiteral(expression)) return {kind: 'number', value: Number(expression.text)}
  if (ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression)) return {kind: 'string', value: expression.text}
  if (expression.kind === ts.SyntaxKind.NullKeyword) return {kind: 'null'}
  if (expression.kind === ts.SyntaxKind.TrueKeyword) return {kind: 'boolean', value: true}
  if (expression.kind === ts.SyntaxKind.FalseKeyword) return {kind: 'boolean', value: false}
  if (ts.isIdentifier(expression)) return {kind: 'identifier', name: expression.text}
  if (ts.isPrefixUnaryExpression(expression)) {
    if (expression.operator !== ts.SyntaxKind.MinusToken && expression.operator !== ts.SyntaxKind.PlusToken) {
      throw new Error(`Unsupported unary operator: ${ts.tokenToString(expression.operator)}`)
    }
    return {
      kind: 'prefix',
      operator: expression.operator === ts.SyntaxKind.MinusToken ? '-' : '+',
      operand: lowerExpression(expression.operand),
    }
  }
  if (ts.isPostfixUnaryExpression(expression)) {
    if (!ts.isIdentifier(expression.operand)) throw new Error('Only identifier postfix expressions are supported')
    return {
      kind: 'postfix-update',
      target: expression.operand.text,
      operator: expression.operator === ts.SyntaxKind.PlusPlusToken ? '++' : '--',
    }
  }
  if (ts.isArrayLiteralExpression(expression)) {
    if (expression.elements.some(element => ts.isSpreadElement(element))) throw new Error('Array spread is not supported yet')
    return {
      kind: 'array',
      items: expression.elements.map(element => lowerExpression(element)),
    }
  }
  if (ts.isPropertyAccessChain(expression)) {
    const object = lowerExpression(expression.expression)
    return {
      kind: 'conditional',
      condition: {
        kind: 'binary',
        operator: '==',
        left: object,
        right: {kind: 'null'},
      },
      whenTrue: {kind: 'null'},
      whenFalse: {
        kind: 'property',
        object,
        property: expression.name.text,
      },
    }
  }
  if (ts.isPropertyAccessExpression(expression)) {
    return {
      kind: 'property',
      object: lowerExpression(expression.expression),
      property: expression.name.text,
    }
  }
  if (ts.isElementAccessExpression(expression)) {
    return {
      kind: 'index',
      object: lowerExpression(expression.expression),
      index: lowerExpression(expression.argumentExpression),
    }
  }
  if (ts.isBinaryExpression(expression)) {
    if (isAssignmentToken(expression.operatorToken.kind)) {
      if (!ts.isIdentifier(expression.left)) throw new Error('Only identifier assignments are supported')
      return {
        kind: 'assign',
        target: expression.left.text,
        operator: assignmentTokenToOperator(expression.operatorToken.kind),
        value: lowerExpression(expression.right),
      }
    }
    return {
      kind: 'binary',
      operator: binaryTokenToOperator(expression.operatorToken.kind),
      left: lowerExpression(expression.left),
      right: lowerExpression(expression.right),
    }
  }
  if (ts.isConditionalExpression(expression)) {
    return {
      kind: 'conditional',
      condition: lowerExpression(expression.condition),
      whenTrue: lowerExpression(expression.whenTrue),
      whenFalse: lowerExpression(expression.whenFalse),
    }
  }
  if (ts.isObjectLiteralExpression(expression)) {
    return {
      kind: 'object',
      properties: expression.properties.map(property => {
        if (ts.isSpreadAssignment(property)) return {kind: 'spread', value: lowerExpression(property.expression)} satisfies IrObjectProperty
        if (ts.isShorthandPropertyAssignment(property)) {
          return {
            kind: 'property',
            name: property.name.text,
            value: lowerExpression(property.name),
          } satisfies IrObjectProperty
        }
        if (ts.isPropertyAssignment(property)) {
          return {
            kind: 'property',
            name: getPropertyName(property.name),
            value: lowerExpression(property.initializer),
          } satisfies IrObjectProperty
        }
        throw new Error(`Unsupported object property kind: ${ts.SyntaxKind[property.kind]}`)
      }),
    }
  }
  if (ts.isCallExpression(expression)) {
    return {
      kind: 'call',
      callee: lowerCallee(expression.expression),
      args: expression.arguments.map(argument => lowerExpression(argument)),
    }
  }
  if (ts.isArrowFunction(expression)) {
    return {
      kind: 'arrow',
      fn: lowerInlineFunction(expression.parameters, expression.body),
    }
  }
  throw new Error(`Unsupported expression kind while lowering: ${ts.SyntaxKind[expression.kind]}`)
}

function lowerCallee(expression: ts.LeftHandSideExpression): IrCallee {
  if (ts.isIdentifier(expression)) return {kind: 'identifier', name: expression.text}
  if (ts.isPropertyAccessExpression(expression)) {
    return {
      kind: 'property',
      object: lowerExpression(expression.expression),
      property: expression.name.text,
    }
  }
  throw new Error(`Unsupported call expression: ${expression.getText()}`)
}

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
              worklist.push({blockId: block.terminator.thenBlockId, state: conditionCase.state})
            }
            if (condition.truth !== 'always-true') {
              worklist.push({blockId: block.terminator.elseBlockId, state: conditionCase.state})
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
  if (instruction.kind !== 'declare') {
    throw new Error('Range execution only supports declarations right now')
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
        expression.operator === '%'
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
    if (expression.operator === '??') throw new Error('Range nullish coalescing is not supported yet')
    const rightCases = analyzer.evalRangeExpression(leftCase.state, expression.right)
    for (const rightCase of rightCases) {
      if (
        expression.operator === '+' ||
        expression.operator === '-' ||
        expression.operator === '*' ||
        expression.operator === '/'
      ) {
        results.push({
          state: rightCase.state,
          value: applyRangeNumericOperator(expectRangeNumber(leftCase.value), expectRangeNumber(rightCase.value), expression.operator),
        })
        continue
      }

      if (
        expression.operator === '>' ||
        expression.operator === '>=' ||
        expression.operator === '<' ||
        expression.operator === '<=' ||
        expression.operator === '===' ||
        expression.operator === '!=='
      ) {
        results.push({
          state: rightCase.state,
          value: rangeBoolean(compareRangeNumbers(expectRangeNumber(leftCase.value), expectRangeNumber(rightCase.value), expression.operator)),
        })
        continue
      }

      throw new Error(`Unsupported range binary operator: ${expression.operator}`)
    }
  }
  return results
}

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

function evaluateMathCall(name: string, args: Value[], mode: Mode): Value {
  const numbers = args.map(arg => expectNumber(arg))
  if (mode === 'symbolic') throw new Error(`Math.${name} is not supported in symbolic mode yet`)
  const values = numbers.map(number => expectConcreteNumberValue(number))
  switch (name) {
    case 'floor':
      if (values.length !== 1) throw new Error('Math.floor expects 1 argument')
      return concreteNumber(Math.floor(values[0]!))
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

function evaluateConstNumber(expression: ts.Expression, globals: Map<string, number>): number | null {
  if (ts.isParenthesizedExpression(expression)) return evaluateConstNumber(expression.expression, globals)
  if (ts.isAsExpression(expression)) return evaluateConstNumber(expression.expression, globals)
  if (ts.isSatisfiesExpression(expression)) return evaluateConstNumber(expression.expression, globals)
  if (ts.isNumericLiteral(expression)) return Number(expression.text)
  if (ts.isIdentifier(expression)) return globals.get(expression.text) ?? null
  if (ts.isPrefixUnaryExpression(expression) && expression.operator === ts.SyntaxKind.MinusToken) {
    const operand = evaluateConstNumber(expression.operand, globals)
    return operand == null ? null : -operand
  }
  return null
}

function applyNumericOperator(left: NumberValue, right: NumberValue, operator: '+' | '-' | '*' | '/' | '%') {
  if (left.mode !== right.mode) throw new Error('Mixed concrete and symbolic numeric values are not supported')
  if (left.mode === 'concrete') {
    const leftValue = expectConcreteNumberValue(left)
    const rightValue = expectConcreteNumberValue(right)
    switch (operator) {
      case '+':
        return concreteNumber(leftValue + rightValue)
      case '-':
        return concreteNumber(leftValue - rightValue)
      case '%':
        return concreteNumber(leftValue % rightValue)
      case '*':
        return concreteNumber(leftValue * rightValue)
      case '/':
        return concreteNumber(leftValue / rightValue)
    }
  }

  const leftExpr = expectSymbolicNumberValue(left)
  const rightExpr = expectSymbolicNumberValue(right)
  switch (operator) {
    case '+':
      return symbolicNumberFromExpr(addExpr(leftExpr, rightExpr))
    case '-':
      return symbolicNumberFromExpr(subExpr(leftExpr, rightExpr))
    case '*':
      return symbolicNumberFromExpr(mulExpr(leftExpr, rightExpr))
    case '/':
      return symbolicNumberFromExpr(divExpr(leftExpr, rightExpr))
    default:
      throw new Error(`Unsupported symbolic operator: ${operator}`)
  }
}

function applyComparisonOperator(left: Value, right: Value, operator: ComparisonOp | '==' | '!=') {
  if (operator === '==' || operator === '!=') {
    if (left.kind === 'number' && right.kind === 'number') {
      if (left.mode !== right.mode) throw new Error('Mixed concrete and symbolic comparison is not supported')
      if (left.mode === 'symbolic') throw new Error(`Loose ${operator} is not supported in symbolic mode`)
      const leftValue = expectConcreteNumberValue(left)
      const rightValue = expectConcreteNumberValue(right)
      return booleanValue('concrete', operator === '==' ? leftValue === rightValue : leftValue !== rightValue)
    }
    if (left.kind === 'null' || right.kind === 'null') {
      const equal = left.kind === 'null' && right.kind === 'null'
      return booleanValue('concrete', operator === '==' ? equal : !equal)
    }
    if (left.kind === 'boolean' && right.kind === 'boolean') {
      if (left.mode !== 'concrete' || right.mode !== 'concrete') throw new Error(`Loose ${operator} is only supported in concrete mode`)
      return booleanValue('concrete', operator === '==' ? left.value === right.value : left.value !== right.value)
    }
    if (left.kind === 'string' && right.kind === 'string') {
      return booleanValue('concrete', operator === '==' ? left.value === right.value : left.value !== right.value)
    }
    throw new Error(`Loose ${operator} is only supported for numbers, strings, booleans, and null checks`)
  }

  if (operator === '===' || operator === '!==') {
    if (left.kind === 'number' && right.kind === 'number') {
      if (left.mode !== right.mode) throw new Error('Mixed concrete and symbolic comparison is not supported')
      if (left.mode === 'concrete') {
        const leftValue = expectConcreteNumberValue(left)
        const rightValue = expectConcreteNumberValue(right)
        return booleanValue('concrete', operator === '===' ? leftValue === rightValue : leftValue !== rightValue)
      }
      return symbolicBoolean({
        kind: 'compare',
        op: operator,
        left: expectSymbolicNumberValue(left),
        right: expectSymbolicNumberValue(right),
      })
    }
    if (left.kind === 'string' && right.kind === 'string') {
      return booleanValue('concrete', operator === '===' ? left.value === right.value : left.value !== right.value)
    }
    if (left.kind === 'boolean' && right.kind === 'boolean') {
      if (left.mode !== 'concrete' || right.mode !== 'concrete') throw new Error(`Strict ${operator} is only supported in concrete boolean mode`)
      return booleanValue('concrete', operator === '===' ? left.value === right.value : left.value !== right.value)
    }
    if (left.kind === 'null' || right.kind === 'null') {
      const equal = left.kind === 'null' && right.kind === 'null'
      return booleanValue('concrete', operator === '===' ? equal : !equal)
    }
    return booleanValue('concrete', operator === '!==')
  }

  if (left.kind !== 'number' || right.kind !== 'number') throw new Error(`Operator ${operator} expects numeric operands`)
  if (left.mode !== right.mode) throw new Error('Mixed concrete and symbolic comparison is not supported')
  if (left.mode === 'concrete') {
    const leftValue = expectConcreteNumberValue(left)
    const rightValue = expectConcreteNumberValue(right)
    switch (operator) {
      case '>':
        return booleanValue('concrete', leftValue > rightValue)
      case '>=':
        return booleanValue('concrete', leftValue >= rightValue)
      case '<':
        return booleanValue('concrete', leftValue < rightValue)
      case '<=':
        return booleanValue('concrete', leftValue <= rightValue)
    }
  }

  return symbolicBoolean({
    kind: 'compare',
    op: operator,
    left: expectSymbolicNumberValue(left),
    right: expectSymbolicNumberValue(right),
  })
}

export function symbolicExprEquals(left: ScalarExpr, right: ScalarExpr) {
  const linear = toLinearExpr(subExpr(left, right))
  if (linear == null) return false
  if (Math.abs(linear.constant) > epsilon) return false
  for (const coefficient of Object.values(linear.terms)) if (Math.abs(coefficient) > epsilon) return false
  return true
}

type LinearExpr = {
  constant: number
  terms: Record<string, number>
}

function toLinearExpr(expr: ScalarExpr): LinearExpr | null {
  switch (expr.kind) {
    case 'const':
      return {constant: expr.value, terms: {}}
    case 'var':
      return {constant: 0, terms: {[expr.name]: 1}}
    case 'add': {
      const left = toLinearExpr(expr.left)
      const right = toLinearExpr(expr.right)
      if (left == null || right == null) return null
      return combineLinear(left, right, 1)
    }
    case 'sub': {
      const left = toLinearExpr(expr.left)
      const right = toLinearExpr(expr.right)
      if (left == null || right == null) return null
      return combineLinear(left, right, -1)
    }
    case 'mul':
      if (expr.left.kind === 'const') {
        const right = toLinearExpr(expr.right)
        return right == null ? null : scaleLinear(right, expr.left.value)
      }
      if (expr.right.kind === 'const') {
        const left = toLinearExpr(expr.left)
        return left == null ? null : scaleLinear(left, expr.right.value)
      }
      return null
    case 'div':
      if (expr.right.kind !== 'const') return null
      const left = toLinearExpr(expr.left)
      return left == null ? null : scaleLinear(left, 1 / expr.right.value)
  }
}

function combineLinear(left: LinearExpr, right: LinearExpr, rightScale: number): LinearExpr {
  const terms: Record<string, number> = {...left.terms}
  for (const [name, coefficient] of Object.entries(right.terms)) {
    const nextCoefficient = (terms[name] ?? 0) + coefficient * rightScale
    if (Math.abs(nextCoefficient) <= epsilon) delete terms[name]
    else terms[name] = nextCoefficient
  }
  return {
    constant: left.constant + right.constant * rightScale,
    terms,
  }
}

function scaleLinear(linear: LinearExpr, factor: number): LinearExpr {
  const terms: Record<string, number> = {}
  for (const [name, coefficient] of Object.entries(linear.terms)) {
    const next = coefficient * factor
    if (Math.abs(next) > epsilon) terms[name] = next
  }
  return {
    constant: linear.constant * factor,
    terms,
  }
}

export function formatScalarExpr(expr: ScalarExpr): string {
  switch (expr.kind) {
    case 'const':
      return String(expr.value)
    case 'var':
      return expr.name
    case 'add':
      return `(${formatScalarExpr(expr.left)} + ${formatScalarExpr(expr.right)})`
    case 'sub':
      return `(${formatScalarExpr(expr.left)} - ${formatScalarExpr(expr.right)})`
    case 'mul':
      return `(${formatScalarExpr(expr.left)} * ${formatScalarExpr(expr.right)})`
    case 'div':
      return `(${formatScalarExpr(expr.left)} / ${formatScalarExpr(expr.right)})`
  }
}

function negateBoolExpr(expr: BoolExpr): BoolExpr {
  return {
    kind: 'compare',
    op:
      expr.op === '>' ? '<='
      : expr.op === '>=' ? '<'
      : expr.op === '<' ? '>='
      : expr.op === '<=' ? '>'
      : expr.op === '===' ? '!=='
      : '===',
    left: expr.left,
    right: expr.right,
  }
}

function getPropertyName(name: ts.PropertyName | undefined) {
  if (name == null) throw new Error('Object property name is missing')
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) return name.text
  throw new Error(`Unsupported property name: ${ts.SyntaxKind[name.kind]}`)
}

export function getProp(object: ObjectValue, key: string) {
  const value = object.props[key]
  if (value == null) throw new Error(`Missing property ${key}`)
  return value
}

function getArrayProperty(array: ArrayValue, key: string) {
  if (key === 'length') return concreteNumber(array.items.length)
  throw new Error(`Unsupported array property: ${key}`)
}

function getStringProperty(value: StringValue, key: string) {
  if (key === 'length') return concreteNumber(value.value.length)
  throw new Error(`Unsupported string property: ${key}`)
}

function getArrayItem(array: ArrayValue, index: number) {
  const item = array.items[index]
  if (item == null) throw new Error(`Array index ${index} is out of bounds`)
  return item
}

function getIndexableItem(value: Value, index: number) {
  if (value.kind === 'array') return getArrayItem(value, index)
  if (value.kind === 'string') return concreteString(value.value[index] ?? '')
  throw new Error(`Expected array or string index access, got ${value.kind}`)
}

function bindValueToName(env: Map<string, Value>, name: IrBindingName, value: Value) {
  if (name.kind === 'identifier') {
    env.set(name.name, value)
    return
  }

  const object = expectObject(value)
  for (const element of name.elements) bindValueToName(env, element.name, getProp(object, element.key))
}

function bindRangeValueToName(env: Map<string, RangeValue>, name: IrBindingName, value: RangeValue) {
  if (name.kind === 'identifier') {
    env.set(name.name, value)
    return
  }

  const object = expectRangeObject(value)
  for (const element of name.elements) bindRangeValueToName(env, element.name, getRangeProp(object, element.key))
}

function withConstraint(state: EvalState, constraint: BoolExpr): EvalState {
  return {
    ...state,
    constraints: [...state.constraints, constraint],
  }
}

function numberValue(mode: Mode, value: number): NumberValue {
  return mode === 'concrete' ? concreteNumber(value) : symbolicNumberFromExpr(constExpr(value))
}

function booleanValue(mode: Mode, value: boolean): BooleanValue {
  return mode === 'concrete'
    ? {kind: 'boolean', mode, value}
    : symbolicBoolean({
        kind: 'compare',
        op: '===',
        left: constExpr(value ? 1 : 0),
        right: constExpr(1),
      })
}

export function concreteNumber(value: number): NumberValue {
  return {kind: 'number', mode: 'concrete', value}
}

export function concreteString(value: string): StringValue {
  return {kind: 'string', mode: 'concrete', value}
}

export function concreteNull(mode: Mode): NullValue {
  return {kind: 'null', mode}
}

export function concreteArray(items: Value[]): ArrayValue {
  return {kind: 'array', mode: 'concrete', items}
}

export function concreteObject(props: Record<string, Value>): ObjectValue {
  return objectValue('concrete', props)
}

export function concreteOpaque(label: string): OpaqueValue {
  return {kind: 'opaque', mode: 'concrete', label}
}

export function symbolicNumber(name: string): NumberValue {
  return symbolicNumberFromExpr(varExpr(name))
}

function symbolicNumberFromExpr(expr: ScalarExpr): NumberValue {
  return {kind: 'number', mode: 'symbolic', expr}
}

function symbolicBoolean(expr: BoolExpr): BooleanValue {
  return {kind: 'boolean', mode: 'symbolic', expr}
}

function objectValue(mode: Mode, props: Record<string, Value>): ObjectValue {
  return {kind: 'object', mode, props}
}

export function symbolicObject(props: Record<string, Value>): ObjectValue {
  return objectValue('symbolic', props)
}

export function symbolicOpaque(label: string): OpaqueValue {
  return {kind: 'opaque', mode: 'symbolic', label}
}

export function expectNumber(value: Value): NumberValue {
  if (value.kind !== 'number') throw new Error(`Expected number, got ${value.kind}`)
  return value
}

export function expectString(value: Value): StringValue {
  if (value.kind !== 'string') throw new Error(`Expected string, got ${value.kind}`)
  return value
}

export function expectConcreteNumber(value: Value) {
  return expectConcreteNumberValue(expectNumber(value))
}

export function expectSymbolicNumber(value: Value) {
  return expectSymbolicNumberValue(expectNumber(value))
}

export function expectBoolean(value: Value): BooleanValue {
  if (value.kind !== 'boolean') throw new Error(`Expected boolean, got ${value.kind}`)
  return value
}

export function expectObject(value: Value): ObjectValue {
  if (value.kind !== 'object') throw new Error(`Expected object, got ${value.kind}`)
  return value
}

export function expectArray(value: Value): ArrayValue {
  if (value.kind !== 'array') throw new Error(`Expected array, got ${value.kind}`)
  return value
}

function expectFunction(value: Value): FunctionValue {
  if (value.kind !== 'function') throw new Error(`Expected function, got ${value.kind}`)
  return value
}

function negateNumber(value: NumberValue): NumberValue {
  return value.mode === 'concrete'
    ? concreteNumber(-expectConcreteNumberValue(value))
    : symbolicNumberFromExpr(mulExpr(constExpr(-1), expectSymbolicNumberValue(value)))
}

function expectConcreteNumberValue(value: NumberValue) {
  if (value.mode !== 'concrete') throw new Error('Expected concrete number')
  return value.value
}

function expectSymbolicNumberValue(value: NumberValue) {
  if (value.mode !== 'symbolic') throw new Error('Expected symbolic number')
  return value.expr
}

export function rangeNumber(min: number, max: number, isInteger: boolean): RangeNumberValue {
  return {kind: 'range-number', min, max, isInteger}
}

function rangeBoolean(truth: RangeTruth): RangeBooleanValue {
  return {kind: 'range-boolean', truth}
}

function rangeObject(props: Record<string, RangeValue>): RangeObjectValue {
  return {kind: 'range-object', props}
}

function rangeNull(): RangeNullValue {
  return {kind: 'range-null'}
}

export function expectRangeNumber(value: RangeValue): RangeNumberValue {
  if (value.kind !== 'range-number') throw new Error(`Expected range number, got ${value.kind}`)
  return value
}

function expectRangeBoolean(value: RangeValue): RangeBooleanValue {
  if (value.kind !== 'range-boolean') throw new Error(`Expected range boolean, got ${value.kind}`)
  return value
}

export function expectRangeObject(value: RangeValue): RangeObjectValue {
  if (value.kind !== 'range-object') throw new Error(`Expected range object, got ${value.kind}`)
  return value
}

export function getRangeProp(object: RangeObjectValue, key: string) {
  const value = object.props[key]
  if (value == null) throw new Error(`Missing range property ${key}`)
  return value
}

export function joinRangeCases(cases: RangeReturnCase[]): RangeValue {
  if (cases.length === 0) throw new Error('Expected at least 1 range case')
  let current = cases[0]!.value
  for (let i = 1; i < cases.length; i++) current = joinRangeValues(current, cases[i]!.value)
  return current
}

function joinRangeValues(left: RangeValue, right: RangeValue): RangeValue {
  if (left.kind !== right.kind) throw new Error(`Cannot join ${left.kind} with ${right.kind}`)
  if (left.kind === 'range-number' && right.kind === 'range-number') {
    return rangeNumber(Math.min(left.min, right.min), Math.max(left.max, right.max), left.isInteger && right.isInteger)
  }
  if (left.kind === 'range-boolean' && right.kind === 'range-boolean') {
    return left.truth === right.truth ? left : rangeBoolean('maybe')
  }
  if (left.kind === 'range-object' && right.kind === 'range-object') {
    const props: Record<string, RangeValue> = {}
    for (const key of Object.keys(left.props)) props[key] = joinRangeValues(getRangeProp(left, key), getRangeProp(right, key))
    return rangeObject(props)
  }
  if (left.kind === 'range-opaque' && right.kind === 'range-opaque') {
    if (left.label !== right.label) throw new Error(`Cannot join opaque values ${left.label} and ${right.label}`)
    return left
  }
  if (left.kind === 'range-null' && right.kind === 'range-null') return left
  throw new Error(`Unsupported range join for ${left.kind}`)
}

function negateRangeNumber(value: RangeNumberValue) {
  return rangeNumber(-value.max, -value.min, value.isInteger)
}

function applyRangeNumericOperator(left: RangeNumberValue, right: RangeNumberValue, operator: '+' | '-' | '*' | '/') {
  switch (operator) {
    case '+':
      return rangeNumber(left.min + right.min, left.max + right.max, left.isInteger && right.isInteger)
    case '-':
      return rangeNumber(left.min - right.max, left.max - right.min, left.isInteger && right.isInteger)
    case '*': {
      const products = [left.min * right.min, left.min * right.max, left.max * right.min, left.max * right.max]
      return rangeNumber(Math.min(...products), Math.max(...products), left.isInteger && right.isInteger)
    }
    case '/': {
      if (right.min <= 0 && right.max >= 0) throw new Error('Division by an interval spanning zero is not supported')
      const quotients = [left.min / right.min, left.min / right.max, left.max / right.min, left.max / right.max]
      return rangeNumber(Math.min(...quotients), Math.max(...quotients), false)
    }
  }
}

function compareRangeNumbers(left: RangeNumberValue, right: RangeNumberValue, operator: ComparisonOp): RangeTruth {
  switch (operator) {
    case '>':
      return left.min > right.max ? 'always-true' : left.max <= right.min ? 'always-false' : 'maybe'
    case '>=':
      return left.min >= right.max ? 'always-true' : left.max < right.min ? 'always-false' : 'maybe'
    case '<':
      return left.max < right.min ? 'always-true' : left.min >= right.max ? 'always-false' : 'maybe'
    case '<=':
      return left.max <= right.min ? 'always-true' : left.min > right.max ? 'always-false' : 'maybe'
    case '===': {
      const leftIsSingleton = Math.abs(left.max - left.min) <= epsilon
      const rightIsSingleton = Math.abs(right.max - right.min) <= epsilon
      return leftIsSingleton && rightIsSingleton && Math.abs(left.min - right.min) <= epsilon
        ? 'always-true'
        : left.max < right.min || right.max < left.min
          ? 'always-false'
          : 'maybe'
    }
    case '!==': {
      const leftIsSingleton = Math.abs(left.max - left.min) <= epsilon
      const rightIsSingleton = Math.abs(right.max - right.min) <= epsilon
      return left.max < right.min || right.max < left.min
        ? 'always-true'
        : leftIsSingleton && rightIsSingleton && Math.abs(left.min - right.min) <= epsilon
          ? 'always-false'
          : 'maybe'
    }
  }
}

function minRangeNumber(left: RangeNumberValue, right: RangeNumberValue): RangeNumberValue {
  return rangeNumber(Math.min(left.min, right.min), Math.min(left.max, right.max), left.isInteger && right.isInteger)
}

function maxRangeNumber(left: RangeNumberValue, right: RangeNumberValue): RangeNumberValue {
  return rangeNumber(Math.max(left.min, right.min), Math.max(left.max, right.max), left.isInteger && right.isInteger)
}

function applyAssignmentOperator(current: NumberValue, next: NumberValue, operator: '+=' | '-='): NumberValue {
  if (current.mode !== 'concrete' || next.mode !== 'concrete') throw new Error('Assignment operators are only supported in concrete mode')
  const currentValue = expectConcreteNumberValue(current)
  const nextValue = expectConcreteNumberValue(next)
  return concreteNumber(operator === '+=' ? currentValue + nextValue : currentValue - nextValue)
}

export function concreteNumberArrayIsStrictlyIncreasing(array: ArrayValue) {
  for (let i = 1; i < array.items.length; i++) {
    if (expectConcreteNumber(array.items[i - 1]!) >= expectConcreteNumber(array.items[i]!) - epsilon) return false
  }
  return true
}

export function describeNumericArray(array: ArrayValue) {
  return array.items.map(item => expectConcreteNumber(item)).join(',')
}

export function constExpr(value: number): ScalarExpr {
  return {kind: 'const', value}
}

function varExpr(name: string): ScalarExpr {
  return {kind: 'var', name}
}

export function addExpr(left: ScalarExpr, right: ScalarExpr): ScalarExpr {
  return {kind: 'add', left, right}
}

export function subExpr(left: ScalarExpr, right: ScalarExpr): ScalarExpr {
  return {kind: 'sub', left, right}
}

export function mulExpr(left: ScalarExpr, right: ScalarExpr): ScalarExpr {
  return {kind: 'mul', left, right}
}

export function divExpr(left: ScalarExpr, right: ScalarExpr): ScalarExpr {
  return {kind: 'div', left, right}
}

function binaryTokenToOperator(token: ts.SyntaxKind): IrBinaryOperator {
  switch (token) {
    case ts.SyntaxKind.PlusToken:
      return '+'
    case ts.SyntaxKind.MinusToken:
      return '-'
    case ts.SyntaxKind.AsteriskToken:
      return '*'
    case ts.SyntaxKind.SlashToken:
      return '/'
    case ts.SyntaxKind.PercentToken:
      return '%'
    case ts.SyntaxKind.QuestionQuestionToken:
      return '??'
    case ts.SyntaxKind.GreaterThanToken:
      return '>'
    case ts.SyntaxKind.GreaterThanEqualsToken:
      return '>='
    case ts.SyntaxKind.LessThanToken:
      return '<'
    case ts.SyntaxKind.LessThanEqualsToken:
      return '<='
    case ts.SyntaxKind.EqualsEqualsToken:
      return '=='
    case ts.SyntaxKind.ExclamationEqualsToken:
      return '!='
    case ts.SyntaxKind.EqualsEqualsEqualsToken:
      return '==='
    case ts.SyntaxKind.ExclamationEqualsEqualsToken:
      return '!=='
    case ts.SyntaxKind.BarBarToken:
      return '||'
    case ts.SyntaxKind.AmpersandAmpersandToken:
      return '&&'
    default:
      throw new Error(`Unsupported binary operator token: ${ts.tokenToString(token)}`)
  }
}

function isComparisonOperator(operator: IrBinaryOperator): operator is ComparisonOp | '==' | '!=' {
  return (
    operator === '>' ||
    operator === '>=' ||
    operator === '<' ||
    operator === '<=' ||
    operator === '==' ||
    operator === '!=' ||
    operator === '===' ||
    operator === '!=='
  )
}

function isAssignmentToken(token: ts.SyntaxKind) {
  return token === ts.SyntaxKind.EqualsToken || token === ts.SyntaxKind.PlusEqualsToken || token === ts.SyntaxKind.MinusEqualsToken
}

function assignmentTokenToOperator(token: ts.SyntaxKind): '=' | '+=' | '-=' {
  switch (token) {
    case ts.SyntaxKind.EqualsToken:
      return '='
    case ts.SyntaxKind.PlusEqualsToken:
      return '+='
    case ts.SyntaxKind.MinusEqualsToken:
      return '-='
    default:
      throw new Error(`Unsupported assignment token: ${ts.tokenToString(token)}`)
  }
}

function unsupported(message: string): never {
  throw new Error(message)
}
