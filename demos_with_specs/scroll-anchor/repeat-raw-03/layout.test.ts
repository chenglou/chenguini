import { describe, expect, test } from "bun:test";
import {
  TARGET_SCROLL_TOP,
  computeLayout,
  computeScrollStep,
  createInitialState,
  prependItems,
} from "./model.js";

describe("computeLayout", () => {
  test("places grouped headers and items at the spec positions", () => {
    const state = createInitialState();
    const layout = computeLayout(state.items);

    expect(
      layout.headers.map((header) => ({ day: header.day, y: header.y })),
    ).toEqual([
      { day: "Today", y: 0 },
      { day: "Yesterday", y: 920 },
      { day: "2 Days Ago", y: 1084 },
    ]);

    expect(layout.itemPositions.get("V1")?.y).toBe(32);
    expect(layout.itemPositions.get("V8")?.y).toBe(788);
    expect(layout.itemPositions.get("V9")?.y).toBe(952);
    expect(layout.itemPositions.get("V17")?.y).toBe(1872);
    expect(layout.totalHeight).toBe(1972);
  });
});

describe("computeScrollStep", () => {
  test("picks the first item below the new scroll position", () => {
    const state = createInitialState();
    const layout = computeLayout(state.items);

    const step = computeScrollStep({
      currentScrollTop: TARGET_SCROLL_TOP,
      storedScrollTop: 0,
      explicitScroll: false,
      anchor: null,
      itemPositions: layout.itemPositions,
    });

    expect(step.userScrolled).toBe(true);
    expect(step.adjustedScrollTop).toBe(TARGET_SCROLL_TOP);
    expect(step.anchor).toEqual({ id: "V8", prevY: 788 });
  });

  test("keeps the old anchor and adjusts by its new y after a prepend", () => {
    let state = createInitialState();
    const beforeLayout = computeLayout(state.items);
    const pickedAnchor = computeScrollStep({
      currentScrollTop: TARGET_SCROLL_TOP,
      storedScrollTop: 0,
      explicitScroll: false,
      anchor: null,
      itemPositions: beforeLayout.itemPositions,
    }).anchor;

    state = prependItems(state, 3);
    const afterLayout = computeLayout(state.items);
    const step = computeScrollStep({
      currentScrollTop: TARGET_SCROLL_TOP,
      storedScrollTop: TARGET_SCROLL_TOP,
      explicitScroll: false,
      anchor: pickedAnchor,
      itemPositions: afterLayout.itemPositions,
    });

    expect(step.userScrolled).toBe(false);
    expect(step.adjustedScrollTop).toBe(1024);
    expect(step.anchor).toEqual({ id: "V8", prevY: 1112 });
  });

  test("updates prevY immediately so two quick prepends do not double count", () => {
    let state = createInitialState();
    let layout = computeLayout(state.items);
    let step = computeScrollStep({
      currentScrollTop: TARGET_SCROLL_TOP,
      storedScrollTop: 0,
      explicitScroll: false,
      anchor: null,
      itemPositions: layout.itemPositions,
    });

    state = prependItems(state, 1);
    layout = computeLayout(state.items);
    step = computeScrollStep({
      currentScrollTop: TARGET_SCROLL_TOP,
      storedScrollTop: TARGET_SCROLL_TOP,
      explicitScroll: false,
      anchor: step.anchor,
      itemPositions: layout.itemPositions,
    });

    expect(step.adjustedScrollTop).toBe(808);
    expect(step.anchor).toEqual({ id: "V8", prevY: 896 });

    state = prependItems(state, 2);
    layout = computeLayout(state.items);
    const secondStep = computeScrollStep({
      currentScrollTop: step.adjustedScrollTop,
      storedScrollTop: step.adjustedScrollTop,
      explicitScroll: false,
      anchor: step.anchor,
      itemPositions: layout.itemPositions,
    });

    expect(secondStep.adjustedScrollTop).toBe(1024);
    expect(secondStep.anchor).toEqual({ id: "V8", prevY: 1112 });
  });
});
