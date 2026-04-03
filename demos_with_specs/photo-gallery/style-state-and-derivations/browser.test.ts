import {afterAll, beforeAll, describe, expect, test} from 'bun:test'
import {existsSync} from 'node:fs'
import {chromium} from 'playwright'

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

const roundDir =
  '/Users/chenglou/github/vibescript/demos_with_specs/photo-gallery/style-state-and-derivations'
const pagePath = `${roundDir}/index.html`
const port = 34811
let baseUrl = `http://localhost:${port}/`
let serverProcess: Bun.Subprocess | null = null
let browser: Awaited<ReturnType<typeof chromium.launch>> | null = null

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

  browser = await chromium.launch({
    headless: true,
    executablePath: await findChromePath(),
  })
})

afterAll(async () => {
  await browser?.close()
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
        scrollTopBeforeLock: report.data?.scrollTopBeforeLock,
        scrollTopDuringLock: report.data?.scrollTopDuringLock,
        dismissedHash: '',
        finalMode: 'grid',
      })
      expect(report.data?.scrollTopBeforeLock).toBeGreaterThan(0)
      expect(report.data?.scrollTopBeforeLock).toBe(report.data?.scrollTopDuringLock)
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
  if (browser == null) throw new Error('Browser not started')

  const requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`
  const page = await browser.newPage({viewport: {width: 1280, height: 720}})
  try {
    const url = `${baseUrl}?scenario=${encodeURIComponent(scenario)}&requestId=${encodeURIComponent(requestId)}`
    await page.goto(url, {waitUntil: 'load', timeout: 15_000})
    const report = await waitForReadyReport(page, requestId)
    if (report.phase === 'error' || report.status === 'error') {
      throw new Error(report.message ?? `Scenario ${scenario} failed`)
    }
    return report
  } finally {
    await page.close()
  }
}

async function waitForReadyReport(page: import('playwright').Page, requestId: string) {
  await page.waitForFunction(
    (expectedRequestId) => {
      const el = document.getElementById('scenario-report')
      if (el == null) return false
      const text = el.textContent
      if (text == null || text === '') return false
      try {
        const report = JSON.parse(text) as ScenarioReport
        return report.requestId === expectedRequestId && report.phase === 'ready'
      } catch {
        return false
      }
    },
    requestId,
    {timeout: 30_000},
  )

  const text = await page.locator('#scenario-report').textContent()
  if (text == null || text === '') {
    throw new Error(`Missing scenario report for requestId ${requestId}`)
  }

  const report = JSON.parse(text) as ScenarioReport
  if (report.requestId !== requestId) {
    throw new Error(`Wrong requestId for scenario: ${report.requestId}`)
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
