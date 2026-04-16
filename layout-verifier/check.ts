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
      expression: string
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

type Value = NumberValue | ObjectValue | ArrayValue | UnknownValue

type NumberValue = {
  kind: 'number'
  min: number
  max: number
  isInteger: boolean
  expr: string | null
  linear: LinearExpr | null
  cases: NumberCase[] | null
}

type ObjectValue = {
  kind: 'object'
  props: Map<string, Value>
  expr: string | null
}

type ArrayValue = {
  kind: 'array'
  length: NumberValue
  elements: Value[] | null
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
const maxNumberCases = 8
const maxLinearReductionDepth = 4
const linearEpsilon = 1e-9

type LinearExpr = {
  constant: number
  terms: Map<string, number>
}

type LinearConstraint = {
  diff: LinearExpr | null
  op: ComparisonOperator
  text?: string
  leftExpr?: string
  rightExpr?: string
  source?: 'range' | 'comparison' | 'derived'
}

type NonNegativeFact = {
  diff: LinearExpr
  strict: boolean
  text?: string
}

type NumberCase = {
  value: NumberValue
  assumptions: LinearConstraint[]
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
  const givenRange = /^given\s+(.+)\s*:\s*(int|number)\[(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)\]$/.exec(line)
  if (givenRange != null) {
    const expression = givenRange[1]!.trim()
    parseExpression(expression)
    return {
      kind: 'given-range',
      expression,
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
    env.set(param.name.text, specMentionsArrayParam(param.name.text, specs) ? unknownArray(param.name.text) : unknownNumber(param.name.text))
  }

  for (const spec of specs) {
    if (spec.kind !== 'given-range') continue
    applyGivenRangeSpec(env, spec)
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
      const value = evaluateSpecExpression(spec.expression, context)
      assumptions.push(...rangeFactsFromValue(value, spec.min, spec.max))
      continue
    }
    if (spec.kind === 'given-comparison') {
      const fact = comparisonFactFromSpec(spec, context)
      if (fact != null) assumptions.push(fact)
    }
  }
  return assumptions
}

function applyGivenRangeSpec(env: Map<string, Value>, spec: Extract<LayoutSpec, {kind: 'given-range'}>) {
  const value = numberValue(spec.min, spec.max, spec.valueKind === 'int', spec.expression, linearVariable(spec.expression))
  const expression = parseExpression(spec.expression)
  if (ts.isIdentifier(expression)) {
    env.set(expression.text, value)
    return
  }

  const lengthRoot = arrayLengthRoot(expression)
  if (lengthRoot == null) return
  const target = env.get(lengthRoot)
  env.set(lengthRoot, target?.kind === 'array' ? {...target, length: value} : unknownArray(lengthRoot, value))
}

function specMentionsArrayParam(name: string, specs: LayoutSpec[]) {
  for (const spec of specs) {
    if (spec.kind === 'given-range' || spec.kind === 'check-range') {
      if (expressionMentionsArrayParam(parseExpression(spec.expression), name)) return true
      continue
    }
    if (expressionMentionsArrayParam(parseExpression(spec.left), name) || expressionMentionsArrayParam(parseExpression(spec.right), name)) return true
  }
  return false
}

function expressionMentionsArrayParam(expression: ts.Expression, name: string): boolean {
  const lengthRoot = arrayLengthRoot(expression)
  if (lengthRoot === name) return true
  if (ts.isElementAccessExpression(expression) && expressionRootName(expression.expression) === name) return true

  for (const child of expression.getChildren()) {
    if (ts.isExpression(child) && expressionMentionsArrayParam(child, name)) return true
  }
  return false
}

function arrayLengthRoot(expression: ts.Expression): string | null {
  if (!ts.isPropertyAccessExpression(expression)) return null
  if (expression.name.text !== 'length') return null
  return expressionRootName(expression.expression)
}

function expressionRootName(expression: ts.Expression): string | null {
  if (ts.isIdentifier(expression)) return expression.text
  if (ts.isParenthesizedExpression(expression)) return expressionRootName(expression.expression)
  return null
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
    const status = proveRange(value, spec.min, spec.max, spec.valueKind === 'int', context.assumptions)
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
  if (ts.isElementAccessExpression(expression)) return evaluateElementAccess(expression, context)
  if (ts.isObjectLiteralExpression(expression)) return evaluateObjectLiteral(expression, context)
  if (ts.isArrayLiteralExpression(expression)) return evaluateArrayLiteral(expression, context)
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

  return evaluateNumberBinary(op, left, right)
}

function evaluateNumberBinary(op: ts.SyntaxKind, left: NumberValue, right: NumberValue): Value {
  const plain = evaluatePlainNumberBinary(op, plainNumber(left), plainNumber(right))
  if (plain.kind !== 'number') return plain
  if (left.cases == null && right.cases == null) return plain

  const cases = combineNumberCases(left, right, (leftCase, rightCase) => evaluatePlainNumberBinary(op, leftCase, rightCase))
  return withNumberCases(plain, cases)
}

function evaluatePlainNumberBinary(op: ts.SyntaxKind, left: NumberValue, right: NumberValue): Value {
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

function combineNumberCases(
  left: NumberValue,
  right: NumberValue,
  evaluate: (left: NumberValue, right: NumberValue) => Value,
): NumberCase[] | null {
  if (left.cases == null && right.cases == null) return null
  const cases: NumberCase[] = []
  for (const leftCase of numberBranches(left)) {
    for (const rightCase of numberBranches(right)) {
      const value = evaluate(leftCase.value, rightCase.value)
      if (value.kind !== 'number') return null
      cases.push({
        value,
        assumptions: mergeAssumptions(leftCase.assumptions, rightCase.assumptions),
      })
      if (cases.length > maxNumberCases) return null
    }
  }
  return cases
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
      const value = evaluateSpecExpression(spec.expression, calleeContext)
      status = proveRange(value, spec.min, spec.max, spec.valueKind === 'int', calleeContext.assumptions)
      if (status.status !== 'pass') status = withCallRangeReason(status, value, spec)
    }
    if (spec.kind === 'given-comparison') {
      const left = evaluateSpecExpression(spec.left, calleeContext)
      const right = evaluateSpecExpression(spec.right, calleeContext)
      status = proveComparison(left, spec.op, right, calleeContext.assumptions)
      if (status.status !== 'pass') status = withCallComparisonReason(status, left, spec.op, right, spec.text)
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

function withCallRangeReason(
  status: {status: LayoutCheckStatus; reason?: string},
  value: Value,
  spec: Extract<LayoutSpec, {kind: 'given-range'}>,
): {status: LayoutCheckStatus; reason?: string} {
  if (value.kind !== 'number') return status
  return {
    ...status,
    reason: [
      `caller has ${formatRange(value)}`,
      `callee needs ${spec.expression}: ${spec.valueKind}[${spec.min}, ${spec.max}]`,
      ...missingRangeBounds(value, spec.min, spec.max),
    ].join('\n'),
  }
}

function withCallComparisonReason(
  status: {status: LayoutCheckStatus; reason?: string},
  left: Value,
  op: ComparisonOperator,
  right: Value,
  text: string,
): {status: LayoutCheckStatus; reason?: string} {
  if (left.kind !== 'number' || right.kind !== 'number') return status
  return {
    ...status,
    reason: [
      `callee needs ${text}`,
      `caller has ${formatRange(left)} ${op} ${formatRange(right)}`,
      ...(status.reason == null ? [] : status.reason.split('\n')),
    ].join('\n'),
  }
}

function evaluateMathCall(name: string, args: ts.NodeArray<ts.Expression>, context: EvalContext): Value {
  const values = args.map(arg => evaluateExpression(arg, context))
  const numbers: NumberValue[] = []
  for (const value of values) {
    if (value.kind !== 'number') return unknown(`Math.${name} expected numbers`)
    numbers.push(value)
  }

  switch (name) {
    case 'floor': {
      const value = numbers[0]
      if (value == null) return unknown('Math.floor expects one argument')
      return evaluateNumberUnary(value, floorNumber)
    }
    case 'ceil': {
      const value = numbers[0]
      if (value == null) return unknown('Math.ceil expects one argument')
      return evaluateNumberUnary(value, ceilNumber)
    }
    case 'round': {
      const value = numbers[0]
      if (value == null) return unknown('Math.round expects one argument')
      return evaluateNumberUnary(value, roundNumber)
    }
    case 'trunc': {
      const value = numbers[0]
      if (value == null) return unknown('Math.trunc expects one argument')
      return evaluateNumberUnary(value, truncNumber)
    }
    case 'abs': {
      const value = numbers[0]
      if (value == null) return unknown('Math.abs expects one argument')
      return absNumber(value, context.assumptions)
    }
    case 'sqrt': {
      const value = numbers[0]
      if (value == null) return unknown('Math.sqrt expects one argument')
      return evaluateNumberUnary(value, sqrtNumber)
    }
    case 'min': {
      if (numbers.length === 0) return unknown('Math.min expects at least one argument')
      return numbers.slice(1).reduce((current, next) => minNumberPair(current, next, context.assumptions), numbers[0]!)
    }
    case 'max': {
      if (numbers.length === 0) return unknown('Math.max expects at least one argument')
      return numbers.slice(1).reduce((current, next) => maxNumberPair(current, next, context.assumptions), numbers[0]!)
    }
    default:
      return unknown(`Math.${name} is not in the static layout subset`)
  }
}

function evaluateNumberUnary(value: NumberValue, evaluate: (value: NumberValue) => Value): Value {
  const plain = evaluate(plainNumber(value))
  if (plain.kind !== 'number') return plain
  if (value.cases == null) return plain

  const cases: NumberCase[] = []
  for (const valueCase of value.cases) {
    const caseResult = evaluate(valueCase.value)
    if (caseResult.kind !== 'number') return plain
    cases.push({value: caseResult, assumptions: valueCase.assumptions})
    if (cases.length > maxNumberCases) return plain
  }
  return withNumberCases(plain, cases)
}

function floorNumber(value: NumberValue): NumberValue {
  if (value.isInteger) return numberValue(value.min, value.max, true, value.expr, value.linear)
  return numberValue(Math.floor(value.min), Math.floor(value.max), true, value.expr == null ? null : `floor(${value.expr})`)
}

function ceilNumber(value: NumberValue): NumberValue {
  if (value.isInteger) return numberValue(value.min, value.max, true, value.expr, value.linear)
  return numberValue(Math.ceil(value.min), Math.ceil(value.max), true, value.expr == null ? null : `ceil(${value.expr})`)
}

function roundNumber(value: NumberValue): NumberValue {
  if (value.isInteger) return numberValue(value.min, value.max, true, value.expr, value.linear)
  return numberValue(Math.round(value.min), Math.round(value.max), true, value.expr == null ? null : `round(${value.expr})`)
}

function truncNumber(value: NumberValue): NumberValue {
  if (value.isInteger) return numberValue(value.min, value.max, true, value.expr, value.linear)
  return numberValue(Math.trunc(value.min), Math.trunc(value.max), true, value.expr == null ? null : `trunc(${value.expr})`)
}

function sqrtNumber(value: NumberValue): Value {
  if (value.min < 0) return unknown('Math.sqrt over a negative range is unsupported')
  return numberValue(Math.sqrt(value.min), Math.sqrt(value.max), false, value.expr == null ? null : `sqrt(${value.expr})`)
}

function absNumber(value: NumberValue, assumptions: LinearConstraint[]): NumberValue {
  const plain = plainNumber(value)
  if (plain.min >= 0) return withNumberCases(plain, value.cases)
  if (plain.max <= 0) {
    const result = evaluateNumberUnary(value, current => numberValue(-current.max, -current.min, current.isInteger, current.expr == null ? null : `abs(${current.expr})`, linearScale(current.linear, -1)))
    return result.kind === 'number' ? result : numberValue(-plain.max, -plain.min, plain.isInteger, plain.expr == null ? null : `abs(${plain.expr})`, linearScale(plain.linear, -1))
  }

  const max = Math.max(Math.abs(plain.min), Math.abs(plain.max))
  const joined = numberValue(0, max, plain.isInteger, plain.expr == null ? null : `abs(${plain.expr})`)
  const cases: NumberCase[] = []
  for (const valueCase of numberBranches(value)) {
    const nonNegative = comparisonConstraint(valueCase.value, '>=', numberValue(0, 0, true, '0', linearConstant(0)))
    const nonPositive = comparisonConstraint(valueCase.value, '<=', numberValue(0, 0, true, '0', linearConstant(0)))
    if (nonNegative == null || nonPositive == null) return joined

    const positiveStatus = proveComparisonPlain(valueCase.value, '>=', numberValue(0, 0, true, '0', linearConstant(0)), mergeAssumptions(assumptions, valueCase.assumptions))
    const negativeStatus = proveComparisonPlain(valueCase.value, '<=', numberValue(0, 0, true, '0', linearConstant(0)), mergeAssumptions(assumptions, valueCase.assumptions))

    if (positiveStatus.status !== 'fail') {
      cases.push({
        value: valueCase.value,
        assumptions: positiveStatus.status === 'pass' ? valueCase.assumptions : mergeAssumptions(valueCase.assumptions, [nonNegative]),
      })
    }
    if (negativeStatus.status !== 'fail') {
      cases.push({
        value: numberValue(-valueCase.value.max, -valueCase.value.min, valueCase.value.isInteger, valueCase.value.expr == null ? null : `abs(${valueCase.value.expr})`, linearScale(valueCase.value.linear, -1)),
        assumptions: negativeStatus.status === 'pass' ? valueCase.assumptions : mergeAssumptions(valueCase.assumptions, [nonPositive]),
      })
    }
    if (cases.length > maxNumberCases) return joined
  }
  return withNumberCases(joined, cases)
}

function minNumberPair(left: NumberValue, right: NumberValue, assumptions: LinearConstraint[]): NumberValue {
  return choiceNumberPair('min', left, right, '<=', '<=', assumptions)
}

function maxNumberPair(left: NumberValue, right: NumberValue, assumptions: LinearConstraint[]): NumberValue {
  return choiceNumberPair('max', left, right, '>=', '>=', assumptions)
}

function choiceNumberPair(
  name: 'min' | 'max',
  left: NumberValue,
  right: NumberValue,
  leftOp: ComparisonOperator,
  rightOp: ComparisonOperator,
  assumptions: LinearConstraint[],
): NumberValue {
  const plainLeft = plainNumber(left)
  const plainRight = plainNumber(right)
  const joined =
    name === 'min'
      ? numberValue(Math.min(plainLeft.min, plainRight.min), Math.min(plainLeft.max, plainRight.max), plainLeft.isInteger && plainRight.isInteger, callExpr(name, [plainLeft, plainRight]))
      : numberValue(Math.max(plainLeft.min, plainRight.min), Math.max(plainLeft.max, plainRight.max), plainLeft.isInteger && plainRight.isInteger, callExpr(name, [plainLeft, plainRight]))

  const cases: NumberCase[] = []
  for (const leftCase of numberBranches(left)) {
    for (const rightCase of numberBranches(right)) {
      const baseAssumptions = mergeAssumptions(assumptions, leftCase.assumptions, rightCase.assumptions)
      const leftWins = proveComparisonPlain(leftCase.value, leftOp, rightCase.value, baseAssumptions)
      const rightWins = proveComparisonPlain(rightCase.value, rightOp, leftCase.value, baseAssumptions)

      if (leftWins.status !== 'fail') {
        const fact = comparisonConstraint(leftCase.value, leftOp, rightCase.value)
        if (leftWins.status === 'pass') {
          cases.push({
            value: leftCase.value,
            assumptions: mergeAssumptions(leftCase.assumptions, rightCase.assumptions),
          })
        } else if (fact != null) {
          cases.push({
            value: leftCase.value,
            assumptions: mergeAssumptions(leftCase.assumptions, rightCase.assumptions, [fact]),
          })
        }
      }
      if (rightWins.status !== 'fail') {
        const fact = comparisonConstraint(rightCase.value, rightOp, leftCase.value)
        if (rightWins.status === 'pass') {
          cases.push({
            value: rightCase.value,
            assumptions: mergeAssumptions(leftCase.assumptions, rightCase.assumptions),
          })
        } else if (fact != null) {
          cases.push({
            value: rightCase.value,
            assumptions: mergeAssumptions(leftCase.assumptions, rightCase.assumptions, [fact]),
          })
        }
      }
      if (cases.length > maxNumberCases) return joined
    }
  }

  return withNumberCases(joined, cases)
}

function evaluatePropertyAccess(expression: ts.PropertyAccessExpression, context: EvalContext): Value {
  const target = evaluateExpression(expression.expression, context)
  if (target.kind === 'array' && expression.name.text === 'length') return target.length
  if (target.kind !== 'object') return unknown(`Property access ${expression.name.text} expected an object`)
  return target.props.get(expression.name.text) ?? unknown(`Unknown property ${expression.name.text}`)
}

function evaluateElementAccess(expression: ts.ElementAccessExpression, context: EvalContext): Value {
  const target = evaluateExpression(expression.expression, context)
  if (target.kind !== 'array') return unknown(`Element access expected an array`)
  const index = evaluateExpression(expression.argumentExpression, context)
  if (index.kind !== 'number') return unknown('Array index expected a number')
  if (!index.isInteger) return unknown(`Array index ${formatRange(index)} was not proven integer`)
  const lower = proveComparison(index, '>=', numberValue(0, 0, true, '0', linearConstant(0)), context.assumptions)
  const upper = proveComparison(index, '<', target.length, context.assumptions)
  if (lower.status !== 'pass' || upper.status !== 'pass') return unknown(`Array index ${formatRange(index)} was not proven inside length ${formatRange(target.length)}`)
  if (target.elements == null) return unknown('Array element values are not tracked')
  const start = Math.max(0, Math.ceil(index.min))
  const end = Math.min(target.elements.length - 1, Math.floor(index.max))
  if (start > end) return unknown(`Array index ${formatRange(index)} has no possible element`)
  let value = target.elements[start]!
  for (let i = start + 1; i <= end; i++) value = joinValues(value, target.elements[i]!)
  return value
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

function evaluateArrayLiteral(expression: ts.ArrayLiteralExpression, context: EvalContext): Value {
  let length = numberValue(0, 0, true, '0', linearConstant(0))
  let elements: Value[] | null = []

  for (const element of expression.elements) {
    if (ts.isSpreadElement(element)) {
      const spreadValue = evaluateExpression(element.expression, context)
      if (spreadValue.kind !== 'array') return unknown('Array spread expected an array')
      const nextLength = evaluateNumberBinary(ts.SyntaxKind.PlusToken, length, spreadValue.length)
      if (nextLength.kind !== 'number') return nextLength
      length = nextLength
      elements = elements == null || spreadValue.elements == null ? null : [...elements, ...spreadValue.elements]
      continue
    }

    const value = evaluateExpression(element, context)
    const nextLength = evaluateNumberBinary(ts.SyntaxKind.PlusToken, length, numberValue(1, 1, true, '1', linearConstant(1)))
    if (nextLength.kind !== 'number') return nextLength
    length = nextLength
    if (elements != null) elements.push(value)
  }

  return {kind: 'array', length, elements, expr: null}
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

function proveRange(value: Value, min: number, max: number, requireInteger: boolean, assumptions: LinearConstraint[] = []): {status: LayoutCheckStatus; reason?: string} {
  if (value.kind !== 'number') return {status: 'unknown', reason: nonNumberReason(value)}
  if (value.min < min || value.max > max) {
    const lower = proveComparison(value, '>=', numberValue(min, min, Number.isInteger(min), `${min}`, linearConstant(min)), assumptions)
    const upper = proveComparison(value, '<=', numberValue(max, max, Number.isInteger(max), `${max}`, linearConstant(max)), assumptions)
    if (lower.status === 'pass' && upper.status === 'pass' && (!requireInteger || value.isInteger)) return {status: 'pass'}
    return {
      status: 'fail',
      reason: rangeFailureReason(value, min, max, requireInteger, assumptions),
    }
  }
  if (requireInteger && !value.isInteger) return {status: 'fail', reason: `range was ${formatRange(value)}, expected integer\nneed: ${value.expr ?? formatRange(value)} to be integer`}
  return {status: 'pass'}
}

function proveComparison(left: Value, op: ComparisonOperator, right: Value, assumptions: LinearConstraint[]): {status: LayoutCheckStatus; reason?: string} {
  if (left.kind !== 'number') return {status: 'unknown', reason: nonNumberReason(left)}
  if (right.kind !== 'number') return {status: 'unknown', reason: nonNumberReason(right)}
  if (left.cases != null || right.cases != null) {
    let unknownStatus: {status: LayoutCheckStatus; reason?: string} | null = null
    for (const leftCase of numberBranches(left)) {
      for (const rightCase of numberBranches(right)) {
        const status = proveComparisonPlain(
          leftCase.value,
          op,
          rightCase.value,
          mergeAssumptions(assumptions, leftCase.assumptions, rightCase.assumptions),
        )
        if (status.status === 'fail') return status
        if (status.status === 'unknown') unknownStatus = status
      }
    }
    return unknownStatus ?? {status: 'pass'}
  }
  return proveComparisonPlain(left, op, right, assumptions)
}

function proveComparisonPlain(left: NumberValue, op: ComparisonOperator, right: NumberValue, assumptions: LinearConstraint[]): {status: LayoutCheckStatus; reason?: string} {
  if (op === '==' && left.expr != null && right.expr != null && left.expr === right.expr) return {status: 'pass'}
  const mathTruth = proveMathLemma(left, op, right, assumptions)
  if (mathTruth === 'true') return {status: 'pass'}
  const truth = compareRanges(left, op, right)
  if (truth === 'true') return {status: 'pass'}
  if (truth === 'false') return {status: 'fail', reason: comparisonFailureReason(left, op, right, assumptions, 'is false')}
  const linearTruth = compareLinear(left, op, right, assumptions)
  if (linearTruth === 'true') return {status: 'pass'}
  if (linearTruth === 'false') return {status: 'fail', reason: comparisonFailureReason(left, op, right, assumptions, 'is false by exact linear facts')}
  return {status: 'unknown', reason: comparisonFailureReason(left, op, right, assumptions, 'was not proven')}
}

function proveMathLemma(left: NumberValue, op: ComparisonOperator, right: NumberValue, assumptions: LinearConstraint[]): Truth {
  if (left.expr == null) return 'maybe'
  if ((op === '>=' || op === '>') && right.expr != null && left.expr === `ceil(${right.expr})`) return op === '>=' ? 'true' : 'maybe'
  if ((op === '<=' || op === '<') && right.expr != null && left.expr === `floor(${right.expr})`) return op === '<=' ? 'true' : 'maybe'
  if ((op === '<=' || op === '<') && right.expr === `ceil(${left.expr})`) return op === '<=' ? 'true' : 'maybe'
  if ((op === '>=' || op === '>') && right.expr === `floor(${left.expr})`) return op === '>=' ? 'true' : 'maybe'

  if ((op === '>=' || op === '>') && right.expr != null && provesCeilDivisionCovers(left.expr, right.expr, assumptions)) return op === '>=' ? 'true' : 'maybe'
  if ((op === '<' || op === '<=') && right.expr != null && provesFloorDivisionBelowCount(left.expr, right, assumptions)) return 'true'
  return 'maybe'
}

function provesCeilDivisionCovers(leftExpr: string, rightExpr: string, assumptions: LinearConstraint[]) {
  const match = /^\(ceil\(\((.+) \/ (.+)\)\) \* (.+)\)$/.exec(leftExpr)
  if (match == null) return false
  const total = match[1]!.trim()
  const count = match[2]!.trim()
  const multiplier = match[3]!.trim()
  if (count !== multiplier || total !== rightExpr) return false
  return provesExprNonNegative(total, false, assumptions) && provesExprNonNegative(count, true, assumptions)
}

function provesFloorDivisionBelowCount(leftExpr: string, right: NumberValue, assumptions: LinearConstraint[]) {
  const match = /^floor\(\((.+) \/ (.+)\)\)$/.exec(leftExpr)
  if (match == null || right.expr == null || !right.isInteger) return false
  const pointer = match[1]!.trim()
  const cell = match[2]!.trim()
  if (!provesExprNonNegative(cell, true, assumptions)) return false
  return hasComparisonFact(pointer, '<', `(${right.expr} * ${cell})`, assumptions) || hasComparisonFact(pointer, '<', `(${cell} * ${right.expr})`, assumptions)
}

function provesExprNonNegative(expression: string, strict: boolean, assumptions: LinearConstraint[]) {
  const linear = linearFromExpressionText(expression)
  return linear != null && provesNonNegative(linear, strict, assumptions)
}

function hasComparisonFact(leftExpr: string, op: ComparisonOperator, rightExpr: string, assumptions: LinearConstraint[]) {
  return assumptions.some(assumption => assumption.leftExpr === leftExpr && assumption.op === op && assumption.rightExpr === rightExpr)
}

function rangeFailureReason(value: NumberValue, min: number, max: number, requireInteger: boolean, assumptions: LinearConstraint[]) {
  const lines = [
    `range was ${formatRange(value)}, expected inside ${requireInteger ? 'int' : 'number'}[${min}, ${max}]`,
    `need: ${value.expr ?? formatRange(value)} inside ${requireInteger ? 'int' : 'number'}[${min}, ${max}]`,
  ]
  const known = knownProofContext(value, numberValue(min, max, requireInteger, `${min}..${max}`), assumptions)
  if (known.length > 0) lines.push(`known:\n${known.map(line => `  ${line}`).join('\n')}`)
  lines.push(...missingRangeBounds(value, min, max))
  return lines.join('\n')
}

function missingRangeBounds(value: NumberValue, min: number, max: number) {
  const name = value.expr ?? formatRange(value)
  const missing: string[] = []
  if (value.min < min) missing.push(`missing: ${name} >= ${min}`)
  if (value.max > max) missing.push(`missing: ${name} <= ${max}`)
  return missing
}

function comparisonFailureReason(left: NumberValue, op: ComparisonOperator, right: NumberValue, assumptions: LinearConstraint[], result: string) {
  const lines = [
    `${formatRange(left)} ${op} ${formatRange(right)} ${result}`,
    `need: ${comparisonNeed(left, op, right)}`,
  ]
  const known = knownProofContext(left, right, assumptions)
  if (known.length > 0) lines.push(`known:\n${known.map(line => `  ${line}`).join('\n')}`)
  const missing = missingComparisonFact(left, op, right, assumptions)
  lines.push(`missing: ${missing}`)
  return lines.join('\n')
}

function comparisonNeed(left: NumberValue, op: ComparisonOperator, right: NumberValue) {
  return `${left.expr ?? formatRange(left)} ${op} ${right.expr ?? formatRange(right)}`
}

function knownProofContext(left: NumberValue, right: NumberValue, assumptions: LinearConstraint[]) {
  const lines = [formatRange(left), formatRange(right)]
  for (const assumption of assumptions) {
    lines.push(assumption.text ?? formatLinearConstraint(assumption))
    if (lines.length >= 12) break
  }
  return [...new Set(lines)]
}

function missingComparisonFact(left: NumberValue, op: ComparisonOperator, right: NumberValue, assumptions: LinearConstraint[]) {
  const missingLinear = missingLinearFact(left, op, right, assumptions)
  if (missingLinear != null) return missingLinear
  return `given ${comparisonNeed(left, op, right)}`
}

function missingLinearFact(left: NumberValue, op: ComparisonOperator, right: NumberValue, assumptions: LinearConstraint[]) {
  const diff = comparisonDiff(left, op, right)
  if (diff == null) return null
  const target = cleanLinear(diff)
  for (const fact of assumptions.filter(assumption => assumption.source !== 'range').flatMap(nonNegativeFacts)) {
    for (const scale of reductionScales(target, fact.diff)) {
      const scaledFact = linearScaleExact(fact.diff, scale)
      const remainder = linearSubtract(target, scaledFact)
      if (remainder == null || sameLinear(remainder, target)) continue
      const missing = singleLinearBound(remainder)
      if (missing != null) return missing
    }
  }
  return null
}

function comparisonDiff(left: NumberValue, op: ComparisonOperator, right: NumberValue): LinearExpr | null {
  switch (op) {
    case '==':
      return null
    case '>=':
    case '>':
      return linearSubtract(left.linear, right.linear)
    case '<=':
    case '<':
      return linearSubtract(right.linear, left.linear)
  }
}

function singleLinearBound(linear: LinearExpr) {
  const clean = cleanLinear(linear)
  if (clean.constant !== 0 || clean.terms.size !== 1) return null
  const first = [...clean.terms.entries()][0]
  if (first == null) return null
  const [name, coefficient] = first
  if (coefficient === 0) return null
  return coefficient > 0 ? `${name} >= 0` : `${name} <= 0`
}

function comparisonConstraint(left: NumberValue, op: ComparisonOperator, right: NumberValue, text?: string, source: LinearConstraint['source'] = 'derived'): LinearConstraint | null {
  const diff = linearSubtract(left.linear, right.linear)
  if (diff == null && left.expr == null && right.expr == null && text == null) return null
  return {
    diff,
    op,
    source,
    ...(left.expr == null ? {} : {leftExpr: left.expr}),
    ...(right.expr == null ? {} : {rightExpr: right.expr}),
    ...(text == null ? {} : {text}),
  }
}

function comparisonFactFromSpec(spec: Extract<LayoutSpec, {kind: 'given-comparison'}>, context: EvalContext): LinearConstraint | null {
  const left = evaluateSpecExpression(spec.left, context)
  const right = evaluateSpecExpression(spec.right, context)
  if (left.kind !== 'number' || right.kind !== 'number') return null
  return comparisonConstraint(left, spec.op, right, spec.text, 'comparison')
}

function rangeFactsFromValue(value: Value, min: number, max: number): LinearConstraint[] {
  if (value.kind !== 'number') return []
  const minDiff = linearSubtract(value.linear, linearConstant(min))
  const maxDiff = linearSubtract(linearConstant(max), value.linear)
  const facts: LinearConstraint[] = []
  if (minDiff != null) facts.push({diff: minDiff, op: '>=', text: `${value.expr ?? formatLinear(value.linear)} >= ${min}`, source: 'range'})
  if (maxDiff != null) facts.push({diff: maxDiff, op: '>=', text: `${value.expr ?? formatLinear(value.linear)} <= ${max}`, source: 'range'})
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
  facts: NonNegativeFact[],
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

function nonNegativeFacts(assumption: LinearConstraint): NonNegativeFact[] {
  if (assumption.diff == null) return []
  switch (assumption.op) {
    case '==':
      return [
        nonNegativeFact(assumption.diff, false, assumption.text),
        nonNegativeFact(linearScaleExact(assumption.diff, -1), false, assumption.text == null ? undefined : `${assumption.text} reversed`),
      ]
    case '>=':
      return [nonNegativeFact(assumption.diff, false, assumption.text)]
    case '<=':
      return [nonNegativeFact(linearScaleExact(assumption.diff, -1), false, assumption.text)]
    case '>':
      return [nonNegativeFact(assumption.diff, true, assumption.text)]
    case '<':
      return [nonNegativeFact(linearScaleExact(assumption.diff, -1), true, assumption.text)]
  }
}

function nonNegativeFact(diff: LinearExpr, strict: boolean, text?: string): NonNegativeFact {
  return {diff, strict, ...(text == null ? {} : {text})}
}

function nonNumberReason(value: ObjectValue | ArrayValue | UnknownValue) {
  if (value.kind === 'unknown') return value.reason
  return value.kind === 'array' ? 'Expected a number, got an array' : 'Expected a number, got an object'
}

function numberValue(min: number, max: number, isInteger: boolean, expr: string | null, linear: LinearExpr | null = null, cases: NumberCase[] | null = null): NumberValue {
  const clean = linear == null ? null : cleanLinear(linear)
  if (clean != null && clean.terms.size === 0 && Number.isFinite(clean.constant)) {
    return {kind: 'number', min: clean.constant, max: clean.constant, isInteger: Number.isInteger(clean.constant), expr, linear: clean, cases}
  }
  return {kind: 'number', min, max, isInteger, expr, linear: clean, cases}
}

function unknownNumber(name: string): NumberValue {
  return {
    kind: 'number',
    min: Number.NEGATIVE_INFINITY,
    max: Number.POSITIVE_INFINITY,
    isInteger: false,
    expr: name,
    linear: linearVariable(name),
    cases: null,
  }
}

function unknownArray(name: string, length: NumberValue = unknownNumber(`${name}.length`)): ArrayValue {
  return {
    kind: 'array',
    length,
    elements: null,
    expr: name,
  }
}

function unknown(reason: string): UnknownValue {
  return {kind: 'unknown', reason}
}

function plainNumber(value: NumberValue): NumberValue {
  return value.cases == null ? value : {...value, cases: null}
}

function numberBranches(value: NumberValue): NumberCase[] {
  return value.cases ?? [{value: plainNumber(value), assumptions: []}]
}

function withNumberCases(value: NumberValue, cases: NumberCase[] | null): NumberValue {
  if (cases == null || cases.length === 0 || cases.length > maxNumberCases) return value
  return {...value, cases: cases.map(choice => ({value: plainNumber(choice.value), assumptions: choice.assumptions}))}
}

function mergeAssumptions(...groups: LinearConstraint[][]): LinearConstraint[] {
  return groups.flat()
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

function linearFromExpressionText(text: string): LinearExpr | null {
  try {
    return linearFromExpression(parseExpression(text))
  } catch {
    return null
  }
}

function linearFromExpression(expression: ts.Expression): LinearExpr | null {
  if (ts.isNumericLiteral(expression)) return linearConstant(Number(expression.text))
  if (ts.isIdentifier(expression)) return linearVariable(expression.text)
  if (ts.isParenthesizedExpression(expression)) return linearFromExpression(expression.expression)
  if (ts.isPrefixUnaryExpression(expression)) {
    const operand = linearFromExpression(expression.operand)
    if (operand == null) return null
    if (expression.operator === ts.SyntaxKind.MinusToken) return linearScaleExact(operand, -1)
    if (expression.operator === ts.SyntaxKind.PlusToken) return operand
    return null
  }
  if (!ts.isBinaryExpression(expression)) return null
  const left = linearFromExpression(expression.left)
  const right = linearFromExpression(expression.right)
  switch (expression.operatorToken.kind) {
    case ts.SyntaxKind.PlusToken:
      return linearAdd(left, right)
    case ts.SyntaxKind.MinusToken:
      return linearSubtract(left, right)
    case ts.SyntaxKind.AsteriskToken: {
      const leftValue = numericLiteralValue(expression.left)
      const rightValue = numericLiteralValue(expression.right)
      if (leftValue != null) return linearScale(right, leftValue)
      if (rightValue != null) return linearScale(left, rightValue)
      return null
    }
    case ts.SyntaxKind.SlashToken: {
      const rightValue = numericLiteralValue(expression.right)
      return rightValue == null || rightValue === 0 ? null : linearScale(left, 1 / rightValue)
    }
    default:
      return null
  }
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
  if (left.kind === 'array' && right.kind === 'array') {
    const length = joinValues(left.length, right.length)
    if (length.kind !== 'number') return unknown('Array branches had incompatible lengths')
    return {
      kind: 'array',
      length,
      elements: left.elements != null && right.elements != null && left.elements.length === right.elements.length
        ? left.elements.map((leftElement, index) => joinValues(leftElement, right.elements![index]!))
        : null,
      expr: left.expr != null && left.expr === right.expr ? left.expr : null,
    }
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

function formatLinearConstraint(constraint: LinearConstraint) {
  if (constraint.diff == null) {
    const left = constraint.leftExpr ?? '?'
    const right = constraint.rightExpr ?? '?'
    return `${left} ${constraint.op} ${right}`
  }
  switch (constraint.op) {
    case '>=':
      return `${formatLinear(constraint.diff)} >= 0`
    case '>':
      return `${formatLinear(constraint.diff)} > 0`
    case '<=':
      return `${formatLinear(constraint.diff)} <= 0`
    case '<':
      return `${formatLinear(constraint.diff)} < 0`
    case '==':
      return `${formatLinear(constraint.diff)} == 0`
  }
}

function formatLinear(linear: LinearExpr | null) {
  if (linear == null) return '<nonlinear>'
  const clean = cleanLinear(linear)
  const parts: string[] = []
  for (const [name, coefficient] of [...clean.terms.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    parts.push(formatLinearTerm(coefficient, name, parts.length === 0))
  }
  if (clean.constant !== 0 || parts.length === 0) parts.push(formatLinearTerm(clean.constant, '', parts.length === 0))
  return parts.join(' ')
}

function formatLinearTerm(coefficient: number, name: string, first: boolean) {
  const sign = coefficient < 0 ? '-' : '+'
  const amount = Math.abs(coefficient)
  const body = name.length === 0 ? formatNumber(amount) : amount === 1 ? name : `${formatNumber(amount)} * ${name}`
  return first ? (sign === '-' ? `-${body}` : body) : `${sign} ${body}`
}

function formatNumber(value: number) {
  return Number.isInteger(value) ? `${value}` : `${value}`
}
