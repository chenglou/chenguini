import * as ts from 'typescript'

export type LayoutCheckStatus = 'pass' | 'fail' | 'unknown'

export type LayoutCheck = {
  file: string
  functionName: string
  text: string
  status: LayoutCheckStatus
  reason?: string
}

export type LayoutCheckReport = {
  phase: 'ready' | 'error'
  files: string[]
  checks: LayoutCheck[]
  summary: {
    pass: number
    fail: number
    unknown: number
  }
}

type LayoutSpec =
  | {
      kind: 'given-range'
      name: string
      valueKind: 'int' | 'number'
      min: number
      max: number
      text: string
    }
  | {
      kind: 'given-comparison'
      left: string
      op: ComparisonOperator
      right: string
      text: string
    }
  | {
      kind: 'check-range'
      expression: string
      valueKind: 'int' | 'number'
      min: number
      max: number
      text: string
    }
  | {
      kind: 'check-comparison'
      left: string
      op: ComparisonOperator
      right: string
      text: string
    }

type ComparisonOperator = '==' | '>=' | '<=' | '>' | '<'

type Program = {
  sourceFile: ts.SourceFile
  globals: Map<string, NumberValue>
  functions: Map<string, ts.FunctionDeclaration>
  specsByFunction: Map<string, LayoutSpec[]>
}

type Value = NumberValue | ObjectValue | UnknownValue

type NumberValue = {
  kind: 'number'
  min: number
  max: number
  isInteger: boolean
  expr: string | null
  linear: LinearExpr | null
}

type ObjectValue = {
  kind: 'object'
  props: Map<string, Value>
  expr: string | null
}

type UnknownValue = {
  kind: 'unknown'
  reason: string
}

type EvalContext = {
  program: Program
  file: string
  env: Map<string, Value>
  stack: string[]
  checks: LayoutCheck[]
  assumptions: LinearConstraint[]
}

const maxInlineDepth = 12
const maxLinearReductionDepth = 4
const linearEpsilon = 1e-9

type LinearExpr = {
  constant: number
  terms: Map<string, number>
}

type LinearConstraint = {
  diff: LinearExpr
  op: ComparisonOperator
}

export async function verifyLayoutFiles(paths: string[]): Promise<LayoutCheckReport> {
  const checks: LayoutCheck[] = []
  for (const path of paths) {
    const sourceText = await Bun.file(path).text()
    checks.push(...verifyLayoutSource(path, sourceText))
  }

  const summary = {
    pass: checks.filter(check => check.status === 'pass').length,
    fail: checks.filter(check => check.status === 'fail').length,
    unknown: checks.filter(check => check.status === 'unknown').length,
  }
  return {
    phase: summary.fail === 0 && summary.unknown === 0 ? 'ready' : 'error',
    files: paths,
    checks,
    summary,
  }
}

export function verifyLayoutSource(file: string, sourceText: string): LayoutCheck[] {
  const sourceFile = ts.createSourceFile(file, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  const program = buildProgram(sourceFile, sourceText)
  const checks: LayoutCheck[] = []

  for (const statement of sourceFile.statements) {
    if (!ts.isFunctionDeclaration(statement)) continue
    if (statement.name == null) continue
    const specs = program.specsByFunction.get(statement.name.text) ?? []
    if (specs.length === 0) continue
    checks.push(...verifyFunctionSpecs(file, program, statement, specs))
  }

  return checks
}

function buildProgram(sourceFile: ts.SourceFile, sourceText: string): Program {
  const globals = new Map<string, NumberValue>()
  const functions = new Map<string, ts.FunctionDeclaration>()
  const specsByFunction = new Map<string, LayoutSpec[]>()

  for (const statement of sourceFile.statements) {
    if (ts.isFunctionDeclaration(statement) && statement.name != null) {
      functions.set(statement.name.text, statement)
      specsByFunction.set(statement.name.text, parseLayoutSpecs(sourceText, statement))
      continue
    }
    if (!ts.isVariableStatement(statement)) continue
    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name) || declaration.initializer == null) continue
      const literal = numericLiteralValue(declaration.initializer)
      if (literal == null) continue
      globals.set(declaration.name.text, numberValue(literal, literal, Number.isInteger(literal), declaration.name.text, linearConstant(literal)))
    }
  }

  return {sourceFile, globals, functions, specsByFunction}
}

function parseLayoutSpecs(sourceText: string, node: ts.Node): LayoutSpec[] {
  const commentRanges = ts.getLeadingCommentRanges(sourceText, node.pos) ?? []
  const specs: LayoutSpec[] = []

  for (const range of commentRanges) {
    const comment = sourceText.slice(range.pos, range.end)
    if (!comment.includes('@layout')) continue
    const lines = comment.split(/\r?\n/).map(cleanCommentLine)
    for (const line of lines) {
      if (line.length === 0 || line === '@layout') continue
      if (line.startsWith('@layout')) continue
      specs.push(parseLayoutSpecLine(line))
    }
  }

  return specs
}

function cleanCommentLine(line: string) {
  return line
    .replace(/^\s*\/\*\*?/, '')
    .replace(/\*\/\s*$/, '')
    .replace(/^\s*\*\s?/, '')
    .trim()
}

function parseLayoutSpecLine(line: string): LayoutSpec {
  const givenRange = /^given\s+([A-Za-z_$][\w$]*)\s*:\s*(int|number)\[(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)\]$/.exec(line)
  if (givenRange != null) {
    return {
      kind: 'given-range',
      name: givenRange[1]!,
      valueKind: givenRange[2]! as 'int' | 'number',
      min: Number(givenRange[3]!),
      max: Number(givenRange[4]!),
      text: line,
    }
  }

  const givenComparison = /^given\s+(.+?)\s*(==|>=|<=|>|<)\s*(.+)$/.exec(line)
  if (givenComparison != null) {
    const left = givenComparison[1]!.trim()
    const right = givenComparison[3]!.trim()
    parseExpression(left)
    parseExpression(right)
    return {
      kind: 'given-comparison',
      left,
      op: givenComparison[2]! as ComparisonOperator,
      right,
      text: line,
    }
  }

  const checkRange = /^(.+)\s*:\s*(int|number)\[(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)\]$/.exec(line)
  if (checkRange != null) {
    const expression = checkRange[1]!.trim()
    parseExpression(expression)
    return {
      kind: 'check-range',
      expression,
      valueKind: checkRange[2]! as 'int' | 'number',
      min: Number(checkRange[3]!),
      max: Number(checkRange[4]!),
      text: line,
    }
  }

  const checkComparison = /^(.+?)\s*(==|>=|<=|>|<)\s*(.+)$/.exec(line)
  if (checkComparison != null) {
    const left = checkComparison[1]!.trim()
    const right = checkComparison[3]!.trim()
    parseExpression(left)
    parseExpression(right)
    return {
      kind: 'check-comparison',
      left,
      op: checkComparison[2]! as ComparisonOperator,
      right,
      text: line,
    }
  }

  throw new Error(`Unsupported @layout line: ${line}`)
}

function verifyFunctionSpecs(
  file: string,
  program: Program,
  fn: ts.FunctionDeclaration,
  specs: LayoutSpec[],
): LayoutCheck[] {
  const functionName = fn.name?.text ?? '<anonymous>'
  const env = new Map<string, Value>()
  for (const [name, value] of program.globals) env.set(name, value)

  for (const param of fn.parameters) {
    if (!ts.isIdentifier(param.name)) continue
    env.set(param.name.text, unknownNumber(param.name.text))
  }

  for (const spec of specs) {
    if (spec.kind !== 'given-range') continue
    env.set(spec.name, numberValue(spec.min, spec.max, spec.valueKind === 'int', spec.name, linearVariable(spec.name)))
  }

  const assumptions = collectComparisonAssumptions(file, program, functionName, env, specs)
  const context: EvalContext = {program, file, env, stack: [functionName], checks: [], assumptions}
  const result = evaluateFunctionBody(fn, context)
  const checks: LayoutCheck[] = [...context.checks]

  for (const spec of specs) {
    if (spec.kind === 'given-range' || spec.kind === 'given-comparison') continue
    checks.push(verifyCheckSpec(file, program, functionName, env, result, spec, checks, assumptions))
  }

  return checks
}

function collectComparisonAssumptions(
  file: string,
  program: Program,
  functionName: string,
  env: Map<string, Value>,
  specs: LayoutSpec[],
): LinearConstraint[] {
  const assumptions: LinearConstraint[] = []
  const context: EvalContext = {program, file, env, stack: [functionName], checks: [], assumptions}
  for (const spec of specs) {
    if (spec.kind === 'given-range') {
      assumptions.push(...rangeFactsFromSpec(spec))
      continue
    }
    if (spec.kind === 'given-comparison') {
      const fact = comparisonFactFromSpec(spec, context)
      if (fact != null) assumptions.push(fact)
    }
  }
  return assumptions
}

function verifyCheckSpec(
  file: string,
  program: Program,
  functionName: string,
  baseEnv: Map<string, Value>,
  result: Value,
  spec: Extract<LayoutSpec, {kind: 'check-range'} | {kind: 'check-comparison'}>,
  checks: LayoutCheck[],
  assumptions: LinearConstraint[],
): LayoutCheck {
  const env = new Map(baseEnv)
  env.set('result', result)
  const context: EvalContext = {program, file, env, stack: [functionName], checks, assumptions}

  if (spec.kind === 'check-range') {
    const value = evaluateSpecExpression(spec.expression, context)
    const status = proveRange(value, spec.min, spec.max, spec.valueKind === 'int')
    return {
      file,
      functionName,
      text: spec.text,
      status: status.status,
      ...(status.reason == null ? {} : {reason: status.reason}),
    }
  }

  const left = evaluateSpecExpression(spec.left, context)
  const right = evaluateSpecExpression(spec.right, context)
  const status = proveComparison(left, spec.op, right, context.assumptions)
  return {
    file,
    functionName,
    text: spec.text,
    status: status.status,
    ...(status.reason == null ? {} : {reason: status.reason}),
  }
}

function evaluateSpecExpression(text: string, context: EvalContext): Value {
  const expression = parseExpression(text)
  return evaluateExpression(expression, context)
}

function parseExpression(text: string): ts.Expression {
  const sourceFile = ts.createSourceFile('layout-spec-expression.ts', `const value = ${text}`, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  const parseDiagnostics = (sourceFile as ts.SourceFile & {parseDiagnostics: readonly ts.Diagnostic[]}).parseDiagnostics
  if (parseDiagnostics.length > 0 || sourceFile.statements.length !== 1) throw new Error(`Could not parse @layout expression: ${text}`)
  const statement = sourceFile.statements[0]
  if (statement == null || !ts.isVariableStatement(statement)) throw new Error(`Could not parse @layout expression: ${text}`)
  const declaration = statement.declarationList.declarations[0]
  if (declaration == null || declaration.initializer == null) throw new Error(`Could not parse @layout expression: ${text}`)
  return declaration.initializer
}

function evaluateFunctionBody(fn: ts.FunctionDeclaration, context: EvalContext): Value {
  if (fn.body == null) return unknown(`Function ${fn.name?.text ?? '<anonymous>'} has no body`)
  const localEnv = new Map(context.env)
  const localContext: EvalContext = {...context, env: localEnv}

  for (const statement of fn.body.statements) {
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        bindVariableDeclaration(declaration, localContext)
      }
      continue
    }
    if (ts.isReturnStatement(statement)) {
      if (statement.expression == null) return unknown('Return without expression')
      return evaluateExpression(statement.expression, localContext)
    }
    return unknown(`Unsupported statement in ${context.stack.at(-1) ?? '<unknown>'}: ${statement.getText(context.program.sourceFile)}`)
  }

  return unknown(`Function ${context.stack.at(-1) ?? '<unknown>'} did not return`)
}

function bindVariableDeclaration(declaration: ts.VariableDeclaration, context: EvalContext) {
  if (!ts.isIdentifier(declaration.name)) return
  if (declaration.initializer == null) {
    context.env.set(declaration.name.text, unknown(`Uninitialized local ${declaration.name.text}`))
    return
  }
  context.env.set(declaration.name.text, evaluateExpression(declaration.initializer, context))
}

function evaluateExpression(expression: ts.Expression, context: EvalContext): Value {
  if (ts.isNumericLiteral(expression)) {
    const value = Number(expression.text)
    return numberValue(value, value, Number.isInteger(value), expression.text, linearConstant(value))
  }
  if (ts.isIdentifier(expression)) return context.env.get(expression.text) ?? unknown(`Unknown identifier ${expression.text}`)
  if (ts.isParenthesizedExpression(expression)) return evaluateExpression(expression.expression, context)
  if (ts.isPrefixUnaryExpression(expression)) return evaluatePrefixUnary(expression, context)
  if (ts.isBinaryExpression(expression)) return evaluateBinary(expression, context)
  if (ts.isConditionalExpression(expression)) return evaluateConditional(expression, context)
  if (ts.isCallExpression(expression)) return evaluateCall(expression, context)
  if (ts.isPropertyAccessExpression(expression)) return evaluatePropertyAccess(expression, context)
  if (ts.isObjectLiteralExpression(expression)) return evaluateObjectLiteral(expression, context)
  return unknown(`Unsupported expression: ${expression.getText(context.program.sourceFile)}`)
}

function evaluatePrefixUnary(expression: ts.PrefixUnaryExpression, context: EvalContext): Value {
  const value = evaluateExpression(expression.operand, context)
  if (value.kind !== 'number') return unknown('Unary operator expected a number')
  switch (expression.operator) {
    case ts.SyntaxKind.MinusToken:
      return numberValue(-value.max, -value.min, value.isInteger, value.expr == null ? null : `-${value.expr}`, linearScale(value.linear, -1))
    case ts.SyntaxKind.PlusToken:
      return value
    default:
      return unknown(`Unsupported unary operator ${ts.SyntaxKind[expression.operator]}`)
  }
}

function evaluateBinary(expression: ts.BinaryExpression, context: EvalContext): Value {
  const op = expression.operatorToken.kind
  if (isComparisonSyntax(op)) {
    return unknown('Comparison expressions are only supported in condition positions')
  }
  const left = evaluateExpression(expression.left, context)
  const right = evaluateExpression(expression.right, context)
  if (left.kind !== 'number' || right.kind !== 'number') return unknown('Binary arithmetic expected numbers')

  switch (op) {
    case ts.SyntaxKind.PlusToken:
      return numberValue(left.min + right.min, left.max + right.max, left.isInteger && right.isInteger, binaryExpr(left, '+', right), linearAdd(left.linear, right.linear))
    case ts.SyntaxKind.MinusToken:
      return numberValue(left.min - right.max, left.max - right.min, left.isInteger && right.isInteger, binaryExpr(left, '-', right), linearSubtract(left.linear, right.linear))
    case ts.SyntaxKind.AsteriskToken:
      return multiplyNumbers(left, right)
    case ts.SyntaxKind.SlashToken:
      return divideNumbers(left, right)
    case ts.SyntaxKind.AsteriskAsteriskToken:
      return powerNumbers(left, right)
    default:
      return unknown(`Unsupported binary operator ${ts.SyntaxKind[op]}`)
  }
}

function evaluateConditional(expression: ts.ConditionalExpression, context: EvalContext): Value {
  const truth = evaluateCondition(expression.condition, context)
  switch (truth) {
    case 'true':
      return evaluateExpression(expression.whenTrue, context)
    case 'false':
      return evaluateExpression(expression.whenFalse, context)
    case 'maybe':
      return joinValues(
        evaluateExpression(expression.whenTrue, context),
        evaluateExpression(expression.whenFalse, context),
      )
  }
}

function evaluateCall(expression: ts.CallExpression, context: EvalContext): Value {
  if (ts.isPropertyAccessExpression(expression.expression)) {
    const target = expression.expression
    if (ts.isIdentifier(target.expression) && target.expression.text === 'Math') {
      return evaluateMathCall(target.name.text, expression.arguments, context)
    }
  }
  if (!ts.isIdentifier(expression.expression)) return unknown('Only named pure calls are supported')

  const functionName = expression.expression.text
  const fn = context.program.functions.get(functionName)
  if (fn == null) return unknown(`Unknown function ${functionName}`)
  if (context.stack.length >= maxInlineDepth) return unknown(`Inline depth exceeded at ${functionName}`)
  if (fn.parameters.length !== expression.arguments.length) return unknown(`Call arity mismatch for ${functionName}`)
  const argumentValues = expression.arguments.map(argument => evaluateExpression(argument, context))
  verifyCallGivenSpecs(functionName, fn, expression, argumentValues, context)

  const env = new Map<string, Value>()
  for (const [name, value] of context.program.globals) env.set(name, value)
  for (let i = 0; i < fn.parameters.length; i++) {
    const param = fn.parameters[i]!
    if (!ts.isIdentifier(param.name)) return unknown(`Unsupported parameter pattern in ${functionName}`)
    env.set(param.name.text, argumentValues[i] ?? unknown(`Missing argument ${i} for ${functionName}`))
  }

  return evaluateFunctionBody(fn, {
    program: context.program,
    file: context.file,
    env,
    stack: [...context.stack, functionName],
    checks: context.checks,
    assumptions: context.assumptions,
  })
}

function verifyCallGivenSpecs(
  functionName: string,
  fn: ts.FunctionDeclaration,
  expression: ts.CallExpression,
  argumentValues: Value[],
  context: EvalContext,
) {
  const specs = context.program.specsByFunction.get(functionName) ?? []
  const callText = `${functionName}(${expression.arguments.map(argument => argument.getText(context.program.sourceFile)).join(', ')})`
  const env = new Map<string, Value>()
  for (const [name, value] of context.program.globals) env.set(name, value)
  for (let i = 0; i < fn.parameters.length; i++) {
    const param = fn.parameters[i]!
    if (!ts.isIdentifier(param.name)) continue
    env.set(param.name.text, argumentValues[i] ?? unknown(`Missing argument ${i} for ${functionName}`))
  }
  const calleeContext: EvalContext = {...context, env}

  for (const spec of specs) {
    let status: {status: LayoutCheckStatus; reason?: string} | null = null
    if (spec.kind === 'given-range') {
      const paramIndex = parameterIndex(fn, spec.name)
      const value =
        paramIndex == null
          ? unknown(`Call target ${functionName} has no parameter named ${spec.name}`)
          : argumentValues[paramIndex] ?? unknown(`Call target ${functionName} missing argument for ${spec.name}`)
      status = proveRange(value, spec.min, spec.max, spec.valueKind === 'int')
    }
    if (spec.kind === 'given-comparison') {
      const left = evaluateSpecExpression(spec.left, calleeContext)
      const right = evaluateSpecExpression(spec.right, calleeContext)
      status = proveComparison(left, spec.op, right, calleeContext.assumptions)
    }
    if (status == null) continue
    context.checks.push({
      file: context.file,
      functionName: context.stack.join(' > '),
      text: `call ${callText}: ${spec.text}`,
      status: status.status,
      ...(status.reason == null ? {} : {reason: status.reason}),
    })
  }
}

function parameterIndex(fn: ts.FunctionDeclaration, name: string): number | null {
  for (let i = 0; i < fn.parameters.length; i++) {
    const param = fn.parameters[i]!
    if (ts.isIdentifier(param.name) && param.name.text === name) return i
  }
  return null
}

function evaluateMathCall(name: string, args: ts.NodeArray<ts.Expression>, context: EvalContext): Value {
  const values = args.map(arg => evaluateExpression(arg, context))
  if (values.some(value => value.kind !== 'number')) return unknown(`Math.${name} expected numbers`)
  const numbers = values as NumberValue[]

  switch (name) {
    case 'floor': {
      const value = numbers[0]
      if (value == null) return unknown('Math.floor expects one argument')
      return numberValue(Math.floor(value.min), Math.floor(value.max), true, value.expr == null ? null : `floor(${value.expr})`)
    }
    case 'ceil': {
      const value = numbers[0]
      if (value == null) return unknown('Math.ceil expects one argument')
      return numberValue(Math.ceil(value.min), Math.ceil(value.max), true, value.expr == null ? null : `ceil(${value.expr})`)
    }
    case 'sqrt': {
      const value = numbers[0]
      if (value == null) return unknown('Math.sqrt expects one argument')
      if (value.min < 0) return unknown('Math.sqrt over a negative range is unsupported')
      return numberValue(Math.sqrt(value.min), Math.sqrt(value.max), false, value.expr == null ? null : `sqrt(${value.expr})`)
    }
    case 'min': {
      if (numbers.length === 0) return unknown('Math.min expects at least one argument')
      return numberValue(Math.min(...numbers.map(value => value.min)), Math.min(...numbers.map(value => value.max)), numbers.every(value => value.isInteger), callExpr('min', numbers))
    }
    case 'max': {
      if (numbers.length === 0) return unknown('Math.max expects at least one argument')
      return numberValue(Math.max(...numbers.map(value => value.min)), Math.max(...numbers.map(value => value.max)), numbers.every(value => value.isInteger), callExpr('max', numbers))
    }
    default:
      return unknown(`Math.${name} is not in the static layout subset`)
  }
}

function evaluatePropertyAccess(expression: ts.PropertyAccessExpression, context: EvalContext): Value {
  const target = evaluateExpression(expression.expression, context)
  if (target.kind !== 'object') return unknown(`Property access ${expression.name.text} expected an object`)
  return target.props.get(expression.name.text) ?? unknown(`Unknown property ${expression.name.text}`)
}

function evaluateObjectLiteral(expression: ts.ObjectLiteralExpression, context: EvalContext): Value {
  const props = new Map<string, Value>()
  for (const property of expression.properties) {
    if (ts.isShorthandPropertyAssignment(property)) {
      props.set(property.name.text, evaluateExpression(property.name, context))
      continue
    }
    if (ts.isPropertyAssignment(property) && ts.isIdentifier(property.name)) {
      props.set(property.name.text, evaluateExpression(property.initializer, context))
      continue
    }
    return unknown(`Unsupported object literal property: ${property.getText(context.program.sourceFile)}`)
  }
  return {kind: 'object', props, expr: null}
}

type Truth = 'true' | 'false' | 'maybe'

function evaluateCondition(expression: ts.Expression, context: EvalContext): Truth {
  if (!ts.isBinaryExpression(expression)) return 'maybe'
  const op = expression.operatorToken.kind
  if (!isComparisonSyntax(op)) return 'maybe'
  const left = evaluateExpression(expression.left, context)
  const right = evaluateExpression(expression.right, context)
  if (left.kind !== 'number' || right.kind !== 'number') return 'maybe'
  const status = proveComparison(left, syntaxToComparison(op), right, context.assumptions)
  if (status.status === 'pass') return 'true'
  if (status.status === 'fail') return 'false'
  return 'maybe'
}

function isComparisonSyntax(kind: ts.SyntaxKind) {
  return (
    kind === ts.SyntaxKind.EqualsEqualsEqualsToken ||
    kind === ts.SyntaxKind.EqualsEqualsToken ||
    kind === ts.SyntaxKind.GreaterThanEqualsToken ||
    kind === ts.SyntaxKind.LessThanEqualsToken ||
    kind === ts.SyntaxKind.GreaterThanToken ||
    kind === ts.SyntaxKind.LessThanToken
  )
}

function syntaxToComparison(kind: ts.SyntaxKind): ComparisonOperator {
  switch (kind) {
    case ts.SyntaxKind.EqualsEqualsEqualsToken:
    case ts.SyntaxKind.EqualsEqualsToken:
      return '=='
    case ts.SyntaxKind.GreaterThanEqualsToken:
      return '>='
    case ts.SyntaxKind.LessThanEqualsToken:
      return '<='
    case ts.SyntaxKind.GreaterThanToken:
      return '>'
    case ts.SyntaxKind.LessThanToken:
      return '<'
    default:
      throw new Error(`Not a comparison syntax: ${ts.SyntaxKind[kind]}`)
  }
}

function compareRanges(left: NumberValue, op: ComparisonOperator, right: NumberValue): Truth {
  switch (op) {
    case '==':
      if (left.min === left.max && right.min === right.max && left.min === right.min) return 'true'
      if (left.max < right.min || right.max < left.min) return 'false'
      return 'maybe'
    case '>=':
      if (left.min >= right.max) return 'true'
      if (left.max < right.min) return 'false'
      return 'maybe'
    case '<=':
      if (left.max <= right.min) return 'true'
      if (left.min > right.max) return 'false'
      return 'maybe'
    case '>':
      if (left.min > right.max) return 'true'
      if (left.max <= right.min) return 'false'
      return 'maybe'
    case '<':
      if (left.max < right.min) return 'true'
      if (left.min >= right.max) return 'false'
      return 'maybe'
  }
}

function proveRange(value: Value, min: number, max: number, requireInteger: boolean): {status: LayoutCheckStatus; reason?: string} {
  if (value.kind !== 'number') return {status: 'unknown', reason: nonNumberReason(value)}
  if (value.min < min || value.max > max) return {
    status: 'fail',
    reason: `range was ${formatRange(value)}, expected inside ${requireInteger ? 'int' : 'number'}[${min}, ${max}]`,
  }
  if (requireInteger && !value.isInteger) return {status: 'fail', reason: `range was ${formatRange(value)}, expected integer`}
  return {status: 'pass'}
}

function proveComparison(left: Value, op: ComparisonOperator, right: Value, assumptions: LinearConstraint[]): {status: LayoutCheckStatus; reason?: string} {
  if (left.kind !== 'number') return {status: 'unknown', reason: nonNumberReason(left)}
  if (right.kind !== 'number') return {status: 'unknown', reason: nonNumberReason(right)}
  if (op === '==' && left.expr != null && right.expr != null && left.expr === right.expr) return {status: 'pass'}
  const truth = compareRanges(left, op, right)
  if (truth === 'true') return {status: 'pass'}
  if (truth === 'false') return {status: 'fail', reason: `${formatRange(left)} ${op} ${formatRange(right)} is false`}
  const linearTruth = compareLinear(left, op, right, assumptions)
  if (linearTruth === 'true') return {status: 'pass'}
  if (linearTruth === 'false') return {status: 'fail', reason: `${formatRange(left)} ${op} ${formatRange(right)} is false by exact linear facts`}
  return {status: 'unknown', reason: `${formatRange(left)} ${op} ${formatRange(right)} was not proven`}
}

function comparisonFactFromSpec(spec: Extract<LayoutSpec, {kind: 'given-comparison'}>, context: EvalContext): LinearConstraint | null {
  const left = evaluateSpecExpression(spec.left, context)
  const right = evaluateSpecExpression(spec.right, context)
  if (left.kind !== 'number' || right.kind !== 'number') return null
  const diff = linearSubtract(left.linear, right.linear)
  return diff == null ? null : {diff, op: spec.op}
}

function rangeFactsFromSpec(spec: Extract<LayoutSpec, {kind: 'given-range'}>): LinearConstraint[] {
  const value = linearVariable(spec.name)
  const minDiff = linearSubtract(value, linearConstant(spec.min))
  const maxDiff = linearSubtract(linearConstant(spec.max), value)
  const facts: LinearConstraint[] = []
  if (minDiff != null) facts.push({diff: minDiff, op: '>='})
  if (maxDiff != null) facts.push({diff: maxDiff, op: '>='})
  return facts
}

function compareLinear(left: NumberValue, op: ComparisonOperator, right: NumberValue, assumptions: LinearConstraint[]): Truth {
  const diff = linearSubtract(left.linear, right.linear)
  if (diff == null) return 'maybe'

  switch (op) {
    case '==':
      if (isZeroLinear(diff)) return 'true'
      return provesNonNegative(diff, false, assumptions) && provesNonNegative(linearScaleExact(diff, -1), false, assumptions) ? 'true' : 'maybe'
    case '>=':
      return provesNonNegative(diff, false, assumptions) ? 'true' : 'maybe'
    case '<=':
      return provesNonNegative(linearScaleExact(diff, -1), false, assumptions) ? 'true' : 'maybe'
    case '>':
      if (isZeroLinear(diff)) return 'false'
      return provesNonNegative(diff, true, assumptions) ? 'true' : 'maybe'
    case '<':
      if (isZeroLinear(diff)) return 'false'
      return provesNonNegative(linearScaleExact(diff, -1), true, assumptions) ? 'true' : 'maybe'
  }
}

function provesNonNegative(diff: LinearExpr, strict: boolean, assumptions: LinearConstraint[]) {
  const facts = assumptions.flatMap(nonNegativeFacts)
  return reduceToNonNegative(diff, strict, facts, maxLinearReductionDepth, new Set())
}

function reduceToNonNegative(
  diff: LinearExpr,
  strict: boolean,
  facts: Array<{diff: LinearExpr; strict: boolean}>,
  depth: number,
  seen: Set<string>,
): boolean {
  const cleanDiff = cleanLinear(diff)
  if (linearConstantStatus(cleanDiff, strict)) return true
  for (const fact of facts) {
    const scale = positiveScaleMultiple(cleanDiff, fact.diff)
    if (scale != null && (!strict || fact.strict)) return true
  }
  if (depth === 0) return false

  const key = `${strict ? 'strict' : 'loose'}:${linearKey(cleanDiff)}`
  if (seen.has(key)) return false
  seen.add(key)

  for (const fact of facts) {
    for (const scale of reductionScales(cleanDiff, fact.diff)) {
      const scaledFact = linearScaleExact(fact.diff, scale)
      const remainder = linearSubtract(cleanDiff, scaledFact)
      if (remainder == null || sameLinear(remainder, cleanDiff)) continue
      if (reduceToNonNegative(remainder, strict && !fact.strict, facts, depth - 1, new Set(seen))) return true
    }
  }
  return false
}

function nonNegativeFacts(assumption: LinearConstraint): Array<{diff: LinearExpr; strict: boolean}> {
  switch (assumption.op) {
    case '==':
      return [
        {diff: assumption.diff, strict: false},
        {diff: linearScaleExact(assumption.diff, -1), strict: false},
      ]
    case '>=':
      return [{diff: assumption.diff, strict: false}]
    case '<=':
      return [{diff: linearScaleExact(assumption.diff, -1), strict: false}]
    case '>':
      return [{diff: assumption.diff, strict: true}]
    case '<':
      return [{diff: linearScaleExact(assumption.diff, -1), strict: true}]
  }
}

function nonNumberReason(value: ObjectValue | UnknownValue) {
  return value.kind === 'unknown' ? value.reason : 'Expected a number, got an object'
}

function numberValue(min: number, max: number, isInteger: boolean, expr: string | null, linear: LinearExpr | null = null): NumberValue {
  return {kind: 'number', min, max, isInteger, expr, linear}
}

function unknownNumber(name: string): NumberValue {
  return {
    kind: 'number',
    min: Number.NEGATIVE_INFINITY,
    max: Number.POSITIVE_INFINITY,
    isInteger: false,
    expr: name,
    linear: linearVariable(name),
  }
}

function unknown(reason: string): UnknownValue {
  return {kind: 'unknown', reason}
}

function numericLiteralValue(expression: ts.Expression): number | null {
  if (ts.isNumericLiteral(expression)) return Number(expression.text)
  if (ts.isPrefixUnaryExpression(expression) && expression.operator === ts.SyntaxKind.MinusToken && ts.isNumericLiteral(expression.operand)) {
    return -Number(expression.operand.text)
  }
  return null
}

function linearConstant(value: number): LinearExpr {
  return {constant: value, terms: new Map()}
}

function linearVariable(name: string): LinearExpr {
  return {constant: 0, terms: new Map([[name, 1]])}
}

function linearAdd(left: LinearExpr | null, right: LinearExpr | null): LinearExpr | null {
  if (left == null || right == null) return null
  const terms = new Map(left.terms)
  for (const [name, coefficient] of right.terms) {
    terms.set(name, (terms.get(name) ?? 0) + coefficient)
  }
  return cleanLinear({constant: left.constant + right.constant, terms})
}

function linearSubtract(left: LinearExpr | null, right: LinearExpr | null): LinearExpr | null {
  if (left == null || right == null) return null
  return linearAdd(left, linearScaleExact(right, -1))
}

function linearScale(linear: LinearExpr | null, factor: number): LinearExpr | null {
  return linear == null ? null : linearScaleExact(linear, factor)
}

function linearScaleExact(linear: LinearExpr, factor: number): LinearExpr {
  const terms = new Map<string, number>()
  for (const [name, coefficient] of linear.terms) terms.set(name, coefficient * factor)
  return cleanLinear({constant: linear.constant * factor, terms})
}

function linearMultiply(left: NumberValue, right: NumberValue): LinearExpr | null {
  if (left.min === left.max) return linearScale(right.linear, left.min)
  if (right.min === right.max) return linearScale(left.linear, right.min)
  return null
}

function sameLinear(left: LinearExpr, right: LinearExpr) {
  const diff = linearSubtract(left, right)
  return diff != null && isZeroLinear(diff)
}

function cleanLinear(linear: LinearExpr): LinearExpr {
  const terms = new Map<string, number>()
  for (const [name, coefficient] of linear.terms) {
    if (Math.abs(coefficient) > linearEpsilon) terms.set(name, coefficient)
  }
  return {
    constant: Math.abs(linear.constant) > linearEpsilon ? linear.constant : 0,
    terms,
  }
}

function isZeroLinear(linear: LinearExpr) {
  return linear.constant === 0 && linear.terms.size === 0
}

function linearConstantStatus(linear: LinearExpr, strict: boolean) {
  if (linear.terms.size > 0) return false
  return strict ? linear.constant > linearEpsilon : linear.constant >= -linearEpsilon
}

function linearKey(linear: LinearExpr) {
  const parts = [`${linear.constant}`]
  for (const [name, coefficient] of [...linear.terms.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    parts.push(`${name}:${coefficient}`)
  }
  return parts.join('|')
}

function reductionScales(target: LinearExpr, fact: LinearExpr): number[] {
  const scales: number[] = []
  const names = new Set([...target.terms.keys(), ...fact.terms.keys()])
  for (const name of names) addReductionScale(scales, target.terms.get(name) ?? 0, fact.terms.get(name) ?? 0)
  addReductionScale(scales, target.constant, fact.constant)
  return scales
}

function addReductionScale(scales: number[], targetCoefficient: number, factCoefficient: number) {
  if (Math.abs(targetCoefficient) <= linearEpsilon || Math.abs(factCoefficient) <= linearEpsilon) return
  const scale = targetCoefficient / factCoefficient
  if (scale <= linearEpsilon) return
  if (!scales.some(existing => Math.abs(existing - scale) <= linearEpsilon)) scales.push(scale)
}

function positiveScaleMultiple(target: LinearExpr, fact: LinearExpr): number | null {
  let scale: number | null = null
  const names = new Set([...target.terms.keys(), ...fact.terms.keys()])
  for (const name of names) {
    const nextScale = coefficientScale(target.terms.get(name) ?? 0, fact.terms.get(name) ?? 0)
    if (nextScale === false) return null
    if (nextScale != null) scale = mergeScale(scale, nextScale)
    if (scale === Number.NEGATIVE_INFINITY) return null
  }

  const constantScale = coefficientScale(target.constant, fact.constant)
  if (constantScale === false) return null
  if (constantScale != null) scale = mergeScale(scale, constantScale)
  if (scale == null || scale === Number.NEGATIVE_INFINITY || scale <= 0) return null
  return scale
}

function coefficientScale(target: number, fact: number): number | null | false {
  if (Math.abs(fact) <= linearEpsilon) return Math.abs(target) <= linearEpsilon ? null : false
  return target / fact
}

function mergeScale(current: number | null, next: number): number {
  if (current == null) return next
  return Math.abs(current - next) <= linearEpsilon ? current : Number.NEGATIVE_INFINITY
}

function multiplyNumbers(left: NumberValue, right: NumberValue): NumberValue {
  const products = [
    left.min * right.min,
    left.min * right.max,
    left.max * right.min,
    left.max * right.max,
  ]
  return numberValue(Math.min(...products), Math.max(...products), left.isInteger && right.isInteger, binaryExpr(left, '*', right), linearMultiply(left, right))
}

function divideNumbers(left: NumberValue, right: NumberValue): Value {
  if (right.min <= 0 && right.max >= 0) return unknown('Division by a range containing zero is unsupported')
  const quotients = [
    left.min / right.min,
    left.min / right.max,
    left.max / right.min,
    left.max / right.max,
  ]
  return numberValue(Math.min(...quotients), Math.max(...quotients), false, binaryExpr(left, '/', right), right.min === right.max ? linearScale(left.linear, 1 / right.min) : null)
}

function powerNumbers(left: NumberValue, right: NumberValue): Value {
  if (right.min !== right.max) return unknown('Non-constant exponent is unsupported')
  if (right.min === 2 && left.min >= 0) return numberValue(left.min ** 2, left.max ** 2, left.isInteger, binaryExpr(left, '**', right))
  if (left.min === left.max) return numberValue(left.min ** right.min, left.min ** right.min, Number.isInteger(left.min ** right.min), binaryExpr(left, '**', right))
  return unknown('Only square of non-negative ranges is supported')
}

function joinValues(left: Value, right: Value): Value {
  if (left.kind === 'unknown') return left
  if (right.kind === 'unknown') return right
  if (left.kind === 'number' && right.kind === 'number') {
    return numberValue(
      Math.min(left.min, right.min),
      Math.max(left.max, right.max),
      left.isInteger && right.isInteger,
      left.expr != null && right.expr != null && left.expr === right.expr ? left.expr : null,
      left.linear != null && right.linear != null && sameLinear(left.linear, right.linear) ? left.linear : null,
    )
  }
  if (left.kind === 'object' && right.kind === 'object') {
    const keys = new Set([...left.props.keys(), ...right.props.keys()])
    const props = new Map<string, Value>()
    for (const key of keys) {
      const leftProp = left.props.get(key)
      const rightProp = right.props.get(key)
      props.set(key, leftProp == null || rightProp == null ? unknown(`Property ${key} only exists on one branch`) : joinValues(leftProp, rightProp))
    }
    return {kind: 'object', props, expr: left.expr != null && left.expr === right.expr ? left.expr : null}
  }
  return unknown('Branches returned incompatible value shapes')
}

function binaryExpr(left: NumberValue, op: string, right: NumberValue) {
  if (left.expr == null || right.expr == null) return null
  return `(${left.expr} ${op} ${right.expr})`
}

function callExpr(name: string, values: NumberValue[]) {
  const parts: string[] = []
  for (const value of values) {
    if (value.expr == null) return null
    parts.push(value.expr)
  }
  return `${name}(${parts.join(', ')})`
}

function formatRange(value: NumberValue) {
  const kind = value.isInteger ? 'int' : 'number'
  const expr = value.expr == null ? '' : ` as ${value.expr}`
  return `${kind}[${value.min}, ${value.max}]${expr}`
}
