// Value domain: concrete, symbolic, and range types with their arithmetic,
// comparisons, range narrowing, and symbolic algebra. No dependency on the
// evaluator — this is the pure math layer the evaluator in core.ts builds on.

import type {IrBindingName, InlineFunction} from './ir'

export type Mode = 'concrete' | 'symbolic'
export type ComparisonOp = '>' | '>=' | '<' | '<=' | '===' | '!=='
type NarrowedComparisonOp = '>' | '>=' | '<' | '<=' | '==' | '!='

export type WitnessValue = boolean | number | string | null
export type StaticLayoutLawWitness = Record<string, WitnessValue>
export type StaticLayoutLawKind = 'symbolic' | 'range' | 'concrete-fixture' | 'concrete-sweep'

export type ScalarExpr =
  | {kind: 'const'; value: number}
  | {kind: 'var'; name: string}
  | {kind: 'add'; left: ScalarExpr; right: ScalarExpr}
  | {kind: 'sub'; left: ScalarExpr; right: ScalarExpr}
  | {kind: 'mul'; left: ScalarExpr; right: ScalarExpr}
  | {kind: 'div'; left: ScalarExpr; right: ScalarExpr}
  | {kind: 'pow'; left: ScalarExpr; right: ScalarExpr}

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

export type FunctionValue = {
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

// Range value types

export type RangeTruth = 'always-true' | 'always-false' | 'maybe'

export type RangeNumberValue = {
  kind: 'range-number'
  min: number
  max: number
  isInteger: boolean
  expr: ScalarExpr | null
}

export type RangeBooleanValue = {
  kind: 'range-boolean'
  truth: RangeTruth
}

export type RangeStringValue = {
  kind: 'range-string'
  minLength: number
  maxLength: number
  exactValue: string | null
}

export type RangeObjectValue = {
  kind: 'range-object'
  props: Record<string, RangeValue>
}

export type RangeArrayValue = {
  kind: 'range-array'
  lengthMin: number
  lengthMax: number
  items: RangeValue[] | null
  item: RangeValue | null
  last: RangeValue | null
  isStrictlyIncreasingNumeric: boolean
}

export type RangeFunctionValue = {
  kind: 'range-function'
  fn: InlineFunction
  closure: Map<string, RangeValue>
}

export type RangeOpaqueValue = {
  kind: 'range-opaque'
  label: string
}

export type RangeNullValue = {
  kind: 'range-null'
}

export type RangeValue =
  | RangeNumberValue
  | RangeBooleanValue
  | RangeStringValue
  | RangeObjectValue
  | RangeArrayValue
  | RangeFunctionValue
  | RangeOpaqueValue
  | RangeNullValue

export type RangeAccessPath = {
  root: string
  props: string[]
}

export const epsilon = 0.0001

// Concrete constructors

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

export function numberValue(mode: Mode, value: number): NumberValue {
  return mode === 'concrete' ? concreteNumber(value) : symbolicNumberFromExpr(constExpr(value))
}

export function booleanValue(mode: Mode, value: boolean): BooleanValue {
  return mode === 'concrete'
    ? {kind: 'boolean', mode, value}
    : symbolicBoolean({
        kind: 'compare',
        op: '===',
        left: constExpr(value ? 1 : 0),
        right: constExpr(1),
      })
}

export function objectValue(mode: Mode, props: Record<string, Value>): ObjectValue {
  return {kind: 'object', mode, props}
}

// Symbolic constructors

export function symbolicNumber(name: string): NumberValue {
  return symbolicNumberFromExpr(varExpr(name))
}

export function symbolicNumberFromExpr(expr: ScalarExpr): NumberValue {
  return {kind: 'number', mode: 'symbolic', expr}
}

export function symbolicBoolean(expr: BoolExpr): BooleanValue {
  return {kind: 'boolean', mode: 'symbolic', expr}
}

export function symbolicObject(props: Record<string, Value>): ObjectValue {
  return objectValue('symbolic', props)
}

export function symbolicOpaque(label: string): OpaqueValue {
  return {kind: 'opaque', mode: 'symbolic', label}
}

// Range constructors

export function rangeNumber(min: number, max: number, isInteger: boolean): RangeNumberValue {
  return rangeNumberWithExpr(min, max, isInteger, null)
}

function rangeNumberWithExpr(min: number, max: number, isInteger: boolean, expr: ScalarExpr | null): RangeNumberValue {
  return {
    kind: 'range-number',
    min,
    max,
    isInteger,
    expr: expr ?? (Math.abs(min - max) <= epsilon ? constExpr(min) : null),
  }
}

export function rangeBoolean(truth: RangeTruth): RangeBooleanValue {
  return {kind: 'range-boolean', truth}
}

export function rangeString(exactValue: string): RangeStringValue {
  return {
    kind: 'range-string',
    minLength: exactValue.length,
    maxLength: exactValue.length,
    exactValue,
  }
}

export function rangeStringWithLength(minLength: number, maxLength: number, exactValue: string | null = null): RangeStringValue {
  return {
    kind: 'range-string',
    minLength,
    maxLength,
    exactValue,
  }
}

export function rangeObject(props: Record<string, RangeValue>): RangeObjectValue {
  return {kind: 'range-object', props}
}

export function rangeArray(items: RangeValue[]): RangeArrayValue {
  return {
    kind: 'range-array',
    lengthMin: items.length,
    lengthMax: items.length,
    items,
    item: joinNullableRangeItems(items),
    last: items.at(-1) ?? null,
    isStrictlyIncreasingNumeric: rangeItemsAreStrictlyIncreasing(items),
  }
}

export function rangeNull(): RangeNullValue {
  return {kind: 'range-null'}
}

// Expect / unwrap helpers

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

export function expectFunction(value: Value): FunctionValue {
  if (value.kind !== 'function') throw new Error(`Expected function, got ${value.kind}`)
  return value
}

export function expectConcreteNumberValue(value: NumberValue) {
  if (value.mode !== 'concrete') throw new Error('Expected concrete number')
  return value.value
}

export function expectSymbolicNumberValue(value: NumberValue) {
  if (value.mode !== 'symbolic') throw new Error('Expected symbolic number')
  return value.expr
}

export function expectRangeNumber(value: RangeValue): RangeNumberValue {
  if (value.kind !== 'range-number') throw new Error(`Expected range number, got ${value.kind}`)
  return value
}

export function expectRangeFunction(value: RangeValue): RangeFunctionValue {
  if (value.kind !== 'range-function') throw new Error(`Expected range function, got ${value.kind}`)
  return value
}

export function expectRangeBoolean(value: RangeValue): RangeBooleanValue {
  if (value.kind !== 'range-boolean') throw new Error(`Expected range boolean, got ${value.kind}`)
  return value
}

export function expectRangeString(value: RangeValue): RangeStringValue {
  if (value.kind !== 'range-string') throw new Error(`Expected range string, got ${value.kind}`)
  return value
}

export function expectRangeObject(value: RangeValue): RangeObjectValue {
  if (value.kind !== 'range-object') throw new Error(`Expected range object, got ${value.kind}`)
  return value
}

export function expectRangeArray(value: RangeValue): RangeArrayValue {
  if (value.kind !== 'range-array') throw new Error(`Expected range array, got ${value.kind}`)
  return value
}

// Property access

export function getProp(object: ObjectValue, key: string) {
  const value = object.props[key]
  if (value == null) throw new Error(`Missing property ${key}`)
  return value
}

export function getRangeProp(object: RangeObjectValue, key: string) {
  const value = object.props[key]
  if (value == null) throw new Error(`Missing range property ${key}`)
  return value
}

export function getArrayProperty(array: ArrayValue, key: string) {
  if (key === 'length') return concreteNumber(array.items.length)
  throw new Error(`Unsupported array property: ${key}`)
}

export function getStringProperty(value: StringValue, key: string) {
  if (key === 'length') return concreteNumber(value.value.length)
  throw new Error(`Unsupported string property: ${key}`)
}

export function getArrayItem(array: ArrayValue, index: number) {
  const item = array.items[index]
  if (item == null) throw new Error(`Array index ${index} is out of bounds`)
  return item
}

export function getIndexableItem(value: Value, index: number) {
  if (value.kind === 'array') return getArrayItem(value, index)
  if (value.kind === 'string') return concreteString(value.value[index] ?? '')
  throw new Error(`Expected array or string index access, got ${value.kind}`)
}

export function getRangeArrayProperty(array: RangeArrayValue, key: string) {
  if (key === 'length') return rangeNumber(array.lengthMin, array.lengthMax, true)
  throw new Error(`Unsupported range array property: ${key}`)
}

export function getRangeStringProperty(value: RangeStringValue, key: string) {
  if (key === 'length') return rangeNumber(value.minLength, value.maxLength, true)
  throw new Error(`Unsupported range string property: ${key}`)
}

export function getRangeIndexableItem(value: RangeValue, index: RangeNumberValue) {
  if (value.kind === 'range-array') return getRangeArrayItemAt(value, index)
  if (value.kind === 'range-string') return getRangeStringItemAt(value, index)
  throw new Error(`Expected range array index access, got ${value.kind}`)
}

export function getRangeArrayItemAt(array: RangeArrayValue, index: RangeNumberValue) {
  const normalizedIndex = normalizeRangeArrayIndex(array, index)
  if (array.items != null && normalizedIndex != null) {
    const joined = joinNullableRangeItems(array.items.slice(normalizedIndex.min, normalizedIndex.max + 1))
    if (joined != null) return joined
  }
  if (array.item != null) return array.item
  throw new Error('Cannot read from an empty range array')
}

export function appendRangeArrayItem(array: RangeArrayValue, next: RangeValue): RangeArrayValue {
  const items = array.items == null ? null : [...array.items, next]
  return {
    kind: 'range-array',
    lengthMin: array.lengthMin + 1,
    lengthMax: array.lengthMax + 1,
    items,
    item: array.item == null ? next : joinRangeValues(array.item, next),
    last: next,
    isStrictlyIncreasingNumeric:
      array.isStrictlyIncreasingNumeric &&
      rangeValuesAreStrictlyIncreasingPair(array.last, next),
  }
}

function getRangeStringItemAt(value: RangeStringValue, index: RangeNumberValue) {
  if (!index.isInteger) return rangeStringWithLength(0, 1)
  if (value.exactValue != null && Math.abs(index.min - index.max) <= epsilon) {
    const rawIndex = index.min < 0 ? value.exactValue.length + index.min : index.min
    return rangeString(value.exactValue[rawIndex] ?? '')
  }
  return rangeStringWithLength(0, 1)
}

function normalizeRangeArrayIndex(array: RangeArrayValue, index: RangeNumberValue) {
  if (!index.isInteger) return null
  if (array.lengthMin !== array.lengthMax) return null
  const length = array.lengthMin
  let min = index.min
  let max = index.max
  if (max < 0) {
    min += length
    max += length
  }
  if (min < 0 || max >= length) return null
  return {min, max}
}

// Binding

export function bindValueToName(env: Map<string, Value>, name: IrBindingName, value: Value) {
  if (name.kind === 'identifier') {
    env.set(name.name, value)
    return
  }

  const object = expectObject(value)
  for (const element of name.elements) bindValueToName(env, element.name, getProp(object, element.key))
}

export function bindRangeValueToName(env: Map<string, RangeValue>, name: IrBindingName, value: RangeValue) {
  if (name.kind === 'identifier') {
    env.set(name.name, maybeAttachRangeBindingExpr(value, name.name))
    return
  }

  const object = expectRangeObject(value)
  for (const element of name.elements) bindRangeValueToName(env, element.name, getRangeProp(object, element.key))
}

function maybeAttachRangeBindingExpr(value: RangeValue, name: string): RangeValue {
  if (value.kind !== 'range-number' || value.expr != null) return value
  return rangeNumberWithExpr(value.min, value.max, value.isInteger, varExpr(name))
}

// Concrete numeric operators

export function negateNumber(value: NumberValue): NumberValue {
  return value.mode === 'concrete'
    ? concreteNumber(-expectConcreteNumberValue(value))
    : symbolicNumberFromExpr(mulExpr(constExpr(-1), expectSymbolicNumberValue(value)))
}

export function applyNumericOperator(left: NumberValue, right: NumberValue, operator: '+' | '-' | '*' | '/' | '%' | '**') {
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
      case '**':
        return concreteNumber(leftValue ** rightValue)
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
    case '**':
      return symbolicNumberFromExpr(powExpr(leftExpr, rightExpr))
    default:
      throw new Error(`Unsupported symbolic operator: ${operator}`)
  }
}

export function applyComparisonOperator(left: Value, right: Value, operator: ComparisonOp | '==' | '!=') {
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

export function applyAssignmentOperator(current: NumberValue, next: NumberValue, operator: '+=' | '-='): NumberValue {
  if (current.mode !== 'concrete' || next.mode !== 'concrete') throw new Error('Assignment operators are only supported in concrete mode')
  const currentValue = expectConcreteNumberValue(current)
  const nextValue = expectConcreteNumberValue(next)
  return concreteNumber(operator === '+=' ? currentValue + nextValue : currentValue - nextValue)
}

// Range numeric operators

export function negateRangeNumber(value: RangeNumberValue) {
  return rangeNumberWithExpr(
    -value.max,
    -value.min,
    value.isInteger,
    value.expr == null ? null : mulExpr(constExpr(-1), value.expr),
  )
}

export function applyRangeNumericOperator(left: RangeNumberValue, right: RangeNumberValue, operator: '+' | '-' | '*' | '/' | '%' | '**') {
  switch (operator) {
    case '+':
      return rangeNumberWithExpr(
        left.min + right.min,
        left.max + right.max,
        left.isInteger && right.isInteger,
        left.expr != null && right.expr != null ? addExpr(left.expr, right.expr) : null,
      )
    case '-':
      return rangeNumberWithExpr(
        left.min - right.max,
        left.max - right.min,
        left.isInteger && right.isInteger,
        left.expr != null && right.expr != null ? subExpr(left.expr, right.expr) : null,
      )
    case '*': {
      const products = [left.min * right.min, left.min * right.max, left.max * right.min, left.max * right.max]
      return rangeNumberWithExpr(
        Math.min(...products),
        Math.max(...products),
        left.isInteger && right.isInteger,
        left.expr != null && right.expr != null ? mulExpr(left.expr, right.expr) : null,
      )
    }
    case '/': {
      if (right.min <= 0 && right.max >= 0) throw new Error('Division by an interval spanning zero is not supported')
      const quotients = [left.min / right.min, left.min / right.max, left.max / right.min, left.max / right.max]
      return rangeNumberWithExpr(
        Math.min(...quotients),
        Math.max(...quotients),
        false,
        left.expr != null && right.expr != null ? divExpr(left.expr, right.expr) : null,
      )
    }
    case '%': {
      if (!left.isInteger || !right.isInteger) throw new Error('Range remainder expects integer operands')
      if (right.min <= 0) throw new Error('Range remainder expects a positive divisor interval')
      const leftIsSingleton = Math.abs(left.max - left.min) <= epsilon
      const rightIsSingleton = Math.abs(right.max - right.min) <= epsilon
      if (leftIsSingleton && rightIsSingleton) {
        return rangeNumber(left.min % right.min, left.min % right.min, true)
      }
      if (right.min === right.max) {
        const divisor = right.min
        if (left.min >= 0) return rangeNumber(0, Math.max(0, divisor - 1), true)
      }
      const maxAbsDivisor = Math.max(Math.abs(right.min), Math.abs(right.max))
      return rangeNumber(-(maxAbsDivisor - 1), maxAbsDivisor - 1, true)
    }
    case '**': {
      if (!right.isInteger || right.min !== right.max) throw new Error('Range exponentiation only supports constant integer exponents')
      const exp = right.min
      const expr =
        exp === 0 ? constExpr(1)
        : exp === 1 ? left.expr
        : null
      if (exp === 2) {
        if (left.min >= 0) return rangeNumberWithExpr(left.min ** 2, left.max ** 2, left.isInteger, expr)
        if (left.max <= 0) return rangeNumberWithExpr(left.max ** 2, left.min ** 2, left.isInteger, expr)
        return rangeNumberWithExpr(0, Math.max(left.min ** 2, left.max ** 2), left.isInteger, expr)
      }
      const results = [left.min ** exp, left.max ** exp]
      return rangeNumberWithExpr(Math.min(...results), Math.max(...results), left.isInteger && exp >= 0, expr)
    }
  }
}

export function applyRangeAssignmentOperator(current: RangeNumberValue, next: RangeNumberValue, operator: '+=' | '-='): RangeNumberValue {
  return applyRangeNumericOperator(current, next, operator === '+=' ? '+' : '-')
}

// Range comparisons

export function compareRangeNumbers(left: RangeNumberValue, right: RangeNumberValue, operator: ComparisonOp | '==' | '!='): RangeTruth {
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
    case '==':
      return compareRangeNumbers(left, right, '===')
    case '!=':
      return compareRangeNumbers(left, right, '!==')
  }
}

export function compareNullableRangeValues(left: RangeValue, right: RangeValue, operator: '==' | '!=' | '===' | '!=='): RangeTruth | null {
  if (left.kind !== 'range-null' && right.kind !== 'range-null') return null
  const equal = left.kind === 'range-null' && right.kind === 'range-null'
  return operator === '==' || operator === '==='
    ? equal ? 'always-true' : 'always-false'
    : equal ? 'always-false' : 'always-true'
}

export function compareRangeStringValues(left: RangeValue, right: RangeValue, operator: '==' | '!=' | '===' | '!=='): RangeTruth | null {
  if (left.kind !== 'range-string' || right.kind !== 'range-string') return null
  const leftString = expectRangeString(left)
  const rightString = expectRangeString(right)
  if (leftString.exactValue != null && rightString.exactValue != null) {
    const equal = leftString.exactValue === rightString.exactValue
    return operator === '==' || operator === '==='
      ? equal ? 'always-true' : 'always-false'
      : equal ? 'always-false' : 'always-true'
  }
  if (leftString.maxLength < rightString.minLength || rightString.maxLength < leftString.minLength) {
    return operator === '==' || operator === '===' ? 'always-false' : 'always-true'
  }
  return 'maybe'
}

export function isComparisonOperator(operator: string): operator is ComparisonOp | '==' | '!=' {
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

export function isRangeComparisonOperator(operator: string): operator is ComparisonOp | '==' | '!=' {
  return isComparisonOperator(operator)
}

// Range join operations

export function joinRangeValues(left: RangeValue, right: RangeValue): RangeValue {
  if (left.kind !== right.kind) throw new Error(`Cannot join ${left.kind} with ${right.kind}`)
  if (left.kind === 'range-number' && right.kind === 'range-number') {
    const joined = rangeNumber(Math.min(left.min, right.min), Math.max(left.max, right.max), left.isInteger && right.isInteger)
    if (left.expr != null && right.expr != null && symbolicExprEquals(left.expr, right.expr)) {
      return rangeNumberWithExpr(joined.min, joined.max, joined.isInteger, left.expr)
    }
    return joined
  }
  if (left.kind === 'range-boolean' && right.kind === 'range-boolean') {
    return left.truth === right.truth ? left : rangeBoolean('maybe')
  }
  if (left.kind === 'range-string' && right.kind === 'range-string') {
    return rangeStringWithLength(
      Math.min(left.minLength, right.minLength),
      Math.max(left.maxLength, right.maxLength),
      left.exactValue != null && left.exactValue === right.exactValue ? left.exactValue : null,
    )
  }
  if (left.kind === 'range-object' && right.kind === 'range-object') {
    const props: Record<string, RangeValue> = {}
    for (const key of Object.keys(left.props)) props[key] = joinRangeValues(getRangeProp(left, key), getRangeProp(right, key))
    return rangeObject(props)
  }
  if (left.kind === 'range-array' && right.kind === 'range-array') {
    const items =
      left.items != null &&
      right.items != null &&
      left.items.length === right.items.length
        ? left.items.map((item, index) => joinRangeValues(item, right.items![index]!))
        : null
    return {
      kind: 'range-array',
      lengthMin: Math.min(left.lengthMin, right.lengthMin),
      lengthMax: Math.max(left.lengthMax, right.lengthMax),
      items,
      item:
        left.item == null ? right.item
        : right.item == null ? left.item
        : joinRangeValues(left.item, right.item),
      last:
        left.last == null ? right.last
        : right.last == null ? left.last
        : joinRangeValues(left.last, right.last),
      isStrictlyIncreasingNumeric: items == null ? false : rangeItemsAreStrictlyIncreasing(items),
    }
  }
  if (left.kind === 'range-function' && right.kind === 'range-function') {
    if (left.fn !== right.fn) throw new Error('Cannot join different range functions')
    return left
  }
  if (left.kind === 'range-opaque' && right.kind === 'range-opaque') {
    if (left.label !== right.label) throw new Error(`Cannot join opaque values ${left.label} and ${right.label}`)
    return left
  }
  if (left.kind === 'range-null' && right.kind === 'range-null') return left
  throw new Error(`Unsupported range join for ${left.kind}`)
}

function joinNullableRangeItems(items: RangeValue[]) {
  if (items.length === 0) return null
  let current = items[0]!
  for (let i = 1; i < items.length; i++) current = joinRangeValues(current, items[i]!)
  return current
}

function rangeItemsAreStrictlyIncreasing(items: RangeValue[]) {
  for (let i = 1; i < items.length; i++) {
    if (!rangeValuesAreStrictlyIncreasingPair(items[i - 1]!, items[i]!)) return false
  }
  return true
}

function rangeValuesAreStrictlyIncreasingPair(left: RangeValue | null, right: RangeValue | null) {
  if (left == null || right == null) return true
  if (left.kind !== 'range-number' || right.kind !== 'range-number') return false
  return left.max < right.min - epsilon
}

// Range narrowing

export function narrowableComparisonOperator(
  operator: ComparisonOp | '==' | '!=',
  assumeTrue: boolean,
): NarrowedComparisonOp | null {
  if (assumeTrue) {
    if (operator === '===') return '=='
    if (operator === '!==') return '!='
    return operator
  }
  switch (operator) {
    case '<':
      return '>='
    case '<=':
      return '>'
    case '>':
      return '<='
    case '>=':
      return '<'
    case '==':
      return '!='
    case '!=':
      return '=='
    case '===':
      return '!='
    case '!==':
      return '=='
  }
  return null
}

export function narrowRangeNumberPair(
  left: RangeNumberValue,
  right: RangeNumberValue,
  operator: NarrowedComparisonOp,
): {left: RangeNumberValue; right: RangeNumberValue} | null {
  const truth = compareRangeNumbers(left, right, operator)
  if (truth === 'always-false') return null
  if (truth === 'always-true' && operator !== '==' && operator !== '!=') return {left, right}

  switch (operator) {
    case '<':
      return narrowOrderedRangeNumberPair(left, right, true)
    case '<=':
      return narrowOrderedRangeNumberPair(left, right, false)
    case '>': {
      const narrowed = narrowOrderedRangeNumberPair(right, left, true)
      return narrowed == null ? null : {left: narrowed.right, right: narrowed.left}
    }
    case '>=': {
      const narrowed = narrowOrderedRangeNumberPair(right, left, false)
      return narrowed == null ? null : {left: narrowed.right, right: narrowed.left}
    }
    case '==': {
      const min = Math.max(left.min, right.min)
      const max = Math.min(left.max, right.max)
      if (min > max + epsilon) return null
      return {
        left: rangeNumberWithExpr(min, max, left.isInteger, left.expr),
        right: rangeNumberWithExpr(min, max, right.isInteger, right.expr),
      }
    }
    case '!=':
      return {left, right}
  }
}

function narrowOrderedRangeNumberPair(
  left: RangeNumberValue,
  right: RangeNumberValue,
  strict: boolean,
): {left: RangeNumberValue; right: RangeNumberValue} | null {
  const step = strict && left.isInteger && right.isInteger ? 1 : 0
  const nextLeft = rangeNumberWithExpr(left.min, Math.min(left.max, right.max - step), left.isInteger, left.expr)
  const nextRight = rangeNumberWithExpr(Math.max(right.min, left.min + step), right.max, right.isInteger, right.expr)
  if (nextLeft.min > nextLeft.max + epsilon || nextRight.min > nextRight.max + epsilon) return null
  return {
    left: nextLeft,
    right: nextRight,
  }
}

export function minRangeNumber(left: RangeNumberValue, right: RangeNumberValue): RangeNumberValue {
  if (left.max <= right.min) return left
  if (right.max <= left.min) return right
  return rangeNumber(Math.min(left.min, right.min), Math.min(left.max, right.max), left.isInteger && right.isInteger)
}

export function maxRangeNumber(left: RangeNumberValue, right: RangeNumberValue): RangeNumberValue {
  if (left.min >= right.max) return left
  if (right.min >= left.max) return right
  return rangeNumber(Math.max(left.min, right.min), Math.max(left.max, right.max), left.isInteger && right.isInteger)
}

// Range path operations

export function setRangeValueAtPath(env: Map<string, RangeValue>, path: RangeAccessPath, nextValue: RangeValue): Map<string, RangeValue> | null {
  if (path.props.length === 0) {
    const nextEnv = new Map(env)
    nextEnv.set(path.root, nextValue)
    return nextEnv
  }

  const rootValue = env.get(path.root)
  if (rootValue == null) return null
  const nextRootValue = setNestedRangeValue(rootValue, path.props, nextValue)
  if (nextRootValue == null) return null
  const nextEnv = new Map(env)
  nextEnv.set(path.root, nextRootValue)
  return nextEnv
}

function setNestedRangeValue(current: RangeValue, props: string[], nextValue: RangeValue): RangeValue | null {
  if (props.length === 0) return nextValue
  if (current.kind !== 'range-object') return null
  const [head, ...tail] = props
  const child = current.props[head!]
  if (child == null) return null
  const nextChild = setNestedRangeValue(child, tail, nextValue)
  if (nextChild == null) return null
  return rangeObject({
    ...current.props,
    [head!]: nextChild,
  })
}

// Symbolic expression algebra

export function constExpr(value: number): ScalarExpr {
  return {kind: 'const', value}
}

export function varExpr(name: string): ScalarExpr {
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

export function powExpr(left: ScalarExpr, right: ScalarExpr): ScalarExpr {
  return {kind: 'pow', left, right}
}

export function negateBoolExpr(expr: BoolExpr): BoolExpr {
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

export function symbolicExprEquals(left: ScalarExpr, right: ScalarExpr) {
  return proveSymbolicExprEquality(left, right).status === 'pass'
}

export type SymbolicEqualityProofResult =
  | {status: 'pass'}
  | {status: 'fail'}
  | {status: 'unknown'; reason: string}

export function proveSymbolicExprEquality(left: ScalarExpr, right: ScalarExpr): SymbolicEqualityProofResult {
  if (scalarExprStructurallyEquals(left, right)) return {status: 'pass'}
  const linear = toLinearExpr(subExpr(left, right))
  if (linear == null) return {status: 'unknown', reason: 'symbolic equality is not linear'}
  if (Math.abs(linear.constant) > epsilon) return {status: 'fail'}
  for (const coefficient of Object.values(linear.terms)) {
    if (Math.abs(coefficient) > epsilon) return {status: 'fail'}
  }
  return {status: 'pass'}
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
    case 'pow':
      return `(${formatScalarExpr(expr.left)} ** ${formatScalarExpr(expr.right)})`
  }
}

function scalarExprStructurallyEquals(left: ScalarExpr, right: ScalarExpr): boolean {
  if (left.kind !== right.kind) return false
  switch (left.kind) {
    case 'const':
      return right.kind === 'const' && Math.abs(left.value - right.value) <= epsilon
    case 'var':
      return right.kind === 'var' && left.name === right.name
    case 'add':
    case 'sub':
    case 'mul':
    case 'div':
    case 'pow':
      return (
        (right.kind === 'add' || right.kind === 'sub' || right.kind === 'mul' || right.kind === 'div' || right.kind === 'pow') &&
        scalarExprStructurallyEquals(left.left, right.left) &&
        scalarExprStructurallyEquals(left.right, right.right)
      )
  }
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
    case 'pow':
      if (expr.right.kind === 'const' && Math.abs(expr.right.value) <= epsilon) return {constant: 1, terms: {}}
      if (expr.right.kind === 'const' && Math.abs(expr.right.value - 1) <= epsilon) return toLinearExpr(expr.left)
      return null
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

// Concrete array utilities

export function concreteNumberArrayIsStrictlyIncreasing(array: ArrayValue) {
  for (let i = 1; i < array.items.length; i++) {
    if (expectConcreteNumber(array.items[i - 1]!) >= expectConcreteNumber(array.items[i]!) - epsilon) return false
  }
  return true
}

export function describeNumericArray(array: ArrayValue) {
  return array.items.map(item => expectConcreteNumber(item)).join(',')
}
