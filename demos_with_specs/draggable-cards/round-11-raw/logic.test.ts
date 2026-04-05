import { describe, expect, test } from "bun:test"

import {
  estimateReleaseVelocity,
  getReorderIndex,
  getSlotMidpoints,
  reorderIds,
} from "./logic"

describe("reorder threshold logic", () => {
  test("dragging past the next midpoint reorders before release", () => {
    const slotMidpoints = getSlotMidpoints([100, 100, 100, 100, 100], 50)

    expect(
      getReorderIndex({
        currentIndex: 0,
        draggedCenterY: slotMidpoints[1]! - 0.1,
        slotMidpoints,
      }),
    ).toBe(0)

    expect(
      getReorderIndex({
        currentIndex: 0,
        draggedCenterY: slotMidpoints[1]! + 0.1,
        slotMidpoints,
      }),
    ).toBe(1)

    expect(reorderIds(["card-0", "card-1", "card-2", "card-3", "card-4"], 0, 1)).toEqual([
      "card-1",
      "card-0",
      "card-2",
      "card-3",
      "card-4",
    ])
  })

  test("dragging back above the previous midpoint moves upward again", () => {
    const slotMidpoints = getSlotMidpoints([100, 100, 100, 100, 100], 50)

    expect(
      getReorderIndex({
        currentIndex: 3,
        draggedCenterY: slotMidpoints[2]! + 0.1,
        slotMidpoints,
      }),
    ).toBe(3)

    expect(
      getReorderIndex({
        currentIndex: 3,
        draggedCenterY: slotMidpoints[2]! - 0.1,
        slotMidpoints,
      }),
    ).toBe(2)
  })
})

describe("release velocity estimation", () => {
  test("uses only recent pointer history from the last 100ms", () => {
    const velocity = estimateReleaseVelocity({
      nowMs: 150,
      samples: [
        { timeMs: 0, x: 0, y: 0 },
        { timeMs: 60, x: 20, y: 40 },
        { timeMs: 110, x: 80, y: 130 },
        { timeMs: 150, x: 140, y: 220 },
      ],
      windowMs: 100,
    })

    expect(velocity.x).toBeCloseTo(1.3333333333, 6)
    expect(velocity.y).toBeCloseTo(2, 6)
  })

  test("returns zero when there is not enough recent movement", () => {
    const velocity = estimateReleaseVelocity({
      nowMs: 100,
      samples: [{ timeMs: 100, x: 10, y: 20 }],
      windowMs: 100,
    })

    expect(velocity).toEqual({ x: 0, y: 0 })
  })
})
