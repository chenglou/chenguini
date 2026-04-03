import { afterAll, beforeAll } from 'bun:test'
import { chromium } from 'playwright'

const DEMO_DIR = '/Users/chenglou/github/vibescript/demos_with_specs/draggable-cards/thin-level-2-thin'
const HOST_CANDIDATES = ['127.0.0.1', 'localhost', '[::1]']

let server = null
let browser = null
let baseUrl = null

async function waitForServer(host) {
  const deadline = Date.now() + 10_000
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://${host}:${server.port}/`)
      if (response.ok) return true
    } catch {}
    await Bun.sleep(100)
  }

  return false
}

async function pickResponsiveBaseUrl() {
  for (const host of HOST_CANDIDATES) {
    if (await waitForServer(host)) {
      return `http://${host}:${server.port}`
    }
  }

  throw new Error('No loopback host responded for the draggable cards demo server.')
}

async function waitForMatchingReadyReport(page, requestId) {
  const deadline = Date.now() + 30_000
  while (Date.now() < deadline) {
    const hash = await page.evaluate(() => location.hash)
    if (hash.startsWith('#report=')) {
      const report = JSON.parse(decodeURIComponent(hash.slice('#report='.length)))
      if (report.requestId === requestId) {
        if (report.phase === 'ready') return report
        if (report.phase === 'error') {
          throw new Error(report.message ?? 'Browser scenario failed.')
        }
      }
    }

    await page.waitForTimeout(50)
  }

  throw new Error(`Timed out waiting for report ${requestId}.`)
}

beforeAll(async () => {
  server = Bun.serve({
    port: 0,
    fetch(request) {
      const url = new URL(request.url)
      const pathname = url.pathname === '/' ? '/index.html' : url.pathname
      return new Response(Bun.file(`${DEMO_DIR}${pathname}`))
    },
  })

  baseUrl = await pickResponsiveBaseUrl()
  browser = await chromium.launch()
})

afterAll(async () => {
  await browser?.close()
  server?.stop(true)
})

export async function runScenario(scenario) {
  if (browser == null || baseUrl == null) {
    throw new Error('Browser test helper is not initialized.')
  }

  const page = await browser.newPage()
  const requestId = crypto.randomUUID()
  const url = `${baseUrl}/?scenario=${encodeURIComponent(scenario)}&requestId=${encodeURIComponent(requestId)}`

  try {
    await page.goto(url, { waitUntil: 'load' })
    return await waitForMatchingReadyReport(page, requestId)
  } finally {
    await page.close()
  }
}
