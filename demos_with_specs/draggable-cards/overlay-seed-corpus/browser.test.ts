import { afterAll, beforeAll, expect, test } from 'bun:test'
import { chromium, type Browser, type Page } from 'playwright'

import { startDemoServer } from './browser-test-server'

type Report = {
  phase: 'loading' | 'running' | 'ready' | 'error'
  requestId: string
  scenario: string
  orderedCardIds: string[]
  topCardId: string | null
  settled: boolean
  message?: string
}

async function readReport(page: Page): Promise<Report> {
  const text = await page.locator('#report').textContent()
  if (!text) {
    throw new Error('missing report')
  }
  return JSON.parse(text) as Report
}

async function waitForReport(
  page: Page,
  requestId: string,
  phase: Report['phase'],
): Promise<Report> {
  await page.waitForFunction(
    ({ requestId, phase }) => {
      const text = document.getElementById('report')?.textContent
      if (!text) return false
      const report = JSON.parse(text) as Report
      return report.requestId === requestId && report.phase === phase
    },
    { requestId, phase },
  )
  return readReport(page)
}

let server: Awaited<ReturnType<typeof startDemoServer>> | null = null
let browser: Browser | null = null

beforeAll(async () => {
  server = await startDemoServer()
  browser = await chromium.launch({ headless: true })
})

afterAll(async () => {
  await browser?.close()
  await server?.stop()
  browser = null
  server = null
})

test('publishes the reordered order before release', async () => {
  if (!server || !browser) {
    throw new Error('missing browser harness')
  }

  let page: Page | null = null
  try {
    page = await browser.newPage({ viewport: { width: 960, height: 760 } })
    const requestId = crypto.randomUUID()
    await page.goto(`${server.url}/index.html?scenario=reorder-before-release&requestId=${requestId}`)

    const running = await waitForReport(page, requestId, 'running')
    expect(running.orderedCardIds).toEqual(['0', '2', '1', '3', '4'])
    expect(running.topCardId).toBe('2')
    expect(running.settled).toBe(false)

    const ready = await waitForReport(page, requestId, 'ready')
    expect(ready.orderedCardIds).toEqual(['0', '2', '1', '3', '4'])
    expect(ready.topCardId).toBe(null)
    expect(ready.settled).toBe(true)
  } finally {
    await page?.close()
  }
})

test('keeps the released card on top until the spring settles', async () => {
  if (!server || !browser) {
    throw new Error('missing browser harness')
  }

  let page: Page | null = null
  try {
    page = await browser.newPage({ viewport: { width: 960, height: 760 } })
    const requestId = crypto.randomUUID()
    await page.goto(`${server.url}/index.html?scenario=top-until-settle&requestId=${requestId}`)

    const running = await waitForReport(page, requestId, 'running')
    expect(running.topCardId).toBe('2')
    expect(running.settled).toBe(false)

    const ready = await waitForReport(page, requestId, 'ready')
    expect(ready.topCardId).toBe(null)
    expect(ready.settled).toBe(true)
  } finally {
    await page?.close()
  }
})
