import {afterAll, beforeAll, describe, expect, test} from 'bun:test'
import {mkdtemp, rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {chromium} from 'playwright'

import {estimateReleaseVelocity, reorderIdsForPointer} from './dragMath'

const roundDir = '/Users/chenglou/github/vibescript/demos_with_specs/draggable-cards/round-02'

type ScenarioReport = {
  status: 'loading' | 'running' | 'ready' | 'error'
  requestId: string
  scenario?: string
  order?: number[]
  orderBeforeRelease?: number[]
  draggedId?: number | null
  lastDraggedId?: number | null
  cursor?: string
  swapOccurred?: boolean
  topZId?: number | null
  zOrder?: number[]
  settling?: boolean
  error?: string
}

let buildDir = ''
let server: ReturnType<typeof Bun.serve> | null = null

beforeAll(async () => {
  buildDir = await mkdtemp(join(tmpdir(), 'draggable-cards-round-02-'))
  const result = await Bun.build({
    entrypoints: [join(roundDir, 'index.ts')],
    outdir: buildDir,
    target: 'browser',
    naming: '[name].js',
  })
  if (!result.success) {
    throw new AggregateError(result.logs, 'failed to build round-02 browser bundle')
  }

  server = Bun.serve({
    port: 0,
    fetch(request) {
      const url = new URL(request.url)
      if (url.pathname === '/' || url.pathname === '/index.html') {
        return new Response(Bun.file(join(roundDir, 'index.html')), {
          headers: {'content-type': 'text/html; charset=utf-8'},
        })
      }
      if (url.pathname === '/index.ts') {
        return new Response(Bun.file(join(buildDir, 'index.js')), {
          headers: {'content-type': 'text/javascript; charset=utf-8'},
        })
      }
      return new Response('not found', {status: 404})
    },
  })
})

afterAll(async () => {
  server?.stop(true)
  if (buildDir !== '') {
    await rm(buildDir, {recursive: true, force: true})
  }
})

describe('reorderIdsForPointer', () => {
  test('swaps upward once the pointer crosses the previous midpoint', () => {
    expect(
      reorderIdsForPointer([0, 1, 2], 1, 99, 50, {
        0: 100,
        1: 100,
        2: 100,
      }),
    ).toEqual([1, 0, 2])
  })

  test('can move across multiple neighbors in one drag sample', () => {
    expect(
      reorderIdsForPointer([0, 1, 2, 3], 0, 401, 50, {
        0: 100,
        1: 100,
        2: 100,
        3: 100,
      }),
    ).toEqual([1, 2, 3, 0])
  })
})

describe('estimateReleaseVelocity', () => {
  test('uses roughly the last 100ms of pointer history', () => {
    expect(
      estimateReleaseVelocity(
        [
          {x: 0, y: 0, time: 0},
          {x: 10, y: 20, time: 80},
          {x: 50, y: 60, time: 120},
          {x: 90, y: 100, time: 160},
        ],
        160,
      ),
    ).toEqual({vx: 1000, vy: 1000})
  })
})

async function runScenario(scenario: string): Promise<ScenarioReport> {
  if (server == null) {
    throw new Error('browser server not ready')
  }

  const browser = await chromium.launch({headless: true})
  const page = await browser.newPage({viewport: {width: 900, height: 900}})
  const requestId = `req-${Date.now()}-${Math.random().toString(36).slice(2)}`
  const url = `http://127.0.0.1:${server.port}/?requestId=${encodeURIComponent(requestId)}&scenario=${encodeURIComponent(scenario)}`

  await page.goto(url)
  await page.waitForFunction(
    expectedRequestId => {
      const match = location.hash.match(/report=([^&]+)/)
      if (match == null) return false
      const report = JSON.parse(decodeURIComponent(match[1]!)) as ScenarioReport
      return report.requestId === expectedRequestId && (report.status === 'ready' || report.status === 'error')
    },
    requestId,
    {timeout: 10000},
  )
  const report = await page.evaluate(() => {
    const match = location.hash.match(/report=([^&]+)/)
    if (match == null) {
      throw new Error('missing report hash')
    }
    return JSON.parse(decodeURIComponent(match[1]!)) as ScenarioReport
  })
  await browser.close()
  return report
}

describe('browser scenarios', () => {
  test('scripted drag changes order while dragging', async () => {
    const report = await runScenario('drag-reorder')
    expect(report.status).toBe('ready')
    expect(report.swapOccurred).toBe(true)
    expect(report.orderBeforeRelease).toEqual([0, 2, 1, 3, 4])
    expect(report.draggedId).toBe(1)
    expect(report.cursor).toBe('grabbing')
  })

  test('released card keeps elevated depth while it settles', async () => {
    const report = await runScenario('release-depth')
    expect(report.status).toBe('ready')
    expect(report.draggedId).toBeNull()
    expect(report.lastDraggedId).toBe(1)
    expect(report.settling).toBe(true)
    expect(report.topZId).toBe(1)
    expect(report.zOrder?.[0]).toBe(1)
  })
})
