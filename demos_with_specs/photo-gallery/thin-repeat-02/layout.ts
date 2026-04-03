import type {PhotoData} from './data';

export const GRID_SIDE_PADDING = 32;
export const GRID_GAP = 24;
export const GRID_TOP_PADDING = 40;
export const GRID_BOTTOM_PADDING = 128;
export const MAX_COLUMNS = 7;
export const MIN_TARGET_CARD_WIDTH = 220;
export const GRID_CAPTION_VISIBLE_HEIGHT = 44;
export const LINE_CAPTION_VISIBLE_HEIGHT = 64;
export const CAPTION_BOTTOM_PADDING = 8;
export const LEFT_STRIP_WIDTH = 100;
export const RIGHT_STRIP_WIDTH = 100;
export const LINE_NEIGHBOR_SCALE = 0.7;
export const LINE_GAP = 52;
export const LINE_BOTTOM_GAP = 28;
export const GRID_OVERSCAN = 320;

type Orientation = 'landscape' | 'square' | 'portrait';
export type LineClickAction = 'previous' | 'next' | 'dismiss';

export type GridItemLayout = {
  id: string;
  index: number;
  rowIndex: number;
  left: number;
  top: number;
  width: number;
  height: number;
  mediaHeight: number;
  bottom: number;
};

export type GridLayout = {
  columnCount: number;
  boxMaxSizeX: number;
  totalHeight: number;
  items: GridItemLayout[];
  rowTops: number[];
  rowHeights: number[];
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function computeResponsiveColumnCount(viewportWidth: number) {
  const availableWidth = Math.max(0, viewportWidth - GRID_SIDE_PADDING * 2);
  const maxFitCount = Math.floor(
    (availableWidth + GRID_GAP) / (MIN_TARGET_CARD_WIDTH + GRID_GAP),
  );
  return clamp(maxFitCount, 1, MAX_COLUMNS);
}

export function computeBoxMaxSizeX(
  viewportWidth: number,
  columnCount = computeResponsiveColumnCount(viewportWidth),
) {
  const availableWidth = Math.max(0, viewportWidth - GRID_SIDE_PADDING * 2);
  return (availableWidth - GRID_GAP * (columnCount - 1)) / columnCount;
}

function classifyOrientation({w, h}: Pick<PhotoData, 'w' | 'h'>): Orientation {
  const ratio = w / h;
  if (ratio > 1.02) {
    return 'landscape';
  }
  if (ratio < 0.98) {
    return 'portrait';
  }
  return 'square';
}

export function computeGridMediaHeight(
  photo: Pick<PhotoData, 'w' | 'h'>,
  boxMaxSizeX: number,
) {
  switch (classifyOrientation(photo)) {
    case 'landscape':
      return boxMaxSizeX;
    case 'square':
      return boxMaxSizeX * 0.85;
    case 'portrait':
      return boxMaxSizeX * 1.05;
  }
}

export function computeGridLayout(
  photos: readonly PhotoData[],
  viewportWidth: number,
): GridLayout {
  const columnCount = computeResponsiveColumnCount(viewportWidth);
  const boxMaxSizeX = computeBoxMaxSizeX(viewportWidth, columnCount);
  const items: GridItemLayout[] = [];
  const rowTops: number[] = [];
  const rowHeights: number[] = [];

  let currentTop = GRID_TOP_PADDING;
  for (let rowIndex = 0; rowIndex * columnCount < photos.length; rowIndex += 1) {
    const rowStart = rowIndex * columnCount;
    const rowPhotos = photos.slice(rowStart, rowStart + columnCount);
    const rowHeightsForItems = rowPhotos.map((photo) => {
      return (
        computeGridMediaHeight(photo, boxMaxSizeX) +
        GRID_CAPTION_VISIBLE_HEIGHT +
        CAPTION_BOTTOM_PADDING
      );
    });
    const rowHeight = Math.max(...rowHeightsForItems);
    rowTops.push(currentTop);
    rowHeights.push(rowHeight);

    for (let columnIndex = 0; columnIndex < rowPhotos.length; columnIndex += 1) {
      const photo = rowPhotos[columnIndex]!;
      const mediaHeight = computeGridMediaHeight(photo, boxMaxSizeX);
      const cardHeight = mediaHeight + GRID_CAPTION_VISIBLE_HEIGHT + CAPTION_BOTTOM_PADDING;
      items.push({
        id: photo.id,
        index: rowStart + columnIndex,
        rowIndex,
        left: GRID_SIDE_PADDING + columnIndex * (boxMaxSizeX + GRID_GAP),
        top: currentTop,
        width: boxMaxSizeX,
        height: cardHeight,
        mediaHeight,
        bottom: currentTop + cardHeight,
      });
    }

    currentTop += rowHeight + GRID_GAP;
  }

  const totalHeight =
    items.length === 0 ? GRID_TOP_PADDING : currentTop - GRID_GAP + GRID_BOTTOM_PADDING;

  return {columnCount, boxMaxSizeX, totalHeight, items, rowTops, rowHeights};
}

export function routeLineClick(pointerX: number, viewportWidth: number): LineClickAction {
  if (pointerX < LEFT_STRIP_WIDTH) {
    return 'previous';
  }
  if (pointerX > viewportWidth - RIGHT_STRIP_WIDTH) {
    return 'next';
  }
  return 'dismiss';
}

export function clampIndex(index: number, length: number) {
  return clamp(index, 0, Math.max(0, length - 1));
}

export function getFocusedHash(id: string) {
  return `#photo=${encodeURIComponent(id)}`;
}

export function parseFocusedIdFromHash(hash: string) {
  if (hash.startsWith('#photo=')) {
    return decodeURIComponent(hash.slice('#photo='.length));
  }
  if (hash.startsWith('#') && hash.length > 1) {
    return decodeURIComponent(hash.slice(1));
  }
  return null;
}
