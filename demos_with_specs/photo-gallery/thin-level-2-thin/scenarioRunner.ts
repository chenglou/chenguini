import { photoGalleryData } from './data'
import { hashForPhoto } from './model'
import type { PhotoGalleryApp } from './app'

type ScenarioReport = {
  phase: 'loading' | 'running' | 'ready' | 'error'
  requestId: string
  scenario: string
  message?: string
  mode?: 'grid' | 'line'
  openedHash?: string
  advancedHash?: string
  programmaticFocusId?: string | null
  clearedHash?: string
  selectedText?: string
  mountedCount?: number
  totalCount?: number
  visibleRowRange?: [number, number]
  restoredTop?: number
  restoreDelta?: number
}

const reportNode = document.querySelector<HTMLScriptElement>('#test-report')

function publishReport(report: ScenarioReport) {
  if (reportNode !== null) {
    reportNode.textContent = JSON.stringify(report)
  }
}

async function runScenario(scenario: string, app: PhotoGalleryApp): Promise<Omit<ScenarioReport, 'phase' | 'requestId' | 'scenario'>> {
  await app.waitForPaint()

  if (scenario === 'hash-sync') {
    app.clickGridImage(photoGalleryData[0]!.id)
    await app.waitForPaint()
    const openedHash = window.location.hash

    app.clickLineZone('next')
    await app.waitForPaint()
    const advancedHash = window.location.hash

    window.location.hash = hashForPhoto(photoGalleryData[5]!.id)
    await app.waitForPaint()
    const programmaticFocusId = app.getSnapshot().focusId

    app.clickLineZone('dismiss')
    await app.waitForPaint()

    return {
      mode: app.getSnapshot().mode,
      openedHash,
      advancedHash,
      programmaticFocusId,
      clearedHash: window.location.hash,
    }
  }

  if (scenario === 'caption-selection') {
    app.clickGridCaption(photoGalleryData[0]!.id)
    await app.waitForPaint()

    return {
      mode: app.getSnapshot().mode,
      selectedText: window.getSelection()?.toString() ?? '',
      clearedHash: window.location.hash,
    }
  }

  if (scenario === 'dismiss-restore') {
    const targetPhoto = photoGalleryData[16]!
    await app.scrollPhotoRowIntoView(targetPhoto.id, 180)
    app.clickGridImage(targetPhoto.id)
    await app.waitForPaint()
    app.clickLineZone('dismiss')
    await app.waitForPaint()

    const restoredTop = app.getGridCardTop(targetPhoto.id)
    return {
      mode: app.getSnapshot().mode,
      restoredTop,
      restoreDelta: Math.abs(restoredTop - 40),
    }
  }

  if (scenario === 'occlusion') {
    await app.scrollPhotoRowIntoView(photoGalleryData[18]!.id, 120)
    const snapshot = app.getSnapshot()
    return {
      mode: snapshot.mode,
      mountedCount: snapshot.mountedCount,
      totalCount: snapshot.totalCount,
      visibleRowRange: snapshot.visibleRowRange ?? undefined,
    }
  }

  throw new Error(`Unknown scenario: ${scenario}`)
}

export function runRequestedScenario(app: PhotoGalleryApp) {
  const params = new URLSearchParams(window.location.search)
  const scenario = params.get('scenario')
  const requestId = params.get('requestId')

  if (scenario === null || requestId === null || scenario.length === 0 || requestId.length === 0) {
    return
  }

  publishReport({phase: 'loading', requestId, scenario})

  queueMicrotask(async () => {
    publishReport({phase: 'running', requestId, scenario})

    try {
      const scenarioFields = await runScenario(scenario, app)
      publishReport({
        phase: 'ready',
        requestId,
        scenario,
        ...scenarioFields,
      })
    } catch (error) {
      publishReport({
        phase: 'error',
        requestId,
        scenario,
        message: error instanceof Error ? error.message : String(error),
      })
    }
  })
}
