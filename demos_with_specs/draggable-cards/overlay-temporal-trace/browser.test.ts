import { afterAll, beforeAll, expect, test } from 'bun:test'
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright'
import { join } from 'node:path'

const ROOT = '/Users/chenglou/github/vibescript/demos_with_specs/draggable-cards/overlay-temporal-trace'
const TIMEOUT = 30_000

let server: Bun.Server | null = null
let browser: Browser | null = null

type Report = {
  phase: 'loading' | 'ready' | 'error'
  requestId: string
  scenario: string
  status: 'idle' | 'dragging' | 'settling'
  order: number[]
  activeId: number | null
  lastDraggedId: number | null
  topmostId: number
  message?: string
}

beforeAll(async () => {
  server = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    fetch(request) {
      const url = new URL(request.url)
      const pathname = url.pathname === '/' ? '/index.html' : url.pathname
      const filePath = join(ROOT, pathname)

      const file = Bun.file(filePath)
      if (!file.size) {
        return new Response('not found', { status: 404 })
      }

      const headers = new Headers()
      if (pathname.endsWith('.html')) headers.set('content-type', 'text/html; charset=utf-8')
      if (pathname.endsWith('.js')) headers.set('content-type', 'text/javascript; charset=utf-8')
      if (pathname.endsWith('.css')) headers.set('content-type', 'text/css; charset=utf-8')

      return new Response(file, { headers })
    },
  })

  browser = await chromium.launch({ headless: true })
})

afterAll(async () => {
  await browser?.close()
  server?.stop()
})

async function openPage(scenario: string) {
  if (!server) throw new Error('server not started')
  if (!browser) throw new Error('browser not started')

  const context: BrowserContext = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  const page: Page = await context.newPage()
  const requestId = `${Date.now()}-${Math.random().toString(36).slice(2)}`
  const url = `http://127.0.0.1:${server.port}/index.html?scenario=${encodeURIComponent(scenario)}&requestId=${encodeURIComponent(requestId)}`

  await page.goto(url)
  await page.waitForFunction((id) => {
    const hash = location.hash
    if (!hash.startsWith('#report=')) return false
    const report = JSON.parse(decodeURIComponent(hash.slice('#report='.length))) as Report
    return report.requestId === id && report.phase === 'ready'
  }, requestId, { timeout: TIMEOUT })

  return { context, page, requestId }
}

async function readReport(page: Page): Promise<Report> {
  return page.evaluate(() => {
    const hash = location.hash
    if (!hash.startsWith('#report=')) {
      throw new Error('missing report hash')
    }

    return JSON.parse(decodeURIComponent(hash.slice('#report='.length))) as Report
  })
}

async function dragCard1DownPastCard2(page: Page) {
  const card1 = page.locator('[data-card-id="1"]')
  const card2 = page.locator('[data-card-id="2"]')
  const card1Box = await card1.boundingBox()
  const card2Box = await card2.boundingBox()
  if (!card1Box || !card2Box) throw new Error('missing card boxes')

  const startX = card1Box.x + card1Box.width / 2
  const startY = card1Box.y + card1Box.height / 2
  const crossY = card2Box.y + card2Box.height / 2 + 8

  await page.mouse.move(startX, startY)
  await page.mouse.down()
  await page.mouse.move(startX, crossY, { steps: 8 })
}

test('downward drag trace reorders before release and closes the gap immediately', { timeout: TIMEOUT }, async () => {
  const { context, page } = await openPage('downward-trace')
  try {
    const card2Before = await page.locator('[data-card-id="2"]').boundingBox()
    if (!card2Before) throw new Error('missing card 2 before drag')

    await dragCard1DownPastCard2(page)
    await page.waitForTimeout(40)

    const reportDuringDrag = await readReport(page)
    const card2After = await page.locator('[data-card-id="2"]').boundingBox()
    if (!card2After) throw new Error('missing card 2 after drag')

    expect(reportDuringDrag.order).toEqual([2, 1, 3, 4, 5])
    expect(reportDuringDrag.status).toBe('dragging')
    expect(card2After.y).toBeLessThan(card2Before.y)

    await page.mouse.up()
    await page.waitForFunction(() => {
      const hash = location.hash
      if (!hash.startsWith('#report=')) return false
      const report = JSON.parse(decodeURIComponent(hash.slice('#report='.length))) as Report
      return report.status === 'idle' && report.requestId.length > 0
    }, undefined, { timeout: TIMEOUT })

    const reportAfterSettle = await readReport(page)
    expect(reportAfterSettle.activeId).toBeNull()
    expect(reportAfterSettle.lastDraggedId).toBeNull()
    expect(reportAfterSettle.order).toEqual([2, 1, 3, 4, 5])
    expect(reportAfterSettle.topmostId).toBe(5)
  } finally {
    await context.close()
  }
})

test('released card stays topmost until the settle finishes', { timeout: TIMEOUT }, async () => {
  const { context, page } = await openPage('top-during-settle')
  try {
    await dragCard1DownPastCard2(page)
    await page.waitForTimeout(20)

    const reportWhileDragging = await readReport(page)
    expect(reportWhileDragging.topmostId).toBe(1)

    await page.mouse.up()
    await page.waitForTimeout(40)

    const reportWhileSettling = await readReport(page)
    expect(reportWhileSettling.status).toBe('settling')
    expect(reportWhileSettling.lastDraggedId).toBe(1)
    expect(reportWhileSettling.topmostId).toBe(1)

    await page.waitForFunction(() => {
      const hash = location.hash
      if (!hash.startsWith('#report=')) return false
      const report = JSON.parse(decodeURIComponent(hash.slice('#report='.length))) as Report
      return report.status === 'idle'
    }, undefined, { timeout: TIMEOUT })

    const reportAfterSettle = await readReport(page)
    expect(reportAfterSettle.topmostId).toBe(5)
  } finally {
    await context.close()
  }
})
