import { mountDraggableCards, type DraggableCardsApp } from "./app"
import type { CardId } from "./logic"

type Report = {
  phase: "loading" | "running" | "ready" | "error"
  requestId: string
  scenario: string
  orderedCardIds?: string[]
  orderBeforeRelease?: string[]
  lastDraggedId?: string | null
  message?: string
  settleTopCardIds?: string[]
}

const root = document.querySelector<HTMLElement>("#app")

if (root === null) {
  throw new Error("Missing #app mount point")
}

const app = mountDraggableCards(root)

const searchParams = new URLSearchParams(location.search)
const scenario = searchParams.get("scenario") ?? ""
const requestId = searchParams.get("requestId") ?? ""

if (scenario !== "" && requestId !== "") {
  void runScenario(scenario, requestId)
}

async function runScenario(scenarioName: string, requestIdValue: string) {
  publishReport({
    phase: "loading",
    requestId: requestIdValue,
    scenario: scenarioName,
  })

  await nextFrame()

  publishReport({
    phase: "running",
    requestId: requestIdValue,
    scenario: scenarioName,
  })

  try {
    const result = await executeScenario(app, scenarioName)
    publishReport({
      ...result,
      phase: "ready",
      requestId: requestIdValue,
      scenario: scenarioName,
    })
  } catch (error) {
    publishReport({
      message: error instanceof Error ? error.message : String(error),
      phase: "error",
      requestId: requestIdValue,
      scenario: scenarioName,
    })
  }
}

function publishReport(report: Report) {
  location.hash = `report=${encodeURIComponent(JSON.stringify(report))}`
}

async function executeScenario(appInstance: DraggableCardsApp, scenarioName: string) {
  switch (scenarioName) {
    case "scripted-drag":
      return runScriptedDragScenario(appInstance)
    case "release-depth":
      return runReleaseDepthScenario(appInstance)
    default:
      throw new Error(`Unknown scenario ${scenarioName}`)
  }
}

async function runScriptedDragScenario(appInstance: DraggableCardsApp) {
  const draggedCardId: CardId = "card-0"
  const startFrame = appInstance.getCardFrame(draggedCardId)
  const slotMidpoints = appInstance.getSlotMidpoints()
  const targetMidpoint = slotMidpoints.find((slot) => slot.cardId === "card-2")?.midpointY

  if (targetMidpoint === undefined) {
    throw new Error("Missing midpoint for card-2")
  }

  const startPointerX = startFrame.x + startFrame.width / 2
  const startPointerY = startFrame.y + startFrame.height / 2
  const endPointerY = targetMidpoint + 20

  appInstance.beginScriptedDrag({
    cardId: draggedCardId,
    pointerId: 1,
    pointerX: startPointerX,
    pointerY: startPointerY,
  })

  await stepPointerLine(appInstance, {
    endX: startPointerX + 40,
    endY: endPointerY,
    pointerId: 1,
    startX: startPointerX,
    startY: startPointerY,
    steps: 7,
  })

  const orderBeforeRelease = appInstance.getOrderedCardIds()

  appInstance.endScriptedDrag({
    pointerId: 1,
    pointerX: startPointerX + 40,
    pointerY: endPointerY,
  })

  await appInstance.waitForSettle()

  return {
    lastDraggedId: draggedCardId,
    orderBeforeRelease,
    orderedCardIds: appInstance.getOrderedCardIds(),
  }
}

async function runReleaseDepthScenario(appInstance: DraggableCardsApp) {
  const draggedCardId: CardId = "card-1"
  const startFrame = appInstance.getCardFrame(draggedCardId)
  const startPointerX = startFrame.x + startFrame.width / 2
  const startPointerY = startFrame.y + startFrame.height / 2
  const endPointerX = startPointerX + 220
  const endPointerY = startPointerY + 130

  appInstance.beginScriptedDrag({
    cardId: draggedCardId,
    pointerId: 2,
    pointerX: startPointerX,
    pointerY: startPointerY,
  })

  await stepPointerLine(appInstance, {
    endX: endPointerX,
    endY: endPointerY,
    pointerId: 2,
    startX: startPointerX,
    startY: startPointerY,
    steps: 6,
  })

  appInstance.endScriptedDrag({
    pointerId: 2,
    pointerX: endPointerX,
    pointerY: endPointerY,
  })

  const settleTopCardIds: string[] = []

  while (appInstance.isSettling()) {
    settleTopCardIds.push(appInstance.getTopCardId() ?? "none")
    await nextFrame()
  }

  await appInstance.waitForSettle()

  return {
    lastDraggedId: draggedCardId,
    orderedCardIds: appInstance.getOrderedCardIds(),
    settleTopCardIds,
  }
}

async function stepPointerLine(
  appInstance: DraggableCardsApp,
  args: {
    endX: number
    endY: number
    pointerId: number
    startX: number
    startY: number
    steps: number
  },
) {
  const { endX, endY, pointerId, startX, startY, steps } = args

  for (let stepIndex = 1; stepIndex <= steps; stepIndex += 1) {
    const progress = stepIndex / steps

    appInstance.moveScriptedDrag({
      pointerId,
      pointerX: startX + (endX - startX) * progress,
      pointerY: startY + (endY - startY) * progress,
    })

    await delay(16)
  }
}

function nextFrame() {
  return new Promise<void>((resolve) => {
    requestAnimationFrame(() => resolve())
  })
}

function delay(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms)
  })
}
