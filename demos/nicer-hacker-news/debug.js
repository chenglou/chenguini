// show the real position of user bar in the scrollingContainer
// let currentTop = 0
// for (let i = 0; i < data.length; i++) {
//   let node = document.createElement('div')
//   node.style.position = 'absolute'
//   node.style.height = userHeightNatural
//   node.style.width = '100%'
//   node.style.backgroundColor = 'rgba(0, 100, 0, 0.2)'
//   node.style.top = currentTop
//   currentTop += data[i].height
//   scrollingContainer.append(node)
// }

commentsDisplay.style.boxShadow = 'inset 0 0 2px 2px red'
commentsScroller.style.boxShadow = 'inset 0 0 1px 1px blue'
submissionLines.style.boxShadow = 'inset 0 0 3px 3px green'

// random for a seed value n. For fun coloring, debugging, etc
function hash(n) {
  n = (n * 0.1031) % 1;
  n *= n + 33.33;
  n *= n + n;
  return n % 1;
}

// convenience debug rectangle
// let debug = document.createElement('div')
// debug.style.position = 'absolute'
// debug.style.outline = '1px solid red'
// debug.style.width = 200
// debug.style.zIndex = 9999
// debug.style.pointerEvents = 'none'

// let time = 0
// function scrollALittle() {
//   scrollingContainer.scrollTop++
//   if (time++ < 100) requestAnimationFrame(scrollALittle)
// }
// scrollALittle()
