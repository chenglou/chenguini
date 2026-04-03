import {photoGalleryData} from './data'
import {PhotoGalleryApp} from './app'

type ScenarioReport = Record<string, unknown> & {
  phase: 'loading' | 'running' | 'ready' | 'error'
  requestId: string | null
}

const params = new URL(window.location.href).searchParams
const scenario = params.get('scenario')
const requestId = params.get('requestId')
const reportNode = document.getElementById('scenario-report')
const root = document.getElementById('app-root')

function publishReport(report: ScenarioReport) {
  if (reportNode == null) return
  reportNode.textContent = JSON.stringify(report)
}

function elementClickCenter(element: Element) {
  if (!(element instanceof HTMLElement)) return
  const rect = element.getBoundingClientRect()
  const clientX = rect.left + rect.width / 2
  const clientY = rect.top + rect.height / 2
  element.dispatchEvent(
    new MouseEvent('click', {
      bubbles: true,
      clientX,
      clientY,
    }),
  )
}

async function runScenario(app: PhotoGalleryApp, scenarioName: string) {
  publishReport({phase: 'running', requestId, status: 'running', scenario: scenarioName})
  if (scenarioName === 'navigation-flow') {
    const openedId = photoGalleryData[8]!.id
    const expectedRightId = photoGalleryData[9]!.id
    const startedInGrid = app.getSnapshot().focusedId == null
    app.focusPhoto(openedId)
    await app.waitFor(() => app.getSnapshot().focusedId === openedId)
    await app.waitForFrames(8)

    const hashAfterOpen = window.location.hash
    const scrollLockedInLineMode = app.getSnapshot().scrollLocked

    app.focusRelative(1)
    await app.waitFor(() => app.getSnapshot().focusedId === expectedRightId)
    await app.waitForFrames(8)

    const afterRightId = app.getSnapshot().focusedId

    app.focusRelative(-1)
    await app.waitFor(() => app.getSnapshot().focusedId === openedId)
    await app.waitForFrames(8)

    const afterLeftId = app.getSnapshot().focusedId

    app.focusPhoto(null)
    await app.waitFor(() => app.getSnapshot().focusedId == null)
    await app.waitForFrames(8)

    publishReport({
      phase: 'ready',
      requestId,
      status: 'ok',
      startedInGrid,
      openedId,
      expectedOpenedId: openedId,
      expectedRightId,
      afterRightId,
      afterLeftId,
      scrollLockedInLineMode,
      hashAfterOpen,
      hashAfterDismiss: window.location.hash,
    })
    return
  }

  if (scenarioName === 'dismiss-to-row') {
    const targetId = photoGalleryData[20]!.id
    app.scrollPhotoIntoView(targetId)
    await app.waitFor(() => app.getCardNode(targetId) != null)

    const targetNode = app.getCardNode(targetId)
    if (targetNode == null) throw new Error('Target card disappeared before opening')
    elementClickCenter(targetNode)
    await app.waitFor(() => app.getSnapshot().focusedId === targetId)
    await app.waitForFrames(8)

    elementClickCenter(app.getDismissSurface())
    await app.waitFor(() => app.getSnapshot().focusedId == null)
    await app.waitForFrames(8)

    const restoredNode = app.getCardNode(targetId)
    if (restoredNode == null) throw new Error('Target card is not mounted after dismiss')
    const rect = restoredNode.getBoundingClientRect()
    publishReport({
      phase: 'ready',
      requestId,
      status: 'ok',
      rowVisibleAfterDismiss: rect.top >= 0 && rect.top < window.innerHeight - 80,
      peekAboveRow: rect.top,
      hashAfterDismiss: window.location.hash,
    })
    return
  }

  if (scenarioName === 'caption-selection') {
    const targetId = photoGalleryData[2]!.id
    const captionNode = app.getCaptionNode(targetId)
    if (captionNode == null) throw new Error('Unable to find the caption node')
    elementClickCenter(captionNode)
    await new Promise((resolve) => requestAnimationFrame(resolve))
    publishReport({
      phase: 'ready',
      requestId,
      status: 'ok',
      focusedId: app.getSnapshot().focusedId,
      hashAfterClick: window.location.hash,
      selectedText: document.getSelection()?.toString() ?? '',
      expectedText: photoGalleryData[2]!.prompt,
    })
    return
  }

  throw new Error(`Unknown scenario: ${scenarioName}`)
}

if (root == null) {
  publishReport({
    phase: 'error',
    requestId,
    status: 'error',
    message: 'Missing #app-root',
  })
} else {
  const app = new PhotoGalleryApp(root, {disableRemoteImages: scenario != null})
  publishReport({phase: 'loading', requestId, status: 'booted'})
  if (scenario != null) {
    requestAnimationFrame(async () => {
      try {
        await app.waitForFrames(4)
        await runScenario(app, scenario)
      } catch (error) {
        publishReport({
          phase: 'error',
          requestId,
          status: 'error',
          message: error instanceof Error ? error.message : String(error),
        })
      }
    })
  }
}
