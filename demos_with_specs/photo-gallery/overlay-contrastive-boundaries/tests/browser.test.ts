import { afterAll, beforeAll, expect, test } from 'bun:test'
import { chromium } from 'playwright'
import { openGalleryPage, readReport, routeImageRequests, waitForReadyReport } from './browser-server.js'

let browser: Awaited<ReturnType<typeof chromium.launch>> | null = null

beforeAll(async () => {
  browser = await chromium.launch({ headless: true })
})

afterAll(async () => {
  await browser?.close()
  browser = null
})

test('hash routing enters line mode and syncs back into the URL', async () => {
  const { baseUrl, close } = await openGalleryPage()
  const page = await browser!.newPage()
  await routeImageRequests(page)

  const targetId = 'd228330c-7364-497b-994f-a37467ae436a/0_0'
  await page.goto(`${baseUrl}/?requestId=hash-routing#${encodeURIComponent(targetId)}`)

  await waitForReadyReport(page, 'hash-routing')
  const report = await readReport(page)

  expect(report.mode).toBe('line')
  expect(report.focusId).toBe(targetId)
  expect(decodeURIComponent(new URL(page.url()).hash.slice(1))).toBe(targetId)

  await page.close()
  await close()
})

test('clicking a grid image enters line mode while clicking the caption selects text and stays put', async () => {
  const { baseUrl, close } = await openGalleryPage()
  const page = await browser!.newPage()
  await routeImageRequests(page)

  await page.goto(`${baseUrl}/?requestId=caption-selection`)
  await waitForReadyReport(page, 'caption-selection')

  const targetId = '96ff81dd-fa46-43c0-b681-35b7cd8eb700/0_0'
  const imageButton = page.locator(`[data-scroll-shell] [data-photo-id="${targetId}"] [data-photo-image]`)
  await imageButton.click()

  let report = await readReport(page)
  expect(report.mode).toBe('line')
  expect(report.focusId).toBe(targetId)

  await page.locator('[data-line-dismiss-zone]').click({ position: { x: 250, y: 20 } })

  const caption = page.locator(
    `[data-scroll-shell] [data-photo-id="${targetId}"] [data-photo-caption]`,
  )
  await caption.click()

  report = await readReport(page)
  expect(report.mode).toBe('grid')
  expect(report.selectedText).toBe(
    'A phone held extremely close against an xray of a skeleton sitting on a sofa, side by side view',
  )

  await page.close()
  await close()
})

test('dismiss restores the focused row near 40px from the top when it has been scrolled away', async () => {
  const { baseUrl, close } = await openGalleryPage()
  const page = await browser!.newPage()
  await routeImageRequests(page)

  await page.goto(`${baseUrl}/?requestId=restore-row`)
  await waitForReadyReport(page, 'restore-row')

  await page.evaluate(() => {
    const scrollShell = document.querySelector('[data-scroll-shell]')
    if (scrollShell && 'scrollTop' in scrollShell) {
      ;(scrollShell as HTMLElement).scrollTop = 900
    }
  })

  const imageButton = page.locator('[data-photo-id="fb622e95-814d-4f74-8ac0-04d266c8387d/0_0"] [data-photo-image]')
  await imageButton.scrollIntoViewIfNeeded()
  await imageButton.click()

  const lineReport = await readReport(page)

  await page.evaluate(() => {
    const scrollShell = document.querySelector('[data-scroll-shell]')
    if (scrollShell && 'scrollTop' in scrollShell) {
      ;(scrollShell as HTMLElement).scrollTop = 0
    }
  })

  await page.locator('[data-line-dismiss-zone]').click({ position: { x: 250, y: 20 } })

  const report = await readReport(page)
  expect(report.mode).toBe('grid')
  expect(Math.round(report.scrollTop)).toBe(Math.round((lineReport.focusedRowTop ?? 0) - 40))

  await page.close()
  await close()
})

test('virtualization keeps mounted cards below the full dataset size', async () => {
  const { baseUrl, close } = await openGalleryPage()
  const page = await browser!.newPage()
  await routeImageRequests(page)

  await page.goto(`${baseUrl}/?requestId=virtualization`)
  await waitForReadyReport(page, 'virtualization')

  const report = await readReport(page)
  expect(report.mountedCount).toBeLessThan(report.totalCount)

  await page.close()
  await close()
})
