import { afterAll, beforeAll, expect, test } from 'bun:test'
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium, type Page } from 'playwright'

type Snapshot = {
  orderedCardIds: number[]
  topCardId: number | null
  draggedCardId: number | null
  lastDraggedId: number | null
  isAnimating: boolean
  cursor: string
}

type BrowserReport = {
  phase: 'loading' | 'running' | 'ready' | 'error'
  requestId: string
  scenario: string
  message?: string
  initialOrder?: number[]
  duringDragOrder?: number[]
  finalOrder?: number[]
  duringSettle?: Snapshot
  afterSettle?: Snapshot
}

let serverProcess: ChildProcessWithoutNullStreams | null = null
let browser: Awaited<ReturnType<typeof chromium.launch>> | null = null
let baseUrl = ''
const roundDir = dirname(fileURLToPath(import.meta.url))

beforeAll(async () => {
  const serverReady = new Promise<string>((resolve, reject) => {
    serverProcess = spawn('bun', ['./browser-test-server.ts', '0'], {
      cwd: roundDir,
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    serverProcess.stdout.on('data', (chunk) => {
      const text = chunk.toString()
      const match = text.match(/READY (\d+)/)
      if (match != null) resolve(`http://127.0.0.1:${match[1]}`)
    })

    serverProcess.stderr.on('data', (chunk) => {
      const text = chunk.toString()
      if (text.length > 0) reject(new Error(text))
    })

    serverProcess.on('exit', (code) => {
      if (code !== 0) reject(new Error(`browser server exited with code ${code}`))
    })
  })

  baseUrl = await serverReady
  browser = await chromium.launch({ headless: true })
})

afterAll(async () => {
  await browser?.close()
  browser = null
  serverProcess?.kill('SIGTERM')
  serverProcess = null
})

async function readScenarioReport(page: Page, scenario: string) {
  const requestId = `${scenario}-${Date.now()}`
  await page.goto(`${baseUrl}/index.html?report=1&scenario=${encodeURIComponent(scenario)}&requestId=${encodeURIComponent(requestId)}`)
  await page.waitForFunction(({ requestId: expectedRequestId }) => {
    if (!location.hash.startsWith('#report=')) return false
    const report = JSON.parse(decodeURIComponent(location.hash.slice('#report='.length))) as BrowserReport
    return report.requestId === expectedRequestId && report.phase === 'ready'
  }, { requestId })
  const hash = await page.evaluate(() => location.hash)
  const report = JSON.parse(decodeURIComponent(hash.slice('#report='.length))) as BrowserReport
  expect(report.requestId).toBe(requestId)
  expect(report.phase).toBe('ready')
  return report
}

test('dragging through the stack reorders before release', async () => {
  const page = await browser!.newPage()
  const report = await readScenarioReport(page, 'reorder-before-release')

  expect(report.initialOrder).toEqual([0, 1, 2, 3, 4])
  expect(report.duringDragOrder).toEqual([0, 2, 3, 1, 4])
  expect(report.finalOrder).toEqual([0, 2, 3, 1, 4])
  expect(report.duringDragOrder).not.toEqual(report.initialOrder)

  await page.close()
})

test('the released card stays above the stack until it settles', async () => {
  const page = await browser!.newPage()
  const report = await readScenarioReport(page, 'release-depth')

  expect(report.duringSettle).toEqual({
    orderedCardIds: [0, 1, 3, 2, 4],
    topCardId: 2,
    draggedCardId: null,
    lastDraggedId: 2,
    isAnimating: true,
    cursor: 'grab',
  })
  expect(report.afterSettle).toEqual({
    orderedCardIds: [0, 1, 3, 2, 4],
    topCardId: 4,
    draggedCardId: null,
    lastDraggedId: null,
    isAnimating: false,
    cursor: 'grab',
  })

  await page.close()
})
