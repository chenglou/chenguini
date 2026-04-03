import {afterAll, beforeAll, describe, expect, test} from 'bun:test'

import {photoGalleryData} from '../gallery-model'
import {launchBrowser, runScenario, startDemoServer} from './browser-harness'

const firstId = photoGalleryData[0]!.id
const secondId = photoGalleryData[1]!.id
const captionTarget = photoGalleryData[3]!
const dismissTarget = photoGalleryData[17]!

let browser: Awaited<ReturnType<typeof launchBrowser>>
let baseUrl: string
let stopServer: (() => Promise<void>) | null = null

beforeAll(async () => {
  const server = await startDemoServer()
  baseUrl = server.baseUrl
  stopServer = async () => server.stop()
  browser = await launchBrowser()
}, 30_000)

afterAll(async () => {
  await browser.close()
  if (stopServer != null) {
    await stopServer()
  }
})

describe('browser-backed semantics', () => {
  test('hash sync starts from the hash and keeps it updated as focus moves', async () => {
    const requestId = crypto.randomUUID()
    const page = await browser.newPage({viewport: {width: 1400, height: 900}})
    const report = await runScenario(
      page,
      `${baseUrl}/index.html?scenario=hash-sync&requestId=${encodeURIComponent(requestId)}#photo=${encodeURIComponent(firstId)}`,
      requestId,
    )

    expect(report.initialFocusedId).toBe(firstId)
    expect(report.nextFocusedId).toBe(secondId)
    expect(report.hash).toBe(`#photo=${encodeURIComponent(secondId)}`)
    expect(report.mode).toBe('line')

    await page.close()
  }, 30_000)

  test('caption click selects the full caption text and stays in grid mode', async () => {
    const requestId = crypto.randomUUID()
    const page = await browser.newPage({viewport: {width: 1400, height: 900}})
    const report = await runScenario(
      page,
      `${baseUrl}/index.html?scenario=caption-selection&requestId=${encodeURIComponent(requestId)}`,
      requestId,
    )

    expect(report.selectedText).toBe(captionTarget.prompt)
    expect(report.mode).toBe('grid')
    expect(report.hash).toBe('')

    await page.close()
  }, 30_000)

  test('middle dismiss returns to grid and restores the focused row with about 40px above it', async () => {
    const requestId = crypto.randomUUID()
    const page = await browser.newPage({viewport: {width: 1400, height: 900}})
    const report = await runScenario(
      page,
      `${baseUrl}/index.html?scenario=dismiss-restore&requestId=${encodeURIComponent(requestId)}`,
      requestId,
    )

    expect(report.focusedId).toBe(null)
    expect(report.mode).toBe('grid')
    expect(report.hash).toBe('')
    expect(report.restoreGap).not.toBeNull()
    expect(Math.abs((report.restoreGap ?? 0) - 40)).toBeLessThanOrEqual(3)
    expect(report.message).toBe(dismissTarget.id)

    await page.close()
  }, 30_000)

  test('representative grid scrolling mounts fewer cards than the full gallery', async () => {
    const requestId = crypto.randomUUID()
    const page = await browser.newPage({viewport: {width: 1280, height: 720}})
    const report = await runScenario(
      page,
      `${baseUrl}/index.html?scenario=occlusion&requestId=${encodeURIComponent(requestId)}`,
      requestId,
    )

    expect(report.mode).toBe('grid')
    expect(report.totalCount).toBe(photoGalleryData.length)
    expect(report.mountedCount).toBeLessThan(photoGalleryData.length)
    expect(report.mountedCount).toBeGreaterThan(0)

    await page.close()
  }, 30_000)
})
