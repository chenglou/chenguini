import * as ts from 'typescript'
import {promptPaddingBottom} from './prompt-layout'

type WitnessValue = boolean | number | string | null

export type StaticLayoutLawWitness = Record<string, WitnessValue>

export type StaticLayoutLawSummary = {
  name: string
  checks: number
  status: 'pass' | 'fail'
  firstFailure?: StaticLayoutLawWitness
}

export type StaticLayoutVerificationReport = {
  phase: 'ready' | 'error'
  suite: 'photo-gallery-static-layout'
  analyzedFile: string
  laws: StaticLayoutLawSummary[]
}

type InternalLawSummary = {
  name: string
  checks: number
  firstFailure: StaticLayoutLawWitness | null
}

type Mode = 'concrete' | 'symbolic'
type ComparisonOp = '>' | '>=' | '<' | '<=' | '===' | '!=='

type ScalarExpr =
  | {kind: 'const'; value: number}
  | {kind: 'var'; name: string}
  | {kind: 'add'; left: ScalarExpr; right: ScalarExpr}
  | {kind: 'sub'; left: ScalarExpr; right: ScalarExpr}
  | {kind: 'mul'; left: ScalarExpr; right: ScalarExpr}
  | {kind: 'div'; left: ScalarExpr; right: ScalarExpr}

type BoolExpr = {
  kind: 'compare'
  op: ComparisonOp
  left: ScalarExpr
  right: ScalarExpr
}

type NumberValue =
  | {kind: 'number'; mode: 'concrete'; value: number}
  | {kind: 'number'; mode: 'symbolic'; expr: ScalarExpr}

type BooleanValue =
  | {kind: 'boolean'; mode: 'concrete'; value: boolean}
  | {kind: 'boolean'; mode: 'symbolic'; expr: BoolExpr}

type ObjectValue = {
  kind: 'object'
  mode: Mode
  props: Record<string, Value>
}

type OpaqueValue = {
  kind: 'opaque'
  mode: Mode
  label: string
}

type Value = NumberValue | BooleanValue | ObjectValue | OpaqueValue

type RangeTruth = 'always-true' | 'always-false' | 'maybe'

type RangeNumberValue = {
  kind: 'range-number'
  min: number
  max: number
  isInteger: boolean
}

type RangeBooleanValue = {
  kind: 'range-boolean'
  truth: RangeTruth
}

type RangeObjectValue = {
  kind: 'range-object'
  props: Record<string, RangeValue>
}

type RangeOpaqueValue = {
  kind: 'range-opaque'
  label: string
}

type RangeValue = RangeNumberValue | RangeBooleanValue | RangeObjectValue | RangeOpaqueValue

type RangeState = {
  env: Map<string, RangeValue>
}

type RangeEvalCase = {
  state: RangeState
  value: RangeValue
}

type RangeReturnCase = {
  value: RangeValue
}

type EvalState = {
  mode: Mode
  constraints: BoolExpr[]
  env: Map<string, Value>
}

type EvalCase = {
  state: EvalState
  value: Value
}

type ReturnCase = {
  constraints: BoolExpr[]
  value: Value
}

const epsilon = 0.0001

export function runPhotoGalleryStaticVerification(sourceText: string): StaticLayoutVerificationReport {
  const analyzer = new SourceAnalyzer(sourceText, {promptPaddingBottom})
  const laws = new Map<string, InternalLawSummary>()

  verifyMakeItemLayoutGeometry(analyzer, laws)
  verifyColsBoxMaxSizeXFRange(analyzer, laws)
  verifyColsBoxMaxSizeXF(analyzer, laws)

  const lawSummaries = [...laws.values()].map(law => ({
    name: law.name,
    checks: law.checks,
    status: law.firstFailure == null ? 'pass' : 'fail',
    ...(law.firstFailure == null ? {} : {firstFailure: law.firstFailure}),
  })) satisfies StaticLayoutLawSummary[]

  return {
    phase: lawSummaries.some(law => law.status === 'fail') ? 'error' : 'ready',
    suite: 'photo-gallery-static-layout',
    analyzedFile: 'demos/photo-gallery/layout-model.ts',
    laws: lawSummaries,
  }
}

function verifyColsBoxMaxSizeXFRange(analyzer: SourceAnalyzer, laws: Map<string, InternalLawSummary>) {
  const cases = analyzer.evaluateFunctionRange('colsBoxMaxSizeXF', [rangeNumber(320, 1600, true)])
  const result = expectRangeObject(joinRangeCases(cases))
  const cols = expectRangeNumber(getRangeProp(result, 'cols'))
  const boxMaxSizeX = expectRangeNumber(getRangeProp(result, 'boxMaxSizeX'))

  check(laws, 'colsBoxMaxSizeXF keeps cols in supported range over width intervals', cols.min >= 1 && cols.max <= 7, () => ({
    colsMin: cols.min,
    colsMax: cols.max,
  }))
  check(laws, 'colsBoxMaxSizeXF keeps cols integral over width intervals', cols.isInteger, () => ({
    colsMin: cols.min,
    colsMax: cols.max,
    colsIsInteger: cols.isInteger ? 'true' : 'false',
  }))
  check(laws, 'colsBoxMaxSizeXF keeps boxMaxSizeX non-negative over width intervals', boxMaxSizeX.min >= -epsilon, () => ({
    boxMaxSizeXMin: boxMaxSizeX.min,
    boxMaxSizeXMax: boxMaxSizeX.max,
  }))
}

function verifyMakeItemLayoutGeometry(analyzer: SourceAnalyzer, laws: Map<string, InternalLawSummary>) {
  const cases = analyzer.evaluateFunction('makeItemLayoutGeometry', [
    symbolicNumber('x'),
    symbolicNumber('y'),
    symbolicNumber('imageSizeX'),
    symbolicNumber('imageSizeY'),
    symbolicObject({
      visibleHeight: symbolicNumber('promptLayout.visibleHeight'),
      width: symbolicNumber('promptLayout.width'),
      lines: symbolicOpaque('promptLayout.lines'),
    }),
    symbolicNumber('promptLineHeight'),
  ], 'symbolic')

  check(laws, 'makeItemLayoutGeometry stays branch-free', cases.length === 1, () => ({
    cases: cases.length,
  }))
  if (cases.length !== 1) return

  const geometry = expectObject(cases[0]!.value)
  const imageBox = expectObject(getProp(geometry, 'imageBox'))
  const layoutBox = expectObject(getProp(geometry, 'layoutBox'))
  const prompt = expectObject(getProp(geometry, 'prompt'))
  const promptBox = expectObject(getProp(prompt, 'box'))

  const imageX = expectSymbolicNumber(getProp(imageBox, 'x'))
  const imageY = expectSymbolicNumber(getProp(imageBox, 'y'))
  const imageSizeY = expectSymbolicNumber(getProp(imageBox, 'sizeY'))
  const promptX = expectSymbolicNumber(getProp(promptBox, 'x'))
  const promptY = expectSymbolicNumber(getProp(promptBox, 'y'))
  const promptSizeY = expectSymbolicNumber(getProp(promptBox, 'sizeY'))
  const layoutSizeY = expectSymbolicNumber(getProp(layoutBox, 'sizeY'))
  const layoutX = expectSymbolicNumber(getProp(layoutBox, 'x'))

  check(laws, 'makeItemLayoutGeometry keeps image and layout x aligned', symbolicExprEquals(imageX, layoutX), () => ({
    imageX: formatScalarExpr(imageX),
    layoutX: formatScalarExpr(layoutX),
  }))
  check(laws, 'makeItemLayoutGeometry keeps prompt x aligned with the image', symbolicExprEquals(promptX, imageX), () => ({
    imageX: formatScalarExpr(imageX),
    promptX: formatScalarExpr(promptX),
  }))
  check(laws, 'makeItemLayoutGeometry puts the prompt directly below the image', symbolicExprEquals(
    promptY,
    addExpr(imageY, imageSizeY),
  ), () => ({
    promptY: formatScalarExpr(promptY),
    expectedPromptY: formatScalarExpr(addExpr(imageY, imageSizeY)),
  }))
  check(laws, 'makeItemLayoutGeometry derives layout height from image height + prompt height + bottom padding', symbolicExprEquals(
    layoutSizeY,
    addExpr(addExpr(imageSizeY, promptSizeY), constExpr(promptPaddingBottom)),
  ), () => ({
    layoutSizeY: formatScalarExpr(layoutSizeY),
    expectedLayoutSizeY: formatScalarExpr(addExpr(addExpr(imageSizeY, promptSizeY), constExpr(promptPaddingBottom))),
  }))
}

function verifyColsBoxMaxSizeXF(analyzer: SourceAnalyzer, laws: Map<string, InternalLawSummary>) {
  const boxesGapX = analyzer.getGlobalNumber('boxesGapX')
  for (let containerSizeX = 320; containerSizeX <= 1600; containerSizeX++) {
    const cases = analyzer.evaluateFunction('colsBoxMaxSizeXF', [concreteNumber(containerSizeX)], 'concrete')
    check(laws, 'colsBoxMaxSizeXF stays branch-free per concrete width', cases.length === 1, () => ({
      containerSizeX,
      cases: cases.length,
    }))
    if (cases.length !== 1) continue

    const result = expectObject(cases[0]!.value)
    const cols = expectConcreteNumber(getProp(result, 'cols'))
    const boxMaxSizeX = expectConcreteNumber(getProp(result, 'boxMaxSizeX'))
    const filledWidth = boxesGapX + cols * boxesGapX + cols * boxMaxSizeX

    check(laws, 'colsBoxMaxSizeXF keeps cols in the supported range', 1 <= cols && cols <= 7, () => ({
      containerSizeX,
      cols,
    }))
    check(laws, 'colsBoxMaxSizeXF keeps cols integral', Math.abs(cols - Math.round(cols)) <= epsilon, () => ({
      containerSizeX,
      cols,
    }))
    check(laws, 'colsBoxMaxSizeXF keeps boxMaxSizeX non-negative', boxMaxSizeX >= -epsilon, () => ({
      containerSizeX,
      cols,
      boxMaxSizeX,
    }))
    check(laws, 'colsBoxMaxSizeXF exactly fills the horizontal track', Math.abs(filledWidth - containerSizeX) <= epsilon, () => ({
      containerSizeX,
      cols,
      boxMaxSizeX,
      filledWidth,
    }))
  }
}

class SourceAnalyzer {
  private readonly functions = new Map<string, ts.FunctionDeclaration>()
  private readonly globals = new Map<string, number>()

  constructor(sourceText: string, externalGlobals: Record<string, number>) {
    const sourceFile = ts.createSourceFile('layout-model.ts', sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
    for (const statement of sourceFile.statements) {
      if (ts.isFunctionDeclaration(statement) && statement.name != null) {
        this.functions.set(statement.name.text, statement)
      } else if (ts.isVariableStatement(statement)) {
        for (const declaration of statement.declarationList.declarations) {
          if (!ts.isIdentifier(declaration.name) || declaration.initializer == null) continue
          const value = evaluateConstNumber(declaration.initializer, this.globals)
          if (value != null) this.globals.set(declaration.name.text, value)
        }
      }
    }
    for (const [name, value] of Object.entries(externalGlobals)) this.globals.set(name, value)
  }

  getGlobalNumber(name: string) {
    const value = this.globals.get(name)
    if (value == null) throw new Error(`Unknown numeric global: ${name}`)
    return value
  }

  evaluateFunction(name: string, args: Value[], mode: Mode): ReturnCase[] {
    const declaration = this.functions.get(name)
    if (declaration?.body == null) throw new Error(`Function ${name} not found`)
    if (declaration.parameters.length !== args.length) {
      throw new Error(`Function ${name} expected ${declaration.parameters.length} arguments, got ${args.length}`)
    }

    const env = new Map<string, Value>()
    for (let i = 0; i < declaration.parameters.length; i++) {
      const parameter = declaration.parameters[i]!
      if (!ts.isIdentifier(parameter.name)) throw new Error(`Unsupported parameter pattern in ${name}`)
      env.set(parameter.name.text, args[i]!)
    }
    return executeStatements(this, declaration.body.statements, [{mode, constraints: [], env}])
  }

  evaluateFunctionRange(name: string, args: RangeValue[]): RangeReturnCase[] {
    const declaration = this.functions.get(name)
    if (declaration?.body == null) throw new Error(`Function ${name} not found`)
    if (declaration.parameters.length !== args.length) {
      throw new Error(`Function ${name} expected ${declaration.parameters.length} arguments, got ${args.length}`)
    }

    const env = new Map<string, RangeValue>()
    for (let i = 0; i < declaration.parameters.length; i++) {
      const parameter = declaration.parameters[i]!
      if (!ts.isIdentifier(parameter.name)) throw new Error(`Unsupported parameter pattern in ${name}`)
      env.set(parameter.name.text, args[i]!)
    }
    return executeRangeStatements(this, declaration.body.statements, [{env}])
  }

  evalExpression(state: EvalState, expression: ts.Expression): EvalCase[] {
    if (ts.isParenthesizedExpression(expression)) return this.evalExpression(state, expression.expression)
    if (ts.isNumericLiteral(expression)) return [{state, value: numberValue(state.mode, Number(expression.text))}]
    if (expression.kind === ts.SyntaxKind.TrueKeyword) return [{state, value: booleanValue(state.mode, true)}]
    if (expression.kind === ts.SyntaxKind.FalseKeyword) return [{state, value: booleanValue(state.mode, false)}]

    if (ts.isIdentifier(expression)) {
      const local = state.env.get(expression.text)
      if (local != null) return [{state, value: local}]
      const global = this.globals.get(expression.text)
      if (global != null) return [{state, value: numberValue(state.mode, global)}]
      throw new Error(`Unsupported identifier: ${expression.text}`)
    }

    if (ts.isPrefixUnaryExpression(expression)) {
      const operandCases = this.evalExpression(state, expression.operand)
      return operandCases.map(result => ({
        state: result.state,
        value: expression.operator === ts.SyntaxKind.MinusToken
          ? negateNumber(expectNumber(result.value))
          : expression.operator === ts.SyntaxKind.PlusToken
            ? expectNumber(result.value)
            : unsupported(`Unsupported unary operator: ${ts.tokenToString(expression.operator)}`),
      }))
    }

    if (ts.isPropertyAccessExpression(expression)) {
      const targetCases = this.evalExpression(state, expression.expression)
      return targetCases.map(result => ({
        state: result.state,
        value: getProp(expectObject(result.value), expression.name.text),
      }))
    }

    if (ts.isBinaryExpression(expression)) {
      return combineBinaryCases(this, state, expression)
    }

    if (ts.isConditionalExpression(expression)) {
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

    if (ts.isObjectLiteralExpression(expression)) {
      let objectCases: Array<{state: EvalState; props: Record<string, Value>}> = [{state, props: {}}]
      for (const property of expression.properties) {
        if (ts.isSpreadAssignment(property)) throw new Error('Spread in object literals is not supported yet')
        const propertyName = getPropertyName(property.name)
        const nextCases: Array<{state: EvalState; props: Record<string, Value>}> = []
        for (const objectCase of objectCases) {
          const valueCases = ts.isShorthandPropertyAssignment(property)
            ? this.evalExpression(objectCase.state, property.name)
            : ts.isPropertyAssignment(property)
              ? this.evalExpression(objectCase.state, property.initializer)
              : unsupported(`Unsupported object property kind: ${ts.SyntaxKind[property.kind]}`)
          for (const valueCase of valueCases) {
            nextCases.push({
              state: valueCase.state,
              props: {...objectCase.props, [propertyName]: valueCase.value},
            })
          }
        }
        objectCases = nextCases
      }
      return objectCases.map(objectCase => ({
        state: objectCase.state,
        value: objectValue(state.mode, objectCase.props),
      }))
    }

    if (ts.isCallExpression(expression)) {
      return evaluateCallExpression(this, state, expression)
    }

    throw new Error(`Unsupported expression kind: ${ts.SyntaxKind[expression.kind]}`)
  }

  evalRangeExpression(state: RangeState, expression: ts.Expression): RangeEvalCase[] {
    if (ts.isParenthesizedExpression(expression)) return this.evalRangeExpression(state, expression.expression)
    if (ts.isNumericLiteral(expression)) return [{state, value: rangeNumber(Number(expression.text), Number(expression.text), Number.isInteger(Number(expression.text)))}]
    if (expression.kind === ts.SyntaxKind.TrueKeyword) return [{state, value: rangeBoolean('always-true')}]
    if (expression.kind === ts.SyntaxKind.FalseKeyword) return [{state, value: rangeBoolean('always-false')}]

    if (ts.isIdentifier(expression)) {
      const local = state.env.get(expression.text)
      if (local != null) return [{state, value: local}]
      const global = this.globals.get(expression.text)
      if (global != null) return [{state, value: rangeNumber(global, global, Number.isInteger(global))}]
      throw new Error(`Unsupported identifier: ${expression.text}`)
    }

    if (ts.isPrefixUnaryExpression(expression)) {
      const operandCases = this.evalRangeExpression(state, expression.operand)
      return operandCases.map(result => ({
        state: result.state,
        value: expression.operator === ts.SyntaxKind.MinusToken
          ? negateRangeNumber(expectRangeNumber(result.value))
          : expression.operator === ts.SyntaxKind.PlusToken
            ? expectRangeNumber(result.value)
            : unsupported(`Unsupported range unary operator: ${ts.tokenToString(expression.operator)}`),
      }))
    }

    if (ts.isPropertyAccessExpression(expression)) {
      const targetCases = this.evalRangeExpression(state, expression.expression)
      return targetCases.map(result => ({
        state: result.state,
        value: getRangeProp(expectRangeObject(result.value), expression.name.text),
      }))
    }

    if (ts.isBinaryExpression(expression)) {
      return combineRangeBinaryCases(this, state, expression)
    }

    if (ts.isConditionalExpression(expression)) {
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

    if (ts.isObjectLiteralExpression(expression)) {
      let objectCases: Array<{state: RangeState; props: Record<string, RangeValue>}> = [{state, props: {}}]
      for (const property of expression.properties) {
        if (ts.isSpreadAssignment(property)) throw new Error('Spread in range object literals is not supported yet')
        const propertyName = getPropertyName(property.name)
        const nextCases: Array<{state: RangeState; props: Record<string, RangeValue>}> = []
        for (const objectCase of objectCases) {
          const valueCases = ts.isShorthandPropertyAssignment(property)
            ? this.evalRangeExpression(objectCase.state, property.name)
            : ts.isPropertyAssignment(property)
              ? this.evalRangeExpression(objectCase.state, property.initializer)
              : unsupported(`Unsupported range object property kind: ${ts.SyntaxKind[property.kind]}`)
          for (const valueCase of valueCases) {
            nextCases.push({
              state: valueCase.state,
              props: {...objectCase.props, [propertyName]: valueCase.value},
            })
          }
        }
        objectCases = nextCases
      }
      return objectCases.map(objectCase => ({
        state: objectCase.state,
        value: rangeObject(objectCase.props),
      }))
    }

    if (ts.isCallExpression(expression)) {
      return evaluateRangeCallExpression(this, state, expression)
    }

    throw new Error(`Unsupported range expression kind: ${ts.SyntaxKind[expression.kind]}`)
  }
}

function executeStatements(analyzer: SourceAnalyzer, statements: ts.NodeArray<ts.Statement>, initialStates: EvalState[]) {
  let activeStates = initialStates
  const returnCases: ReturnCase[] = []

  for (const statement of statements) {
    const nextStates: EvalState[] = []
    for (const state of activeStates) {
      if (ts.isVariableStatement(statement)) {
        let declarationStates = [state]
        for (const declaration of statement.declarationList.declarations) {
          if (!ts.isIdentifier(declaration.name) || declaration.initializer == null) {
            throw new Error('Only initialized identifier declarations are supported')
          }
          const newStates: EvalState[] = []
          for (const declarationState of declarationStates) {
            for (const evaluated of analyzer.evalExpression(declarationState, declaration.initializer)) {
              const env = new Map(evaluated.state.env)
              env.set(declaration.name.text, evaluated.value)
              newStates.push({...evaluated.state, env})
            }
          }
          declarationStates = newStates
        }
        nextStates.push(...declarationStates)
        continue
      }

      if (ts.isReturnStatement(statement)) {
        if (statement.expression == null) throw new Error('Bare return is not supported')
        for (const evaluated of analyzer.evalExpression(state, statement.expression)) {
          returnCases.push({
            constraints: evaluated.state.constraints,
            value: evaluated.value,
          })
        }
        continue
      }

      throw new Error(`Unsupported statement kind: ${ts.SyntaxKind[statement.kind]}`)
    }
    activeStates = nextStates
  }

  return returnCases
}

function executeRangeStatements(analyzer: SourceAnalyzer, statements: ts.NodeArray<ts.Statement>, initialStates: RangeState[]) {
  let activeStates = initialStates
  const returnCases: RangeReturnCase[] = []

  for (const statement of statements) {
    const nextStates: RangeState[] = []
    for (const state of activeStates) {
      if (ts.isVariableStatement(statement)) {
        let declarationStates = [state]
        for (const declaration of statement.declarationList.declarations) {
          if (!ts.isIdentifier(declaration.name) || declaration.initializer == null) {
            throw new Error('Only initialized identifier range declarations are supported')
          }
          const newStates: RangeState[] = []
          for (const declarationState of declarationStates) {
            for (const evaluated of analyzer.evalRangeExpression(declarationState, declaration.initializer)) {
              const env = new Map(evaluated.state.env)
              env.set(declaration.name.text, evaluated.value)
              newStates.push({env})
            }
          }
          declarationStates = newStates
        }
        nextStates.push(...declarationStates)
        continue
      }

      if (ts.isReturnStatement(statement)) {
        if (statement.expression == null) throw new Error('Bare range return is not supported')
        for (const evaluated of analyzer.evalRangeExpression(state, statement.expression)) {
          returnCases.push({value: evaluated.value})
        }
        continue
      }

      throw new Error(`Unsupported range statement kind: ${ts.SyntaxKind[statement.kind]}`)
    }
    activeStates = nextStates
  }

  return returnCases
}

function combineBinaryCases(analyzer: SourceAnalyzer, state: EvalState, expression: ts.BinaryExpression): EvalCase[] {
  const leftCases = analyzer.evalExpression(state, expression.left)
  const results: EvalCase[] = []
  for (const leftCase of leftCases) {
    const rightCases = analyzer.evalExpression(leftCase.state, expression.right)
    for (const rightCase of rightCases) {
      const operator = expression.operatorToken.kind
      if (
        operator === ts.SyntaxKind.PlusToken ||
        operator === ts.SyntaxKind.MinusToken ||
        operator === ts.SyntaxKind.AsteriskToken ||
        operator === ts.SyntaxKind.SlashToken
      ) {
        results.push({
          state: rightCase.state,
          value: applyNumericOperator(expectNumber(leftCase.value), expectNumber(rightCase.value), operator),
        })
        continue
      }

      if (
        operator === ts.SyntaxKind.GreaterThanToken ||
        operator === ts.SyntaxKind.GreaterThanEqualsToken ||
        operator === ts.SyntaxKind.LessThanToken ||
        operator === ts.SyntaxKind.LessThanEqualsToken ||
        operator === ts.SyntaxKind.EqualsEqualsEqualsToken ||
        operator === ts.SyntaxKind.ExclamationEqualsEqualsToken
      ) {
        results.push({
          state: rightCase.state,
          value: applyComparisonOperator(expectNumber(leftCase.value), expectNumber(rightCase.value), operator),
        })
        continue
      }

      throw new Error(`Unsupported binary operator: ${ts.tokenToString(operator)}`)
    }
  }
  return results
}

function combineRangeBinaryCases(analyzer: SourceAnalyzer, state: RangeState, expression: ts.BinaryExpression): RangeEvalCase[] {
  const leftCases = analyzer.evalRangeExpression(state, expression.left)
  const results: RangeEvalCase[] = []
  for (const leftCase of leftCases) {
    const rightCases = analyzer.evalRangeExpression(leftCase.state, expression.right)
    for (const rightCase of rightCases) {
      const operator = expression.operatorToken.kind
      if (
        operator === ts.SyntaxKind.PlusToken ||
        operator === ts.SyntaxKind.MinusToken ||
        operator === ts.SyntaxKind.AsteriskToken ||
        operator === ts.SyntaxKind.SlashToken
      ) {
        results.push({
          state: rightCase.state,
          value: applyRangeNumericOperator(expectRangeNumber(leftCase.value), expectRangeNumber(rightCase.value), operator),
        })
        continue
      }

      if (
        operator === ts.SyntaxKind.GreaterThanToken ||
        operator === ts.SyntaxKind.GreaterThanEqualsToken ||
        operator === ts.SyntaxKind.LessThanToken ||
        operator === ts.SyntaxKind.LessThanEqualsToken ||
        operator === ts.SyntaxKind.EqualsEqualsEqualsToken ||
        operator === ts.SyntaxKind.ExclamationEqualsEqualsToken
      ) {
        results.push({
          state: rightCase.state,
          value: rangeBoolean(compareRangeNumbers(expectRangeNumber(leftCase.value), expectRangeNumber(rightCase.value), comparisonTokenToOp(operator))),
        })
        continue
      }

      throw new Error(`Unsupported range binary operator: ${ts.tokenToString(operator)}`)
    }
  }
  return results
}

function evaluateCallExpression(analyzer: SourceAnalyzer, state: EvalState, expression: ts.CallExpression): EvalCase[] {
  let argumentCases: Array<{state: EvalState; values: Value[]}> = [{state, values: []}]
  for (const argument of expression.arguments) {
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

  const callee = expression.expression
  if (ts.isPropertyAccessExpression(callee) && ts.isIdentifier(callee.expression) && callee.expression.text === 'Math') {
    return argumentCases.map(argumentCase => ({
      state: argumentCase.state,
      value: evaluateMathCall(callee.name.text, argumentCase.values, argumentCase.state.mode),
    }))
  }

  if (ts.isIdentifier(callee)) {
    const results: EvalCase[] = []
    for (const argumentCase of argumentCases) {
      for (const returned of analyzer.evaluateFunction(callee.text, argumentCase.values, argumentCase.state.mode)) {
        results.push({
          state: {
            ...argumentCase.state,
            constraints: [...argumentCase.state.constraints, ...returned.constraints],
          },
          value: returned.value,
        })
      }
    }
    return results
  }

  throw new Error(`Unsupported call expression: ${callee.getText()}`)
}

function evaluateRangeCallExpression(analyzer: SourceAnalyzer, state: RangeState, expression: ts.CallExpression): RangeEvalCase[] {
  let argumentCases: Array<{state: RangeState; values: RangeValue[]}> = [{state, values: []}]
  for (const argument of expression.arguments) {
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

  const callee = expression.expression
  if (ts.isPropertyAccessExpression(callee) && ts.isIdentifier(callee.expression) && callee.expression.text === 'Math') {
    return argumentCases.map(argumentCase => ({
      state: argumentCase.state,
      value: evaluateRangeMathCall(callee.name.text, argumentCase.values),
    }))
  }

  if (ts.isIdentifier(callee)) {
    const results: RangeEvalCase[] = []
    for (const argumentCase of argumentCases) {
      for (const returned of analyzer.evaluateFunctionRange(callee.text, argumentCase.values)) {
        results.push({
          state: argumentCase.state,
          value: returned.value,
        })
      }
    }
    return results
  }

  throw new Error(`Unsupported range call expression: ${callee.getText()}`)
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
  if (ts.isNumericLiteral(expression)) return Number(expression.text)
  if (ts.isIdentifier(expression)) return globals.get(expression.text) ?? null
  if (ts.isPrefixUnaryExpression(expression) && expression.operator === ts.SyntaxKind.MinusToken) {
    const operand = evaluateConstNumber(expression.operand, globals)
    return operand == null ? null : -operand
  }
  return null
}

function applyNumericOperator(left: NumberValue, right: NumberValue, operator: ts.SyntaxKind) {
  if (left.mode !== right.mode) throw new Error('Mixed concrete and symbolic numeric values are not supported')
  if (left.mode === 'concrete') {
    const leftValue = expectConcreteNumberValue(left)
    const rightValue = expectConcreteNumberValue(right)
    switch (operator) {
      case ts.SyntaxKind.PlusToken:
        return concreteNumber(leftValue + rightValue)
      case ts.SyntaxKind.MinusToken:
        return concreteNumber(leftValue - rightValue)
      case ts.SyntaxKind.AsteriskToken:
        return concreteNumber(leftValue * rightValue)
      case ts.SyntaxKind.SlashToken:
        return concreteNumber(leftValue / rightValue)
      default:
        throw new Error(`Unsupported concrete operator: ${ts.tokenToString(operator)}`)
    }
  }

  const leftExpr = expectSymbolicNumberValue(left)
  const rightExpr = expectSymbolicNumberValue(right)
  switch (operator) {
    case ts.SyntaxKind.PlusToken:
      return symbolicNumberFromExpr(addExpr(leftExpr, rightExpr))
    case ts.SyntaxKind.MinusToken:
      return symbolicNumberFromExpr(subExpr(leftExpr, rightExpr))
    case ts.SyntaxKind.AsteriskToken:
      return symbolicNumberFromExpr(mulExpr(leftExpr, rightExpr))
    case ts.SyntaxKind.SlashToken:
      return symbolicNumberFromExpr(divExpr(leftExpr, rightExpr))
    default:
      throw new Error(`Unsupported symbolic operator: ${ts.tokenToString(operator)}`)
  }
}

function applyComparisonOperator(left: NumberValue, right: NumberValue, operator: ts.SyntaxKind) {
  if (left.mode !== right.mode) throw new Error('Mixed concrete and symbolic comparison is not supported')
  if (left.mode === 'concrete') {
    const leftValue = expectConcreteNumberValue(left)
    const rightValue = expectConcreteNumberValue(right)
    switch (operator) {
      case ts.SyntaxKind.GreaterThanToken:
        return booleanValue('concrete', leftValue > rightValue)
      case ts.SyntaxKind.GreaterThanEqualsToken:
        return booleanValue('concrete', leftValue >= rightValue)
      case ts.SyntaxKind.LessThanToken:
        return booleanValue('concrete', leftValue < rightValue)
      case ts.SyntaxKind.LessThanEqualsToken:
        return booleanValue('concrete', leftValue <= rightValue)
      case ts.SyntaxKind.EqualsEqualsEqualsToken:
        return booleanValue('concrete', leftValue === rightValue)
      case ts.SyntaxKind.ExclamationEqualsEqualsToken:
        return booleanValue('concrete', leftValue !== rightValue)
      default:
        throw new Error(`Unsupported comparison operator: ${ts.tokenToString(operator)}`)
    }
  }

  const leftExpr = expectSymbolicNumberValue(left)
  const rightExpr = expectSymbolicNumberValue(right)
  return symbolicBoolean({
    kind: 'compare',
    op: comparisonTokenToOp(operator),
    left: leftExpr,
    right: rightExpr,
  })
}

function comparisonTokenToOp(token: ts.SyntaxKind): ComparisonOp {
  switch (token) {
    case ts.SyntaxKind.GreaterThanToken:
      return '>'
    case ts.SyntaxKind.GreaterThanEqualsToken:
      return '>='
    case ts.SyntaxKind.LessThanToken:
      return '<'
    case ts.SyntaxKind.LessThanEqualsToken:
      return '<='
    case ts.SyntaxKind.EqualsEqualsEqualsToken:
      return '==='
    case ts.SyntaxKind.ExclamationEqualsEqualsToken:
      return '!=='
    default:
      throw new Error(`Unsupported comparison token: ${ts.tokenToString(token)}`)
  }
}

function symbolicExprEquals(left: ScalarExpr, right: ScalarExpr) {
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
    terms[name] = nextCoefficient
    if (Math.abs(nextCoefficient) <= epsilon) delete terms[name]
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

function formatScalarExpr(expr: ScalarExpr): string {
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

function getProp(object: ObjectValue, key: string) {
  const value = object.props[key]
  if (value == null) throw new Error(`Missing property ${key}`)
  return value
}

function withConstraint(state: EvalState, constraint: BoolExpr): EvalState {
  return {
    ...state,
    constraints: [...state.constraints, constraint],
  }
}

function check(
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

function numberValue(mode: Mode, value: number): NumberValue {
  return mode === 'concrete' ? concreteNumber(value) : symbolicNumberFromExpr(constExpr(value))
}

function booleanValue(mode: Mode, value: boolean): BooleanValue {
  return mode === 'concrete' ? {kind: 'boolean', mode, value} : symbolicBoolean({
    kind: 'compare',
    op: '===',
    left: constExpr(value ? 1 : 0),
    right: constExpr(1),
  })
}

function concreteNumber(value: number): NumberValue {
  return {kind: 'number', mode: 'concrete', value}
}

function symbolicNumber(name: string): NumberValue {
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

function symbolicObject(props: Record<string, Value>): ObjectValue {
  return objectValue('symbolic', props)
}

function symbolicOpaque(label: string): OpaqueValue {
  return {kind: 'opaque', mode: 'symbolic', label}
}

function expectNumber(value: Value): NumberValue {
  if (value.kind !== 'number') throw new Error(`Expected number, got ${value.kind}`)
  return value
}

function expectConcreteNumber(value: Value) {
  const number = expectNumber(value)
  return expectConcreteNumberValue(number)
}

function expectSymbolicNumber(value: Value) {
  const number = expectNumber(value)
  return expectSymbolicNumberValue(number)
}

function expectBoolean(value: Value): BooleanValue {
  if (value.kind !== 'boolean') throw new Error(`Expected boolean, got ${value.kind}`)
  return value
}

function expectObject(value: Value): ObjectValue {
  if (value.kind !== 'object') throw new Error(`Expected object, got ${value.kind}`)
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

function rangeNumber(min: number, max: number, isInteger: boolean): RangeNumberValue {
  return {kind: 'range-number', min, max, isInteger}
}

function rangeBoolean(truth: RangeTruth): RangeBooleanValue {
  return {kind: 'range-boolean', truth}
}

function rangeObject(props: Record<string, RangeValue>): RangeObjectValue {
  return {kind: 'range-object', props}
}

function expectRangeNumber(value: RangeValue): RangeNumberValue {
  if (value.kind !== 'range-number') throw new Error(`Expected range number, got ${value.kind}`)
  return value
}

function expectRangeBoolean(value: RangeValue): RangeBooleanValue {
  if (value.kind !== 'range-boolean') throw new Error(`Expected range boolean, got ${value.kind}`)
  return value
}

function expectRangeObject(value: RangeValue): RangeObjectValue {
  if (value.kind !== 'range-object') throw new Error(`Expected range object, got ${value.kind}`)
  return value
}

function getRangeProp(object: RangeObjectValue, key: string) {
  const value = object.props[key]
  if (value == null) throw new Error(`Missing range property ${key}`)
  return value
}

function joinRangeCases(cases: RangeReturnCase[]): RangeValue {
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
    for (const key of Object.keys(left.props)) {
      props[key] = joinRangeValues(getRangeProp(left, key), getRangeProp(right, key))
    }
    return rangeObject(props)
  }
  if (left.kind === 'range-opaque' && right.kind === 'range-opaque') {
    if (left.label !== right.label) throw new Error(`Cannot join opaque values ${left.label} and ${right.label}`)
    return left
  }
  throw new Error(`Unsupported range join for ${left.kind}`)
}

function negateRangeNumber(value: RangeNumberValue) {
  return rangeNumber(-value.max, -value.min, value.isInteger)
}

function applyRangeNumericOperator(left: RangeNumberValue, right: RangeNumberValue, operator: ts.SyntaxKind): RangeNumberValue {
  switch (operator) {
    case ts.SyntaxKind.PlusToken:
      return rangeNumber(left.min + right.min, left.max + right.max, left.isInteger && right.isInteger)
    case ts.SyntaxKind.MinusToken:
      return rangeNumber(left.min - right.max, left.max - right.min, left.isInteger && right.isInteger)
    case ts.SyntaxKind.AsteriskToken: {
      const products = [
        left.min * right.min,
        left.min * right.max,
        left.max * right.min,
        left.max * right.max,
      ]
      return rangeNumber(Math.min(...products), Math.max(...products), left.isInteger && right.isInteger)
    }
    case ts.SyntaxKind.SlashToken: {
      if (right.min <= 0 && right.max >= 0) throw new Error('Division by an interval spanning zero is not supported')
      const quotients = [
        left.min / right.min,
        left.min / right.max,
        left.max / right.min,
        left.max / right.max,
      ]
      return rangeNumber(Math.min(...quotients), Math.max(...quotients), false)
    }
    default:
      throw new Error(`Unsupported range numeric operator: ${ts.tokenToString(operator)}`)
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
  return rangeNumber(
    Math.min(left.min, right.min),
    Math.min(left.max, right.max),
    left.isInteger && right.isInteger,
  )
}

function maxRangeNumber(left: RangeNumberValue, right: RangeNumberValue): RangeNumberValue {
  return rangeNumber(
    Math.max(left.min, right.min),
    Math.max(left.max, right.max),
    left.isInteger && right.isInteger,
  )
}

function constExpr(value: number): ScalarExpr {
  return {kind: 'const', value}
}

function varExpr(name: string): ScalarExpr {
  return {kind: 'var', name}
}

function addExpr(left: ScalarExpr, right: ScalarExpr): ScalarExpr {
  return {kind: 'add', left, right}
}

function subExpr(left: ScalarExpr, right: ScalarExpr): ScalarExpr {
  return {kind: 'sub', left, right}
}

function mulExpr(left: ScalarExpr, right: ScalarExpr): ScalarExpr {
  return {kind: 'mul', left, right}
}

function divExpr(left: ScalarExpr, right: ScalarExpr): ScalarExpr {
  return {kind: 'div', left, right}
}

function unsupported(message: string): never {
  throw new Error(message)
}
