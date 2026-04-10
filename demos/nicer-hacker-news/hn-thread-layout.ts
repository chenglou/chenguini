import {type HNCommentLayout} from './hn-comment-layout'

export type Rect = {
  left: number
  top: number
  width: number
  height: number
}

export type RowHitGeometry = {
  rowIndex: number
  indent: number
  rowRect: Rect
}

export type GutterSegment = {
  left: number
  top: number
  bottom: number
}

export type RowVisualGeometry = {
  rowIndex: number
  indent: number
  rowRect: Rect
  userRect: Rect
  commentRect: Rect
  gutter: GutterSegment
  rowBottom: number
}

export type ThreadVisualGeometry = {
  rows: RowVisualGeometry[]
  contentHeight: number
  firstVisibleRowIndex: number | null
  lastVisibleRowIndex: number | null
  firstVisibleRowTop: number | null
}

type RowHitInput = {
  indent: number
  rowHeightNatural: number
}

type RowVisualInput = {
  indent: number
  rowHeight: number
  commentLayout: HNCommentLayout
}

export function layoutHNRowHitGeometry(params: {
  rows: RowHitInput[]
  submissionHeight: number
  scrollTopCap: number
  containerWidth: number
}) {
  const rows: RowHitGeometry[] = []
  let rowTop = params.submissionHeight - params.scrollTopCap

  for (let rowIndex = 0; rowIndex < params.rows.length; rowIndex++) {
    const row = params.rows[rowIndex]!
    rows.push({
      rowIndex,
      indent: row.indent,
      rowRect: {
        left: 0,
        top: rowTop,
        width: params.containerWidth,
        height: row.rowHeightNatural,
      },
    })
    rowTop += row.rowHeightNatural
  }

  return rows
}

export function layoutHNThreadVisualGeometry(params: {
  rows: RowVisualInput[]
  containerWidth: number
  indentWidth: number
  commentLeftGap: number
  commentRightGap: number
  commentUserGapNatural: number
  userHeightNatural: number
  rowsScrollerTopGap: number
  scrollerPeekUp: number
  scrollTopCap: number
  scrollerHeight: number
}) {
  const rows: RowVisualGeometry[] = []
  let rowTop = params.rowsScrollerTopGap + params.scrollerPeekUp - params.scrollTopCap
  let firstVisibleRowIndex: number | null = null
  let lastVisibleRowIndex: number | null = null
  let firstVisibleRowTop: number | null = null

  for (let rowIndex = 0; rowIndex < params.rows.length; rowIndex++) {
    const row = params.rows[rowIndex]!
    const rowBottom = rowTop + row.rowHeight
    const userHeight = Math.min(params.userHeightNatural, row.rowHeight)
    const userTop = clamp(rowTop, 0, rowBottom - userHeight)
    const indentsWidth = row.indent * params.indentWidth
    const commentRect = {
      left: indentsWidth + params.commentLeftGap,
      top: rowTop + params.userHeightNatural + params.commentUserGapNatural,
      width: row.commentLayout.width + params.commentRightGap,
      height: Math.max(0, row.rowHeight - userHeight - params.commentUserGapNatural),
    }

    let gutterTop =
      rowBottom - (userTop + userHeight) <= 4 ? rowBottom
        : 0 <= userTop - rowTop && userTop - rowTop <= 4 ? rowTop + userHeight + 4
          : userTop + userHeight
    gutterTop = Math.max(gutterTop, 0)

    let gutterBottom = rowBottom
    for (let childIndex = rowIndex + 1; childIndex < params.rows.length && params.rows[childIndex]!.indent > row.indent; childIndex++) {
      gutterBottom += params.rows[childIndex]!.rowHeight
    }
    gutterBottom = Math.max(gutterTop, gutterBottom - 4)

    if (rowTop <= params.scrollerHeight && rowBottom >= 0) {
      if (firstVisibleRowIndex == null) {
        firstVisibleRowIndex = rowIndex
        firstVisibleRowTop = rowTop
      }
      lastVisibleRowIndex = rowIndex
    }

    rows.push({
      rowIndex,
      indent: row.indent,
      rowRect: {
        left: 0,
        top: rowTop,
        width: params.containerWidth,
        height: row.rowHeight,
      },
      userRect: {
        left: indentsWidth,
        top: userTop,
        width: params.containerWidth,
        height: userHeight,
      },
      commentRect,
      gutter: {
        left: indentsWidth + 0.5,
        top: gutterTop,
        bottom: gutterBottom,
      },
      rowBottom,
    })

    rowTop = rowBottom
  }

  return {
    rows,
    contentHeight: rowTop + params.scrollTopCap,
    firstVisibleRowIndex,
    lastVisibleRowIndex,
    firstVisibleRowTop,
  } satisfies ThreadVisualGeometry
}

function clamp(min: number, v: number, max: number) {
  return v > max ? max : v < min ? min : v
}
