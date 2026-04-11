import * as ts from 'typescript'

// IR types

export type IrBindingName =
  | {kind: 'identifier'; name: string}
  | {kind: 'object'; elements: Array<{key: string; name: IrBindingName}>}

export type InlineFunction = {
  params: string[]
  entryBlockId: string
  blocks: Map<string, IrBlock>
}

export type IrProgram = {
  functions: Map<string, IrFunction>
  globals: Map<string, number>
}

export type IrFunction = InlineFunction & {
  name: string
}

export type IrBlock = {
  id: string
  instructions: IrInstruction[]
  terminator: IrTerminator
}

type MutableIrBlock = {
  id: string
  instructions: IrInstruction[]
  terminator: IrTerminator | null
}

export type IrInstruction =
  | {kind: 'declare'; declarations: Array<{name: IrBindingName; initializer: IrExpression}>}
  | {kind: 'expression'; expression: IrExpression}

export type IrTerminator =
  | {kind: 'return'; expression: IrExpression}
  | {kind: 'goto'; targetBlockId: string}
  | {kind: 'branch'; condition: IrExpression; thenBlockId: string; elseBlockId: string}
  | {kind: 'end'}

export type IrExpression =
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

export type IrBinaryOperator =
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

export type IrObjectProperty =
  | {kind: 'property'; name: string; value: IrExpression}
  | {kind: 'spread'; value: IrExpression}

export type IrCallee =
  | {kind: 'identifier'; name: string}
  | {kind: 'property'; object: IrExpression; property: string}

// Lowering

export function lowerSourceProgram(sourceText: string, externalGlobals: Record<string, number>, includeFunctions: string[] | null): IrProgram {
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

export function lowerInlineFunction(parameters: ts.NodeArray<ts.ParameterDeclaration>, body: ts.ConciseBody): InlineFunction {
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

function getPropertyName(name: ts.PropertyName | undefined) {
  if (name == null) throw new Error('Object property name is missing')
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) return name.text
  throw new Error(`Unsupported property name: ${ts.SyntaxKind[name.kind]}`)
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
