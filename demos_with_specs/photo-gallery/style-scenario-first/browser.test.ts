import { afterAll, beforeAll, expect, test } from 'bun:test'

import { photoGalleryData } from './data'
import { readGalleryReport, startGalleryServer, waitForFocusedId, waitForMode } from './browserTestUtils'

let server: Awaited<ReturnType<typeof startGalleryServer>>

beforeAll(async () => {
  server = await startGalleryServer()
})

afterAll(async () => {
  await server.close()
})

test('hash navigation opens line mode and back/forward restore the focused image or closed state', async () => {
  const page = await server.newPage()

  const firstId = photoGalleryData[0]!.id
  const secondId = photoGalleryData[1]!.id

  await page.locator(`[data-photo-id="${firstId}"] [data-role="grid-image"]`).click()
  let report = await waitForMode(page, 'line')
  expect(report.focusedId).toBe(firstId)
  expect(decodeURIComponent(report.hash.slice(1))).toBe(firstId)

  await page.reload({waitUntil: 'domcontentloaded'})
  report = await waitForFocusedId(page, firstId)
  expect(report.focusedId).toBe(firstId)

  await page.locator('[data-role="line-next-zone"]').click({force: true})
  report = await waitForFocusedId(page, secondId)
  expect(report.focusedId).toBe(secondId)
  expect(decodeURIComponent(report.hash.slice(1))).toBe(secondId)

  await page.goBack()
  report = await waitForFocusedId(page, firstId)
  expect(report.focusedId).toBe(firstId)

  await page.goBack()
  report = await waitForMode(page, 'grid')
  expect(report.focusedId).toBeNull()

  await page.goForward()
  report = await waitForFocusedId(page, firstId)
  expect(report.focusedId).toBe(firstId)

  await page.goForward()
  report = await waitForFocusedId(page, secondId)
  expect(report.focusedId).toBe(secondId)

  await page.close()
})

test('dismissing line mode scrolls the focused row back into view', async () => {
  const page = await server.newPage()
  const offscreenId = photoGalleryData[1]!.id

  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
  await page.evaluate((id) => {
    location.hash = encodeURIComponent(id)
  }, offscreenId)

  let report = await waitForMode(page, 'line')
  expect(report.focusedId).toBe(offscreenId)

  await page.locator('[data-role="line-dismiss-zone"]').click({force: true})
  report = await waitForMode(page, 'grid')
  expect(report.focusedId).toBeNull()

  const scrollTop = await page.evaluate(() => document.documentElement.scrollTop || document.body.scrollTop)
  expect(scrollTop).toBeGreaterThanOrEqual((report.focusedRowTop ?? 0) - 41)
  expect(scrollTop).toBeLessThanOrEqual((report.focusedRowTop ?? 0) - 39)

  await page.close()
})

test('caption clicks select the whole caption and do not open line mode', async () => {
  const page = await server.newPage()
  const captionId = photoGalleryData[3]!.id
  const captionText = photoGalleryData[3]!.prompt

  await page.locator(`[data-photo-id="${captionId}"] [data-role="caption"]`).click({force: true})

  const report = await readGalleryReport(page)
  expect(report.mode).toBe('grid')
  expect(report.selectionText).toBe(captionText)
  expect(await page.evaluate(() => window.getSelection()?.toString() ?? '')).toBe(captionText)

  await page.close()
})

test('grid virtualization keeps mounted count below the total photo count', async () => {
  const page = await server.newPage()

  await page.evaluate(() => window.scrollTo(0, 1500))
  const report = await page.waitForFunction(() => window.__photoGalleryReport?.mode === 'grid' && window.__photoGalleryReport.mountedCount < window.__photoGalleryReport.totalCount)
  void report

  const snapshot = await readGalleryReport(page)
  expect(snapshot.mountedCount).toBeLessThan(snapshot.totalCount)
  expect(snapshot.mountedCount).toBeGreaterThan(0)

  await page.close()
})
