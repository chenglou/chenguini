'use strict'

let thread = dataRaw[0]
let regexChars = "[\\^$.*+?()[]{}|]"

let commentUserGapNatural = 4
let commentBottomGapNatural = 12
let commentLeftGap = 24
let commentRightGap = 20
let commentGapsNatural = commentUserGapNatural + commentBottomGapNatural

let textGray = '#5c5c5c'
let emphasis = 'hsl(37deg 25% 75%)'
let emphasisNone = 'hsl(37deg 33% 87%)'
let userHeightNatural = 24
let indentWidth = 24
let searchHeight = 24
let searchWidth = 160

let submissionHeightNatural = 100
let submissionHeightDelta = 40
let submissionLine1Height = 18

let userZIndex = 1 /* over its comment */, canvasZIndex = 2, commentsScrollerZIndex = 3 // proper depth management

let canvas = document.createElement('canvas')
canvas.className = 'canvas'
canvas.style.zIndex = canvasZIndex
let canvasContext = canvas.getContext('2d')

function makeThreadViewSkeleton() {
  let submissionArrow = document.createElement('div')
  submissionArrow.innerText = '▲'
  submissionArrow.style.color = textGray
  submissionArrow.style.fontSize = '9pt'
  let submissionTitle = document.createElement('div')
  submissionTitle.innerText = thread.title
  let submissionLink = document.createElement('a')
  submissionLink.innerText = `(${thread.link})`
  submissionLink.style.color = textGray
  let submissionLine1 = document.createElement('div')
  submissionLine1.className = 'submission-line-1'
  submissionLine1.append(submissionArrow, submissionTitle, submissionLink)

  let submissionLine2 = document.createElement('div')
  submissionLine2.className = 'submission-line-2'
  submissionLine2.style.color = textGray
  submissionLine2.style.left = commentLeftGap // align vertically with comment
  submissionLine2.innerText =
    `${thread.points} ${thread.points === 1 ? 'point' : 'points'} by\
        ${thread.submitter} on ${thread.submissionDate}\
        | ${thread.comments.length} ${thread.comments.length === 1 ? 'comment' : 'comments'}`

  let search = document.createElement('input')
  search.className = 'search'
  search.placeholder = 'Search in thread...'
  search.value = ''

  let submissionLines = document.createElement('div')
  submissionLines.style.position = 'absolute'
  submissionLines.append(submissionLine1, submissionLine2, search)

  let dummyPlaceholder = document.createElement('div')
  let commentsScroller = document.createElement('div')
  commentsScroller.className = 'comments-scroller'
  commentsScroller.style.zIndex = commentsScrollerZIndex
  commentsScroller.append(dummyPlaceholder)

  let commentsDisplay = document.createElement('div')
  commentsDisplay.className = 'comments-display'

  let container = document.createElement('div')
  container.className = 'thread-container'
  container.append(submissionLines, commentsDisplay, commentsScroller)

  return {
    submissionLine1, submissionLine2, search, submissionLines, dummyPlaceholder, commentsScroller, commentsDisplay, container
  }
}
let threadView = makeThreadViewSkeleton()
document.body.append(threadView.container, canvas)

let caretRangeFromPoint = document.caretRangeFromPoint
  ? document.caretRangeFromPoint.bind(document) // safari & chrome
  : function caretRangeFromPoint(x, y) { // firefox
    let { offsetNode, offset } = document.caretPositionFromPoint(x, y) // apparently non-nullable?
    return { startNode: offsetNode, startOffset: offset }
  }
function clamp(min, v, max) {
  return v > max ? max : v < min ? min : v
}
function rowHeightNaturalF(commentHeightNatural) {
  return userHeightNatural + commentUserGapNatural + commentHeightNatural + commentBottomGapNatural
}
let rowHeightNaturalMin = rowHeightNaturalF(0)
function containerWidthF(windowWidth) {
  return clamp(375 /* min width of iPhone 12 mini */, windowWidth, 1200 /* HN max width */)
}
function commentLeftF(indentsWidth) {
  return indentsWidth + commentLeftGap
}
function commentWidthF(containerWidth, indentsWidth) { // TODO: indentsWidth encapsulate?
  return containerWidth - commentLeftF(indentsWidth) - commentRightGap
}
{ // batch create user header + comments. Latter for subsequent height measurement
  let containerWidth = containerWidthF(window.innerWidth)
  for (let i = 0; i < thread.comments.length; i++) {
    let row = thread.comments[i]
    let indentsWidth = row.indent * indentWidth

    let userText = document.createElement('div')
    userText.style.position = 'absolute'
    userText.style.left = 8
    userText.innerHTML = `▲ ${row.user} ${row.age}`
    let user = document.createElement('div')
    user.className = 'user'
    user.style.color = textGray
    user.style.left = indentsWidth
    user.style.zIndex = userZIndex
    user.append(userText)

    let comment = document.createElement('div')
    comment.className = 'comment'
    comment.style.left = commentLeftF(indentsWidth)
    // Safari: select from right of comment toward left sets caretRangeFromPoint range.startOffset to 0, which is weird
    comment.style.paddingRight = commentRightGap
    comment.style.width = commentWidthF(containerWidth, indentsWidth)
    comment.innerHTML = row.comment

    threadView.commentsDisplay.append(user, comment)
  }
}
/** @type Array<{
 *   indent: number, user: HTMLDivElement, age: number, comment: HTMLDivElement, commentText: string,
 *   heightAnimation: string, height: number, commentHeightNatural: number
 * }> */
let data = []
for (let i = 0; i < thread.comments.length; i++) { // batch read comment heights
  let row = thread.comments[i]
  let user = threadView.commentsDisplay.children[i * 2]
  let comment = threadView.commentsDisplay.children[i * 2 + 1]
  let commentHeightNatural = comment.clientHeight

  data.push({
    indent: row.indent,
    user: user,
    age: row.age,
    comment: comment,
    commentText: comment.textContent, // cached for search. Otherwise every read of it triggers a heavy DOM getter
    heightAnimation: 'grow',
    height: rowHeightNaturalF(commentHeightNatural),
    commentHeightNatural,
  })
}
let inputs = { // input state
  /** @type 'down' | 'up' | 'firstDown' */
  pointerState: 'up',
  pointerXY: { pageX: 0, pageY: 0 }, // btw, on page load, there's no way to render a first cursor state =(
  clicked: false,
  copied: false, // browser copy event
}
/** @type 'whateverElse' | Element | 'text' */
let pointerDownTarget = 'whateverElse'

let reusedRange = document.createRange() // reuse a single range. Creating many is expensive. See callsites. Careful with leak

window.addEventListener('resize', () => { scheduleRender() })
window.addEventListener('mouseup', () => { // can't use pointerup, which isn't triggered when pointer panned
  inputs.pointerState = 'up'
  scheduleRender()
})
window.addEventListener('touchend', () => {
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
  let content = document.createElement('div')
  content.appendChild(selection.range.cloneContents())
  e.clipboardData.setData('text/html', content.innerHTML)
  e.clipboardData.setData('text/plain', content.innerText)
  scheduleRender()
})
window.addEventListener('contextmenu', (e) => {
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
let selection = { startNode: null, startOffset: null, endNode: null, endOffset: null, row: null, range: document.createRange() }

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

    let scrollTop
    { // scroll position calculation. Smooth out over multiple frames because:
      // - scrollTop is an int instead of float (sigh)
      // - scrollTop isn't the right value anyway because scrolling is async and scrollTop is a stale value
      // mix in the previous scrollTop for smoothing
      let scrollTopReal = threadView.commentsScroller.scrollTop
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
    let scrollTopCap = Math.max(0, scrollTop)

    let rowsHeightNatural = 0
    for (let i = 0; i < data.length; i++) rowsHeightNatural += rowHeightNaturalF(data[i].commentHeightNatural)

    // submission, comments, vertical sizing logic
    let windowHeight = window.innerHeight
    let submissionLine1Top
    let submissionHeight
    let scrollerHeightNatural
    let submissionLinesGap
    { // TODO: maintain invariant: total height <= window height
      // names are implicitly all about submission unless indicated otherwise
      let line1TopMax = 24
      let line1TopMin = 12
      let linesGapMax = 8
      let linesGapMin = 4
      if (submissionHeightNatural + rowsHeightNatural < windowHeight) {
        let delta = Math.min(submissionHeightDelta, windowHeight - submissionHeightNatural - rowsHeightNatural)
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
        let scrollTopMax = rowsHeightNatural - scrollerHeightNatural
        if (scrollTop > scrollTopMax) {
          scrollerHeightNatural = scrollerHeightNatural - (scrollTop - scrollTopMax) / 2
        }
      }
    }

    // When rows animate, the cursor's target might change over time. E.g. a pressed row A shrinks
    // to 0 -> cursor now targets row B -> row B makes row A expand back; infinite cycle.
    // **Views should be decoupled from their hitboxes!** Here, the hitboxes ignore animating states
    let windowWidth = window.innerWidth
    let containerWidth = containerWidthF(windowWidth)
    let containerLeft = (windowWidth - containerWidth) / 2 // center on the page
    /** @type {on: 'row', row: number} | {on: 'gutter', row: number, ancestor: number} | {on: null} */
    let pointer = { on: null }
    let pageXLocal = inputs.pointerXY.pageX/*c*/ - containerLeft
    if (0 <= pageXLocal && pageXLocal < containerWidth) {
      let rowTop = submissionHeight/*c*/ - scrollTopCap // ignore animations from scrollerPeekUp & rowsScrollerTopGap
      let indentPointed = Math.floor(pageXLocal / indentWidth) // the indent we're on
      for (let i = 0; i < data.length; i++) {
        let height = rowHeightNaturalF(data[i].commentHeightNatural)
        if (rowTop <= inputs.pointerXY.pageY && inputs.pointerXY.pageY < rowTop + height) {
          // arrived at the pointed row's y range
          if (indentPointed <= data[i].indent) { // pointed a gutter (as opposed to a comment)
            let ancestor = i; while (ancestor > 0 && data[ancestor].indent > indentPointed) ancestor--
            pointer = { on: 'gutter', row: i, ancestor }
          } else {
            pointer = { on: 'row', row: i }
          }
          break // btw, this might never be reached if e.g. scroller's bigger than rows height sum or bottom edge rubberbanding
        }
        rowTop += height
      }
    }

    // animation state changes
    for (let i = 0; i < data.length; i++) {
      let row = data[i]
      if (inputs.pointerState !== 'up' && pointer.on === 'gutter' && i > pointer.ancestor && i < pointer.row) {
        // from ancestor to clicked item. Shrink them
        // TODO: what if we just store rowHeightFinal
        if (row.heightAnimation === 'grow') row.heightAnimation = 'shrink'
      } else {
        if (row.heightAnimation === 'shrink') row.heightAnimation = 'grow'
      }
    }

    let ancestorHeightFinal
    let scrollerPeekUpFinal = 0
    { // determine ancestor height and peek up amount
      if (inputs.pointerState !== 'up' && pointer.on === 'gutter') { // peek view active
        let ancestor = pointer.ancestor
        let scrollerCommentTopGapFinal = 0
        for (let i = ancestor + 1; i < data.length; i++)
          if (data[i].heightAnimation === 'shrink') scrollerCommentTopGapFinal += rowHeightNaturalF(data[i].commentHeightNatural)
        let ancestorTopFinal = scrollerCommentTopGapFinal
        for (let i = 0; i < ancestor; i++) ancestorTopFinal += rowHeightNaturalF(data[i].commentHeightNatural)

        ancestorHeightFinal =
          rowHeightNaturalF(data[ancestor].commentHeightNatural) - Math.max(0, (scrollTop - submissionHeight) - ancestorTopFinal)
        // max(0, scrollTop - ...) = max(0, scrollTopCap - ...) when scrollTop < 0. So we can just use scrollTop here
        scrollerPeekUpFinal = clamp(0, scrollTop - ancestorTopFinal, submissionHeight)
      }
      let scrollerPeekUpDelta = (scrollerPeekUpFinal - scrollerPeekUp) / 5
      scrollerPeekUp += scrollerPeekUpDelta
      if (Math.abs(scrollerPeekUpDelta) > 0.001) scheduleNextRender = true
    }
    let scrollerHeight = scrollerHeightNatural + scrollerPeekUp
    let rowsScrollerTopGap = 0
    for (let i = 0; i < data.length; i++) { // update row height
      let row = data[i]
      let rowHeightNatural = rowHeightNaturalF(row.commentHeightNatural)
      let rowHeightFinal =
        inputs.pointerState !== 'up' && pointer.on === 'gutter' && i === pointer.ancestor ? ancestorHeightFinal
          : row.heightAnimation === 'shrink' ? 0
            : rowHeightNatural

      let rowHeightFinalDelta = rowHeightFinal - row.height
      row.height += rowHeightFinalDelta / 5 // ease toward final height
      rowsScrollerTopGap += rowHeightNatural - row.height

      if (Math.abs(rowHeightFinalDelta) > 0.001) scheduleNextRender = true
    }

    let scrollerTop = submissionHeight - scrollerPeekUp
    let devicePixelRatio = window.devicePixelRatio

    // === End batched DOM reads 1. Begin batched DOM writes 1

    threadView.commentsDisplay.textContent = '' // wipe content. Probably the fastest & most concise way? Bah not the bottleneck

    // no blurry canvas: coderwall.com/p/vmkk6a/how-to-make-the-canvas-not-look-like-crap-on-retina
    canvas.width = windowWidth * devicePixelRatio // different than canvas.style.width. Btw this clears the canvas as well
    canvas.height = windowHeight * devicePixelRatio
    canvasContext.scale(devicePixelRatio, devicePixelRatio)

    // generally, write (left width top height) in that order, like some DOM APIs
    threadView.container.style.left = containerLeft
    threadView.container.style.width = containerWidth
    threadView.container.style.height = windowHeight

    threadView.submissionLines.style.width = containerWidth
    threadView.submissionLines.style.height = scrollerTop // submission top is 0
    let submissionFadeOpacity = 1 - submissionHeight / scrollerPeekUp // desmos.com/calculator/fernhrsi6i
    threadView.submissionLines.style.maskImage = threadView.submissionLines.style.webkitMaskImage =
      `linear-gradient(0deg, rgba(0, 0, 0, ${submissionFadeOpacity}) 0%, rgba(0, 0, 0, 1) 20px)`

    threadView.submissionLine1.style.top = submissionLine1Top

    threadView.submissionLine2.style.top = submissionLine1Top + submissionLine1Height + submissionLinesGap

    threadView.search.style.left = containerWidth - searchWidth - commentLeftGap // same gap size on the right as submission lines gap on the left
    threadView.search.style.width = searchWidth
    threadView.search.style.top = (submissionHeight - searchHeight) / 2
    threadView.search.style.height = searchHeight

    threadView.commentsScroller.style.width = containerWidth
    threadView.commentsScroller.style.top = scrollerTop
    threadView.commentsScroller.style.height = scrollerHeight

    threadView.commentsDisplay.style.width = containerWidth
    threadView.commentsDisplay.style.top = scrollerTop
    threadView.commentsDisplay.style.height = scrollerHeight


    let rowTop = rowsScrollerTopGap + scrollerPeekUp/*c*/ - scrollTopCap
    let indexFirstVisible, indexLastVisible, indexFirstVisibleTop
    for (let i = 0; i < data.length; i++) {
      let row = data[i]
      let rowBottom = rowTop + row.height
      let userHeight = Math.min(userHeightNatural, row.height)
      let userTop = clamp(rowTop, 0, rowBottom - userHeight)
      if (rowTop <= scrollerHeight && rowBottom >= 0) { // visible range
        if (indexFirstVisible == null) {
          indexFirstVisible = i
          indexFirstVisibleTop = rowTop
        }
        indexLastVisible = i

        let user = row.user
        user.style.top = userTop
        user.style.height = userHeight
        user.style.backgroundColor = inputs.pointerState !== 'up' && i === pointer.ancestor ? emphasis : emphasisNone
        user.style.opacity = userHeight / userHeightNatural // bar fades toward 0 when squashed

        let userText = user.children[0]
        // we don't wanna see user text clipped by its banner. Fade out text earlier
        // 0 at row.height = userHeightNatural, 1 at row.height = rowHeightNaturalMin // desmos.com/calculator/2ko93dpxok
        userText.style.opacity = (row.height - userHeightNatural) / (rowHeightNaturalMin - userHeightNatural)

        let comment = row.comment
        let commentHeight = Math.max(0, row.height - userHeight - commentUserGapNatural)
        let commentFadeSize = // fade grows from 1x to 3x of bottom gap size (hide enough comment text to be perceptible)
          commentBottomGapNatural + Math.min(row.commentHeightNatural - commentHeight, commentBottomGapNatural * 2)
        comment.style.top = rowTop + userHeightNatural + commentUserGapNatural
        comment.style.height = commentHeight
        comment.style.maskImage = comment.style.webkitMaskImage =
          `linear-gradient(0deg, rgba(0, 0, 0, 0) 0%, rgba(0, 0, 0, 1) ${commentFadeSize}px)`

        threadView.commentsDisplay.appendChild(user) // turns out append(user, comment) is very slow... don't do that in hot paths
        threadView.commentsDisplay.appendChild(comment)
      }

      // render vertical gutter
      let gutterTop = // better seen in action. Try seeing the gap between user and banner when scrolling and when shrunken
        rowBottom - (userTop + userHeight) <= 4 ? rowBottom
          : 0 <= userTop - rowTop && userTop - rowTop <= 4 ? rowTop + userHeight + 4
            : userTop + userHeight
      gutterTop = Math.max(gutterTop, 0)

      let gutterBottom = rowBottom
      for (let j = i + 1; j < data.length && data[j].indent > row.indent; j++) gutterBottom += data[j].height
      gutterBottom = Math.max(gutterTop, gutterBottom - 4)

      if (gutterTop <= scrollerHeight && gutterBottom >= 0) { // visible
        canvasContext.strokeStyle = i === pointer.ancestor ? emphasis : emphasisNone
        // canvas line's drawn in the middle of a position. Add half stroke width to left align with DOM-rendered user banner
        let left = row.indent * indentWidth + 0.5/*c*/ + containerLeft
        canvasContext.beginPath()
        canvasContext.moveTo(left, gutterTop/*c*/ + scrollerTop)
        canvasContext.lineTo(left, gutterBottom/*c*/ + scrollerTop)
        canvasContext.stroke()
      }

      rowTop += row.height
    }

    threadView.dummyPlaceholder.style.height = rowTop/*c*/ + scrollTopCap

    let temporarilyAllowRowSelection = pointer.row != null
    if (temporarilyAllowRowSelection) {
      // enable selection for `caretRangeFromPoint` below. We don't keep it permanently on to prevent bad select-all,
      // and safari's weird selection bug when commentsScroller's actively getting click events on top of comments
      threadView.commentsScroller.style.pointerEvents = 'none'
      data[pointer.row].comment.style.userSelect = data[pointer.row].comment.style.webkitUserSelect = 'auto'
    }

    // === End batched DOM writes 1. Begin batched DOM read 2

    let rangePointed // caretRangeFromPoint is expensive... make an exception here and don't call it unless necessary
    // custom selection range (highlight later below)
    if (inputs.pointerState !== 'up' && pointer.on === 'row') {
      rangePointed = caretRangeFromPoint(inputs.pointerXY.pageX, inputs.pointerXY.pageY) // still nullable from e.g. out-of-bound values
      if (rangePointed) {
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
        } else if (pointer.row < selection.row) {
          let firstText = data[selection.row].comment; while (firstText.firstChild) firstText = firstText.firstChild
          selection.endNode = firstText
          selection.endOffset = 0
        } else {
          let lastText = data[selection.row].comment; while (lastText.lastChild) lastText = lastText.lastChild
          selection.endNode = lastText
          selection.endOffset = lastText.length
        }
      }
    }

    let cursor = 'auto'
    cursor: { // determine cursor icon; add link clicking
      if (pointer.on === 'row') {
        let elementPointed = document.elementFromPoint(inputs.pointerXY.pageX, inputs.pointerXY.pageY)
        if (elementPointed /* still nullable from e.g. out-of-bound values */ && elementPointed.tagName === 'A') {
          cursor = 'pointer'
          if (inputs.clicked && pointerDownTarget === elementPointed) { // pointer down-ed & up-ed on the same target
            window.open(elementPointed.href, '_blank') // TODO: support other click methods
          } else if (inputs.pointerState === 'firstDown') pointerDownTargetNext = elementPointed
          break cursor
        }
        if (rangePointed != null) cursor = 'text'
      } else if (pointer.on === 'gutter') {
        // show a resizable cursor on gutter when:
        // - pointed row's ancestor (which might be ourselves) is occluded at the top
        // - pointed row's ancestor isn't the row's immediate parent
        let rowTop = 0; for (let i = 0; i < pointer.ancestor; i++) rowTop += data[i].height
        if (rowTop < scrollTopCap || pointer.ancestor < pointer.row - 1) cursor = 'row-resize'
      }
    }

    let searchMatches // time to highlight search results
    if (threadView.search.value !== '') {
      canvasContext.fillStyle = 'rgba(0, 0, 0, 0.2)' // dim the whole scroller
      canvasContext.fillRect(containerLeft, scrollerTop, containerWidth, scrollerHeight)
      let fuzzyQuery = [...threadView.search.value] // support fuzzy search! Example query: he.
        .map(char => regexChars.includes(char) ? '\\' + char : char) // h e \.
        .join('\\S*?') // h\S*?e\S*?\?\S*\.
      let fuzzyQueryRegex = new RegExp(fuzzyQuery, 'gi') // case insensitive search too. Why not!
      searchMatches = data.map(d => d.commentText.matchAll(fuzzyQueryRegex, 'g'))
    }
    { // highlight search results and selection
      let rowTop = indexFirstVisibleTop
      for (let i = indexFirstVisible; i <= indexLastVisible; i++) {
        let row = data[i]
        let commentTop = userHeightNatural/*c*/ + scrollerTop // don't surpass the top sticky bar
        let commentBottom = rowTop + row.height/*c*/ + scrollerTop // same as row bottom
        let visitor = document.createTreeWalker(data[i].comment, NodeFilter.SHOW_TEXT)
        let node = visitor.nextNode()
        let positionInNode = 0
        function advance(count) {
          while (node.textContent.length - positionInNode < count) {
            count -= node.textContent.length - positionInNode
            node = visitor.nextNode()
            positionInNode = 0
          }
          positionInNode += count
        }
        let positionLast = 0
        if (searchMatches) {
          for (let match of searchMatches[i]) {
            let start = match.index, length = match[0].length
            advance(start - positionLast); reusedRange.setStart(node, positionInNode)
            advance(length); reusedRange.setEnd(node, positionInNode)
            positionLast = start + length
            for (let { left, width, top, bottom } of reusedRange.getClientRects()) {
              let topBound = clamp(commentTop, top, commentBottom)
              let bottomBound = clamp(commentTop, bottom, commentBottom)
              canvasContext.clearRect(left, topBound, width, bottomBound - topBound)
            }
          }
        }

        // highlight selection. TODO: manual loop fusion is not very readable
        if (i === selection.row) {
          selection.range.setStart(selection.startNode, selection.startOffset)
          if (selection.range.comparePoint(selection.endNode, selection.endOffset) === -1) { // range is backward! Flip it
            selection.range.setStart(selection.endNode, selection.endOffset)
            selection.range.setEnd(selection.startNode, selection.startOffset)
          } else {
            selection.range.setEnd(selection.endNode, selection.endOffset)
          }

          let rects = selection.range.getClientRects()
          if (rects.length > 0) {
            let rectFirst = rects[0]; let rectLast = rects[rects.length - 1]

            let topFirst = clamp(commentTop, rectFirst.top, commentBottom)
            let bottomFirst = clamp(commentTop, rectFirst.bottom, commentBottom)
            let topLast = clamp(commentTop, rectLast.top, commentBottom)
            let bottomLast = clamp(commentTop, rectLast.bottom, commentBottom)

            canvasContext.fillStyle = 'rgba(0, 0, 100, 0.2)'

            let i = 0; while (i < rects.length - 1 && rects[i + 1].top === rectFirst.top) i++ // index of last rect of first line
            if (i < rects.length - 1) { // more than 1 selected line
              let indentsWidth = data[selection.row].indent * indentWidth
              let left = commentLeftF(indentsWidth)/*c*/ + containerLeft
              let commentWidth = commentWidthF(containerWidth, indentsWidth)
              canvasContext.fillRect(rectFirst.left, topFirst, left + commentWidth - rectFirst.left, bottomFirst - topFirst) // 1st line
              canvasContext.fillRect(left, bottomFirst, commentWidth, topLast - bottomFirst) // middle region
              canvasContext.fillRect(left, topLast, rectLast.right - left, bottomLast - topLast) // last line
            } else {
              canvasContext.fillRect(rectFirst.left, topFirst, rects[i].right - rectFirst.left, bottomFirst - topFirst) // 1st (only) line
            }
          }
        }

        rowTop += row.height
      }
    }

    // === End batched DOM read 2. Begin Batched DOM write 2

    threadView.commentsScroller.style.cursor = cursor

    if (temporarilyAllowRowSelection) { // ok, now recover the old state
      threadView.commentsScroller.style.pointerEvents = 'auto'
      data[pointer.row].comment.style.userSelect = data[pointer.row].comment.style.webkitUserSelect = 'none'
    }

    // === prepare for next frame
    scheduled = false
    inputs.clicked = false
    inputs.copied = false
    if (inputs.pointerState === 'firstDown') inputs.pointerState = 'down'
    else if (inputs.pointerState === 'up') pointerDownTargetNext = 'whateverElse'
    pointerDownTarget = pointerDownTargetNext
    // if (scrollTop === 0) commentsScroller.scrollTop = 1 // TODO: rubber banding even when no overflow lol
    if (scheduleNextRender || false) scheduleRender()
  })
}

scheduleRender()
