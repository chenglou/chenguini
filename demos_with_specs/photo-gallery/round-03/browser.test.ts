import {afterAll, beforeAll, describe, expect, test} from 'bun:test'

import {photoGalleryData} from './data'

const chromeBinary = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const roundDir = '/Users/chenglou/github/vibescript/demos_with_specs/photo-gallery/round-03'
const port = 34803
const serverUrl = `http://localhost:${port}/index.html`

type SemanticStep = {
  mode: string
  focusedId: string | null
  hash: string
}

type SemanticReport = {
  status: 'loading' | 'ready' | 'error'
  requestId: string
  scenario: string | null
  mode: 'grid' | 'line'
  focusedId: string | null
  hash: string
  cursor: string
  visibleIds: string[]
  firstVisibleId: string | null
  scrollTop: number
  steps: SemanticStep[]
  scrollTopBeforeOpen?: number
  scrollTopDuringLockAttempt?: number
  focusedRowTopAfterDismiss?: number
  dismissedFocusedId?: string
}

let serverProcess: Bun.Subprocess | null = null

beforeAll(async () => {
  serverProcess = Bun.spawn(['bun', '--port', String(port), '--no-hmr', `${roundDir}/index.html`], {
    cwd: roundDir,
    stdout: 'pipe',
    stderr: 'pipe',
  })
  await waitForServer()
})

afterAll(() => {
  serverProcess?.kill()
})

describe('browser-backed semantic checks', () => {
  test('navigation flow keeps hash routing and history in sync', async () => {
    const report = await runScenario('navigation')
    expect(report.status).toBe('ready')
    expect(report.mode).toBe('line')
    expect(report.focusedId).toBe(photoGalleryData[1]!.id)
    expect(report.hash).toBe(`#${encodeURIComponent(photoGalleryData[1]!.id)}`)
    expect(report.steps).toEqual([
      {mode: 'grid', focusedId: null, hash: ''},
      {mode: 'line', focusedId: photoGalleryData[0]!.id, hash: `#${encodeURIComponent(photoGalleryData[0]!.id)}`},
      {mode: 'line', focusedId: photoGalleryData[1]!.id, hash: `#${encodeURIComponent(photoGalleryData[1]!.id)}`},
      {mode: 'line', focusedId: photoGalleryData[0]!.id, hash: `#${encodeURIComponent(photoGalleryData[0]!.id)}`},
      {mode: 'line', focusedId: photoGalleryData[1]!.id, hash: `#${encodeURIComponent(photoGalleryData[1]!.id)}`},
    ])
  }, 30000)

  test('dismiss-to-row keeps scroll locked in line mode and restores the focused row', async () => {
    const report = await runScenario('dismiss-to-row')
    expect(report.status).toBe('ready')
    expect(report.mode).toBe('grid')
    expect(report.hash).toBe('')
    expect(report.scrollTopBeforeOpen).toBeGreaterThan(200)
    expect(report.scrollTopDuringLockAttempt).toBe(report.scrollTopBeforeOpen)
    expect(report.focusedRowTopAfterDismiss).toBeGreaterThanOrEqual(20)
    expect(report.focusedRowTopAfterDismiss).toBeLessThanOrEqual(110)
    expect(report.visibleIds).toContain(report.dismissedFocusedId)
  }, 30000)
})

async function waitForServer() {
  const startedAt = Date.now()
  while (Date.now() - startedAt < 10_000) {
    try {
      const response = await fetch(serverUrl)
      if (response.ok) return
    } catch {
      // The server is still starting.
    }
    await Bun.sleep(100)
  }
  throw new Error('Timed out waiting for the round-03 server to start.')
}

async function runScenario(scenario: string): Promise<SemanticReport> {
  const requestId = `${scenario}-${Date.now()}`
  const url = `${serverUrl}?scenario=${encodeURIComponent(scenario)}&requestId=${encodeURIComponent(requestId)}`
  const userDataDir = `/tmp/vibescript-round-03-${requestId}`
  const shellScript = `
output=$(mktemp)
errors=$(mktemp)
"${chromeBinary}" \
  --headless=new \
  --disable-gpu \
  --no-first-run \
  --no-default-browser-check \
  --run-all-compositor-stages-before-draw \
  --virtual-time-budget=6000 \
  --dump-dom \
  --user-data-dir="${userDataDir}" \
  "${url}" >"$output" 2>"$errors" &
pid=$!
for _ in {1..160}; do
  if rg -q '"status":"ready"' "$output"; then
    kill $pid >/dev/null 2>&1 || true
    wait $pid >/dev/null 2>&1 || true
    cat "$output"
    exit 0
  fi
  if rg -q '"status":"error"' "$output"; then
    kill $pid >/dev/null 2>&1 || true
    wait $pid >/dev/null 2>&1 || true
    cat "$output"
    exit 0
  fi
  sleep 0.1
done
kill $pid >/dev/null 2>&1 || true
wait $pid >/dev/null 2>&1 || true
cat "$output"
echo 'Timed out waiting for Chrome to emit a terminal semantic report.' >&2
cat "$errors" >&2
exit 1
`
  const proc = Bun.spawn(['/bin/zsh', '-lc', shellScript], {stdout: 'pipe', stderr: 'pipe'})
  const html = await new Response(proc.stdout).text()
  const stderr = await new Response(proc.stderr).text()
  const exitCode = await proc.exited
  if (exitCode !== 0) {
    throw new Error(`Chrome scenario failed (${scenario}): ${stderr}`)
  }

  const reportMatch = html.match(/id="semantic-report"[^>]*data-report="([^"]+)"/)
  if (reportMatch == null) {
    throw new Error(`Missing semantic report for ${scenario}. stderr:\n${stderr}\nhtml:\n${html}`)
  }

  const json = decodeURIComponent(reportMatch[1]!)
  return JSON.parse(json) as SemanticReport
}
