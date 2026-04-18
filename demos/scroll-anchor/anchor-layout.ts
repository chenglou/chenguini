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

export type AnchorResult = {
  id: string
  prevY: number
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
  newAnchor: AnchorResult
  anchorPrevY: number
  itemPositions: AnchorItemPosition[]
  headerPositions: AnchorHeaderPosition[]
}

/** @fit
 * given y: 0..100000
 * given gapTop: 0..1000
 * result >= y
 * result == y + gapTop
 */
function anchorHeaderY(y: number, gapTop: number) {
  return y + gapTop
}

/** @fit
 * given y: 0..100000
 * given gapTop: 0..1000
 * result >= y
 * result == y + gapTop + headerHeight + headerGapBottom
 */
function anchorItemsStartY(y: number, gapTop: number) {
  return y + gapTop + headerHeight + headerGapBottom
}

/** @fit
 * given y: 0..100000
 * result >= y
 * result == y + itemHeight
 */
function anchorNextItemY(y: number) {
  return y + itemHeight
}

/** @fit
 * given scrollTop: 0..100000
 * given y: 0..100000
 * given prevY: 0..100000
 * result == scrollTop + (y - prevY)
 */
function adjustScrollTopForAnchor(scrollTop: number, y: number, prevY: number) {
  return scrollTop + (y - prevY)
}

export function computeAnchorLayout(
  items: AnchorLayoutItem[],
  currentScrollTop: number,
  requestedScrollTop: number | null,
  anchorId: string | null,
  anchorPrevY: number,
  userScrolled: boolean,
): AnchorLayoutResult {
  let y = 0
  let adjustedScrollTop = requestedScrollTop ?? currentScrollTop
  let newAnchor: AnchorResult = null
  let nextAnchorPrevY = anchorPrevY
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
        newAnchor = {id: item.id, prevY: y}
      }

      if (userScrolled === false && anchorId != null && item.id === anchorId && adjustedScrollTop > 40) {
        adjustedScrollTop = adjustScrollTopForAnchor(adjustedScrollTop, y, anchorPrevY)
        nextAnchorPrevY = y
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
    anchorPrevY: nextAnchorPrevY,
    itemPositions,
    headerPositions,
  }
}
