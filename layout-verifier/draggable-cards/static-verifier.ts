import {
  buildStaticLayoutReport,
  check,
  concreteArray,
  concreteNumber,
  epsilon,
  expectArray,
  expectBoolean,
  expectConcreteNumber,
  expectRangeNumber,
  type InternalLawSummary,
  joinRangeCases,
  LoweredProgramAnalyzer,
  rangeNumber,
  type StaticLayoutVerificationReport,
  type WitnessValue,
} from '../core'

export function runDraggableCardsStaticVerification(sourceText: string): StaticLayoutVerificationReport {
  const analyzer = new LoweredProgramAnalyzer(sourceText, {})
  const laws = new Map<string, InternalLawSummary>()

  verifyCenter(analyzer, laws)
  verifySwapThresholds(analyzer, laws)
  verifyStackLayout(analyzer, laws)

  return buildStaticLayoutReport('draggable-cards-static-layout', 'demos/draggable-cards/swap-layout.ts', laws)
}

function verifyCenter(analyzer: LoweredProgramAnalyzer, laws: Map<string, InternalLawSummary>) {
  const cases = [
    {containee: 320, container: 1000, label: 'desktop'},
    {containee: 320, container: 375, label: 'mobile'},
    {containee: 100, container: 100, label: 'exact fit'},
  ]

  for (const scenario of cases) {
    const returns = analyzer.evaluateFunction('center', [
      concreteNumber(scenario.containee),
      concreteNumber(scenario.container),
    ], 'concrete')
    check(laws, 'center stays branch-free per concrete scenario', returns.length === 1, () => ({
      scenario: scenario.label,
      cases: returns.length,
    }), 'concrete-fixture')
    if (returns.length !== 1) continue

    const actual = expectConcreteNumber(returns[0]!.value)
    const expected = (scenario.container - scenario.containee) / 2
    check(laws, 'center returns half the remaining space', Math.abs(actual - expected) <= epsilon, () => ({
      scenario: scenario.label,
      actual,
      expected,
    }), {kind: 'concrete-fixture', targets: ['center.return']})
  }

  const ranged = expectRangeNumber(joinRangeCases(analyzer.evaluateFunctionRange('center', [
    rangeNumber(100, 400, true),
    rangeNumber(320, 1920, true),
  ])))
  check(laws, 'center keeps expected range bounds', (
    Math.abs(ranged.min - (320 - 400) / 2) <= epsilon &&
    Math.abs(ranged.max - (1920 - 100) / 2) <= epsilon
  ), () => ({
    actual: `[${ranged.min}, ${ranged.max}]`,
    expected: `[-40, 910]`,
  }), {kind: 'range', targets: ['center.return']})
}

function verifySwapThresholds(analyzer: LoweredProgramAnalyzer, laws: Map<string, InternalLawSummary>) {
  const cases = [
    {fn: 'shouldSwapUp', pointerY: 139, neighborDestY: 100, neighborSizeY: 80, expected: true, label: 'up before midpoint'},
    {fn: 'shouldSwapUp', pointerY: 140, neighborDestY: 100, neighborSizeY: 80, expected: false, label: 'up at midpoint'},
    {fn: 'shouldSwapUp', pointerY: 141, neighborDestY: 100, neighborSizeY: 80, expected: false, label: 'up after midpoint'},
    {fn: 'shouldSwapDown', pointerY: 139, neighborDestY: 100, neighborSizeY: 80, expected: false, label: 'down before midpoint'},
    {fn: 'shouldSwapDown', pointerY: 140, neighborDestY: 100, neighborSizeY: 80, expected: false, label: 'down at midpoint'},
    {fn: 'shouldSwapDown', pointerY: 141, neighborDestY: 100, neighborSizeY: 80, expected: true, label: 'down after midpoint'},
  ]

  for (const scenario of cases) {
    const returns = analyzer.evaluateFunction(scenario.fn, [
      concreteNumber(scenario.pointerY),
      concreteNumber(scenario.neighborDestY),
      concreteNumber(scenario.neighborSizeY),
    ], 'concrete')
    check(laws, `${scenario.fn} stays branch-free per concrete scenario`, returns.length === 1, () => ({
      scenario: scenario.label,
      cases: returns.length,
    }), 'concrete-fixture')
    if (returns.length !== 1) continue

    const actual = expectBoolean(returns[0]!.value)
    if (actual.mode !== 'concrete') throw new Error(`${scenario.fn} expected a concrete boolean`)
    check(laws, `${scenario.fn} uses a strict midpoint threshold`, actual.value === scenario.expected, () => ({
      scenario: scenario.label,
      pointerY: scenario.pointerY,
      midpoint: scenario.neighborDestY + scenario.neighborSizeY / 2,
      actual: actual.value,
      expected: scenario.expected,
    }), {kind: 'concrete-fixture', targets: [`${scenario.fn}.return`]})
  }

  let midpointDeadZone = true
  let failure: Record<string, WitnessValue> | null = null
  for (let destY = 0; destY <= 500; destY += 50) {
    for (let sizeY = 40; sizeY <= 200; sizeY += 40) {
      const midpoint = destY + sizeY / 2
      const up = expectBoolean(analyzer.evaluateFunction('shouldSwapUp', [
        concreteNumber(midpoint),
        concreteNumber(destY),
        concreteNumber(sizeY),
      ], 'concrete')[0]!.value)
      const down = expectBoolean(analyzer.evaluateFunction('shouldSwapDown', [
        concreteNumber(midpoint),
        concreteNumber(destY),
        concreteNumber(sizeY),
      ], 'concrete')[0]!.value)
      if (up.mode !== 'concrete' || down.mode !== 'concrete' || up.value !== false || down.value !== false) {
        midpointDeadZone = false
        failure ??= {destY, sizeY, midpoint}
      }
    }
  }
  check(laws, 'swap thresholds leave a dead zone at the midpoint', midpointDeadZone, () => failure ?? {}, {
    kind: 'concrete-sweep',
    targets: ['shouldSwapUp.return', 'shouldSwapDown.return'],
  })
}

function verifyStackLayout(analyzer: LoweredProgramAnalyzer, laws: Map<string, InternalLawSummary>) {
  const scenarios = [
    {label: 'mixed rows', rowSizes: [80, 100, 60], paddingTop: 50},
    {label: 'single row', rowSizes: [120], paddingTop: 50},
    {label: 'equal rows', rowSizes: [50, 50, 50, 50], paddingTop: 20},
  ]

  for (const scenario of scenarios) {
    const returns = analyzer.evaluateFunction('stackLayout', [
      concreteArray(scenario.rowSizes.map(size => concreteNumber(size))),
      concreteNumber(scenario.paddingTop),
    ], 'concrete')
    check(laws, 'stackLayout stays branch-free per concrete row set', returns.length === 1, () => ({
      scenario: scenario.label,
      cases: returns.length,
    }), 'concrete-fixture')
    if (returns.length !== 1) continue

    const positions = expectArray(returns[0]!.value).items.map(value => expectConcreteNumber(value))
    let contiguous = true
    let failure: Record<string, WitnessValue> | null = null
    let expected = scenario.paddingTop
    for (let i = 0; i < scenario.rowSizes.length; i++) {
      if (Math.abs(positions[i]! - expected) > epsilon) {
        contiguous = false
        failure ??= {
          scenario: scenario.label,
          rowIndex: i,
          actualY: positions[i]!,
          expectedY: expected,
        }
      }
      expected += scenario.rowSizes[i]!
    }
    check(laws, 'stackLayout returns one contiguous top per row', contiguous, () => failure ?? {
      scenario: scenario.label,
    }, {kind: 'concrete-fixture', targets: ['stackLayout.return']})
  }
}
