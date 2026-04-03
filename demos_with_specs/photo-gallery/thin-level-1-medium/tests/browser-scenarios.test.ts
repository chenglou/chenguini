import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { chromium, type Browser, type Page } from 'playwright'
import { extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

type ScenarioReport = {
  phase: 'loading' | 'running' | 'ready' | 'error'
  requestId: string
  scenario: string
  mode?: 'grid' | 'line'
  focusedId?: string | null
  selectedText?: string
  mountedCount?: number
  totalCount?: number
  restoreGap?: number
  hash?: string
  message?: string
}

type StaticServer = {
  hostname: string
  port: number
  stop(closeConnections?: boolean): void
}

const demoDir = fileURLToPath(new URL('..', import.meta.url))
const distDir = join(demoDir, '.test-dist')
const indexHtmlPath = join(demoDir, 'index.html')
const indexTsPath = join(demoDir, 'index.ts')

let browser: Browser
let server: StaticServer
let baseUrl = ''

beforeAll(async () => {
  await Bun.$`rm -rf ${distDir}`.quiet()

  const build = await Bun.build({
    entrypoints: [indexTsPath],
    outdir: distDir,
    splitting: false,
    target: 'browser',
  })

  if (!build.success) {
    throw new Error(build.logs.map((log) => log.message).join('\n'))
  }

  const sourceHtml = await Bun.file(indexHtmlPath).text()
  await Bun.write(join(distDir, 'index.html'), sourceHtml.replace('./index.ts', './index.js'))

  server = Bun.serve({
    hostname: '0.0.0.0',
    port: 0,
    async fetch(request) {
      const url = new URL(request.url)
      const pathname = url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname)
      const file = Bun.file(join(distDir, pathname.slice(1)))

      if (!(await file.exists())) {
        return new Response('Not found', { status: 404 })
      }

      return new Response(file, {
        headers: {
          'content-type': contentTypeForPath(pathname),
        },
      })
    },
  })

  baseUrl = await pickLoopbackBaseUrl(server.port)
  browser = await chromium.launch({ headless: true })
})

afterAll(async () => {
  await browser.close()
  server.stop(true)
  await Bun.$`rm -rf ${distDir}`.quiet()
})

describe('browser-backed scenarios', () => {
  test(
    'hash sync reopens the focused image from the hash route',
    async () => {
      const expectedId = '2ca7a0f7-9153-45ce-be2b-1fc89327f61b/0_0'
      const report = await runScenario(
        'hash-sync',
        `#photo=${encodeURIComponent(expectedId)}`,
      )

      expect(report.phase).toBe('ready')
      expect(report.mode).toBe('line')
      expect(report.focusedId).toBe(expectedId)
      expect(report.hash).toBe(`#photo=${encodeURIComponent(expectedId)}`)
    },
    35_000,
  )

  test(
    'dismiss restore returns to grid mode with about 40px above the focused row',
    async () => {
      const report = await runScenario('dismiss-restore')

      expect(report.phase).toBe('ready')
      expect(report.mode).toBe('grid')
      expect(report.restoreGap).toBeDefined()
      expect(report.restoreGap).toBeGreaterThanOrEqual(35)
      expect(report.restoreGap).toBeLessThanOrEqual(45)
      expect(report.hash).toBe('')
    },
    35_000,
  )

  test(
    'caption selection selects the full prompt and stays in grid mode',
    async () => {
      const report = await runScenario('caption-selection')

      expect(report.phase).toBe('ready')
      expect(report.mode).toBe('grid')
      expect(report.selectedText).toBe(
        'Hourglass heart, liquid, grand canyon background, fleeting, ephemerality of time',
      )
    },
    35_000,
  )

  test(
    'representative grid occlusion mounts fewer cards than the full data set',
    async () => {
      const report = await runScenario('occlusion')

      expect(report.phase).toBe('ready')
      expect(report.mountedCount).toBeDefined()
      expect(report.totalCount).toBeDefined()
      expect(report.mountedCount).toBeGreaterThan(0)
      expect(report.totalCount).toBeGreaterThan(report.mountedCount ?? 0)
    },
    35_000,
  )
})

async function runScenario(scenario: string, hash = ''): Promise<ScenarioReport> {
  const requestId = crypto.randomUUID()
  const page = await browser.newPage({ viewport: { width: 1_280, height: 720 } })

  try {
    const url = `${baseUrl}/index.html?scenario=${encodeURIComponent(scenario)}&requestId=${encodeURIComponent(requestId)}${hash}`
    await page.goto(url, { waitUntil: 'domcontentloaded' })
    return await waitForReadyReport(page, requestId)
  } finally {
    await page.close()
  }
}

async function waitForReadyReport(page: Page, requestId: string): Promise<ScenarioReport> {
  await page.waitForFunction(
    (expectedRequestId) => {
      const node = document.querySelector('#scenario-report')
      if (!(node instanceof HTMLScriptElement)) {
        return false
      }

      try {
        const report = JSON.parse(node.textContent ?? 'null') as ScenarioReport | null
        return (
          report != null &&
          report.requestId === expectedRequestId &&
          (report.phase === 'ready' || report.phase === 'error')
        )
      } catch {
        return false
      }
    },
    requestId,
    { timeout: 35_000 },
  )

  const raw = await page.locator('#scenario-report').textContent()
  const report = JSON.parse(raw ?? 'null') as ScenarioReport | null

  if (report == null) {
    throw new Error('Scenario report missing')
  }

  if (report.requestId !== requestId) {
    throw new Error(`Scenario report requestId mismatch: ${report.requestId}`)
  }

  if (report.phase === 'error') {
    throw new Error(report.message ?? `Scenario ${report.scenario} failed`)
  }

  return report
}

async function pickLoopbackBaseUrl(port: number): Promise<string> {
  const candidates = [
    `http://127.0.0.1:${port}`,
    `http://localhost:${port}`,
    `http://[::1]:${port}`,
  ]

  for (const candidate of candidates) {
    try {
      const response = await fetch(`${candidate}/index.html`)
      if (response.ok) {
        return candidate
      }
    } catch {
      // Try the next loopback host.
    }
  }

  throw new Error(`No loopback host responded on port ${port}`)
}

function contentTypeForPath(pathname: string): string {
  switch (extname(pathname)) {
    case '.html':
      return 'text/html; charset=utf-8'
    case '.js':
      return 'text/javascript; charset=utf-8'
    case '.css':
      return 'text/css; charset=utf-8'
    case '.json':
      return 'application/json; charset=utf-8'
    case '.svg':
      return 'image/svg+xml'
    default:
      return 'application/octet-stream'
  }
}
