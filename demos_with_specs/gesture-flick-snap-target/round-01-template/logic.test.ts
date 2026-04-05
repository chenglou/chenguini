import {describe, expect, test} from 'bun:test'
import {
  CORNER_PAD,
  DECAY_FRICTION,
  PIP_HEIGHT,
  PIP_WIDTH,
  chooseNearestCorner,
  computeCornerPositions,
  computeDecayRestPosition,
  estimateReleaseVelocity,
} from './logic'

describe('corner geometry', () => {
  test('uses the fixed PiP size and corner pad', () => {
    expect(computeCornerPositions({width: 500, height: 400})).toEqual({
      topLeft: {x: CORNER_PAD, y: CORNER_PAD},
      topRight: {x: 500 - CORNER_PAD - PIP_WIDTH, y: CORNER_PAD},
      bottomLeft: {x: CORNER_PAD, y: 400 - CORNER_PAD - PIP_HEIGHT},
      bottomRight: {x: 500 - CORNER_PAD - PIP_WIDTH, y: 400 - CORNER_PAD - PIP_HEIGHT},
    })
  })

  test('picks the nearest corner from the decay rest position', () => {
    const viewport = {width: 500, height: 400}

    expect(chooseNearestCorner({x: 340, y: 40}, viewport)).toBe('topRight')
    expect(chooseNearestCorner({x: 40, y: 270}, viewport)).toBe('bottomLeft')
    expect(chooseNearestCorner({x: 350, y: 280}, viewport)).toBe('bottomRight')
  })
})

test('decay rest position uses the release velocity and friction', () => {
  expect(
    computeDecayRestPosition({
      position: {x: 20, y: 50},
      velocity: {x: 450, y: -225},
      friction: DECAY_FRICTION,
    }),
  ).toEqual({x: 120, y: 0})
})

test('release velocity uses the earliest sample still inside the last 100ms', () => {
  const velocity = estimateReleaseVelocity([
    {x: 0, y: 0, time: 0},
    {x: 100, y: 0, time: 120},
    {x: 160, y: 20, time: 170},
    {x: 220, y: 50, time: 230},
    {x: 250, y: 80, time: 260},
  ])

  expect(velocity.x).toBeCloseTo(1000, 6)
  expect(velocity.y).toBeCloseTo(666.6666667, 6)
})
