import { chromium, type Browser } from 'playwright'

export type ScenarioReport = {
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

const DEMO_DIR = '/Users/chenglou/github/vibescript/demos_with_specs/photo-gallery/thin-level-2-thin'
const DEMO_ENTRY = `${DEMO_DIR}/index.html`
const REPORT_SELECTOR = '#test-report'
const LOOPBACK_HOSTS = ['127.0.0.1', 'localhost', '[::1]']

type DemoServer = {
  baseUrl: string
  stop: () => Promise<void>
}

async function waitForLoopbackBaseUrl(port: number): Promise<string> {
  const startedAt = Date.now()

  while (Date.now() - startedAt < 10_000) {
    for (const host of LOOPBACK_HOSTS) {
      const candidate = `http://${host}:${port}`
      try {
        const response = await fetch(candidate)
        if (response.ok) {
          return candidate
        }
      } catch {}
    }

    await Bun.sleep(100)
  }

  throw new Error(`Timed out waiting for a reachable loopback host on port ${port}`)
}

export async function startDemoServer(): Promise<DemoServer> {
  const port = 34_000 + Math.floor(Math.random() * 1_000)
  const server = Bun.spawn(['bun', '--port', String(port), '--no-hmr', DEMO_ENTRY], {
    cwd: DEMO_DIR,
    stdout: 'ignore',
    stderr: 'pipe',
  })

  try {
    const baseUrl = await waitForLoopbackBaseUrl(port)
    return {
      baseUrl,
      stop: async () => {
        server.kill()
        await server.exited
      },
    }
  } catch (error) {
    server.kill()
    const stderr = await new Response(server.stderr).text()
    const suffix = stderr.trim().length > 0 ? `\n${stderr.trim()}` : ''
    throw new Error(`${String(error)}${suffix}`)
  }
}

async function waitForScenarioReport(
  browser: Browser,
  baseUrl: string,
  scenario: string,
  viewport: {width: number; height: number} = {width: 1_440, height: 900},
): Promise<ScenarioReport> {
  const requestId = crypto.randomUUID()
  const page = await browser.newPage({viewport})
  const url = `${baseUrl}?scenario=${encodeURIComponent(scenario)}&requestId=${encodeURIComponent(requestId)}`

  try {
    await page.goto(url, {waitUntil: 'domcontentloaded'})
    await page.waitForFunction(
      ({reportSelector, requestId}) => {
        const reportNode = document.querySelector<HTMLScriptElement>(reportSelector)
        if (reportNode === null) {
          return false
        }

        try {
          const report = JSON.parse(reportNode.textContent ?? '') as {requestId?: string; phase?: string}
          return report.requestId === requestId && (report.phase === 'ready' || report.phase === 'error')
        } catch {
          return false
        }
      },
      {reportSelector: REPORT_SELECTOR, requestId},
      {timeout: 35_000},
    )

    const reportJson = await page.locator(REPORT_SELECTOR).textContent()
    if (reportJson === null) {
      throw new Error(`Scenario ${scenario} did not publish a report`)
    }

    const report = JSON.parse(reportJson) as ScenarioReport
    if (report.phase === 'error') {
      throw new Error(report.message ?? `Scenario ${scenario} failed`)
    }

    return report
  } finally {
    await page.close()
  }
}

export async function runBrowserScenario(
  server: DemoServer,
  scenario: string,
  viewport?: {width: number; height: number},
): Promise<ScenarioReport> {
  const browser = await chromium.launch({headless: true})

  try {
    return await waitForScenarioReport(browser, server.baseUrl, scenario, viewport)
  } finally {
    await browser.close()
  }
}
