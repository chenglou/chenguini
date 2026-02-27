// Logic for rendering bajillion rows in a list by rendering only what's in view

let containerHeight = 500;
let containerWidth = 400;
let containerTop = 60;
let rowsCount = 10000;
let debugPadding = 40;

// DOM setup
let container = document.createElement("div");
container.className = "container";
container.style.height = containerHeight;
container.style.width = containerWidth;
container.style.top = containerTop;

let debugTop = document.createElement("div");
debugTop.className = "debug";
debugTop.style.height = debugPadding;
debugTop.style.width = containerWidth;
debugTop.style.top = containerTop;

let debugBottom = document.createElement("div");
debugBottom.className = "debug";
debugBottom.style.height = debugPadding;
debugBottom.style.width = containerWidth;
debugBottom.style.top = containerTop + containerHeight - debugPadding;

// we only render what's visible, but we still need the (native!) scrollbar to
// be of the right size. Fill the container with a long dummy
let dummyPlaceholder = document.createElement("div");

container.append(dummyPlaceholder);
document.body.append(container, debugTop, debugBottom);

function easeOutQuad(x) {
  return 1 - (1 - x) * (1 - x);
}
function easeOutElastic(x) {
  let c4 = (2 * Math.PI) / 3;
  // https://desmos.com/calculator/bolfsmxbqe
  return Math.pow(2, -10 * x) * Math.sin((x * 10 - 0.75) * c4) + 1;
}

let ANIMATE_IN = 0;
let ANIMATE_OUT = 1;
let ANIMATE_NONE = 2;

let data = [];
let nextRowId = 0;
const domCache = new Map(); // cache lifetime: same as data
function makeRow() {
  return {
    id: nextRowId++,
    heightFinal: Math.round(Math.random() * 60 + 50), // range: [50, 110]
    color: `hsl(205, 100%, ${Math.random() * 40 + 50}%)`, // blue hue. Range: [50, 90]
    animation: ANIMATE_IN,
    animationTiming: 0.01, // don't start at 0; for adding row this'd give height 0
    selected: false,
  };
}
function getHeight(row) {
  return row.animation === ANIMATE_OUT
    ? (1 - easeOutQuad(row.animationTiming)) * row.heightFinal // decrease to 0
    : easeOutElastic(row.animationTiming) * row.heightFinal; // cheeky bouncy row enter
}

for (let i = 0; i < rowsCount; i++) data.push(makeRow());

let state = {
  holdingShift: false,
  holdingAlt: false,
  holdingMeta: false, // the stock's still going up
  selectionPivot: null,
  latestSelected: null,
};
// transient. Cleared after every frame
let inputs = {
  pressedArrowDown: false,
  pressedArrowUp: false,
  clickedY: null,
};
// events
container.addEventListener("scroll", scheduleRender);
// event delegation. Let container handle row click logic
// TODO: mousedown would be nicer, but dragging the scrollbar would trigger it accidentally
container.addEventListener("click", (e) => {
  inputs.clickedY = e.offsetY;
  scheduleRender();
});
document.body.addEventListener("keyup", (e) => {
  if (e.key === "Shift") state.holdingShift = false;
  else if (e.key === "Alt") state.holdingAlt = false;
  else if (e.key === "Meta") state.holdingMeta = false;
});
document.body.addEventListener("keydown", (e) => {
  if (e.key === "Shift") state.holdingShift = true;
  else if (e.key === "Alt") state.holdingAlt = true;
  else if (e.key === "Meta") state.holdingMeta = true;
  else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    e.preventDefault(); // disable default arrows scrolling. Scroll by whole rows instead
    if (e.key === "ArrowDown") inputs.pressedArrowDown = true;
    else inputs.pressedArrowUp = true;
    scheduleRender();
  }
});

function rowOccludedTop(containerHeight, rowTop, rowHeight, scrollTop) {
  return rowTop < scrollTop
    ? rowTop // row occluded & above; scroll up
    : rowTop + rowHeight > scrollTop + containerHeight
    ? rowTop + rowHeight - containerHeight // row occluded & below; scroll down
    : null;
}
function render({ pressedArrowDown, pressedArrowUp, clickedY }) {
  // first, remove rows that reached the end of deletion animation. In-place O(n) filter
  let removeCount = 0;
  for (let i = 0; i + removeCount < data.length; ) {
    data[i] = data[i + removeCount]; // shift slot if necessary, to compact array
    if (data[i].animation === ANIMATE_OUT && data[i].animationTiming === 1) {
      let node = domCache.get(data[i].id);
      if (node != null && node.parentNode != null) node.remove();
      domCache.delete(data[i].id);
      removeCount++;
    } else {
      i++; // proof of progress: either removeCount or i increase, each iteration
    }
  }
  data.length -= removeCount;
  // focus management & programmatic scrollTo logic. Both variables are needed later too
  let rowClicked = null;
  let needsScrollTo = null;
  if (clickedY != null) {
    for (let i = 0, rowTop = 0; i < data.length; i++) {
      let height = getHeight(data[i]);
      if (clickedY >= rowTop && clickedY < rowTop + height) {
        rowClicked = i;
        // maybe scroll to row
        needsScrollTo = rowOccludedTop(containerHeight, rowTop, height, container.scrollTop);
        break; // this body might never be reached because e.g. we have fewer rows than container height
      }
      rowTop += height;
    }
    if (rowClicked != null) {
      let { pivot, latestSelected } = clickSelect(
        data,
        rowClicked,
        state.selectionPivot,
        state.latestSelected,
        state.holdingMeta,
        state.holdingShift
      );
      state.selectionPivot = pivot;
      state.latestSelected = latestSelected;
    }
  } else if (pressedArrowUp || pressedArrowDown) {
    state.latestSelected = keyboardSelect(
      data,
      pressedArrowUp,
      state.holdingShift,
      state.latestSelected
    );
    // maybe scroll to the latest selected
    let rowTop = 0;
    for (let i = 0; i < state.latestSelected; i++) rowTop += getHeight(data[i]);
    needsScrollTo = rowOccludedTop(
      containerHeight,
      rowTop,
      getHeight(data[state.latestSelected]),
      container.scrollTop
    );
  }
  // click adds row, shift+click starts animating row out, for demo purpose
  if (rowClicked != null && state.holdingAlt) {
    if (state.holdingShift) {
      let row = data[rowClicked];
      if (row.animation !== ANIMATE_OUT) row.animationTiming = 0; // start animating out
      row.animation = ANIMATE_OUT;
    } else data.splice(rowClicked + 1, 0, makeRow()); // add row below
  }
  // advance animation
  let stillNeedsAnimating = false;
  for (let i = 0; i < data.length; i++) {
    let row = data[i];
    stillNeedsAnimating = stillNeedsAnimating || row.animation !== ANIMATE_NONE;
    if (row.animation === ANIMATE_IN) {
      row.animationTiming += 1000 / 60 / 2000;
      if (row.animationTiming >= 1) row.animation = ANIMATE_NONE;
    } else if (row.animation === ANIMATE_OUT) {
      row.animationTiming += 1000 / 60 / 300;
    }
    row.animationTiming = Math.min(1, row.animationTiming);
  }

  // === now, the actual rendering
  /*
    https://groups.google.com/a/chromium.org/g/blink-dev/c/_Q7A4AQBFKY
  - scrollTop is a double by spec, but rounded/truncated to int for browsers
  - scroll event is async, so scrollTop doesn't even reflect the right value
  - scrollTop is also an expensive magical getter
  */
  // manually lift these out of the loop. Compiler didn't...
  let scrollTop = container.scrollTop + debugPadding;
  let scrollBottom = container.scrollTop + containerHeight - debugPadding;
  let rowTop = 0;
  for (let i = 0; i < data.length; i++) {
    let row = data[i];
    let height = getHeight(row);
    // is this row in the visible range?
    if (rowTop <= scrollBottom && rowTop + height >= scrollTop) {
      let node = domCache.get(row.id);
      if (node == null) { // JIT DOM node creation: first time this row is visible
        node = document.createElement("div");
        node.className = "row";
        domCache.set(row.id, node);
      }
      node.style.top = rowTop;
      node.style.height = height;
      node.innerText = "Cell " + (i + 1);
      node.style.backgroundColor = row.selected
        ? "hsl(64deg 73% 74%)"
        : row.color;
      // Multiselect debugging highlights. Feel free to comment
      // if (i === state.latestSelected) node.style.border = "5px solid green";
      // if (i === state.selectionPivot)
      //   node.style.boxShadow = "0 0 10px inset red";

      if (node.parentNode == null) container.append(node); // if previously absent, add
    } else { // not visible
      let node = domCache.get(row.id);
      if (node != null && node.parentNode != null) node.remove(); // if previously present, remove
    }
    rowTop += height;
  }

  dummyPlaceholder.style.height = rowTop;

  return { stillNeedsAnimating, needsScrollTo };
}

let scheduled = false;
function scheduleRender() {
  if (scheduled) return;
  scheduled = true;
  // defer to gather all events info. rAF runs on the current frame unless it's in another rAF
  // https://medium.com/@paul_irish/requestanimationframe-scheduling-for-nerds-9c57f7438ef4
  requestAnimationFrame(() => {
    let { stillNeedsAnimating, needsScrollTo } = render(inputs);
    scheduled = false;
    inputs.pressedArrowUp = false;
    inputs.pressedArrowDown = false;
    inputs.clickedY = null;
    if (needsScrollTo != null) {
      container.scrollTo({ top: needsScrollTo, behavior: "smooth" }); // triggers scroll next frame
    } else if (stillNeedsAnimating) scheduleRender();
  });
}

scheduleRender();
