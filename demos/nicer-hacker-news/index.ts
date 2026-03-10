import {dataRaw} from './data'

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

const commentHeightNaturalEstimate = 14 // minimum height: one line of 12px Verdana (~1.2 line-height). Safe lower bound so visibility never misses rows

type RowData = {
  indent: number
  userName: string
  age: string
  commentHTML: string
  commentText: string
  heightAnimation: 'grow' | 'shrink'
  height: number
  commentHeightNatural: number
}

// cache lifetime: same as data
const domCache = new Map<number, {user: HTMLDivElement; comment: HTMLDivElement}>()

const data: RowData[] = []; {
  const tempDiv = document.createElement('div')
  for (let i = 0; i < thread.comments.length; i++) {
    const row = thread.comments[i]!
    tempDiv.innerHTML = row.comment
    data.push({
      indent: row.indent,
      userName: row.user,
      age: row.age,
      commentHTML: row.comment,
      commentText: tempDiv.textContent ?? '', // oxlint-disable-line no-unnecessary-condition -- textContent is typed as string|null in DOM spec
      heightAnimation: 'grow',
      height: rowHeightNaturalF(commentHeightNaturalEstimate),
      commentHeightNatural: commentHeightNaturalEstimate,
    })
  }
}

const inputs = { // input state
  pointerState: 'up' as 'down' | 'up' | 'firstDown',
  pointerXY: {pageX: 0, pageY: 0}, // btw, on page load, there's no way to render a first cursor state =(
  clicked: false,
  copied: false, // browser copy event
}
let pointerDownTarget: 'whateverElse' | Element | 'text' = 'whateverElse'

const reusedRange = document.createRange() // reuse a single range. Creating many is expensive. See callsites. Careful with leak

window.addEventListener('resize', () => { scheduleRender() })
window.addEventListener('mouseup', () => { // can't use pointerup, which isn't triggered when pointer panned
  inputs.pointerState = 'up'
  scheduleRender()
})
window.addEventListener('touchend', () => {
  inputs.pointerState = 'up'
  scheduleRender()
})
window.addEventListener('touchcancel', () => {
  inputs.pointerState = 'up'
  scheduleRender()
})
window.addEventListener('click', () => {
  inputs.clicked = true
  scheduleRender()
})
window.addEventListener('copy', (e) => {
  e.preventDefault()
  inputs.copied = true
  // browser security dictates handling paste logic in the event itself instead of e.g. in render
  const content = document.createElement('div')
  content.appendChild(selection.range.cloneContents())
  e.clipboardData?.setData('text/html', content.innerHTML)
  e.clipboardData?.setData('text/plain', content.innerText)
  scheduleRender()
})
window.addEventListener('contextmenu', () => {
  inputs.pointerState = 'up'
  scheduleRender()
})
window.addEventListener('scroll', () => { scheduleRender() }, true)
window.addEventListener('pointermove', (e) => {
  // when scrolling (which updates `render`), a container's pointermove doesn't trigger; e.offsetX/Y (coordinates local
  // to container) would be stale. So we have to use global coords anyway. Might as well attach to window
  // We need to listen window-wide anyway, since custom selection needs to know when the cursor dragged into a comment from outside
  inputs.pointerXY.pageX = e.pageX; inputs.pointerXY.pageY = e.pageY // can exceed document bounds, e.g. dragging reports back out-of-bound values
  scheduleRender()
})
// safari pointerdown isn't fired on the first left click after dismissing context menus... back to mousedown
window.addEventListener('mousedown', (e) => {
  inputs.pointerState = 'firstDown'
  // also update position. Maybe pointer never moved (page refresh, right click, move, then left click to dismiss, etc.)
  inputs.pointerXY.pageX = e.pageX; inputs.pointerXY.pageY = e.pageY
  scheduleRender()
})
window.addEventListener('input', () => { scheduleRender() }) // for search

let commentsScrollTopPrevious = 0
let commentsScrollDeltaPrevious = 0
let scrollerPeekUp = 0 // raise scroller when peeking ancestor needs more space to show it
const selection = {startNode: null as Node | null, startOffset: null as number | null, endNode: null as Node | null, endOffset: null as number | null, row: null as number | null, range: document.createRange()}

type Pointer =
  | {on: 'row'; row: number}
  | {on: 'gutter'; row: number; ancestor: number}
  | {on: null}

let scheduled = false
function scheduleRender() {
  if (scheduled) return
  scheduled = true

  // Heads up: the pattern /*c*/-numberHere indicates a coordinate conversion to whichever coordinates `numberHere` is from
  // e.g. x/*c*/-scrollTop converts x to the scroller's local coordinates
  requestAnimationFrame(function render() {
    let scheduleNextRender = false // sometime changed to true in many places below, to request rendering the next frame
    let pointerDownTargetNext = pointerDownTarget // sometime changed in many places below
    // === Begin batched DOM reads 1

    let scrollTop: number
    { // scroll position calculation. Smooth out over multiple frames because:
      // - scrollTop is an int instead of float (sigh)
      // - scrollTop isn't the right value anyway because scrolling is async and scrollTop is a stale value
      // mix in the previous scrollTop for smoothing
      const scrollTopReal = threadView.commentsScroller.scrollTop
      if (Math.abs(commentsScrollDeltaPrevious) > 0.01) {
        scrollTop = commentsScrollTopPrevious * 0.55 + scrollTopReal * 0.45 // a bit more weight to the old value
        // what's neat is that the interpolation gives browsers without div
        // rubberbanding a small deceleration at the edge
        scheduleNextRender = true
      } else {
        scrollTop = scrollTopReal // consider this as a new wave of scrolling
        // hopefully this means no weird interpolation for platforms with discrete scrolling
        // one problem is that dragging scroll bar to scroll shows a tiny delay from interpolation. Whatever
      }
      commentsScrollDeltaPrevious = scrollTop - commentsScrollTopPrevious
      commentsScrollTopPrevious = scrollTop
    }
    // On Safari, div edge scroll rubberbanding shows the scroller background. Cap it to 0
    // BUT, crucially, later on we lower the entire scroller, to restore the rubber banding's feel.
    // Aka we bounce not the content, but the entire scroller
    const scrollTopCap = Math.max(0, scrollTop)

    let rowsHeightNatural = 0
    for (let i = 0; i < data.length; i++) rowsHeightNatural += rowHeightNaturalF(data[i]!.commentHeightNatural)

    // submission, comments, vertical sizing logic
    const windowHeight = window.innerHeight
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
    const windowWidth = window.innerWidth
    const containerWidth = containerWidthF(windowWidth)
    const containerLeft = (windowWidth - containerWidth) / 2 // center on the page
    let pointer: Pointer = {on: null}
    const pageXLocal = inputs.pointerXY.pageX/*c*/ - containerLeft
    if (0 <= pageXLocal && pageXLocal < containerWidth) {
      let rowTop = submissionHeight/*c*/ - scrollTopCap // ignore animations from scrollerPeekUp & rowsScrollerTopGap
      const indentPointed = Math.floor(pageXLocal / indentWidth) // the indent we're on
      for (let i = 0; i < data.length; i++) {
        const height = rowHeightNaturalF(data[i]!.commentHeightNatural)
        if (rowTop <= inputs.pointerXY.pageY && inputs.pointerXY.pageY < rowTop + height) {
          // arrived at the pointed row's y range
          if (indentPointed <= data[i]!.indent) { // pointed a gutter (as opposed to a comment)
            let ancestor = i; while (ancestor > 0 && data[ancestor]!.indent > indentPointed) ancestor--
            pointer = {on: 'gutter', row: i, ancestor}
          } else {
            pointer = {on: 'row', row: i}
          }
          break // btw, this might never be reached if e.g. scroller's bigger than rows height sum or bottom edge rubberbanding
        }
        rowTop += height
      }
    }

    // animation state changes
    for (let i = 0; i < data.length; i++) {
      const row = data[i]!
      if (inputs.pointerState !== 'up' && pointer.on === 'gutter' && i > pointer.ancestor && i < pointer.row) {
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
      if (inputs.pointerState !== 'up' && pointer.on === 'gutter') { // peek view active
        const ancestor = pointer.ancestor
        let scrollerCommentTopGapFinal = 0
        for (let i = ancestor + 1; i < data.length; i++)
          if (data[i]!.heightAnimation === 'shrink') scrollerCommentTopGapFinal += rowHeightNaturalF(data[i]!.commentHeightNatural)
        let ancestorTopFinal = scrollerCommentTopGapFinal
        for (let i = 0; i < ancestor; i++) ancestorTopFinal += rowHeightNaturalF(data[i]!.commentHeightNatural)

        ancestorHeightFinal =
          rowHeightNaturalF(data[ancestor]!.commentHeightNatural) - Math.max(0, (scrollTop - submissionHeight) - ancestorTopFinal)
        // max(0, scrollTop - ...) = max(0, scrollTopCap - ...) when scrollTop < 0. So we can just use scrollTop here
        scrollerPeekUpFinal = clamp(0, scrollTop - ancestorTopFinal, submissionHeight)
      }
      const scrollerPeekUpDelta = (scrollerPeekUpFinal - scrollerPeekUp) / 5
      scrollerPeekUp += scrollerPeekUpDelta
      if (Math.abs(scrollerPeekUpDelta) > 0.001) scheduleNextRender = true
    }
    const scrollerHeight = scrollerHeightNatural + scrollerPeekUp
    let rowsScrollerTopGap = 0
    for (let i = 0; i < data.length; i++) { // update row height
      const row = data[i]!
      const rowHeightNatural = rowHeightNaturalF(row.commentHeightNatural)
      const rowHeightFinal =
        inputs.pointerState !== 'up' && pointer.on === 'gutter' && i === pointer.ancestor ? ancestorHeightFinal
          : row.heightAnimation === 'shrink' ? 0
            : rowHeightNatural

      const rowHeightFinalDelta = rowHeightFinal - row.height
      row.height += rowHeightFinalDelta / 5 // ease toward final height
      rowsScrollerTopGap += rowHeightNatural - row.height

      if (Math.abs(rowHeightFinalDelta) > 0.001) scheduleNextRender = true
    }

    const scrollerTop = submissionHeight - scrollerPeekUp
    const devicePixelRatio = window.devicePixelRatio

    // === End batched DOM reads 1. Begin batched DOM writes 1

    threadView.commentsDisplay.textContent = '' // arena-style wipe: bulk-detach all children, re-append only visible ones below

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
    const submissionFadeOpacity = 1 - submissionHeight / scrollerPeekUp // desmos.com/calculator/fernhrsi6i
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


    // --- Pass 1: walk visible range, JIT-create nodes, append to DOM ---
    let rowTop = rowsScrollerTopGap + scrollerPeekUp/*c*/ - scrollTopCap
    let indexFirstVisible: number | undefined, indexLastVisible: number | undefined, indexFirstVisibleTop: number | undefined
    const newlyCreated: number[] = [] // indices of rows created this frame, needing clientHeight measurement
    for (let i = 0; i < data.length; i++) {
      const row = data[i]!
      const rowBottom = rowTop + row.height
      if (rowTop <= scrollerHeight && rowBottom >= 0) { // visible range
        if (indexFirstVisible == null) {
          indexFirstVisible = i
          indexFirstVisibleTop = rowTop
        }
        indexLastVisible = i

        let cached = domCache.get(i)
        if (cached == null) { // JIT DOM node creation: first time this row is visible
          const indentsWidth = row.indent * indentWidth

          const userText = document.createElement('div')
          userText.style.position = 'absolute'
          userText.style.left = '8px'
          userText.innerHTML = `▲ ${row.userName} ${row.age}`
          const user = document.createElement('div')
          user.className = 'user'
          user.style.color = textGray
          user.style.left = `${indentsWidth}px`
          user.style.zIndex = String(userZIndex)
          user.append(userText)

          const comment = document.createElement('div')
          comment.className = 'comment'
          comment.style.left = `${commentLeftF(indentsWidth)}px`
          // Safari: select from right of comment toward left sets caretRangeFromPoint range.startOffset to 0, which is weird
          comment.style.paddingRight = `${commentRightGap}px`
          comment.style.width = `${commentWidthF(containerWidth, indentsWidth)}px`
          comment.innerHTML = row.commentHTML

          cached = {user, comment}
          domCache.set(i, cached)
          newlyCreated.push(i)
        }

        threadView.commentsDisplay.appendChild(cached.user) // turns out append(user, comment) is very slow... don't do that in hot paths
        threadView.commentsDisplay.appendChild(cached.comment)
      }
      rowTop += row.height
    }

    // --- Pass 2: batch-read clientHeight for newly created elements ---
    // First clientHeight read triggers one layout reflow; subsequent reads hit clean cache
    for (let k = 0; k < newlyCreated.length; k++) {
      const idx = newlyCreated[k]!
      const row = data[idx]!
      row.commentHeightNatural = domCache.get(idx)!.comment.clientHeight
      row.height = rowHeightNaturalF(row.commentHeightNatural) // snap to real height (no animation for first measurement)
    }

    // --- Pass 3: set position/size styles, draw gutters ---
    // Re-walk all rows with now-accurate heights for correct positions
    rowTop = rowsScrollerTopGap + scrollerPeekUp/*c*/ - scrollTopCap
    for (let i = 0; i < data.length; i++) {
      const row = data[i]!
      const rowBottom = rowTop + row.height
      const userHeight = Math.min(userHeightNatural, row.height)
      const userTop = clamp(rowTop, 0, rowBottom - userHeight)

      const cached = domCache.get(i)
      if (cached != null && cached.user.parentNode != null) { // visible and in DOM
        // update indexFirstVisible/indexFirstVisibleTop with corrected heights (may have changed in pass 2)
        if (indexFirstVisible === i) indexFirstVisibleTop = rowTop

        const user = cached.user
        user.style.top = `${userTop}px`
        user.style.height = `${userHeight}px`
        user.style.backgroundColor = inputs.pointerState !== 'up' && pointer.on === 'gutter' && i === pointer.ancestor ? emphasis : emphasisNone
        user.style.opacity = String(userHeight / userHeightNatural) // bar fades toward 0 when squashed

        const userText = user.children[0] as HTMLElement
        // we don't wanna see user text clipped by its banner. Fade out text earlier
        // 0 at row.height = userHeightNatural, 1 at row.height = rowHeightNaturalMin // desmos.com/calculator/2ko93dpxok
        userText.style.opacity = String((row.height - userHeightNatural) / (rowHeightNaturalMin - userHeightNatural))

        const comment = cached.comment
        const commentHeight = Math.max(0, row.height - userHeight - commentUserGapNatural)
        const commentFadeSize = // fade grows from 1x to 3x of bottom gap size (hide enough comment text to be perceptible)
          commentBottomGapNatural + Math.min(row.commentHeightNatural - commentHeight, commentBottomGapNatural * 2)
        comment.style.top = `${rowTop + userHeightNatural + commentUserGapNatural}px`
        comment.style.height = `${commentHeight}px`
        comment.style.maskImage = comment.style.webkitMaskImage =
          `linear-gradient(0deg, rgba(0, 0, 0, 0) 0%, rgba(0, 0, 0, 1) ${commentFadeSize}px)`
      }

      // render vertical gutter
      let gutterTop = // better seen in action. Try seeing the gap between user and banner when scrolling and when shrunken
        rowBottom - (userTop + userHeight) <= 4 ? rowBottom
          : 0 <= userTop - rowTop && userTop - rowTop <= 4 ? rowTop + userHeight + 4
            : userTop + userHeight
      gutterTop = Math.max(gutterTop, 0)

      let gutterBottom = rowBottom
      for (let j = i + 1; j < data.length && data[j]!.indent > row.indent; j++) gutterBottom += data[j]!.height
      gutterBottom = Math.max(gutterTop, gutterBottom - 4)

      if (gutterTop <= scrollerHeight && gutterBottom >= 0) { // visible
        canvasContext.strokeStyle = pointer.on === 'gutter' && i === pointer.ancestor ? emphasis : emphasisNone
        // canvas line's drawn in the middle of a position. Add half stroke width to left align with DOM-rendered user banner
        const left = row.indent * indentWidth + 0.5/*c*/ + containerLeft
        canvasContext.beginPath()
        canvasContext.moveTo(left, gutterTop/*c*/ + scrollerTop)
        canvasContext.lineTo(left, gutterBottom/*c*/ + scrollerTop)
        canvasContext.stroke()
      }

      rowTop += row.height
    }

    threadView.dummyPlaceholder.style.height = `${rowTop/*c*/ + scrollTopCap}px`

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

    let rangePointed: ReturnType<typeof caretRangeFromPoint> | undefined // caretRangeFromPoint is expensive... make an exception here and don't call it unless necessary
    // custom selection range (highlight later below)
    if (inputs.pointerState !== 'up' && pointer.on === 'row') {
      rangePointed = caretRangeFromPoint(inputs.pointerXY.pageX, inputs.pointerXY.pageY) // still nullable from e.g. out-of-bound values
      if (rangePointed != null) {
        if (inputs.pointerState === 'firstDown' || pointerDownTarget !== 'text') {
          // UX detail: click on non-comment (e.g. gutter): selection not lost. Click on gutter, drag to comment: new selection =)
          // though this also cancels native click-drag on link
          pointerDownTargetNext = 'text'
          selection.startNode = rangePointed.startContainer
          selection.startOffset = rangePointed.startOffset
          selection.row = pointer.row
        }
        if (pointer.row === selection.row) { // cap selection to the same single row we started selecting. Better UX, for now
          selection.endNode = rangePointed.endContainer
          selection.endOffset = rangePointed.endOffset
        } else if (selection.row != null && pointer.row < selection.row) {
          const selCached = domCache.get(selection.row)
          if (selCached != null) {
            let firstText: Node = selCached.comment; while (firstText.firstChild) firstText = firstText.firstChild
            selection.endNode = firstText
            selection.endOffset = 0
          }
        } else if (selection.row != null) {
          const selCached = domCache.get(selection.row)
          if (selCached != null) {
            let lastText: Node = selCached.comment; while (lastText.lastChild) lastText = lastText.lastChild
            selection.endNode = lastText
            selection.endOffset = (lastText as Text).length
          }
        }
      }
    }

    let cursor = 'auto'
    cursor: { // determine cursor icon; add link clicking
      if (pointer.on === 'row') {
        const elementPointed = document.elementFromPoint(inputs.pointerXY.pageX, inputs.pointerXY.pageY)
        if (elementPointed != null /* still nullable from e.g. out-of-bound values */ && elementPointed.tagName === 'A') {
          cursor = 'pointer'
          if (inputs.clicked && pointerDownTarget === elementPointed) { // pointer down-ed & up-ed on the same target
            window.open((elementPointed as HTMLAnchorElement).href, '_blank') // TODO: support other click methods
          } else if (inputs.pointerState === 'firstDown') pointerDownTargetNext = elementPointed
          break cursor
        }
        if (rangePointed != null) cursor = 'text'
      } else if (pointer.on === 'gutter') {
        // show a resizable cursor on gutter when:
        // - pointed row's ancestor (which might be ourselves) is occluded at the top
        // - pointed row's ancestor isn't the row's immediate parent
        let rowTop = 0; for (let i = 0; i < pointer.ancestor; i++) rowTop += data[i]!.height
        if (rowTop < scrollTopCap || pointer.ancestor < pointer.row - 1) cursor = 'row-resize'
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
      if (indexFirstVisible != null && indexLastVisible != null && indexFirstVisibleTop != null) {
        let rowTop = indexFirstVisibleTop
        for (let i = indexFirstVisible; i <= indexLastVisible; i++) {
          const row = data[i]!
          const commentTop = userHeightNatural/*c*/ + scrollerTop // don't surpass the top sticky bar
          const commentBottom = rowTop + row.height/*c*/ + scrollerTop // same as row bottom
          const cached = domCache.get(i)!
          const visitor = document.createTreeWalker(cached.comment, NodeFilter.SHOW_TEXT)
          let node = visitor.nextNode()
          let positionInNode = 0
          function advance(count: number) {
            while (node != null && node.textContent!.length - positionInNode < count) {
              count -= node.textContent!.length - positionInNode
              node = visitor.nextNode()
              positionInNode = 0
            }
            positionInNode += count
            // if we landed exactly at the end of a text node, prefer the start of the next one.
            // This avoids getClientRects() including boundary gaps at block element edges (e.g. <p> tags)
            if (node != null && positionInNode === node.textContent!.length) {
              const next = visitor.nextNode()
              if (next != null) { node = next; positionInNode = 0 }
            }
          }
          let positionLast = 0
          if (searchMatches != null) {
            for (const match of searchMatches[i]!) {
              const start = match.index, length = match[0].length
              advance(start - positionLast); if (node != null) reusedRange.setStart(node, positionInNode)
              advance(length); if (node != null) reusedRange.setEnd(node, positionInNode)
              positionLast = start + length
              for (const {left, width, top, bottom} of reusedRange.getClientRects()) {
                const topBound = clamp(commentTop, top, commentBottom)
                const bottomBound = clamp(commentTop, bottom, commentBottom)
                canvasContext.clearRect(left, topBound, width, bottomBound - topBound)
              }
            }
          }

          // highlight selection. TODO: manual loop fusion is not very readable
          if (i === selection.row && selection.startNode != null && selection.startOffset != null && selection.endNode != null && selection.endOffset != null) {
            selection.range.setStart(selection.startNode, selection.startOffset)
            if (selection.range.comparePoint(selection.endNode, selection.endOffset) === -1) { // range is backward! Flip it
              selection.range.setStart(selection.endNode, selection.endOffset)
              selection.range.setEnd(selection.startNode, selection.startOffset)
            } else {
              selection.range.setEnd(selection.endNode, selection.endOffset)
            }

            const rects = selection.range.getClientRects()
            if (rects.length > 0) {
              const rectFirst = rects[0]!; const rectLast = rects[rects.length - 1]!

              const topFirst = clamp(commentTop, rectFirst.top, commentBottom)
              const bottomFirst = clamp(commentTop, rectFirst.bottom, commentBottom)
              const topLast = clamp(commentTop, rectLast.top, commentBottom)
              const bottomLast = clamp(commentTop, rectLast.bottom, commentBottom)

              canvasContext.fillStyle = 'rgba(0, 0, 100, 0.2)'

              let j = 0; while (j < rects.length - 1 && rects[j + 1]!.top === rectFirst.top) j++ // index of last rect of first line
              if (j < rects.length - 1) { // more than 1 selected line
                const indentsWidth = data[selection.row]!.indent * indentWidth
                const left = commentLeftF(indentsWidth)/*c*/ + containerLeft
                const commentWidth = commentWidthF(containerWidth, indentsWidth)
                canvasContext.fillRect(rectFirst.left, topFirst, left + commentWidth - rectFirst.left, bottomFirst - topFirst) // 1st line
                canvasContext.fillRect(left, bottomFirst, commentWidth, topLast - bottomFirst) // middle region
                canvasContext.fillRect(left, topLast, rectLast.right - left, bottomLast - topLast) // last line
              } else {
                canvasContext.fillRect(rectFirst.left, topFirst, rects[j]!.right - rectFirst.left, bottomFirst - topFirst) // 1st (only) line
              }
            }
          }

          rowTop += row.height
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
    scheduled = false
    inputs.clicked = false
    inputs.copied = false
    if (inputs.pointerState === 'firstDown') inputs.pointerState = 'down'
    else if (inputs.pointerState === 'up') pointerDownTargetNext = 'whateverElse'
    pointerDownTarget = pointerDownTargetNext
    // if (scrollTop === 0) commentsScroller.scrollTop = 1 // TODO: rubber banding even when no overflow lol
    if (scheduleNextRender) scheduleRender()
  })
}

scheduleRender()
