import { expect, test } from '@playwright/test'
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

type BrowserReport = {
  status: 'ready' | 'error'
  requestId: string
  message?: string
  scenario?: string
  initialOrder?: number[]
  finalOrder?: number[]
  swapOccurred?: boolean
  draggedId?: number | null
  lastDraggedId?: number | null
  cursor?: string
  duringSettle?: {
    draggedId: number | null
    lastDraggedId: number | null
    zOrder: number[]
    isAnimating: boolean
  }
  afterSettle?: {
    draggedId: number | null
    lastDraggedId: number | null
    zOrder: number[]
    isAnimating: boolean
  }
}

let serverProcess: ChildProcessWithoutNullStreams | null = null
let baseUrl = ''
const roundDir = dirname(fileURLToPath(import.meta.url))

test.beforeAll(async () => {
  const serverReady = new Promise<string>((resolve, reject) => {
    serverProcess = spawn('bun', ['./browser-test-server.ts', '0'], {
      cwd: roundDir,
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    serverProcess.stdout.on('data', (chunk) => {
      const text = chunk.toString()
      const match = text.match(/READY (\d+)/)
      if (match != null) {
        resolve(`http://127.0.0.1:${match[1]}`)
      }
    })

    serverProcess.stderr.on('data', (chunk) => {
      const text = chunk.toString()
      if (text.length > 0) {
        reject(new Error(text))
      }
    })

    serverProcess.on('exit', (code) => {
      if (code !== 0) reject(new Error(`browser server exited with code ${code}`))
    })
  })

  baseUrl = await serverReady
})

test.afterAll(async () => {
  serverProcess?.kill('SIGTERM')
  serverProcess = null
})

async function readScenarioReport(pageUrl: string, page: import('@playwright/test').Page) {
  await page.goto(pageUrl)
  await page.waitForFunction(() => location.hash.startsWith('#report='))
  const hash = await page.evaluate(() => location.hash)
  const encoded = hash.slice('#report='.length)
  return JSON.parse(decodeURIComponent(encoded)) as BrowserReport
}

test('scripted drag changes order while dragging', async ({ page }) => {
  const requestId = `reorder-${Date.now()}`
  const report = await readScenarioReport(`${baseUrl}/index.html?report=1&scenario=reorder-drag&requestId=${requestId}`, page)

  expect(report.status).toBe('ready')
  expect(report.requestId).toBe(requestId)
  expect(report.initialOrder).toEqual([0, 1, 2, 3, 4])
  expect(report.finalOrder).toEqual([0, 2, 3, 1, 4])
  expect(report.swapOccurred).toBe(true)
  expect(report.draggedId).toBe(null)
  expect(report.cursor).toBe('auto')
})

test('released card keeps elevated depth until it settles', async ({ page }) => {
  const requestId = `depth-${Date.now()}`
  const report = await readScenarioReport(`${baseUrl}/index.html?report=1&scenario=release-depth&requestId=${requestId}`, page)

  expect(report.status).toBe('ready')
  expect(report.requestId).toBe(requestId)
  expect(report.duringSettle).toEqual({
    draggedId: null,
    lastDraggedId: 2,
    zOrder: [0, 1, 3, 4, 2],
    isAnimating: true,
  })
  expect(report.afterSettle).toEqual({
    draggedId: null,
    lastDraggedId: null,
    zOrder: [0, 1, 2, 3, 4],
    isAnimating: false,
  })
})
