import { expect, test } from 'bun:test'

const roundDir = '/Users/chenglou/github/vibescript/demos_with_specs/draggable-cards/round-03'
const port = 34804
const serverUrl = `http://localhost:${port}/index.html`

type BrowserReport = {
  status: 'ready' | 'error'
  requestId: string
  scenario: string
  phase: string
  orderedCardIds?: number[]
  draggedId?: number | null
  lastDraggedId?: number | null
  cursor?: string
  swapTriggered?: boolean
  elevatedWhileSettling?: boolean
  clearedAfterSettle?: boolean
  cardSummaries?: Array<{ id: number; x: number; y: number; zIndex: number }>
  message?: string
}

test('browser-backed drag semantics cover reorder and release depth', async () => {
  await closeSafariWindows()
  const serverProcess = Bun.spawn(['bun', '--port', String(port), '--no-hmr', 'index.html'], {
    cwd: roundDir,
    stdout: 'pipe',
    stderr: 'pipe',
  })
  await waitForServer()
  try {
    const reorderReport = await runScenario('swap-down')
    expect(reorderReport.status).toBe('ready')
    expect(reorderReport.swapTriggered).toBe(true)
    expect(reorderReport.orderedCardIds).toEqual([0, 2, 1, 3, 4])
    expect(reorderReport.cursor).toBe('auto')
    expect(reorderReport.draggedId).toBe(null)
    expect(reorderReport.lastDraggedId).toBe(null)
    expect(reorderReport.cardSummaries?.map((card) => card.id)).toEqual([0, 1, 2, 3, 4])

    const depthReport = await runScenario('release-depth')
    expect(depthReport.status).toBe('ready')
    expect(depthReport.elevatedWhileSettling).toBe(true)
    expect(depthReport.clearedAfterSettle).toBe(true)
  } finally {
    serverProcess.kill()
    await serverProcess.exited
    await closeSafariWindows()
  }
}, 30000)

async function waitForServer() {
  const startedAt = Date.now()
  while (Date.now() - startedAt < 10_000) {
    try {
      const response = await fetch(serverUrl)
      if (response.ok) return
    } catch {
      // Server still starting.
    }
    await Bun.sleep(100)
  }
  throw new Error('Timed out waiting for the draggable round-03 server to start.')
}

async function runScenario(scenario: string) {
  const requestId = `${scenario}-${Date.now()}`
  const url = `${serverUrl}?report=1&scenario=${encodeURIComponent(scenario)}&requestId=${encodeURIComponent(requestId)}`
  await openSafariWindow(url)
  try {
    return await waitForReport(requestId)
  } finally {
    await closeSafariWindows()
  }
}

async function openSafariWindow(url: string) {
  await runAppleScript(`
tell application "Safari"
  activate
  make new document with properties {URL:${toAppleScriptString(url)}}
end tell
`)
}

async function closeSafariWindows() {
  try {
    await runAppleScript(`
tell application "Safari"
  repeat while (count of windows) > 0
    close front window
  end repeat
end tell
`)
  } catch {
    // Best-effort cleanup.
  }
}

async function waitForReport(requestId: string) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < 20_000) {
    const text = (await runAppleScript(`
tell application "Safari"
  if (count of windows) = 0 then return ""
  return do JavaScript "document.getElementById('semantic-report')?.textContent ?? ''" in current tab of front window
end tell
`)).trim()

    if (text.length === 0) {
      await Bun.sleep(100)
      continue
    }

    const report = JSON.parse(text) as BrowserReport
    if (report.requestId !== requestId) {
      await Bun.sleep(100)
      continue
    }
    if (report.status === 'error') {
      throw new Error(report.message ?? `Scenario ${report.scenario} failed`)
    }
    if (report.phase !== 'ready') {
      await Bun.sleep(100)
      continue
    }
    return report
  }
  throw new Error(`Timed out waiting for report ${requestId}`)
}

async function runAppleScript(source: string) {
  const proc = Bun.spawn(['osascript', '-e', source], {
    stdout: 'pipe',
    stderr: 'pipe',
  })
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ])
  if (exitCode !== 0) {
    throw new Error(stderr.trim() || stdout.trim() || 'osascript failed')
  }
  return stdout
}

function toAppleScriptString(text: string) {
  return `"${text.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`
}
