import {afterAll, beforeAll, describe, expect, test} from 'bun:test'
import {randomUUID} from 'node:crypto'

import {chromium} from 'playwright'

const ROUND_DIR = '/Users/chenglou/github/vibescript/demos_with_specs/scroll-anchor/round-01-raw'

type BrowserReport = {
  phase: 'loading' | 'running' | 'ready' | 'error'
  requestId: string
  scenario: string
  beforeItemId?: string
  afterItemId?: string
  anchorId?: string | null
  message?: string
}

let server: ReturnType<typeof Bun.serve> | null = null
let baseUrl = ''

beforeAll(async () => {
  server = Bun.serve({
    port: 0,
    hostname: '127.0.0.1',
    fetch(request) {
      const url = new URL(request.url)
      const pathname = url.pathname === '/' ? '/index.html' : url.pathname
      const file = Bun.file(`${ROUND_DIR}${pathname}`)
      return new Response(file)
    },
  })

  baseUrl = await pickLoopbackBaseUrl(server.port)
})

afterAll(async () => {
  await server?.stop(true)
})

describe('scroll anchor demo scenarios', () => {
  test('scroll-to-700 then add-3-above keeps the same item at the reference line', async () => {
    const report = await runScenario('scroll-to-700-add-3-above')

    expect(report.phase).toBe('ready')
    expect(report.beforeItemId).toBe('V9')
    expect(report.afterItemId).toBe('V9')
    expect(report.anchorId).toBe('V8')
  })

  test('add-1 then 2 rapid keeps the same item at the reference line', async () => {
    const report = await runScenario('add-1-then-2-rapid')

    expect(report.phase).toBe('ready')
    expect(report.beforeItemId).toBe('V6')
    expect(report.afterItemId).toBe('V6')
    expect(report.anchorId).toBe('V5')
  })

  test('user-scroll then prepend picks a new anchor from the new scroll position', async () => {
    const report = await runScenario('user-scroll-then-prepend')

    expect(report.phase).toBe('ready')
    expect(report.beforeItemId).toBe('V14')
    expect(report.afterItemId).toBe('V14')
    expect(report.anchorId).toBe('V12')
  })
})

async function runScenario(scenario: string): Promise<BrowserReport> {
  const browser = await chromium.launch({headless: true})
  const page = await browser.newPage({viewport: {width: 960, height: 720}})
  const requestId = randomUUID()
  const url = `${baseUrl}/index.html?scenario=${encodeURIComponent(scenario)}&requestId=${encodeURIComponent(requestId)}`

  try {
    await page.goto(url, {waitUntil: 'load'})
    const report = await waitForMatchingReadyReport(page, requestId)
    return report
  } finally {
    await page.close()
    await browser.close()
  }
}

async function waitForMatchingReadyReport(
  page: Awaited<ReturnType<ReturnType<typeof chromium.launch>['newPage']>>,
  requestId: string,
): Promise<BrowserReport> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const hash = await page.evaluate(() => window.location.hash)
    const report = decodeHashReport(hash)

    if (report && report.requestId === requestId) {
      if (report.phase === 'ready') {
        return report
      }
      if (report.phase === 'error') {
        throw new Error(report.message ?? `Scenario ${report.scenario} failed`)
      }
    }

    await page.waitForTimeout(25)
  }

  throw new Error(`Timed out waiting for report ${requestId}`)
}

function decodeHashReport(hash: string): BrowserReport | null {
  const prefix = '#report='
  if (!hash.startsWith(prefix)) {
    return null
  }

  const json = decodeURIComponent(hash.slice(prefix.length))
  return JSON.parse(json) as BrowserReport
}

async function pickLoopbackBaseUrl(port: number): Promise<string> {
  const candidates = [
    `http://127.0.0.1:${port}`,
    `http://localhost:${port}`,
    `http://[::1]:${port}`,
  ]

  for (const candidate of candidates) {
    try {
      const response = await fetch(candidate)
      if (response.ok) {
        return candidate
      }
    } catch {
      // Try the next loopback host.
    }
  }

  throw new Error(`No loopback host responded on port ${port}`)
}
