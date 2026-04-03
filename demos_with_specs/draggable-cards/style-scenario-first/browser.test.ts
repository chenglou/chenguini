import { afterAll, beforeAll, expect, test } from 'bun:test'
import { spawn } from 'node:child_process'
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright'

type Report = {
  phase: 'loading' | 'running' | 'ready' | 'error'
  requestId: string
  scenario: string
  orderedCardIds?: string[]
  lastDraggedId?: string | null
  topLayerCardId?: string | null
  message?: string
}

const port = 3217
const loopbackBases = [`http://localhost:${port}/`, `http://127.0.0.1:${port}/`, `http://[::1]:${port}/`]
let baseUrl = ''

let server: ReturnType<typeof spawn> | null = null
let browser: Browser | null = null
let context: BrowserContext | null = null

beforeAll(async () => {
  server = spawn('bun', ['--host=127.0.0.1', '--port', String(port), 'index.html'], {
    cwd: import.meta.dir,
    stdio: 'ignore',
  })

  for (let i = 0; i < 100; i++) {
    for (const candidate of loopbackBases) {
      try {
        const response = await fetch(candidate)
        if (response.ok) {
          baseUrl = candidate
          break
        }
      } catch {
        // Try the next loopback host.
      }
    }

    if (baseUrl !== '') {
      break
    }

    await new Promise((resolve) => setTimeout(resolve, 50))
  }

  if (baseUrl === '') {
    throw new Error('Failed to reach the local Bun server on any loopback host')
  }

  browser = await chromium.launch({ headless: true })
  context = await browser.newContext({ viewport: { width: 1000, height: 900 } })
})

afterAll(async () => {
  await context?.close()
  await browser?.close()
  server?.kill('SIGTERM')
})

async function openScenario(scenario: string) {
  const page = await context!.newPage()
  const requestId = crypto.randomUUID()
  await page.goto(`${baseUrl}?scenario=${encodeURIComponent(scenario)}&requestId=${encodeURIComponent(requestId)}`)
  return { page, requestId }
}

async function readReport(page: Page) {
  const hash = await page.evaluate(() => location.hash)
  if (!hash.startsWith('#report=')) {
    return null
  }

  return JSON.parse(decodeURIComponent(hash.slice('#report='.length))) as Report
}

async function waitForReport(page: Page, requestId: string, phase?: Report['phase']) {
  const deadline = Date.now() + 15_000
  let lastReport: Report | null = null

  while (Date.now() < deadline) {
    const report = await readReport(page)
    if (report != null && report.requestId === requestId) {
      lastReport = report
      if (phase == null || report.phase === phase) {
        return report
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 50))
  }

  throw new Error(`Timed out waiting for ${phase ?? 'a matching'} report: ${JSON.stringify(lastReport)}`)
}

test('a drag path changes order before release', async () => {
  const { page, requestId } = await openScenario('reorder')
  const report = await waitForReport(page, requestId, 'ready')

  expect(report.orderedCardIds).toEqual(['0', '2', '1', '3', '4'])
  expect(report.lastDraggedId).toBeNull()
})

test('the released card stays on top while it settles', async () => {
  const { page, requestId } = await openScenario('settling-depth')

  const running = await waitForReport(page, requestId, 'running')
  expect(running.lastDraggedId).toBe('2')
  expect(running.topLayerCardId).toBe('2')

  const ready = await waitForReport(page, requestId, 'ready')
  expect(ready.lastDraggedId).toBeNull()
})
