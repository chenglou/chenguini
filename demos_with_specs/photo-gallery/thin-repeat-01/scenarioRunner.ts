import {photoGalleryData} from './data'
import {type PhotoGalleryController} from './app'

type ScenarioReport = {
  phase: 'loading' | 'running' | 'ready' | 'error'
  requestId: string
  scenario: string
  message?: string
  focusedId?: string | null
  hashWhileOpen?: string
  hashAfterDismiss?: string
  mode?: 'grid' | 'line'
  modeWhileOpen?: 'grid' | 'line'
  modeAfterDismiss?: 'grid' | 'line'
  mountedCount?: number
  selectedText?: string
  spaceAboveRow?: number
  totalCount?: number
  visibleRowRange?: [number, number]
}

export async function runScenarioIfNeeded(controller: PhotoGalleryController) {
  const params = new URLSearchParams(window.location.search)
  const scenario = params.get('scenario') ?? ''
  const requestId = params.get('requestId') ?? ''
  if (scenario === '' || requestId === '') return

  publishReport({phase: 'loading', requestId, scenario})

  try {
    await controller.afterNextRender()
    publishReport({phase: 'running', requestId, scenario})

    switch (scenario) {
      case 'hash-sync':
        await runHashSyncScenario(controller, requestId, scenario)
        return
      case 'caption-selection':
        await runCaptionSelectionScenario(controller, requestId, scenario)
        return
      case 'dismiss-restore':
        await runDismissRestoreScenario(controller, requestId, scenario)
        return
      case 'occlusion':
        await runOcclusionScenario(controller, requestId, scenario)
        return
      default:
        throw new Error(`Unknown scenario: ${scenario}`)
    }
  } catch (error) {
    publishReport({
      phase: 'error',
      requestId,
      scenario,
      message: error instanceof Error ? error.message : String(error),
    })
  }
}

async function runHashSyncScenario(
  controller: PhotoGalleryController,
  requestId: string,
  scenario: string,
) {
  const target = photoGalleryData[10]!
  controller.openPhoto(target.id)
  await controller.afterNextRender()

  const hashWhileOpen = window.location.hash
  const modeWhileOpen = controller.getMode()

  controller.dismissLineMode()
  await controller.afterNextRender()

  publishReport({
    phase: 'ready',
    requestId,
    scenario,
    focusedId: target.id,
    hashAfterDismiss: window.location.hash,
    hashWhileOpen,
    modeAfterDismiss: controller.getMode(),
    modeWhileOpen,
  })
}

async function runCaptionSelectionScenario(
  controller: PhotoGalleryController,
  requestId: string,
  scenario: string,
) {
  const target = photoGalleryData[3]!
  controller.scrollTo(0)
  await controller.afterNextRender()
  controller.selectCaption(target.id)

  publishReport({
    phase: 'ready',
    requestId,
    scenario,
    hashAfterDismiss: window.location.hash,
    mode: controller.getMode(),
    selectedText: controller.getSelectionText(),
  })
}

async function runDismissRestoreScenario(
  controller: PhotoGalleryController,
  requestId: string,
  scenario: string,
) {
  const target = photoGalleryData[15]!
  const targetLayout = controller.getGridItemLayout(target.id)
  if (targetLayout == null) throw new Error('Target row missing before dismiss-restore.')

  controller.scrollTo(Math.max(0, targetLayout.rowTop - 220))
  await controller.afterNextRender()
  controller.openPhoto(target.id)
  await controller.afterNextRender()
  controller.dismissLineMode()
  await controller.afterNextRender()

  const restoredLayout = controller.getGridItemLayout(target.id)
  if (restoredLayout == null) throw new Error('Target row missing after dismiss-restore.')

  publishReport({
    phase: 'ready',
    requestId,
    scenario,
    focusedId: target.id,
    modeAfterDismiss: controller.getMode(),
    spaceAboveRow: restoredLayout.rowTop - controller.getScrollTop(),
  })
}

async function runOcclusionScenario(
  controller: PhotoGalleryController,
  requestId: string,
  scenario: string,
) {
  const layout = controller.getLayout()
  const representativeScrollTop = Math.max(
    0,
    layout.contentHeight * 0.5 - controller.getViewportHeight() * 0.5,
  )
  controller.scrollTo(representativeScrollTop)
  await controller.afterNextRender()

  publishReport({
    phase: 'ready',
    requestId,
    scenario,
    mountedCount: controller.getMountedCount(),
    totalCount: photoGalleryData.length,
    visibleRowRange: controller.getVisibleRowRange(),
  })
}

function publishReport(report: ScenarioReport) {
  const node = document.getElementById('scenario-report')
  if (!(node instanceof HTMLScriptElement)) {
    throw new Error('Missing #scenario-report node.')
  }
  node.textContent = JSON.stringify(report)
}
