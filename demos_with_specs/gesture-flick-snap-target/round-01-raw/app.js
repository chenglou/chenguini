import {
  CORNER_MARKER_SIZE,
  CORNER_PAD,
  MS_PER_ANIMATION_STEP,
  PIP_HEIGHT,
  PIP_WIDTH,
  REST_MARKER_SIZE,
  createGestureModel,
} from "./gesture.js"

const params = new URLSearchParams(window.location.search)
const scenario = params.get("scenario") ?? ""
const requestId = params.get("requestId") ?? ""

const app = document.querySelector("[data-app]")
const pipCard = document.querySelector("[data-pip-card]")
const restMarker = document.querySelector("[data-rest-marker]")
const cornerMarkers = Array.from(document.querySelectorAll("[data-corner-marker]"))

const model = createGestureModel()

let frameHandle = null
let lastFrameTime = 0
let accumulatedMs = 0
let currentReport = {
  phase: "loading",
  requestId,
  scenario,
}

function publishReport(partialReport) {
  if (requestId === "" || scenario === "") {
    return
  }
  currentReport = { ...currentReport, ...partialReport }
  const hash = new URLSearchParams({
    report: encodeURIComponent(JSON.stringify(currentReport)),
  })
  window.location.hash = hash.toString()
}

function pointFromMouseLikeEvent(event) {
  return {
    x: event.pageX,
    y: event.pageY,
    time: event.timeStamp,
  }
}

function pointFromTouchEvent(event) {
  const touch =
    event.changedTouches[0] ??
    event.touches[0] ??
    null
  if (touch == null) {
    return null
  }
  return {
    x: touch.pageX,
    y: touch.pageY,
    time: event.timeStamp,
  }
}

function positionMarker(element, point, size) {
  element.style.transform = `translate3d(${point.x - size / 2}px, ${
    point.y - size / 2
  }px, 0)`
}

function render() {
  const snapshot = model.getSnapshot()

  pipCard.style.transform = `translate3d(${snapshot.position.x}px, ${snapshot.position.y}px, 0)`

  for (const element of cornerMarkers) {
    const cornerName = element.dataset.cornerMarker
    positionMarker(element, snapshot.corners[cornerName], CORNER_MARKER_SIZE)
  }

  if (snapshot.restPoint == null) {
    restMarker.hidden = true
  } else {
    restMarker.hidden = false
    positionMarker(restMarker, snapshot.restPoint, REST_MARKER_SIZE)
  }
}

function ensureFrameLoop() {
  if (frameHandle != null) {
    return
  }

  lastFrameTime = performance.now()
  const frame = (now) => {
    const elapsedMs = Math.min(now - lastFrameTime, 32)
    lastFrameTime = now
    accumulatedMs += elapsedMs

    while (accumulatedMs >= MS_PER_ANIMATION_STEP) {
      model.step(MS_PER_ANIMATION_STEP)
      accumulatedMs -= MS_PER_ANIMATION_STEP
    }

    render()

    if (model.getSnapshot().animating) {
      frameHandle = window.requestAnimationFrame(frame)
      return
    }

    frameHandle = null
  }

  frameHandle = window.requestAnimationFrame(frame)
}

function updateViewport() {
  model.setViewport(window.innerWidth, window.innerHeight)
  render()
  ensureFrameLoop()
}

function beginDrag(point) {
  const started = model.beginDrag(point)
  if (!started) {
    return false
  }
  render()
  ensureFrameLoop()
  return true
}

function moveDrag(point) {
  if (!model.moveDrag(point)) {
    return false
  }
  render()
  ensureFrameLoop()
  return true
}

function finishDrag(releaseKind, point) {
  const result = model.finishDrag(releaseKind, point)
  if (result == null) {
    return null
  }
  render()
  ensureFrameLoop()
  return result
}

function onPointerDown(event) {
  if (event.button !== 0) {
    return
  }
  if (beginDrag(pointFromMouseLikeEvent(event))) {
    event.preventDefault()
  }
}

function onMouseMove(event) {
  if (model.getSnapshot().drag.active) {
    moveDrag(pointFromMouseLikeEvent(event))
  }
}

function onMouseUp(event) {
  finishDrag("mouseup", pointFromMouseLikeEvent(event))
}

function onTouchStart(event) {
  const point = pointFromTouchEvent(event)
  if (point == null) {
    return
  }
  if (beginDrag(point)) {
    event.preventDefault()
  }
}

function onTouchMove(event) {
  const point = pointFromTouchEvent(event)
  if (point == null) {
    return
  }
  if (moveDrag(point)) {
    event.preventDefault()
  }
}

function onTouchEndLike(event, releaseKind) {
  const point = pointFromTouchEvent(event)
  finishDrag(releaseKind, point)
}

function measureCenter(element) {
  const rect = element.getBoundingClientRect()
  return {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
  }
}

function measureTopLeft(element) {
  const rect = element.getBoundingClientRect()
  return {
    x: rect.left,
    y: rect.top,
  }
}

function currentPointerPoint(offsetX, offsetY) {
  const snapshot = model.getSnapshot()
  return {
    x: snapshot.position.x + offsetX,
    y: snapshot.position.y + offsetY,
  }
}

function waitForNextPaint() {
  return new Promise((resolve) => {
    window.requestAnimationFrame(() => resolve())
  })
}

async function wait(ms) {
  await new Promise((resolve) => window.setTimeout(resolve, ms))
}

async function waitForSettled() {
  const deadline = performance.now() + 5_000
  while (performance.now() < deadline) {
    await waitForNextPaint()
    if (!model.getSnapshot().animating) {
      return
    }
  }
  throw new Error("Timed out waiting for springs to settle")
}

async function runDragPath({ offsetX, offsetY, steps, releaseKind }) {
  const startPoint = {
    ...currentPointerPoint(offsetX, offsetY),
    time: performance.now(),
  }
  if (!beginDrag(startPoint)) {
    throw new Error("Scenario pointerdown missed the current PiP position")
  }

  let maxPointerAlignmentError = 0

  for (const step of steps) {
    await wait(step.afterMs)
    moveDrag({
      x: step.x,
      y: step.y,
      time: performance.now(),
    })
    await waitForNextPaint()

    const pipRect = pipCard.getBoundingClientRect()
    const expectedLeft = step.x - offsetX
    const expectedTop = step.y - offsetY
    const dx = Math.abs(pipRect.left - expectedLeft)
    const dy = Math.abs(pipRect.top - expectedTop)
    maxPointerAlignmentError = Math.max(maxPointerAlignmentError, dx, dy)
  }

  const releaseStep = steps[steps.length - 1]
  finishDrag(releaseKind, {
    x: releaseStep.x,
    y: releaseStep.y,
    time: performance.now(),
  })
  await waitForSettled()

  return maxPointerAlignmentError
}

async function runScenario() {
  if (scenario === "") {
    return
  }

  publishReport({ phase: "loading" })
  await waitForNextPaint()
  publishReport({ phase: "running" })

  try {
    let maxPointerAlignmentError = undefined

    if (scenario === "drag-under-pointer") {
      maxPointerAlignmentError = await runDragPath({
        offsetX: 30,
        offsetY: 24,
        releaseKind: "mouseup",
        steps: [
          { afterMs: 20, x: 150, y: 560 },
          { afterMs: 20, x: 260, y: 500 },
          { afterMs: 20, x: 360, y: 420 },
        ],
      })
    } else if (scenario === "flick-upper-right") {
      await runDragPath({
        offsetX: 88,
        offsetY: 40,
        releaseKind: "touchend",
        steps: [
          { afterMs: 16, x: 220, y: 560 },
          { afterMs: 16, x: 400, y: 360 },
          { afterMs: 16, x: 620, y: 180 },
          { afterMs: 16, x: 780, y: 96 },
        ],
      })
    } else if (scenario === "release-lower-right") {
      await runDragPath({
        offsetX: 36,
        offsetY: 28,
        releaseKind: "touchcancel",
        steps: [
          { afterMs: 40, x: 180, y: 610 },
          { afterMs: 40, x: 320, y: 600 },
          { afterMs: 40, x: 460, y: 588 },
          { afterMs: 40, x: 560, y: 572 },
        ],
      })
    } else {
      throw new Error(`Unknown scenario: ${scenario}`)
    }

    const snapshot = model.getSnapshot()
    publishReport({
      phase: "ready",
      viewport: snapshot.viewport,
      releaseKind: snapshot.releaseKind,
      chosenCorner: snapshot.chosenCorner,
      finalPipPosition: measureTopLeft(pipCard),
      restPoint: snapshot.restPoint,
      restMarkerCenter: snapshot.restPoint == null ? null : measureCenter(restMarker),
      maxPointerAlignmentError,
    })
  } catch (error) {
    publishReport({
      phase: "error",
      message: error instanceof Error ? error.message : String(error),
    })
  }
}

pipCard.addEventListener("pointerdown", onPointerDown)
window.addEventListener("mousemove", onMouseMove)
window.addEventListener("mouseup", onMouseUp)
window.addEventListener("touchstart", onTouchStart, { passive: false })
window.addEventListener("touchmove", onTouchMove, { passive: false })
window.addEventListener("touchend", (event) => onTouchEndLike(event, "touchend"))
window.addEventListener("touchcancel", (event) =>
  onTouchEndLike(event, "touchcancel"),
)
window.addEventListener("resize", updateViewport)

updateViewport()
runScenario()
