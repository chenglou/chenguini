import { afterAll, beforeAll, expect, test } from 'bun:test'
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { createCards, layoutCards } from './logic.js'

type ScenarioReport = {
  phase: 'loading' | 'running' | 'ready' | 'error'
  requestId: string
  scenario: string
  orderedIds: string[]
  topId: string
  draggedId: string | null
  lastDraggedId: string | null
  message?: string
}

const __dirname = resolve(fileURLToPath(import.meta.url), '..')
const viewport = { width: 1000, height: 900 }

let browser: Browser | null = null
let server: ReturnType<typeof Bun.serve> | null = null

beforeAll(async () => {
  server = Bun.serve({
    port: 0,
    fetch(request) {
      const url = new URL(request.url)
      let pathname = decodeURIComponent(url.pathname)
      if (pathname === '/') pathname = '/index.html'

      const filePath = resolve(__dirname, '.' + pathname)
      if (!filePath.startsWith(__dirname)) {
        return new Response('forbidden', { status: 403 })
      }
      if (!existsSync(filePath)) {
        return new Response('not found', { status: 404 })
      }
      return new Response(Bun.file(filePath))
    },
  })

  browser = await chromium.launch({ headless: true })
})

afterAll(async () => {
  await browser?.close()
  server?.stop()
})

test('reorders before release', async () => {
  const { context, page } = await openPage()
  try {
    const requestId = crypto.randomUUID()
    const scenario = 'reorder-before-release'
    await page.goto(`${baseUrl()}/?scenario=${encodeURIComponent(scenario)}&requestId=${encodeURIComponent(requestId)}`)
    await page.waitForLoadState('domcontentloaded')

    const cards = createCards()
    const initialOrder = cards.map(card => card.id)
    const initialLayout = layoutCards(initialOrder, cards, viewport.width)

    const initialReady = await waitForReport(page, requestId, report => report.phase === 'ready')
    expect(initialReady.orderedIds).toEqual(initialOrder)

    await page.mouse.move(initialLayout['0'].x + 30, initialLayout['0'].y + 18)
    await page.mouse.down()

    const cardOne = cards[1]
    const cardTwo = cards[2]
    if (cardOne == null || cardTwo == null) throw new Error('missing cards for reorder test')

    await page.mouse.move(initialLayout['0'].x + 30, initialLayout['1'].y + cardOne.height / 2 + 12)
    const firstSwap = await waitForReport(
      page,
      requestId,
      report =>
        report.phase === 'running' &&
        report.draggedId === '0' &&
        orderedIdsMatch(report, ['1', '0', '2', '3', '4']),
    )
    expect(firstSwap.orderedIds).toEqual(['1', '0', '2', '3', '4'])

    const layoutAfterSwap = layoutCards(firstSwap.orderedIds, cards, viewport.width)
    await page.mouse.move(layoutAfterSwap['0'].x + 30, layoutAfterSwap['2'].y + cardTwo.height / 2 + 12)

    const secondSwap = await waitForReport(
      page,
      requestId,
      report =>
        report.phase === 'running' &&
        report.draggedId === '0' &&
        orderedIdsMatch(report, ['1', '2', '0', '3', '4']),
    )
    expect(secondSwap.orderedIds).toEqual(['1', '2', '0', '3', '4'])

    await page.mouse.up()

    const ready = await waitForReport(page, requestId, report => report.phase === 'ready')
    expect(ready.orderedIds).toEqual(['1', '2', '0', '3', '4'])
  } finally {
    await context.close()
  }
})

test('released card stays on top while it settles', async () => {
  const { context, page } = await openPage()
  try {
    const requestId = crypto.randomUUID()
    const scenario = 'release-depth'
    await page.goto(`${baseUrl()}/?scenario=${encodeURIComponent(scenario)}&requestId=${encodeURIComponent(requestId)}`)
    await page.waitForLoadState('domcontentloaded')

    const cards = createCards()
    const initialOrder = cards.map(card => card.id)
  const layout = layoutCards(initialOrder, cards, viewport.width)

    await waitForReport(page, requestId, report => report.phase === 'ready')

    await page.mouse.move(layout['2'].x + 30, layout['2'].y + 22)
    await page.mouse.down()
    await page.mouse.move(layout['2'].x + 30, layout['0'].y - 120)
    await page.waitForTimeout(25)
    await page.mouse.up()

    const settling = await waitForReport(
      page,
      requestId,
      report =>
        report.phase === 'running' &&
        report.topId === '2' &&
        report.lastDraggedId === '2' &&
        report.draggedId == null,
    )
    expect(settling.topId).toBe('2')
    expect(settling.lastDraggedId).toBe('2')

    const ready = await waitForReport(page, requestId, report => report.phase === 'ready')
    expect(ready.lastDraggedId).toBeNull()
  } finally {
    await context.close()
  }
})

function baseUrl() {
  if (server == null) throw new Error('server not ready')
  return `http://127.0.0.1:${server.port}`
}

async function openPage() {
  if (browser == null) throw new Error('browser not ready')
  const context = await browser.newContext({ viewport })
  const page = await context.newPage()
  return { context, page }
}

async function readReport(page: Page): Promise<ScenarioReport | null> {
  const hash = await page.evaluate(() => location.hash)
  if (!hash.startsWith('#report=')) return null
  const value = new URLSearchParams(hash.slice(1)).get('report')
  if (value == null) return null
  return JSON.parse(value) as ScenarioReport
}

async function waitForReport(
  page: Page,
  requestId: string,
  predicate: (report: ScenarioReport) => boolean,
  timeoutMs = 15_000,
) {
  const deadline = Date.now() + timeoutMs
  let lastReport: ScenarioReport | null = null

  while (Date.now() < deadline) {
    const report = await readReport(page)
    if (report != null && report.requestId === requestId) {
      lastReport = report
      if (predicate(report)) return report
    }
    await page.waitForTimeout(25)
  }

  throw new Error(`Timed out waiting for report. Last report: ${JSON.stringify(lastReport)}`)
}

function orderedIdsMatch(report: ScenarioReport, expected: string[]) {
  return report.orderedIds.length === expected.length && report.orderedIds.every((id, index) => id === expected[index])
}
