import { describe, expect, test } from "bun:test"

import {
  chooseNearestCorner,
  computeCornerPositions,
  computeDecayRestPosition,
  estimateReleaseVelocity,
} from "./gesture.js"

describe("gesture math", () => {
  test("corner positions stay inset by the configured pad", () => {
    expect(
      computeCornerPositions({
        viewportWidth: 400,
        viewportHeight: 300,
        cardWidth: 120,
        cardHeight: 80,
        cornerPad: 20,
      }),
    ).toEqual({
      "top-left": { x: 20, y: 20 },
      "top-right": { x: 260, y: 20 },
      "bottom-left": { x: 20, y: 200 },
      "bottom-right": { x: 260, y: 200 },
    })
  })

  test("nearest corner uses the decay rest position instead of the current corner", () => {
    const corners = computeCornerPositions({
      viewportWidth: 400,
      viewportHeight: 300,
      cardWidth: 120,
      cardHeight: 80,
      cornerPad: 20,
    })

    expect(chooseNearestCorner({ x: 220, y: 30 }, corners)).toBe("top-right")
    expect(chooseNearestCorner({ x: 35, y: 180 }, corners)).toBe("bottom-left")
  })

  test("decay rest position follows the friction-scaled release velocity", () => {
    expect(
      computeDecayRestPosition({
        position: { x: 40, y: 60 },
        velocity: { vx: 225, vy: -90 },
        decayFriction: 4.5,
      }),
    ).toEqual({ x: 90, y: 40 })
  })

  test("release velocity uses recent pointer history from about the last 100ms", () => {
    expect(
      estimateReleaseVelocity({
        samples: [
          { x: 0, y: 0, time: 0 },
          { x: 20, y: 0, time: 40 },
          { x: 60, y: 20, time: 80 },
          { x: 100, y: 40, time: 120 },
          { x: 160, y: 70, time: 180 },
        ],
        now: 180,
        windowMs: 100,
      }),
    ).toEqual({ vx: 1000, vy: 500 })
  })
})
