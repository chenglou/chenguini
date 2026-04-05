import type { PhotoGalleryApp } from './photo-gallery-app'
import { photoGalleryData } from './photo-gallery-data'

type ScenarioName =
  | 'navigation-flow'
  | 'caption-selection'
  | 'dismiss-restore'
  | 'occlusion-mounted-count'

async function waitForCondition(
  app: PhotoGalleryApp,
  check: () => boolean,
  label: string,
) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    if (check()) {
      return
    }
    await app.nextFrame()
  }

  throw new Error(`Timed out waiting for ${label}`)
}

function getScenarioRequest() {
  const params = new URLSearchParams(window.location.search)
  const scenario = params.get('scenario')
  const requestId = params.get('requestId')

  if (
    requestId === null
    || scenario === null
    || ![
      'navigation-flow',
      'caption-selection',
      'dismiss-restore',
      'occlusion-mounted-count',
    ].includes(scenario)
  ) {
    return null
  }

  return {
    scenario: scenario as ScenarioName,
    requestId,
  }
}

async function runNavigationFlow(app: PhotoGalleryApp) {
  const startId = photoGalleryData[7].id

  app.getScrollViewport().scrollTop = 0
  await app.nextFrame()

  app.getCardImageButton(startId)?.click()
  await app.nextFrame()

  app.getLineHitTarget('next').click()
  await app.nextFrame()

  return {
    mode: app.getMode(),
    focusedId: app.getFocusedId(),
    hashFocusId: app.getHashFocusId(),
  }
}

async function runCaptionSelection(app: PhotoGalleryApp) {
  const targetId = photoGalleryData[3].id

  app.getScrollViewport().scrollTop = 0
  await app.nextFrame()

  app.getCardCaption(targetId)?.click()
  await app.nextFrame()

  return {
    mode: app.getMode(),
    hashFocusId: app.getHashFocusId(),
    selectedText: window.getSelection()?.toString() ?? '',
  }
}

async function runDismissRestore(app: PhotoGalleryApp) {
  const targetId = photoGalleryData[13].id
  const viewport = app.getScrollViewport()

  viewport.scrollTop = Math.max(0, app.getRowTop(targetId) - 260)
  await waitForCondition(app, () => app.getCardImageButton(targetId) !== null, 'dismiss target card mount')

  app.getCardImageButton(targetId)?.click()
  await waitForCondition(app, () => app.getFocusedId() === targetId, 'line mode focus')

  app.getLineHitTarget('dismiss').click()
  await app.nextFrame()

  return {
    mode: app.getMode(),
    rowTopViewport: app.getRowViewportTop(targetId),
  }
}

async function runOcclusionReport(app: PhotoGalleryApp) {
  app.getScrollViewport().scrollTop = 0
  await app.nextFrame()

  const visibleRowRange = app.getVisibleRowRange()

  return {
    mountedCount: app.getMountedCount(),
    photoCount: app.getPhotoCount(),
    visibleStartRow: visibleRowRange?.[0] ?? null,
    visibleEndRow: visibleRowRange?.[1] ?? null,
  }
}

export async function runScenarioIfRequested(app: PhotoGalleryApp) {
  const request = getScenarioRequest()
  if (request === null) {
    return
  }

  app.publishReport({
    phase: 'running',
    requestId: request.requestId,
    scenario: request.scenario,
    result: {},
  })

  await app.nextFrame()

  try {
    const result = request.scenario === 'navigation-flow'
      ? await runNavigationFlow(app)
      : request.scenario === 'caption-selection'
        ? await runCaptionSelection(app)
        : request.scenario === 'dismiss-restore'
          ? await runDismissRestore(app)
          : await runOcclusionReport(app)

    app.publishReport({
      phase: 'ready',
      requestId: request.requestId,
      scenario: request.scenario,
      result,
    })
  } catch (error) {
    app.publishReport({
      phase: 'ready',
      requestId: request.requestId,
      scenario: request.scenario,
      result: {
        error: error instanceof Error ? error.message : 'Unknown scenario failure',
      },
    })
  }
}
