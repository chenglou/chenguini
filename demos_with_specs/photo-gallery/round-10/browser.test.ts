import {afterAll, beforeAll, describe, expect, test} from 'bun:test'
import {existsSync} from 'node:fs'

type ScenarioReport = {
  phase: 'loading' | 'running' | 'ready' | 'error'
  requestId: string
  scenario: string
  status?: 'ok' | 'error'
  data?: {
    hashSequence?: string[]
    scrollTopBeforeLock?: number
    scrollTopDuringLock?: number
    dismissedHash?: string
    finalMode?: 'grid' | 'line'
    focusedIndex?: number
    beforeDismissVisible?: boolean
    afterDismissVisible?: boolean
    topOffset?: number
    selectedText?: string
    hashAfterClick?: string
    modeAfterClick?: 'grid' | 'line'
    mountedCount?: number
    itemCount?: number
  }
  message?: string
}

const roundDir = '/Users/chenglou/github/vibescript/demos_with_specs/photo-gallery/round-10'
const pagePath = `${roundDir}/index.html`
const port = 34810
let baseUrl = `http://localhost:${port}/`
let serverProcess: Bun.Subprocess | null = null

beforeAll(async () => {
  expect(existsSync(pagePath)).toBe(true)
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
    'navigation flow updates the hash and keeps the line-mode scroll lock active',
    async () => {
      const report = await runScenario('navigation-flow')

      expect(report.phase).toBe('ready')
      expect(report.status).toBe('ok')
      expect(report.data).toEqual({
        hashSequence: [
          '#d228330c-7364-497b-994f-a37467ae436a%2F0_0',
          '#7b5301ca-ef01-44bd-8bcc-4473c945aaaf%2F0_0',
          '#d228330c-7364-497b-994f-a37467ae436a%2F0_0',
          '#7b5301ca-ef01-44bd-8bcc-4473c945aaaf%2F0_0',
          '',
        ],
        scrollTopBeforeLock: 560,
        scrollTopDuringLock: 560,
        dismissedHash: '',
        finalMode: 'grid',
      })
    },
    30_000,
  )

  test(
    'dismissing line mode returns the focused row with a small peek above it',
    async () => {
      const report = await runScenario('dismiss-to-row')

      expect(report.phase).toBe('ready')
      expect(report.status).toBe('ok')
      expect(report.data).toEqual({
        focusedIndex: 15,
        beforeDismissVisible: false,
        afterDismissVisible: true,
        topOffset: 40,
      })
    },
    30_000,
  )

  test(
    'clicking a grid caption selects the full caption text without entering line mode',
    async () => {
      const report = await runScenario('caption-selection')

      expect(report.phase).toBe('ready')
      expect(report.status).toBe('ok')
      expect(report.data).toEqual({
        selectedText:
          'Hourglass heart, liquid, grand canyon background, fleeting, ephemerality of time',
        hashAfterClick: '',
        modeAfterClick: 'grid',
      })
    },
    30_000,
  )

  test(
    'grid occlusion mounts fewer cards than the full data set',
    async () => {
      const report = await runScenario('occlusion')

      expect(report.phase).toBe('ready')
      expect(report.status).toBe('ok')
      expect(report.data?.mountedCount).toBeLessThan(report.data?.itemCount ?? 0)
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
