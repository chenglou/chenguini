import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { chromium, type Browser, type Page } from 'playwright'

type Report = {
  phase: 'loading' | 'running' | 'ready' | 'error'
  requestId: string
  scenario: string
  orderedCardIds?: number[]
  topItemId?: number | null
  draggedCardId?: number | null
  lastDraggedId?: number | null
  message?: string
}

let server: ReturnType<typeof Bun.serve> | null = null
let browser: Browser | null = null
const rootDir = import.meta.dir
const transpiler = new Bun.Transpiler({ loader: 'ts' })

beforeAll(async () => {
  server = Bun.serve({
    port: 0,
    async fetch(request) {
      const url = new URL(request.url)
      const pathname = url.pathname === '/' ? '/index.html' : url.pathname
      const filePath = `${rootDir}${pathname}`

      const file = Bun.file(filePath)
      if (!(await file.exists())) {
        return new Response('not found', { status: 404 })
      }

      if (filePath.endsWith('.ts')) {
        return new Response(transpiler.transformSync(await file.text()), {
          headers: { 'content-type': 'text/javascript; charset=utf-8' },
        })
      }

      if (filePath.endsWith('.html')) {
        return new Response(file, { headers: { 'content-type': 'text/html; charset=utf-8' } })
      }

      return new Response(file)
    },
  })

  browser = await chromium.launch({ headless: true })
})

afterAll(async () => {
  await browser?.close()
  server?.stop()
})

function parseReport(hash: string): Report | null {
  if (!hash.startsWith('#report=')) return null

  try {
    return JSON.parse(decodeURIComponent(hash.slice('#report='.length))) as Report
  } catch {
    return null
  }
}

async function openScenario(scenario: string) {
  if (!server || !browser) throw new Error('browser test harness not ready')

  const context = await browser.newContext({
    viewport: { width: 960, height: 900 },
  })
  const page = await context.newPage()
  const requestId = crypto.randomUUID()
  const url = `http://127.0.0.1:${server.port}/index.html?scenario=${encodeURIComponent(scenario)}&requestId=${encodeURIComponent(requestId)}`

  await page.goto(url)
  return { context, page, requestId }
}

async function waitForReport(
  page: Page,
  requestId: string,
  predicate: (report: Report) => boolean,
  timeoutMs = 15_000,
) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const report = parseReport(await page.evaluate(() => location.hash))
    if (report?.requestId === requestId && predicate(report)) return report
    await page.waitForTimeout(25)
  }
  throw new Error(`timed out waiting for report ${requestId}`)
}

describe('browser-backed semantic checks', () => {
  test('reaches ready after the scripted drag reorders the stack', async () => {
    const { context, page, requestId } = await openScenario('reorder')

    try {
      const report = await waitForReport(page, requestId, (value) => value.phase === 'ready')
      expect(report.orderedCardIds).toEqual([1, 0, 2, 3, 4])
    } finally {
      await context.close()
    }
  })

  test('reports the released card as top item while it settles', async () => {
    const { context, page, requestId } = await openScenario('release-depth')

    try {
      const settlingReport = await waitForReport(
        page,
        requestId,
        (value) => value.phase === 'running' && value.lastDraggedId != null,
      )

      expect(settlingReport.topItemId).toBe(settlingReport.lastDraggedId)

      const readyReport = await waitForReport(page, requestId, (value) => value.phase === 'ready')
      expect(readyReport.orderedCardIds).toHaveLength(5)
    } finally {
      await context.close()
    }
  })
})
