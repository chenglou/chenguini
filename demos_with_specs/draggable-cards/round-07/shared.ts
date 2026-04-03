export type Phase = 'loading' | 'running' | 'ready' | 'error'

export type ScenarioName = 'swap-down' | 'release-depth'

export type ScenarioReport = {
  phase: Phase
  requestId: string
  scenario: ScenarioName
  orderedIds: number[]
  draggedId: number | null
  lastDraggedId: number | null
  swapHappened: boolean
  topVisualCardId: number | null
  releasedCardStillElevated: boolean
  releasedCardIsSettling: boolean
  error?: string
}
