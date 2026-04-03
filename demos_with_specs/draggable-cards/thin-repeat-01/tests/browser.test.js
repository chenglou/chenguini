import { afterAll, beforeAll, expect, test } from 'bun:test'
import { fileURLToPath } from 'node:url'

import { chromium } from 'playwright'

import { startDemoServer, waitForMatchingReadyReport } from './browser-test-helpers.js'

const INDEX_HTML_PATH = fileURLToPath(new URL('../index.html', import.meta.url))

let demoServer

beforeAll(async () => {
  demoServer = await startDemoServer(INDEX_HTML_PATH)
})

afterAll(async () => {
  if (demoServer != null) {
    await demoServer.stop()
  }
})

async function runScenario(scenario) {
  const browser = await chromium.launch({ headless: true })
  try {
    const page = await browser.newPage({ viewport: { width: 900, height: 900 } })
    const requestId = crypto.randomUUID()
    await page.goto(
      `${demoServer.baseUrl}/?scenario=${encodeURIComponent(scenario)}&requestId=${encodeURIComponent(requestId)}`,
      { waitUntil: 'load' },
    )
    return await waitForMatchingReadyReport(page, requestId)
  } finally {
    await browser.close()
  }
}

test('reorder happens before release when the drag crosses a midpoint', async () => {
  const report = await runScenario('reorder-before-release')

  expect(report.reorderHappenedBeforeRelease).toBe(true)
  expect(report.orderedCardIdsBeforeRelease).toEqual([
    'card-1',
    'card-0',
    'card-2',
    'card-3',
    'card-4',
  ])
  expect(report.releasedCardId).toBe('card-0')
})

test('released card stays on top while settling', async () => {
  const report = await runScenario('top-until-settle')

  expect(report.releasedCardId).toBe('card-0')
  expect(report.settlingFrameCount).toBeGreaterThan(0)
  expect(report.topCardIdsWhileSettling).toHaveLength(report.settlingFrameCount)
  expect([...new Set(report.topCardIdsWhileSettling)]).toEqual(['card-0'])
  expect(report.releasedCardStayedOnTop).toBe(true)
  expect(report.orderedCardIdsAfterSettle).toEqual([
    'card-1',
    'card-0',
    'card-2',
    'card-3',
    'card-4',
  ])
})
