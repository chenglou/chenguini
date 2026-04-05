import {expect} from 'bun:test'
import {createServer} from 'node:http'

import {chromium, type Browser, type Page} from 'playwright'

export type ScenarioReport = {
  phase: 'loading' | 'running' | 'ready' | 'error'
  requestId: string
  scenario: string
  hash?: string
  mode?: 'grid' | 'line'
  focusedId?: string | null
  selectedText?: string
  mountedCount?: number
  totalCount?: number
  rowTop?: number
  gapAboveRow?: number
  message?: string
}

type ScenarioOptions = {
  scenario: string
  viewport: {
    width: number
    height: number
  }
}

type RunningServer = {
  baseUrl: string
  stop: () => Promise<void>
}

const ROUND_DIR = '/Users/chenglou/github/vibescript/demos_with_specs/photo-gallery/round-11-raw'

export async function runBrowserScenario({
  scenario,
  viewport,
}: ScenarioOptions): Promise<ScenarioReport> {
  const requestId = crypto.randomUUID()
  const server = await startServer()
  const browser = await chromium.launch({headless: true})
  const page = await browser.newPage({viewport})

  try {
    const url = new URL(server.baseUrl)
    url.searchParams.set('scenario', scenario)
    url.searchParams.set('requestId', requestId)

    await page.goto(url.toString(), {waitUntil: 'domcontentloaded'})
    const report = await waitForReadyReport(page, requestId)
    if (report.phase === 'error') {
      throw new Error(report.message ?? `Scenario ${scenario} failed`)
    }
    return report
  } finally {
    await closeBrowser(browser)
    await server.stop()
  }
}

async function waitForReadyReport(page: Page, requestId: string): Promise<ScenarioReport> {
  await page.waitForSelector('#scenario-report', {state: 'attached'})
  await page.waitForFunction(
    expectedRequestId => {
      const node = document.querySelector('#scenario-report')
      const rawText = node?.textContent
      if (rawText === undefined || rawText.trim() === '') {
        return false
      }

      const parsed = JSON.parse(rawText) as ScenarioReport
      return (
        parsed.requestId === expectedRequestId &&
        (parsed.phase === 'ready' || parsed.phase === 'error')
      )
    },
    requestId,
    {timeout: 30_000},
  )

  const rawText = await page.locator('#scenario-report').textContent()
  expect(rawText).toBeTruthy()
  return JSON.parse(rawText!) as ScenarioReport
}

async function startServer(): Promise<RunningServer> {
  const port = await getFreePort()
  const child = Bun.spawn(
    [
      process.execPath,
      `--port=${port}`,
      '--host=0.0.0.0',
      '--no-hmr',
      `${ROUND_DIR}/index.html`,
    ],
    {
      cwd: ROUND_DIR,
      stdout: 'ignore',
      stderr: 'pipe',
    },
  )

  const baseUrl = await waitForResponsiveHost(port)

  return {
    baseUrl,
    async stop() {
      child.kill()
      await child.exited
    },
  }
}

async function waitForResponsiveHost(port: number): Promise<string> {
  const hosts = ['http://127.0.0.1', 'http://localhost', 'http://[::1]']
  const paths = ['/', '/index.html']
  const deadline = Date.now() + 15_000

  while (Date.now() < deadline) {
    for (const host of hosts) {
      for (const path of paths) {
        try {
          const response = await fetch(`${host}:${port}${path}`)
          if (response.ok) {
            return `${host}:${port}${path}`
          }
        } catch {
          // Keep probing until one loopback host responds.
        }
      }
    }
    await Bun.sleep(100)
  }

  throw new Error(`Timed out waiting for Bun server on port ${port}`)
}

async function getFreePort(): Promise<number> {
  return await new Promise<number>((resolve, reject) => {
    const server = createServer()
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (address === null || typeof address === 'string') {
        reject(new Error('Failed to allocate a test port'))
        return
      }
      const {port} = address
      server.close(error => {
        if (error) {
          reject(error)
          return
        }
        resolve(port)
      })
    })
  })
}

async function closeBrowser(browser: Browser): Promise<void> {
  await browser.close()
}
