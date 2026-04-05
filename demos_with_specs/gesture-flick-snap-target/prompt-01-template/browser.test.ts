import {afterAll, beforeAll, describe, expect, test} from 'bun:test'

import {existsSync, mkdtempSync, readFileSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join, resolve} from 'node:path'

import {chooseNearestCorner, getCornerTargets, type CornerId} from './pip'

type Point = {x: number; y: number}

type Report = {
  phase: 'loading' | 'running' | 'ready' | 'error'
  requestId: string
  scenario: string
  viewport?: {width: number; height: number}
  completedWith?: 'mouseup' | 'touchend' | 'touchcancel'
  chosenCornerId?: CornerId | null
  finalCornerId?: CornerId | null
  restPosition?: Point | null
  finalPosition?: Point | null
  maxDragOffsetError?: number
  restMarkerVisible?: boolean
  message?: string
}

type CdpResult = {
  result?: {
    value?: string
  }
}

const rootDir = resolve(import.meta.dir)

let server: Bun.Server
let origin = ''

beforeAll(async () => {
  const transpiler = new Bun.Transpiler({loader: 'ts', target: 'browser'})

  server = Bun.serve({
    port: 0,
    async fetch(req) {
      const url = new URL(req.url)
      if (url.pathname === '/health') return new Response('ok')

      const relativePath = url.pathname === '/' ? '/index.html' : url.pathname
      const filePath = resolve(rootDir, `.${relativePath}`)
      if (!filePath.startsWith(rootDir) || !existsSync(filePath)) {
        return new Response('not found', {status: 404})
      }

      if (filePath.endsWith('.ts')) {
        const source = readFileSync(filePath, 'utf8')
        const js = transpiler.transformSync(source)
        return new Response(js, {
          headers: {'content-type': 'application/javascript; charset=utf-8'},
        })
      }

      if (filePath.endsWith('.html')) {
        return new Response(Bun.file(filePath), {
          headers: {'content-type': 'text/html; charset=utf-8'},
        })
      }

      return new Response(Bun.file(filePath))
    },
  })

  origin = await probeLoopbackOrigin(server.port)
})

afterAll(() => {
  server.stop(true)
})

describe('gesture flick snap target browser semantics', () => {
  test('drag keeps the PiP under the pointer before release and touchcancel still snaps cleanly', async () => {
    const report = await runScenario('drag-under-pointer-touchcancel')

    expect(report.scenario).toBe('drag-under-pointer-touchcancel')
    expect(report.completedWith).toBe('touchcancel')
    expect(report.maxDragOffsetError).toBeLessThan(0.75)
    expect(report.chosenCornerId).toBe('bottom-left')
  })

  test('fast flick toward the upper-right lands at the upper-right corner', async () => {
    const report = await runScenario('flick-upper-right-mouseup')

    expect(report.completedWith).toBe('mouseup')
    expect(report.viewport).not.toBeNull()
    expect(report.viewport!.width).toBeGreaterThan(0)
    expect(report.viewport!.height).toBeGreaterThan(0)
    expect(report.chosenCornerId).toBe('top-right')
    expect(report.finalCornerId).toBe('top-right')
    expect(report.restMarkerVisible).toBe(true)
    expect(report.restPosition).not.toBeNull()
    expect(report.finalPosition).not.toBeNull()

    const corners = getCornerTargets(report.viewport!)
    const topRight = corners.find((corner) => corner.id === 'top-right')!

    expect(chooseNearestCorner(corners, report.restPosition!).id).toBe('top-right')
    expect(report.finalPosition!.x).toBeCloseTo(topRight.x, 1)
    expect(report.finalPosition!.y).toBeCloseTo(topRight.y, 1)
  })

  test('slower release toward the lower-right lands at the lower-right corner and reports the blue rest point', async () => {
    const report = await runScenario('flick-lower-right-touchend')

    expect(report.completedWith).toBe('touchend')
    expect(report.viewport).not.toBeNull()
    expect(report.viewport!.width).toBeGreaterThan(0)
    expect(report.viewport!.height).toBeGreaterThan(0)
    expect(report.chosenCornerId).toBe('bottom-right')
    expect(report.finalCornerId).toBe('bottom-right')
    expect(report.restMarkerVisible).toBe(true)
    expect(report.restPosition).not.toBeNull()
    expect(report.finalPosition).not.toBeNull()

    const corners = getCornerTargets(report.viewport!)
    const bottomRight = corners.find((corner) => corner.id === 'bottom-right')!

    expect(chooseNearestCorner(corners, report.restPosition!).id).toBe('bottom-right')
    expect(report.finalPosition!.x).toBeCloseTo(bottomRight.x, 1)
    expect(report.finalPosition!.y).toBeCloseTo(bottomRight.y, 1)
  })
})

async function runScenario(scenario: string): Promise<Report> {
  const requestId = crypto.randomUUID()
  const url = `${origin}/index.html?scenario=${encodeURIComponent(scenario)}&requestId=${encodeURIComponent(requestId)}`
  const chromePath = getChromePath()
  const profileDir = mkdtempSync(join(tmpdir(), 'gesture-flick-snap-target-'))
  const chrome = Bun.spawn([
    chromePath,
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    '--mute-audio',
    '--no-first-run',
    '--no-default-browser-check',
    '--window-size=800,600',
    '--remote-debugging-port=0',
    `--user-data-dir=${profileDir}`,
    url,
  ])

  try {
    const devtoolsPort = await waitForDevtoolsPort(profileDir)
    const targetWsUrl = await waitForTargetWebSocketUrl(devtoolsPort, url)
    const cdp = await createCdpSession(targetWsUrl)

    try {
      return await waitForReadyReport(cdp, requestId)
    } finally {
      cdp.close()
    }
  } finally {
    chrome.kill()
    await chrome.exited
    rmSync(profileDir, {recursive: true, force: true})
  }
}

async function probeLoopbackOrigin(port: number) {
  const origins = [
    `http://127.0.0.1:${port}`,
    `http://localhost:${port}`,
    `http://[::1]:${port}`,
  ]

  for (const candidate of origins) {
    try {
      const response = await fetch(`${candidate}/health`)
      if (response.ok) return candidate
    } catch {}
  }

  throw new Error(`Could not reach the local Bun server on port ${port}`)
}

function getChromePath() {
  const candidates = [
    process.env.CHROME_BIN,
    process.env.GOOGLE_CHROME_BIN,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ].filter((candidate): candidate is string => candidate != null)

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate
  }

  throw new Error('Could not find a Chrome or Chromium executable for browser verification')
}

async function waitForDevtoolsPort(profileDir: string) {
  const activePortPath = join(profileDir, 'DevToolsActivePort')
  const deadline = Date.now() + 10_000

  while (Date.now() < deadline) {
    if (existsSync(activePortPath)) {
      const [port] = readFileSync(activePortPath, 'utf8').trim().split('\n')
      if (port != null && port.length > 0) return Number(port)
    }
    await sleep(50)
  }

  throw new Error('Timed out waiting for Chrome to publish its DevTools port')
}

async function waitForTargetWebSocketUrl(devtoolsPort: number, url: string) {
  const deadline = Date.now() + 10_000

  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${devtoolsPort}/json/list`)
      const targets = (await response.json()) as Array<{
        type?: string
        url?: string
        webSocketDebuggerUrl?: string
      }>
      const page = targets.find((target) => target.type === 'page' && target.url === url)
      if (page?.webSocketDebuggerUrl != null) return page.webSocketDebuggerUrl
    } catch {}

    await sleep(50)
  }

  throw new Error(`Timed out waiting for a Chrome page target for ${url}`)
}

async function createCdpSession(webSocketDebuggerUrl: string) {
  const ws = new WebSocket(webSocketDebuggerUrl)
  const pending = new Map<number, {resolve: (value: unknown) => void; reject: (error: unknown) => void}>()
  let nextId = 1

  await new Promise<void>((resolve, reject) => {
    ws.addEventListener('open', () => resolve(), {once: true})
    ws.addEventListener('error', (event) => reject(event), {once: true})
  })

  ws.addEventListener('message', (event) => {
    const payload = JSON.parse(String(event.data)) as {
      id?: number
      result?: unknown
      error?: {message?: string}
    }
    if (payload.id == null) return

    const request = pending.get(payload.id)
    if (request == null) return
    pending.delete(payload.id)

    if (payload.error != null) request.reject(new Error(payload.error.message ?? 'Unknown CDP error'))
    else request.resolve(payload.result)
  })

  ws.addEventListener('close', () => {
    for (const request of pending.values()) {
      request.reject(new Error('Chrome closed the DevTools connection'))
    }
    pending.clear()
  })

  function send<T>(method: string, params: Record<string, unknown>) {
    const id = nextId++

    return new Promise<T>((resolve, reject) => {
      pending.set(id, {resolve, reject})
      ws.send(JSON.stringify({id, method, params}))
    })
  }

  await send('Runtime.enable', {})

  return {
    async evaluate(expression: string) {
      return (await send<CdpResult>('Runtime.evaluate', {
        expression,
        returnByValue: true,
      })) ?? {}
    },
    close() {
      ws.close()
    },
  }
}

async function waitForReadyReport(
  cdp: {evaluate: (expression: string) => Promise<CdpResult>; close: () => void},
  requestId: string,
) {
  const deadline = Date.now() + 10_000

  while (Date.now() < deadline) {
    const evaluation = await cdp.evaluate('location.hash')
    const hash = evaluation.result?.value
    const report = hash == null ? null : parseReport(hash)

    if (report?.requestId === requestId) {
      if (report.phase === 'ready') return report
      if (report.phase === 'error') {
        throw new Error(report.message ?? `Scenario ${report.scenario} failed`)
      }
    }

    await sleep(50)
  }

  throw new Error(`Timed out waiting for a ready report with requestId ${requestId}`)
}

function parseReport(hash: string): Report | null {
  if (!hash.startsWith('#report=')) return null
  return JSON.parse(decodeURIComponent(hash.slice('#report='.length))) as Report
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
