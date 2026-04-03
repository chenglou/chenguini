import {createServer} from 'node:net'

import {chromium} from 'playwright'

import {SCENARIO_REPORT_NODE_ID} from '../gallery'

const DEMO_DIR = '/Users/chenglou/github/vibescript/demos_with_specs/photo-gallery/thin-level-0-rich'
const LOOPBACK_HOSTS = ['http://127.0.0.1', 'http://localhost', 'http://[::1]']

type ScenarioReport = {
  phase: 'loading' | 'running' | 'ready' | 'error'
  requestId: string
  scenario: string
  message?: string
}

async function pickOpenPort(): Promise<number> {
  return await new Promise((resolve, reject) => {
    const server = createServer()
    server.on('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (address == null || typeof address === 'string') {
        reject(new Error('Could not determine test server port'))
        return
      }
      const {port} = address
      server.close((error) => {
        if (error != null) {
          reject(error)
          return
        }
        resolve(port)
      })
    })
  })
}

async function wait(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms))
}

async function pickResponsiveLoopbackHost(port: number): Promise<string> {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    for (const host of LOOPBACK_HOSTS) {
      try {
        const response = await fetch(`${host}:${port}/`)
        if (response.ok) {
          return `${host}:${port}`
        }
      } catch {
        // Keep probing until the server responds on one loopback host.
      }
    }
    await wait(100)
  }
  throw new Error(`Timed out waiting for Bun to serve ${DEMO_DIR}`)
}

function readReportPayload(rawReport: unknown): ScenarioReport | null {
  if (typeof rawReport !== 'string' || rawReport.length === 0) {
    return null
  }
  try {
    return JSON.parse(rawReport) as ScenarioReport
  } catch {
    return null
  }
}

async function waitForMatchingReadyReport(page: import('playwright').Page, requestId: string): Promise<ScenarioReport> {
  for (let attempt = 0; attempt < 300; attempt += 1) {
    const rawReport = await page.evaluate((reportNodeId) => {
      return document.getElementById(reportNodeId)?.textContent ?? ''
    }, SCENARIO_REPORT_NODE_ID)
    const report = readReportPayload(rawReport)
    if (report != null && report.requestId === requestId) {
      if (report.phase === 'ready') {
        return report
      }
      if (report.phase === 'error') {
        throw new Error(report.message ?? `Scenario ${report.scenario} reported an error`)
      }
    }
    await wait(100)
  }
  throw new Error(`Timed out waiting for a ready report for request ${requestId}`)
}

async function startDeterministicServer(): Promise<{baseUrl: string; stop: () => Promise<void>}> {
  const port = await pickOpenPort()
  const serverProcess = Bun.spawn(
    ['bun', 'run', '--port', String(port), './index.html'],
    {
      cwd: DEMO_DIR,
      stdout: 'ignore',
      stderr: 'pipe',
    },
  )
  try {
    const baseUrl = await pickResponsiveLoopbackHost(port)
    return {
      baseUrl,
      stop: async () => {
        serverProcess.kill()
        await serverProcess.exited
      },
    }
  } catch (error) {
    serverProcess.kill()
    const stderr = await new Response(serverProcess.stderr).text()
    throw new Error(
      error instanceof Error
        ? `${error.message}\n${stderr}`
        : `Could not start Bun server\n${stderr}`,
    )
  }
}

export async function runScenario<TReport extends ScenarioReport>(scenario: string): Promise<TReport> {
  const {baseUrl, stop} = await startDeterministicServer()
  const browser = await chromium.launch({headless: true})
  try {
    const page = await browser.newPage({viewport: {width: 1_440, height: 900}})
    const requestId = crypto.randomUUID()
    const url =
      `${baseUrl}/?scenario=${encodeURIComponent(scenario)}` +
      `&requestId=${encodeURIComponent(requestId)}`

    await page.goto(url, {waitUntil: 'load'})
    return await waitForMatchingReadyReport(page, requestId) as TReport
  } finally {
    await browser.close()
    await stop()
  }
}
