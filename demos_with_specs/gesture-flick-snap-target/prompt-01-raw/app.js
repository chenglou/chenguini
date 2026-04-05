import {
  CARD_HEIGHT,
  CARD_WIDTH,
  DECAY_FRICTION,
  MS_PER_ANIMATION_STEP,
  RECENT_POINTER_WINDOW_MS,
  createSpring,
  estimateReleaseVelocity,
  getCornerPositions,
  getDecayRestPosition,
  isSpringSettled,
  pickNearestCorner,
  pointInRect,
  roundPoint,
  stepSpring,
} from "./gesture.js";

const cardElement = document.querySelector("[data-pip-card]");
const restMarkerElement = document.querySelector("[data-rest-marker]");
const cornerMarkerElements = Array.from(document.querySelectorAll("[data-corner]"));

const params = new URLSearchParams(window.location.search);
const scenario = params.get("scenario") ?? "";
const requestId = params.get("requestId") ?? "";

const state = {
  corners: getCornerPositions({
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
  }),
  activeCornerId: "bottom-left",
  chosenCornerId: "bottom-left",
  drag: null,
  pointerSamples: [],
  pointer: null,
  restPoint: null,
  report: null,
  x: createSpring(0),
  y: createSpring(0),
  frameId: null,
  accumulatorMs: 0,
  lastFrameTime: 0,
};

initialize();

function initialize() {
  const initialCorner = state.corners[state.activeCornerId];
  state.x.pos = state.x.dest = initialCorner.x;
  state.y.pos = state.y.dest = initialCorner.y;

  publishReport({ phase: "loading" });
  render();
  attachEventHandlers();

  window.addEventListener("resize", handleResize);

  if (scenario !== "") {
    queueMicrotask(async () => {
      try {
        publishReport({ phase: "running" });
        await runScenario(scenario);
      } catch (error) {
        publishReport({
          phase: "error",
          message: error instanceof Error ? error.message : String(error),
        });
      }
    });
  }
}

function attachEventHandlers() {
  cardElement.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) {
      return;
    }

    const started = beginDrag({
      x: event.clientX,
      y: event.clientY,
      time: event.timeStamp,
    });

    if (started) {
      cardElement.setPointerCapture?.(event.pointerId);
      event.preventDefault();
    }
  });

  cardElement.addEventListener(
    "touchstart",
    (event) => {
      const touch = event.changedTouches[0];
      if (touch == null) {
        return;
      }

      const started = beginDrag({
        x: touch.clientX,
        y: touch.clientY,
        time: event.timeStamp,
      });

      if (started) {
        event.preventDefault();
      }
    },
    { passive: false },
  );

  window.addEventListener("pointermove", (event) => {
    moveDrag({
      x: event.clientX,
      y: event.clientY,
      time: event.timeStamp,
    });
  });

  window.addEventListener("pointerup", (event) => {
    finishDrag(event.timeStamp);
  });

  window.addEventListener("mouseup", (event) => {
    finishDrag(event.timeStamp);
  });

  window.addEventListener(
    "touchmove",
    (event) => {
      const touch = event.changedTouches[0];
      if (touch == null) {
        return;
      }

      moveDrag({
        x: touch.clientX,
        y: touch.clientY,
        time: event.timeStamp,
      });

      if (state.drag != null) {
        event.preventDefault();
      }
    },
    { passive: false },
  );

  window.addEventListener("touchend", (event) => {
    finishDrag(event.timeStamp);
  });

  window.addEventListener("touchcancel", (event) => {
    finishDrag(event.timeStamp);
  });

  cardElement.addEventListener("dragstart", (event) => {
    event.preventDefault();
  });
}

function handleResize() {
  state.corners = getCornerPositions({
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
  });

  if (state.drag != null) {
    render();
    return;
  }

  const nextCorner = state.corners[state.activeCornerId];
  state.x.dest = nextCorner.x;
  state.y.dest = nextCorner.y;

  if (isSettled()) {
    state.x.pos = nextCorner.x;
    state.y.pos = nextCorner.y;
  }

  render();
  ensureAnimationLoop();
}

function beginDrag(point) {
  const cardRect = {
    left: state.x.pos,
    top: state.y.pos,
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
  };

  if (!pointInRect(point, cardRect)) {
    return false;
  }

  state.drag = {
    offsetX: point.x - cardRect.left,
    offsetY: point.y - cardRect.top,
  };
  state.pointer = { x: point.x, y: point.y };
  state.pointerSamples = [{ x: point.x, y: point.y, time: point.time }];
  state.restPoint = null;
  state.x.vel = 0;
  state.y.vel = 0;
  cardElement.style.cursor = "grabbing";

  setDraggedCardPosition(point.x, point.y);
  render();
  ensureAnimationLoop();
  return true;
}

function moveDrag(point) {
  if (state.drag == null) {
    return;
  }

  state.pointer = { x: point.x, y: point.y };
  recordPointerSample(point);
  setDraggedCardPosition(point.x, point.y);
  render();
}

function finishDrag(releaseTime) {
  if (state.drag == null) {
    return false;
  }

  const velocity = estimateReleaseVelocity({
    samples: state.pointerSamples,
    releaseTime,
    recentWindowMs: RECENT_POINTER_WINDOW_MS,
  });
  const currentPosition = { x: state.x.pos, y: state.y.pos };
  const restPoint = getDecayRestPosition({
    position: currentPosition,
    velocity,
    friction: DECAY_FRICTION,
  });
  const chosenCornerId = pickNearestCorner(restPoint, state.corners);
  const chosenCorner = state.corners[chosenCornerId];

  state.drag = null;
  state.pointer = state.pointerSamples[state.pointerSamples.length - 1] ?? null;
  state.restPoint = restPoint;
  state.chosenCornerId = chosenCornerId;
  state.activeCornerId = chosenCornerId;
  state.x.vel = velocity.x;
  state.y.vel = velocity.y;
  state.x.dest = chosenCorner.x;
  state.y.dest = chosenCorner.y;
  cardElement.style.cursor = "grab";

  render();
  ensureAnimationLoop();
  return true;
}

function setDraggedCardPosition(pointerX, pointerY) {
  const dragX = pointerX - state.drag.offsetX;
  const dragY = pointerY - state.drag.offsetY;

  state.x.pos = state.x.dest = dragX;
  state.y.pos = state.y.dest = dragY;
}

function recordPointerSample(point) {
  state.pointerSamples.push({ x: point.x, y: point.y, time: point.time });

  if (state.pointerSamples.length > 20) {
    state.pointerSamples.shift();
  }
}

function ensureAnimationLoop() {
  if (state.frameId != null) {
    return;
  }

  state.accumulatorMs = 0;
  state.lastFrameTime = performance.now();
  state.frameId = window.requestAnimationFrame(onAnimationFrame);
}

function onAnimationFrame(frameTime) {
  const elapsedMs = Math.min(frameTime - state.lastFrameTime, 48);
  state.lastFrameTime = frameTime;
  state.accumulatorMs += elapsedMs;

  while (state.accumulatorMs >= MS_PER_ANIMATION_STEP) {
    advanceFixedStep();
    state.accumulatorMs -= MS_PER_ANIMATION_STEP;
  }

  render();

  if (state.drag != null || !isSettled()) {
    state.frameId = window.requestAnimationFrame(onAnimationFrame);
    return;
  }

  state.frameId = null;
}

function advanceFixedStep() {
  if (state.drag != null) {
    return;
  }

  const dtSeconds = MS_PER_ANIMATION_STEP / 1000;
  stepSpring(state.x, dtSeconds);
  stepSpring(state.y, dtSeconds);

  if (isSettled()) {
    state.x.pos = state.x.dest;
    state.y.pos = state.y.dest;
    state.x.vel = 0;
    state.y.vel = 0;
  }
}

function isSettled() {
  return isSpringSettled(state.x) && isSpringSettled(state.y);
}

function render() {
  const cardX = state.x.pos;
  const cardY = state.y.pos;

  cardElement.style.transform = `translate3d(${cardX}px, ${cardY}px, 0)`;

  for (const markerElement of cornerMarkerElements) {
    const cornerId = markerElement.dataset.corner;
    const corner = state.corners[cornerId];
    markerElement.style.transform = `translate3d(${corner.x}px, ${corner.y}px, 0)`;
  }

  if (state.restPoint == null) {
    restMarkerElement.hidden = true;
  } else {
    restMarkerElement.hidden = false;
    restMarkerElement.style.transform = `translate3d(${state.restPoint.x}px, ${state.restPoint.y}px, 0)`;
  }
}

async function runScenario(name) {
  switch (name) {
    case "drag-hold":
      await runDragHoldScenario();
      return;
    case "flick-upper-right":
      await runFlickUpperRightScenario();
      return;
    case "release-lower-right":
      await runReleaseLowerRightScenario();
      return;
    default:
      throw new Error(`Unknown scenario: ${name}`);
  }
}

async function runDragHoldScenario() {
  beginDragOrThrow(getScenarioStartPoint(0));
  moveDrag({ x: 242, y: 184, time: 160 });
  await nextFrame();

  publishReport({
    phase: "ready",
    dragging: state.drag != null,
    pointer: roundPoint(state.pointer),
    pointerError: getPointerErrorReport(),
  });
}

async function runFlickUpperRightScenario() {
  beginDragOrThrow(getScenarioStartPoint(0));
  moveDrag({ x: 160, y: 260, time: 80 });
  moveDrag({ x: 255, y: 172, time: 160 });
  moveDrag({ x: 275, y: 160, time: 220 });
  moveDrag({ x: 282, y: 154, time: 260 });
  finishDrag(260);
  advanceUntilSettled();
  await nextFrame();

  publishReport({
    phase: "ready",
    chosenCornerId: state.chosenCornerId,
    settledCornerId: getSettledCornerId(),
    restPoint: roundPoint(state.restPoint),
    restMarkerVisible: !restMarkerElement.hidden,
  });
}

async function runReleaseLowerRightScenario() {
  beginDragOrThrow(getScenarioStartPoint(0));
  moveDrag({ x: 180, y: 300, time: 80 });
  moveDrag({ x: 323, y: 266.8, time: 160 });
  moveDrag({ x: 332, y: 274, time: 260 });
  finishDrag(260);
  advanceUntilSettled();
  await nextFrame();

  publishReport({
    phase: "ready",
    chosenCornerId: state.chosenCornerId,
    settledCornerId: getSettledCornerId(),
    restPoint: roundPoint(state.restPoint),
    restMarkerVisible: !restMarkerElement.hidden,
  });
}

function advanceUntilSettled(maxIterations = 2000) {
  let iterations = 0;

  while (!isSettled() && iterations < maxIterations) {
    advanceFixedStep();
    render();
    iterations += 1;
  }

  if (!isSettled()) {
    throw new Error("Animation did not settle");
  }
}

function getScenarioStartPoint(time) {
  return {
    x: state.x.pos + 42,
    y: state.y.pos + 34,
    time,
  };
}

function beginDragOrThrow(point) {
  if (!beginDrag(point)) {
    throw new Error("Scenario could not start dragging from the current PiP position");
  }
}

function getPointerErrorReport() {
  const rect = cardElement.getBoundingClientRect();
  const pointerX = state.pointer?.x ?? 0;
  const pointerY = state.pointer?.y ?? 0;
  const offsetX = state.drag?.offsetX ?? 0;
  const offsetY = state.drag?.offsetY ?? 0;

  return {
    x: Math.round(pointerX - (rect.left + offsetX)),
    y: Math.round(pointerY - (rect.top + offsetY)),
  };
}

function getSettledCornerId() {
  return pickNearestCorner({ x: state.x.pos, y: state.y.pos }, state.corners);
}

function publishReport(partialReport) {
  if (scenario === "" && requestId === "") {
    return;
  }

  state.report = {
    requestId,
    scenario,
    ...state.report,
    ...partialReport,
  };
  window.location.hash = `report=${encodeURIComponent(JSON.stringify(state.report))}`;
}

function nextFrame() {
  return new Promise((resolve) => {
    window.requestAnimationFrame(() => resolve());
  });
}
