import {
  buildStaticLayoutReport,
  check,
  concreteNumber,
  epsilon,
  expectArray,
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
  type WitnessValue,
} from '../core'

export function runGestureFlickStaticVerification(sourceText: string): StaticLayoutVerificationReport {
  const analyzer = new LoweredProgramAnalyzer(sourceText, {Infinity})
  const laws = new Map<string, InternalLawSummary>()

  verifyCorners(analyzer, laws)
  verifyNearestCorner(analyzer, laws)
  verifyDecayRestPos(analyzer, laws)

  return buildStaticLayoutReport('gesture-flick-snap-target-static-layout', 'demos/gesture-flick-snap-target/snap-layout.ts', laws)
}

function verifyCorners(analyzer: LoweredProgramAnalyzer, laws: Map<string, InternalLawSummary>) {
  const pipW = analyzer.getGlobalNumber('pipW')
  const pipH = analyzer.getGlobalNumber('pipH')
  const cornerPad = analyzer.getGlobalNumber('cornerPad')
  const cases = [
    {w: 800, h: 600, label: 'desktop'},
    {w: 375, h: 667, label: 'mobile'},
  ]

  for (const scenario of cases) {
    const returns = analyzer.evaluateFunction('getCorners', [
      concreteNumber(scenario.w),
      concreteNumber(scenario.h),
    ], 'concrete')
    check(laws, 'getCorners stays branch-free per concrete viewport', returns.length === 1, () => ({
      scenario: scenario.label,
      cases: returns.length,
    }), 'concrete-fixture')
    if (returns.length !== 1) continue

    const corners = expectArray(returns[0]!.value)
    check(laws, 'getCorners returns exactly four corners', corners.items.length === 4, () => ({
      scenario: scenario.label,
      count: corners.items.length,
    }), 'concrete-fixture')

    const expectedCorners = [
      {x: cornerPad, y: cornerPad},
      {x: scenario.w - pipW - cornerPad, y: cornerPad},
      {x: cornerPad, y: scenario.h - pipH - cornerPad},
      {x: scenario.w - pipW - cornerPad, y: scenario.h - pipH - cornerPad},
    ]
    for (let i = 0; i < expectedCorners.length; i++) {
      const corner = expectObject(corners.items[i]!)
      const actualX = expectConcreteNumber(getProp(corner, 'x'))
      const actualY = expectConcreteNumber(getProp(corner, 'y'))
      const expected = expectedCorners[i]!
      check(laws, 'getCorners keeps each corner at the padded viewport edge', (
        Math.abs(actualX - expected.x) <= epsilon &&
        Math.abs(actualY - expected.y) <= epsilon
      ), () => ({
        scenario: scenario.label,
        cornerIndex: i,
        actualX,
        expectedX: expected.x,
        actualY,
        expectedY: expected.y,
      }), {kind: 'concrete-fixture', targets: ['getCorners.return']})
    }
  }

  const ranged = joinRangeCases(analyzer.evaluateFunctionRange('getCorners', [
    rangeNumber(320, 1920, true),
    rangeNumber(480, 1200, true),
  ]))
  const rangedCorners = ranged.kind === 'range-array' ? ranged : null
  check(laws, 'getCorners keeps four corners over viewport ranges', rangedCorners != null && rangedCorners.lengthMin === 4 && rangedCorners.lengthMax === 4, () => ({
    kind: ranged.kind,
  }), {kind: 'range', targets: ['getCorners.return']})
  if (rangedCorners == null || rangedCorners.items == null) return

  const topLeftX = expectRangeNumber(getRangeProp(expectRangeObject(rangedCorners.items[0]!), 'x'))
  check(laws, 'getCorners keeps top-left x fixed over viewport ranges', topLeftX.min === cornerPad && topLeftX.max === cornerPad, () => ({
    actual: `[${topLeftX.min}, ${topLeftX.max}]`,
    cornerPad,
  }), {kind: 'range', targets: ['getCorners.return.0.x']})
}

function verifyNearestCorner(analyzer: LoweredProgramAnalyzer, laws: Map<string, InternalLawSummary>) {
  const w = 800
  const h = 600
  const cornerReturns = analyzer.evaluateFunction('getCorners', [
    concreteNumber(w),
    concreteNumber(h),
  ], 'concrete')
  if (cornerReturns.length !== 1) return
  const corners = expectArray(cornerReturns[0]!.value).items.map(value => {
    const corner = expectObject(value)
    return {
      x: expectConcreteNumber(getProp(corner, 'x')),
      y: expectConcreteNumber(getProp(corner, 'y')),
    }
  })

  let returnsCorner = true
  let minimal = true
  let cornerFailure: Record<string, WitnessValue> | null = null
  let minimalFailure: Record<string, WitnessValue> | null = null
  for (let x = 0; x <= w; x += 50) {
    for (let y = 0; y <= h; y += 50) {
      const returns = analyzer.evaluateFunction('nearestCorner', [
        concreteNumber(x),
        concreteNumber(y),
        concreteNumber(w),
        concreteNumber(h),
      ], 'concrete')
      if (returns.length !== 1) continue

      const result = expectObject(returns[0]!.value)
      const resultX = expectConcreteNumber(getProp(result, 'x'))
      const resultY = expectConcreteNumber(getProp(result, 'y'))
      const isCorner = corners.some(corner => Math.abs(corner.x - resultX) <= epsilon && Math.abs(corner.y - resultY) <= epsilon)
      if (!isCorner) {
        returnsCorner = false
        cornerFailure ??= {x, y, resultX, resultY}
      }

      const resultDistance = (resultX - x) ** 2 + (resultY - y) ** 2
      for (const corner of corners) {
        const cornerDistance = (corner.x - x) ** 2 + (corner.y - y) ** 2
        if (cornerDistance < resultDistance - epsilon) {
          minimal = false
          minimalFailure ??= {
            x,
            y,
            resultX,
            resultY,
            closerX: corner.x,
            closerY: corner.y,
            resultDistance,
            cornerDistance,
          }
        }
      }
    }
  }

  check(laws, 'nearestCorner always returns one of the four corners', returnsCorner, () => cornerFailure ?? {}, {
    kind: 'concrete-sweep',
    targets: ['nearestCorner.return'],
  })
  check(laws, 'nearestCorner returns a corner with minimal squared distance', minimal, () => minimalFailure ?? {}, {
    kind: 'concrete-sweep',
    targets: ['nearestCorner.return'],
  })
}

function verifyDecayRestPos(analyzer: LoweredProgramAnalyzer, laws: Map<string, InternalLawSummary>) {
  const decayFriction = analyzer.getGlobalNumber('decayFriction')
  const cases = [
    {pos: 100, velocity: 450, label: 'positive velocity'},
    {pos: 100, velocity: -450, label: 'negative velocity'},
    {pos: 0, velocity: 0, label: 'zero velocity'},
  ]

  for (const scenario of cases) {
    const returns = analyzer.evaluateFunction('decayRestPos', [
      concreteNumber(scenario.pos),
      concreteNumber(scenario.velocity),
    ], 'concrete')
    check(laws, 'decayRestPos stays branch-free per concrete scenario', returns.length === 1, () => ({
      scenario: scenario.label,
      cases: returns.length,
    }), 'concrete-fixture')
    if (returns.length !== 1) continue

    const actual = expectConcreteNumber(returns[0]!.value)
    const expected = scenario.pos + scenario.velocity / decayFriction
    check(laws, 'decayRestPos adds velocity divided by friction', Math.abs(actual - expected) <= epsilon, () => ({
      scenario: scenario.label,
      actual,
      expected,
    }), {kind: 'concrete-fixture', targets: ['decayRestPos.return']})
  }
}
