import {dataRaw} from './data'
import {
  commentTextLength,
  findHNCommentTextOffset,
  findHNCommentTextOffsetInEmptySpace,
  findHNCommentTextRects,
  layoutPreparedHNCommentDoc,
  prepareHNCommentDoc,
  resolveHNCommentTextOffset,
  renderHNCommentLayout,
  serializePreparedHNCommentDocSelection,
  type HNCommentLayout,
  type PreparedHNCommentDoc,
} from './hn-comment-layout'
import {layoutHNRowHitGeometry, layoutHNThreadVisualGeometry} from './hn-thread-layout'
import {hnCommentDocToPlainText, parseHNCommentHTML} from './hn-comment-parser'

const thread = dataRaw[0]!
const regexChars = "[\\^$.*+?()[]{}|]"

const commentUserGapNatural = 4
const commentBottomGapNatural = 12
const commentLeftGap = 24
const commentRightGap = 20
// const commentGapsNatural = commentUserGapNatural + commentBottomGapNatural

const textGray = '#5c5c5c'
const emphasis = 'hsl(37deg 25% 75%)'
const emphasisNone = 'hsl(37deg 33% 87%)'
const userHeightNatural = 24
const indentWidth = 24
const searchHeight = 24
const searchWidth = 160

const submissionHeightNatural = 100
const submissionHeightDelta = 40
const submissionLine1Height = 18

const userZIndex = 1 /* over its comment */, canvasZIndex = 2, commentsScrollerZIndex = 3 // proper depth management

const canvas = document.createElement('canvas')
canvas.className = 'canvas'
canvas.style.zIndex = String(canvasZIndex)
const canvasContext = canvas.getContext('2d')!

function makeThreadViewSkeleton() {
  const submissionArrow = document.createElement('div')
  submissionArrow.innerText = '▲'
  submissionArrow.style.color = textGray
  submissionArrow.style.fontSize = '9pt'
  const submissionTitle = document.createElement('div')
  submissionTitle.innerText = thread.title
  const submissionLink = document.createElement('a')
  submissionLink.innerText = `(${thread.link})`
  submissionLink.style.color = textGray
  const submissionLine1 = document.createElement('div')
  submissionLine1.className = 'submission-line-1'
  submissionLine1.append(submissionArrow, submissionTitle, submissionLink)

  const submissionLine2 = document.createElement('div')
  submissionLine2.className = 'submission-line-2'
  submissionLine2.style.color = textGray
  submissionLine2.style.left = `${commentLeftGap}px` // align vertically with comment
  submissionLine2.innerText =
    `${thread.points} ${thread.points === 1 ? 'point' : 'points'} by\
        ${thread.submitter} on ${thread.submissionDate}\
        | ${thread.comments.length} ${thread.comments.length === 1 ? 'comment' : 'comments'}`

  const search = document.createElement('input')
  search.className = 'search'
  search.placeholder = 'Search in thread...'
  search.value = ''

  const submissionLines = document.createElement('div')
  submissionLines.style.position = 'absolute'
  submissionLines.append(submissionLine1, submissionLine2, search)

  const dummyPlaceholder = document.createElement('div')
  const commentsScroller = document.createElement('div')
  commentsScroller.className = 'comments-scroller'
  commentsScroller.style.zIndex = String(commentsScrollerZIndex)
  commentsScroller.append(dummyPlaceholder)

  const commentsDisplay = document.createElement('div')
  commentsDisplay.className = 'comments-display'

  const container = document.createElement('div')
  container.className = 'thread-container'
  container.append(submissionLines, commentsDisplay, commentsScroller)

  return {
    submissionLine1, submissionLine2, search, submissionLines, dummyPlaceholder, commentsScroller, commentsDisplay, container
  }
}
const threadView = makeThreadViewSkeleton()
document.body.append(threadView.container, canvas)

type CaretRange = {startContainer: Node; startOffset: number; endContainer: Node; endOffset: number}
function makeCaretRangeFromPoint(): (x: number, y: number) => CaretRange | null {
  if (document.caretRangeFromPoint) return document.caretRangeFromPoint.bind(document) // oxlint-disable-line no-unnecessary-condition, strict-boolean-expressions -- runtime check for Firefox where caretRangeFromPoint doesn't exist
  return function caretRangeFromPoint(x: number, y: number) { // firefox
    const pos = document.caretPositionFromPoint(x, y) // apparently non-nullable?
    if (pos == null) return null
    return {startContainer: pos.offsetNode, startOffset: pos.offset, endContainer: pos.offsetNode, endOffset: pos.offset}
  }
}
const caretRangeFromPoint = makeCaretRangeFromPoint()
function clamp(min: number, v: number, max: number) {
  return v > max ? max : v < min ? min : v
}
function rowHeightNaturalF(commentHeightNatural: number) {
  return userHeightNatural + commentUserGapNatural + commentHeightNatural + commentBottomGapNatural
}
const rowHeightNaturalMin = rowHeightNaturalF(0)
function containerWidthF(windowWidth: number) {
  return clamp(375 /* min width of iPhone 12 mini */, windowWidth, 1200 /* HN max width */)
}
function commentLeftF(indentsWidth: number) {
  return indentsWidth + commentLeftGap
}
function commentWidthF(containerWidth: number, indentsWidth: number) { // TODO: indentsWidth encapsulate?
  return containerWidth - commentLeftF(indentsWidth) - commentRightGap
}

// === state

type RowData = {
  indent: number
  userName: string
  age: string
  preparedCommentDoc: PreparedHNCommentDoc
  commentLayout: HNCommentLayout | null
  commentText: string
  heightAnimation: 'grow' | 'shrink'
  height: number
  commentWidthMeasured: number
}

function rowNaturalHeight(row: RowData) {
  return rowHeightNaturalF(row.commentLayout?.height ?? 0)
}

// cache lifetime: same as data
const domCache = new Map<number, {user: HTMLDivElement; comment: HTMLDivElement; layoutWidth: number}>()

const data: RowData[] = []; {
  for (let i = 0; i < thread.comments.length; i++) {
    const row = thread.comments[i]!
    const commentDoc = parseHNCommentHTML(row.comment)
    data.push({
      indent: row.indent,
      userName: row.user,
      age: row.age,
      preparedCommentDoc: prepareHNCommentDoc(commentDoc),
      commentLayout: null,
      commentText: hnCommentDocToPlainText(commentDoc),
      heightAnimation: 'grow',
      height: rowHeightNaturalMin,
      commentWidthMeasured: -1,
    })
  }
}

const st = {
  inputs: {
    pointerState: 'up' as 'down' | 'up' | 'firstDown',
    pointerXY: {pageX: 0, pageY: 0}, // btw, on page load, there's no way to render a first cursor state =(
    clicked: false,
    copied: false, // browser copy event
  },
  pointerDownStartTarget: null as EventTarget | null,
  pointerDownTarget: 'whateverElse' as 'whateverElse' | Element | 'text',
  commentsScrollTopPrevious: 0,
  commentsScrollDeltaPrevious: 0,
  scrollerPeekUp: 0, // raise scroller when peeking ancestor needs more space to show it
  selection: {
    startNode: null as Node | null,
    startOffset: null as number | null,
    endNode: null as Node | null,
    endOffset: null as number | null,
    startTextOffset: null as number | null,
    endTextOffset: null as number | null,
    row: null as number | null,
    range: document.createRange(),
  },
  scheduledRaf: null as number | null,
}

function clearSelection() {
  st.selection.startNode = null
  st.selection.startOffset = null
  st.selection.endNode = null
  st.selection.endOffset = null
  st.selection.startTextOffset = null
  st.selection.endTextOffset = null
  st.selection.row = null
  st.selection.range = document.createRange()
}

window.addEventListener('resize', () => { scheduleRender() })
window.addEventListener('mouseup', () => { // can't use pointerup, which isn't triggered when pointer panned
  st.inputs.pointerState = 'up'
  st.pointerDownStartTarget = null
  scheduleRender()
})
window.addEventListener('touchend', () => {
  st.inputs.pointerState = 'up'
  st.pointerDownStartTarget = null
  scheduleRender()
})
window.addEventListener('touchcancel', () => {
  st.inputs.pointerState = 'up'
  st.pointerDownStartTarget = null
  scheduleRender()
})
window.addEventListener('click', () => {
  st.inputs.clicked = true
  scheduleRender()
})
window.addEventListener('copy', (e) => {
  e.preventDefault()
  st.inputs.copied = true
  if (
    st.selection.row != null &&
    st.selection.startTextOffset != null &&
    st.selection.endTextOffset != null
  ) {
    const serialized = serializePreparedHNCommentDocSelection(
      data[st.selection.row]!.preparedCommentDoc,
      st.selection.startTextOffset,
      st.selection.endTextOffset,
    )
    e.clipboardData?.setData('text/html', serialized.html)
    e.clipboardData?.setData('text/plain', serialized.plainText)
  } else {
    // browser security dictates handling paste logic in the event itself instead of e.g. in render
    const content = document.createElement('div')
    content.appendChild(st.selection.range.cloneContents())
    e.clipboardData?.setData('text/html', content.innerHTML)
    e.clipboardData?.setData('text/plain', content.innerText)
  }
  scheduleRender()
})
window.addEventListener('contextmenu', () => {
  st.inputs.pointerState = 'up'
  st.pointerDownStartTarget = null
  scheduleRender()
})
window.addEventListener('scroll', () => { scheduleRender() }, true)
window.addEventListener('pointermove', (e) => {
  // when scrolling (which updates `render`), a container's pointermove doesn't trigger; e.offsetX/Y (coordinates local
  // to container) would be stale. So we have to use global coords anyway. Might as well attach to window
  // We need to listen window-wide anyway, since custom selection needs to know when the cursor dragged into a comment from outside
  st.inputs.pointerXY.pageX = e.pageX; st.inputs.pointerXY.pageY = e.pageY // can exceed document bounds, e.g. dragging reports back out-of-bound values
  scheduleRender()
})
// See docs/Input.md.
window.addEventListener('pointerdown', (e) => {
  st.inputs.pointerState = 'firstDown'
  // also update position. Maybe pointer never moved (page refresh, right click, move, then left click to dismiss, etc.)
  st.inputs.pointerXY.pageX = e.pageX; st.inputs.pointerXY.pageY = e.pageY
  st.pointerDownStartTarget = e.target
  scheduleRender()
})
window.addEventListener('input', () => { scheduleRender() })

type Pointer =
  | {on: 'row'; row: number}
  | {on: 'gutter'; row: number; ancestor: number}
  | {on: null}

function scheduleRender() {
  if (st.scheduledRaf != null) return
  st.scheduledRaf = requestAnimationFrame(function renderAndMaybeScheduleAnotherRender() {
    st.scheduledRaf = null
    if (render()) scheduleRender()
  })
}

function render() {
  let scheduleNextRender = false // sometime changed to true in many places below, to request rendering the next frame
  let pointerDownTargetNext = st.pointerDownTarget // sometime changed in many places below
  // === Begin batched DOM reads 1

  let scrollTop: number
  { // scroll position calculation. Smooth out over multiple frames because:
    // - scrollTop is an int instead of float (sigh)
    // - scrollTop isn't the right value anyway because scrolling is async and scrollTop is a stale value
    // mix in the previous scrollTop for smoothing
    const scrollTopReal = threadView.commentsScroller.scrollTop
    if (Math.abs(st.commentsScrollDeltaPrevious) > 0.01) {
      scrollTop = st.commentsScrollTopPrevious * 0.55 + scrollTopReal * 0.45 // a bit more weight to the old value
      // what's neat is that the interpolation gives browsers without div
      // rubberbanding a small deceleration at the edge
      scheduleNextRender = true
    } else {
      scrollTop = scrollTopReal // consider this as a new wave of scrolling
      // hopefully this means no weird interpolation for platforms with discrete scrolling
      // one problem is that dragging scroll bar to scroll shows a tiny delay from interpolation. Whatever
    }
    st.commentsScrollDeltaPrevious = scrollTop - st.commentsScrollTopPrevious
    st.commentsScrollTopPrevious = scrollTop
  }
  // On Safari, div edge scroll rubberbanding shows the scroller background. Cap it to 0
  // BUT, crucially, later on we lower the entire scroller, to restore the rubber banding's feel.
  // Aka we bounce not the content, but the entire scroller
  const scrollTopCap = Math.max(0, scrollTop)

  const windowHeight = document.documentElement.clientHeight
  const windowWidth = document.documentElement.clientWidth
  const containerWidth = containerWidthF(windowWidth)
  const containerLeft = (windowWidth - containerWidth) / 2 // center on the page

  let rowsHeightNatural = 0
  for (let i = 0; i < data.length; i++) {
    const row = data[i]!
    const commentWidth = commentWidthF(containerWidth, row.indent * indentWidth)
    const rowHeightNaturalPrevious = rowNaturalHeight(row)
    if (commentWidth !== row.commentWidthMeasured) {
      row.commentWidthMeasured = commentWidth
      row.commentLayout = layoutPreparedHNCommentDoc(row.preparedCommentDoc, commentWidth)
      const rowHeightNaturalNext = rowNaturalHeight(row)
      if (Math.abs(row.height - rowHeightNaturalPrevious) < 0.001) row.height = rowHeightNaturalNext
    }
    rowsHeightNatural += rowNaturalHeight(row)
  }

  // submission, comments, vertical sizing logic
  let submissionLine1Top: number
  let submissionHeight: number
  let scrollerHeightNatural: number
  let submissionLinesGap: number
  { // TODO: maintain invariant: total height <= window height
    // names are implicitly all about submission unless indicated otherwise
    const line1TopMax = 24
    const line1TopMin = 12
    const linesGapMax = 8
    const linesGapMin = 4
    if (submissionHeightNatural + rowsHeightNatural < windowHeight) {
      const delta = Math.min(submissionHeightDelta, windowHeight - submissionHeightNatural - rowsHeightNatural)
      submissionHeight = submissionHeightNatural + delta

      submissionLine1Top = line1TopMax + delta * ((line1TopMax - line1TopMin) / submissionHeightDelta)
      submissionLinesGap = linesGapMax + delta * ((linesGapMax - linesGapMin) / submissionHeightDelta)

      scrollerHeightNatural = rowsHeightNatural
    } else {
      if (scrollTop < 0) {
        submissionLine1Top = line1TopMax - scrollTop * 0.7
        submissionLinesGap = linesGapMax - scrollTop * 0.3
      } else if (scrollTop < submissionHeightDelta) {
        submissionLine1Top = line1TopMax - scrollTop * ((line1TopMax - line1TopMin) / submissionHeightDelta)
        submissionLinesGap = linesGapMax - scrollTop * ((linesGapMax - linesGapMin) / submissionHeightDelta)
      } else {
        submissionLine1Top = line1TopMin
        submissionLinesGap = linesGapMin
      }

      submissionHeight = submissionHeightNatural - Math.min(submissionHeightDelta, scrollTop)
      scrollerHeightNatural = windowHeight - submissionHeight
      const scrollTopMax = rowsHeightNatural - scrollerHeightNatural
      if (scrollTop > scrollTopMax) {
        scrollerHeightNatural = scrollerHeightNatural - (scrollTop - scrollTopMax) / 2
      }
    }
  }

  // When rows animate, the cursor's target might change over time. E.g. a pressed row A shrinks
  // to 0 -> cursor now targets row B -> row B makes row A expand back; infinite cycle.
  // **Views should be decoupled from their hitboxes!** Here, the hitboxes ignore animating states
  let pointer: Pointer = {on: null}
  const pageXLocal = st.inputs.pointerXY.pageX/*c*/ - containerLeft
  const rowHitGeometry = layoutHNRowHitGeometry({
    rows: data.map(row => ({
      indent: row.indent,
      rowHeightNatural: rowNaturalHeight(row),
    })),
    submissionHeight,
    scrollTopCap,
    containerWidth,
  })
  if (0 <= pageXLocal && pageXLocal < containerWidth) {
    const indentPointed = Math.floor(pageXLocal / indentWidth) // the indent we're on
    for (let i = 0; i < rowHitGeometry.length; i++) {
      const rowHit = rowHitGeometry[i]!
      if (rowHit.rowRect.top <= st.inputs.pointerXY.pageY && st.inputs.pointerXY.pageY < rowHit.rowRect.top + rowHit.rowRect.height) {
        // arrived at the pointed row's y range
        if (indentPointed <= rowHit.indent) { // pointed a gutter (as opposed to a comment)
          let ancestor = i; while (ancestor > 0 && data[ancestor]!.indent > indentPointed) ancestor--
          pointer = {on: 'gutter', row: i, ancestor}
        } else {
          pointer = {on: 'row', row: i}
        }
        break // btw, this might never be reached if e.g. scroller's bigger than rows height sum or bottom edge rubberbanding
      }
    }
  }
  const pointerDownStartedOnScroller =
    st.inputs.pointerState !== 'up' &&
    st.pointerDownStartTarget === threadView.commentsScroller
  if (pointerDownStartedOnScroller) pointer = {on: null}

  // animation state changes
  for (let i = 0; i < data.length; i++) {
    const row = data[i]!
    if (st.inputs.pointerState !== 'up' && pointer.on === 'gutter' && i > pointer.ancestor && i < pointer.row) {
      // from ancestor to clicked item. Shrink them
      // TODO: what if we just store rowHeightFinal
      if (row.heightAnimation === 'grow') row.heightAnimation = 'shrink'
    } else {
      if (row.heightAnimation === 'shrink') row.heightAnimation = 'grow'
    }
  }

  let ancestorHeightFinal = 0
  let scrollerPeekUpFinal = 0
  { // determine ancestor height and peek up amount
    if (st.inputs.pointerState !== 'up' && pointer.on === 'gutter') { // peek view active
      const ancestor = pointer.ancestor
      let scrollerCommentTopGapFinal = 0
      for (let i = ancestor + 1; i < data.length; i++)
        if (data[i]!.heightAnimation === 'shrink') scrollerCommentTopGapFinal += rowNaturalHeight(data[i]!)
      let ancestorTopFinal = scrollerCommentTopGapFinal
      for (let i = 0; i < ancestor; i++) ancestorTopFinal += rowNaturalHeight(data[i]!)

      ancestorHeightFinal =
        rowNaturalHeight(data[ancestor]!) - Math.max(0, (scrollTop - submissionHeight) - ancestorTopFinal)
      // max(0, scrollTop - ...) = max(0, scrollTopCap - ...) when scrollTop < 0. So we can just use scrollTop here
      scrollerPeekUpFinal = clamp(0, scrollTop - ancestorTopFinal, submissionHeight)
    }
    const scrollerPeekUpDelta = (scrollerPeekUpFinal - st.scrollerPeekUp) / 5
    st.scrollerPeekUp += scrollerPeekUpDelta
    if (Math.abs(scrollerPeekUpDelta) > 0.001) scheduleNextRender = true
  }
  const scrollerHeight = scrollerHeightNatural + st.scrollerPeekUp
  let rowsScrollerTopGap = 0
  for (let i = 0; i < data.length; i++) { // update row height
    const row = data[i]!
    const rowHeightNatural = rowNaturalHeight(row)
    const rowHeightFinal =
      st.inputs.pointerState !== 'up' && pointer.on === 'gutter' && i === pointer.ancestor ? ancestorHeightFinal
        : row.heightAnimation === 'shrink' ? 0
          : rowHeightNatural

    const rowHeightFinalDelta = rowHeightFinal - row.height
    row.height += rowHeightFinalDelta / 5 // ease toward final height
    rowsScrollerTopGap += rowHeightNatural - row.height

    if (Math.abs(rowHeightFinalDelta) > 0.001) scheduleNextRender = true
  }

  const scrollerTop = submissionHeight - st.scrollerPeekUp
  const visualGeometry = layoutHNThreadVisualGeometry({
    rows: data.map(row => ({
      indent: row.indent,
      rowHeight: row.height,
      commentLayout: row.commentLayout!,
    })),
    containerWidth,
    indentWidth,
    commentLeftGap,
    commentRightGap,
    commentUserGapNatural,
    userHeightNatural,
    rowsScrollerTopGap,
    scrollerPeekUp: st.scrollerPeekUp,
    scrollTopCap,
    scrollerHeight,
  })
  const devicePixelRatio = window.devicePixelRatio

  // === End batched DOM reads 1. Begin batched DOM writes 1

  // no blurry canvas: coderwall.com/p/vmkk6a/how-to-make-the-canvas-not-look-like-crap-on-retina
  canvas.width = windowWidth * devicePixelRatio // different than canvas.style.width. Btw this clears the canvas as well
  canvas.height = windowHeight * devicePixelRatio
  canvasContext.scale(devicePixelRatio, devicePixelRatio)

  // generally, write (left width top height) in that order, like some DOM APIs
  threadView.container.style.left = `${containerLeft}px`
  threadView.container.style.width = `${containerWidth}px`
  threadView.container.style.height = `${windowHeight}px`

  threadView.submissionLines.style.width = `${containerWidth}px`
  threadView.submissionLines.style.height = `${scrollerTop}px` // submission top is 0
  const submissionFadeOpacity = 1 - submissionHeight / st.scrollerPeekUp // desmos.com/calculator/fernhrsi6i
  threadView.submissionLines.style.maskImage = threadView.submissionLines.style.webkitMaskImage =
    `linear-gradient(0deg, rgba(0, 0, 0, ${submissionFadeOpacity}) 0%, rgba(0, 0, 0, 1) 20px)`

  threadView.submissionLine1.style.top = `${submissionLine1Top}px`

  threadView.submissionLine2.style.top = `${submissionLine1Top + submissionLine1Height + submissionLinesGap}px`

  threadView.search.style.left = `${containerWidth - searchWidth - commentLeftGap}px` // same gap size on the right as submission lines gap on the left
  threadView.search.style.width = `${searchWidth}px`
  threadView.search.style.top = `${(submissionHeight - searchHeight) / 2}px`
  threadView.search.style.height = `${searchHeight}px`

  threadView.commentsScroller.style.width = `${containerWidth}px`
  threadView.commentsScroller.style.top = `${scrollerTop}px`
  threadView.commentsScroller.style.height = `${scrollerHeight}px`

  threadView.commentsDisplay.style.width = `${containerWidth}px`
  threadView.commentsDisplay.style.top = `${scrollerTop}px`
  threadView.commentsDisplay.style.height = `${scrollerHeight}px`

  // --- Pass 1: walk visible range, JIT-create nodes, preserve attached visible ones ---
  let nextChild: ChildNode | null = threadView.commentsDisplay.firstChild
  function placeVisibleNode(node: ChildNode) {
    if (node === nextChild) {
      nextChild = nextChild.nextSibling
      return
    }
    threadView.commentsDisplay.insertBefore(node, nextChild)
  }
  for (let i = 0; i < visualGeometry.rows.length; i++) {
    const rowGeometry = visualGeometry.rows[i]!
    if (rowGeometry.rowRect.top <= scrollerHeight && rowGeometry.rowBottom >= 0) { // visible range
      const row = data[rowGeometry.rowIndex]!
      let cached = domCache.get(rowGeometry.rowIndex)
      if (cached == null) { // JIT DOM node creation: first time this row is visible
        const indentsWidth = row.indent * indentWidth

        const userText = document.createElement('div')
        userText.style.position = 'absolute'
        userText.style.left = '8px'
        userText.textContent = `▲ ${row.userName} ${row.age}`
        const user = document.createElement('div')
        user.className = 'user'
        user.style.color = textGray
        user.style.left = `${indentsWidth}px`
        user.style.zIndex = String(userZIndex)
        user.append(userText)

        const comment = document.createElement('div')
        comment.className = 'comment'
        comment.style.left = `${commentLeftF(indentsWidth)}px`
        comment.style.paddingRight = '0'
        comment.appendChild(renderHNCommentLayout(row.commentLayout!))

        cached = {user, comment, layoutWidth: row.commentWidthMeasured}
        domCache.set(rowGeometry.rowIndex, cached)
      } else if (cached.layoutWidth !== row.commentWidthMeasured) {
        cached.comment.replaceChildren(renderHNCommentLayout(row.commentLayout!))
        cached.layoutWidth = row.commentWidthMeasured
      }

      if (
        st.selection.row === rowGeometry.rowIndex &&
        st.selection.startTextOffset != null &&
        st.selection.endTextOffset != null
      ) {
        const startBoundary = resolveHNCommentTextOffset(cached.comment, st.selection.startTextOffset)
        const endBoundary = resolveHNCommentTextOffset(cached.comment, st.selection.endTextOffset)
        if (startBoundary != null && endBoundary != null) {
          st.selection.startNode = startBoundary.node
          st.selection.startOffset = startBoundary.offset
          st.selection.endNode = endBoundary.node
          st.selection.endOffset = endBoundary.offset
        } else clearSelection()
      }

      placeVisibleNode(cached.user)
      placeVisibleNode(cached.comment)
    }
  }
  while (nextChild != null) {
    const child = nextChild
    nextChild = child.nextSibling
    child.remove()
  }

  // --- Pass 2: set position/size styles, draw gutters ---
  for (let i = 0; i < visualGeometry.rows.length; i++) {
    const rowGeometry = visualGeometry.rows[i]!
    const row = data[rowGeometry.rowIndex]!
    const cached = domCache.get(rowGeometry.rowIndex)
    if (cached != null && cached.user.parentNode != null) { // visible and in DOM
      const user = cached.user
      user.style.top = `${rowGeometry.userRect.top}px`
      user.style.height = `${rowGeometry.userRect.height}px`
      user.style.backgroundColor = st.inputs.pointerState !== 'up' && pointer.on === 'gutter' && rowGeometry.rowIndex === pointer.ancestor ? emphasis : emphasisNone
      user.style.opacity = String(rowGeometry.userRect.height / userHeightNatural) // bar fades toward 0 when squashed

      const userText = user.children[0] as HTMLElement
      // we don't wanna see user text clipped by its banner. Fade out text earlier
      // 0 at row.height = userHeightNatural, 1 at row.height = rowHeightNaturalMin // desmos.com/calculator/2ko93dpxok
      userText.style.opacity = String((row.height - userHeightNatural) / (rowHeightNaturalMin - userHeightNatural))

      const comment = cached.comment
      const commentFadeSize = // fade grows from 1x to 3x of bottom gap size (hide enough comment text to be perceptible)
        commentBottomGapNatural + Math.min(row.commentLayout!.height - rowGeometry.commentRect.height, commentBottomGapNatural * 2)
      comment.style.top = `${rowGeometry.commentRect.top}px`
      comment.style.width = `${rowGeometry.commentRect.width}px`
      comment.style.height = `${rowGeometry.commentRect.height}px`
      comment.style.maskImage = comment.style.webkitMaskImage =
        `linear-gradient(0deg, rgba(0, 0, 0, 0) 0%, rgba(0, 0, 0, 1) ${commentFadeSize}px)`
    }

    if (rowGeometry.gutter.top <= scrollerHeight && rowGeometry.gutter.bottom >= 0) { // visible
      canvasContext.strokeStyle = pointer.on === 'gutter' && rowGeometry.rowIndex === pointer.ancestor ? emphasis : emphasisNone
      // canvas line's drawn in the middle of a position. Add half stroke width to left align with DOM-rendered user banner
      const left = rowGeometry.gutter.left/*c*/ + containerLeft
      canvasContext.beginPath()
      canvasContext.moveTo(left, rowGeometry.gutter.top/*c*/ + scrollerTop)
      canvasContext.lineTo(left, rowGeometry.gutter.bottom/*c*/ + scrollerTop)
      canvasContext.stroke()
    }
  }

  threadView.dummyPlaceholder.style.height = `${visualGeometry.contentHeight}px`

  const temporarilyAllowRowSelection = pointer.on != null ? pointer : null
  if (temporarilyAllowRowSelection != null) {
    const cached = domCache.get(temporarilyAllowRowSelection.row)
    if (cached != null) {
      // enable selection for `caretRangeFromPoint` below. We don't keep it permanently on to prevent bad select-all,
      // and safari's weird selection bug when commentsScroller's actively getting click events on top of comments
      threadView.commentsScroller.style.pointerEvents = 'none'
      cached.comment.style.userSelect = cached.comment.style.webkitUserSelect = 'auto'
    }
  }

  // === End batched DOM writes 1. Begin batched DOM read 2

  let rangePointed:
    | {startContainer: Node; startOffset: number; endContainer: Node; endOffset: number}
    | undefined // caretRangeFromPoint is expensive... make an exception here and don't call it unless necessary
  let rangePointedTextOffset: number | null = null
  // custom selection range (highlight later below)
  if (st.inputs.pointerState !== 'up' && pointer.on === 'row') {
    const row = data[pointer.row]!
    const rowGeometry = visualGeometry.rows[pointer.row]!
    const cached = domCache.get(pointer.row)
    const localX = st.inputs.pointerXY.pageX - containerLeft - rowGeometry.commentRect.left
    const localY = st.inputs.pointerXY.pageY - scrollerTop - rowGeometry.commentRect.top
    if (0 <= localY && localY < rowGeometry.commentRect.height) {
      const textOffset = findHNCommentTextOffsetInEmptySpace(row.commentLayout!, localX, localY)
      if (textOffset != null) {
        rangePointedTextOffset = textOffset
        const boundary = cached == null ? null : resolveHNCommentTextOffset(cached.comment, textOffset)
        if (boundary != null) {
          rangePointed = {
            startContainer: boundary.node,
            startOffset: boundary.offset,
            endContainer: boundary.node,
            endOffset: boundary.offset,
          }
        }
      }
      if (rangePointed == null) {
        const rangePointedBrowser = caretRangeFromPoint(st.inputs.pointerXY.pageX, st.inputs.pointerXY.pageY) // still nullable from e.g. out-of-bound values
        if (rangePointedBrowser != null) {
          rangePointedTextOffset =
            cached == null ? null : findHNCommentTextOffset(cached.comment, rangePointedBrowser.startContainer, rangePointedBrowser.startOffset)
          rangePointed = {
            startContainer: rangePointedBrowser.startContainer,
            startOffset: rangePointedBrowser.startOffset,
            endContainer: rangePointedBrowser.endContainer,
            endOffset: rangePointedBrowser.endOffset,
          }
        }
      }
    } else if (st.selection.row === pointer.row) {
      rangePointedTextOffset = localY < 0 ? 0 : commentTextLength(row.commentLayout!)
      const boundary = cached == null ? null : resolveHNCommentTextOffset(cached.comment, rangePointedTextOffset)
      if (boundary != null) {
        rangePointed = {
          startContainer: boundary.node,
          startOffset: boundary.offset,
          endContainer: boundary.node,
          endOffset: boundary.offset,
        }
      }
    }
    if (rangePointed != null) {
      if (st.inputs.pointerState === 'firstDown' || st.pointerDownTarget !== 'text') {
        // UX detail: click on non-comment (e.g. gutter): selection not lost. Click on gutter, drag to comment: new selection =)
        // though this also cancels native click-drag on link
        pointerDownTargetNext = 'text'
        st.selection.startNode = rangePointed.startContainer
        st.selection.startOffset = rangePointed.startOffset
        st.selection.startTextOffset = rangePointedTextOffset
        st.selection.row = pointer.row
      }
      if (pointer.row === st.selection.row) { // cap selection to the same single row we started selecting. Better UX, for now
        st.selection.endNode = rangePointed.endContainer
        st.selection.endOffset = rangePointed.endOffset
        st.selection.endTextOffset = rangePointedTextOffset
      } else if (st.selection.row != null && pointer.row < st.selection.row) {
        const selCached = domCache.get(st.selection.row)
        if (selCached != null) {
          let firstText: Node = selCached.comment; while (firstText.firstChild) firstText = firstText.firstChild
          st.selection.endNode = firstText
          st.selection.endOffset = 0
          st.selection.endTextOffset = 0
        }
      } else if (st.selection.row != null) {
        const selCached = domCache.get(st.selection.row)
        if (selCached != null) {
          let lastText: Node = selCached.comment; while (lastText.lastChild) lastText = lastText.lastChild
          st.selection.endNode = lastText
          st.selection.endOffset = (lastText as Text).length
          st.selection.endTextOffset = commentTextLength(data[st.selection.row]!.commentLayout!)
        }
      }
    }
  }

  let cursor = 'auto'
  cursor: { // determine cursor icon; add link clicking
    if (pointer.on === 'row') {
      const elementPointed = document.elementFromPoint(st.inputs.pointerXY.pageX, st.inputs.pointerXY.pageY)
      if (elementPointed != null /* still nullable from e.g. out-of-bound values */ && elementPointed.tagName === 'A') {
        cursor = 'pointer'
        if (st.inputs.clicked && st.pointerDownTarget === elementPointed) { // pointer down-ed & up-ed on the same target
          window.open((elementPointed as HTMLAnchorElement).href, '_blank') // TODO: support other click methods
        } else if (st.inputs.pointerState === 'firstDown') pointerDownTargetNext = elementPointed
        break cursor
      }
      if (rangePointed != null) cursor = 'text'
    } else if (pointer.on === 'gutter') {
      // show a resizable cursor on gutter when:
      // - pointed row's ancestor (which might be ourselves) is occluded at the top
      // - pointed row's ancestor isn't the row's immediate parent
      if (visualGeometry.rows[pointer.ancestor]!.rowRect.top < 0 || pointer.ancestor < pointer.row - 1) cursor = 'row-resize'
    }
  }

  let searchMatches: ReturnType<string['matchAll']>[] | undefined // time to highlight search results
  if (threadView.search.value !== '') {
    canvasContext.fillStyle = 'rgba(0, 0, 0, 0.2)' // dim the whole scroller
    canvasContext.fillRect(containerLeft, scrollerTop, containerWidth, scrollerHeight)
    const fuzzyQuery = [...threadView.search.value] // oxlint-disable-line no-misused-spread -- intentional char split for fuzzy search. Example query: he.
      .map(char => regexChars.includes(char) ? '\\' + char : char) // h e \.
      .join('\\S*?') // h\S*?e\S*?\.\S*?
    const fuzzyQueryRegex = new RegExp(fuzzyQuery, 'gi') // case insensitive search too. Why not!
    searchMatches = data.map(d => d.commentText.matchAll(fuzzyQueryRegex))
  }
  { // highlight search results and selection
    if (
      visualGeometry.firstVisibleRowIndex != null &&
      visualGeometry.lastVisibleRowIndex != null
    ) {
      for (let i = visualGeometry.firstVisibleRowIndex; i <= visualGeometry.lastVisibleRowIndex; i++) {
        const row = data[i]!
        const rowGeometry = visualGeometry.rows[i]!
        const commentTopBound = userHeightNatural/*c*/ + scrollerTop // don't surpass the top sticky bar
        const commentBottomBound = rowGeometry.rowBottom/*c*/ + scrollerTop // same as row bottom
        if (searchMatches != null) {
          for (const match of searchMatches[i]!) {
            const start = match.index
            const length = match[0].length
            for (const searchRect of findHNCommentTextRects(row.commentLayout!, start, length)) {
              const top = clamp(commentTopBound, rowGeometry.commentRect.top + searchRect.top/*c*/ + scrollerTop, commentBottomBound)
              const bottom = clamp(commentTopBound, rowGeometry.commentRect.top + searchRect.top + searchRect.height/*c*/ + scrollerTop, commentBottomBound)
              canvasContext.clearRect(
                rowGeometry.commentRect.left + searchRect.left/*c*/ + containerLeft,
                top,
                searchRect.width,
                bottom - top,
              )
            }
          }
        }

        // highlight selection. TODO: manual loop fusion is not very readable
        if (
          i === st.selection.row &&
          st.selection.startNode != null &&
          st.selection.startOffset != null &&
          st.selection.endNode != null &&
          st.selection.endOffset != null
        ) {
          st.selection.range.setStart(st.selection.startNode, st.selection.startOffset)
          if (st.selection.range.comparePoint(st.selection.endNode, st.selection.endOffset) === -1) { // range is backward! Flip it
            st.selection.range.setStart(st.selection.endNode, st.selection.endOffset)
            st.selection.range.setEnd(st.selection.startNode, st.selection.startOffset)
          } else {
            st.selection.range.setEnd(st.selection.endNode, st.selection.endOffset)
          }

          const rects = st.selection.range.getClientRects()
          if (rects.length > 0) {
            const rectFirst = rects[0]!; const rectLast = rects[rects.length - 1]!

            const topFirst = clamp(commentTopBound, rectFirst.top, commentBottomBound)
            const bottomFirst = clamp(commentTopBound, rectFirst.bottom, commentBottomBound)
            const topLast = clamp(commentTopBound, rectLast.top, commentBottomBound)
            const bottomLast = clamp(commentTopBound, rectLast.bottom, commentBottomBound)

            canvasContext.fillStyle = 'rgba(0, 0, 100, 0.2)'

            let j = 0; while (j < rects.length - 1 && rects[j + 1]!.top === rectFirst.top) j++ // index of last rect of first line
            if (j < rects.length - 1) { // more than 1 selected line
              const left = rowGeometry.commentRect.left/*c*/ + containerLeft
              const commentWidth = row.commentLayout!.width
              canvasContext.fillRect(rectFirst.left, topFirst, left + commentWidth - rectFirst.left, bottomFirst - topFirst) // 1st line
              canvasContext.fillRect(left, bottomFirst, commentWidth, topLast - bottomFirst) // middle region
              canvasContext.fillRect(left, topLast, rectLast.right - left, bottomLast - topLast) // last line
            } else {
              canvasContext.fillRect(rectFirst.left, topFirst, rects[j]!.right - rectFirst.left, bottomFirst - topFirst) // 1st (only) line
            }
          }
        }
      }
    }
  }

  // === End batched DOM read 2. Begin Batched DOM write 2

  threadView.commentsScroller.style.cursor = cursor

  if (temporarilyAllowRowSelection != null) { // ok, now recover the old state
    const cached = domCache.get(temporarilyAllowRowSelection.row)
    if (cached != null) {
      threadView.commentsScroller.style.pointerEvents = 'auto'
      cached.comment.style.userSelect = cached.comment.style.webkitUserSelect = 'none'
    }
  }

  // === prepare for next frame
  st.inputs.clicked = false
  st.inputs.copied = false
  if (st.inputs.pointerState === 'firstDown') st.inputs.pointerState = 'down'
  else if (st.inputs.pointerState === 'up') pointerDownTargetNext = 'whateverElse'
  st.pointerDownTarget = pointerDownTargetNext
  // if (scrollTop === 0) commentsScroller.scrollTop = 1 // TODO: rubber banding even when no overflow lol
  return scheduleNextRender
}

scheduleRender()
