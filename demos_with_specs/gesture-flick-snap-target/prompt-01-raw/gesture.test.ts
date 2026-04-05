import { describe, expect, test } from "bun:test";

import {
  CARD_HEIGHT,
  CARD_WIDTH,
  CORNER_PAD,
  DECAY_FRICTION,
  estimateReleaseVelocity,
  getCornerPositions,
  getDecayRestPosition,
  pickNearestCorner,
} from "./gesture.js";

describe("corner geometry", () => {
  test("returns padded snap positions for all four corners", () => {
    expect(
      getCornerPositions({
        viewportWidth: 400,
        viewportHeight: 300,
        cardWidth: CARD_WIDTH,
        cardHeight: CARD_HEIGHT,
        cornerPad: CORNER_PAD,
      }),
    ).toEqual({
      "top-left": { x: 20, y: 20 },
      "top-right": { x: 260, y: 20 },
      "bottom-left": { x: 20, y: 200 },
      "bottom-right": { x: 260, y: 200 },
    });
  });

  test("picks the nearest corner from a decay rest position", () => {
    const corners = getCornerPositions({
      viewportWidth: 400,
      viewportHeight: 300,
      cardWidth: CARD_WIDTH,
      cardHeight: CARD_HEIGHT,
      cornerPad: CORNER_PAD,
    });

    expect(pickNearestCorner({ x: 238, y: 42 }, corners)).toBe("top-right");
    expect(pickNearestCorner({ x: 38, y: 182 }, corners)).toBe("bottom-left");
  });
});

describe("release math", () => {
  test("computes the decay rest position from the current position and velocity", () => {
    expect(
      getDecayRestPosition({
        position: { x: 100, y: 50 },
        velocity: { x: 90, y: -45 },
        friction: DECAY_FRICTION,
      }),
    ).toEqual({ x: 120, y: 40 });
  });

  test("estimates release velocity from the most recent pointer samples", () => {
    expect(
      estimateReleaseVelocity({
        releaseTime: 240,
        recentWindowMs: 100,
        samples: [
          { x: 0, y: 0, time: 40 },
          { x: 20, y: 10, time: 140 },
          { x: 80, y: 40, time: 190 },
          { x: 120, y: 60, time: 240 },
        ],
      }),
    ).toEqual({ x: 1000, y: 500 });
  });
});
