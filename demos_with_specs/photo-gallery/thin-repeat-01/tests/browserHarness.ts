import {chromium, type Browser, type Page} from 'playwright'

export type ScenarioReport = {
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
  selectedText?: string
  totalCount?: number
  mountedCount?: number
  visibleRowRange?: [number, number]
  spaceAboveRow?: number
}

export type BrowserHarness = {
  browser: Browser
  baseUrl: string
  close: () => Promise<void>
}

const demoDir = new URL('..', import.meta.url)
const entryHtmlPath = new URL('../index.html', import.meta.url).pathname

export async function startBrowserHarness(): Promise<BrowserHarness> {
  const port = 4300 + Math.floor(Math.random() * 200)
  const bunPath = Bun.which('bun') ?? 'bun'
  const server = Bun.spawn([bunPath, '--port', String(port), '--no-hmr', entryHtmlPath], {
    cwd: demoDir.pathname,
    stdin: 'ignore',
    stdout: 'ignore',
    stderr: 'ignore',
  })

  try {
    const baseUrl = await waitForLoopbackBaseUrl(port)
    const browser = await chromium.launch({headless: true})

    return {
      browser,
      baseUrl,
      close: async () => {
        await browser.close()
        server.kill()
        await server.exited
      },
    }
  } catch (error) {
    server.kill()
    await server.exited
    throw error
  }
}

export async function runScenario(
  harness: BrowserHarness,
  scenario: string,
): Promise<ScenarioReport> {
  const requestId = crypto.randomUUID()
  const page = await harness.browser.newPage({
    viewport: {width: 1440, height: 900},
  })

  try {
    const url = new URL('/index.html', harness.baseUrl)
    url.searchParams.set('scenario', scenario)
    url.searchParams.set('requestId', requestId)
    await page.goto(url.toString(), {waitUntil: 'domcontentloaded'})
    const report = await waitForReadyReport(page, requestId)
    return report
  } finally {
    await page.close()
  }
}

async function waitForLoopbackBaseUrl(port: number): Promise<string> {
  const candidates = [
    `http://127.0.0.1:${String(port)}`,
    `http://localhost:${String(port)}`,
    `http://[::1]:${String(port)}`,
  ]

  const startedAt = Date.now()
  while (Date.now() - startedAt < 15_000) {
    for (const candidate of candidates) {
      try {
        const response = await fetch(`${candidate}/index.html`, {
          signal: AbortSignal.timeout(250),
        })
        if (response.ok) return candidate
      } catch {
        // Keep probing until the server comes up.
      }
    }
    await Bun.sleep(100)
  }
  throw new Error('Timed out waiting for the local Bun server to respond on a loopback host.')
}

async function waitForReadyReport(page: Page, requestId: string): Promise<ScenarioReport> {
  await page.waitForFunction(
    (expectedRequestId) => {
      const node = document.getElementById('scenario-report')
      if (!(node instanceof HTMLScriptElement)) return false
      const text = node.textContent
      if (text == null || text === '') return false

      try {
        const report = JSON.parse(text) as {requestId?: string; phase?: string}
        return (
          report.requestId === expectedRequestId &&
          (report.phase === 'ready' || report.phase === 'error')
        )
      } catch {
        return false
      }
    },
    requestId,
    {timeout: 35_000},
  )

  const raw = await page.$eval('#scenario-report', (node) => node.textContent ?? '')
  const report = JSON.parse(raw) as ScenarioReport
  if (report.phase === 'error') {
    throw new Error(report.message ?? `Scenario ${report.scenario} failed.`)
  }
  return report
}
