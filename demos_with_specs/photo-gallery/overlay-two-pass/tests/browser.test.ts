import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { resolve } from 'node:path'
import { chromium, type Browser, type Page } from 'playwright'

import { startTestServer } from './browser-test-server.js'

const photos = [
  { id: 'd228330c-7364-497b-994f-a37467ae436a/0_0', prompt: 'Miniature watermelon delicately balanced on fingertip' },
  { id: '7b5301ca-ef01-44bd-8bcc-4473c945aaaf/0_0', prompt: 'Hourglass heart, liquid, grand canyon background, fleeting, ephemerality of time' },
  { id: '30d33a33-9b5b-4947-b813-4d0c5c2f9939/0_0', prompt: 'Chinese mid autumn festival on Neptune, surrealism' },
  { id: '39428453-9b30-4998-a3d6-4668b4e2621f/0_0', prompt: 'super mario gundam' },
]

const restorePhotoId = '604af437-f76b-4c7f-b778-1a3bf6ad663b/0_0'

let browser: Browser
let server: ReturnType<typeof startTestServer>

beforeAll(async () => {
  server = startTestServer(resolve(import.meta.dir, '..'))
  browser = await chromium.launch({ headless: true })
})

afterAll(async () => {
  await browser?.close()
  server?.stop()
})

async function openScenario(page: Page, scenario: string, requestId: string, hash = '') {
  await page.goto(`${server.url}/index.html?scenario=${encodeURIComponent(scenario)}&requestId=${encodeURIComponent(requestId)}${hash}`)
  await page.waitForFunction(
    (id) => {
      const node = document.getElementById('report')
      if (!node) return false
      try {
        const report = JSON.parse(node.textContent || '{}')
        return report.requestId === id && report.phase === 'ready'
      } catch {
        return false
      }
    },
    requestId,
  )

  return page.evaluate(() => JSON.parse(document.getElementById('report')?.textContent || '{}'))
}

describe('browser scenarios', () => {
  test('navigation keeps the focused image hash in sync', async () => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
    const report = await openScenario(page, 'navigation', crypto.randomUUID(), `#${encodeURIComponent(photos[0].id)}`)

    expect(report.mode).toBe('line')
    expect(report.focusedId).toBe(photos[1].id)
    expect(report.hash).toBe(`#${photos[1].id}`)

    await page.close()
  })

  test('dismiss restores the focused row with about 40px above it', async () => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 500 } })
    const report = await openScenario(page, 'dismiss-restore', crypto.randomUUID(), `#${encodeURIComponent(restorePhotoId)}`)

    expect(report.mode).toBe('grid')
    expect(report.hash).toBe('')
    expect(report.gapAboveRow).toBeGreaterThanOrEqual(32)
    expect(report.gapAboveRow).toBeLessThanOrEqual(48)

    await page.close()
  })

  test('caption clicks select the full prompt and stay in grid mode', async () => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
    const report = await openScenario(page, 'caption-selection', crypto.randomUUID())

    expect(report.mode).toBe('grid')
    expect(report.hash).toBe('')
    expect(report.selectedText).toBe(photos[0].prompt)

    await page.close()
  })

  test('occlusion mounts fewer cards than the full photo count', async () => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
    const report = await openScenario(page, 'occlusion', crypto.randomUUID())

    expect(report.mountedCount).toBeLessThan(report.totalCount)
    expect(report.totalCount).toBeGreaterThan(0)

    await page.close()
  })
})
