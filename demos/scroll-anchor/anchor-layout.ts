// Pure layout and anchor adjustment logic for scroll-anchor.
// The demo imports it, and the verifier checks it.

export const itemHeight = 100
export const headerHeight = 24
export const headerGapFirst = 0
export const headerGapRest = 32
export const headerGapBottom = 8
export const itemGap = 8

export type AnchorLayoutItem = {
  id: string
  day: string
}

export type Anchor = {
  id: string
  screenY: number // the item's y minus scrollTop when it was picked, measured against the read-back scrollTop
} | null

export type AnchorItemPosition = {
  id: string
  day: string
  y: number
}

export type AnchorHeaderPosition = {
  day: string
  y: number
}

export type AnchorLayoutResult = {
  totalHeight: number
  adjustedScrollTop: number
  newAnchor: {id: string; y: number} | null // picked when the user scrolled. The caller sets its screenY after reading back scrollTop
  itemPositions: AnchorItemPosition[]
  headerPositions: AnchorHeaderPosition[]
}

/** @fit
 * return >= y
 * return == y + gapTop
 */
function anchorHeaderY(
  y: number, // @fit 0..Infinity
  gapTop: number, // @fit 0..Infinity
) {
  return y + gapTop
}

/** @fit
 * return >= y
 * return == y + gapTop + headerHeight + headerGapBottom
 */
function anchorItemsStartY(
  y: number, // @fit 0..Infinity
  gapTop: number, // @fit 0..Infinity
) {
  return y + gapTop + headerHeight + headerGapBottom
}

/** @fit
 * return >= y
 * return == y + itemHeight
 */
function anchorNextItemY(
  y: number, // @fit 0..Infinity
) {
  return y + itemHeight
}

/** @fit
 * return == y - screenY
 */
function adjustScrollTopForAnchor(
  y: number, // @fit 0..<Infinity
  screenY: number, // @fit -Infinity<..<Infinity
) {
  return y - screenY
}

export function computeAnchorLayout(
  items: AnchorLayoutItem[],
  currentScrollTop: number,
  requestedScrollTop: number | null,
  anchorId: string | null,
  anchorScreenY: number,
  userScrolled: boolean,
): AnchorLayoutResult {
  let y = 0
  let adjustedScrollTop = requestedScrollTop ?? currentScrollTop
  let newAnchor: {id: string; y: number} | null = null
  const itemPositions: AnchorItemPosition[] = []
  const headerPositions: AnchorHeaderPosition[] = []
  let isFirstSession = true
  let idx = 0

  while (idx < items.length) {
    const sessionDay = items[idx]!.day
    const gapTop = isFirstSession ? headerGapFirst : headerGapRest
    const headerY = anchorHeaderY(y, gapTop)
    y = anchorItemsStartY(y, gapTop)
    headerPositions.push({day: sessionDay, y: headerY})

    let itemsInSession = 0
    while (idx < items.length && items[idx]!.day === sessionDay) {
      const item = items[idx]!
      if (itemsInSession > 0) y += itemGap
      itemsInSession += 1

      itemPositions.push({id: item.id, day: item.day, y})

      if (userScrolled === true && newAnchor == null && y > adjustedScrollTop) {
        newAnchor = {id: item.id, y}
      }

      // absolute from where the anchor was picked, so scrollTop rounding doesn't add up over frames
      if (userScrolled === false && anchorId != null && item.id === anchorId && adjustedScrollTop > 40) {
        adjustedScrollTop = adjustScrollTopForAnchor(y, anchorScreenY)
      }

      y = anchorNextItemY(y)
      idx++
    }
    isFirstSession = false
  }

  return {
    totalHeight: y,
    adjustedScrollTop,
    newAnchor,
    itemPositions,
    headerPositions,
  }
}
