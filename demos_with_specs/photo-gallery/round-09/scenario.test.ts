import {afterAll, beforeAll, describe, expect, test} from 'bun:test'
import {existsSync} from 'node:fs'

const roundDir = '/Users/chenglou/github/vibescript/demos_with_specs/photo-gallery/round-09'
const pagePath = `${roundDir}/index.html`
const port = 34803
let baseUrl = `http://localhost:${port}/`

type ScenarioReport = {
  phase: 'loading' | 'running' | 'ready' | 'error'
  requestId: string
  scenario: string
  status?: 'ok' | 'error'
  selectedText?: string
  focusedId?: string | null
  hashes?: string[]
  scrollTopBeforeDismiss?: number
  scrollTopAfterDismiss?: number
  focusedRowTopAfterDismiss?: number
  bodyOverflow?: string
  mountedCount?: number
  itemCount?: number
  message?: string
}

let serverProcess: Bun.Subprocess | null = null

beforeAll(async () => {
  serverProcess = Bun.spawn(['bun', '--port', String(port), '--no-hmr', pagePath], {
    cwd: roundDir,
    stdout: 'ignore',
    stderr: 'pipe',
  })

  const started = await waitForServer()
  if (!started) {
    const stderr = serverProcess.stderr ? await new Response(serverProcess.stderr).text() : ''
    throw new Error(`Failed to start Bun page server on ${baseUrl}\n${stderr}`)
  }
})

afterAll(() => {
  serverProcess?.kill()
})

describe('browser-backed scenarios', () => {
  test(
    'caption click selects the full prompt and stays in grid mode',
    async () => {
      const report = await runScenario('caption-selection')

      expect(report.phase).toBe('ready')
      expect(report.status).toBe('ok')
      expect(report.focusedId).toBeNull()
      expect(report.selectedText).toBe(
        'Miniature watermelon delicately balanced on fingertip',
      )
    },
    30_000,
  )

  test(
    'navigation flow updates the hash and keeps scrolling locked in line mode',
    async () => {
      const report = await runScenario('navigation-flow')

      expect(report.phase).toBe('ready')
      expect(report.status).toBe('ok')
      expect(report.hashes).toEqual([
        '#d228330c-7364-497b-994f-a37467ae436a%2F0_0',
        '#7b5301ca-ef01-44bd-8bcc-4473c945aaaf%2F0_0',
        '#d228330c-7364-497b-994f-a37467ae436a%2F0_0',
        '#7b5301ca-ef01-44bd-8bcc-4473c945aaaf%2F0_0',
        '',
      ])
      expect(report.bodyOverflow).toBe('hidden')
    },
    30_000,
  )

  test(
    'dismissing line mode returns the focused row with a small peek above it',
    async () => {
      const report = await runScenario('dismiss-to-row')

      expect(report.phase).toBe('ready')
      expect(report.status).toBe('ok')
      expect(report.scrollTopAfterDismiss).toBeLessThan(report.scrollTopBeforeDismiss ?? 0)
      expect(report.focusedRowTopAfterDismiss).toBeGreaterThanOrEqual(24)
      expect(report.focusedRowTopAfterDismiss).toBeLessThanOrEqual(64)
      expect(report.mountedCount).toBeLessThan(report.itemCount ?? 0)
    },
    30_000,
  )
})

async function waitForServer() {
  const hosts = [
    `http://localhost:${port}/`,
    `http://127.0.0.1:${port}/`,
    `http://[::1]:${port}/`,
  ]
  for (let attempt = 0; attempt < 100; attempt += 1) {
    for (const host of hosts) {
      try {
        const response = await fetch(host)
        if (response.ok) {
          baseUrl = host
          return true
        }
      } catch {}
    }
    await Bun.sleep(100)
  }
  return false
}

async function runScenario(scenario: string): Promise<ScenarioReport> {
  const browserPath = await findChromePath()
  const requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`
  const url = `${baseUrl}?scenario=${encodeURIComponent(scenario)}&requestId=${encodeURIComponent(requestId)}`
  const proc = Bun.spawn(
    [
      browserPath,
      '--headless=new',
      '--disable-gpu',
      '--disable-background-networking',
      '--disable-renderer-backgrounding',
      '--run-all-compositor-stages-before-draw',
      '--virtual-time-budget=12000',
      '--dump-dom',
      url,
    ],
    {
      cwd: roundDir,
      stdout: 'pipe',
      stderr: 'pipe',
    },
  )

  const stdout = await new Response(proc.stdout).text()
  const stderr = await new Response(proc.stderr).text()
  const exitCode = await proc.exited
  if (exitCode !== 0) {
    throw new Error(`Chrome failed for scenario ${scenario}\n${stderr}`)
  }

  const match = stdout.match(
    /<script id="scenario-report" type="application\/json">([\s\S]*?)<\/script>/,
  )
  if (!match) {
    throw new Error(`Missing scenario report for ${scenario}\n${stdout}`)
  }

  const report = JSON.parse(match[1]) as ScenarioReport
  if (report.requestId !== requestId) {
    throw new Error(`Wrong requestId for ${scenario}: ${report.requestId}`)
  }
  if (report.phase === 'error' || report.status === 'error') {
    throw new Error(report.message ?? `Scenario ${scenario} failed`)
  }

  return report
}

async function findChromePath() {
  const candidates = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ]

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate
  }

  for (const command of ['google-chrome', 'chromium', 'chromium-browser']) {
    const proc = Bun.spawn(['which', command], {stdout: 'pipe', stderr: 'ignore'})
    const output = (await new Response(proc.stdout).text()).trim()
    if ((await proc.exited) === 0 && output !== '') return output
  }

  throw new Error('Could not find a Chrome or Chromium binary for browser-backed tests.')
}
