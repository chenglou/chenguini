import { describe, expect, test } from "bun:test"

import {
  estimateReleaseVelocity,
  getDepthTier,
  getDraggedCardPosition,
  getReorderedCardIds,
} from "./drag-logic"

describe("reorder threshold logic", () => {
  const cardHeightsById = {
    "0": 100,
    "1": 120,
    "2": 80,
  } as const

  test("waits for the next midpoint before reordering downward", () => {
    expect(
      getReorderedCardIds({
        orderedCardIds: ["0", "1", "2"],
        draggedCardId: "0",
        draggedMidpointY: 109.9,
        topPadding: 50,
        cardHeightsById,
      }),
    ).toEqual(["0", "1", "2"])

    expect(
      getReorderedCardIds({
        orderedCardIds: ["0", "1", "2"],
        draggedCardId: "0",
        draggedMidpointY: 110.1,
        topPadding: 50,
        cardHeightsById,
      }),
    ).toEqual(["1", "0", "2"])
  })

  test("waits for the previous midpoint before reordering upward", () => {
    expect(
      getReorderedCardIds({
        orderedCardIds: ["0", "1", "2"],
        draggedCardId: "2",
        draggedMidpointY: 210.1,
        topPadding: 50,
        cardHeightsById,
      }),
    ).toEqual(["0", "1", "2"])

    expect(
      getReorderedCardIds({
        orderedCardIds: ["0", "1", "2"],
        draggedCardId: "2",
        draggedMidpointY: 209.9,
        topPadding: 50,
        cardHeightsById,
      }),
    ).toEqual(["0", "2", "1"])
  })
})

describe("release velocity estimation", () => {
  test("uses only the recent pointer history window", () => {
    expect(
      estimateReleaseVelocity({
        nowMs: 120,
        pointerSamples: [
          { timeMs: 0, x: 0, y: 0 },
          { timeMs: 40, x: 40, y: 20 },
          { timeMs: 80, x: 70, y: 50 },
          { timeMs: 120, x: 100, y: 90 },
        ],
      }),
    ).toEqual({
      xPxPerMs: 0.75,
      yPxPerMs: 0.875,
    })
  })

  test("returns zero when there is not enough recent movement to measure", () => {
    expect(
      estimateReleaseVelocity({
        nowMs: 80,
        pointerSamples: [{ timeMs: 80, x: 100, y: 120 }],
      }),
    ).toEqual({
      xPxPerMs: 0,
      yPxPerMs: 0,
    })
  })
})

describe("pointer delta seam", () => {
  test("keeps the dragged card under the pointer with the stored delta", () => {
    expect(
      getDraggedCardPosition({
        pointerX: 480,
        pointerY: 290,
        deltaX: 100,
        deltaY: 30,
        rowSizeX: 320,
        windowWidth: 1000,
      }),
    ).toEqual({
      rawX: 380,
      centeredX: 340,
      x: 353.3333333333333,
      y: 260,
    })
  })
})

describe("depth layering", () => {
  test("puts dragged above settling above the base layer", () => {
    expect(getDepthTier({ cardId: "0", draggedCardId: "0", settlingCardId: "1" })).toBe(3)
    expect(getDepthTier({ cardId: "1", draggedCardId: "0", settlingCardId: "1" })).toBe(2)
    expect(getDepthTier({ cardId: "2", draggedCardId: "0", settlingCardId: "1" })).toBe(1)
  })
})
