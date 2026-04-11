import {
  buildStaticLayoutReport,
  check,
  concreteNumber,
  concreteObject,
  epsilon,
  expectConcreteNumber,
  expectObject,
  expectRangeNumber,
  expectRangeObject,
  getProp,
  getRangeProp,
  type InternalLawSummary,
  joinRangeCases,
  LoweredProgramAnalyzer,
  rangeNumber,
  type StaticLayoutVerificationReport,
} from '../core'

export function runLifeCalendarStaticVerification(sourceText: string): StaticLayoutVerificationReport {
  const analyzer = new LoweredProgramAnalyzer(sourceText, {})
  const laws = new Map<string, InternalLawSummary>()

  verifyGridSizingConcrete(analyzer, laws)
  verifyGridSizingRange(analyzer, laws)
  verifyHitTestConcrete(analyzer, laws)

  return buildStaticLayoutReport('life-calendar-static-layout', 'demos/life-calendar/grid-sizing.ts', laws)
}

function verifyGridSizingConcrete(analyzer: LoweredProgramAnalyzer, laws: Map<string, InternalLawSummary>) {
  const life = Math.floor(75 * 365.25)

  const viewports = [
    {label: 'narrow', gridSizeX: 312, gridSizeY: 592},
    {label: 'medium', gridSizeX: 792, gridSizeY: 592},
    {label: 'wide', gridSizeX: 1592, gridSizeY: 892},
    {label: 'tall', gridSizeX: 392, gridSizeY: 1192},
  ]

  for (const vp of viewports) {
    const returns = analyzer.evaluateFunction('gridSizing', [
      concreteNumber(life),
      concreteNumber(vp.gridSizeX),
      concreteNumber(vp.gridSizeY),
    ], 'concrete')

    check(laws, 'gridSizing stays branch-free per concrete viewport', returns.length === 1, () => ({
      viewport: vp.label,
      cases: returns.length,
    }), 'concrete-fixture')
    if (returns.length !== 1) continue

    const result = expectObject(returns[0]!.value)
    const blockSize = expectConcreteNumber(getProp(result, 'blockSize'))
    const countX = expectConcreteNumber(getProp(result, 'countX'))
    const countY = expectConcreteNumber(getProp(result, 'countY'))
    const gridFinalSizeX = expectConcreteNumber(getProp(result, 'gridFinalSizeX'))
    const gridFinalSizeY = expectConcreteNumber(getProp(result, 'gridFinalSizeY'))

    check(laws, 'gridSizing keeps countX a multiple of 7', countX % 7 === 0, () => ({
      viewport: vp.label,
      countX,
    }), 'concrete-fixture')
    check(laws, 'gridSizing keeps blockSize positive', blockSize > epsilon, () => ({
      viewport: vp.label,
      blockSize,
    }), 'concrete-fixture')
    check(laws, 'gridSizing fills gridSizeY exactly', Math.abs(gridFinalSizeY - vp.gridSizeY) <= epsilon, () => ({
      viewport: vp.label,
      gridFinalSizeY,
      gridSizeY: vp.gridSizeY,
    }), 'concrete-fixture')
    check(laws, 'gridSizing fits within gridSizeX', gridFinalSizeX <= vp.gridSizeX + epsilon, () => ({
      viewport: vp.label,
      gridFinalSizeX,
      gridSizeX: vp.gridSizeX,
    }), 'concrete-fixture')
    check(laws, 'gridSizing covers all cells', countX * countY >= life, () => ({
      viewport: vp.label,
      countX,
      countY,
      capacity: countX * countY,
      life,
    }), 'concrete-fixture')
    check(laws, 'gridSizing keeps countX and countY integral', Math.abs(countX - Math.round(countX)) <= epsilon && Math.abs(countY - Math.round(countY)) <= epsilon, () => ({
      viewport: vp.label,
      countX,
      countY,
    }), 'concrete-fixture')
    check(laws, 'gridSizing derives gridFinalSizeX from countX * blockSize', Math.abs(gridFinalSizeX - countX * blockSize) <= epsilon, () => ({
      viewport: vp.label,
      gridFinalSizeX,
      expected: countX * blockSize,
    }), 'concrete-fixture')
    check(laws, 'gridSizing derives gridFinalSizeY from countY * blockSize', Math.abs(gridFinalSizeY - countY * blockSize) <= epsilon, () => ({
      viewport: vp.label,
      gridFinalSizeY,
      expected: countY * blockSize,
    }), 'concrete-fixture')
  }
}

function verifyGridSizingRange(analyzer: LoweredProgramAnalyzer, laws: Map<string, InternalLawSummary>) {
  const life = Math.floor(75 * 365.25)

  const result = expectRangeObject(joinRangeCases(analyzer.evaluateFunctionRange('gridSizing', [
    rangeNumber(life, life, true),
    rangeNumber(300, 1600, true),
    rangeNumber(400, 1200, true),
  ])))

  const blockSize = expectRangeNumber(getRangeProp(result, 'blockSize'))
  const countX = expectRangeNumber(getRangeProp(result, 'countX'))
  const countY = expectRangeNumber(getRangeProp(result, 'countY'))

  check(laws, 'gridSizing keeps blockSize positive over viewport intervals', blockSize.min > 0, () => ({
    blockSizeMin: blockSize.min,
  }), 'range')
  check(laws, 'gridSizing keeps countX positive and integral over viewport intervals', countX.min > 0 && countX.isInteger, () => ({
    countXMin: countX.min,
    countXMax: countX.max,
    countXIsInteger: countX.isInteger,
  }), 'range')
  check(laws, 'gridSizing keeps countY positive and integral over viewport intervals', countY.min > 0 && countY.isInteger, () => ({
    countYMin: countY.min,
    countYMax: countY.max,
    countYIsInteger: countY.isInteger,
  }), 'range')
}

function verifyHitTestConcrete(analyzer: LoweredProgramAnalyzer, laws: Map<string, InternalLawSummary>) {
  // Grid: 10x10 blockSize, 70 countX, 50 countY, at position (100, 50), final size 700x500
  const blockSize = 10
  const countX = 70
  const countY = 50
  const gridLeft = 100
  const gridTop = 50
  const gridFinalSizeX = 700
  const gridFinalSizeY = 500

  const scenarios = [
    {label: 'inside_origin', px: 105, py: 55, expected: 0},
    {label: 'inside_second_row', px: 105, py: 65, expected: 70},
    {label: 'inside_last_col', px: 795, py: 55, expected: 69},
    {label: 'outside_left', px: 95, py: 55, expected: null},
    {label: 'outside_top', px: 105, py: 45, expected: null},
    {label: 'outside_right', px: 805, py: 55, expected: null},
    {label: 'outside_bottom', px: 105, py: 555, expected: null},
  ]

  for (const scenario of scenarios) {
    const returns = analyzer.evaluateFunction('hitTest', [
      concreteNumber(blockSize),
      concreteNumber(countX),
      concreteNumber(countY),
      concreteNumber(gridLeft),
      concreteNumber(gridTop),
      concreteNumber(gridFinalSizeX),
      concreteNumber(gridFinalSizeY),
      concreteObject({x: concreteNumber(scenario.px), y: concreteNumber(scenario.py)}),
    ], 'concrete')

    check(laws, 'hitTest stays branch-free per concrete scenario', returns.length === 1, () => ({
      scenario: scenario.label,
      cases: returns.length,
    }), 'concrete-fixture')
    if (returns.length !== 1) continue

    const result = returns[0]!.value
    const actual = result.kind === 'null' ? null : expectConcreteNumber(result)

    check(laws, 'hitTest returns the expected cell index at known positions', actual === scenario.expected, () => ({
      scenario: scenario.label,
      actual,
      expected: scenario.expected,
    }), 'concrete-fixture')
  }
}
