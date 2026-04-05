import { describe, expect, test } from "bun:test";
import {
  buildLayout,
  computeAnchorFrame,
  createInitialItems,
  prependItemsAbove,
} from "./model.js";

describe("scroll-anchor layout", () => {
  test("builds grouped headers, item positions, and total height", () => {
    const layout = buildLayout(createInitialItems());

    expect(
      layout.headers.map((header) => ({
        day: header.day,
        y: header.y,
      })),
    ).toEqual([
      { day: "Today", y: 0 },
      { day: "Yesterday", y: 920 },
      { day: "2 Days Ago", y: 1084 },
    ]);

    expect(layout.byId.get("V1")?.y).toBe(32);
    expect(layout.byId.get("V8")?.y).toBe(788);
    expect(layout.byId.get("V9")?.y).toBe(952);
    expect(layout.byId.get("V10")?.y).toBe(1116);
    expect(layout.byId.get("V17")?.y).toBe(1872);
    expect(layout.totalHeight).toBe(1972);
  });

  test("picks a new anchor from the latest scroll position after a user scroll", () => {
    const layout = buildLayout(createInitialItems());

    const frame = computeAnchorFrame({
      layout,
      scrollTop: 952,
      storedScrollTop: 700,
      anchor: { id: "V7", prevY: 680 },
    });

    expect(frame.userScrolled).toBe(true);
    expect(frame.adjustedScrollTop).toBe(952);
    expect(frame.anchor).toEqual({ id: "V9", prevY: 952 });
  });

  test("keeps the anchor stable and refreshes prevY after prepending above it", () => {
    const initialItems = createInitialItems();
    const initialLayout = buildLayout(initialItems);
    const prependedLayout = buildLayout(prependItemsAbove(initialItems, 3));

    const frame = computeAnchorFrame({
      layout: prependedLayout,
      scrollTop: 700,
      storedScrollTop: 700,
      anchor: {
        id: "V7",
        prevY: initialLayout.byId.get("V7")!.y,
      },
    });

    expect(frame.userScrolled).toBe(false);
    expect(frame.adjustedScrollTop).toBe(1024);
    expect(frame.anchor).toEqual({ id: "V7", prevY: 1004 });
  });
});
