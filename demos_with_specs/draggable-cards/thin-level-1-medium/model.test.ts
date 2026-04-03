import { describe, expect, it } from "bun:test";

import { estimateReleaseVelocity, getCardLayouts, reorderByPointerMidpoint } from "./model.js";

describe("reorderByPointerMidpoint", () => {
  it("moves card 2 before card 1 once the pointer crosses card 1 midpoint", () => {
    const orderedCardIds = [0, 1, 2, 3, 4];
    const layouts = getCardLayouts(orderedCardIds);
    const card1 = layouts.get(1);

    expect(card1).toBeDefined();
    expect(reorderByPointerMidpoint(orderedCardIds, 2, card1!.y + card1!.height / 2 - 1)).toEqual([0, 2, 1, 3, 4]);
  });

  it("moves card 1 after card 2 once the pointer crosses card 2 midpoint", () => {
    const orderedCardIds = [0, 1, 2, 3, 4];
    const layouts = getCardLayouts(orderedCardIds);
    const card2 = layouts.get(2);

    expect(card2).toBeDefined();
    expect(reorderByPointerMidpoint(orderedCardIds, 1, card2!.y + card2!.height / 2 + 1)).toEqual([0, 2, 1, 3, 4]);
  });

  it("stays put while the pointer remains on the original side of the midpoint", () => {
    const orderedCardIds = [0, 1, 2, 3, 4];
    const layouts = getCardLayouts([0, 2, 3, 4]);
    const card2 = layouts.get(2);

    expect(card2).toBeDefined();
    expect(reorderByPointerMidpoint(orderedCardIds, 1, card2!.y + card2!.height / 2 - 1)).toEqual([0, 1, 2, 3, 4]);
  });
});

describe("estimateReleaseVelocity", () => {
  it("uses roughly the last 100ms of pointer history", () => {
    expect(
      estimateReleaseVelocity(
        [
          { x: 0, y: 0, time: 0 },
          { x: 20, y: 10, time: 20 },
          { x: 60, y: 30, time: 60 },
          { x: 100, y: 50, time: 120 },
        ],
        120,
      ),
    ).toEqual({ vx: 800, vy: 400 });
  });

  it("falls back to zero when there is no usable motion window", () => {
    expect(estimateReleaseVelocity([{ x: 40, y: 10, time: 80 }], 80)).toEqual({ vx: 0, vy: 0 });
  });
});
