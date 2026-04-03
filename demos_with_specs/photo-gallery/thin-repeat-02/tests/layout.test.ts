import {describe, expect, test} from 'bun:test';

import {
  GRID_GAP,
  GRID_SIDE_PADDING,
  MAX_COLUMNS,
  MIN_TARGET_CARD_WIDTH,
  RIGHT_STRIP_WIDTH,
  LEFT_STRIP_WIDTH,
  computeBoxMaxSizeX,
  computeGridMediaHeight,
  computeResponsiveColumnCount,
  routeLineClick,
} from '../layout';

describe('grid layout math', () => {
  test('caps columns at seven and honors side padding plus gaps', () => {
    const viewportWidth = 2_040;
    const columnCount = computeResponsiveColumnCount(viewportWidth);
    const boxMaxSizeX = computeBoxMaxSizeX(viewportWidth, columnCount);

    expect(columnCount).toBe(MAX_COLUMNS);
    expect(boxMaxSizeX).toBe(
      (viewportWidth - GRID_SIDE_PADDING * 2 - GRID_GAP * (columnCount - 1)) /
        columnCount,
    );
  });

  test('drops columns when the target card width would get too small', () => {
    const wideViewport = 1_440;
    const narrowViewport = 780;

    expect(computeResponsiveColumnCount(wideViewport)).toBeGreaterThan(
      computeResponsiveColumnCount(narrowViewport),
    );
    expect(computeBoxMaxSizeX(narrowViewport)).toBeGreaterThanOrEqual(
      MIN_TARGET_CARD_WIDTH,
    );
  });

  test('landscape, square, and portrait cards use the exact box size multipliers', () => {
    const boxMaxSizeX = 300;

    expect(computeGridMediaHeight({w: 1_600, h: 900}, boxMaxSizeX)).toBe(300);
    expect(computeGridMediaHeight({w: 1_024, h: 1_024}, boxMaxSizeX)).toBe(255);
    expect(computeGridMediaHeight({w: 900, h: 1_600}, boxMaxSizeX)).toBe(315);
  });
});

describe('line click routing', () => {
  test('uses the left and right 100px strips for navigation', () => {
    const viewportWidth = 1_280;

    expect(routeLineClick(LEFT_STRIP_WIDTH - 1, viewportWidth)).toBe('previous');
    expect(routeLineClick(viewportWidth - RIGHT_STRIP_WIDTH + 1, viewportWidth)).toBe(
      'next',
    );
  });

  test('uses the middle band for dismiss', () => {
    expect(routeLineClick(640, 1_280)).toBe('dismiss');
  });
});
