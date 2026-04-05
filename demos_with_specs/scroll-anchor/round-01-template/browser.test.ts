import {afterAll, beforeAll, describe, expect, test} from 'bun:test'
import {spawn, type ChildProcessWithoutNullStreams} from 'node:child_process'
import {createServer} from 'node:net'
import {chromium, type Browser} from 'playwright'

const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const demoDir = new URL('.', import.meta.url)
const hosts = ['127.0.0.1', 'localhost', '[::1]']

type ScenarioReport = {
  phase: 'loading' | 'running' | 'ready' | 'error'
  requestId: string
  scenario: string
  message?: string
  referenceItemBefore?: string | null
  referenceItemAfter?: string | null
  anchorBefore?: string | null
  anchorAfter?: string | null
  mountedItemCount?: number
  mountedHeaderCount?: number
  itemCount?: number
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function findOpenPort() {
  return await new Promise<number>((resolve, reject) => {
    const server = createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (address == null || typeof address === 'string') {
        reject(new Error('Failed to read open port'))
        return
      }
      const {port} = address
      server.close((error) => {
        if (error != null) reject(error)
        else resolve(port)
      })
    })
  })
}

async function pickBaseUrl(port: number) {
  for (let attempt = 0; attempt < 50; attempt++) {
    for (const host of hosts) {
      const url = `http://${host}:${port}/`
      try {
        const response = await fetch(url)
        if (response.ok) return `http://${host}:${port}`
      } catch {
      }
    }
    await delay(100)
  }
  throw new Error(`Could not reach local demo server on port ${port}`)
}

async function waitForMatchingReadyReport(browser: Browser, url: string, requestId: string) {
  const page = await browser.newPage({viewport: {width: 1100, height: 900}})
  try {
    await page.goto(url)
    await page.waitForFunction((expectedRequestId) => {
      if (!location.hash.startsWith('#report=')) return false
      try {
        const report = JSON.parse(decodeURIComponent(location.hash.slice('#report='.length))) as ScenarioReport
        return report.requestId === expectedRequestId && (report.phase === 'ready' || report.phase === 'error')
      } catch {
        return false
      }
    }, requestId, {timeout: 30_000})
    const report = await page.evaluate(() => JSON.parse(decodeURIComponent(location.hash.slice('#report='.length))) as ScenarioReport)
    if (report.phase === 'error') throw new Error(report.message ?? `Scenario ${report.scenario} failed`)
    return report
  } finally {
    await page.close()
  }
}

describe('browser reports', () => {
  let browser: Browser
  let server: ChildProcessWithoutNullStreams
  let baseUrl: string
  let serverOutput = ''

  beforeAll(async () => {
    const port = await findOpenPort()
    server = spawn('bun', ['--port', String(port), '--no-hmr', 'index.html'], {
      cwd: Bun.fileURLToPath(demoDir),
      stdio: 'pipe',
    })
    server.stdout.on('data', (chunk: Buffer) => { serverOutput += chunk.toString() })
    server.stderr.on('data', (chunk: Buffer) => { serverOutput += chunk.toString() })
    baseUrl = await pickBaseUrl(port)
    browser = await chromium.launch({
      executablePath: chromePath,
      headless: true,
    })
  }, 35_000)

  afterAll(async () => {
    await browser?.close()
    server?.kill('SIGTERM')
  })

  async function runScenario(name: string) {
    const requestId = crypto.randomUUID()
    const url = `${baseUrl}/?scenario=${encodeURIComponent(name)}&requestId=${encodeURIComponent(requestId)}`
    try {
      return await waitForMatchingReadyReport(browser, url, requestId)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      throw new Error(`${message}\n\nServer output:\n${serverOutput}`)
    }
  }

  test('scroll-to-700 then add-3-above keeps V9 at the reference line', async () => {
    const report = await runScenario('scroll-to-700-add-3-above')

    expect(report.referenceItemBefore).toBe('V9')
    expect(report.referenceItemAfter).toBe('V9')
    expect(report.anchorBefore).toBe('V7')
    expect(report.anchorAfter).toBe('V7')
    expect(report.itemCount).toBe(20)
    expect(report.mountedItemCount).toBeLessThan(report.itemCount!)
    expect(report.mountedHeaderCount).toBeLessThan(3)
  }, 35_000)

  test('add-1-then-2-rapid keeps V3 at the reference line', async () => {
    const report = await runScenario('add-1-then-2-rapid')

    expect(report.referenceItemBefore).toBe('V3')
    expect(report.referenceItemAfter).toBe('V3')
    expect(report.anchorBefore).toBe('V1')
    expect(report.anchorAfter).toBe('V1')
    expect(report.itemCount).toBe(20)
  }, 35_000)

  test('user-scroll-then-prepend keeps V7 at the reference line and repicks the anchor', async () => {
    const report = await runScenario('user-scroll-then-prepend')

    expect(report.referenceItemBefore).toBe('V7')
    expect(report.referenceItemAfter).toBe('V7')
    expect(report.anchorBefore).toBe('V5')
    expect(report.anchorAfter).toBe('V5')
    expect(report.itemCount).toBe(20)
  }, 35_000)
})
