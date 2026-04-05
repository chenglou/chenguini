import { expect, test, type Page } from 'playwright/test'

import { parseGalleryHash } from './gallery-hash'
import { photoGalleryData } from './photo-gallery-data'

type BrowserReport = NonNullable<ReturnType<typeof parseGalleryHash>['report']>

async function waitForScenarioReport(page: Page, requestId: string) {
  let matchingReport: BrowserReport | null = null

  await expect
    .poll(
      async () => {
        const hash = await page.evaluate(() => window.location.hash)
        const report = parseGalleryHash(hash).report
        matchingReport = report?.requestId === requestId ? report : null

        return matchingReport?.phase ?? null
      },
      { timeout: 35_000 },
    )
    .toBe('ready')

  expect(matchingReport?.requestId).toBe(requestId)
  expect(matchingReport?.phase).toBe('ready')

  return matchingReport as BrowserReport
}

test('browser-backed navigation flow updates the hash and focus', async ({ page }) => {
  const requestId = 'navigation-flow'
  const expectedFocusId = photoGalleryData[8].id

  await page.goto(`/?scenario=navigation-flow&requestId=${requestId}`)

  const report = await waitForScenarioReport(page, requestId)

  expect(report.scenario).toBe('navigation-flow')
  expect(report.result.mode).toBe('line')
  expect(report.result.focusedId).toBe(expectedFocusId)
  expect(report.result.hashFocusId).toBe(expectedFocusId)
})

test('browser-backed caption selection keeps grid mode and selects the full caption', async ({ page }) => {
  const requestId = 'caption-selection'
  const expectedPrompt = photoGalleryData[3].prompt

  await page.goto(`/?scenario=caption-selection&requestId=${requestId}`)

  const report = await waitForScenarioReport(page, requestId)

  expect(report.scenario).toBe('caption-selection')
  expect(report.result.mode).toBe('grid')
  expect(report.result.hashFocusId).toBeNull()
  expect(report.result.selectedText).toBe(expectedPrompt)
})

test('browser-backed dismiss restore brings the focused row back near 40px from the top', async ({ page }) => {
  const requestId = 'dismiss-restore'

  await page.goto(`/?scenario=dismiss-restore&requestId=${requestId}`)

  const report = await waitForScenarioReport(page, requestId)

  expect(report.scenario).toBe('dismiss-restore')
  expect(report.result.mode).toBe('grid')
  expect(report.result.rowTopViewport).toBeGreaterThan(28)
  expect(report.result.rowTopViewport).toBeLessThan(52)
})

test('browser-backed occlusion mounts fewer cards than the full photo count', async ({ page }) => {
  const requestId = 'occlusion-mounted-count'

  await page.goto(`/?scenario=occlusion-mounted-count&requestId=${requestId}`)

  const report = await waitForScenarioReport(page, requestId)

  expect(report.scenario).toBe('occlusion-mounted-count')
  expect(report.result.photoCount).toBe(photoGalleryData.length)
  expect(report.result.mountedCount).toBeLessThan(photoGalleryData.length)
})
