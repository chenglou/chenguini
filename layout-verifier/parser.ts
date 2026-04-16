import * as ts from 'typescript'

export type LayoutSpec =
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
  | {
      kind: 'check-atom'
      name: string
      args: string[]
      text: string
    }

export type ComparisonOperator = '==' | '>=' | '<=' | '>' | '<'

export function parseLayoutSpecs(sourceText: string, node: ts.Node): LayoutSpec[] {
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

  const checkAtom = parseCheckAtom(line)
  if (checkAtom != null) return checkAtom

  throw new Error(`Unsupported @layout line: ${line}`)
}

function parseCheckAtom(line: string): Extract<LayoutSpec, {kind: 'check-atom'}> | null {
  const expression = parseExpression(line)
  if (!ts.isCallExpression(expression) || !ts.isIdentifier(expression.expression)) return null
  return {
    kind: 'check-atom',
    name: expression.expression.text,
    args: expression.arguments.map(argument => argument.getText()),
    text: line,
  }
}

export function parseExpression(text: string): ts.Expression {
  const sourceFile = ts.createSourceFile('layout-spec-expression.ts', `const value = ${text}`, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  const parseDiagnostics = (sourceFile as ts.SourceFile & {parseDiagnostics: readonly ts.Diagnostic[]}).parseDiagnostics
  if (parseDiagnostics.length > 0 || sourceFile.statements.length !== 1) throw new Error(`Could not parse @layout expression: ${text}`)
  const statement = sourceFile.statements[0]
  if (statement == null || !ts.isVariableStatement(statement)) throw new Error(`Could not parse @layout expression: ${text}`)
  const declaration = statement.declarationList.declarations[0]
  if (declaration == null || declaration.initializer == null) throw new Error(`Could not parse @layout expression: ${text}`)
  return declaration.initializer
}
