import {describe, expect, test} from 'bun:test'

import {
  chooseNearestCorner,
  computeDecayRestPosition,
  estimateReleaseVelocity,
  getCornerTargets,
} from './pip'

describe('gesture flick snap target policy', () => {
  test('corner targets match the four padded viewport corners', () => {
    expect(getCornerTargets({width: 800, height: 600})).toEqual([
      {id: 'top-left', x: 20, y: 20},
      {id: 'top-right', x: 660, y: 20},
      {id: 'bottom-left', x: 20, y: 500},
      {id: 'bottom-right', x: 660, y: 500},
    ])
  })

  test('nearest-corner choice uses the decay rest position', () => {
    const corners = getCornerTargets({width: 800, height: 600})

    expect(chooseNearestCorner(corners, {x: 580, y: 120}).id).toBe('top-right')
    expect(chooseNearestCorner(corners, {x: 520, y: 430}).id).toBe('bottom-right')
    expect(chooseNearestCorner(corners, {x: 80, y: 120}).id).toBe('top-left')
  })

  test('decay rest position integrates velocity with friction', () => {
    expect(
      computeDecayRestPosition({
        position: {x: 100, y: 220},
        velocity: {x: 450, y: -225},
      }),
    ).toEqual({x: 200, y: 170})
  })

  test('release velocity uses recent pointer history from about the last 100ms', () => {
    expect(
      estimateReleaseVelocity([
        {x: 0, y: 0, time: 0},
        {x: 0, y: 0, time: 40},
        {x: 50, y: 40, time: 100},
        {x: 100, y: 80, time: 140},
      ]),
    ).toEqual({x: 1000, y: 800})
  })
})
