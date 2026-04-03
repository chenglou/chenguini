import { describe, expect, test } from "bun:test"

import { estimateReleaseVelocity, reorderCardsDuringDrag, type CardLayout, type PointerSample } from "./logic"

describe("reorderCardsDuringDrag", () => {
  const layouts: CardLayout[] = [
    { id: "0", top: 50, height: 80 },
    { id: "1", top: 130, height: 100 },
    { id: "2", top: 230, height: 60 },
  ]

  test("swaps downward only after crossing the next card midpoint", () => {
    expect(
      reorderCardsDuringDrag({
        orderedIds: ["0", "1", "2"],
        draggedId: "0",
        pointerY: 180,
        layouts,
      }),
    ).toEqual({
      orderedIds: ["0", "1", "2"],
      swapped: false,
    })

    expect(
      reorderCardsDuringDrag({
        orderedIds: ["0", "1", "2"],
        draggedId: "0",
        pointerY: 181,
        layouts,
      }),
    ).toEqual({
      orderedIds: ["1", "0", "2"],
      swapped: true,
    })
  })

  test("swaps upward only after crossing the previous card midpoint", () => {
    expect(
      reorderCardsDuringDrag({
        orderedIds: ["0", "1", "2"],
        draggedId: "2",
        pointerY: 180,
        layouts,
      }),
    ).toEqual({
      orderedIds: ["0", "1", "2"],
      swapped: false,
    })

    expect(
      reorderCardsDuringDrag({
        orderedIds: ["0", "1", "2"],
        draggedId: "2",
        pointerY: 179,
        layouts,
      }),
    ).toEqual({
      orderedIds: ["0", "2", "1"],
      swapped: true,
    })
  })
})

describe("estimateReleaseVelocity", () => {
  test("uses roughly the last 100ms of pointer history", () => {
    const samples: PointerSample[] = [
      { x: 0, y: 0, time: 0 },
      { x: 10, y: 10, time: 40 },
      { x: 40, y: 70, time: 110 },
      { x: 70, y: 130, time: 160 },
      { x: 100, y: 190, time: 200 },
    ]

    const velocity = estimateReleaseVelocity(samples, 200)
    expect(velocity.x).toBeCloseTo(666.6666666666667)
    expect(velocity.y).toBeCloseTo(1333.3333333333335)
  })

  test("returns zero velocity when there is not enough history", () => {
    const samples: PointerSample[] = [{ x: 100, y: 190, time: 200 }]

    expect(estimateReleaseVelocity(samples, 200)).toEqual({ x: 0, y: 0 })
  })
})
