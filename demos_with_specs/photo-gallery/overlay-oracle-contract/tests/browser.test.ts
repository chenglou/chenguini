import { afterAll, beforeAll, expect, test } from 'bun:test'
import { chromium, type Browser, type Page } from 'playwright'

import { photoGalleryData } from '../data'
import { startGalleryServer, type GalleryServer } from './browser-server'

let browser: Browser
let server: GalleryServer

beforeAll(async () => {
  server = await startGalleryServer()
  browser = await chromium.launch({ headless: true })
})

afterAll(async () => {
  await browser?.close()
  server?.close()
})

async function newPage() {
  const context = await browser.newContext({ viewport: { width: 1024, height: 720 } })
  const page = await context.newPage()
  const requestId = crypto.randomUUID()
  const url = `${server.baseUrl}/index.html?scenario=test&requestId=${encodeURIComponent(requestId)}`
  await page.goto(url)
  await waitForReadyReport(page, requestId)

  return { context, page, requestId }
}

async function waitForReadyReport(page: Page, requestId: string) {
  await page.waitForFunction(
    rid => {
      const node = document.querySelector('#oracle-report')
      if (!node?.textContent) {
        return false
      }

      try {
        const report = JSON.parse(node.textContent) as { phase?: string; requestId?: string }
        return report.requestId === rid && report.phase === 'ready'
      } catch {
        return false
      }
    },
    requestId,
    { timeout: 10_000 },
  )
}

async function readReport(page: Page) {
  const text = await page.locator('#oracle-report').textContent()
  if (!text) {
    throw new Error('missing oracle report')
  }

  return JSON.parse(text) as Record<string, unknown>
}

test('navigation hash sync opens line mode and locks scroll', async () => {
  const { context, page } = await newPage()
  try {
    const target = photoGalleryData[6]
    await page.evaluate(id => {
      location.hash = id
    }, target.id)

    await page.waitForFunction(
      id => {
        const node = document.querySelector('#oracle-report')
        if (!node?.textContent) {
          return false
        }

        try {
          const report = JSON.parse(node.textContent) as { focusedId?: string | null; scrollLocked?: boolean }
          return report.focusedId === id && report.scrollLocked === true
        } catch {
          return false
        }
      },
      target.id,
      { timeout: 10_000 },
    )

    const report = await readReport(page)
    expect(report.phase).toBe('ready')
    expect(report.focusedId).toBe(target.id)
    expect(report.hash).toBe(`#${target.id}`)
    expect(report.scrollLocked).toBe(true)
  } finally {
    await context.close()
  }
})

test('dismiss restores the focused row to about 40px from the top', async () => {
  const { context, page } = await newPage()
  try {
    const target = photoGalleryData[14]
    await page.evaluate(id => {
      location.hash = id
    }, target.id)

    await page.waitForFunction(
      id => {
        const node = document.querySelector('#oracle-report')
        if (!node?.textContent) {
          return false
        }

        try {
          const report = JSON.parse(node.textContent) as { focusedId?: string | null }
          return report.focusedId === id
        } catch {
          return false
        }
      },
      target.id,
      { timeout: 10_000 },
    )

    await page.mouse.click(512, 360)

    await page.waitForFunction(
      id => {
        const node = document.querySelector('#oracle-report')
        if (!node?.textContent) {
          return false
        }

        try {
          const report = JSON.parse(node.textContent) as {
            focusedId?: string | null
            restoredId?: string | null
            restoredRowTop?: number
          }
          return report.focusedId == null && report.restoredId === id
        } catch {
          return false
        }
      },
      target.id,
      { timeout: 10_000 },
    )

    const report = await readReport(page)
    expect(report.phase).toBe('ready')
    expect(report.focusedId).toBeNull()
    expect(report.restoredId).toBe(target.id)
    expect(report.restoredRowTop).toBeGreaterThanOrEqual(24)
    expect(report.restoredRowTop).toBeLessThanOrEqual(80)
    expect(report.hash).toBe('')
  } finally {
    await context.close()
  }
})

test('caption clicks select the whole caption without opening line mode', async () => {
  const { context, page } = await newPage()
  try {
    const target = photoGalleryData[0]
    await page.locator(`[data-photo-id="${target.id}"] [data-photo-caption]`).click()

    await page.waitForFunction(
      text => {
        const node = document.querySelector('#oracle-report')
        if (!node?.textContent) {
          return false
        }

        try {
          const report = JSON.parse(node.textContent) as { selectedText?: string; focusedId?: string | null }
          return report.selectedText === text && report.focusedId == null
        } catch {
          return false
        }
      },
      target.prompt,
      { timeout: 10_000 },
    )

    const report = await readReport(page)
    expect(report.phase).toBe('ready')
    expect(report.selectedText).toBe(target.prompt)
    expect(report.focusedId).toBeNull()
    expect(report.hash).toBe('')
  } finally {
    await context.close()
  }
})

test('grid occlusion mounts fewer cards than the total photo count', async () => {
  const { context, page } = await newPage()
  try {
    const report = await readReport(page)
    expect(report.phase).toBe('ready')
    expect(report.totalCount).toBe(photoGalleryData.length)
    expect(report.mountedCount).toBeLessThan(photoGalleryData.length)
    expect(report.mountedCount).toBeGreaterThan(0)
  } finally {
    await context.close()
  }
})
