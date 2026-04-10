import {
  concreteArray,
  concreteNull,
  concreteNumber,
  concreteObject,
  expectArray,
  expectConcreteNumber,
  expectObject,
  expectString,
  getProp,
  invokeConcreteFunctionValue,
  type FunctionOverride,
  type Value,
} from './layout-static-core'

export type ConcreteValueExpr =
  | {kind: 'arg'; argIndex: number}
  | {kind: 'arg-path'; argIndex: number; path: string[]}
  | {kind: 'number'; value: number}
  | {kind: 'null'}
  | {kind: 'array'; items: ConcreteValueExpr[]}
  | {kind: 'object'; props: Record<string, ConcreteValueExpr>}
  | {kind: 'add'; left: ConcreteValueExpr; right: ConcreteValueExpr}
  | {kind: 'mul'; left: ConcreteValueExpr; right: ConcreteValueExpr}

export type ConcreteContractSpec =
  | {
      kind: 'return-value'
      value: ConcreteValueExpr
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

export const contract = {
  returnValue(value: ConcreteValueExpr): ConcreteContractSpec {
    return {kind: 'return-value', value}
  },

  returnArg(argIndex: number): ConcreteContractSpec {
    return {kind: 'return-arg', argIndex}
  },

  forEachArrayItem(arrayArgIndex: number, arrayPath: string[], callbackArgIndex: number): ConcreteContractSpec {
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
  ): ConcreteContractSpec {
    return {
      kind: 'lookup-array-item',
      sourceArgIndex,
      arrayPath,
      indexArgIndex,
      indexPath,
      defaultNull: options.defaultNull ?? false,
    }
  },

  stringUnitWidth(textArgIndex: number, unitWidth: number): ConcreteContractSpec {
    return {
      kind: 'string-unit-width',
      textArgIndex,
      unitWidth,
    }
  },

  pushOrMergeRect(rectsArgIndex: number, nextArgIndex: number, options: {tolerance?: number} = {}): ConcreteContractSpec {
    return {
      kind: 'push-or-merge-rect',
      rectsArgIndex,
      nextArgIndex,
      tolerance: options.tolerance ?? 0.5,
    }
  },
}

export const contractValue = {
  arg(argIndex: number): ConcreteValueExpr {
    return {kind: 'arg', argIndex}
  },

  argPath(argIndex: number, path: string[]): ConcreteValueExpr {
    return {kind: 'arg-path', argIndex, path}
  },

  number(value: number): ConcreteValueExpr {
    return {kind: 'number', value}
  },

  null(): ConcreteValueExpr {
    return {kind: 'null'}
  },

  array(items: ConcreteValueExpr[]): ConcreteValueExpr {
    return {kind: 'array', items}
  },

  object(props: Record<string, ConcreteValueExpr>): ConcreteValueExpr {
    return {kind: 'object', props}
  },

  add(left: ConcreteValueExpr, right: ConcreteValueExpr): ConcreteValueExpr {
    return {kind: 'add', left, right}
  },

  mul(left: ConcreteValueExpr, right: ConcreteValueExpr): ConcreteValueExpr {
    return {kind: 'mul', left, right}
  },
}

export function buildConcreteContractOverrides(specs: Record<string, ConcreteContractSpec>): Record<string, FunctionOverride> {
  const overrides: Record<string, FunctionOverride> = {}

  for (const [name, spec] of Object.entries(specs)) {
    overrides[name] = {
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
    }
  }

  return overrides
}

function getValueAtPath(root: Value, path: string[]) {
  let current = root
  for (const prop of path) current = getProp(expectObject(current), prop)
  return current
}

function evaluateConcreteValueExpr(expression: ConcreteValueExpr, args: Value[]): Value {
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
