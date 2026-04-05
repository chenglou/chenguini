export type BrowserReportResult = Record<string, boolean | number | string | null>

export type BrowserReport = {
  phase: 'running' | 'ready'
  requestId: string
  scenario: string
  result: BrowserReportResult
}

export type GalleryHashState = {
  focusId: string | null
  report: BrowserReport | null
}

function getHashParams(hash: string) {
  const trimmed = hash.startsWith('#') ? hash.slice(1) : hash
  return new URLSearchParams(trimmed)
}

export function parseGalleryHash(hash: string): GalleryHashState {
  const params = getHashParams(hash)
  const focusId = params.get('focus')

  const phase = params.get('phase')
  const requestId = params.get('requestId')
  const scenario = params.get('scenario')
  const encodedResult = params.get('result')

  let report: BrowserReport | null = null
  if (
    (phase === 'running' || phase === 'ready')
    && requestId !== null
    && scenario !== null
    && encodedResult !== null
  ) {
    try {
      report = {
        phase,
        requestId,
        scenario,
        result: JSON.parse(encodedResult) as BrowserReportResult,
      }
    } catch {
      report = null
    }
  }

  return {
    focusId,
    report,
  }
}

export function formatGalleryHash({ focusId, report }: GalleryHashState) {
  const params = new URLSearchParams()

  if (focusId !== null) {
    params.set('focus', focusId)
  }

  if (report !== null) {
    params.set('phase', report.phase)
    params.set('requestId', report.requestId)
    params.set('scenario', report.scenario)
    params.set('result', JSON.stringify(report.result))
  }

  const query = params.toString()
  return query === '' ? '' : `#${query}`
}
